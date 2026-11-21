import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp } from './app';
import { openDatabase } from './db';
import {
  computeEnhancedReport,
  computeCustomerIntelligence,
  computeCustomerStatement,
  handleBusinessChatTurn,
  queryCustomerBalancesSql,
  searchTransactionsSmart,
} from './businessIntelligence';
import { computeCustomerBalance } from '../src/utils/ledgerLogic';
import { parseVoiceUtterance } from '../src/utils/voiceParser';
import { buildCsvContent, buildSimplePdfBytes } from '../src/utils/exportReport';
import type { Customer, LedgerEntry } from '../src/types/khata';

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

async function registerStore(
  baseUrl: string,
  opts: { storeName: string; phoneNumber: string }
): Promise<{ cookie: string; storeId: number }> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'VoiceKhata',
    },
    body: JSON.stringify({
      storeName: opts.storeName,
      storeLocation: 'Bengaluru 560001',
      phoneNumber: opts.phoneNumber,
      password: 'password123',
      confirmPassword: 'password123',
    }),
  });
  assert.equal(res.status, 201);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const data = (await res.json()) as { store: { id: number } };
  return { cookie, storeId: data.store.id };
}

function isoDaysAgo(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedRichStoreData(
  db: ReturnType<typeof openDatabase>,
  storeId: number,
  now: Date
) {
  const today = isoDaysAgo(now, 0);
  const yesterday = isoDaysAgo(now, 1);
  const days5 = isoDaysAgo(now, 5);
  const days10 = isoDaysAgo(now, 10);
  const days40 = isoDaysAgo(now, 40);
  const oldCreated = new Date(now.getTime() - 45 * 86400000).toISOString();
  const recentCreated = new Date(now.getTime() - 2 * 86400000).toISOString();

  const insertCust = db.prepare(
    'INSERT INTO customers (id, store_id, name, phone, tag, reminders_opt_in, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertEntry = db.prepare(
    'INSERT INTO ledger_entries (id, store_id, customer_id, customer_name, amount, direction, date, created_at, note, undone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
  );

  // Ramesh: highest pending (3200 credit - 400 payment = 2800), active recently, opted in
  insertCust.run('c-ramesh', storeId, 'Ramesh Kumar', '9845011111', 'Dairy', 1, oldCreated);
  // Sita: overdue >30 days (1800 credit 40 days ago, no payment), opted in
  insertCust.run('c-sita', storeId, 'Sita Devi', '9845022222', 'Main Road', 1, oldCreated);
  // Mahesh: regular payer & added this month (1200 credit, 1200 payment = 0 balance)
  insertCust.run('c-mahesh', storeId, 'Mahesh Rao', '9845033333', 'Regular', 0, recentCreated);

  // Ramesh entries
  insertEntry.run('e-r1', storeId, 'c-ramesh', 'Ramesh Kumar', 1500, 'credit', days10, `${days10}T09:00:00.000Z`, 'Rice bag');
  insertEntry.run('e-r2', storeId, 'c-ramesh', 'Ramesh Kumar', 1200, 'credit', today, `${today}T10:00:00.000Z`, 'Oil tin');
  insertEntry.run('e-r3', storeId, 'c-ramesh', 'Ramesh Kumar', 500, 'credit', today, `${today}T11:30:00.000Z`, 'Sugar & tea');
  insertEntry.run('e-r4', storeId, 'c-ramesh', 'Ramesh Kumar', 400, 'payment', yesterday, `${yesterday}T16:00:00.000Z`, 'UPI cash');

  // Sita entries (40 days ago — overdue!)
  insertEntry.run('e-s1', storeId, 'c-sita', 'Sita Devi', 1800, 'credit', days40, `${days40}T12:00:00.000Z`, 'Monthly ration');

  // Mahesh entries (cleared & regular payer)
  insertEntry.run('e-m1', storeId, 'c-mahesh', 'Mahesh Rao', 700, 'credit', days5, `${days5}T10:00:00.000Z`, 'Atta');
  insertEntry.run('e-m2', storeId, 'c-mahesh', 'Mahesh Rao', 500, 'credit', yesterday, `${yesterday}T11:00:00.000Z`, 'Dal');
  insertEntry.run('e-m3', storeId, 'c-mahesh', 'Mahesh Rao', 700, 'payment', yesterday, `${yesterday}T17:00:00.000Z`, 'Cash');
  insertEntry.run('e-m4', storeId, 'c-mahesh', 'Mahesh Rao', 500, 'payment', today, `${today}T14:00:00.000Z`, 'UPI');
}

test('Khata AI Assistant computes exact deterministic BI metrics, contextual follow-ups, and enforces safety guardrails', async () => {
  const { db, close } = await startTestServer();
  try {
    const now = new Date('2026-05-15T15:00:00.000Z');
    db.prepare(
      'INSERT INTO users (id, phone_number, password_hash, recovery_code_hash, created_at) VALUES (1, ?, ?, ?, ?)'
    ).run('9876500001', '$2a$10$hash', '$2a$10$hash', now.toISOString());
    db.prepare(
      'INSERT INTO stores (id, user_id, store_name, store_location, language, created_at) VALUES (1, 1, ?, ?, ?, ?)'
    ).run('Shree Ganesh Kirana', 'Bengaluru', 'en', now.toISOString());
    seedRichStoreData(db, 1, now);

    // 1. Today's udhaar: Ramesh 1200 + 500 = 1700
    const q1 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { message: 'How much udhaar did I give today?', skipAiPolish: true },
      now
    );
    assert.equal(q1.assistantMessage.metadata?.intent, 'today_udhaar');
    assert.match(q1.assistantMessage.content, /1,700/);
    const sessionId = q1.session.id;

    // 2. Today's payments: Mahesh 500
    const q2 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'How much payment did I collect today?', skipAiPolish: true },
      now
    );
    assert.equal(q2.assistantMessage.metadata?.intent, 'today_collection');
    assert.match(q2.assistantMessage.content, /500/);

    // 3. Total outstanding: Ramesh 2800 + Sita 1800 = 4600
    const q3 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'What is my total outstanding balance?', skipAiPolish: true },
      now
    );
    assert.equal(q3.assistantMessage.metadata?.intent, 'total_outstanding');
    assert.match(q3.assistantMessage.content, /4,600/);

    // 4. Highest outstanding customer + contextual follow-up ("Show his last 5 transactions")
    const q4 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'Who has the highest outstanding balance?', skipAiPolish: true },
      now
    );
    assert.equal(q4.assistantMessage.metadata?.intent, 'highest_outstanding_customer');
    assert.match(q4.assistantMessage.content, /Ramesh Kumar/);
    assert.match(q4.assistantMessage.content, /2,800/);

    const q5 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'Show his last 5 transactions', skipAiPolish: true },
      now
    );
    assert.equal(q5.assistantMessage.metadata?.intent, 'customer_history');
    assert.equal(q5.assistantMessage.metadata?.context?.lastCustomerName, 'Ramesh Kumar');
    assert.ok((q5.assistantMessage.metadata?.table?.rows.length ?? 0) === 4);

    // 5. Overdue > 30 days -> Sita Devi
    const q6 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'Which customers have not paid in the last 30 days?', skipAiPolish: true },
      now
    );
    assert.equal(q6.assistantMessage.metadata?.intent, 'overdue_customers');
    assert.match(q6.assistantMessage.content, /1,800/);
    assert.equal(q6.assistantMessage.metadata?.table?.rows[0][0], 'Sita Devi');

    // 6. Profit refusal guardrail (never fabricates profit without cost data)
    const q7 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'What is my net profit this month?', skipAiPolish: true },
      now
    );
    assert.equal(q7.assistantMessage.metadata?.intent, 'profit_refusal');
    assert.match(q7.assistantMessage.content, /cost|profit/i);

    // 7. Write refusal guardrail (chatbot cannot directly mutate financial ledger)
    const q8 = await handleBusinessChatTurn(
      db,
      1,
      'Shree Ganesh Kirana',
      'en',
      { sessionId, message: 'Delete Ramesh entry from the database', skipAiPolish: true },
      now
    );
    assert.equal(q8.assistantMessage.metadata?.intent, 'write_refusal');
    const entryCount = db
      .prepare('SELECT COUNT(*) as cnt FROM ledger_entries WHERE store_id = 1')
      .get() as { cnt: number };
    assert.equal(entryCount.cnt, 9);
  } finally {
    await close();
  }
});

