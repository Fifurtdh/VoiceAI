import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, Send, Square, X } from 'lucide-react';
import type {
  AppSettings,
  Customer,
  DisambiguationOption,
  DisambiguationState,
  LedgerEntry,
  PendingConfirmation,
  VoiceOrbState,
  WsServerMessage,
} from '../types/khata';
import type { DashboardTotals } from '../utils/ledgerLogic';
import {
  fetchVoiceStatusApi,
  processVoiceApi,
  type ApiError,
  type VoiceStatusResponse,
} from '../utils/api';
import { formatINRNumber } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';
import { findMatchingCustomers, parseVoiceUtterance } from '../utils/voiceParser';
import {
  AudioRecorderSession,
  isMicrophoneSupported,
  resolveVoiceWsUrl,
  speakConfirmation,
  stopSpeaking,
  StreamingAudioPlayer,
  VoiceWsClient,
} from '../utils/voiceClient';
import { ConfirmationSheet } from './ConfirmationSheet';
import { CornerLines } from './CornerLines';
import { DisambiguationSheet } from './DisambiguationSheet';
import { VoiceOrb } from './VoiceOrb';

interface TalkScreenProps {
  settings: AppSettings;
  customers: Customer[];
  entries: LedgerEntry[];
  totals: DashboardTotals;
  t: TranslationStrings;
  onConfirmEntry: (pending: PendingConfirmation) => Promise<void> | void;
  onReverseEntry?: (
    entryId: string,
    payload: { reason: string; replacementAmount?: number }
  ) => Promise<void>;
  onMarkDisclosurePlayed: () => void;
  onEnableDemoMode: () => void;
  onClose: () => void;
}

const DEMO_SAMPLE_SCRIPTS = [
  'Ramesh ka 340 rupaye udhaar likho',
  'Sita ne 200 rupaye diye',
  'Aaj kitna udhaar gaya?',
  'Mahesh ka 150 udhaar',
];

const IDLE_BARS = new Array(12).fill(0.08);

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Screen 2: Talk (Voice Session)
 * - Genuine microphone capture via getUserMedia + AudioContext AnalyserNode + 16kHz PCM16 / WAV
 * - Real-time WebSocket streaming over /ws/voice -> Gnani Prisma v3.0 STT + Gemini Intent Extraction
 * - Real-time Gnani Timbre v3.0 WebSocket TTS streaming played progressively on chunk #1
 * - Server-side Prisma VAD auto-endpointing + manual Stop + instant full-duplex Barge-in
 * - Transparently reports missing/invalid GNANI_API_KEY (never fabricates live STT)
 */
