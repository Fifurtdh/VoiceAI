import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleSeedData } from './ledgerLogic';
import {
  extractAmount,
  findMatchingCustomers,
  parseSpokenNumberSequence,
  parseVoiceUtterance,
} from './voiceParser';
import { TRANSLATIONS } from './i18n';

test('parseVoiceUtterance parses credit entry "Ramesh ka 340 rupaye udhaar likho."', () => {
  const res = parseVoiceUtterance('Ramesh ka 340 rupaye udhaar likho.', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res.kind, 'entry');
  if (res.kind === 'entry') {
    assert.equal(res.pending.customerName, 'Ramesh');
    assert.equal(res.pending.amount, 340);
    assert.equal(res.pending.direction, 'credit');
    assert.equal(res.pending.date, '2026-11-21');
  }
});

test('parseVoiceUtterance parses English command "Add 500 rupees credit to Ramesh."', () => {
  const res = parseVoiceUtterance('Add 500 rupees credit to Ramesh.', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res.kind, 'entry');
  if (res.kind === 'entry') {
    assert.equal(res.pending.customerName, 'Ramesh');
    assert.equal(res.pending.amount, 500);
    assert.equal(res.pending.direction, 'credit');
  }
});

test('parseVoiceUtterance parses spoken English numbers "Ramesh ka three hundred forty rupees udhaar"', () => {
  const res = parseVoiceUtterance('Ramesh ka three hundred forty rupees udhaar', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res.kind, 'entry');
  if (res.kind === 'entry') {
    assert.equal(res.pending.customerName, 'Ramesh');
    assert.equal(res.pending.amount, 340);
    assert.equal(res.pending.direction, 'credit');
  }
});

test('parseVoiceUtterance parses spoken Hindi numbers "Ramesh ka teen sau chaalis rupaye udhaar"', () => {
  const res = parseVoiceUtterance('Ramesh ka teen sau chaalis rupaye udhaar', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res.kind, 'entry');
  if (res.kind === 'entry') {
    assert.equal(res.pending.customerName, 'Ramesh');
    assert.equal(res.pending.amount, 340);
    assert.equal(res.pending.direction, 'credit');
  }
});

test('parseVoiceUtterance parses spoken Hindi payment "Suresh ne paanch sau rupaye diye"', () => {
  const res = parseVoiceUtterance('Suresh ne paanch sau rupaye diye', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res.kind, 'entry');
  if (res.kind === 'entry') {
    assert.equal(res.pending.customerName, 'Suresh');
    assert.equal(res.pending.amount, 500);
    assert.equal(res.pending.direction, 'payment');
  }
});

test('parseSpokenNumberSequence & extractAmount support dedh sau, dhai sau, do hazaar, and avoid "do" verb trap', () => {
  assert.equal(parseSpokenNumberSequence(['dedh', 'sau']), 150);
  assert.equal(parseSpokenNumberSequence(['dhai', 'sau']), 250);
  assert.equal(parseSpokenNumberSequence(['do', 'hazaar', 'ek', 'sau']), 2100);
  assert.equal(extractAmount('payment kar do'), null);
});

test('parseVoiceUtterance handles live corrections "nahi, 430" and "payment kar do" when sheet is open', () => {
  const res = parseVoiceUtterance('nahi, 430', {
    hasPendingConfirmation: true,
  });
  assert.equal(res.kind, 'correction');
  if (res.kind === 'correction') {
    assert.equal(res.amount, 430);
  }

  const dirRes = parseVoiceUtterance('payment kar do', {
    hasPendingConfirmation: true,
  });
  assert.equal(dirRes.kind, 'correction');
  if (dirRes.kind === 'correction') {
    assert.equal(dirRes.amount, undefined);
    assert.equal(dirRes.direction, 'payment');
  }
});

test('parseVoiceUtterance recognizes daily totals queries', () => {
  assert.equal(parseVoiceUtterance('aaj kitna mila?').kind, 'query_today_summary');
  assert.equal(parseVoiceUtterance('Aaj kitna udhaar gaya?').kind, 'query_today_summary');
});

