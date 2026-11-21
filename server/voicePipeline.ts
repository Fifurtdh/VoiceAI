import crypto from 'node:crypto';
import WebSocket from 'ws';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  EntryDirection,
  LanguageCode,
  PendingConfirmation,
} from '../src/types/khata.ts';
import { getSpeechLang } from '../src/utils/i18n.ts';
import {
  parseVoiceUtterance,
  type VoiceParseOutcome,
} from '../src/utils/voiceParser.ts';
import { getTodayISO } from '../src/utils/format.ts';

const DEFAULT_GNANI_STT_URL = 'https://api.vachana.ai/stt/v3';
const DEFAULT_GNANI_STT_WS_URL = 'wss://api.vachana.ai/stt/v3/stream';
const DEFAULT_GNANI_TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
const DEFAULT_GNANI_TTS_WS_URL = 'wss://api.vachana.ai/api/v1/tts';
const DEFAULT_GNANI_TTS_VOICE = 'Shivani';

export type GnaniAuthState =
  | 'connected'
  | 'unconfigured'
  | 'auth_failed'
  | 'unreachable';

export interface VoicePipelineStatus {
  gnaniSttConfigured: boolean;
  gnaniTtsConfigured: boolean;
  geminiConfigured: boolean;
  sttProvider: 'gnani-prisma-v3' | 'unconfigured';
  ttsProvider: 'gnani-timbre-v3' | 'browser-fallback';
  intentProvider: 'gemini-4-hydrogen' | 'local-parser';
  missingCredentials: string[];
  gnaniAuthState?: GnaniAuthState;
  gnaniError?: string;
}

export interface ValidatedVoiceIntent {
  intent:
    | 'entry'
    | 'ADD_TRANSACTION'
    | 'correction'
    | 'query_today_summary'
    | 'query_customer_balance'
    | 'unknown';
  customerName?: string;
  amount?: number;
  direction?: EntryDirection;
  transactionType?: 'CREDIT' | 'PAYMENT';
  date?: string;
  note?: string;
}

function getGnaniAuthConfig(): {
  apiKey: string;
  accessKey: string;
  secretKey: string;
  hasAuth: boolean;
  sttUrl: string;
  sttWsUrl: string;
  ttsUrl: string;
  ttsWsUrl: string;
  ttsVoice: string;
} {
  const apiKey = (process.env.GNANI_API_KEY || '').trim();
  const accessKey = (process.env.GNANI_ACCESS_KEY || '').trim();
  const secretKey = (process.env.GNANI_SECRET_KEY || '').trim();
  const hasAuth = Boolean(apiKey || (accessKey && secretKey));

  return {
    apiKey,
    accessKey,
    secretKey,
    hasAuth,
    sttUrl: (process.env.GNANI_STT_URL || DEFAULT_GNANI_STT_URL).trim(),
    sttWsUrl: (process.env.GNANI_STT_WS_URL || DEFAULT_GNANI_STT_WS_URL).trim(),
    ttsUrl: (process.env.GNANI_TTS_URL || DEFAULT_GNANI_TTS_URL).trim(),
    ttsWsUrl: (process.env.GNANI_TTS_WS_URL || DEFAULT_GNANI_TTS_WS_URL).trim(),
    ttsVoice: (process.env.GNANI_TTS_VOICE || DEFAULT_GNANI_TTS_VOICE).trim(),
  };
}

export function getVoicePipelineStatus(): VoicePipelineStatus {
  const gnani = getGnaniAuthConfig();
  const gnaniSttConfigured = Boolean(gnani.hasAuth && gnani.sttWsUrl);
  const gnaniTtsConfigured = Boolean(gnani.hasAuth && (gnani.ttsWsUrl || gnani.ttsUrl));
  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() !== '' &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  const missingCredentials: string[] = [];
  if (!gnani.hasAuth) {
    missingCredentials.push('GNANI_API_KEY');
  }
  if (!geminiConfigured) {
    missingCredentials.push('GEMINI_API_KEY');
  }

  return {
    gnaniSttConfigured,
    gnaniTtsConfigured,
    geminiConfigured,
    sttProvider: gnaniSttConfigured ? 'gnani-prisma-v3' : 'unconfigured',
    ttsProvider: gnaniTtsConfigured ? 'gnani-timbre-v3' : 'browser-fallback',
    intentProvider: geminiConfigured ? 'gemini-4-hydrogen' : 'local-parser',
    missingCredentials,
    gnaniAuthState: gnaniSttConfigured ? 'connected' : 'unconfigured',
  };
}

interface CachedGnaniProbe {
  fingerprint: string;
  checkedAt: number;
  state: GnaniAuthState;
  error?: string;
}

const GNANI_PROBE_TTL_MS = 60_000;
let cachedGnaniProbe: CachedGnaniProbe | null = null;
let inflightGnaniProbe: Promise<CachedGnaniProbe> | null = null;

function getGnaniCredentialFingerprint(): string {
  const gnani = getGnaniAuthConfig();
  return crypto
    .createHash('sha256')
    .update(
      `${gnani.apiKey}|${gnani.accessKey}|${gnani.secretKey}|${gnani.sttWsUrl}`
    )
    .digest('hex');
}

export function resetGnaniProbeCache(): void {
  cachedGnaniProbe = null;
  inflightGnaniProbe = null;
}

