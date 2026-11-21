import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MessageSquarePlus,
  Mic,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { AppSettings } from '../types/khata';
import {
  createChatSessionApi,
  deleteChatSessionApi,
  fetchChatMessagesApi,
  fetchChatSessionsApi,
  processVoiceApi,
  sendChatMessageApi,
  type ChatMessageItem,
  type ChatSessionItem,
} from '../utils/api';
import {
  AudioRecorderSession,
  isMicrophoneSupported,
  speakConfirmation,
  stopSpeaking,
} from '../utils/voiceClient';

interface AiAssistantScreenProps {
  settings: AppSettings;
}

const SUGGESTED_QUESTIONS = [
  'How much udhaar did I give today?',
  'How much payment did I collect today?',
  'What is my total outstanding balance?',
  'Who are my top 5 customers with pending payments?',
  'Which customers have not paid in the last 30 days?',
  'What is my total collection this month?',
  "Compare this week's credit with last week",
  'Show my highest credit transactions',
];

/**
 * Feature 1: Khata AI Assistant
 * Dedicated read-only business intelligence chatbot backed 100% by verified SQLite store queries.
 * Supports text + existing Gnani microphone voice input, persisted sessions, contextual follow-ups,
 * structured data cards/tables, and audio playback via Gnani Timbre TTS.
 */