test('parseVoiceUtterance recognizes customer balance queries in English, Hinglish, and Devanagari', () => {
  const enQuery = parseVoiceUtterance('How much does Suresh owe?');
  assert.equal(enQuery.kind, 'query_customer_balance');
  if (enQuery.kind === 'query_customer_balance') {
    assert.equal(enQuery.customerName, 'Suresh');
  }

  const hiQuery = parseVoiceUtterance('Suresh ka kitna baki hai?');
  assert.equal(hiQuery.kind, 'query_customer_balance');
  if (hiQuery.kind === 'query_customer_balance') {
    assert.equal(hiQuery.customerName, 'Suresh');
  }

  const devQuery = parseVoiceUtterance('रमेश का कितना बाकी है?');
  assert.equal(devQuery.kind, 'query_customer_balance');
  if (devQuery.kind === 'query_customer_balance') {
    assert.equal(devQuery.customerName, 'रमेश');
  }
});

test('parseVoiceUtterance returns unknown when amount is missing (never guesses amounts)', () => {
  const res = parseVoiceUtterance('Ramesh udhaar likho');
  assert.equal(res.kind, 'unknown');
});

test('findMatchingCustomers returns both Rameshes for Latin and Devanagari queries', () => {
  const seed = createSampleSeedData(new Date(2026, 10, 21));
  const matches = findMatchingCustomers('Ramesh', seed.customers, seed.entries);
  assert.equal(matches.length, 2);
  assert.ok(matches.every((m) => m.phoneSuffix.length === 4));

  const devMatches = findMatchingCustomers('रमेश', seed.customers, seed.entries);
  assert.equal(devMatches.length, 2);
});

test('polite reminder message and saved speech templates format cleanly', () => {
  const msg = TRANSLATIONS.en.politeReminderTemplate('Ramesh', 'Lakshmi Kirana', '340');
  assert.match(msg, /Namaste Ramesh ji/i);
  assert.match(msg, /Lakshmi Kirana/);
  assert.match(msg, /Rs 340/);
  assert.match(msg, /Pay whenever convenient/i);

  const savedHi = TRANSLATIONS.hi.entrySavedSpeech('Ramesh', '340', 'credit');
  assert.match(savedHi, /Ramesh/);
  assert.match(savedHi, /340/);
});