/**
 * Verifies live authentication with Gnani Prisma v3.0 via the official WebSocket handshake
 * (`wss://api.vachana.ai/stt/v3/stream`). Never falsely reports connected merely because
 * environment variables are present, and never exposes credential values in errors or logs.
 */
export async function verifyGnaniConnection(
  forceRefresh = false
): Promise<{ state: GnaniAuthState; error?: string }> {
  const gnani = getGnaniAuthConfig();
  if (!gnani.hasAuth || !gnani.sttWsUrl) {
    return {
      state: 'unconfigured',
      error:
        'Gnani Prisma v3.0 requires GNANI_API_KEY (or GNANI_ACCESS_KEY + GNANI_SECRET_KEY) on the server.',
    };
  }

  const fingerprint = getGnaniCredentialFingerprint();
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedGnaniProbe &&
    cachedGnaniProbe.fingerprint === fingerprint &&
    now - cachedGnaniProbe.checkedAt < GNANI_PROBE_TTL_MS
  ) {
    return { state: cachedGnaniProbe.state, error: cachedGnaniProbe.error };
  }

  if (inflightGnaniProbe) {
    const res = await inflightGnaniProbe;
    return { state: res.state, error: res.error };
  }

  inflightGnaniProbe = new Promise<CachedGnaniProbe>((resolve) => {
    let settled = false;
    const finish = (state: GnaniAuthState, error?: string) => {
      if (settled) return;
      settled = true;
      const result: CachedGnaniProbe = {
        fingerprint,
        checkedAt: Date.now(),
        state,
        error,
      };
      cachedGnaniProbe = result;
      inflightGnaniProbe = null;
      resolve(result);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(gnani.sttWsUrl, {
        headers: {
          ...buildGnaniHeaders(),
          model: 'prisma-v3.0',
          language_code: 'en-IN',
          encoding: 'linear_pcm',
          sample_rate: '16000',
          num_channels: '1',
          format: 'transcribe',
        },
        handshakeTimeout: 5000,
      });
    } catch {
      finish(
        'unreachable',
        'Invalid Gnani STT WebSocket URL configuration on the server.'
      );
      return;
    }

    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish(
        'unreachable',
        'Timed out connecting to Gnani Prisma v3.0 STT service.'
      );
    }, 5500);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch {
        // ignore
      }
    };

    ws.on('unexpected-response', (_req, res) => {
      const status = res.statusCode ?? 0;
      res.resume();
      cleanup();
      if (status === 401 || status === 403) {
        finish(
          'auth_failed',
          `Gnani Prisma v3.0 rejected server credentials (HTTP ${status}). Verify GNANI_API_KEY in .env.`
        );
      } else {
        finish(
          'unreachable',
          `Gnani Prisma v3.0 handshake failed with HTTP ${status}.`
        );
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          error?: string;
        };
        if (msg.type === 'connected') {
          cleanup();
          finish('connected');
          return;
        }
        if (msg.error) {
          const lower = msg.error.toLowerCase();
          cleanup();
          if (
            lower.includes('auth') ||
            lower.includes('key') ||
            lower.includes('unauthor') ||
            lower.includes('forbidden')
          ) {
            finish(
              'auth_failed',
              'Gnani Prisma v3.0 authentication failed. Check GNANI_API_KEY on the server.'
            );
          } else {
            finish('unreachable', 'Gnani Prisma v3.0 returned an error during handshake.');
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    });

    ws.on('error', (err) => {
      cleanup();
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('403')) {
        finish(
          'auth_failed',
          'Gnani Prisma v3.0 authentication failed. Check GNANI_API_KEY on the server.'
        );
      } else {
        finish('unreachable', 'Could not reach Gnani Prisma v3.0 STT service.');
      }
    });

    ws.on('close', (code) => {
      if (!settled) {
        clearTimeout(timer);
        if (code === 1008 || code === 4001 || code === 4003) {
          finish(
            'auth_failed',
            'Gnani Prisma v3.0 closed the connection due to invalid credentials.'
          );
        } else {
          finish(
            'unreachable',
            'Gnani Prisma v3.0 closed the connection before completing handshake.'
          );
        }
      }
    });
  });

  const res = await inflightGnaniProbe;
  return { state: res.state, error: res.error };
}

/**
 * Returns voice pipeline status backed by live cached Gnani provider verification
 * so the API never falsely reports Gnani as ready if credentials fail authentication.
 */
export async function getVerifiedVoicePipelineStatus(
  forceRefresh = false
): Promise<VoicePipelineStatus> {
  const base = getVoicePipelineStatus();
  if (!base.gnaniSttConfigured) {
    return {
      ...base,
      gnaniAuthState: 'unconfigured',
    };
  }

  const probe = await verifyGnaniConnection(forceRefresh);
  const verified = probe.state === 'connected';
  return {
    ...base,
    gnaniSttConfigured: verified,
    gnaniTtsConfigured: verified && base.gnaniTtsConfigured,
    sttProvider: verified ? 'gnani-prisma-v3' : 'unconfigured',
    ttsProvider: verified && base.gnaniTtsConfigured ? 'gnani-timbre-v3' : 'browser-fallback',
    gnaniAuthState: probe.state,
    gnaniError: probe.error,
  };
}

