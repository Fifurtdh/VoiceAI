import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import {
  getVerifiedVoicePipelineStatus,
  getVoicePipelineStatus,
  openGnaniSttStream,
  pcm16ToWavBuffer,
  resetGnaniProbeCache,
  resolveGnaniLanguageCode,
  resolveGnaniStreamConfig,
  streamSynthesizeWithGnani,
  validateVoiceIntentPayload,
} from './voicePipeline';
import { pcm16Base64ToFloat32 } from '../src/utils/voiceClient';

test('pcm16ToWavBuffer generates a valid 44-byte RIFF/WAVE PCM16 header', () => {
  const pcm = Buffer.alloc(1024, 0x12);
  const wav = pcm16ToWavBuffer(pcm, 16000, 1, 16);

  assert.equal(wav.byteLength, 44 + 1024);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + 1024);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wav.readUInt32LE(16), 16); // PCM subchunk size
  assert.equal(wav.readUInt16LE(20), 1); // PCM format
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 16000); // sampleRate
  assert.equal(wav.readUInt32LE(28), 32000); // byteRate
  assert.equal(wav.readUInt16LE(32), 2); // blockAlign
  assert.equal(wav.readUInt16LE(34), 16); // bitsPerSample
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 1024);
});

test('validateVoiceIntentPayload supports ADD_TRANSACTION alias, query_customer_balance, and rejects invalid amounts', () => {
  const tx = validateVoiceIntentPayload(
    {
      intent: 'ADD_TRANSACTION',
      customerName: 'Ramesh',
      amount: 340,
      transactionType: 'CREDIT',
    },
    'Ramesh ka 340 rupaye udhaar likho',
    false,
    new Date(2026, 10, 21)
  );
  assert.equal(tx.kind, 'entry');
  if (tx.kind === 'entry') {
    assert.equal(tx.pending.customerName, 'Ramesh');
    assert.equal(tx.pending.amount, 340);
    assert.equal(tx.pending.direction, 'credit');
    assert.equal(tx.pending.date, '2026-11-21');
  }

  const bal = validateVoiceIntentPayload(
    { intent: 'query_customer_balance', customerName: 'Suresh' },
    'How much does Suresh owe?',
    false
  );
  assert.equal(bal.kind, 'query_customer_balance');
  if (bal.kind === 'query_customer_balance') {
    assert.equal(bal.customerName, 'Suresh');
  }

  const bad = validateVoiceIntentPayload(
    { intent: 'entry', customerName: 'Ramesh', amount: 0, direction: 'credit' },
    'Ramesh 0',
    false
  );
  assert.equal(bad.kind, 'unknown');
});

test('resolveGnaniLanguageCode and resolveGnaniStreamConfig configure code-mixed multilingual streaming', () => {
  assert.equal(resolveGnaniLanguageCode('en'), 'en-IN');
  assert.equal(resolveGnaniLanguageCode('hi'), 'hi-IN');
  assert.equal(resolveGnaniLanguageCode('kn'), 'kn-IN');

  assert.deepEqual(resolveGnaniStreamConfig('en'), {
    languageCode: 'indic-auto',
    format: 'codemix',
  });
  assert.deepEqual(resolveGnaniStreamConfig('hi'), {
    languageCode: 'hi-IN',
    format: 'codemix',
  });
  assert.deepEqual(resolveGnaniStreamConfig('kn'), {
    languageCode: 'kn-IN',
    format: 'codemix',
  });
});

test('pcm16Base64ToFloat32 decodes signed 16-bit LE PCM samples accurately', () => {
  const buf = Buffer.alloc(6);
  buf.writeInt16LE(0, 0);
  buf.writeInt16LE(16384, 2);
  buf.writeInt16LE(-32768, 4);

  const out = pcm16Base64ToFloat32(buf.toString('base64'));
  assert.equal(out.length, 3);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0.5);
  assert.equal(out[2], -1);
  assert.equal(pcm16Base64ToFloat32('').length, 0);
});

test('getVoicePipelineStatus explicitly reports missingCredentials when Gnani key is unset', () => {
  const prevApiKey = process.env.GNANI_API_KEY;
  const prevAccess = process.env.GNANI_ACCESS_KEY;
  const prevSecret = process.env.GNANI_SECRET_KEY;
  try {
    delete process.env.GNANI_API_KEY;
    delete process.env.GNANI_ACCESS_KEY;
    delete process.env.GNANI_SECRET_KEY;
    const status = getVoicePipelineStatus();
    assert.equal(status.gnaniSttConfigured, false);
    assert.equal(status.sttProvider, 'unconfigured');
    assert.equal(status.gnaniAuthState, 'unconfigured');
    assert.ok(status.missingCredentials.includes('GNANI_API_KEY'));
  } finally {
    if (prevApiKey !== undefined) process.env.GNANI_API_KEY = prevApiKey;
    else delete process.env.GNANI_API_KEY;
    if (prevAccess !== undefined) process.env.GNANI_ACCESS_KEY = prevAccess;
    else delete process.env.GNANI_ACCESS_KEY;
    if (prevSecret !== undefined) process.env.GNANI_SECRET_KEY = prevSecret;
    else delete process.env.GNANI_SECRET_KEY;
  }
});

