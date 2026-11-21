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
  transcribeWithGnani,
  type GnaniStreamHandle,
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
      let streamFinalText = '';
      let streamFinalLang: string | undefined;

      void getVerifiedVoicePipelineStatus().then((pipelineStatus) => {
        sendWsJson(ws, {
          type: 'stt_ready',
          provider: pipelineStatus.sttProvider,
        });
      });

      const closeGnaniStream = () => {
        if (gnaniStream) {
          gnaniStream.close();
          gnaniStream = null;
        }
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
        if (isBinary) {
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
          };

          if (msg.type === 'session_start' || msg.type === 'audio_start') {
            if (msg.language) sessionLang = msg.language;
            if (typeof msg.hasPendingConfirmation === 'boolean') {
              hasPendingConfirmation = msg.hasPendingConfirmation;
            }
            audioChunks = [];
            streamFinalText = '';
            streamFinalLang = undefined;
            closeGnaniStream();

            // Open live upstream Gnani Prisma v3.0 WebSocket stream when credentials exist
            gnaniStream = openGnaniSttStream({
              language: sessionLang,
              onPartial: (partial) => {
                sendWsJson(ws, { type: 'transcript_partial', text: partial });
              },
              onFinal: (finalText, detectedLang) => {
                streamFinalText = streamFinalText
                  ? `${streamFinalText} ${finalText}`
                  : finalText;
                streamFinalLang = detectedLang;
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
            closeGnaniStream();
            return;
          }

          if (msg.type === 'text_input' && typeof msg.text === 'string') {
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
            const combined = Buffer.concat(audioChunks);
            audioChunks = [];

            if (gnaniStream) {
              await gnaniStream.finish();
              closeGnaniStream();
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

            sendWsJson(ws, {
              type: 'transcript_final',
              text: finalTranscript,
              detectedLanguage,
            });

            await dispatchTranscriptOutcome(finalTranscript);
          }
        } catch {
          // Ignore malformed WS frames
        }
      });

      ws.on('close', () => {
        audioChunks = [];
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
