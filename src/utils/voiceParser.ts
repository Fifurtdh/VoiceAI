import type {
  Customer,
  DisambiguationOption,
  EntryDirection,
  LedgerEntry,
  PendingConfirmation,
} from '../types/khata.ts';
import {
  formatINR,
  formatShortDate,
  getOffsetDateISO,
  getPhoneSuffix,
  getTodayISO,
} from './format.ts';
import { computeCustomerBalance } from './ledgerLogic.ts';

export type VoiceParseOutcome =
  | {
      kind: 'correction';
      amount?: number;
      direction?: EntryDirection;
      customerName?: string;
    }
  | {
      kind: 'query_today_summary';
    }
  | {
      kind: 'query_customer_balance';
      customerName: string;
    }
  | {
      kind: 'entry';
      pending: PendingConfirmation;
    }
  | {
      kind: 'unknown';
      raw: string;
    };

const PAYMENT_KEYWORDS = [
  'diye',
  'diya',
  'de diye',
  'mila',
  'mile',
  'jama',
  'paid',
  'pay',
  'payment',
  'received',
  'vasooli',
  'wapas',
  'waapas',
  'kotru',
  'kottaru',
  'kuduthanga',
  'icharu',
  'dile',
  'dila',
  'dilam',
  'diyen',
  'दिए',
  'मिला',
  'जमा',
  // Kannada script & Kanglish payment terms
  'ಕೊಟ್ಟರು',
  'ಕೊಟ್ಟಿದ್ದಾರೆ',
  'ಕೊಟ್ಟ',
  'ಕೊಟ್ಟೆ',
  'ಕೊಟ್ರು',
  'ಜಮಾ',
  'ಪಾವತಿ',
  'ಬಂದಿದೆ',
  'ವಾಪಸ್',
  'ಪೇಮೆಂಟ್',
  'kotta',
  'kottiddare',
  'pavati',
  'bandide',
];

const CREDIT_KEYWORDS = [
  'udhaar',
  'udhar',
  'baki',
  'baaki',
  'baakhi',
  'credit',
  'likh',
  'likho',
  'likhna',
  'liya',
  'liye',
  'le gaya',
  'le gayi',
  'sal',
  'saala',
  'sala',
  'kadan',
  'appu',
  'udhari',
  'उधार',
  'लिखो',
  'बाकी',
  // Kannada script & Kanglish credit terms
  'ಸಾಲ',
  'ಬಾಕಿ',
  'ಉಧಾರಿ',
  'ಉಧಾರ್',
  'ಬರೆ',
  'ಬರೆಯಿರಿ',
  'ತಗೊಂಡರು',
  'ತಗೊಂಡಿದ್ದಾರೆ',
  'ತಗೊಂಡ',
  'bare',
  'bareyiri',
  'tagondru',
  'tagondaru',
];

const CORRECTION_PREFIXES = [
  'nahi',
  'nai',
  'nahin',
  'sorry',
  'galat',
  'no',
  'change',
  'kar do',
  'kardo',
  'actually',
  'make it',
  'illa',
  'alla',
  'kadu',
  'नहीं',
  // Kannada script correction prefixes
  'ಅಲ್ಲ',
  'ಇಲ್ಲ',
  'ತಪ್ಪು',
  'ಬದಲಾಯಿಸಿ',
  'ಬೇಡ',
];

