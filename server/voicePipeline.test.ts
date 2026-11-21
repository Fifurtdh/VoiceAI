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
  validateVoiceIntentPayload,
} from './voicePipeline';

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

test('resolveGnaniLanguageCode maps supported shopkeeper languages cleanly', () => {
  assert.equal(resolveGnaniLanguageCode('en'), 'en-IN');
  assert.equal(resolveGnaniLanguageCode('hi'), 'hi-IN');
  assert.equal(resolveGnaniLanguageCode('kn'), 'kn-IN');
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

test('getVerifiedVoicePipelineStatus and openGnaniSttStream verify live handshake and dual credential headers', async () => {
  const prevEnv = {
    GNANI_API_KEY: process.env.GNANI_API_KEY,
    GNANI_ACCESS_KEY: process.env.GNANI_ACCESS_KEY,
    GNANI_SECRET_KEY: process.env.GNANI_SECRET_KEY,
    GNANI_STT_WS_URL: process.env.GNANI_STT_WS_URL,
  };

  const seenHeaders: Array<http.IncomingHttpHeaders> = [];
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    seenHeaders.push(req.headers);
    ws.send(JSON.stringify({ type: 'connected', message: 'STT service ready' }));
    ws.on('message', () => {
      ws.send(
        JSON.stringify({
          type: 'transcript',
          text: 'ರಮೇಶ್ 340 ಬಾಕಿ',
          is_final: true,
          detected_language_code: 'kn-IN',
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
    const stream = openGnaniSttStream({
      language: 'kn',
      onPartial: () => {},
      onFinal: (text, lang) => {
        receivedText = text;
        receivedLang = lang;
      },
      onError: (err) => {
        throw new Error(`Unexpected stream error: ${err}`);
      },
    });
    assert.ok(stream);
    stream.sendPcmChunk(Buffer.alloc(2048, 1));
    await stream.finish();
    stream.close();

    assert.equal(receivedText, 'ರಮೇಶ್ 340 ಬಾಕಿ');
    assert.equal(receivedLang, 'kn-IN');
    assert.equal(seenHeaders[1]['language_code'], 'kn-IN');
    assert.equal(seenHeaders[1]['model'], 'prisma-v3.0');
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
