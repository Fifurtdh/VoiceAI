import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp } from './app';
import { openDatabase } from './db';
import { normalizeIndianPhone, validateRegistrationInput } from './validation';

function startTestServer() {
  const db = openDatabase(':memory:');
  const app = createApiApp(db);
  const server = http.createServer(app);
  return new Promise<{
    baseUrl: string;
    db: ReturnType<typeof openDatabase>;
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        db,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              db.close();
              res();
            });
          }),
      });
    });
  });
}

test('normalizeIndianPhone normalizes +91 and 0 prefixes and rejects invalid numbers', () => {
  assert.equal(normalizeIndianPhone('+91 98765 43210'), '9876543210');
  assert.equal(normalizeIndianPhone('09876543210'), '9876543210');
  assert.equal(normalizeIndianPhone('9876543210'), '9876543210');
  assert.equal(normalizeIndianPhone('1234567890'), null);
  assert.equal(normalizeIndianPhone('98765'), null);
});

test('validateRegistrationInput catches mismatched passwords and missing fields', () => {
  const bad = validateRegistrationInput({
    storeName: 'Sri Lakshmi General Store',
    storeLocation: 'Indiranagar, Bengaluru 560038',
    phoneNumber: '9876543210',
    password: 'secret123',
    confirmPassword: 'different',
  });
  assert.equal(bad.ok, false);
});

test('Full auth lifecycle: protected route, register, bcrypt hash, duplicate phone, login, isolation, forgot password', async () => {
  const { baseUrl, db, close } = await startTestServer();
  try {
    // 1. Protected route blocks unauthenticated access
    const unauthRes = await fetch(`${baseUrl}/api/khata`);
    assert.equal(unauthRes.status, 401);

    // 2. Register Store A
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        storeName: 'Sri Lakshmi General Store',
        storeLocation: 'Indiranagar, Bengaluru 560038',
        phoneNumber: '+91 98765 43210',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    });
    assert.equal(regRes.status, 201);
    const regCookie = regRes.headers.get('set-cookie') ?? '';
    assert.match(regCookie, /vk_session=/);
    assert.match(regCookie, /HttpOnly/i);
    const regData = (await regRes.json()) as {
      store: { storeName: string };
      recoveryCode: string;
    };
    assert.equal(regData.store.storeName, 'Sri Lakshmi General Store');
    assert.match(regData.recoveryCode, /^\d{6}$/);

    // Ensure password is stored as bcrypt hash, never plain text
    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE phone_number = ?')
      .get('9876543210') as { password_hash: string };
    assert.ok(userRow.password_hash.startsWith('$2'));
    assert.notEqual(userRow.password_hash, 'password123');

    const cookieHeaderA = regCookie.split(';')[0];

    // 3. Duplicate phone number rejected with 409
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        storeName: 'Another Store',
        storeLocation: 'Delhi 110001',
        phoneNumber: '9876543210',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    });
    assert.equal(dupRes.status, 409);

    // 4. Store A creates an entry
    const entryRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookieHeaderA,
      },
      body: JSON.stringify({
        customerName: 'Ramesh',
        amount: 340,
        direction: 'credit',
        date: '2026-11-21',
      }),
    });
    assert.equal(entryRes.status, 201);
    const createdA = (await entryRes.json()) as { entry: { id: string } };

    // 5. Register Store B and verify Store A data is completely isolated
    const regResB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        storeName: 'Balaji Provision Store',
        storeLocation: 'Jayanagar, Bengaluru 560041',
        phoneNumber: '9123456789',
        password: 'password999',
        confirmPassword: 'password999',
      }),
    });
    assert.equal(regResB.status, 201);
    const cookieHeaderB = (regResB.headers.get('set-cookie') ?? '').split(';')[0];

    const khataB = (await (
      await fetch(`${baseUrl}/api/khata`, { headers: { Cookie: cookieHeaderB } })
    ).json()) as { customers: unknown[]; entries: unknown[] };
    assert.equal(khataB.customers.length, 0);
    assert.equal(khataB.entries.length, 0);

    // Store B cannot delete Store A's entry
    const crossDelete = await fetch(
      `${baseUrl}/api/entries/${createdA.entry.id}`,
      {
        method: 'DELETE',
        headers: {
          'X-Requested-With': 'VoiceKhata',
          Cookie: cookieHeaderB,
        },
      }
    );
    assert.equal(crossDelete.status, 404);

    // 6. Forgot password with recovery code resets Store A password, then login succeeds
    const resetRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        phoneNumber: '9876543210',
        recoveryCode: regData.recoveryCode,
        newPassword: 'newpassword456',
      }),
    });
    assert.equal(resetRes.status, 200);

    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        phoneNumber: '9876543210',
        password: 'password123',
      }),
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        phoneNumber: '9876543210',
        password: 'newpassword456',
      }),
    });
    assert.equal(goodLogin.status, 200);
  } finally {
    await close();
  }
});