const QUERY_SUMMARY_PATTERNS = [
  /aaj\s+kitna\s+(mila|udhaar|udhar|gaya|aaya|jama|vasooli)/i,
  /today.*(total|received|mila|payment|udhaar|udhar|credit|collection)/i,
  /kitna\s+(mila|jama|udhaar|udhar|vasooli|collection)\s*(hai|gaya|hua|aaj)?\??$/i,
  /aaj\s+ka\s+(hisab|hisaab|total|udhaar|udhar)/i,
  /how\s+much.*(today|received|collected|credit given)/i,
  /^total\s+(outstanding|due|bakaya|baaki)\??$/i,
  // Kannada & Kanglish daily summary queries
  /ಇಂದು\s+ಎಷ್ಟು/i,
  /ಇಂದಿನ\s+(?:ಲೆಕ್ಕ|ಸಾಲ|ಜಮಾ|ಬಾಕಿ|ಒಟ್ಟು|ಹಣ)/i,
  /^ಒಟ್ಟು\s+(?:ಬಾಕಿ|ಸಾಲ|ಜಮಾ)\s*(?:ಎಷ್ಟು)?[?।]?$/i,
  /ivattu\s+eshtu\s+(?:bandide|jama|saala|sala|baki|baaki|kottaru|hogide)/i,
  /indina\s+(?:lekka|saala|sala|jama|baki|baaki|total)/i,
];

const CUSTOMER_BALANCE_PATTERNS = [
  /how\s+much\s+(?:does|do)\s+([a-z\u0900-\u0d7f\s]{2,40}?)\s+(?:owe|owes|have\s+to\s+pay|bakaya)/i,
  /([a-z\u0900-\u0d7f\s]{2,40}?)\s+(?:ka|ki|ke|का|की|के)\s+(?:kitna|total|कितना|कुल)?\s*(?:baki|baaki|bakaya|udhaar|udhar|hisab|hisaab|balance|बाकी|बकाया|उधार|हिसाब)\s*(?:hai|baki|baaki|है|बाकी)?[?\u0964।]?$/i,
  /(?:what\s+is|check|tell\s+me)\s+([a-z\u0900-\u0d7f\s]{2,40}?)(?:'s)?\s+(?:balance|due|udhaar|credit)/i,
  // Kannada & Kanglish customer balance queries
  /^([^\d.,!?]+?)\s+(?:ಅವರ|ಅವರದು|ಅವರಿಗೆ|ಅವರು|ದು|ಗೆ)?\s*(?:ಎಷ್ಟು|ಒಟ್ಟು)\s*(?:ಬಾಕಿ|ಸಾಲ|ಲೆಕ್ಕ|ಬ್ಯಾಲೆನ್ಸ್)\s*(?:ಇದೆ|ಆಗಿದೆ)?[?।]?$/i,
  /^([^\d.,!?]+?)\s+(?:ಅವರ|ಅವರದು|ಅವರಿಗೆ|ಅವರು)?\s*(?:ಬಾಕಿ|ಸಾಲ|ಲೆಕ್ಕ|ಬ್ಯಾಲೆನ್ಸ್)\s+ಎಷ್ಟು\s*(?:ಇದೆ|ಆಗಿದೆ)?[?।]?$/i,
  /([a-z\u0900-\u0d7f\s]{2,40}?)\s+(?:avara|avr|du|ge)?\s*(?:eshtu|estu)\s*(?:baki|baaki|saala|sala|balance)\s*(?:ide|ede)?\??$/i,
];

const NUMBER_UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  // Hindi / Hinglish units & teens & tens
  shunya: 0,
  ek: 1,
  do: 2,
  teen: 3,
  chaar: 4,
  char: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  che: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  ikkees: 21,
  baees: 22,
  pachis: 25,
  pachchis: 25,
  tees: 30,
  chaalis: 40,
  chalis: 40,
  pachaas: 50,
  pachas: 50,
  saath: 60,
  sattar: 70,
  assi: 80,
  nabbe: 90,
  // Kannada script units, teens, tens & compound hundreds
  ಸೊನ್ನೆ: 0,
  ಒಂದು: 1,
  ಎರಡು: 2,
  ಮೂರು: 3,
  ನಾಲ್ಕು: 4,
  ಐದು: 5,
  ಆರು: 6,
  ಏಳು: 7,
  ಎಂಟು: 8,
  ಒಂಬತ್ತು: 9,
  ಹತ್ತು: 10,
  ಹನ್ನೊಂದು: 11,
  ಹನ್ನೆರಡು: 12,
  ಹದಿಮೂರು: 13,
  ಹದಿನಾಲ್ಕು: 14,
  ಹದಿನೈದು: 15,
  ಹದಿನಾರು: 16,
  ಹದಿನೇಳು: 17,
  ಹದಿನೆಂಟು: 18,
  ಹತ್ತೊಂಬತ್ತು: 19,
  ಇಪ್ಪತ್ತು: 20,
  ಇಪ್ಪತ್ತೈದು: 25,
  ಮೂವತ್ತು: 30,
  ನಲವತ್ತು: 40,
  ಐವತ್ತು: 50,
  ಅರವತ್ತು: 60,
  ಎಪ್ಪತ್ತು: 70,
  ಎಂಬತ್ತು: 80,
  ತೊಂಬತ್ತು: 90,
  ನೂರಾ: 100,
  ಇನ್ನೂರು: 200,
  ಇನ್ನೂರಾ: 200,
  ಮುನ್ನೂರು: 300,
  ಮುನ್ನೂರಾ: 300,
  ನಾನೂರು: 400,
  ನಾನೂರಾ: 400,
  ಐನೂರು: 500,
  ಐನೂರಾ: 500,
  ಐನ್ನೂರಾ: 500,
  ಆರ್ನೂರು: 600,
  ಆರುನೂರು: 600,
  ಆರ್ನೂರಾ: 600,
  ಏಳ್ನೂರು: 700,
  ಏಳುನೂರು: 700,
  ಏಳ್ನೂರಾ: 700,
  ಎಂಟುನೂರು: 800,
  ಎಂಟುನೂರಾ: 800,
  ಒಂಬೈನೂರು: 900,
  ಒಂಬೈನೂರಾ: 900,
  // Romanized Kannada spoken numbers
  ondu: 1,
  eradu: 2,
  mooru: 3,
  naalku: 4,
  aidu: 5,
  aaru: 6,
  elu: 7,
  entu: 8,
  ombattu: 9,
  hattu: 10,
  ippattu: 20,
  moovattu: 30,
  nalavattu: 40,
  aivattu: 50,
  innooru: 200,
  munnooru: 300,
  naanooru: 400,
  ainooru: 500,
};