function buildGnaniHeaders(): Record<string, string> {
  const gnani = getGnaniAuthConfig();
  const headers: Record<string, string> = {
    'X-API-Request-ID': crypto.randomUUID(),
  };
  if (gnani.apiKey) {
    headers['X-API-Key-ID'] = gnani.apiKey;
  }
  if (gnani.accessKey) {
    headers['accesskey'] = gnani.accessKey;
    headers['X-Gnani-Access-Key'] = gnani.accessKey;
    if (!gnani.apiKey) {
      headers['X-API-Key-ID'] = gnani.accessKey;
    }
  }
  if (gnani.secretKey) {
    headers['secretkey'] = gnani.secretKey;
    headers['X-Gnani-Secret-Key'] = gnani.secretKey;
  }
  return headers;
}

/**
 * Resolves the explicit BCP-47 locale for a Voice Khata language code.
 */
export function resolveGnaniLanguageCode(language: LanguageCode): string {
  if (language === 'en') return 'en-IN';
  return getSpeechLang(language);
}

/**
 * Resolves official Gnani Prisma v3.0 WebSocket streaming language + format parameters.
 * - On default `'en'` (where Indian shopkeepers frequently speak Hinglish, Kanglish, or English),
 *   uses `language_code: 'indic-auto'` + `format: 'codemix'` for seamless multilingual auto-detection.
 * - On explicit regional language selection (`hi`, `kn`, `ta`, `te`, `mr`, `bn`),
 *   locks to that locale (e.g. `kn-IN`, `hi-IN`) with `format: 'codemix'` for mixed Indic+English speech.
 */
export function resolveGnaniStreamConfig(language: LanguageCode): {
  languageCode: string;
  format: 'codemix';
} {
  return {
    languageCode: language === 'en' ? 'indic-auto' : getSpeechLang(language),
    format: 'codemix',
  };
}

/**
 * Wraps raw signed 16-bit little-endian mono PCM bytes into a standard RIFF WAV buffer.
 */
export function pcm16ToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate = 16000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.byteLength;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function inferAudioFileMeta(mimeType: string): {
  filename: string;
  contentType: string;
} {
  const lower = mimeType.toLowerCase();
  if (lower.includes('wav')) {
    return { filename: 'speech.wav', contentType: 'audio/wav' };
  }
  if (lower.includes('ogg')) {
    return { filename: 'speech.ogg', contentType: 'audio/ogg' };
  }
  if (lower.includes('mp4') || lower.includes('m4a')) {
    return { filename: 'speech.m4a', contentType: 'audio/mp4' };
  }
  if (lower.includes('mpeg') || lower.includes('mp3')) {
    return { filename: 'speech.mp3', contentType: 'audio/mpeg' };
  }
  if (lower.includes('webm')) {
    return { filename: 'speech.webm', contentType: 'audio/webm' };
  }
  if (lower.includes('flac')) {
    return { filename: 'speech.flac', contentType: 'audio/flac' };
  }
  return { filename: 'speech.wav', contentType: 'audio/wav' };
}

/**
 * Calls Gnani Prisma v3.0 REST API (`POST https://api.vachana.ai/stt/v3`) using multipart/form-data.
 * Never fakes transcription when Gnani credentials are missing.
 */
export async function transcribeWithGnani(params: {
  audioBuffer: Buffer;
  mimeType: string;
  language: LanguageCode;
}): Promise<
  | {
      ok: true;
      transcript: string;
      detectedLanguage?: string;
      provider: 'gnani-prisma-v3';
    }
  | {
      ok: false;
      code: 'GNANI_NOT_CONFIGURED' | 'GNANI_AUTH_FAILED' | 'GNANI_UPSTREAM_ERROR';
      error: string;
    }
> {
  const gnani = getGnaniAuthConfig();
  if (!gnani.hasAuth || !gnani.sttUrl) {
    return {
      ok: false,
      code: 'GNANI_NOT_CONFIGURED',
      error:
        'Gnani Prisma v3.0 Speech-to-Text requires GNANI_API_KEY to be configured on the server.',
    };
  }

  let uploadBuffer = params.audioBuffer;
  let uploadMime = params.mimeType || 'audio/wav';
  if (uploadMime.includes('pcm')) {
    uploadBuffer = pcm16ToWavBuffer(params.audioBuffer, 16000, 1, 16);
    uploadMime = 'audio/wav';
  }

  const fileMeta = inferAudioFileMeta(uploadMime);

  const form = new FormData();
  const audioBytes = new Uint8Array(
    uploadBuffer.buffer,
    uploadBuffer.byteOffset,
    uploadBuffer.byteLength
  );
  const copyBytes = new Uint8Array(audioBytes.byteLength);
  copyBytes.set(audioBytes);
  form.append(
    'audio_file',
    new Blob([copyBytes], { type: fileMeta.contentType }),
    fileMeta.filename
  );
  const streamCfg = resolveGnaniStreamConfig(params.language);
  form.append('model', 'prisma-v3.0');
  form.append('language_code', streamCfg.languageCode);
  form.append('format', streamCfg.format);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(gnani.sttUrl, {
      method: 'POST',
      headers: buildGnaniHeaders(),
      body: form,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: 'GNANI_AUTH_FAILED',
          error: `Gnani Prisma v3.0 authentication failed (HTTP ${response.status}). Please verify GNANI_API_KEY on the server.`,
        };
      }
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        code: 'GNANI_UPSTREAM_ERROR',
        error: `Gnani STT returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`,
      };
    }

    const payload = (await response.json()) as {
      success?: boolean;
      transcript?: string;
      text?: string;
      detected_language_code?: string;
      result?: { transcript?: string; text?: string };
      error?: string;
    };

    const transcript = (
      payload.transcript ??
      payload.text ??
      payload.result?.transcript ??
      payload.result?.text ??
      ''
    ).trim();

    if (!transcript) {
      return {
        ok: false,
        code: 'GNANI_UPSTREAM_ERROR',
        error:
          payload.error ||
          'Gnani STT did not detect clear speech in the recorded audio.',
      };
    }

    return {
      ok: true,
      transcript,
      detectedLanguage: payload.detected_language_code,
      provider: 'gnani-prisma-v3',
    };
  } catch (err) {
    return {
      ok: false,
      code: 'GNANI_UPSTREAM_ERROR',
      error:
        err instanceof Error
          ? `Could not reach Gnani STT service: ${err.message}`
          : 'Could not reach Gnani STT service.',
    };
  }
}