test('Enhanced reports, Customer intelligence, Smart search, and Statements compute exact numbers', async () => {
  const { db, close } = await startTestServer();
  try {
    const now = new Date('2026-05-15T15:00:00.000Z');
    db.prepare(
      'INSERT INTO users (id, phone_number, password_hash, recovery_code_hash, created_at) VALUES (1, ?, ?, ?, ?)'
    ).run('9876500002', '$2a$10$hash', '$2a$10$hash', now.toISOString());
    db.prepare(
      'INSERT INTO stores (id, user_id, store_name, store_location, language, created_at) VALUES (1, 1, ?, ?, ?, ?)'
    ).run('Shree Ganesh Kirana', 'Bengaluru', 'en', now.toISOString());
    seedRichStoreData(db, 1, now);

    // Daily report
    const daily = computeEnhancedReport(db, 1, { period: 'daily' }, now);
    assert.equal(daily.totalCredit, 1700);
    assert.equal(daily.totalPayments, 500);
    assert.equal(daily.entryCount, 3);
    assert.equal(daily.totalOutstanding, 4600);
    assert.ok(daily.accountingNote.toLowerCase().includes('profit'));

    // Weekly report (last 7 days: May 9 - May 15):
    // Credits: Ramesh 1200 + 500, Mahesh 700 (days5) + 500 (yesterday) = 2900
    // Payments: Ramesh 400 (yesterday), Mahesh 700 (yesterday) + 500 (today) = 1600
    // New customers added in last 7 days: Mahesh (2 days ago) = 1
    const weekly = computeEnhancedReport(db, 1, { period: 'weekly' }, now);
    assert.equal(weekly.totalCredit, 2900);
    assert.equal(weekly.totalPayments, 1600);
    assert.equal(weekly.newCustomersAdded, 1);
    assert.equal(weekly.dailySeries.length, 7);
    assert.equal(weekly.topCustomersByOutstanding[0].customerName, 'Ramesh Kumar');

    // Customer intelligence smart queries
    const highPending = computeCustomerIntelligence(
      db,
      1,
      'Show customers with more than 2,000 rupees pending',
      now
    );
    assert.equal(highPending.customers.length, 1);
    assert.equal(highPending.customers[0].name, 'Ramesh Kumar');

    const overdue30 = computeCustomerIntelligence(
      db,
      1,
      'Who has not paid for 30 days?',
      now
    );
    assert.equal(overdue30.customers.length, 1);
    assert.equal(overdue30.customers[0].name, 'Sita Devi');

    const addedThisMonth = computeCustomerIntelligence(
      db,
      1,
      'Customers added this month',
      now
    );
    assert.equal(addedThisMonth.customers.length, 1);
    assert.equal(addedThisMonth.customers[0].name, 'Mahesh Rao');

    // Customer statement with running balance
    const stmt = computeCustomerStatement(db, 1, 'c-ramesh', {}, now);
    assert.ok(stmt);
    assert.equal(stmt.summary.totalCredit, 3200);
    assert.equal(stmt.summary.totalPayments, 400);
    assert.equal(stmt.summary.outstanding, 2800);
    assert.equal(stmt.entries.length, 4);
    // Newest entry running balance equals total outstanding
    assert.equal(stmt.entries[0].runningBalance, 2800);

    // Smart transaction search
    const yestPayments = searchTransactionsSmart(
      db,
      1,
      "Show yesterday's payments",
      {},
      now
    );
    assert.equal(yestPayments.entries.length, 2); // Ramesh 400 + Mahesh 700
    assert.equal(yestPayments.totalPayments, 1100);

    const above1000 = searchTransactionsSmart(
      db,
      1,
      'Find entries above 1,000 rupees',
      {},
      now
    );
    assert.ok(above1000.entries.every((e) => e.amount > 1000));
    assert.equal(above1000.entries.length, 3); // 1500, 1200, 1800
  } finally {
    await close();
  }
});