const MULTIPLIER_WORDS: Record<string, number> = {
  hundred: 100,
  sau: 100,
  so: 100,
  thousand: 1000,
  hazaar: 1000,
  hazar: 1000,
  lakh: 100000,
  lac: 100000,
  // Kannada multipliers
  ನೂರು: 100,
  ಸಾವಿರ: 1000,
  ಸಾವಿರದ: 1000,
  ಲಕ್ಷ: 100000,
  nooru: 100,
  saavira: 1000,
  savira: 1000,
};

const SPECIAL_FRACTION_WORDS: Record<string, number> = {
  dedh: 150,
  dhai: 250,
};

const FILLER_WORDS = new Set([
  'ka',
  'ki',
  'ke',
  'ko',
  'ne',
  'se',
  'me',
  'mein',
  'pe',
  'par',
  'rs',
  'rupees',
  'rupaye',
  'rupaiye',
  'rupee',
  'inr',
  'today',
  'aaj',
  'kal',
  'yesterday',
  'ji',
  'bhai',
  'kar',
  'do',
  'kardo',
  'hai',
  'hain',
  'gaya',
  'hua',
  'likh',
  'likho',
  'add',
  'entry',
  'for',
  'from',
  'of',
  'to',
  'the',
  'and',
  'gave',
  'took',
  'owe',
  'owes',
  'does',
  'how',
  'much',
  'kitna',
  'dedh',
  'dhai',
  'saade',
  'sade',
  'sawa',
  'का',
  'की',
  'के',
  'को',
  'ने',
  'रुपये',
  'रुपए',
  'आज',
  'कल',
  // Kannada script & Kanglish fillers/postpositions
  'ಅವರ',
  'ಅವರು',
  'ಅವರಿಗೆ',
  'ಅವರದು',
  'ಅವರೇ',
  'ಗೆ',
  'ಇಂದ',
  'ರೂಪಾಯಿ',
  'ರುಪಾಯಿ',
  'ರೂ',
  'ರು',
  'ಇಂದು',
  'ಇಂದಿನ',
  'ನಿನ್ನೆ',
  'ನಿನ್ನೆಯ',
  'ಮಾಡಿ',
  'ಸೇರಿಸಿ',
  'ಹಾಕಿ',
  'ಇದೆ',
  'ಆಗಿದೆ',
  'ಎಷ್ಟು',
  'ಒಟ್ಟು',
  'ಖಾತೆಗೆ',
  'ಖಾತೆಯಲ್ಲಿ',
  'avara',
  'avaru',
  'avarige',
  'rupayi',
  'roopayi',
  'ivattu',
  'indina',
  'ninne',
  ...Object.keys(NUMBER_UNITS),
  ...Object.keys(MULTIPLIER_WORDS),
  ...PAYMENT_KEYWORDS,
  ...CREDIT_KEYWORDS,
]);