export interface GnaniStreamHandle {
  sendPcmChunk: (chunk: Buffer) => void;
  updateSettings: (language: LanguageCode) => void;
  finish: () => Promise<void>;
  close: () => void;
  isOpen: () => boolean;
}

/**
 * Opens a real-time streaming WebSocket session to Gnani Prisma v3.0 (`wss://api.vachana.ai/stt/v3/stream`).
 * Passes authentication and audio format properties as WebSocket upgrade headers per official Gnani docs,
 * forwards server-side VAD events (`speech_start`/`speech_end`), partials, and final transcripts,
 * and supports mid-session `update_settings` language changes.
 */
export function openGnaniSttStream(params: {
  language: LanguageCode;
  onVadState?: (state: 'speech_start' | 'speech_end') => void;
  onPartial: (text: string) => void;
  onFinal: (text: string, detectedLanguage?: string, latencyMs?: number) => void;
  onError: (errMsg: string, code?: 'GNANI_AUTH_FAILED' | 'GNANI_UPSTREAM_ERROR') => void;
}): GnaniStreamHandle | null {
  const gnani = getGnaniAuthConfig();
  if (!gnani.hasAuth || !gnani.sttWsUrl) {
    return null;
  }

  const streamCfg = resolveGnaniStreamConfig(params.language);
  const headers: Record<string, string> = {
    ...buildGnaniHeaders(),
    model: 'prisma-v3.0',
    language_code: streamCfg.languageCode,
    encoding: 'linear_pcm',
    sample_rate: '16000',
    num_channels: '1',
    format: streamCfg.format,
    partials_enabled: 'true',
  };

  let closed = false;
  let open = false;
  let receivedFinal = false;
  const queuedChunks: Buffer[] = [];
  let finishedResolve: (() => void) | null = null;

  const ws = new WebSocket(gnani.sttWsUrl, { headers });

  ws.on('open', () => {
    open = true;
    while (queuedChunks.length > 0 && ws.readyState === WebSocket.OPEN) {
      const next = queuedChunks.shift()!;
      ws.send(next);
    }
  });

  ws.on('unexpected-response', (_req, res) => {
    const status = res.statusCode ?? 0;
    res.resume();
    if (!closed) {
      if (status === 401 || status === 403) {
        params.onError(
          `Gnani Prisma v3.0 authentication failed (HTTP ${status}). Check GNANI_API_KEY on the server.`,
          'GNANI_AUTH_FAILED'
        );
      } else {
        params.onError(
          `Gnani STT stream rejected with HTTP ${status}.`,
          'GNANI_UPSTREAM_ERROR'
        );
      }
    }
    closed = true;
    if (finishedResolve) {
      finishedResolve();
      finishedResolve = null;
    }
  });

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as {
        type?: string;
        transcript?: string;
        text?: string;
        is_final?: boolean;
        isFinal?: boolean;
        detected_language_code?: string;
        latency?: number;
        error?: string;
      };

      if (parsed.type === 'speech_start' || parsed.type === 'speech_end') {
        params.onVadState?.(parsed.type);
        return;
      }

      if (parsed.error) {
        const lower = parsed.error.toLowerCase();
        const isAuth =
          lower.includes('auth') ||
          lower.includes('key') ||
          lower.includes('unauthor') ||
          lower.includes('forbidden');
        params.onError(
          isAuth
            ? 'Gnani Prisma v3.0 authentication failed. Check GNANI_API_KEY on the server.'
            : parsed.error,
          isAuth ? 'GNANI_AUTH_FAILED' : 'GNANI_UPSTREAM_ERROR'
        );
        return;
      }

      const text = (parsed.transcript ?? parsed.text ?? '').trim();
      if (!text) return;

      const isFinal = Boolean(
        parsed.is_final ||
          parsed.isFinal ||
          parsed.type === 'final' ||
          (parsed.type === 'transcript' && parsed.is_final !== false)
      );
      if (isFinal) {
        receivedFinal = true;
        params.onFinal(
          text,
          parsed.detected_language_code,
          typeof parsed.latency === 'number' ? Math.round(parsed.latency) : undefined
        );
        if (finishedResolve) {
          finishedResolve();
          finishedResolve = null;
        }
      } else {
        params.onPartial(text);
      }
    } catch {
      // Ignore non-JSON control frames
    }
  });

  ws.on('error', (err) => {
    if (!closed) {
      const msg = err.message || 'Gnani STT WebSocket error.';
      const isAuth = msg.includes('401') || msg.includes('403');
      params.onError(
        isAuth
          ? 'Gnani Prisma v3.0 authentication failed. Check GNANI_API_KEY on the server.'
          : msg,
        isAuth ? 'GNANI_AUTH_FAILED' : 'GNANI_UPSTREAM_ERROR'
      );
    }
    if (finishedResolve) {
      finishedResolve();
      finishedResolve = null;
    }
  });

  ws.on('close', () => {
    open = false;
    closed = true;
    if (finishedResolve) {
      finishedResolve();
      finishedResolve = null;
    }
  });

  return {
    sendPcmChunk(chunk: Buffer) {
      if (closed || chunk.byteLength === 0) return;
      // Send 1024-byte frames (512 samples @ 16-bit mono) per Gnani Prisma WS spec
      const FRAME_BYTES = 1024;
      for (let offset = 0; offset < chunk.byteLength; offset += FRAME_BYTES) {
        const frame = chunk.subarray(
          offset,
          Math.min(offset + FRAME_BYTES, chunk.byteLength)
        );
        if (open && ws.readyState === WebSocket.OPEN) {
          ws.send(frame);
        } else {
          queuedChunks.push(Buffer.from(frame));
        }
      }
    },
    updateSettings(language: LanguageCode) {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      const nextCfg = resolveGnaniStreamConfig(language);
      try {
        ws.send(
          JSON.stringify({
            type: 'update_settings',
            language_code: nextCfg.languageCode,
            format: nextCfg.format,
          })
        );
      } catch {
        // ignore if socket closed concurrently
      }
    },
    async finish() {
      if (closed || receivedFinal) return;
      if (ws.readyState === WebSocket.OPEN) {
        // Flush short trailing silence frames so Gnani VAD closes the utterance cleanly
        const silenceFrame = Buffer.alloc(1024, 0);
        for (let i = 0; i < 20; i++) {
          if (ws.readyState !== WebSocket.OPEN || receivedFinal) break;
          ws.send(silenceFrame);
        }
      }
      await new Promise<void>((resolve) => {
        if (receivedFinal || closed) {
          resolve();
          return;
        }
        finishedResolve = resolve;
        setTimeout(() => {
          if (finishedResolve) {
            finishedResolve();
            finishedResolve = null;
          }
        }, 1000);
      });
    },
    close() {
      closed = true;
      open = false;
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
    isOpen() {
      return open && !closed;
    },
  };
}