test('End-to-end API: duplicate guard, idempotency, auditable reversal, reminders, and strict cross-store isolation', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const storeA = await registerStore(baseUrl, {
      storeName: 'Store Alpha',
      phoneNumber: '9880011111',
    });
    const storeB = await registerStore(baseUrl, {
      storeName: 'Store Beta',
      phoneNumber: '9880022222',
    });

    const headersA = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'VoiceKhata',
      Cookie: storeA.cookie,
    };
    const headersB = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'VoiceKhata',
      Cookie: storeB.cookie,
    };

    // Create customer in Store A
    const custRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        name: 'Ramesh Kumar',
        phone: '9845012345',
        remindersOptIn: true,
      }),
    });
    assert.equal(custRes.status, 201);
    const { customer } = (await custRes.json()) as { customer: Customer };

    // 1. Idempotent entry creation with clientRequestId
    const reqId = 'req-unique-1001';
    const e1Res = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 500,
        direction: 'credit',
        date: '2026-05-15',
        clientRequestId: reqId,
      }),
    });
    assert.equal(e1Res.status, 201);
    const { entry: entry1 } = (await e1Res.json()) as { entry: LedgerEntry };

    // Same clientRequestId returns deduplicated 200 without inserting second row
    const e1DupReq = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 500,
        direction: 'credit',
        date: '2026-05-15',
        clientRequestId: reqId,
      }),
    });
    assert.equal(e1DupReq.status, 200);
    const dedupData = (await e1DupReq.json()) as { deduplicated: boolean; entry: LedgerEntry };
    assert.equal(dedupData.deduplicated, true);
    assert.equal(dedupData.entry.id, entry1.id);

    // 2. Duplicate warning guard returns 409 POTENTIAL_DUPLICATE
    const dupGuardRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 500,
        direction: 'credit',
        date: '2026-05-15',
        checkDuplicate: true,
      }),
    });
    assert.equal(dupGuardRes.status, 409);
    const dupPayload = (await dupGuardRes.json()) as { code: string; duplicates: unknown[] };
    assert.equal(dupPayload.code, 'POTENTIAL_DUPLICATE');
    assert.equal(dupPayload.duplicates.length, 1);

    // Explicitly confirming duplicate saves successfully
    const confirmedDupRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 500,
        direction: 'credit',
        date: '2026-05-15',
        checkDuplicate: true,
        confirmDuplicate: true,
      }),
    });
    assert.equal(confirmedDupRes.status, 201);

    // 3. Auditable reversal with replacement (500 -> 450)
    const revRes = await fetch(`${baseUrl}/api/entries/${entry1.id}/reverse`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        reason: 'Wrong amount spoken',
        replacementAmount: 450,
        replacementDirection: 'credit',
      }),
    });
    assert.equal(revRes.status, 200);
    const revData = (await revRes.json()) as {
      reversedEntry: LedgerEntry;
      replacementEntry: LedgerEntry;
    };
    assert.equal(revData.reversedEntry.undone, true);
    assert.equal(revData.replacementEntry.amount, 450);
    assert.equal(revData.replacementEntry.reversalOfId, entry1.id);

    // Audit log captured create + correction
    const auditRes = await fetch(`${baseUrl}/api/audit-logs`, { headers: headersA });
    assert.equal(auditRes.status, 200);
    const { logs } = (await auditRes.json()) as { logs: Array<{ action: string }> };
    assert.ok(logs.some((l) => l.action === 'entry_corrected'));
    assert.ok(logs.some((l) => l.action === 'entry_created'));

    // 4. Smart Payment Reminders workflow
    const genRes = await fetch(`${baseUrl}/api/reminders/generate`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        language: 'hinglish',
        useAiPolish: false,
      }),
    });
    assert.equal(genRes.status, 200);
    const genData = (await genRes.json()) as { amountDue: number; message: string };
    // Active entries for Ramesh: 500 (confirmed dup) + 450 (replacement) = 950
    assert.equal(genData.amountDue, 950);
    assert.match(genData.message, /950/);

    const logRemRes = await fetch(`${baseUrl}/api/reminders`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        customerId: customer.id,
        message: genData.message,
        language: 'hinglish',
        channel: 'whatsapp',
        status: 'marked_sent',
      }),
    });
    assert.equal(logRemRes.status, 201);
    const { reminder } = (await logRemRes.json()) as { reminder: { id: string } };

    // Overview now warns about recent 24h reminder
    const overviewRes = await fetch(`${baseUrl}/api/reminders/overview?sort=amount`, {
      headers: headersA,
    });
    assert.equal(overviewRes.status, 200);
    const overview = (await overviewRes.json()) as {
      pendingCustomers: Array<{ recentReminderWarning: boolean }>;
      history: Array<{ id: string }>;
    };
    assert.equal(overview.pendingCustomers[0].recentReminderWarning, true);
    assert.equal(overview.history.length, 1);

    // Record customer response
    const patchRemRes = await fetch(`${baseUrl}/api/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: headersA,
      body: JSON.stringify({
        status: 'customer_responded',
        customerResponse: 'Will pay ₹950 tomorrow evening',
      }),
    });
    assert.equal(patchRemRes.status, 200);

    // 5. Chat session in Store A
    const chatRes = await fetch(`${baseUrl}/api/chat/sessions`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ title: 'Daily Check' }),
    });
    assert.equal(chatRes.status, 201);
    const { session: chatSessionA } = (await chatRes.json()) as { session: { id: string } };

    // 6. STRICT CROSS-STORE ISOLATION CHECKS (Store B must NEVER see Store A data)
    const stmtB = await fetch(`${baseUrl}/api/customers/${customer.id}/statement`, {
      headers: headersB,
    });
    assert.equal(stmtB.status, 404);

    const chatMsgB = await fetch(
      `${baseUrl}/api/chat/sessions/${chatSessionA.id}/messages`,
      { headers: headersB }
    );
    assert.equal(chatMsgB.status, 404);

    const patchRemB = await fetch(`${baseUrl}/api/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: headersB,
      body: JSON.stringify({ customerResponse: 'Tamper attempt' }),
    });
    assert.equal(patchRemB.status, 404);

    const revB = await fetch(`${baseUrl}/api/entries/${entry1.id}/reverse`, {
      method: 'POST',
      headers: headersB,
      body: JSON.stringify({ reason: 'Unauthorized' }),
    });
    assert.equal(revB.status, 404);

    const intelB = await fetch(`${baseUrl}/api/customers/intelligence`, {
      headers: headersB,
    });
    const intelBData = (await intelB.json()) as { customers: unknown[] };
    assert.equal(intelBData.customers.length, 0);

    const auditB = await fetch(`${baseUrl}/api/audit-logs`, { headers: headersB });
    const auditBData = (await auditB.json()) as { logs: unknown[] };
    assert.equal(auditBData.logs.length, 0);
  } finally {
    await close();
  }
});