/**
 * Normalizes Kannada (೦-೯) and Devanagari (०-९) Unicode numerals to ASCII digits (0-9).
 */
function normalizeIndicDigits(text: string): string {
  return text
    .replace(/[\u0ce6-\u0cef]/g, (ch) => String(ch.charCodeAt(0) - 0x0ce6))
    .replace(/[\u0966-\u096f]/g, (ch) => String(ch.charCodeAt(0) - 0x0966));
}

function cleanNumberToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[.,!?₹।\-:;'"()]/g, '')
    .trim();
}

/**
 * Parses English and Hindi/Hinglish spoken number words into an integer amount.
 * Examples:
 * - "three hundred forty" -> 340
 * - "teen sau chaalis" -> 340
 * - "paanch sau rupaye" -> 500
 * - "dedh sau" -> 150
 * - "dhai sau" -> 250
 * - "do hazaar ek sau" -> 2100
 */
export function parseSpokenNumberSequence(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let foundAny = false;

  for (let i = 0; i < tokens.length; i++) {
    const raw = cleanNumberToken(tokens[i]);
    if (!raw) continue;

    if ((raw === 'saade' || raw === 'sade') && i + 1 < tokens.length) {
      const nextVal = NUMBER_UNITS[cleanNumberToken(tokens[i + 1])];
      const nextMult = tokens[i + 2]
        ? MULTIPLIER_WORDS[cleanNumberToken(tokens[i + 2])]
        : undefined;
      if (nextVal !== undefined && nextMult === 100) {
        total += (nextVal + 0.5) * 100;
        foundAny = true;
        i += 2;
        continue;
      }
    }

    if (raw === 'sawa' && i + 1 < tokens.length) {
      const nextRaw = cleanNumberToken(tokens[i + 1]);
      if (nextRaw === 'sau' || nextRaw === 'so') {
        total += 125;
        foundAny = true;
        i += 1;
        continue;
      }
    }

    if (SPECIAL_FRACTION_WORDS[raw] !== undefined) {
      const nextRaw = tokens[i + 1] ? cleanNumberToken(tokens[i + 1]) : '';
      if (nextRaw === 'sau' || nextRaw === 'so') {
        total += SPECIAL_FRACTION_WORDS[raw];
        foundAny = true;
        i += 1;
        continue;
      }
      if (nextRaw === 'hazaar' || nextRaw === 'hazar') {
        total += SPECIAL_FRACTION_WORDS[raw] * 10;
        foundAny = true;
        i += 1;
        continue;
      }
    }

    if (NUMBER_UNITS[raw] !== undefined) {
      current += NUMBER_UNITS[raw];
      foundAny = true;
      continue;
    }

    if (MULTIPLIER_WORDS[raw] !== undefined) {
      const mult = MULTIPLIER_WORDS[raw];
      if (mult === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        total += (current === 0 ? 1 : current) * mult;
        current = 0;
      }
      foundAny = true;
      continue;
    }

    if (raw === 'and' && foundAny) {
      continue;
    }

    if (foundAny) {
      break;
    }
  }

  const finalValue = Math.round(total + current);
  return foundAny && finalValue > 0 ? finalValue : null;
}