export const TalkScreen: React.FC<TalkScreenProps> = ({
  settings,
  customers,
  entries,
  totals,
  t,
  onConfirmEntry,
  onReverseEntry,
  onMarkDisclosurePlayed,
  onEnableDemoMode,
  onClose,
}) => {
  const [orbState, setOrbState] = useState<VoiceOrbState>('idle');
  const [micVolume, setMicVolume] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => [...IDLE_BARS]);
  const [recordingMs, setRecordingMs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [vadSpeechActive, setVadSpeechActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusResponse | null>(null);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [agentReply, setAgentReply] = useState<string>('');
  const [micError, setMicError] = useState<string | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [typedInput, setTypedInput] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [pendingReversal, setPendingReversal] = useState<{
    entry: LedgerEntry;
    reason: string;
    replacementAmount?: number;
  } | null>(null);
  const [disambiguation, setDisambiguation] = useState<DisambiguationState | null>(null);
  const [demoStepIdx, setDemoStepIdx] = useState(0);

  const isListeningRef = useRef(false);
  const isStartingRef = useRef(false);
  const wsStreamingActiveRef = useRef(false);
  const wsSttReadyRef = useRef(false);
  const wsTtsReadyRef = useRef(false);
  const disclosureFiredRef = useRef(false);
  const pendingConfirmRef = useRef<PendingConfirmation | null>(null);
  const pointerDownTimeRef = useRef<number>(0);
  const wsClientRef = useRef<VoiceWsClient | null>(null);
  const streamingPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const pendingTtsMetaRef = useRef<{
    requestId: string;
    text: string;
    language: AppSettings['language'];
  } | null>(null);
  const recorderRef = useRef<AudioRecorderSession>(new AudioRecorderSession());
  const streamTimerRef = useRef<number | null>(null);
  const recClockTimerRef = useRef<number | null>(null);
  const stopListeningRef = useRef<() => Promise<void>>(async () => {});
  const initialLangRef = useRef(settings.language);
  const latestLanguageRef = useRef(settings.language);

  pendingConfirmRef.current = pendingConfirm;
  latestLanguageRef.current = settings.language;

  const targetWsUrl = resolveVoiceWsUrl(settings.voiceWsUrl);

  const getStreamingPlayer = useCallback(() => {
    if (!streamingPlayerRef.current) {
      streamingPlayerRef.current = new StreamingAudioPlayer();
    }
    return streamingPlayerRef.current;
  }, []);

  const cancelAllTts = useCallback(() => {
    const activeReqId = pendingTtsMetaRef.current?.requestId;
    pendingTtsMetaRef.current = null;
    streamingPlayerRef.current?.stop();
    stopSpeaking();
    wsClientRef.current?.cancelTts(activeReqId);
  }, []);

  const speakAndAnimate = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || isListeningRef.current) return;

      cancelAllTts();
      setAgentReply(clean);
      setOrbState('speaking');

      const lang = latestLanguageRef.current;
      // Primary path: Gnani Timbre v3.0 real-time WebSocket TTS streaming over /ws/voice
      if (
        !settings.demoMode &&
        wsClientRef.current?.isConnected() &&
        wsTtsReadyRef.current
      ) {
        const reqId = wsClientRef.current.requestTts(clean, lang);
        if (reqId) {
          pendingTtsMetaRef.current = { requestId: reqId, text: clean, language: lang };
          getStreamingPlayer().beginStream(reqId, {
            onStart: () => {
              if (!isListeningRef.current) setOrbState('speaking');
            },
            onEnd: () => {
              if (pendingTtsMetaRef.current?.requestId === reqId) {
                pendingTtsMetaRef.current = null;
              }
              setOrbState((curr) => (curr === 'speaking' ? 'idle' : curr));
            },
          });
          return;
        }
      }

      // Fallback path (offline / demo mode / WS disconnected): REST TTS -> browser speech
      void speakConfirmation(
        clean,
        lang,
        () => {
          if (!isListeningRef.current) setOrbState('speaking');
        },
        () => setOrbState((curr) => (curr === 'speaking' ? 'idle' : curr))
      );
    },
    [cancelAllTts, getStreamingPlayer, settings.demoMode]
  );

  const triggerInitialDisclosure = useCallback(() => {
    if (disclosureFiredRef.current || settings.aiDisclosurePlayed) return;
    disclosureFiredRef.current = true;
    speakAndAnimate(t.aiDisclosureSpeech);
    onMarkDisclosurePlayed();
  }, [
    onMarkDisclosurePlayed,
    settings.aiDisclosurePlayed,
    speakAndAnimate,
    t.aiDisclosureSpeech,
  ]);

  // Check backend Gnani/Gemini availability once when opening Talk screen
  useEffect(() => {
    let active = true;
    fetchVoiceStatusApi()
      .then((status) => {
        if (!active) return;
        wsSttReadyRef.current = Boolean(status.gnaniSttConfigured);
        wsTtsReadyRef.current = Boolean(status.gnaniTtsConfigured);
        setVoiceStatus(status);
      })
      .catch(() => {
        // Ignore if status check fails temporarily
      });
    return () => {
      active = false;
    };
  }, []);

  // First voice session AI disclosure: wait briefly for /ws/voice stt_ready so greeting streams via Timbre WS
  useEffect(() => {
    if (settings.aiDisclosurePlayed || disclosureFiredRef.current) return;
    if (settings.demoMode || !targetWsUrl) {
      triggerInitialDisclosure();
      return;
    }
    if (wsConnected && wsTtsReadyRef.current) {
      triggerInitialDisclosure();
      return;
    }
    const fallbackTimer = window.setTimeout(() => {
      triggerInitialDisclosure();
    }, 750);
    return () => window.clearTimeout(fallbackTimer);
  }, [
    settings.aiDisclosurePlayed,
    settings.demoMode,
    targetWsUrl,
    wsConnected,
    triggerInitialDisclosure,
  ]);

  const handleParsedEntry = useCallback(
    (pending: PendingConfirmation) => {
      if (pending.customerId) {
        setPendingConfirm(pending);
        return;
      }
      const matches = findMatchingCustomers(
        pending.customerName,
        customers,
        entries
      );
      if (matches.length > 1) {
        const question = `Which ${pending.customerName}? Please tap one below.`;
        setDisambiguation({
          pending,
          options: matches,
          question,
        });
        speakAndAnimate(question);
      } else if (matches.length === 1) {
        setPendingConfirm({
          ...pending,
          customerId: matches[0].customerId,
          customerName: matches[0].customerName,
        });
      } else {
        setPendingConfirm(pending);
      }
    },
    [customers, entries, speakAndAnimate]
  );

  const handleCustomerBalanceQuery = useCallback(
    (customerName: string) => {
      const matches = findMatchingCustomers(customerName, customers, entries);
      if (matches.length === 0) {
        speakAndAnimate(`No customer named ${customerName} found in your khata.`);
        return;
      }
      if (matches.length === 1) {
        const m = matches[0];
        const absBal = Math.abs(m.balance);
        const answer = t.customerBalanceAnswer(
          m.customerName,
          formatINRNumber(absBal),
          m.balance === 0,
          m.balance < 0
        );
        speakAndAnimate(answer);
        return;
      }
      const summary = matches
        .slice(0, 3)
        .map(
          (m) =>
            `${m.customerName}${m.tag ? ` (${m.tag})` : ''}: ₹${formatINRNumber(Math.abs(m.balance))}`
        )
        .join(', ');
      speakAndAnimate(summary);
    },
    [customers, entries, speakAndAnimate, t]
  );

  const applyParseOutcome = useCallback(
    (
      outcome: ReturnType<typeof parseVoiceUtterance>,
      rawText: string
    ) => {
      const currentPending = pendingConfirmRef.current;

      if (outcome.kind === 'correction' && currentPending) {
        const updated: PendingConfirmation = {
          ...currentPending,
          amount: outcome.amount ?? currentPending.amount,
          direction: outcome.direction ?? currentPending.direction,
          customerName: outcome.customerName ?? currentPending.customerName,
        };
        setPendingConfirm(updated);
        speakAndAnimate(`Updated to ₹${formatINRNumber(updated.amount)}.`);
        return;
      }

      if (outcome.kind === 'reverse_last_entry') {
        const activeEntries = [...entries]
          .filter((e) => !e.undone)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const target = activeEntries.find((e) => {
          const matchCust =
            !outcome.customerName ||
            e.customerName
              .toLowerCase()
              .includes(outcome.customerName.toLowerCase());
          const matchDir = !outcome.direction || e.direction === outcome.direction;
          return matchCust && matchDir;
        });

        if (!target) {
          speakAndAnimate('No recent matching transaction found to reverse.');
          setOrbState('idle');
          return;
        }

        setPendingReversal({
          entry: target,
          reason: outcome.reason,
          replacementAmount: outcome.replacementAmount,
        });
        speakAndAnimate(
          `Found ₹${formatINRNumber(target.amount)} ${target.direction} for ${target.customerName}. Please confirm reversal on screen.`
        );
        return;
      }

      if (outcome.kind === 'query_today_summary') {
        const reply = t.todaySummaryAnswer(
          formatINRNumber(totals.todayPayments),
          formatINRNumber(totals.todayCredit),
          formatINRNumber(totals.totalOutstanding)
        );
        speakAndAnimate(reply);
        return;
      }

      if (outcome.kind === 'query_customer_balance') {
        handleCustomerBalanceQuery(outcome.customerName);
        return;
      }

      if (outcome.kind === 'entry') {
        setAgentReply('');
        setOrbState('idle');
        handleParsedEntry({
          ...outcome.pending,
          rawTranscript: outcome.pending.rawTranscript || rawText,
        });
        return;
      }

      setAgentReply(
        'Please say customer name, amount, and udhaar or payment. Or type below.'
      );
      setOrbState('idle');
    },
    [
      entries,
      handleCustomerBalanceQuery,
      handleParsedEntry,
      speakAndAnimate,
      t,
      totals.todayPayments,
      totals.todayCredit,
      totals.totalOutstanding,
    ]
  );

  // Process typed or demo text through backend /api/voice/process (Gemini intent extraction + validation)
  const processUtteranceText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setFinalTranscript(clean);
      setPartialTranscript('');
      setMicError(null);
      setOrbState('thinking');

      try {
        const res = await processVoiceApi({
          transcript: clean,
          language: settings.language,
          hasPendingConfirmation: Boolean(pendingConfirmRef.current),
        });
        const resolvedTranscript =
          typeof res?.transcript === 'string' && res.transcript.trim()
            ? res.transcript.trim()
            : clean;
        if (res?.outcome && typeof res.outcome.kind === 'string') {
          applyParseOutcome(res.outcome, resolvedTranscript);
        } else {
          const outcome = parseVoiceUtterance(clean, {
            hasPendingConfirmation: Boolean(pendingConfirmRef.current),
          });
          applyParseOutcome(outcome, clean);
        }
      } catch {
        const outcome = parseVoiceUtterance(clean, {
          hasPendingConfirmation: Boolean(pendingConfirmRef.current),
        });
        applyParseOutcome(outcome, clean);
      }
    },
    [applyParseOutcome, settings.language]
  );

  // Word-by-word animation for explicit Demo Mode phrases
  const runSimulatedVoice = useCallback(
    (phrase: string) => {
      if (streamTimerRef.current) {
        window.clearInterval(streamTimerRef.current);
      }
      const words = phrase.trim().split(/\s+/);
      setFinalTranscript('');
      setPartialTranscript('');
      setAgentReply('');
      setMicError(null);
      setOrbState('listening');
      setMicVolume(0.55);

      let idx = 0;
      streamTimerRef.current = window.setInterval(() => {
        idx++;
        setPartialTranscript(words.slice(0, idx).join(' '));
        setMicVolume(0.35 + (idx % 3) * 0.2);
        setWaveformBars(
          Array.from({ length: 12 }, (_, b) =>
            0.25 + (((idx + b) % 4) * 0.18)
          )
        );
        if (idx >= words.length) {
          if (streamTimerRef.current) {
            window.clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
          }
          setMicVolume(0);
          setWaveformBars([...IDLE_BARS]);
          isListeningRef.current = false;
          void processUtteranceText(phrase);
        }
      }, 170);
    },
    [processUtteranceText]
  );

  const stopRecordingClock = useCallback(() => {
    if (recClockTimerRef.current) {
      window.clearInterval(recClockTimerRef.current);
      recClockTimerRef.current = null;
    }
  }, []);

  const wsHandlersRef = useRef({
    applyParseOutcome,
    handleParsedEntry,
    handleCustomerBalanceQuery,
    speakAndAnimate,
    triggerInitialDisclosure,
    stopRecordingClock,
    getStreamingPlayer,
  });
  wsHandlersRef.current = {
    applyParseOutcome,
    handleParsedEntry,
    handleCustomerBalanceQuery,
    speakAndAnimate,
    triggerInitialDisclosure,
    stopRecordingClock,
    getStreamingPlayer,
  };

  // Connect authenticated same-origin /ws/voice WebSocket (or custom voiceWsUrl) automatically.
  // Language changes are sent via `update_language` without tearing down the WebSocket!
  useEffect(() => {
    if (settings.demoMode || !targetWsUrl) {
      setWsConnected(false);
      return;
    }

    const client = new VoiceWsClient({
      onStatusChange: (connected) => setWsConnected(connected),
      onVolume: (lvl) => setMicVolume(lvl),
      onError: (err) => {
        setMicError(err);
        setOrbState('idle');
      },
      onMessage: (msg: WsServerMessage) => {
        const handlers = wsHandlersRef.current;

        if (msg.type === 'stt_ready') {
          const sttOk = msg.provider === 'gnani-prisma-v3';
          const ttsOk = msg.ttsProvider === 'gnani-timbre-v3';
          wsSttReadyRef.current = sttOk;
          wsTtsReadyRef.current = ttsOk;
          setVoiceStatus((prev) => ({
            gnaniSttConfigured: sttOk,
            gnaniTtsConfigured: ttsOk,
            geminiConfigured: prev?.geminiConfigured ?? false,
            sttProvider: msg.provider,
            ttsProvider:
              msg.ttsProvider ?? (ttsOk ? 'gnani-timbre-v3' : 'browser-fallback'),
            intentProvider: prev?.intentProvider ?? 'local-parser',
            missingCredentials: prev?.missingCredentials ?? [],
            gnaniAuthState:
              msg.gnaniAuthState ?? (sttOk ? 'connected' : 'unconfigured'),
            gnaniError: msg.gnaniError,
          }));
          handlers.triggerInitialDisclosure();
          return;
        }

        if (msg.type === 'vad_state') {
          setVadSpeechActive(msg.state === 'speech_start');
          return;
        }

        if (msg.type === 'agent_audio_start') {
          // Stream already initialized in speakAndAnimate; ignore stale requestIds
          return;
        }

        if (msg.type === 'agent_audio_chunk') {
          if (pendingTtsMetaRef.current?.requestId === msg.requestId) {
            handlers
              .getStreamingPlayer()
              .enqueueChunk(msg.requestId, msg.audioBase64, msg.sampleRate);
          }
          return;
        }

        if (msg.type === 'agent_audio_end') {
          if (pendingTtsMetaRef.current?.requestId === msg.requestId) {
            handlers.getStreamingPlayer().endStream(msg.requestId);
          }
          return;
        }

        if (msg.type === 'agent_audio_error') {
          const meta = pendingTtsMetaRef.current;
          if (meta && meta.requestId === msg.requestId) {
            pendingTtsMetaRef.current = null;
            streamingPlayerRef.current?.stop();
            // Graceful fallback to REST Timbre / browser speech when WS TTS encounters an upstream error
            void speakConfirmation(
              meta.text,
              meta.language,
              () => {
                if (!isListeningRef.current) setOrbState('speaking');
              },
              () => setOrbState((curr) => (curr === 'speaking' ? 'idle' : curr))
            );
          }
          return;
        }

        if (msg.type === 'transcript_partial') {
          const partial = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (typeof msg.stableText === 'string' && msg.stableText.trim()) {
            setFinalTranscript(msg.stableText.trim());
          }
          if (partial) {
            setPartialTranscript(partial);
          }
          return;
        }

        if (msg.type === 'transcript_final') {
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          setVadSpeechActive(false);
          if (text) {
            setFinalTranscript(text);
            setPartialTranscript('');
          }
          // If Prisma server-side VAD auto-endpointed the turn, stop mic immediately without duplicate audio_end
          if (
            msg.autoEndpointed &&
            (isListeningRef.current || recorderRef.current.isActive())
          ) {
            isListeningRef.current = false;
            wsStreamingActiveRef.current = false;
            setIsRecording(false);
            handlers.stopRecordingClock();
            setMicVolume(0);
            setWaveformBars([...IDLE_BARS]);
            recorderRef.current.cancel();
          }
          setOrbState('thinking');
          return;
        }

        if (msg.type === 'entry_parsed') {
          setOrbState('idle');
          setAgentReply('');
          handlers.handleParsedEntry({
            customerName: msg.customer,
            amount: msg.amount,
            direction: msg.direction,
            date: msg.date || new Date().toISOString().slice(0, 10),
            note: msg.note,
            rawTranscript: msg.rawTranscript,
          });
        } else if (msg.type === 'correction_parsed') {
          handlers.applyParseOutcome(
            {
              kind: 'correction',
              amount: msg.amount,
              direction: msg.direction,
              customerName: msg.customerName,
            },
            ''
          );
        } else if (msg.type === 'query_today_summary') {
          handlers.applyParseOutcome({ kind: 'query_today_summary' }, '');
        } else if (msg.type === 'query_customer_balance') {
          handlers.handleCustomerBalanceQuery(msg.customerName);
        } else if (msg.type === 'need_clarification') {
          const question = msg.question || 'Which customer?';
          const pending: PendingConfirmation = {
            customerName: msg.pending?.customerName || 'Customer',
            amount: msg.pending?.amount || 0,
            direction: msg.pending?.direction || 'credit',
            date: msg.pending?.date || new Date().toISOString().slice(0, 10),
          };
          setDisambiguation({
            pending,
            question,
            options: msg.options.map((opt, idx) => ({
              customerId: opt.customerId || `ws-opt-${idx}`,
              customerName: opt.customerName,
              phoneSuffix: opt.phoneSuffix || '0000',
              lastTxSummary: opt.lastTxSummary || 'Existing customer',
              balance: opt.balance ?? 0,
            })),
          });
          handlers.speakAndAnimate(question);
        } else if (msg.type === 'answer_text') {
          handlers.speakAndAnimate(msg.text);
        } else if (msg.type === 'voice_error') {
          setVadSpeechActive(false);
          setOrbState('idle');
          setMicError(msg.error);
          if (
            msg.code === 'GNANI_NOT_CONFIGURED' ||
            msg.code === 'GNANI_AUTH_FAILED'
          ) {
            setShowKeyboard(true);
          }
        }
      },
    });

    wsClientRef.current = client;
    client.connect(targetWsUrl, initialLangRef.current);

    return () => {
      client.disconnect();
      wsClientRef.current = null;
    };
  }, [settings.demoMode, targetWsUrl]);

  // Propagate language changes mid-session over existing /ws/voice without reconnecting
  useEffect(() => {
    wsClientRef.current?.updateLanguage(settings.language);
  }, [settings.language]);

  // Cleanup timers, active audio streams, and speech on unmount
  useEffect(() => {
    const recorder = recorderRef.current;
    return () => {
      if (streamTimerRef.current) {
        window.clearInterval(streamTimerRef.current);
      }
      if (recClockTimerRef.current) {
        window.clearInterval(recClockTimerRef.current);
      }
      recorder.cancel();
      streamingPlayerRef.current?.dispose();
      streamingPlayerRef.current = null;
      stopSpeaking();
    };
  }, []);

  const stopListening = useCallback(async () => {
    if (!isListeningRef.current && !recorderRef.current.isActive()) {
      return;
    }
    isListeningRef.current = false;
    setIsRecording(false);
    setVadSpeechActive(false);
    stopRecordingClock();
    setMicVolume(0);
    setWaveformBars([...IDLE_BARS]);

    const usedWsStream = wsStreamingActiveRef.current;
    wsStreamingActiveRef.current = false;

    setOrbState('thinking');
    const recorded = await recorderRef.current.stop();

    if (usedWsStream && wsClientRef.current?.isConnected()) {
      wsClientRef.current.endAudioStream(Boolean(pendingConfirmRef.current));
      return;
    }

    if (!recorded || recorded.sizeBytes === 0) {
      setOrbState('idle');
      setMicError('No audio was captured. Tap mic to try again or type below.');
      return;
    }

    try {
      const res = await processVoiceApi({
        audioBase64: recorded.audioBase64,
        mimeType: recorded.mimeType,
        language: settings.language,
        hasPendingConfirmation: Boolean(pendingConfirmRef.current),
      });
      const transcriptText =
        typeof res?.transcript === 'string' ? res.transcript.trim() : '';
      if (!transcriptText || !res?.outcome || typeof res.outcome.kind !== 'string') {
        setOrbState('idle');
        setMicError(
          'Could not recognize speech from the recording. Please try speaking again or type below.'
        );
        setShowKeyboard(true);
        return;
      }
      setFinalTranscript(transcriptText);
      setPartialTranscript('');
      applyParseOutcome(res.outcome, transcriptText);
    } catch (err) {
      const apiErr = err as ApiError;
      setOrbState('idle');
      if (apiErr.code === 'GNANI_NOT_CONFIGURED') {
        const kb = Math.max(0.1, recorded.sizeBytes / 1024).toFixed(1);
        setMicError(
          `Captured ${kb} KB WAV audio, but Gnani Prisma v3.0 STT requires GNANI_API_KEY on the server. Type your command below or enable Demo Mode in Settings.`
        );
        setShowKeyboard(true);
      } else {
        setMicError(apiErr.message || 'Could not process recorded audio.');
        setShowKeyboard(true);
      }
    }
  }, [applyParseOutcome, settings.language, stopRecordingClock]);

  stopListeningRef.current = stopListening;

  const startListening = async () => {
    if (
      isListeningRef.current ||
      isStartingRef.current ||
      recorderRef.current.isActive()
    ) {
      return;
    }

    // Full-duplex Barge-in: immediately stop local playback & cancel server Timbre WS stream
    cancelAllTts();
    setMicError(null);
    setAgentReply('');
    setVadSpeechActive(false);

    // Explicit Demo Mode (only when shopkeeper intentionally turned on Demo Mode)
    if (settings.demoMode) {
      isListeningRef.current = true;
      const script = DEMO_SAMPLE_SCRIPTS[demoStepIdx % DEMO_SAMPLE_SCRIPTS.length];
      setDemoStepIdx((prev) => prev + 1);
      runSimulatedVoice(script);
      return;
    }

    if (!isMicrophoneSupported()) {
      setShowKeyboard(true);
      setMicError(
        'Microphone recording is not supported in this browser. Type your entry below.'
      );
      return;
    }

    // Start live WebSocket stream whenever /ws/voice is connected and Gnani STT is verified ready
    const canStreamWs = Boolean(
      wsClientRef.current?.isConnected() &&
        (wsSttReadyRef.current || voiceStatus?.gnaniSttConfigured)
    );
    wsStreamingActiveRef.current = canStreamWs;
    if (canStreamWs && wsClientRef.current) {
      wsClientRef.current.startAudioStream({
        language: settings.language,
        hasPendingConfirmation: Boolean(pendingConfirmRef.current),
      });
    }

    isStartingRef.current = true;
    const started = await recorderRef.current.start({
      onWaveform: (bars, vol) => {
        setWaveformBars(bars);
        setMicVolume(vol);
      },
      onPcmChunk: (pcmBuf) => {
        if (wsStreamingActiveRef.current && wsClientRef.current?.isConnected()) {
          wsClientRef.current.sendPcmChunk(pcmBuf);
        }
      },
      onSilenceEndpoint: () => {
        if (isListeningRef.current) {
          void stopListeningRef.current();
        }
      },
      onError: (msg) => {
        if (wsStreamingActiveRef.current && wsClientRef.current?.isConnected()) {
          wsClientRef.current.cancelAudioStream();
        }
        wsStreamingActiveRef.current = false;
        setVadSpeechActive(false);
        setMicError(msg);
        setOrbState('idle');
        setIsRecording(false);
        setShowKeyboard(true);
      },
    });
    isStartingRef.current = false;

    if (!started) {
      if (wsStreamingActiveRef.current && wsClientRef.current?.isConnected()) {
        wsClientRef.current.cancelAudioStream();
      }
      wsStreamingActiveRef.current = false;
      isListeningRef.current = false;
      return;
    }

    isListeningRef.current = true;
    setIsRecording(true);
    setRecordingMs(0);
    setOrbState('listening');
    setFinalTranscript('');
    setPartialTranscript('');

    const recStart = Date.now();
    stopRecordingClock();
    recClockTimerRef.current = window.setInterval(() => {
      setRecordingMs(Date.now() - recStart);
    }, 250);
  };

  // Tap-to-toggle AND push-to-talk (hold >= 320ms)
  const handleMicPointerDown = () => {
    pointerDownTimeRef.current = Date.now();
    if (!isListeningRef.current && !isStartingRef.current) {
      void startListening();
    } else if (isListeningRef.current) {
      void stopListening();
    }
  };

  const handleMicPointerUp = () => {
    const heldMs = Date.now() - pointerDownTimeRef.current;
    if (heldMs >= 320 && isListeningRef.current && !settings.demoMode) {
      void stopListening();
    }
  };

  const handleSubmitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typedInput.trim();
    if (!text) return;
    cancelAllTts();
    setTypedInput('');
    setMicError(null);
    if (wsClientRef.current?.isConnected()) {
      setFinalTranscript(text);
      setPartialTranscript('');
      setOrbState('thinking');
      wsClientRef.current.sendTextTurn(text, Boolean(pendingConfirmRef.current));
    } else {
      void processUtteranceText(text);
    }
  };

  const handleSelectDisambiguation = (option: DisambiguationOption) => {
    if (!disambiguation) return;
    const resolved: PendingConfirmation = {
      ...disambiguation.pending,
      customerId: option.customerId,
      customerName: option.customerName,
    };
    setDisambiguation(null);
    setPendingConfirm(resolved);
  };

  const statusLabel = settings.demoMode
    ? t.demoActive
    : voiceStatus?.gnaniSttConfigured
    ? wsConnected
      ? 'Gnani Live Voice'
      : 'Gnani Voice Ready'
    : voiceStatus?.gnaniAuthState === 'auth_failed'
    ? 'Gnani Auth Failed · Check GNANI_API_KEY'
    : voiceStatus?.gnaniAuthState === 'unreachable'
    ? 'Gnani STT Unreachable'
    : 'Mic Ready · GNANI_API_KEY needed for STT';

  const statusDotColor =
    settings.demoMode || (voiceStatus?.gnaniSttConfigured && wsConnected)
      ? '#22C55E'
      : voiceStatus?.gnaniAuthState === 'auth_failed'
      ? '#FF6B5E'
      : '#F59E0B';

  const hasTranscript = Boolean(finalTranscript || partialTranscript);

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] flex flex-col justify-between overflow-hidden">
      <CornerLines className="absolute top-0 right-0 w-64 h-48 text-[var(--khata-text)]" />

      {/* Top Centered Pill Badge & Status */}
      <header className="relative z-10 pt-6 px-4 flex flex-col items-center gap-2">
        <div
          className="px-5 py-1.5 rounded-full text-sm font-bold"
          style={{
            backgroundColor: 'var(--khata-lime-card)',
            color: '#0B0B0B',
          }}
        >
          {t.khataAssistant}
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--khata-text-secondary)]">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusDotColor }}
            aria-hidden="true"
          />
          <span data-testid="voice-status-label">{statusLabel}</span>
        </div>
      </header>

      {/* Center Stage: Iridescent CSS Orb + Real Audio Waveform + Live Transcript */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-4 max-w-2xl mx-auto w-full">
        <VoiceOrb state={orbState} volume={micVolume} />

        {/* Live Listening Indicator & Real Mic AnalyserNode Waveform */}
        {orbState === 'listening' && (
          <div
            data-testid="recording-indicator"
            className="mt-4 flex flex-col items-center gap-2"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FF6B5E]/15 border border-[#FF6B5E]/30 text-xs font-bold text-[#FF6B5E]">
              <span className="w-2 h-2 rounded-full bg-[#FF6B5E] animate-pulse" />
              <span>
                {settings.demoMode
                  ? 'Demo Listening...'
                  : vadSpeechActive
                  ? `Speech detected · ${formatTimer(recordingMs)}`
                  : `Listening... ${formatTimer(recordingMs)}`}
              </span>
            </div>

            <div
              aria-hidden="true"
              data-testid="audio-waveform"
              className="flex items-center justify-center gap-1.5 h-8"
            >
              {waveformBars.map((level, idx) => (
                <span
                  key={idx}
                  className="w-1.5 rounded-full bg-[var(--khata-accent)] transition-all duration-75"
                  style={{
                    height: `${Math.round(4 + level * 28)}px`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Live Transcript (true final vs partial distinction) + Agent Reply + Mic Error */}
        <div
          data-testid="live-transcript"
          aria-live="polite"
          className="mt-5 text-center min-h-[92px] flex flex-col items-center justify-center max-w-lg"
        >
          {hasTranscript ? (
            <p className="text-2xl sm:text-[26px] font-medium leading-snug tracking-tight">
              {finalTranscript && (
                <span className="text-[var(--khata-text)]">{finalTranscript}</span>
              )}
              {partialTranscript && (
                <span className="text-[var(--khata-text-secondary)]">
                  {finalTranscript ? ' ' : ''}
                  {partialTranscript}
                </span>
              )}
            </p>
          ) : (
            <p className="text-lg text-[var(--khata-text-secondary)]">
              {orbState === 'listening'
                ? t.listeningHint
                : orbState === 'thinking'
                ? t.thinkingHint
                : orbState === 'speaking'
                ? t.speakingHint
                : t.tapOrHoldMic}
            </p>
          )}

          {agentReply && (
            <p
              data-testid="agent-reply"
              className="mt-3 text-base sm:text-lg font-medium text-[var(--khata-accent)]"
            >
              {agentReply}
            </p>
          )}

          {micError && (
            <p
              role="alert"
              data-testid="mic-error-banner"
              className="mt-3 text-sm font-medium text-[#FF6B5E] bg-[#FF6B5E]/10 border border-[#FF6B5E]/25 rounded-2xl px-4 py-2.5"
            >
              {micError}
            </p>
          )}
        </div>

        {/* Demo Mode Sample Voice Chips */}
        {settings.demoMode && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {DEMO_SAMPLE_SCRIPTS.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => runSimulatedVoice(phrase)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs font-medium text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)]"
              >
                &ldquo;{phrase}&rdquo;
              </button>
            ))}
            {pendingConfirm && (
              <button
                type="button"
                onClick={() => runSimulatedVoice('nahi, 430')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-xs font-bold"
              >
                Say &ldquo;nahi, 430&rdquo;
              </button>
            )}
          </div>
        )}

        {/* Fallback Keyboard Input Bar */}
        {showKeyboard && (
          <form
            onSubmit={handleSubmitTyped}
            className="mt-4 w-full max-w-md flex items-center gap-2"
          >
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={t.typeEntryPlaceholder}
              aria-label={t.typeEntryPlaceholder}
              data-testid="voice-keyboard-input"
              className="flex-1 min-h-[48px] px-4 rounded-full bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
            <button
              type="submit"
              aria-label={t.send}
              data-testid="voice-keyboard-send"
              className="min-h-[48px] min-w-[48px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}

        {!settings.demoMode && showKeyboard && (
          <button
            type="button"
            onClick={onEnableDemoMode}
            data-testid="enable-demo-mode-btn"
            className="mt-2 text-xs underline text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)]"
          >
            Enable Demo Voice Mode
          </button>
        )}
      </main>

      {/* Bottom Controls: Left Keyboard, Center 104px Lime Mic / Stop with Concentric Rings, Right X */}
      <footer className="relative z-10 pb-8 pt-2 px-6 flex items-center justify-center gap-7 sm:gap-10">
        <button
          type="button"
          onClick={() => setShowKeyboard((prev) => !prev)}
          aria-label="Type entry"
          aria-pressed={showKeyboard}
          data-testid="toggle-keyboard-btn"
          className="w-13 h-13 min-h-[52px] min-w-[52px] rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center text-[#B8A4F5] hover:opacity-90 active:scale-95 transition-transform"
        >
          <Keyboard className="w-5 h-5" />
        </button>

        {/* Concentric rings + 104px Lime Mic / Stop Button */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute w-36 h-36 rounded-full border border-[var(--khata-border)] pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute w-44 h-44 rounded-full border border-[var(--khata-border)] opacity-50 pointer-events-none"
          />
          <button
            type="button"
            data-testid="mic-button"
            aria-label={isRecording ? 'Stop listening' : 'Speak to Khata'}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            className="relative w-[104px] h-[104px] rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
            style={{
              backgroundColor: isRecording ? '#FF6B5E' : 'var(--khata-accent)',
              color: isRecording ? '#0B0B0B' : 'var(--khata-accent-fg)',
            }}
          >
            {isRecording ? (
              <Square className="w-8 h-8 fill-current" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            recorderRef.current.cancel();
            cancelAllTts();
            onClose();
          }}
          aria-label="Close voice session"
          data-testid="close-talk-btn"
          className="w-13 h-13 min-h-[52px] min-w-[52px] rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)] active:scale-95 transition-transform"
        >
          <X className="w-5 h-5" />
        </button>
      </footer>

      {/* Disambiguation Sheet (two customers sharing a name) */}
      {disambiguation && (
        <DisambiguationSheet
          state={disambiguation}
          t={t}
          onSelect={handleSelectDisambiguation}
          onCreateNew={() => {
            const p = disambiguation.pending;
            setDisambiguation(null);
            setPendingConfirm(p);
          }}
          onCancel={() => setDisambiguation(null)}
        />
      )}

      {/* Confirmation Bottom Sheet (Transaction Preview -> User Confirm -> Save -> Spoken Confirmation) */}
      {pendingConfirm && (
        <ConfirmationSheet
          pending={pendingConfirm}
          demoMode={settings.demoMode}
          t={t}
          onVoiceCorrection={(utterance) => void processUtteranceText(utterance)}
          onMicCorrection={() => void startListening()}
          onConfirm={async (finalEntry) => {
            await onConfirmEntry(finalEntry);
            setPendingConfirm(null);
            const savedReply = t.entrySavedSpeech(
              finalEntry.customerName,
              formatINRNumber(finalEntry.amount),
              finalEntry.direction
            );
            speakAndAnimate(savedReply);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Auditable Voice Reversal Confirmation Sheet */}
      {pendingReversal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm transaction reversal"
          data-testid="voice-reversal-sheet"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 space-y-4 shadow-2xl animate-sheet-up">
            <h2 className="text-lg font-bold">Confirm Auditable Reversal</h2>
            <p className="text-sm text-[var(--khata-text-secondary)]">
              Reverse{' '}
              <strong className="text-[var(--khata-text)]">
                {pendingReversal.entry.customerName}&apos;s ₹
                {formatINRNumber(pendingReversal.entry.amount)}{' '}
                {pendingReversal.entry.direction}
              </strong>{' '}
              from {pendingReversal.entry.date}?
              {pendingReversal.replacementAmount
                ? ` A replacement entry of ₹${formatINRNumber(pendingReversal.replacementAmount)} will be recorded.`
                : ' The original record remains visible in your Audit Log.'}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPendingReversal(null)}
                className="flex-1 min-h-[46px] rounded-full bg-[var(--khata-surface-elevated)] font-semibold text-sm"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const req = pendingReversal;
                  setPendingReversal(null);
                  if (onReverseEntry) {
                    await onReverseEntry(req.entry.id, {
                      reason: req.reason,
                      replacementAmount: req.replacementAmount,
                    });
                    speakAndAnimate(
                      `Reversed ₹${formatINRNumber(req.entry.amount)} for ${req.entry.customerName}.`
                    );
                  }
                }}
                className="flex-1 min-h-[46px] rounded-full bg-[#FF6B5E] text-[#0B0B0B] font-bold text-sm"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