export const AiAssistantScreen: React.FC<AiAssistantScreenProps> = ({
  settings,
}) => {
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorderSession>(new AudioRecorderSession());
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetchChatSessionsApi();
      setSessions(res.sessions);
      if (res.sessions.length > 0 && !activeSessionId) {
        const firstId = res.sessions[0].id;
        setActiveSessionId(firstId);
        const msgRes = await fetchChatMessagesApi(firstId);
        setMessages(msgRes.messages);
      }
    } catch {
      setError('Could not load chat history.');
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void loadSessions();
    const rec = recorderRef.current;
    return () => {
      rec.cancel();
      stopSpeaking();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setError(null);
    setLastFailedPrompt(null);
    try {
      const res = await fetchChatMessagesApi(sessionId);
      setMessages(res.messages);
    } catch {
      setError('Could not load conversation messages.');
    }
  };

  const handleNewChat = async () => {
    setError(null);
    setLastFailedPrompt(null);
    try {
      const res = await createChatSessionApi('New Khata Chat');
      setSessions((prev) => [res.session, ...prev]);
      setActiveSessionId(res.session.id);
      setMessages([]);
    } catch {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatSessionApi(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      setError('Could not delete conversation.');
    }
  };

  const handleSendMessage = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim();
      if (!clean || sending) return;

      setInputText('');
      setError(null);
      setLastFailedPrompt(null);
      setSending(true);

      const optimisticUserMsg: ChatMessageItem = {
        id: `temp-${Date.now()}`,
        sessionId: activeSessionId || 'pending',
        role: 'user',
        content: clean,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      try {
        const res = await sendChatMessageApi({
          sessionId: activeSessionId ?? undefined,
          message: clean,
          language: settings.language,
        });
        setActiveSessionId(res.session.id);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUserMsg.id),
          res.userMessage,
          res.assistantMessage,
        ]);
        setSessions((prev) => {
          const without = prev.filter((s) => s.id !== res.session.id);
          return [res.session, ...without];
        });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
        setError(
          err instanceof Error
            ? err.message
            : 'Could not reach Khata AI Assistant. Please retry.'
        );
        setLastFailedPrompt(clean);
      } finally {
        setSending(false);
      }
    },
    [activeSessionId, sending, settings.language]
  );

  const handleVoiceToggle = async () => {
    if (isRecording) {
      setIsRecording(false);
      setVoiceBusy(true);
      try {
        const recorded = await recorderRef.current.stop();
        if (!recorded || recorded.sizeBytes === 0) {
          setError('No voice audio captured. Tap the mic and speak clearly.');
          return;
        }
        const sttRes = await processVoiceApi({
          audioBase64: recorded.audioBase64,
          mimeType: recorded.mimeType,
          language: settings.language,
        });
        if (sttRes.transcript?.trim()) {
          await handleSendMessage(sttRes.transcript.trim());
        } else {
          setError('Could not transcribe speech. Please try typing your question.');
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Voice transcription failed. Please type your question.'
        );
      } finally {
        setVoiceBusy(false);
      }
      return;
    }

    if (!isMicrophoneSupported()) {
      setError('Microphone is not supported in this browser. Type your question below.');
      return;
    }

    setError(null);
    const started = await recorderRef.current.start({
      onWaveform: () => {},
      onError: (msg) => {
        setIsRecording(false);
        setError(msg);
      },
    });
    if (started) {
      setIsRecording(true);
    }
  };

  const handleReadAloud = (msg: ChatMessageItem) => {
    if (speakingMsgId === msg.id) {
      stopSpeaking();
      setSpeakingMsgId(null);
      return;
    }
    setSpeakingMsgId(msg.id);
    void speakConfirmation(
      msg.content,
      settings.language,
      () => setSpeakingMsgId(msg.id),
      () => setSpeakingMsgId((curr) => (curr === msg.id ? null : curr))
    );
  };

  return (
    <div className="min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] flex flex-col">
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-6 flex-1 flex flex-col">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Khata AI Assistant
            </h1>
            <p className="text-sm text-[var(--khata-text-secondary)]">
              Verified business answers directly from {settings.shopName}&apos;s khata
            </p>
          </div>

          <button
            type="button"
            data-testid="chat-new-btn"
            onClick={() => void handleNewChat()}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-sm font-bold inline-flex items-center gap-2 hover:opacity-95"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </header>

        {/* Main Split: Session List + Active Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Conversation History Rail */}
          <aside className="lg:col-span-3 rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-3.5 flex flex-col max-h-[220px] lg:max-h-[calc(100vh-170px)]">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--khata-text-secondary)] px-2 mb-2">
              Conversations
            </p>
            {loadingSessions ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--khata-accent)]" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-[var(--khata-text-secondary)] px-2 py-3">
                Ask your first business question to start a conversation.
              </p>
            ) : (
              <div className="space-y-1 overflow-y-auto flex-1" data-testid="chat-session-list">
                {sessions.map((s) => {
                  const active = s.id === activeSessionId;
                  return (
                    <div
                      key={s.id}
                      className={`group flex items-center justify-between gap-1 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                        active
                          ? 'bg-[var(--khata-surface-elevated)] font-bold text-[var(--khata-text)]'
                          : 'text-[var(--khata-text-secondary)] hover:bg-[var(--khata-surface-elevated)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleSelectSession(s.id)}
                        className="flex-1 text-left truncate py-0.5"
                      >
                        {s.title}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete conversation ${s.title}`}
                        onClick={() => void handleDeleteSession(s.id)}
                        className="p-1 rounded-lg opacity-60 hover:opacity-100 text-[#FF6B5E]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Chat Canvas */}
          <section className="lg:col-span-9 rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] flex flex-col min-h-[520px] lg:max-h-[calc(100vh-170px)]">
            {/* Messages Feed */}
            <div
              data-testid="chat-messages-list"
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
            >
              {messages.length === 0 ? (
                <div className="py-6 space-y-5">
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-bold">
                      Ask anything about your shop&apos;s khata
                    </h2>
                    <p className="text-sm text-[var(--khata-text-secondary)] max-w-xl">
                      Every number is calculated directly from your real SQLite ledger. Ask in English, Hindi, Hinglish, or Kannada — and ask follow-up questions naturally.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        data-testid="suggested-question-btn"
                        onClick={() => void handleSendMessage(q)}
                        className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-left text-sm font-medium hover:border-[var(--khata-accent)] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const meta = msg.metadata;

                  return (
                    <div
                      key={msg.id}
                      data-testid={isUser ? 'chat-msg-user' : 'chat-msg-assistant'}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 space-y-3 ${
                          isUser
                            ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                            : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-[var(--khata-text)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          {!isUser && (
                            <button
                              type="button"
                              onClick={() => handleReadAloud(msg)}
                              aria-label="Listen to answer"
                              className={`p-1.5 rounded-lg shrink-0 hover:bg-[var(--khata-surface)] ${
                                speakingMsgId === msg.id
                                  ? 'text-[var(--khata-accent)]'
                                  : 'text-[var(--khata-text-secondary)]'
                              }`}
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {!isUser && meta?.dateRange && (
                          <p className="text-[11px] font-semibold text-[var(--khata-text-secondary)]">
                            Period: {meta.dateRange.label}
                          </p>
                        )}

                        {/* Structured Verified Metric Cards */}
                        {!isUser && meta?.cards && meta.cards.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {meta.cards.map((card, idx) => (
                              <div
                                key={`${card.label}-${idx}`}
                                className="rounded-xl bg-[var(--khata-surface)] border border-[var(--khata-border)] px-3 py-2"
                              >
                                <p className="text-[11px] text-[var(--khata-text-secondary)] truncate">
                                  {card.label}
                                </p>
                                <p
                                  className="text-sm sm:text-base font-extrabold tabular-nums mt-0.5"
                                  style={{
                                    color:
                                      card.tone === 'credit'
                                        ? 'var(--khata-credit)'
                                        : card.tone === 'payment'
                                        ? 'var(--khata-payment)'
                                        : 'var(--khata-text)',
                                  }}
                                >
                                  {card.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Structured Data Table */}
                        {!isUser && meta?.table && meta.table.rows.length > 0 && (
                          <div className="overflow-x-auto rounded-xl border border-[var(--khata-border)] bg-[var(--khata-surface)]">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="border-b border-[var(--khata-border)] text-[var(--khata-text-secondary)]">
                                  {meta.table.headers.map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {meta.table.rows.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className="border-b last:border-b-0 border-[var(--khata-border)]"
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className={`px-3 py-2 ${
                                          cIdx > 0 ? 'tabular-nums font-semibold' : 'font-medium'
                                        }`}
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Contextual Follow-up Prompts */}
                        {!isUser && meta?.followUps && meta.followUps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {meta.followUps.map((fq) => (
                              <button
                                key={fq}
                                type="button"
                                onClick={() => void handleSendMessage(fq)}
                                className="px-2.5 py-1.5 rounded-lg bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs font-medium text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)] hover:border-[var(--khata-accent)]"
                              >
                                {fq}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div
                  data-testid="chat-loading"
                  className="flex justify-start"
                >
                  <div className="rounded-2xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] px-4 py-3 flex items-center gap-2 text-sm text-[var(--khata-text-secondary)]">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--khata-accent)]" />
                    <span>Calculating from your khata...</span>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#FF6B5E]/15 border border-[#FF6B5E]/30 px-4 py-3 flex items-center justify-between gap-3 text-sm text-[#FF6B5E]"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                  {lastFailedPrompt && (
                    <button
                      type="button"
                      onClick={() => void handleSendMessage(lastFailedPrompt)}
                      className="px-3 py-1.5 rounded-lg bg-[#FF6B5E] text-[#0B0B0B] text-xs font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              )}

              <div ref={scrollEndRef} />
            </div>

            {/* Composer Bar: Voice + Text Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage(inputText);
              }}
              className="p-3 sm:p-4 border-t border-[var(--khata-border)] flex items-center gap-2"
            >
              <button
                type="button"
                data-testid="chat-mic-btn"
                disabled={voiceBusy || sending}
                onClick={() => void handleVoiceToggle()}
                aria-label={isRecording ? 'Stop recording' : 'Ask by voice'}
                className={`min-h-[46px] min-w-[46px] rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isRecording
                    ? 'bg-[#FF6B5E] text-[#0B0B0B]'
                    : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-[var(--khata-accent)] hover:opacity-90'
                }`}
              >
                {voiceBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-4 h-4 fill-current" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={sending}
                placeholder={
                  isRecording
                    ? 'Listening... tap stop when done'
                    : 'Ask about today’s udhaar, pending customers, or monthly collection...'
                }
                aria-label="Ask Khata AI Assistant"
                data-testid="chat-input"
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                data-testid="chat-send-btn"
                aria-label="Send message"
                className="min-h-[46px] px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Ask</span>
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
};