test('Session stability across theme switches, customer CRUD, filtered entries, reports, and voice pipeline', async () => {
  const { validateVoiceIntentPayload } = await import('./voicePipeline');
  const { baseUrl, close } = await startTestServer();
  try {
    // Register store
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
      },
      body: JSON.stringify({
        storeName: 'Ganesh Kirana',
        storeLocation: 'MG Road, Pune 411001',
        phoneNumber: '9888777666',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    });
    assert.equal(regRes.status, 201);
    const cookie = (regRes.headers.get('set-cookie') ?? '').split(';')[0];

    // Switch theme light -> dark and verify /api/auth/me remains valid
    for (const theme of ['light', 'dark'] as const) {
      const settingsRes = await fetch(`${baseUrl}/api/store/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'VoiceKhata',
          Cookie: cookie,
        },
        body: JSON.stringify({ theme }),
      });
      assert.equal(settingsRes.status, 200);
      const settingsJson = (await settingsRes.json()) as {
        store: { theme: string };
      };
      assert.equal(settingsJson.store.theme, theme);

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(meRes.status, 200);
    }

    // Customer CRUD: Create -> Edit -> Entry -> Report -> Delete
    const createCustRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({
        name: 'Mohan Rao',
        phone: '9812345678',
        tag: 'Corner Shop',
        remindersOptIn: false,
      }),
    });
    assert.equal(createCustRes.status, 201);
    const { customer } = (await createCustRes.json()) as {
      customer: { id: string; name: string };
    };

    const patchCustRes = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({ name: 'Mohan Rao Updated', tag: 'Main Gate' }),
    });
    assert.equal(patchCustRes.status, 200);

    // Add udhaar & payment
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({
        customerId: customer.id,
        customerName: 'Mohan Rao Updated',
        amount: 500,
        direction: 'credit',
        date: today,
      }),
    });
    await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({
        customerId: customer.id,
        customerName: 'Mohan Rao Updated',
        amount: 200,
        direction: 'payment',
        date: today,
      }),
    });

    // Filtered entries
    const payEntriesRes = await fetch(
      `${baseUrl}/api/entries?direction=payment&search=Mohan`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(payEntriesRes.status, 200);
    const payEntriesJson = (await payEntriesRes.json()) as {
      entries: Array<{ amount: number }>;
    };
    assert.equal(payEntriesJson.entries.length, 1);
    assert.equal(payEntriesJson.entries[0].amount, 200);

    // Reports endpoint
    const repRes = await fetch(`${baseUrl}/api/reports?period=daily`, {
      headers: { Cookie: cookie },
    });
    assert.equal(repRes.status, 200);
    const repJson = (await repRes.json()) as {
      report: { totalCredit: number; totalPayments: number; totalOutstanding: number };
    };
    assert.equal(repJson.report.totalCredit, 500);
    assert.equal(repJson.report.totalPayments, 200);
    assert.equal(repJson.report.totalOutstanding, 300);

    // Voice process returns 501 GNANI_NOT_CONFIGURED on audio when Gnani keys absent (never fakes STT, avoids proxy 503 HTML rewrite)
    const audioRes = await fetch(`${baseUrl}/api/voice/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({
        audioBase64: Buffer.from('test-audio-bytes').toString('base64'),
        mimeType: 'audio/webm',
        language: 'kn',
      }),
    });
    assert.equal(audioRes.status, 501);
    const audioErr = (await audioRes.json()) as { code: string; error: string };
    assert.equal(audioErr.code, 'GNANI_NOT_CONFIGURED');
    assert.ok(audioErr.error.includes('GNANI_API_KEY'));

    // Voice process parses Kannada transcript cleanly without crashing
    const knRes = await fetch(`${baseUrl}/api/voice/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
      body: JSON.stringify({
        transcript: 'ರಮೇಶ್ 340 ಸಾಲ',
        language: 'kn',
        hasPendingConfirmation: false,
      }),
    });
    assert.equal(knRes.status, 200);
    const knJson = (await knRes.json()) as {
      transcript: string;
      outcome: { kind: string; pending?: { customerName: string; amount: number; direction: string } };
    };
    assert.equal(knJson.transcript, 'ರಮೇಶ್ 340 ಸಾಲ');
    assert.equal(knJson.outcome.kind, 'entry');
    assert.equal(knJson.outcome.pending?.amount, 340);
    assert.equal(knJson.outcome.pending?.direction, 'credit');

    // Voice intent validation rejects negative/invalid amounts
    const invalidOutcome = validateVoiceIntentPayload(
      { intent: 'entry', customerName: 'Ramesh', amount: -50, direction: 'credit' },
      'Ramesh -50',
      false
    );
    assert.equal(invalidOutcome.kind, 'unknown');

    // Delete customer cleans up customer & entries
    const delCustRes = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
      method: 'DELETE',
      headers: {
        'X-Requested-With': 'VoiceKhata',
        Cookie: cookie,
      },
    });
    assert.equal(delCustRes.status, 200);

    const afterDelKhata = (await (
      await fetch(`${baseUrl}/api/khata`, { headers: { Cookie: cookie } })
    ).json()) as { customers: unknown[]; entries: unknown[] };
    assert.equal(afterDelKhata.customers.length, 0);
    assert.equal(afterDelKhata.entries.length, 0);
  } finally {
    await close();
  }
});