export interface GnaniTtsStreamHandle {
  cancel: () => void;
  done: Promise<void>;
}

/**
 * Streams real-time Text-to-Speech audio chunks from Gnani Timbre v3.0 over WebSocket
 * (`wss://api.vachana.ai/api/v1/tts`).
 * Emits raw signed 16-bit LE mono PCM chunks @ 24kHz immediately as they arrive for low-latency TTFA,
 * and supports instant barge-in cancellation via `cancel()`.
 */
export function streamSynthesizeWithGnani(params: {
  text: string;
  language: LanguageCode;
  onStart?: (meta: { sampleRate: number }) => void;
  onChunk: (chunk: {
    chunkIndex: number;
    audioBase64: string;
    sampleRate: number;
  }) => void;
  onComplete?: (stats: {
    chunkCount: number;
    firstChunkLatencyMs?: number;
    totalLatencyMs: number;
  }) => void;
  onError: (
    errMsg: string,
    code: 'GNANI_NOT_CONFIGURED' | 'GNANI_AUTH_FAILED' | 'GNANI_UPSTREAM_ERROR'
  ) => void;
}): GnaniTtsStreamHandle {
  const gnani = getGnaniAuthConfig();
  const sampleRate = 24000;
  const cleanText = params.text.trim().slice(0, 500);

  if (!gnani.hasAuth || !gnani.ttsWsUrl) {
    params.onError(
      'Gnani Timbre v3.0 TTS requires GNANI_API_KEY to be configured on the server.',
      'GNANI_NOT_CONFIGURED'
    );
    return { cancel: () => {}, done: Promise.resolve() };
  }

  if (!cleanText) {
    params.onComplete?.({ chunkCount: 0, totalLatencyMs: 0 });
    return { cancel: () => {}, done: Promise.resolve() };
  }

  let cancelled = false;
  let settled = false;
  let ws: WebSocket | null = null;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const startedAt = Date.now();
  let firstChunkLatencyMs: number | undefined;
  let chunkCount = 0;
  let startEmitted = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutTimer);
    resolveDone();
  };

  const closeSocket = () => {
    if (!ws) return;
    try {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    } catch {
      // ignore
    }
    ws = null;
  };

  const timeoutTimer = setTimeout(() => {
    if (!settled && !cancelled) {
      closeSocket();
      params.onError(
        'Timed out waiting for Gnani Timbre v3.0 WebSocket TTS stream.',
        'GNANI_UPSTREAM_ERROR'
      );
      finish();
    }
  }, 10000);

  try {
    ws = new WebSocket(gnani.ttsWsUrl, {
      headers: buildGnaniHeaders(),
      handshakeTimeout: 6000,
    });
  } catch {
    params.onError(
      'Invalid Gnani Timbre v3.0 WebSocket URL configuration.',
      'GNANI_UPSTREAM_ERROR'
    );
    finish();
    return { cancel: () => {}, done };
  }

  ws.on('open', () => {
    if (cancelled || !ws || ws.readyState !== WebSocket.OPEN) {
      closeSocket();
      finish();
      return;
    }
    ws.send(
      JSON.stringify({
        text: cleanText,
        voice: gnani.ttsVoice,
        model: 'timbre-v3.0',
        language: getSpeechLang(params.language),
        speed: 1,
        audio_config: {
          encoding: 'linear_pcm',
          container: 'raw',
          num_channels: 1,
          sample_rate: sampleRate,
          sample_width: 2,
        },
      })
    );
  });

  ws.on('unexpected-response', (_req, res) => {
    const status = res.statusCode ?? 0;
    res.resume();
    closeSocket();
    if (!cancelled && !settled) {
      if (status === 401 || status === 403) {
        params.onError(
          `Gnani Timbre v3.0 WebSocket authentication failed (HTTP ${status}).`,
          'GNANI_AUTH_FAILED'
        );
      } else {
        params.onError(
          `Gnani Timbre v3.0 WebSocket handshake failed (HTTP ${status}).`,
          'GNANI_UPSTREAM_ERROR'
        );
      }
    }
    finish();
  });

  ws.on('message', (raw, isBinary) => {
    if (cancelled || settled) return;

    if (isBinary) {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      if (buf.byteLength === 0) return;
      if (!startEmitted) {
        startEmitted = true;
        params.onStart?.({ sampleRate });
      }
      chunkCount += 1;
      if (firstChunkLatencyMs === undefined) {
        firstChunkLatencyMs = Date.now() - startedAt;
      }
      const pcmBuf =
        chunkCount === 1 &&
        buf.byteLength > 44 &&
        buf.toString('ascii', 0, 4) === 'RIFF'
          ? buf.subarray(44)
          : buf;
      params.onChunk({
        chunkIndex: chunkCount,
        audioBase64: pcmBuf.toString('base64'),
        sampleRate,
      });
      return;
    }

    try {
      const msg = JSON.parse(raw.toString()) as {
        type?: string;
        error?: string;
        is_final?: boolean;
        audio?: string;
        data?: {
          chunk_index?: number;
          audio?: string;
          is_final?: boolean;
        };
      };

      if (msg.type === 'start' && !startEmitted) {
        startEmitted = true;
        params.onStart?.({ sampleRate });
        return;
      }

      if (msg.error || msg.type === 'error') {
        const errText = msg.error || 'Gnani Timbre v3.0 streaming error.';
        const lower = errText.toLowerCase();
        const isAuth =
          lower.includes('auth') ||
          lower.includes('key') ||
          lower.includes('unauthor') ||
          lower.includes('forbidden');
        closeSocket();
        params.onError(
          isAuth
            ? 'Gnani Timbre v3.0 authentication failed. Check GNANI_API_KEY on the server.'
            : errText,
          isAuth ? 'GNANI_AUTH_FAILED' : 'GNANI_UPSTREAM_ERROR'
        );
        finish();
        return;
      }

      const audioB64 = msg.data?.audio ?? msg.audio ?? '';
      if (audioB64) {
        if (!startEmitted) {
          startEmitted = true;
          params.onStart?.({ sampleRate });
        }
        chunkCount += 1;
        if (firstChunkLatencyMs === undefined) {
          firstChunkLatencyMs = Date.now() - startedAt;
        }
        let cleanedB64 = audioB64;
        if (chunkCount === 1) {
          const decoded = Buffer.from(audioB64, 'base64');
          if (
            decoded.byteLength > 44 &&
            decoded.toString('ascii', 0, 4) === 'RIFF'
          ) {
            cleanedB64 = decoded.subarray(44).toString('base64');
          }
        }
        params.onChunk({
          chunkIndex: msg.data?.chunk_index ?? chunkCount,
          audioBase64: cleanedB64,
          sampleRate,
        });
      }

      const isFinal = Boolean(
        msg.type === 'complete' ||
          msg.type === 'done' ||
          msg.type === 'end' ||
          msg.is_final ||
          msg.data?.is_final
      );
      if (isFinal) {
        closeSocket();
        params.onComplete?.({
          chunkCount,
          firstChunkLatencyMs,
          totalLatencyMs: Date.now() - startedAt,
        });
        finish();
      }
    } catch {
      // Ignore non-JSON control frames
    }
  });

  ws.on('error', (err) => {
    closeSocket();
    if (!cancelled && !settled) {
      const msg = err.message || 'Gnani Timbre v3.0 WebSocket error.';
      const isAuth = msg.includes('401') || msg.includes('403');
      params.onError(
        isAuth
          ? 'Gnani Timbre v3.0 authentication failed. Check GNANI_API_KEY on the server.'
          : msg,
        isAuth ? 'GNANI_AUTH_FAILED' : 'GNANI_UPSTREAM_ERROR'
      );
    }
    finish();
  });

  ws.on('close', () => {
    if (!cancelled && !settled) {
      if (chunkCount > 0) {
        params.onComplete?.({
          chunkCount,
          firstChunkLatencyMs,
          totalLatencyMs: Date.now() - startedAt,
        });
      } else {
        params.onError(
          'Gnani Timbre v3.0 WebSocket closed before delivering audio.',
          'GNANI_UPSTREAM_ERROR'
        );
      }
      finish();
    }
  });

  return {
    cancel() {
      cancelled = true;
      closeSocket();
      finish();
    },
    done,
  };
}

