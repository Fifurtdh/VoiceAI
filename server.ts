import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createApiApp } from './server/app.ts';
import { SESSION_COOKIE_NAME, verifySessionToken } from './server/auth.ts';
import { openDatabase, type CustomerRow } from './server/db.ts';
import {
  extractVoiceIntent,
  getVerifiedVoicePipelineStatus,
  openGnaniSttStream,
  streamSynthesizeWithGnani,
  transcribeWithGnani,
  type GnaniStreamHandle,
  type GnaniTtsStreamHandle,
} from './server/voicePipeline.ts';
import type { LanguageCode } from './src/types/khata.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function sendWsJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const db = openDatabase();
  const app = createApiApp(db);
  const server = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (!reqUrl.startsWith('/ws/voice')) {
      return;
    }

    const cookies = parseCookieHeader(request.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    const auth = token ? verifySessionToken(token) : null;
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let sessionLang: LanguageCode = 'en';
      let hasPendingConfirmation = false;
      let audioChunks: Buffer[] = [];
      let gnaniStream: GnaniStreamHandle | null = null;
      let activeTtsStream: GnaniTtsStreamHandle | null = null;
      let activeTtsRequestId: string | null = null;
      let streamFinalText = '';
      let streamFinalLang: string | undefined;
      let streamFinalLatencyMs: number | undefined;
      let turnDispatched = false;
      let isAlive = true;

      // 25s protocol-level heartbeat keeps reverse-proxy WebSockets alive across idle periods
      ws.on('pong', () => {
        isAlive = true;
      });
      const heartbeat = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(heartbeat);
          return;
        }
        if (!isAlive) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          clearInterval(heartbeat);
          return;
        }
        isAlive = false;
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }, 25_000);

      void getVerifiedVoicePipelineStatus().then((pipelineStatus) => {
        sendWsJson(ws, {
          type: 'stt_ready',
          provider: pipelineStatus.sttProvider,
          ttsProvider: pipelineStatus.ttsProvider,
          gnaniAuthState: pipelineStatus.gnaniAuthState,
          gnaniError: pipelineStatus.gnaniError,
        });
      });

      const closeGnaniStream = () => {
        if (gnaniStream) {
          gnaniStream.close();
          gnaniStream = null;
        }
      };

      const cancelActiveTts = () => {
        if (activeTtsStream) {
          activeTtsStream.cancel();
          activeTtsStream = null;
        }
        activeTtsRequestId = null;
      };

      const dispatchTranscriptOutcome = async (transcript: string) => {
        const customerRows = db
          .prepare('SELECT name FROM customers WHERE store_id = ?')
          .all(auth.storeId) as Array<Pick<CustomerRow, 'name'>>;

        const extracted = await extractVoiceIntent({
          transcript,
          language: sessionLang,
          hasPendingConfirmation,
          customerNames: customerRows.map((c) => c.name),
        });

        const out = extracted.outcome;
        if (out.kind === 'entry') {
          sendWsJson(ws, {
            type: 'entry_parsed',
            customer: out.pending.customerName,
            amount: out.pending.amount,
            direction: out.pending.direction,
            date: out.pending.date,
            note: out.pending.note,
            rawTranscript: out.pending.rawTranscript || transcript,
          });
          return;
        }

        if (out.kind === 'correction') {
          sendWsJson(ws, {
            type: 'correction_parsed',
            amount: out.amount,
            direction: out.direction,
            customerName: out.customerName,
          });
          return;
        }

        if (out.kind === 'query_today_summary') {
          sendWsJson(ws, { type: 'query_today_summary' });
          return;
        }

        if (out.kind === 'query_customer_balance') {
          sendWsJson(ws, {
            type: 'query_customer_balance',
            customerName: out.customerName,
          });
          return;
        }

        sendWsJson(ws, {
          type: 'answer_text',
          text: 'Please mention customer name, amount, and udhaar or payment.',
        });
      };

      ws.on('message', async (data, isBinary) => {
        isAlive = true;
        if (isBinary) {
          if (turnDispatched) return;
          const buf = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer);
          audioChunks.push(buf);
          if (gnaniStream) {
            gnaniStream.sendPcmChunk(buf);
          }
          return;
        }

        try {
          const msg = JSON.parse(data.toString()) as {
            type?: string;
            language?: LanguageCode;
            hasPendingConfirmation?: boolean;
            text?: string;
            requestId?: string;
            ts?: number;
          };

          if (msg.type === 'ping') {
            sendWsJson(ws, { type: 'pong', ts: msg.ts ?? Date.now() });
            return;
          }

          if (msg.type === 'update_language' && msg.language) {
            sessionLang = msg.language;
            gnaniStream?.updateSettings(sessionLang);
            return;
          }

          if (msg.type === 'tts_cancel') {
            if (!msg.requestId || msg.requestId === activeTtsRequestId) {
              cancelActiveTts();
            }
            return;
          }

          if (msg.type === 'tts_request' && typeof msg.text === 'string') {
            const requestId =
              typeof msg.requestId === 'string' && msg.requestId.trim()
                ? msg.requestId.trim()
                : `tts-${Date.now()}`;
            const ttsLang = msg.language || sessionLang;

            cancelActiveTts();
            activeTtsRequestId = requestId;

            activeTtsStream = streamSynthesizeWithGnani({
              text: msg.text,
              language: ttsLang,
              onStart: ({ sampleRate }) => {
                if (activeTtsRequestId !== requestId) return;
                sendWsJson(ws, {
                  type: 'agent_audio_start',
                  requestId,
                  sampleRate,
                  format: 'pcm16',
                });
              },
              onChunk: ({ chunkIndex, audioBase64, sampleRate }) => {
                if (activeTtsRequestId !== requestId) return;
                sendWsJson(ws, {
                  type: 'agent_audio_chunk',
                  requestId,
                  chunkIndex,
                  audioBase64,
                  sampleRate,
                });
              },
              onComplete: ({ firstChunkLatencyMs, totalLatencyMs }) => {
                if (activeTtsRequestId !== requestId) return;
                activeTtsStream = null;
                activeTtsRequestId = null;
                sendWsJson(ws, {
                  type: 'agent_audio_end',
                  requestId,
                  firstChunkLatencyMs,
                  totalLatencyMs,
                });
              },
              onError: (errMsg, code) => {
                if (activeTtsRequestId !== requestId) return;
                activeTtsStream = null;
                activeTtsRequestId = null;
                sendWsJson(ws, {
                  type: 'agent_audio_error',
                  requestId,
                  code,
                  error: errMsg,
                });
              },
            });
            return;
          }

          if (msg.type === 'session_start' || msg.type === 'audio_start') {
            // Server-side barge-in: immediately abort any active Timbre TTS stream
            cancelActiveTts();

            if (msg.language) sessionLang = msg.language;
            if (typeof msg.hasPendingConfirmation === 'boolean') {
              hasPendingConfirmation = msg.hasPendingConfirmation;
            }
            audioChunks = [];
            streamFinalText = '';
            streamFinalLang = undefined;
            streamFinalLatencyMs = undefined;
            turnDispatched = false;
            closeGnaniStream();

            // Open live upstream Gnani Prisma v3.0 WebSocket stream when credentials exist
            gnaniStream = openGnaniSttStream({
              language: sessionLang,
              onVadState: (state) => {
                if (!turnDispatched) {
                  sendWsJson(ws, { type: 'vad_state', state });
                }
              },
              onPartial: (partial) => {
                if (!turnDispatched) {
                  sendWsJson(ws, {
                    type: 'transcript_partial',
                    text: partial,
                    stableText: streamFinalText || undefined,
                  });
                }
              },
              onFinal: (finalText, detectedLang, latencyMs) => {
                if (turnDispatched) return;
                streamFinalText = streamFinalText
                  ? `${streamFinalText} ${finalText}`
                  : finalText;
                streamFinalLang = detectedLang;
                streamFinalLatencyMs = latencyMs;

                const cleanFinal = streamFinalText.trim();
                if (!cleanFinal) return;

                // Prisma server-side VAD finalized the utterance: dispatch immediately for lowest latency
                turnDispatched = true;
                audioChunks = [];
                closeGnaniStream();

                sendWsJson(ws, {
                  type: 'transcript_final',
                  text: cleanFinal,
                  detectedLanguage: streamFinalLang,
                  latencyMs: streamFinalLatencyMs,
                  autoEndpointed: true,
                });
                void dispatchTranscriptOutcome(cleanFinal);
              },
              onError: (errMsg, code) => {
                if (code === 'GNANI_AUTH_FAILED') {
                  sendWsJson(ws, {
                    type: 'voice_error',
                    code: 'GNANI_AUTH_FAILED',
                    error: errMsg,
                  });
                  closeGnaniStream();
                }
                // For transient WS errors, keep buffering PCM chunks so REST POST /stt/v3 fallback can still succeed on audio_end
              },
            });
            return;
          }

          if (msg.type === 'audio_cancel') {
            audioChunks = [];
            streamFinalText = '';
            streamFinalLang = undefined;
            streamFinalLatencyMs = undefined;
            turnDispatched = false;
            closeGnaniStream();
            return;
          }

          if (msg.type === 'text_input' && typeof msg.text === 'string') {
            cancelActiveTts();
            if (typeof msg.hasPendingConfirmation === 'boolean') {
              hasPendingConfirmation = msg.hasPendingConfirmation;
            }
            await dispatchTranscriptOutcome(msg.text.trim());
            return;
          }

          if (msg.type === 'audio_end') {
            if (typeof msg.hasPendingConfirmation === 'boolean') {
              hasPendingConfirmation = msg.hasPendingConfirmation;
            }

            // If Prisma already finalized & dispatched this turn via server-side VAD, do not duplicate
            if (turnDispatched) {
              audioChunks = [];
              closeGnaniStream();
              return;
            }

            const combined = Buffer.concat(audioChunks);
            audioChunks = [];

            if (gnaniStream) {
              await gnaniStream.finish();
              closeGnaniStream();
            }

            // Check again in case onFinal fired during gnaniStream.finish() flush
            if (turnDispatched) {
              return;
            }

            if (combined.byteLength === 0 && !streamFinalText) {
              sendWsJson(ws, {
                type: 'voice_error',
                code: 'EMPTY_AUDIO',
                error: 'No audio was captured. Please hold or tap the mic and speak clearly.',
              });
              return;
            }

            let finalTranscript = streamFinalText.trim();
            let detectedLanguage = streamFinalLang;

            // If live WS didn't return a final transcript (or wasn't used), fall back to official REST POST /stt/v3 (WAV)
            if (!finalTranscript) {
              const stt = await transcribeWithGnani({
                audioBuffer: combined,
                mimeType: 'audio/pcm',
                language: sessionLang,
              });

              if (!stt.ok) {
                sendWsJson(ws, {
                  type: 'voice_error',
                  code: stt.code,
                  error: stt.error,
                });
                return;
              }
              finalTranscript = stt.transcript;
              detectedLanguage = stt.detectedLanguage;
            }

            turnDispatched = true;
            sendWsJson(ws, {
              type: 'transcript_final',
              text: finalTranscript,
              detectedLanguage,
              latencyMs: streamFinalLatencyMs,
              autoEndpointed: false,
            });

            await dispatchTranscriptOutcome(finalTranscript);
          }
        } catch {
          // Ignore malformed WS frames
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeat);
        audioChunks = [];
        cancelActiveTts();
        closeGnaniStream();
      });
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Voice Khata server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Voice Khata server:', err);
  process.exit(1);
});