/**
 * Extracts a clean numeric amount from a spoken transcript:
 * supports ASCII/Indic digits (340, ₹1,250, ೩೪೦) and spoken English/Hindi/Kannada number phrases.
 */
export function extractAmount(text: string): number | null {
  const cleaned = normalizeIndicDigits(text ?? '')
    .replace(/₹|rs\.?/gi, ' ')
    .replace(/(\d),(\d)/g, '$1$2');
  const digitMatch = cleaned.match(/\b(\d{1,7})\b/);
  if (digitMatch) {
    const num = Number(digitMatch[1]);
    if (Number.isFinite(num) && num > 0) return num;
  }

  // Try sliding over tokens to locate spoken number words
  const words = cleaned
    .replace(/[.,!?।]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const w = cleanNumberToken(words[i]);
    if (
      NUMBER_UNITS[w] !== undefined ||
      MULTIPLIER_WORDS[w] !== undefined ||
      SPECIAL_FRACTION_WORDS[w] !== undefined ||
      w === 'saade' ||
      w === 'sade' ||
      w === 'sawa'
    ) {
      // Special guard: Hindi "do" ("give") at sentence end after verb isn't a number unless followed by sau/hazaar or unit context
      if (
        w === 'do' &&
        (i === words.length - 1 ||
          words[i - 1]?.toLowerCase() === 'kar' ||
          words[i - 1]?.toLowerCase() === 'de')
      ) {
        continue;
      }
      const parsed = parseSpokenNumberSequence(words.slice(i));
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

/**
 * Detects date hint from spoken words (defaults to today).
 */
function extractDate(text: string, now: Date = new Date()): string {
  const lower = text.toLowerCase();
  if (/\byesterday\b|\bkal\b|\bkal ka\b|\bninne\b|ನಿನ್ನೆ/.test(lower)) {
    return getOffsetDateISO(-1, now);
  }
  return getTodayISO(now);
}

/**
 * Parses a shopkeeper's spoken or typed phrase into a structured intent:
 * - Live correction when a confirmation sheet is open (e.g. "nahi, 430", "ಅಲ್ಲ, 430")
 * - Daily summary query (e.g. "aaj kitna mila?", "ಇಂದು ಎಷ್ಟು ಬಾಕಿ?")
 * - Customer balance query (e.g. "How much does Suresh owe?", "ರಮೇಶ್ ಅವರ ಎಷ್ಟು ಬಾಕಿ ಇದೆ?")
 * - Ledger entry (e.g. "Ramesh ka 340 rupaye udhaar likho", "ರಮೇಶ್ 340 ಸಾಲ", "ಸೀತಾ 200 ಜಮಾ")
 */
export function parseVoiceUtterance(
  rawText: string,
  options: { hasPendingConfirmation?: boolean; now?: Date } = {}
): VoiceParseOutcome {
  const safeRaw = typeof rawText === 'string' ? rawText : '';
  const trimmed = normalizeIndicDigits(safeRaw).trim();
  if (!trimmed) {
    return { kind: 'unknown', raw: safeRaw };
  }

  const lower = trimmed.toLowerCase();

  // 1. Check daily totals query first
  if (QUERY_SUMMARY_PATTERNS.some((re) => re.test(lower))) {
    return { kind: 'query_today_summary' };
  }

  // 2. Check customer balance query ("How much does Suresh owe?", "Suresh ka kitna baki hai?", "ರಮೇಶ್ ಅವರ ಎಷ್ಟು ಬಾಕಿ ಇದೆ?")
  const nonCustomerTimeWords = new Set([
    'today',
    'aaj',
    'ಇಂದು',
    'ಇಂದಿನ',
    'ಒಟ್ಟು',
    'ivattu',
    'indina',
  ]);
  for (const re of CUSTOMER_BALANCE_PATTERNS) {
    const match = trimmed.match(re);
    if (match && match[1]) {
      const candidate = match[1]
        .trim()
        .split(/\s+/)
        .filter((w) => !FILLER_WORDS.has(w.toLowerCase()))
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (candidate && !nonCustomerTimeWords.has(candidate.toLowerCase())) {
        return { kind: 'query_customer_balance', customerName: candidate };
      }
    }
  }

  const amount = extractAmount(trimmed);

  // 3. Check live spoken correction if confirmation sheet is currently open
  if (options.hasPendingConfirmation) {
    const startsWithCorrection = CORRECTION_PREFIXES.some((prefix) =>
      lower.includes(prefix)
    );
    const hasOnlyAmount =
      amount !== null &&
      trimmed.replace(/[0-9₹.,\s]/g, '').length <= 8;

    if (startsWithCorrection || hasOnlyAmount) {
      let direction: EntryDirection | undefined;
      if (PAYMENT_KEYWORDS.some((kw) => lower.includes(kw))) {
        direction = 'payment';
      } else if (CREDIT_KEYWORDS.some((kw) => lower.includes(kw))) {
        direction = 'credit';
      }
      return {
        kind: 'correction',
        amount: amount ?? undefined,
        direction,
      };
    }
  }

  // 4. Parse standard ledger entry (never guess amount if missing)
  if (amount === null) {
    return { kind: 'unknown', raw: trimmed };
  }

  const isPayment = PAYMENT_KEYWORDS.some((kw) =>
    new RegExp(`(?:^|\\s)${kw}(?:$|\\s|[.,!?])`, 'i').test(lower)
  );
  const isCredit = CREDIT_KEYWORDS.some((kw) =>
    new RegExp(`(?:^|\\s)${kw}(?:$|\\s|[.,!?])`, 'i').test(lower)
  );

  // Default to credit (udhaar) if shopkeeper just says "Ramesh 340"
  const direction: EntryDirection = isPayment && !isCredit ? 'payment' : 'credit';

  // Extract customer name by stripping numbers, currency symbols, spoken number words, and filler words
  const tokens = trimmed
    .replace(/[₹.,!?]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((tok) => !/^\d+$/.test(tok))
    .filter((tok) => !FILLER_WORDS.has(tok.toLowerCase()));

  const customerName =
    tokens.length > 0
      ? tokens
          .slice(0, 3)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : 'Walk-in Customer';

  return {
    kind: 'entry',
    pending: {
      customerName,
      amount,
      direction,
      date: extractDate(trimmed, options.now),
      rawTranscript: trimmed,
    },
  };
}

const DEVANAGARI_TO_LATIN_CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h', ड़: 'r', ढ़: 'rh',
};
const DEVANAGARI_VOWELS: Record<string, string> = {
  अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h',
};

const KANNADA_TO_LATIN_CONSONANTS: Record<string, string> = {
  ಕ: 'k', ಖ: 'kh', ಗ: 'g', ಘ: 'gh', ಙ: 'n',
  ಚ: 'ch', ಛ: 'chh', ಜ: 'j', ಝ: 'jh', ಞ: 'n',
  ಟ: 't', ಠ: 'th', ಡ: 'd', ಢ: 'dh', ಣ: 'n',
  ತ: 't', ಥ: 'th', ದ: 'd', ಧ: 'dh', ನ: 'n',
  ಪ: 'p', ಫ: 'ph', ಬ: 'b', ಭ: 'bh', ಮ: 'm',
  ಯ: 'y', ರ: 'r', ಱ: 'r', ಲ: 'l', ಳ: 'l', ವ: 'v',
  ಶ: 'sh', ಷ: 'sh', ಸ: 's', ಹ: 'h',
};
const KANNADA_VOWELS: Record<string, string> = {
  ಅ: 'a', ಆ: 'a', ಇ: 'i', ಈ: 'i', ಉ: 'u', ಊ: 'u', ಋ: 'ru',
  ಎ: 'e', ಏ: 'e', ಐ: 'ai', ಒ: 'o', ಓ: 'o', ಔ: 'au',
  'ಾ': 'a', 'ಿ': 'i', 'ೀ': 'i', 'ು': 'u', 'ೂ': 'u', 'ೃ': 'ru',
  'ೆ': 'e', 'ೇ': 'e', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au',
  'ಂ': 'n', 'ಃ': 'h',
};

function toPhoneticSearchKey(input: string): string {
  const lower = (typeof input === 'string' ? input : '')
    .trim()
    .toLowerCase()
    .replace(/[।\.,!?]/g, '');

  const hasDevanagari = /[\u0900-\u097f]/.test(lower);
  const hasKannada = /[\u0c80-\u0cff]/.test(lower);
  if (!hasDevanagari && !hasKannada) {
    return lower;
  }

  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (DEVANAGARI_TO_LATIN_CONSONANTS[ch]) {
      out += DEVANAGARI_TO_LATIN_CONSONANTS[ch];
      const next = lower[i + 1];
      if (next && next !== '्' && !DEVANAGARI_VOWELS[next] && next !== ' ') {
        out += 'a';
      }
    } else if (DEVANAGARI_VOWELS[ch]) {
      out += DEVANAGARI_VOWELS[ch];
    } else if (ch === '्') {
      continue;
    } else if (KANNADA_TO_LATIN_CONSONANTS[ch]) {
      out += KANNADA_TO_LATIN_CONSONANTS[ch];
      const next = lower[i + 1];
      if (next && next !== '್' && !KANNADA_VOWELS[next] && next !== ' ') {
        out += 'a';
      }
    } else if (KANNADA_VOWELS[ch]) {
      out += KANNADA_VOWELS[ch];
    } else if (ch === '್') {
      continue;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Matches a spoken customer name against stored customers.
 * Supports Latin, Devanagari, and Kannada phonetic matching so "रमेश" and "ರಮೇಶ್" match "Ramesh".
 * Returns exact/prefix/substring matches so duplicate names like two "Ramesh"es
 * trigger the disambiguation sheet cleanly.
 */
export function findMatchingCustomers(
  spokenName: string,
  customers: Customer[],
  entries: LedgerEntry[]
): DisambiguationOption[] {
  const safeName = typeof spokenName === 'string' ? spokenName : '';
  const needle = safeName.trim().toLowerCase();
  const phoneticNeedle = toPhoneticSearchKey(safeName);
  if (!needle) return [];

  const matches = customers.filter((c) => {
    const full = (c.name ?? '').toLowerCase();
    const first = full.split(/\s+/)[0] ?? '';
    const phoneticFull = toPhoneticSearchKey(c.name ?? '');
    const phoneticFirst = phoneticFull.split(/\s+/)[0] ?? '';
    return (
      full === needle ||
      first === needle ||
      full.includes(needle) ||
      phoneticFull === phoneticNeedle ||
      phoneticFirst === phoneticNeedle ||
      phoneticFull.includes(phoneticNeedle)
    );
  });

  const sortedEntries = [...entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return matches.map((customer) => {
    const lastTx = sortedEntries.find(
      (e) => e.customerId === customer.id && !e.undone
    );
    const lastTxSummary = lastTx
      ? `${formatINR(lastTx.amount)} ${
          lastTx.direction === 'credit' ? 'credit' : 'paid'
        } · ${formatShortDate(lastTx.date)}`
      : customer.tag || 'No prior entries';

    return {
      customerId: customer.id,
      customerName: customer.name,
      phoneSuffix: getPhoneSuffix(customer.phone),
      tag: customer.tag,
      lastTxSummary,
      balance: computeCustomerBalance(customer.id, entries),
    };
  });
}