/**
 * Calls Gnani Timbre v3.0 Text-to-Speech API (`POST https://api.vachana.ai/api/v1/tts/inference`).
 */
export async function synthesizeWithGnani(params: {
  text: string;
  language: LanguageCode;
}): Promise<
  | {
      ok: true;
      audioBase64: string;
      mimeType: string;
      provider: 'gnani-timbre-v3';
    }
  | {
      ok: false;
      code: 'GNANI_NOT_CONFIGURED' | 'GNANI_AUTH_FAILED' | 'GNANI_UPSTREAM_ERROR';
      error: string;
    }
> {
  const gnani = getGnaniAuthConfig();
  if (!gnani.hasAuth || !gnani.ttsUrl) {
    return {
      ok: false,
      code: 'GNANI_NOT_CONFIGURED',
      error:
        'Gnani Timbre v3.0 TTS requires GNANI_API_KEY to be configured on the server.',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(gnani.ttsUrl, {
      method: 'POST',
      headers: {
        ...buildGnaniHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text,
        voice: gnani.ttsVoice,
        model: 'timbre-v3.0',
        language: getSpeechLang(params.language),
        speed: 1,
        audio_config: {
          encoding: 'linear_pcm',
          container: 'wav',
          num_channels: 1,
          sample_rate: 24000,
          sample_width: 2,
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: 'GNANI_AUTH_FAILED',
          error: `Gnani Timbre v3.0 authentication failed (HTTP ${response.status}).`,
        };
      }
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        code: 'GNANI_UPSTREAM_ERROR',
        error: `Gnani TTS returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ''}.`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      const buf = Buffer.from(await response.arrayBuffer());
      return {
        ok: true,
        audioBase64: buf.toString('base64'),
        mimeType: contentType.includes('audio/') ? contentType : 'audio/wav',
        provider: 'gnani-timbre-v3',
      };
    }

    const data = (await response.json()) as {
      audio_content?: string;
      audioBase64?: string;
      audio?: string;
      mimeType?: string;
    };
    const audioBase64 = data.audio_content ?? data.audioBase64 ?? data.audio ?? '';
    if (!audioBase64) {
      return {
        ok: false,
        code: 'GNANI_UPSTREAM_ERROR',
        error: 'Gnani TTS returned empty audio payload.',
      };
    }
    return {
      ok: true,
      audioBase64,
      mimeType: data.mimeType || 'audio/wav',
      provider: 'gnani-timbre-v3',
    };
  } catch (err) {
    return {
      ok: false,
      code: 'GNANI_UPSTREAM_ERROR',
      error:
        err instanceof Error
          ? `Could not reach Gnani TTS service: ${err.message}`
          : 'Could not reach Gnani TTS service.',
    };
  }
}

/**
 * Pure deterministic validation layer between LLM / parser output and the Confirmation Preview.
 * Ensures the LLM can NEVER inject invalid directions, negative amounts, or write directly to SQLite.
 */
export function validateVoiceIntentPayload(
  raw: Partial<ValidatedVoiceIntent>,
  rawTranscript: string,
  hasPendingConfirmation: boolean,
  now: Date = new Date()
): VoiceParseOutcome {
  const today = getTodayISO(now);
  const cleanDate =
    typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : today;

  if (raw.intent === 'query_today_summary') {
    return { kind: 'query_today_summary' };
  }

  if (
    raw.intent === 'query_customer_balance' &&
    typeof raw.customerName === 'string' &&
    raw.customerName.trim().length > 0
  ) {
    return {
      kind: 'query_customer_balance',
      customerName: raw.customerName.trim().slice(0, 80),
    };
  }

  const normalizedDirection: EntryDirection | undefined =
    raw.direction === 'payment' || raw.transactionType === 'PAYMENT'
      ? 'payment'
      : raw.direction === 'credit' || raw.transactionType === 'CREDIT'
      ? 'credit'
      : undefined;

  if (raw.intent === 'correction' && hasPendingConfirmation) {
    const amount =
      typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0
        ? Math.round(raw.amount)
        : undefined;
    if (amount !== undefined || normalizedDirection !== undefined) {
      return {
        kind: 'correction',
        amount,
        direction: normalizedDirection,
        customerName:
          typeof raw.customerName === 'string' && raw.customerName.trim()
            ? raw.customerName.trim().slice(0, 80)
            : undefined,
      };
    }
  }

  if (
    (raw.intent === 'entry' || raw.intent === 'ADD_TRANSACTION') &&
    typeof raw.amount === 'number' &&
    Number.isFinite(raw.amount) &&
    raw.amount > 0
  ) {
    const customerName =
      typeof raw.customerName === 'string' && raw.customerName.trim()
        ? raw.customerName.trim().slice(0, 80)
        : 'Walk-in Customer';
    const direction: EntryDirection = normalizedDirection ?? 'credit';
    const pending: PendingConfirmation = {
      customerName,
      amount: Math.max(1, Math.round(raw.amount)),
      direction,
      date: cleanDate,
      note:
        typeof raw.note === 'string' && raw.note.trim()
          ? raw.note.trim().slice(0, 160)
          : undefined,
      rawTranscript,
    };
    return { kind: 'entry', pending };
  }

  return { kind: 'unknown', raw: rawTranscript };
}

/**
 * Extracts structured kirana ledger intent from a transcript using Gemini (`gemini-4-hydrogen`)
 * when GEMINI_API_KEY is configured, with strict JSON schema & deterministic validation.
 * Falls back cleanly to the multilingual local parser when GEMINI_API_KEY is absent or times out.
 */
export async function extractVoiceIntent(params: {
  transcript: string;
  language: LanguageCode;
  hasPendingConfirmation: boolean;
  customerNames?: string[];
  clientDate?: string;
}): Promise<{
  outcome: VoiceParseOutcome;
  intentProvider: 'gemini-4-hydrogen' | 'local-parser';
}> {
  const transcript = params.transcript.trim();
  if (!transcript) {
    return {
      outcome: { kind: 'unknown', raw: '' },
      intentProvider: 'local-parser',
    };
  }

  const refNow =
    typeof params.clientDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.clientDate)
      ? new Date(`${params.clientDate}T12:00:00`)
      : new Date();

  const status = getVoicePipelineStatus();
  if (!status.geminiConfigured) {
    return {
      outcome: parseVoiceUtterance(transcript, {
        hasPendingConfirmation: params.hasPendingConfirmation,
        now: refNow,
      }),
      intentProvider: 'local-parser',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const today = getTodayISO(refNow);
    const knownCustomers = (params.customerNames ?? []).slice(0, 25).join(', ');
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Transcript (${params.language}): "${transcript}"\nToday ISO date: ${today}\nPending confirmation open: ${params.hasPendingConfirmation}\nKnown store customers: ${knownCustomers || 'none'}`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          systemInstruction:
            'You extract structured credit-ledger (udhaar khata) intents from Indian kirana shopkeeper speech in Hindi, Hinglish, Kannada, Kannada-English, Tamil, Telugu, Marathi, Bengali, or English. ' +
            'Understand spoken numbers and digits in English, Hindi, and Kannada/Indic scripts (e.g. "three hundred forty" -> 340, "teen sau chaalis" -> 340, "paanch sau rupaye" -> 500, "ಮುನ್ನೂರು ನಲವತ್ತು" -> 340, "ಐನೂರು" -> 500, "೩೪೦" -> 340). ' +
            'Rules: "udhaar/baki/credit/likho/liya/taken/borrowed/ಸಾಲ/ಬಾಕಿ/ಉಧಾರಿ/ಬರೆ/ತಗೊಂಡರು/saala" means direction="credit" (CREDIT). ' +
            '"diye/mila/jama/paid/paid back/returned/received/vasooli/payment/ಕೊಟ್ಟರು/ಜಮಾ/ಪಾವತಿ/ಬಂದಿದೆ/ಕೊಟ್ಟಿದ್ದಾರೆ/kottaru/kotru" means direction="payment" (PAYMENT). ' +
            'CRITICAL for customerName: Extract ONLY the person\'s clean name — NEVER include verbs or filler words like "has", "taken", "back", "paid", "gave", "took". If the spoken name is phonetically close to one of the Known store customers (even with minor speech-to-text spelling errors such as "Mallikaajan" for "Mallikarjun"), ALWAYS return the exact matching spelling from Known store customers. ' +
            'If pending confirmation is open and user corrects an amount or direction (e.g. "nahi 430", "payment kar do", "ಅಲ್ಲ 430", "ಇಲ್ಲ ಜಮಾ ಮಾಡಿ"), set intent="correction". ' +
            'If user asks daily totals (e.g. "aaj kitna mila?", "Aaj kitna udhaar gaya?", "today total", "ಇಂದು ಎಷ್ಟು ಬಾಕಿ?", "ಇಂದಿನ ಲೆಕ್ಕ"), set intent="query_today_summary". ' +
            'If user asks how much a specific customer owes (e.g. "How much does Suresh owe?", "Suresh ka kitna baki hai?", "ರಮೇಶ್ ಅವರ ಎಷ್ಟು ಬಾಕಿ ಇದೆ?"), set intent="query_customer_balance" and customerName="Ramesh" or the spoken name. ' +
            'Otherwise if BOTH a clear customer name and a positive integer amount are spoken, set intent="entry". NEVER guess or invent uncertain amounts.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                description:
                  'One of: entry, correction, query_today_summary, query_customer_balance, unknown',
              },
              customerName: {
                type: Type.STRING,
                description: 'Clean customer name only (no verbs/fillers), matched to Known store customers when phonetically close',
              },
              amount: {
                type: Type.NUMBER,
                description: 'Positive integer amount in INR if clearly stated',
              },
              direction: {
                type: Type.STRING,
                description: 'Either credit or payment',
              },
              date: {
                type: Type.STRING,
                description: 'YYYY-MM-DD date if specified, otherwise today',
              },
              note: {
                type: Type.STRING,
                description: 'Optional short item/payment note',
              },
            },
            required: ['intent'],
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Gemini intent extraction timed out after 6500ms')),
          6500
        );
      }),
    ]).finally(() => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    });

    const parsed = JSON.parse(
      (response.text ?? '{}').trim()
    ) as Partial<ValidatedVoiceIntent>;

    const outcome = validateVoiceIntentPayload(
      parsed,
      transcript,
      params.hasPendingConfirmation,
      refNow
    );

    if (outcome.kind === 'unknown') {
      const fallback = parseVoiceUtterance(transcript, {
        hasPendingConfirmation: params.hasPendingConfirmation,
        now: refNow,
      });
      if (fallback.kind !== 'unknown') {
        return { outcome: fallback, intentProvider: 'local-parser' };
      }
    }

    return { outcome, intentProvider: 'gemini-4-hydrogen' };
  } catch (err) {
    console.warn('Gemini intent extraction error, using local parser fallback:', err);
    return {
      outcome: parseVoiceUtterance(transcript, {
        hasPendingConfirmation: params.hasPendingConfirmation,
        now: refNow,
      }),
      intentProvider: 'local-parser',
    };
  }
}