test('parseVoiceUtterance parses Kannada credit and payment entries with ASCII and Kannada digits', () => {
  const creditRes = parseVoiceUtterance('ರಮೇಶ್ ಅವರ ೩೪೦ ರೂಪಾಯಿ ಸಾಲ ಬರೆ', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(creditRes.kind, 'entry');
  if (creditRes.kind === 'entry') {
    assert.equal(creditRes.pending.customerName, 'ರಮೇಶ್');
    assert.equal(creditRes.pending.amount, 340);
    assert.equal(creditRes.pending.direction, 'credit');
  }

  const payRes = parseVoiceUtterance('ಸೀತಾ 200 ರೂಪಾಯಿ ಕೊಟ್ಟರು', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(payRes.kind, 'entry');
  if (payRes.kind === 'entry') {
    assert.equal(payRes.pending.customerName, 'ಸೀತಾ');
    assert.equal(payRes.pending.amount, 200);
    assert.equal(payRes.pending.direction, 'payment');
  }

  const jamaRes = parseVoiceUtterance('ಸುರೇಶ್ 500 ಜಮಾ', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(jamaRes.kind, 'entry');
  if (jamaRes.kind === 'entry') {
    assert.equal(jamaRes.pending.customerName, 'ಸುರೇಶ್');
    assert.equal(jamaRes.pending.amount, 500);
    assert.equal(jamaRes.pending.direction, 'payment');
  }
});

test('parseVoiceUtterance parses Kannada spoken numbers and yesterday date', () => {
  const res1 = parseVoiceUtterance('ರಮೇಶ್ ಮುನ್ನೂರು ನಲವತ್ತು ಸಾಲ', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res1.kind, 'entry');
  if (res1.kind === 'entry') {
    assert.equal(res1.pending.customerName, 'ರಮೇಶ್');
    assert.equal(res1.pending.amount, 340);
    assert.equal(res1.pending.direction, 'credit');
  }

  const res2 = parseVoiceUtterance('ನಿನ್ನೆ ಸುರೇಶ್ ಎರಡು ಸಾವಿರದ ಐನೂರು ಕೊಟ್ಟರು', {
    now: new Date(2026, 10, 21),
  });
  assert.equal(res2.kind, 'entry');
  if (res2.kind === 'entry') {
    assert.equal(res2.pending.customerName, 'ಸುರೇಶ್');
    assert.equal(res2.pending.amount, 2500);
    assert.equal(res2.pending.direction, 'payment');
    assert.equal(res2.pending.date, '2026-11-20');
  }
});

test('parseVoiceUtterance handles Kannada live corrections, daily totals, and balance queries', () => {
  const corrAmt = parseVoiceUtterance('ಅಲ್ಲ, 430', { hasPendingConfirmation: true });
  assert.equal(corrAmt.kind, 'correction');
  if (corrAmt.kind === 'correction') {
    assert.equal(corrAmt.amount, 430);
  }

  const corrDir = parseVoiceUtterance('ಇಲ್ಲ, ಜಮಾ ಮಾಡಿ', { hasPendingConfirmation: true });
  assert.equal(corrDir.kind, 'correction');
  if (corrDir.kind === 'correction') {
    assert.equal(corrDir.direction, 'payment');
  }

  assert.equal(parseVoiceUtterance('ಇಂದು ಎಷ್ಟು ಬಾಕಿ ಇದೆ?').kind, 'query_today_summary');
  assert.equal(parseVoiceUtterance('ಇಂದಿನ ಲೆಕ್ಕ').kind, 'query_today_summary');

  const bal = parseVoiceUtterance('ರಮೇಶ್ ಅವರ ಎಷ್ಟು ಬಾಕಿ ಇದೆ?');
  assert.equal(bal.kind, 'query_customer_balance');
  if (bal.kind === 'query_customer_balance') {
    assert.equal(bal.customerName, 'ರಮೇಶ್');
  }
});

test('findMatchingCustomers matches Kannada script customer names against English ledger names', () => {
  const seed = createSampleSeedData(new Date(2026, 10, 21));
  const knMatches = findMatchingCustomers('ರಮೇಶ್', seed.customers, seed.entries);
  assert.equal(knMatches.length, 2);

  const maheshMatches = findMatchingCustomers('ಮಹೇಶ್', seed.customers, seed.entries);
  assert.equal(maheshMatches.length, 1);
  assert.equal(maheshMatches[0].customerName, 'Mahesh Kumar');

  const sitaMatches = findMatchingCustomers('ಸೀತಾ', seed.customers, seed.entries);
  assert.equal(sitaMatches.length, 1);
  assert.equal(sitaMatches[0].customerName, 'Sita Devi');
});

test('voiceParser handles undefined inputs defensively without throwing trim TypeError', () => {
  const seed = createSampleSeedData(new Date(2026, 10, 21));
  const res = parseVoiceUtterance(undefined as unknown as string);
  assert.equal(res.kind, 'unknown');
  const matches = findMatchingCustomers(undefined as unknown as string, seed.customers, seed.entries);
  assert.equal(matches.length, 0);
});

test('parseVoiceUtterance strips English verbs ("has taken", "has paid back") and findMatchingCustomers fuzzy-matches STT spelling drift', () => {
  const creditRes = parseVoiceUtterance('Mallikarjun has taken 500 rupees credit');
  assert.equal(creditRes.kind, 'entry');
  if (creditRes.kind === 'entry') {
    assert.equal(creditRes.pending.customerName, 'Mallikarjun');
    assert.equal(creditRes.pending.amount, 500);
    assert.equal(creditRes.pending.direction, 'credit');
  }

  const paymentRes = parseVoiceUtterance('Mallikaajan has paid back 100 rupees');
  assert.equal(paymentRes.kind, 'entry');
  if (paymentRes.kind === 'entry') {
    assert.equal(paymentRes.pending.customerName, 'Mallikaajan');
    assert.equal(paymentRes.pending.amount, 100);
    assert.equal(paymentRes.pending.direction, 'payment');
  }

  const customers = [
    {
      id: 'c-malli',
      name: 'Mallikarjun',
      phone: '9845011111',
      remindersOptIn: false,
      createdAt: '2026-11-21T00:00:00.000Z',
    },
  ];
  const entries = [
    {
      id: 'e-1',
      customerId: 'c-malli',
      customerName: 'Mallikarjun',
      amount: 500,
      direction: 'credit' as const,
      date: '2026-11-21',
      createdAt: '2026-11-21T10:00:00.000Z',
    },
  ];

  // STT spelling drift "Mallikaajan" matches existing customer "Mallikarjun"
  const fuzzy1 = findMatchingCustomers('Mallikaajan', customers, entries);
  assert.equal(fuzzy1.length, 1);
  assert.equal(fuzzy1[0].customerId, 'c-malli');
  assert.equal(fuzzy1[0].balance, 500);

  // Split spacing "Malik Arjun" also matches "Mallikarjun"
  const fuzzy2 = findMatchingCustomers('Malik Arjun', customers, entries);
  assert.equal(fuzzy2.length, 1);
  assert.equal(fuzzy2[0].customerId, 'c-malli');
});