test('getVerifiedVoicePipelineStatus detects auth_failed on HTTP 401 and never leaks credentials', async () => {
  const prevEnv = {
    GNANI_API_KEY: process.env.GNANI_API_KEY,
    GNANI_ACCESS_KEY: process.env.GNANI_ACCESS_KEY,
    GNANI_SECRET_KEY: process.env.GNANI_SECRET_KEY,
    GNANI_STT_WS_URL: process.env.GNANI_STT_WS_URL,
  };

  const server = http.createServer();
  server.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');

  try {
    resetGnaniProbeCache();
    process.env.GNANI_API_KEY = 'secret_invalid_test_token_do_not_leak';
    delete process.env.GNANI_ACCESS_KEY;
    delete process.env.GNANI_SECRET_KEY;
    process.env.GNANI_STT_WS_URL = `ws://127.0.0.1:${addr.port}/stt/v3/stream`;

    const status = await getVerifiedVoicePipelineStatus(true);
    assert.equal(status.gnaniAuthState, 'auth_failed');
    assert.equal(status.gnaniSttConfigured, false);
    assert.equal(status.sttProvider, 'unconfigured');
    assert.ok(status.gnaniError && status.gnaniError.includes('401'));
    assert.equal(
      JSON.stringify(status).includes('secret_invalid_test_token_do_not_leak'),
      false
    );
  } finally {
    resetGnaniProbeCache();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('getVerifiedVoicePipelineStatus and openGnaniSttStream verify live handshake, VAD events, updateSettings, and dual credential headers', async () => {
  const prevEnv = {
    GNANI_API_KEY: process.env.GNANI_API_KEY,
    GNANI_ACCESS_KEY: process.env.GNANI_ACCESS_KEY,
    GNANI_SECRET_KEY: process.env.GNANI_SECRET_KEY,
    GNANI_STT_WS_URL: process.env.GNANI_STT_WS_URL,
  };

  const seenHeaders: Array<http.IncomingHttpHeaders> = [];
  const receivedSettingsUpdates: Array<Record<string, unknown>> = [];
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    seenHeaders.push(req.headers);
    ws.send(JSON.stringify({ type: 'connected', message: 'STT service ready' }));
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (parsed.type === 'update_settings') {
          receivedSettingsUpdates.push(parsed);
          ws.send(JSON.stringify({ type: 'settings_updated' }));
        }
        return;
      }
      ws.send(JSON.stringify({ type: 'speech_start' }));
      ws.send(
        JSON.stringify({
          type: 'transcript',
          text: 'ರಮೇಶ್ 340 ಬಾಕಿ',
          is_final: true,
          detected_language_code: 'kn-IN',
          latency: 283.4,
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');

  try {
    resetGnaniProbeCache();
    delete process.env.GNANI_API_KEY;
    process.env.GNANI_ACCESS_KEY = 'test-access-key';
    process.env.GNANI_SECRET_KEY = 'test-secret-key';
    process.env.GNANI_STT_WS_URL = `ws://127.0.0.1:${addr.port}/stt/v3/stream`;

    const status = await getVerifiedVoicePipelineStatus(true);
    assert.equal(status.gnaniAuthState, 'connected');
    assert.equal(status.gnaniSttConfigured, true);
    assert.equal(status.sttProvider, 'gnani-prisma-v3');
    assert.equal(seenHeaders[0]['accesskey'], 'test-access-key');
    assert.equal(seenHeaders[0]['secretkey'], 'test-secret-key');
    assert.equal(seenHeaders[0]['x-api-key-id'], 'test-access-key');

    let receivedText = '';
    let receivedLang: string | undefined;
    let receivedLatency: number | undefined;
    const vadStates: string[] = [];

    const stream = openGnaniSttStream({
      language: 'kn',
      onVadState: (s) => vadStates.push(s),
      onPartial: () => {},
      onFinal: (text, lang, latencyMs) => {
        receivedText = text;
        receivedLang = lang;
        receivedLatency = latencyMs;
      },
      onError: (err) => {
        throw new Error(`Unexpected stream error: ${err}`);
      },
    });
    assert.ok(stream);
    // Wait briefly for WS open so updateSettings sends immediately
    await new Promise((r) => setTimeout(r, 30));
    stream.updateSettings('hi');
    stream.sendPcmChunk(Buffer.alloc(2048, 1));
    await stream.finish();
    stream.close();

    assert.equal(receivedText, 'ರಮೇಶ್ 340 ಬಾಕಿ');
    assert.equal(receivedLang, 'kn-IN');
    assert.equal(receivedLatency, 283);
    assert.ok(vadStates.includes('speech_start'));
    assert.equal(seenHeaders[1]['language_code'], 'kn-IN');
    assert.equal(seenHeaders[1]['format'], 'codemix');
    assert.equal(seenHeaders[1]['model'], 'prisma-v3.0');
    assert.deepEqual(receivedSettingsUpdates[0], {
      type: 'update_settings',
      language_code: 'hi-IN',
      format: 'codemix',
    });
  } finally {
    resetGnaniProbeCache();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('streamSynthesizeWithGnani streams 24kHz PCM chunks, strips defensive RIFF header, handles 401 auth failure, and supports instant cancel()', async () => {
  const prevEnv = {
    GNANI_API_KEY: process.env.GNANI_API_KEY,
    GNANI_ACCESS_KEY: process.env.GNANI_ACCESS_KEY,
    GNANI_SECRET_KEY: process.env.GNANI_SECRET_KEY,
    GNANI_TTS_WS_URL: process.env.GNANI_TTS_WS_URL,
  };

  let mode: 'happy' | 'auth_fail' | 'slow_for_cancel' = 'happy';
  const captured: {
    payload: Record<string, unknown> | null;
    headers: http.IncomingHttpHeaders | null;
  } = { payload: null, headers: null };

  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (mode === 'auth_fail') {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      captured.headers = req.headers;
      ws.on('message', (raw) => {
        captured.payload = JSON.parse(raw.toString()) as Record<string, unknown>;
        ws.send(JSON.stringify({ type: 'start', request_id: 'req-1' }));

        if (mode === 'slow_for_cancel') {
          const pcm = Buffer.alloc(64, 0x05);
          ws.send(
            JSON.stringify({
              type: 'audio',
              data: { chunk_index: 1, audio: pcm.toString('base64'), is_final: false },
            })
          );
          return;
        }

        // Chunk 1 wrapped in a 44-byte RIFF header to verify defensive stripping
        const chunk1Pcm = Buffer.alloc(64, 0x22);
        const chunk1Wav = pcm16ToWavBuffer(chunk1Pcm, 24000, 1, 16);
        const chunk2Pcm = Buffer.alloc(64, 0x33);

        ws.send(
          JSON.stringify({
            type: 'audio',
            data: { chunk_index: 1, audio: chunk1Wav.toString('base64'), is_final: false },
          })
        );
        ws.send(
          JSON.stringify({
            type: 'audio',
            data: { chunk_index: 2, audio: chunk2Pcm.toString('base64'), is_final: false },
          })
        );
        ws.send(
          JSON.stringify({
            type: 'complete',
            data: { chunk_index: 3, audio: '', is_final: true },
          })
        );
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');

  try {
    process.env.GNANI_API_KEY = 'secret_tts_token_never_leak';
    delete process.env.GNANI_ACCESS_KEY;
    delete process.env.GNANI_SECRET_KEY;
    process.env.GNANI_TTS_WS_URL = `ws://127.0.0.1:${addr.port}/api/v1/tts`;

    // 1. Happy path
    mode = 'happy';
    let startedRate = 0;
    const chunks: Array<{ chunkIndex: number; byteLength: number }> = [];
    let completedCount = 0;

    const handle = streamSynthesizeWithGnani({
      text: 'Ramesh ke 340 rupaye save ho gaye.',
      language: 'hi',
      onStart: ({ sampleRate }) => {
        startedRate = sampleRate;
      },
      onChunk: ({ chunkIndex, audioBase64 }) => {
        chunks.push({
          chunkIndex,
          byteLength: Buffer.from(audioBase64, 'base64').byteLength,
        });
      },
      onComplete: ({ chunkCount }) => {
        completedCount = chunkCount;
      },
      onError: (err) => {
        throw new Error(`Unexpected TTS error: ${err}`);
      },
    });
    await handle.done;

    assert.equal(startedRate, 24000);
    assert.equal(completedCount, 2);
    assert.equal(chunks.length, 2);
    // Chunk 1 had its 44-byte RIFF header stripped back to 64 raw PCM bytes
    assert.equal(chunks[0].byteLength, 64);
    assert.equal(chunks[1].byteLength, 64);
    assert.equal(captured.headers?.['x-api-key-id'], 'secret_tts_token_never_leak');
    assert.equal(captured.payload?.model, 'timbre-v3.0');
    assert.equal(captured.payload?.language, 'hi-IN');

    // 2. Auth failure path
    mode = 'auth_fail';
    let authCode = '';
    let authMsg = '';
    const failHandle = streamSynthesizeWithGnani({
      text: 'Hello',
      language: 'en',
      onChunk: () => {},
      onError: (err, code) => {
        authMsg = err;
        authCode = code;
      },
    });
    await failHandle.done;
    assert.equal(authCode, 'GNANI_AUTH_FAILED');
    assert.equal(authMsg.includes('secret_tts_token_never_leak'), false);

    // 3. Barge-in cancel path
    mode = 'slow_for_cancel';
    let cancelErrFired = false;
    let cancelChunks = 0;
    const cancelHandle = streamSynthesizeWithGnani({
      text: 'Long response to interrupt',
      language: 'en',
      onChunk: () => {
        cancelChunks += 1;
        cancelHandle.cancel();
      },
      onError: () => {
        cancelErrFired = true;
      },
    });
    await cancelHandle.done;
    assert.equal(cancelChunks, 1);
    assert.equal(cancelErrFired, false);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