test('VoiceParser handles multi-number spoken corrections and committed-entry reversal commands', () => {
  // Multi-number spoken correction picks final corrected amount (450, not 500)
  const corr = parseVoiceUtterance('Nahi, 500 nahi, 450 rupaye likho', {
    hasPendingConfirmation: true,
  });
  assert.equal(corr.kind, 'correction');
  if (corr.kind === 'correction') {
    assert.equal(corr.amount, 450);
  }

  // Committed-entry voice reversal
  const rev1 = parseVoiceUtterance('Last transaction cancel karo');
  assert.equal(rev1.kind, 'reverse_last_entry');

  const rev2 = parseVoiceUtterance('Ramesh ka pichla payment galat tha');
  assert.equal(rev2.kind, 'reverse_last_entry');
  if (rev2.kind === 'reverse_last_entry') {
    assert.equal(rev2.customerName, 'Ramesh');
    assert.equal(rev2.direction, 'payment');
  }
});

test('Export utilities build valid PDF 1.4 binaries and UTF-8 BOM CSV files', () => {
  const csv = buildCsvContent(
    ['Date', 'Customer', 'Note', 'Amount'],
    [['2026-05-15', 'Ramesh, Jr.', 'Said "paid"', 450]]
  );
  assert.ok(csv.startsWith('\uFEFFDate,Customer,Note,Amount\r\n'));
  assert.ok(csv.includes('"Ramesh, Jr.","Said ""paid""",450'));

  const pdfBytes = buildSimplePdfBytes({
    shopName: 'Shree Ganesh Kirana',
    title: 'Daily Business Report',
    periodLabel: '2026-05-15',
    generatedAt: '2026-05-15 15:00',
    summaryLines: [
      { label: 'Total Udhaar Given', value: 'Rs. 1,700' },
      { label: 'Total Payment Collected', value: 'Rs. 500' },
    ],
    tableHeaders: ['Date', 'Customer', 'Type', 'Amount'],
    tableRows: [['2026-05-15', 'Ramesh Kumar', 'Udhaar', 'Rs. 1,200']],
    footerNote: 'Accounting note: Khata cashflow only; profit is not estimated.',
  });
  const pdfText = new TextDecoder().decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4'));
  assert.ok(pdfText.includes('%%EOF'));
  assert.ok(pdfText.includes('Shree Ganesh Kirana'));
  assert.ok(pdfText.includes('Ramesh Kumar'));
});

test('SQL balance aggregation nets credit and payment (500 - 100 = 400) and guards undone + reversal_of_id against double-counting', async () => {
  const { baseUrl, db, close } = await startTestServer();
  try {
    const store = await registerStore(baseUrl, {
      storeName: 'Mallikarjun Test Store',
      phoneNumber: '9880099991',
    });
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'VoiceKhata',
      Cookie: store.cookie,
    };

    // 1. Create customer Mallikarjun
    const custRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Mallikarjun', phone: '9845011111' }),
    });
    assert.equal(custRes.status, 201);
    const { customer } = (await custRes.json()) as { customer: Customer };

    // 2. Record ₹500 credit and ₹100 payment -> net balance MUST be ₹400
    const e1Res = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 500,
        direction: 'credit',
        date: '2026-11-21',
      }),
    });
    assert.equal(e1Res.status, 201);
    const { entry: creditEntry } = (await e1Res.json()) as { entry: LedgerEntry };

    const e2Res = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        amount: 100,
        direction: 'payment',
        date: '2026-11-21',
      }),
    });
    assert.equal(e2Res.status, 201);

    const sqlMap = queryCustomerBalancesSql(db, store.storeId);
    assert.equal(sqlMap.get(customer.id)?.totalCredit, 500);
    assert.equal(sqlMap.get(customer.id)?.totalPayments, 100);
    assert.equal(sqlMap.get(customer.id)?.outstanding, 400);

    const intel = computeCustomerIntelligence(db, store.storeId);
    assert.equal(intel.insights.totalOutstanding, 400);
    assert.equal(intel.customers[0].outstanding, 400);

    const stmt = computeCustomerStatement(db, store.storeId, customer.id);
    assert.equal(stmt?.summary.outstanding, 400);

    const rep = computeEnhancedReport(db, store.storeId, { period: 'daily' }, new Date('2026-11-21T12:00:00Z'));
    assert.equal(rep.totalOutstanding, 400);

    // 3. Reverse ₹500 credit and replace with ₹450 -> net balance MUST be ₹350 (450 - 100)
    const revRes = await fetch(`${baseUrl}/api/entries/${creditEntry.id}/reverse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'Corrected amount',
        replacementAmount: 450,
        replacementDirection: 'credit',
      }),
    });
    assert.equal(revRes.status, 200);

    assert.equal(queryCustomerBalancesSql(db, store.storeId).get(customer.id)?.outstanding, 350);

    // 4. Attempting to restore superseded original entry via /undo MUST fail with 409
    const undoAttempt = await fetch(`${baseUrl}/api/entries/${creditEntry.id}/undo`, {
      method: 'POST',
      headers,
    });
    assert.equal(undoAttempt.status, 409);

    // 5. Even if an anomalous DB state had undone=0 on the superseded original, SQL & frontend helpers still prevent double-counting
    db.prepare('UPDATE ledger_entries SET undone = 0 WHERE id = ?').run(creditEntry.id);
    assert.equal(queryCustomerBalancesSql(db, store.storeId).get(customer.id)?.outstanding, 350);
    assert.equal(computeCustomerIntelligence(db, store.storeId).insights.totalOutstanding, 350);
    assert.equal(computeCustomerStatement(db, store.storeId, customer.id)?.summary.outstanding, 350);

    const khataRes = await fetch(`${baseUrl}/api/khata`, { headers });
    const khataData = (await khataRes.json()) as { entries: LedgerEntry[] };
    assert.equal(computeCustomerBalance(customer.id, khataData.entries), 350);
  } finally {
    await close();
  }
});
