import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type Database from 'better-sqlite3';
import type {
  AuditLogRow,
  ChatMessageRow,
  ChatSessionRow,
  CustomerRow,
  LedgerEntryRow,
  PaymentReminderRow,
} from './db.ts';
import type { LanguageCode } from '../src/types/khata.ts';
import { formatINRNumber, getOffsetDateISO, getTodayISO } from '../src/utils/format.ts';
import {
  getReportDateRange,
  type ReportPeriodType,
} from '../src/utils/ledgerLogic.ts';
import { extractAmount } from '../src/utils/voiceParser.ts';

// ============================================================================
// Shared Types for BI Reports, Customer Intelligence, Search, Reminders & Chat
// ============================================================================

export type ReminderLanguage = LanguageCode | 'hinglish';

export interface EnhancedReportResponse {
  period: ReportPeriodType;
  startDate: string;
  endDate: string;
  totalCredit: number;
  totalPayments: number;
  netChange: number;
  totalOutstanding: number;
  entryCount: number;
  creditCount: number;
  paymentCount: number;
  newCustomersAdded: number;
  activeCustomersInPeriod: number;
  previousPeriod: {
    startDate: string;
    endDate: string;
    totalCredit: number;
    totalPayments: number;
    creditDeltaPercent: number | null;
    paymentDeltaPercent: number | null;
  };
  dailySeries: Array<{
    date: string;
    label: string;
    credit: number;
    payment: number;
    count: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    credit: number;
    payment: number;
    count: number;
  }>;
  customerBreakdown: Array<{
    customerId: string;
    customerName: string;
    credit: number;
    payment: number;
    net: number;
    currentOutstanding: number;
  }>;
  topCustomersByCredit: Array<{
    customerId: string;
    customerName: string;
    credit: number;
    payment: number;
    outstanding: number;
  }>;
  topCustomersByOutstanding: Array<{
    customerId: string;
    customerName: string;
    outstanding: number;
    phone: string;
  }>;
  increasingBalanceCustomers: Array<{
    customerId: string;
    customerName: string;
    periodNetIncrease: number;
    currentOutstanding: number;
  }>;
  transactions: Array<{
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    direction: 'credit' | 'payment';
    date: string;
    createdAt: string;
    note?: string;
  }>;
  accountingNote: string;
}

export type CustomerSegment =
  | 'highest_outstanding'
  | 'no_recent_payment'
  | 'regular_payer'
  | 'increasing_balance'
  | 'cleared';

export interface CustomerIntelligenceItem {
  customerId: string;
  name: string;
  phone: string;
  tag?: string;
  remindersOptIn: boolean;
  createdAt: string;
  outstanding: number;
  totalCredit: number;
  totalPayments: number;
  transactionCount: number;
  paymentCount: number;
  creditCount: number;
  lastTransactionDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  daysSinceLastTransaction: number | null;
  monthlyCredit: number;
  monthlyPayments: number;
  netChange30d: number;
  segments: CustomerSegment[];
}

export interface CustomerIntelligenceResponse {
  query: string;
  appliedFilterSummary: string;
  customers: CustomerIntelligenceItem[];
  insights: {
    highestOutstanding: CustomerIntelligenceItem[];
    noRecentPayments: CustomerIntelligenceItem[];
    regularPayers: CustomerIntelligenceItem[];
    increasingBalances: CustomerIntelligenceItem[];
    clearedBalances: CustomerIntelligenceItem[];
    totalCustomers: number;
    totalOutstanding: number;
  };
}

export interface CustomerStatementEntry {
  id: string;
  date: string;
  createdAt: string;
  direction: 'credit' | 'payment';
  amount: number;
  note?: string;
  undone: boolean;
  reversalOfId?: string;
  runningBalance: number;
}

export interface CustomerStatementResponse {
  customer: {
    id: string;
    name: string;
    phone: string;
    tag?: string;
    remindersOptIn: boolean;
    createdAt: string;
  };
  summary: {
    outstanding: number;
    totalCredit: number;
    totalPayments: number;
    transactionCount: number;
    lastTransactionDate: string | null;
    lastPaymentDate: string | null;
    daysSinceLastPayment: number | null;
  };
  monthlyActivity: Array<{
    month: string;
    credit: number;
    payment: number;
    count: number;
  }>;
  entries: CustomerStatementEntry[];
}

export interface SmartTransactionSearchResponse {
  query: string;
  appliedFilterSummary: string;
  totalAmount: number;
  totalCredit: number;
  totalPayments: number;
  entries: Array<{
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    direction: 'credit' | 'payment';
    date: string;
    createdAt: string;
    note?: string;
    undone: boolean;
    reversalOfId?: string;
  }>;
}

export interface DuplicateCheckMatch {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  direction: 'credit' | 'payment';
  date: string;
  createdAt: string;
  note?: string;
  minutesAgo: number;
}

export interface ReminderPendingCustomer {
  customerId: string;
  name: string;
  phone: string;
  tag?: string;
  remindersOptIn: boolean;
  outstanding: number;
  lastPaymentDate: string | null;
  lastTransactionDate: string | null;
  daysSinceLastPayment: number | null;
  overdueStatus: 'overdue_30d' | 'overdue_14d' | 'due';
  lastReminderSentAt: string | null;
  recentReminderWarning: boolean;
  reminderCount: number;
}

export interface ChatMetricCard {
  label: string;
  value: string;
  tone?: 'neutral' | 'credit' | 'payment';
}

export interface ChatTableData {
  headers: string[];
  rows: string[][];
}

export interface ChatMessageMetadata {
  intent: string;
  dateRange?: { startDate: string; endDate: string; label: string };
  cards?: ChatMetricCard[];
  table?: ChatTableData;
  followUps?: string[];
  context?: {
    lastCustomerId?: string;
    lastCustomerName?: string;
    lastIntent?: string;
    lastPeriod?: string;
  };
  poweredBy?: 'gemini-4-hydrogen' | 'deterministic-bi';
}

export interface ChatMessageDto {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: ChatMessageMetadata;
  createdAt: string;
}

export interface ChatSessionDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function daysBetweenISO(earlierISO: string, laterISO: string): number {
  const a = new Date(`${earlierISO}T00:00:00Z`).getTime();
  const b = new Date(`${laterISO}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function addDaysISO(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatAxisLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function mapEntryToFrontend(row: LedgerEntryRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    amount: row.amount,
    direction: row.direction,
    date: row.date,
    createdAt: row.created_at,
    note: row.note ?? undefined,
    undone: Boolean(row.undone),
    reversalOfId: row.reversal_of_id ?? undefined,
  };
}

function loadStoreLedger(db: Database.Database, storeId: number) {
  const customers = db
    .prepare('SELECT * FROM customers WHERE store_id = ? ORDER BY created_at DESC')
    .all(storeId) as CustomerRow[];
  const entries = db
    .prepare('SELECT * FROM ledger_entries WHERE store_id = ? ORDER BY created_at DESC')
    .all(storeId) as LedgerEntryRow[];
  return { customers, entries };
}

/**
 * Returns the set of entry IDs that have been superseded by an active (non-undone)
 * replacement entry via `reversal_of_id`. Ensures reversed originals are never
 * double-counted even if their `undone` flag were ever toggled back.
 */
function getSupersededEntryIds(entries: LedgerEntryRow[]): Set<string> {
  const superseded = new Set<string>();
  for (const e of entries) {
    if (!e.undone && e.reversal_of_id) {
      superseded.add(e.reversal_of_id);
    }
  }
  return superseded;
}

export interface SqlCustomerBalanceRow {
  customerId: string;
  totalCredit: number;
  totalPayments: number;
  outstanding: number;
  activeEntryCount: number;
}

/**
 * Authoritative SQLite aggregation for customer outstanding balances.
 * Correctly nets credit (+amount) and payment (-amount) entries while excluding:
 *   1. Entries marked `undone = 1`
 *   2. Original entries superseded by an active replacement (`reversal_of_id = e.id AND undone = 0`)
 */
export function queryCustomerBalancesSql(
  db: Database.Database,
  storeId: number,
  customerId?: string
): Map<string, SqlCustomerBalanceRow> {
  const baseSql = `
    SELECT
      e.customer_id AS customerId,
      COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE 0 END), 0) AS totalCredit,
      COALESCE(SUM(CASE WHEN e.direction = 'payment' THEN e.amount ELSE 0 END), 0) AS totalPayments,
      COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE -e.amount END), 0) AS outstanding,
      COUNT(*) AS activeEntryCount
    FROM ledger_entries e
    WHERE e.store_id = ?
      ${customerId ? 'AND e.customer_id = ?' : ''}
      AND COALESCE(e.undone, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM ledger_entries rev
        WHERE rev.store_id = e.store_id
          AND rev.reversal_of_id = e.id
          AND COALESCE(rev.undone, 0) = 0
      )
    GROUP BY e.customer_id
  `;

  const rows = (
    customerId
      ? db.prepare(baseSql).all(storeId, customerId)
      : db.prepare(baseSql).all(storeId)
  ) as SqlCustomerBalanceRow[];

  const map = new Map<string, SqlCustomerBalanceRow>();
  for (const row of rows) {
    map.set(row.customerId, {
      customerId: row.customerId,
      totalCredit: Number(row.totalCredit) || 0,
      totalPayments: Number(row.totalPayments) || 0,
      outstanding: Number(row.outstanding) || 0,
      activeEntryCount: Number(row.activeEntryCount) || 0,
    });
  }
  return map;
}

function makeId(prefix: string, storeId: number): string {
  return `${prefix}-${storeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// Audit Trail
// ============================================================================

export function writeAuditLog(
  db: Database.Database,
  params: {
    storeId: number;
    userId?: number | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  }
): void {
  const id = makeId('aud', params.storeId);
  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT INTO audit_logs (id, store_id, user_id, action, entity_type, entity_id, before_json, after_json, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.storeId,
    params.userId ?? null,
    params.action,
    params.entityType,
    params.entityId,
    params.before !== undefined ? JSON.stringify(params.before) : null,
    params.after !== undefined ? JSON.stringify(params.after) : null,
    params.reason ?? null,
    nowIso
  );
}

export function listAuditLogs(
  db: Database.Database,
  storeId: number,
  limit = 40
): Array<{
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason?: string;
  createdAt: string;
}> {
  const rows = db
    .prepare(
      'SELECT * FROM audit_logs WHERE store_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(storeId, Math.min(100, Math.max(1, limit))) as AuditLogRow[];

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_json ? safeJsonParse(row.before_json) : null,
    after: row.after_json ? safeJsonParse(row.after_json) : null,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
  }));
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ============================================================================
// Duplicate Transaction Detection
// ============================================================================

export function findPotentialDuplicateEntries(
  db: Database.Database,
  storeId: number,
  params: {
    customerId?: string;
    customerName: string;
    amount: number;
    direction: 'credit' | 'payment';
    date: string;
  },
  now: Date = new Date()
): DuplicateCheckMatch[] {
  const cleanName = params.customerName.trim().toLowerCase();
  const roundedAmount = Math.max(1, Math.round(params.amount));
  const nowMs = now.getTime();
  const recentWindowMs = 15 * 60 * 1000; // 15 minutes

  const rows = db
    .prepare(
      `SELECT * FROM ledger_entries
       WHERE store_id = ? AND undone = 0 AND amount = ? AND direction = ?
       ORDER BY created_at DESC LIMIT 25`
    )
    .all(storeId, roundedAmount, params.direction) as LedgerEntryRow[];

  const matches: DuplicateCheckMatch[] = [];
  for (const row of rows) {
    const sameCustomer =
      (params.customerId && row.customer_id === params.customerId) ||
      row.customer_name.trim().toLowerCase() === cleanName;
    if (!sameCustomer) continue;

    const createdMs = new Date(row.created_at).getTime();
    const diffMs = Math.max(0, nowMs - (Number.isFinite(createdMs) ? createdMs : nowMs));
    const isSameDate = row.date === params.date;
    const isWithin15Min = diffMs <= recentWindowMs;

    if (isSameDate || isWithin15Min) {
      matches.push({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        amount: row.amount,
        direction: row.direction,
        date: row.date,
        createdAt: row.created_at,
        note: row.note ?? undefined,
        minutesAgo: Math.round(diffMs / 60000),
      });
    }
  }
  return matches;
}

// ============================================================================
// Feature 2: Enhanced Business Reports & Visual Analytics
// ============================================================================

export function computeEnhancedReport(
  db: Database.Database,
  storeId: number,
  options: {
    period: ReportPeriodType;
    startDate?: string;
    endDate?: string;
  },
  now: Date = new Date()
): EnhancedReportResponse {
  const { customers, entries } = loadStoreLedger(db, storeId);
  const { startDate, endDate } = getReportDateRange(
    options.period,
    options.startDate,
    options.endDate,
    now
  );

  // Previous comparison period (same day-span immediately preceding startDate)
  const spanDays = Math.max(1, daysBetweenISO(startDate, endDate) + 1);
  let prevStartDate: string;
  let prevEndDate: string;
  if (options.period === 'monthly') {
    const prevMonthEnd = addDaysISO(startDate, -1);
    const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
    prevStartDate = prevMonthStart;
    prevEndDate = prevMonthEnd;
  } else {
    prevEndDate = addDaysISO(startDate, -1);
    prevStartDate = addDaysISO(startDate, -spanDays);
  }

  const supersededIds = getSupersededEntryIds(entries);
  const activeEntries = entries.filter((e) => !e.undone && !supersededIds.has(e.id));
  const scopedEntries = activeEntries.filter(
    (e) => e.date >= startDate && e.date <= endDate
  );
  const prevEntries = activeEntries.filter(
    (e) => e.date >= prevStartDate && e.date <= prevEndDate
  );

  let totalCredit = 0;
  let totalPayments = 0;
  let creditCount = 0;
  let paymentCount = 0;

  const dailyMap = new Map<
    string,
    { date: string; credit: number; payment: number; count: number }
  >();
  const custMap = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      credit: number;
      payment: number;
      net: number;
    }
  >();

  for (const e of scopedEntries) {
    if (e.direction === 'credit') {
      totalCredit += e.amount;
      creditCount++;
    } else {
      totalPayments += e.amount;
      paymentCount++;
    }

    const d = dailyMap.get(e.date) ?? {
      date: e.date,
      credit: 0,
      payment: 0,
      count: 0,
    };
    if (e.direction === 'credit') d.credit += e.amount;
    else d.payment += e.amount;
    d.count++;
    dailyMap.set(e.date, d);

    const c = custMap.get(e.customer_id) ?? {
      customerId: e.customer_id,
      customerName: e.customer_name,
      credit: 0,
      payment: 0,
      net: 0,
    };
    if (e.direction === 'credit') {
      c.credit += e.amount;
      c.net += e.amount;
    } else {
      c.payment += e.amount;
      c.net -= e.amount;
    }
    custMap.set(e.customer_id, c);
  }

  let prevCredit = 0;
  let prevPayments = 0;
  for (const e of prevEntries) {
    if (e.direction === 'credit') prevCredit += e.amount;
    else prevPayments += e.amount;
  }

  // Current all-time outstanding per customer via authoritative SQL aggregation
  const sqlBalances = queryCustomerBalancesSql(db, storeId);
  const outstandingByCust = new Map<string, number>();
  let totalOutstanding = 0;
  for (const c of customers) {
    const bal = sqlBalances.get(c.id)?.outstanding ?? 0;
    outstandingByCust.set(c.id, bal);
    if (bal > 0) totalOutstanding += bal;
  }

  const newCustomersAdded = customers.filter((c) => {
    const createdDay = c.created_at.slice(0, 10);
    return createdDay >= startDate && createdDay <= endDate;
  }).length;

  // Build continuous daily series for charts (up to 31 days; for longer custom ranges use active dates)
  const dailySeries: EnhancedReportResponse['dailySeries'] = [];
  if (spanDays <= 31) {
    for (let i = 0; i < spanDays; i++) {
      const iso = addDaysISO(startDate, i);
      const found = dailyMap.get(iso);
      dailySeries.push({
        date: iso,
        label: formatAxisLabel(iso),
        credit: found?.credit ?? 0,
        payment: found?.payment ?? 0,
        count: found?.count ?? 0,
      });
    }
  } else {
    for (const day of [...dailyMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    )) {
      dailySeries.push({
        date: day.date,
        label: formatAxisLabel(day.date),
        credit: day.credit,
        payment: day.payment,
        count: day.count,
      });
    }
  }

  const customerBreakdown = [...custMap.values()]
    .map((c) => ({
      ...c,
      currentOutstanding: Math.max(0, outstandingByCust.get(c.customerId) ?? 0),
    }))
    .sort((a, b) => b.credit + b.payment - (a.credit + a.payment));

  const topCustomersByCredit = [...customerBreakdown]
    .filter((c) => c.credit > 0)
    .sort((a, b) => b.credit - a.credit)
    .slice(0, 6)
    .map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      credit: c.credit,
      payment: c.payment,
      outstanding: c.currentOutstanding,
    }));

  const topCustomersByOutstanding = customers
    .map((c) => ({
      customerId: c.id,
      customerName: c.name,
      outstanding: Math.max(0, outstandingByCust.get(c.id) ?? 0),
      phone: c.phone,
    }))
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 6);

  const increasingBalanceCustomers = customerBreakdown
    .filter((c) => c.net > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 6)
    .map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      periodNetIncrease: c.net,
      currentOutstanding: c.currentOutstanding,
    }));

  return {
    period: options.period,
    startDate,
    endDate,
    totalCredit,
    totalPayments,
    netChange: totalCredit - totalPayments,
    totalOutstanding,
    entryCount: scopedEntries.length,
    creditCount,
    paymentCount,
    newCustomersAdded,
    activeCustomersInPeriod: custMap.size,
    previousPeriod: {
      startDate: prevStartDate,
      endDate: prevEndDate,
      totalCredit: prevCredit,
      totalPayments: prevPayments,
      creditDeltaPercent: computeDeltaPercent(totalCredit, prevCredit),
      paymentDeltaPercent: computeDeltaPercent(totalPayments, prevPayments),
    },
    dailySeries,
    dailyBreakdown: [...dailyMap.values()].sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
    customerBreakdown,
    topCustomersByCredit,
    topCustomersByOutstanding,
    increasingBalanceCustomers,
    transactions: scopedEntries.map((e) => ({
      id: e.id,
      customerId: e.customer_id,
      customerName: e.customer_name,
      amount: e.amount,
      direction: e.direction,
      date: e.date,
      createdAt: e.created_at,
      note: e.note ?? undefined,
    })),
    accountingNote:
      'Credit (Udhaar), Payments Collected, and Outstanding Balance are tracked separately. Profit is not calculated because purchase cost and selling price are not recorded in this khata.',
  };
}

// ============================================================================
// Feature 4: Customer Intelligence & Natural-Language Customer Search
// ============================================================================

export function computeCustomerIntelligence(
  db: Database.Database,
  storeId: number,
  rawQuery = '',
  now: Date = new Date()
): CustomerIntelligenceResponse {
  const { customers, entries } = loadStoreLedger(db, storeId);
  const todayISO = getTodayISO(now);
  const thirtyDaysAgoISO = getOffsetDateISO(-30, now);
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;

  const supersededIds = getSupersededEntryIds(entries);
  const sqlBalances = queryCustomerBalancesSql(db, storeId);
  const activeEntries = entries.filter((e) => !e.undone && !supersededIds.has(e.id));
  const byCustomer = new Map<string, LedgerEntryRow[]>();
  for (const e of activeEntries) {
    const arr = byCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    byCustomer.set(e.customer_id, arr);
  }

  const allItems: CustomerIntelligenceItem[] = customers.map((c) => {
    const custEntries = (byCustomer.get(c.id) ?? []).sort((a, b) =>
      b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
    );
    const sqlBal = sqlBalances.get(c.id);
    let paymentCount = 0;
    let creditCount = 0;
    let monthlyCredit = 0;
    let monthlyPayments = 0;
    let netChange30d = 0;
    let lastPaymentDate: string | null = null;
    const lastTransactionDate = custEntries[0]?.date ?? null;

    for (const e of custEntries) {
      if (e.direction === 'credit') {
        creditCount++;
        if (e.date >= monthStartISO) monthlyCredit += e.amount;
        if (e.date >= thirtyDaysAgoISO) netChange30d += e.amount;
      } else {
        paymentCount++;
        if (!lastPaymentDate || e.date > lastPaymentDate) {
          lastPaymentDate = e.date;
        }
        if (e.date >= monthStartISO) monthlyPayments += e.amount;
        if (e.date >= thirtyDaysAgoISO) netChange30d -= e.amount;
      }
    }

    const totalCredit = sqlBal?.totalCredit ?? 0;
    const totalPayments = sqlBal?.totalPayments ?? 0;
    const outstanding = sqlBal?.outstanding ?? 0;
    const referenceForOverdue = lastPaymentDate ?? lastTransactionDate ?? c.created_at.slice(0, 10);
    const daysSinceLastPayment =
      lastPaymentDate !== null
        ? daysBetweenISO(lastPaymentDate, todayISO)
        : outstanding > 0
        ? daysBetweenISO(referenceForOverdue, todayISO)
        : null;
    const daysSinceLastTransaction =
      lastTransactionDate !== null
        ? daysBetweenISO(lastTransactionDate, todayISO)
        : null;

    const segments: CustomerSegment[] = [];
    if (outstanding <= 0 && custEntries.length > 0) {
      segments.push('cleared');
    }
    if (
      outstanding > 0 &&
      daysSinceLastPayment !== null &&
      daysSinceLastPayment >= 30
    ) {
      segments.push('no_recent_payment');
    }
    if (
      paymentCount >= 2 ||
      (paymentCount >= 1 &&
        lastPaymentDate !== null &&
        daysBetweenISO(lastPaymentDate, todayISO) <= 15 &&
        totalPayments >= totalCredit * 0.5)
    ) {
      segments.push('regular_payer');
    }
    if (outstanding > 0 && netChange30d > 0) {
      segments.push('increasing_balance');
    }

    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      tag: c.tag ?? undefined,
      remindersOptIn: Boolean(c.reminders_opt_in),
      createdAt: c.created_at,
      outstanding,
      totalCredit,
      totalPayments,
      transactionCount: custEntries.length,
      paymentCount,
      creditCount,
      lastTransactionDate,
      lastPaymentDate,
      daysSinceLastPayment,
      daysSinceLastTransaction,
      monthlyCredit,
      monthlyPayments,
      netChange30d,
      segments,
    };
  });

  // Tag top 3 highest outstanding customers
  const sortedByOutstanding = [...allItems]
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  for (const top of sortedByOutstanding.slice(0, 3)) {
    if (!top.segments.includes('highest_outstanding')) {
      top.segments.unshift('highest_outstanding');
    }
  }

  const totalOutstanding = allItems.reduce(
    (sum, item) => sum + (item.outstanding > 0 ? item.outstanding : 0),
    0
  );

  // Natural-language Smart Customer Search
  const q = rawQuery.trim();
  const lower = q.toLowerCase();
  let filtered = [...allItems].sort(
    (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name)
  );
  let appliedFilterSummary = 'All customers sorted by outstanding balance';

  if (q) {
    const filterReasons: string[] = [];

    // 1. "more than X rupees pending" / "above X" / "> X" / "over X"
    const minPendingMatch = lower.match(
      /(?:more\s+than|above|over|greater\s+than|at\s+least|>=?)\s*₹?\s*([\d,]+)/i
    );
    const maxPendingMatch = lower.match(
      /(?:less\s+than|under|below|<=?)\s*₹?\s*([\d,]+)/i
    );
    if (minPendingMatch) {
      const threshold = Number(minPendingMatch[1].replace(/,/g, ''));
      if (Number.isFinite(threshold)) {
        filtered = filtered.filter((c) => c.outstanding > threshold);
        filterReasons.push(`pending > ₹${formatINRNumber(threshold)}`);
      }
    } else if (maxPendingMatch) {
      const threshold = Number(maxPendingMatch[1].replace(/,/g, ''));
      if (Number.isFinite(threshold)) {
        filtered = filtered.filter((c) => c.outstanding > 0 && c.outstanding < threshold);
        filterReasons.push(`pending < ₹${formatINRNumber(threshold)}`);
      }
    }

    // 2. "not paid for 30 days" / "overdue" / "no payment for N days"
    const unpaidDaysMatch = lower.match(
      /(?:not\s+paid|no\s+payment|unpaid|overdue).*?(\d+)\s*days?/i
    );
    if (unpaidDaysMatch) {
      const minDays = Number(unpaidDaysMatch[1]);
      filtered = filtered.filter(
        (c) =>
          c.outstanding > 0 &&
          (c.daysSinceLastPayment === null || c.daysSinceLastPayment >= minDays)
      );
      filterReasons.push(`no payment for ${minDays}+ days`);
    } else if (
      /\b(?:overdue|not\s+paid|unpaid\s+customers|no\s+recent\s+payment)\b/i.test(lower)
    ) {
      filtered = filtered.filter(
        (c) =>
          c.outstanding > 0 &&
          (c.daysSinceLastPayment === null || c.daysSinceLastPayment >= 30)
      );
      filterReasons.push('no payment in 30+ days');
    }

    // 3. "added this month" / "new customers"
    if (/\b(?:added\s+this\s+month|new\s+customers?|joined\s+this\s+month)\b/i.test(lower)) {
      filtered = filtered.filter((c) => c.createdAt.slice(0, 10) >= monthStartISO);
      filterReasons.push(`added since ${monthStartISO}`);
    }

    // 4. "cleared" / "settled" / "zero balance"
    if (/\b(?:cleared|settled|zero\s+balance|no\s+pending)\b/i.test(lower)) {
      filtered = filtered.filter((c) => c.outstanding <= 0);
      filterReasons.push('cleared / settled balance');
    }

    // 5. "regular payers"
    if (/\b(?:regular\s+payer|regular\s+payers|good\s+payers)\b/i.test(lower)) {
      filtered = filtered.filter((c) => c.segments.includes('regular_payer'));
      filterReasons.push('regular payers');
    }

    // 6. "increasing balance"
    if (/\b(?:increasing\s+balance|growing\s+udhaar|rising\s+balance)\b/i.test(lower)) {
      filtered = filtered.filter((c) => c.segments.includes('increasing_balance'));
      filterReasons.push('increasing balance (last 30 days)');
    }

    // 7. Name / phone / tag search (strip command words like "find", "show", "customer")
    if (filterReasons.length === 0) {
      const cleanedNameQuery = lower
        .replace(
          /\b(?:find|search|show|list|get|who\s+is|customer|customers|named|called|please)\b/gi,
          ' '
        )
        .replace(/[?.,!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const needle = cleanedNameQuery || lower;
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.phone.includes(needle) ||
          (c.tag && c.tag.toLowerCase().includes(needle))
      );
      filterReasons.push(`matching "${cleanedNameQuery || q}"`);
    }

    appliedFilterSummary = `Filtered: ${filterReasons.join(' · ')} (${filtered.length} found)`;
  }

  return {
    query: q,
    appliedFilterSummary,
    customers: filtered,
    insights: {
      highestOutstanding: sortedByOutstanding.slice(0, 5),
      noRecentPayments: allItems
        .filter((i) => i.segments.includes('no_recent_payment'))
        .sort(
          (a, b) =>
            (b.daysSinceLastPayment ?? 0) - (a.daysSinceLastPayment ?? 0)
        )
        .slice(0, 8),
      regularPayers: allItems
        .filter((i) => i.segments.includes('regular_payer'))
        .sort((a, b) => b.totalPayments - a.totalPayments)
        .slice(0, 8),
      increasingBalances: allItems
        .filter((i) => i.segments.includes('increasing_balance'))
        .sort((a, b) => b.netChange30d - a.netChange30d)
        .slice(0, 8),
      clearedBalances: allItems
        .filter((i) => i.segments.includes('cleared'))
        .slice(0, 8),
      totalCustomers: allItems.length,
      totalOutstanding,
    },
  };
}

export function computeCustomerStatement(
  db: Database.Database,
  storeId: number,
  customerId: string,
  options: { startDate?: string; endDate?: string; search?: string } = {},
  now: Date = new Date()
): CustomerStatementResponse | null {
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
    .get(customerId, storeId) as CustomerRow | undefined;
  if (!customer) return null;

  const allEntries = db
    .prepare(
      'SELECT * FROM ledger_entries WHERE store_id = ? AND customer_id = ? ORDER BY date ASC, created_at ASC'
    )
    .all(storeId, customerId) as LedgerEntryRow[];

  const supersededIds = getSupersededEntryIds(allEntries);
  const sqlBal = queryCustomerBalancesSql(db, storeId, customerId).get(customerId);
  const todayISO = getTodayISO(now);
  let running = 0;
  let totalCredit = 0;
  let totalPayments = 0;
  let lastTxDate: string | null = null;
  let lastPayDate: string | null = null;
  const monthMap = new Map<
    string,
    { month: string; credit: number; payment: number; count: number }
  >();

  const withRunning: CustomerStatementEntry[] = allEntries.map((row) => {
    const isEffectivelyUndone = Boolean(row.undone) || supersededIds.has(row.id);
    if (!isEffectivelyUndone) {
      if (row.direction === 'credit') {
        running += row.amount;
        totalCredit += row.amount;
      } else {
        running -= row.amount;
        totalPayments += row.amount;
        lastPayDate = row.date;
      }
      lastTxDate = row.date;

      const month = row.date.slice(0, 7);
      const m = monthMap.get(month) ?? { month, credit: 0, payment: 0, count: 0 };
      if (row.direction === 'credit') m.credit += row.amount;
      else m.payment += row.amount;
      m.count++;
      monthMap.set(month, m);
    }

    return {
      id: row.id,
      date: row.date,
      createdAt: row.created_at,
      direction: row.direction,
      amount: row.amount,
      note: row.note ?? undefined,
      undone: isEffectivelyUndone,
      reversalOfId: row.reversal_of_id ?? undefined,
      runningBalance: running,
    };
  });

  // Apply optional date/search filters while preserving each entry's true running balance
  const startDate = options.startDate?.trim() || '';
  const endDate = options.endDate?.trim() || '';
  const q = (options.search ?? '').trim().toLowerCase();

  const filteredEntries = withRunning
    .filter((e) => {
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      if (q) {
        const matchNote = (e.note ?? '').toLowerCase().includes(q);
        const matchAmt = String(e.amount).includes(q);
        const matchDir = e.direction.includes(q);
        if (!matchNote && !matchAmt && !matchDir) return false;
      }
      return true;
    })
    .reverse(); // newest first for UI display

  const netOutstanding = sqlBal?.outstanding ?? running;
  const daysSinceLastPayment =
    lastPayDate !== null
      ? daysBetweenISO(lastPayDate, todayISO)
      : netOutstanding > 0 && lastTxDate
      ? daysBetweenISO(lastTxDate, todayISO)
      : null;

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      tag: customer.tag ?? undefined,
      remindersOptIn: Boolean(customer.reminders_opt_in),
      createdAt: customer.created_at,
    },
    summary: {
      outstanding: netOutstanding,
      totalCredit: sqlBal?.totalCredit ?? totalCredit,
      totalPayments: sqlBal?.totalPayments ?? totalPayments,
      transactionCount:
        sqlBal?.activeEntryCount ??
        allEntries.filter((e) => !e.undone && !supersededIds.has(e.id)).length,
      lastTransactionDate: lastTxDate,
      lastPaymentDate: lastPayDate,
      daysSinceLastPayment,
    },
    monthlyActivity: [...monthMap.values()].sort((a, b) =>
      b.month.localeCompare(a.month)
    ),
    entries: filteredEntries,
  };
}

// ============================================================================
// Feature 5: Natural-Language Smart Transaction Search
// ============================================================================

const WORD_TO_SMALL_INT: Record<string, number> = {
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
  paanch: 5,
  panch: 5,
  das: 10,
};

export function searchTransactionsSmart(
  db: Database.Database,
  storeId: number,
  rawQuery: string,
  explicitFilters: {
    direction?: 'all' | 'credit' | 'payment';
    startDate?: string;
    endDate?: string;
    includeUndone?: boolean;
  } = {},
  now: Date = new Date()
): SmartTransactionSearchResponse {
  const { customers, entries } = loadStoreLedger(db, storeId);
  const q = rawQuery.trim();
  const lower = q.toLowerCase();
  const todayISO = getTodayISO(now);
  const yesterdayISO = getOffsetDateISO(-1, now);
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;
  const weekStartISO = getOffsetDateISO(-6, now);

  let direction: 'all' | 'credit' | 'payment' = explicitFilters.direction ?? 'all';
  let startDate = explicitFilters.startDate?.trim() || '';
  let endDate = explicitFilters.endDate?.trim() || '';
  let minAmount: number | null = null;
  let maxAmount: number | null = null;
  let limitCount: number | null = null;
  let matchedCustomerIds: Set<string> | null = null;
  let freeTextSearch = '';

  const reasons: string[] = [];

  if (q) {
    // Direction intent
    if (direction === 'all') {
      if (/\b(?:payment|payments|paid|collection|jama|vasooli|received|diye|mila)\b/i.test(lower)) {
        direction = 'payment';
        reasons.push('Payments');
      } else if (/\b(?:credit|credits|udhaar|udhar|baki|baaki|saala|sala)\b/i.test(lower)) {
        direction = 'credit';
        reasons.push('Credit (Udhaar)');
      }
    }

    // Date intent
    if (!startDate && !endDate) {
      if (/\b(?:yesterday|yesterday's|kal|ninne)\b/i.test(lower)) {
        startDate = yesterdayISO;
        endDate = yesterdayISO;
        reasons.push(`Yesterday (${yesterdayISO})`);
      } else if (/\b(?:today|today's|aaj|ivattu)\b/i.test(lower)) {
        startDate = todayISO;
        endDate = todayISO;
        reasons.push(`Today (${todayISO})`);
      } else if (/\b(?:this\s+month|current\s+month|is\s+mahine)\b/i.test(lower)) {
        startDate = monthStartISO;
        endDate = todayISO;
        reasons.push(`This month (${monthStartISO} to ${todayISO})`);
      } else if (/\b(?:this\s+week|last\s+7\s+days|past\s+week|is\s+hafte)\b/i.test(lower)) {
        startDate = weekStartISO;
        endDate = todayISO;
        reasons.push(`This week (${weekStartISO} to ${todayISO})`);
      }
    }

    // Amount threshold intent ("above 1,000 rupees", "over 500", "under 300")
    const aboveMatch = lower.match(
      /(?:above|over|more\s+than|greater\s+than|>=?)\s*₹?\s*([\d,]+)/i
    );
    const belowMatch = lower.match(
      /(?:below|under|less\s+than|<=?)\s*₹?\s*([\d,]+)/i
    );
    if (aboveMatch) {
      const val = Number(aboveMatch[1].replace(/,/g, ''));
      if (Number.isFinite(val)) {
        minAmount = val;
        reasons.push(`Amount > ₹${formatINRNumber(val)}`);
      }
    }
    if (belowMatch) {
      const val = Number(belowMatch[1].replace(/,/g, ''));
      if (Number.isFinite(val)) {
        maxAmount = val;
        reasons.push(`Amount < ₹${formatINRNumber(val)}`);
      }
    }

    // Limit intent ("last 5 transactions", "last five transactions", "top 10")
    const lastMatch = lower.match(
      /\b(?:last|recent|latest)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|paanch|panch|das)\b/i
    );
    if (lastMatch) {
      const rawN = lastMatch[1].toLowerCase();
      limitCount = WORD_TO_SMALL_INT[rawN] ?? Number(rawN);
      if (limitCount && Number.isFinite(limitCount)) {
        reasons.push(`Last ${limitCount}`);
      }
    }

    // Customer name matching against actual store customers
    const matchedCustomers = customers.filter((c) => {
      const full = c.name.toLowerCase();
      const first = full.split(/\s+/)[0] ?? '';
      return (
        lower.includes(full) ||
        (first.length >= 3 &&
          new RegExp(`\\b${escapeRegex(first)}(?:'s)?\\b`, 'i').test(lower))
      );
    });
    if (matchedCustomers.length > 0) {
      matchedCustomerIds = new Set(matchedCustomers.map((c) => c.id));
      reasons.push(
        matchedCustomers.length === 1
          ? `Customer: ${matchedCustomers[0].name}`
          : `Customers: ${matchedCustomers.map((c) => c.name).join(', ')}`
      );
    }

    // If no structured clauses matched, fall back to substring search across name, note, amount
    if (reasons.length === 0) {
      freeTextSearch = lower;
      reasons.push(`Matching "${q}"`);
    }
  }

  const includeUndone = explicitFilters.includeUndone ?? true;
  let filtered = entries.filter((e) => {
    if (!includeUndone && e.undone) return false;
    if (direction !== 'all' && e.direction !== direction) return false;
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    if (minAmount !== null && e.amount <= minAmount) return false;
    if (maxAmount !== null && e.amount >= maxAmount) return false;
    if (matchedCustomerIds && !matchedCustomerIds.has(e.customer_id)) return false;
    if (freeTextSearch) {
      const hit =
        e.customer_name.toLowerCase().includes(freeTextSearch) ||
        (e.note ?? '').toLowerCase().includes(freeTextSearch) ||
        String(e.amount).includes(freeTextSearch);
      if (!hit) return false;
    }
    return true;
  });

  if (limitCount && limitCount > 0) {
    filtered = filtered.slice(0, limitCount);
  }

  let totalCredit = 0;
  let totalPayments = 0;
  for (const e of filtered) {
    if (e.undone) continue;
    if (e.direction === 'credit') totalCredit += e.amount;
    else totalPayments += e.amount;
  }

  return {
    query: q,
    appliedFilterSummary:
      reasons.length > 0
        ? `${reasons.join(' · ')} (${filtered.length} found)`
        : `Showing all ${filtered.length} transactions`,
    totalAmount: totalCredit + totalPayments,
    totalCredit,
    totalPayments,
    entries: filtered.map(mapEntryToFrontend),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Feature 3: Smart Payment Reminders
// ============================================================================

export function buildPoliteReminderTemplate(params: {
  customerName: string;
  shopName: string;
  amount: number;
  language: ReminderLanguage;
  daysOverdue?: number | null;
}): string {
  const amt = formatINRNumber(Math.max(0, Math.round(params.amount)));
  const name = params.customerName.trim();
  const shop = params.shopName.trim();

  switch (params.language) {
    case 'hi':
      return `नमस्ते ${name} जी, ${shop} की ओर से विनम्र निवेदन है कि आपका ₹${amt} का बकाया राशि शेष है। कृपया अपनी सुविधा के अनुसार भुगतान करने की कृपा करें। धन्यवाद।`;
    case 'hinglish':
      return `Namaste ${name} ji, ${shop} se vinamra nivedan hai ki aapka ₹${amt} ka baaki khata pending hai. Kripya apni suvidha anusar payment kar dein. Dhanyavaad!`;
    case 'kn':
      return `ನಮಸ್ಕಾರ ${name} ಅವರೇ, ${shop} ವತಿಯಿಂದ ವಿನಮ್ರ ವಿನಂತಿ — ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ₹${amt} ಬಾಕಿ ಇದೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಅನುಕೂಲಕ್ಕೆ ತಕ್ಕಂತೆ ಪಾವತಿಸಿ. ಧನ್ಯವಾದಗಳು.`;
    case 'ta':
      return `வணக்கம் ${name} அவர்களே, ${shop} சார்பாக அன்பான நினைவூட்டல்: உங்கள் கணக்கில் ₹${amt} நிலுவையில் உள்ளது. தயவுசெய்து உங்கள் வசதிக்கேற்ப செலுத்தவும். நன்றி.`;
    case 'te':
      return `నమస్కారం ${name} గారు, ${shop} నుండి వినయపూర్వకమైన విజ్ఞప్తి — మీ ఖాతాలో ₹${amt} బకాయి ఉంది. దయచేసి మీ వీలును బట్టి చెల్లించగలరు. ధన్యవాదాలు.`;
    case 'mr':
      return `नमस्कार ${name} जी, ${shop} कडून नम्र विनंती आहे की आपली ₹${amt} रक्कम बाकी आहे. कृपया आपल्या सोयीनुसार पेमेंट करावे. धन्यवाद.`;
    case 'bn':
      return `নমস্কার ${name} জি, ${shop}-এর পক্ষ থেকে বিনীত অনুরোধ, আপনার খাতায় ₹${amt} বাকি আছে। অনুগ্রহ করে আপনার সুবিধামতো পরিশোধ করুন। ধন্যবাদ।`;
    case 'en':
    default:
      return `Hello ${name}, a polite reminder from ${shop}: your pending khata balance is ₹${amt}. Kindly clear it at your convenience. Thank you for your continued patronage!`;
  }
}

export async function generateSmartReminderMessage(params: {
  customerName: string;
  shopName: string;
  amount: number;
  language: ReminderLanguage;
  daysOverdue?: number | null;
  useAiPolish?: boolean;
}): Promise<{ message: string; generatedBy: 'gemini-4-hydrogen' | 'template' }> {
  const fallback = buildPoliteReminderTemplate(params);
  if (!params.useAiPolish) {
    return { message: fallback, generatedBy: 'template' };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return { message: fallback, generatedBy: 'template' };
  }

  const formattedAmt = formatINRNumber(Math.max(0, Math.round(params.amount)));
  const langLabelMap: Record<ReminderLanguage, string> = {
    en: 'polite Indian English',
    hi: 'polite Hindi in Devanagari script',
    hinglish: 'polite Hinglish (Hindi written in English script)',
    kn: 'polite Kannada in Kannada script',
    ta: 'polite Tamil in Tamil script',
    te: 'polite Telugu in Telugu script',
    mr: 'polite Marathi in Devanagari script',
    bn: 'polite Bengali in Bengali script',
  };

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Write a short, warm, respectful WhatsApp payment reminder (2 sentences max, no pressure, no emojis spam) for an Indian kirana shopkeeper to send a valued regular customer.
Shop name: ${params.shopName}
Customer name: ${params.customerName}
Exact pending balance: ₹${formattedAmt}
Language: ${langLabelMap[params.language] ?? 'polite Indian English'}
Rules:
- MUST include the exact amount ₹${formattedAmt} and shop name "${params.shopName}".
- Do NOT claim payment is legally overdue or use threatening language.
- Output ONLY the message text, nothing else.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
    ]);

    const candidate = response?.text?.trim();
    // Safety verification: AI message MUST contain the exact rupee digits so it never hallucinates amounts
    const plainDigits = String(Math.round(params.amount));
    if (
      candidate &&
      candidate.length >= 20 &&
      candidate.length <= 450 &&
      (candidate.includes(formattedAmt) || candidate.includes(plainDigits))
    ) {
      return { message: candidate, generatedBy: 'gemini-4-hydrogen' };
    }
  } catch {
    // Fall back safely to verified deterministic template
  }

  return { message: fallback, generatedBy: 'template' };
}

export function getRemindersOverview(
  db: Database.Database,
  storeId: number,
  sortBy: 'amount' | 'overdue' = 'amount',
  now: Date = new Date()
): {
  pendingCustomers: ReminderPendingCustomer[];
  history: Array<{
    id: string;
    customerId: string;
    customerName: string;
    amountDue: number;
    language: string;
    message: string;
    channel: string;
    status: PaymentReminderRow['status'];
    customerResponse?: string;
    createdAt: string;
    sentAt?: string;
  }>;
  summary: {
    pendingCustomerCount: number;
    totalPendingAmount: number;
    overdue30dCount: number;
    remindersSentCount: number;
  };
} {
  const intel = computeCustomerIntelligence(db, storeId, '', now);
  const reminderRows = db
    .prepare(
      'SELECT * FROM payment_reminders WHERE store_id = ? ORDER BY created_at DESC LIMIT 100'
    )
    .all(storeId) as PaymentReminderRow[];

  const nowMs = now.getTime();
  const cooldownMs = 24 * 60 * 60 * 1000; // 24-hour duplicate reminder guard

  const remindersByCustomer = new Map<string, PaymentReminderRow[]>();
  for (const r of reminderRows) {
    const arr = remindersByCustomer.get(r.customer_id) ?? [];
    arr.push(r);
    remindersByCustomer.set(r.customer_id, arr);
  }

  const pendingCustomers: ReminderPendingCustomer[] = intel.customers
    .filter((c) => c.outstanding > 0)
    .map((c) => {
      const custReminders = remindersByCustomer.get(c.customerId) ?? [];
      const lastSent = custReminders.find(
        (r) =>
          r.status === 'marked_sent' ||
          r.status === 'opened_whatsapp' ||
          r.status === 'customer_responded'
      );
      const lastSentTs = lastSent
        ? new Date(lastSent.sent_at || lastSent.created_at).getTime()
        : 0;
      const recentReminderWarning =
        lastSentTs > 0 && nowMs - lastSentTs < cooldownMs;

      const days = c.daysSinceLastPayment ?? 0;
      const overdueStatus: ReminderPendingCustomer['overdueStatus'] =
        days >= 30 ? 'overdue_30d' : days >= 14 ? 'overdue_14d' : 'due';

      return {
        customerId: c.customerId,
        name: c.name,
        phone: c.phone,
        tag: c.tag,
        remindersOptIn: c.remindersOptIn,
        outstanding: c.outstanding,
        lastPaymentDate: c.lastPaymentDate,
        lastTransactionDate: c.lastTransactionDate,
        daysSinceLastPayment: c.daysSinceLastPayment,
        overdueStatus,
        lastReminderSentAt: lastSent ? lastSent.sent_at || lastSent.created_at : null,
        recentReminderWarning,
        reminderCount: custReminders.length,
      };
    });

  if (sortBy === 'overdue') {
    pendingCustomers.sort(
      (a, b) =>
        (b.daysSinceLastPayment ?? -1) - (a.daysSinceLastPayment ?? -1) ||
        b.outstanding - a.outstanding
    );
  } else {
    pendingCustomers.sort((a, b) => b.outstanding - a.outstanding);
  }

  const totalPendingAmount = pendingCustomers.reduce(
    (sum, c) => sum + c.outstanding,
    0
  );
  const overdue30dCount = pendingCustomers.filter(
    (c) => c.overdueStatus === 'overdue_30d'
  ).length;
  const remindersSentCount = reminderRows.filter(
    (r) => r.status === 'marked_sent' || r.status === 'customer_responded'
  ).length;

  return {
    pendingCustomers,
    history: reminderRows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      amountDue: r.amount_due,
      language: r.language,
      message: r.message,
      channel: r.channel,
      status: r.status,
      customerResponse: r.customer_response ?? undefined,
      createdAt: r.created_at,
      sentAt: r.sent_at ?? undefined,
    })),
    summary: {
      pendingCustomerCount: pendingCustomers.length,
      totalPendingAmount,
      overdue30dCount,
      remindersSentCount,
    },
  };
}

// ============================================================================
// Feature 1: Khata AI Assistant (Deterministic SQLite BI + Gemini Phrasing)
// ============================================================================

type BiIntent =
  | 'today_udhaar'
  | 'today_collection'
  | 'today_summary'
  | 'today_count'
  | 'total_outstanding'
  | 'top_pending_customers'
  | 'overdue_customers'
  | 'monthly_collection'
  | 'weekly_comparison'
  | 'highest_outstanding_customer'
  | 'highest_credit_transactions'
  | 'customer_history'
  | 'customer_balance'
  | 'smart_search_transactions'
  | 'smart_search_customers'
  | 'profit_refusal'
  | 'write_refusal'
  | 'general_overview';

interface ResolvedChatPlan {
  intent: BiIntent;
  customerName?: string;
  limit?: number;
  daysThreshold?: number;
  replyLanguage: LanguageCode;
}

function detectLanguageFromText(text: string, fallback: LanguageCode): LanguageCode {
  if (/[\u0c80-\u0cff]/.test(text)) return 'kn';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  if (/[\u0b80-\u0bff]/.test(text)) return 'ta';
  if (/[\u0c00-\u0c7f]/.test(text)) return 'te';
  if (/[\u0980-\u09ff]/.test(text)) return 'bn';
  return fallback;
}

function matchCustomerInText(
  text: string,
  customers: CustomerRow[]
): CustomerRow | null {
  const lower = text.toLowerCase();
  // Prefer full name match first
  const sorted = [...customers].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    if (lower.includes(c.name.toLowerCase())) {
      return c;
    }
  }
  for (const c of sorted) {
    const first = c.name.toLowerCase().split(/\s+/)[0] ?? '';
    if (
      first.length >= 3 &&
      new RegExp(`\\b${escapeRegex(first)}(?:'s)?\\b`, 'i').test(lower)
    ) {
      return c;
    }
  }
  return null;
}

function extractContextFromRecentMessages(
  messages: ChatMessageRow[]
): { lastCustomerId?: string; lastCustomerName?: string; lastIntent?: string } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.metadata_json) {
      const meta = safeJsonParse(m.metadata_json) as ChatMessageMetadata | null;
      if (meta?.context?.lastCustomerId || meta?.context?.lastCustomerName) {
        return meta.context;
      }
    }
  }
  return {};
}

function classifyBiIntentDeterministic(
  message: string,
  customers: CustomerRow[],
  prevContext: { lastCustomerId?: string; lastCustomerName?: string; lastIntent?: string },
  defaultLang: LanguageCode
): ResolvedChatPlan {
  const lower = message.trim().toLowerCase();
  const replyLanguage = detectLanguageFromText(message, defaultLang);
  const directCustomer = matchCustomerInText(message, customers);

  // Follow-up pronoun detection ("his", "her", "their", "unka", "uska", "what about their history")
  const hasPronounFollowUp =
    !directCustomer &&
    Boolean(prevContext.lastCustomerName) &&
    /\b(?:his|her|their|them|him|unka|unki|uska|uski|avara|that\s+customer|same\s+customer)\b/i.test(
      lower
    );
  const resolvedCustomerName =
    directCustomer?.name ?? (hasPronounFollowUp ? prevContext.lastCustomerName : undefined);

  // Safety refusal 1: Profit/margin without cost data
  if (
    /\b(?:profit|margin|net\s+income|earning|munafa|laabh|लाभ|ಮುನಾಫ|ಲಾಭ)\b/i.test(lower)
  ) {
    return { intent: 'profit_refusal', replyLanguage };
  }

  // Safety refusal 2: Direct ledger mutation request inside read-only chatbot
  const isDestructiveWrite =
    /\b(?:delete|remove|erase|drop|wipe)\b.*\b(?:entry|entries|transaction|transactions|customer|khata|record|database|data)\b/i.test(
      lower
    ) ||
    /\b(?:clear\s+khata|update\s+balance|mark\s+(?:as\s+)?paid|modify\s+(?:entry|transaction|balance))\b/i.test(
      lower
    );
  const isAmountWrite =
    /\b(?:add|record|write|likho|credit|debit)\b/i.test(lower) &&
    extractAmount(message) !== null &&
    !/\b(?:how\s+much|kitna|kitni|above|over|more\s+than|below|under|less\s+than|last|top|show|find|list|what|which)\b/i.test(
      lower
    );
  if (isDestructiveWrite || isAmountWrite) {
    return { intent: 'write_refusal', replyLanguage };
  }

  // Weekly comparison ("compare this week's credit with last week")
  if (
    /\b(?:compare|comparison|vs|versus)\b/i.test(lower) &&
    /\b(?:week|hafte|ವಾರ)\b/i.test(lower)
  ) {
    return { intent: 'weekly_comparison', replyLanguage };
  }

  // Highest credit transactions
  if (
    /\b(?:highest|biggest|largest|top)\b/i.test(lower) &&
    /\b(?:credit|udhaar|udhar|transaction|transactions|entry|entries)\b/i.test(lower) &&
    !/\b(?:customer|customers|who)\b/i.test(lower)
  ) {
    const nMatch = lower.match(/\b(\d+)\b/);
    return {
      intent: 'highest_credit_transactions',
      limit: nMatch ? Math.min(15, Math.max(1, Number(nMatch[1]))) : 5,
      replyLanguage,
    };
  }

  // Top N customers with pending payments
  if (
    /\b(?:top|highest|biggest|most)\b/i.test(lower) &&
    /\b(?:customers?|pending|outstanding|udhaar|udhar|due|bakaya|baaki)\b/i.test(lower)
  ) {
    const nMatch = lower.match(/\btop\s+(\d+)\b/i);
    if (
      !nMatch &&
      /\b(?:which\s+customer|who\s+has\s+the\s+highest|single\s+highest)\b/i.test(lower)
    ) {
      return { intent: 'highest_outstanding_customer', replyLanguage };
    }
    return {
      intent: 'top_pending_customers',
      limit: nMatch ? Math.min(15, Math.max(1, Number(nMatch[1]))) : 5,
      replyLanguage,
    };
  }

  // Which customer has the highest outstanding balance
  if (
    /\b(?:which\s+customer|who)\b/i.test(lower) &&
    /\b(?:highest|most|maximum|biggest)\b/i.test(lower)
  ) {
    return { intent: 'highest_outstanding_customer', replyLanguage };
  }

  // Overdue / not paid for N days
  if (
    /\b(?:not\s+paid|haven't\s+paid|have\s+not\s+paid|no\s+payment|overdue|unpaid)\b/i.test(
      lower
    )
  ) {
    const daysMatch = lower.match(/(\d+)\s*days?/i);
    return {
      intent: 'overdue_customers',
      daysThreshold: daysMatch ? Math.max(1, Number(daysMatch[1])) : 30,
      replyLanguage,
    };
  }

  // Customer complete history / transactions
  if (
    resolvedCustomerName &&
    /\b(?:history|transactions?|ledger|statement|entries|last\s+\d+|last\s+five|all\s+entries|hisaab|hisab)\b/i.test(
      lower
    )
  ) {
    const lastN = lower.match(
      /\b(?:last|recent)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
    );
    const limit = lastN
      ? WORD_TO_SMALL_INT[lastN[1].toLowerCase()] ?? Number(lastN[1])
      : 20;
    return {
      intent: 'customer_history',
      customerName: resolvedCustomerName,
      limit,
      replyLanguage,
    };
  }

  // Customer specific balance / summary
  if (resolvedCustomerName) {
    return {
      intent: 'customer_balance',
      customerName: resolvedCustomerName,
      replyLanguage,
    };
  }

  // How many transactions did I record today?
  if (
    /\b(?:how\s+many|count|number\s+of)\b/i.test(lower) &&
    /\b(?:transactions?|entries|entries?)\b/i.test(lower)
  ) {
    return { intent: 'today_count', replyLanguage };
  }

  // Monthly collection / summary
  if (/\b(?:this\s+month|monthly|mahine|ತಿಂಗಳ)\b/i.test(lower)) {
    if (/\b(?:added|new\s+customers?)\b/i.test(lower)) {
      return { intent: 'smart_search_customers', replyLanguage };
    }
    return { intent: 'monthly_collection', replyLanguage };
  }

  // Today's udhaar given
  if (
    /\b(?:today|aaj|ಇಂದು|ivattu)\b/i.test(lower) &&
    /\b(?:udhaar|udhar|credit|gave|given|ಸಾಲ)\b/i.test(lower) &&
    !/\b(?:payment|collect|collected|mila|jama|received|ಪಾವತಿ)\b/i.test(lower)
  ) {
    return { intent: 'today_udhaar', replyLanguage };
  }

  // Today's payment collected
  if (
    /\b(?:today|aaj|ಇಂದು|ivattu)\b/i.test(lower) &&
    /\b(?:payment|payments|collect|collected|collection|mila|jama|vasooli|received|ಪಾವತಿ|ಜಮಾ)\b/i.test(
      lower
    )
  ) {
    return { intent: 'today_collection', replyLanguage };
  }

  // Today's combined summary
  if (/\b(?:today|aaj|ಇಂದು|ivattu)\b/i.test(lower)) {
    return { intent: 'today_summary', replyLanguage };
  }

  // Total outstanding / pending collection
  if (
    /\b(?:total\s+outstanding|total\s+pending|pending\s+collection|overall\s+balance|kul\s+baaki|ಒಟ್ಟು\s+ಬಾಕಿ|how\s+much\s+is\s+my\s+pending)\b/i.test(
      lower
    ) ||
    (/\b(?:outstanding|pending|baaki|bakaya)\b/i.test(lower) &&
      !/\b(?:more\s+than|above|over)\b/i.test(lower))
  ) {
    return { intent: 'total_outstanding', replyLanguage };
  }

  // Smart search transactions ("yesterday's payments", "above 1000")
  if (
    /\b(?:yesterday|above|over|below|under|transactions?)\b/i.test(lower) &&
    !/\b(?:customers?)\b/i.test(lower)
  ) {
    return { intent: 'smart_search_transactions', replyLanguage };
  }

  // Smart search customers ("customers with more than 2000 pending")
  if (/\b(?:customers?|more\s+than|find)\b/i.test(lower)) {
    return { intent: 'smart_search_customers', replyLanguage };
  }

  return { intent: 'general_overview', replyLanguage };
}

async function refineIntentWithGeminiIfNeeded(
  message: string,
  deterministicPlan: ResolvedChatPlan,
  customers: CustomerRow[],
  prevContext: { lastCustomerName?: string; lastIntent?: string }
): Promise<ResolvedChatPlan> {
  // Only invoke Gemini for intent classification if the deterministic classifier fell back to general_overview
  if (deterministicPlan.intent !== 'general_overview') {
    return deterministicPlan;
  }
  const ai = getGeminiClient();
  if (!ai) return deterministicPlan;

  const customerList = customers
    .slice(0, 40)
    .map((c) => c.name)
    .join(', ');

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Classify this Indian kirana shopkeeper business intelligence question into one intent.
Message: "${message}"
Previous customer in conversation: "${prevContext.lastCustomerName ?? 'none'}"
Known store customers: ${customerList || 'none'}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                enum: [
                  'today_udhaar',
                  'today_collection',
                  'today_summary',
                  'today_count',
                  'total_outstanding',
                  'top_pending_customers',
                  'overdue_customers',
                  'monthly_collection',
                  'weekly_comparison',
                  'highest_outstanding_customer',
                  'highest_credit_transactions',
                  'customer_history',
                  'customer_balance',
                  'smart_search_transactions',
                  'smart_search_customers',
                  'profit_refusal',
                  'write_refusal',
                  'general_overview',
                ],
              },
              customerName: { type: Type.STRING },
              limit: { type: Type.INTEGER },
              daysThreshold: { type: Type.INTEGER },
            },
            required: ['intent'],
          },
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);

    const raw = response?.text?.trim();
    if (!raw) return deterministicPlan;
    const parsed = JSON.parse(raw) as Partial<ResolvedChatPlan>;
    if (parsed.intent) {
      return {
        intent: parsed.intent,
        customerName: parsed.customerName || deterministicPlan.customerName,
        limit: parsed.limit || deterministicPlan.limit,
        daysThreshold: parsed.daysThreshold || deterministicPlan.daysThreshold,
        replyLanguage: deterministicPlan.replyLanguage,
      };
    }
  } catch {
    // Fallback cleanly
  }
  return deterministicPlan;
}

async function polishAnswerWithGemini(params: {
  question: string;
  draftAnswer: string;
  facts: Record<string, unknown>;
  language: LanguageCode;
  shopName: string;
}): Promise<{ text: string; poweredBy: 'gemini-4-hydrogen' | 'deterministic-bi' }> {
  const ai = getGeminiClient();
  if (!ai) {
    return { text: params.draftAnswer, poweredBy: 'deterministic-bi' };
  }

  const langNames: Record<LanguageCode, string> = {
    en: 'clear Indian English',
    hi: 'natural Hindi (Devanagari)',
    kn: 'natural Kannada',
    ta: 'natural Tamil',
    te: 'natural Telugu',
    mr: 'natural Marathi',
    bn: 'natural Bengali',
  };

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are "Khata AI Assistant" for "${params.shopName}".
Rewrite the verified business intelligence answer below in 1-3 concise, warm, clear sentences for the shopkeeper in ${langNames[params.language] ?? 'clear English'}.
Shopkeeper question: "${params.question}"
Verified database facts (DO NOT alter, round differently, or invent ANY number or customer name):
${JSON.stringify(params.facts)}
Verified draft answer:
${params.draftAnswer}

Strict rules:
- Use ONLY numbers present in Verified database facts.
- Never invent profit, cost, or missing dates.
- Never use markdown headers (#) or raw JSON. Plain conversational text only.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3800)),
    ]);

    const out = response?.text?.trim();
    if (out && out.length >= 12 && out.length <= 700) {
      return { text: out, poweredBy: 'gemini-4-hydrogen' };
    }
  } catch {
    // Graceful fallback to deterministic answer
  }

  return { text: params.draftAnswer, poweredBy: 'deterministic-bi' };
}

export function listChatSessions(
  db: Database.Database,
  storeId: number
): ChatSessionDto[] {
  const rows = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as msg_count
       FROM chat_sessions s
       WHERE s.store_id = ?
       ORDER BY s.updated_at DESC
       LIMIT 30`
    )
    .all(storeId) as Array<ChatSessionRow & { msg_count: number }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.msg_count,
  }));
}

export function createChatSession(
  db: Database.Database,
  storeId: number,
  title = 'New Khata Chat'
): ChatSessionDto {
  const id = makeId('chat', storeId);
  const nowIso = new Date().toISOString();
  db.prepare(
    'INSERT INTO chat_sessions (id, store_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, storeId, title.slice(0, 80), nowIso, nowIso);
  return {
    id,
    title: title.slice(0, 80),
    createdAt: nowIso,
    updatedAt: nowIso,
    messageCount: 0,
  };
}

export function getChatSessionMessages(
  db: Database.Database,
  storeId: number,
  sessionId: string
): ChatMessageDto[] | null {
  const session = db
    .prepare('SELECT id FROM chat_sessions WHERE id = ? AND store_id = ?')
    .get(sessionId, storeId) as { id: string } | undefined;
  if (!session) return null;

  const rows = db
    .prepare(
      'SELECT * FROM chat_messages WHERE session_id = ? AND store_id = ? ORDER BY created_at ASC'
    )
    .all(sessionId, storeId) as ChatMessageRow[];

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    metadata: r.metadata_json
      ? (safeJsonParse(r.metadata_json) as ChatMessageMetadata)
      : undefined,
    createdAt: r.created_at,
  }));
}

export async function handleBusinessChatTurn(
  db: Database.Database,
  storeId: number,
  storeName: string,
  storeLanguage: LanguageCode,
  input: {
    sessionId?: string;
    message: string;
    language?: LanguageCode;
    skipAiPolish?: boolean;
  },
  now: Date = new Date()
): Promise<{
  session: ChatSessionDto;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
}> {
  const cleanMsg = input.message.trim().slice(0, 600);
  const nowIso = now.toISOString();
  const todayISO = getTodayISO(now);

  // Resolve or create session scoped strictly to storeId
  let sessionRow: ChatSessionRow | undefined;
  if (input.sessionId) {
    sessionRow = db
      .prepare('SELECT * FROM chat_sessions WHERE id = ? AND store_id = ?')
      .get(input.sessionId, storeId) as ChatSessionRow | undefined;
  }
  if (!sessionRow) {
    const title = cleanMsg.length > 48 ? `${cleanMsg.slice(0, 48)}...` : cleanMsg;
    const created = createChatSession(db, storeId, title || 'Khata Business Chat');
    sessionRow = db
      .prepare('SELECT * FROM chat_sessions WHERE id = ?')
      .get(created.id) as ChatSessionRow;
  }

  // Load recent conversation turns for follow-up context
  const recentRows = db
    .prepare(
      'SELECT * FROM chat_messages WHERE session_id = ? AND store_id = ? ORDER BY created_at DESC LIMIT 8'
    )
    .all(sessionRow.id, storeId) as ChatMessageRow[];
  recentRows.reverse();
  const prevContext = extractContextFromRecentMessages(recentRows);

  // Persist user message
  const userMsgId = makeId('msg', storeId);
  db.prepare(
    'INSERT INTO chat_messages (id, session_id, store_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
  ).run(userMsgId, sessionRow.id, storeId, 'user', cleanMsg, nowIso);

  const { customers, entries } = loadStoreLedger(db, storeId);
  const effectiveLang = input.language ?? storeLanguage;

  const deterministicPlan = classifyBiIntentDeterministic(
    cleanMsg,
    customers,
    prevContext,
    effectiveLang
  );
  const plan = input.skipAiPolish
    ? deterministicPlan
    : await refineIntentWithGeminiIfNeeded(
        cleanMsg,
        deterministicPlan,
        customers,
        prevContext
      );

  // Deterministic SQLite Execution — EVERY number comes strictly from real DB records
  let draftAnswer = '';
  let facts: Record<string, unknown> = {};
  let cards: ChatMetricCard[] = [];
  let table: ChatTableData | undefined;
  let dateRange: ChatMessageMetadata['dateRange'];
  let followUps: string[] = [];
  let nextContext: ChatMessageMetadata['context'] = {
    lastIntent: plan.intent,
    lastCustomerId: prevContext.lastCustomerId,
    lastCustomerName: prevContext.lastCustomerName,
  };

  if (plan.intent === 'profit_refusal') {
    draftAnswer =
      'I cannot calculate profit because your khata tracks credit (udhaar), payments collected, and pending balances — not item purchase costs or selling prices. I can show your total collections, credit given, or outstanding balance instead.';
    facts = { note: 'Profit not available without purchase cost and selling price.' };
    followUps = [
      'What is my total collection this month?',
      'How much udhaar did I give today?',
      'What is my total outstanding balance?',
    ];
  } else if (plan.intent === 'write_refusal') {
    draftAnswer =
      'For financial safety, Khata AI Assistant is read-only and never directly modifies your ledger. Please use Voice Khata or the Add Udhaar / Payment button to record and confirm transactions.';
    facts = { readOnly: true };
    followUps = [
      'How much udhaar did I give today?',
      'What is my total outstanding balance?',
    ];
  } else if (plan.intent === 'today_udhaar') {
    const daily = computeEnhancedReport(db, storeId, { period: 'daily' }, now);
    dateRange = { startDate: daily.startDate, endDate: daily.endDate, label: `Today (${daily.startDate})` };
    draftAnswer = `Today (${daily.startDate}), you gave ₹${formatINRNumber(daily.totalCredit)} in credit (udhaar) across ${daily.creditCount} ${daily.creditCount === 1 ? 'transaction' : 'transactions'}.`;
    facts = { date: daily.startDate, todayCredit: daily.totalCredit, creditCount: daily.creditCount };
    cards = [
      { label: "Today's Udhaar", value: `₹${formatINRNumber(daily.totalCredit)}`, tone: 'credit' },
      { label: 'Credit Entries', value: String(daily.creditCount), tone: 'neutral' },
      { label: "Today's Collection", value: `₹${formatINRNumber(daily.totalPayments)}`, tone: 'payment' },
    ];
    followUps = [
      'How much payment did I collect today?',
      'How many transactions did I record today?',
      'What is my total outstanding balance?',
    ];
  } else if (plan.intent === 'today_collection') {
    const daily = computeEnhancedReport(db, storeId, { period: 'daily' }, now);
    dateRange = { startDate: daily.startDate, endDate: daily.endDate, label: `Today (${daily.startDate})` };
    draftAnswer = `Today (${daily.startDate}), you collected ₹${formatINRNumber(daily.totalPayments)} in payments across ${daily.paymentCount} ${daily.paymentCount === 1 ? 'transaction' : 'transactions'}.`;
    facts = { date: daily.startDate, todayPayments: daily.totalPayments, paymentCount: daily.paymentCount };
    cards = [
      { label: "Today's Collection", value: `₹${formatINRNumber(daily.totalPayments)}`, tone: 'payment' },
      { label: 'Payment Entries', value: String(daily.paymentCount), tone: 'neutral' },
      { label: "Today's Udhaar", value: `₹${formatINRNumber(daily.totalCredit)}`, tone: 'credit' },
    ];
    followUps = [
      'How much udhaar did I give today?',
      'What is my total collection this month?',
      'Who are my top 5 customers with pending payments?',
    ];
  } else if (plan.intent === 'today_count') {
    const daily = computeEnhancedReport(db, storeId, { period: 'daily' }, now);
    dateRange = { startDate: daily.startDate, endDate: daily.endDate, label: `Today (${daily.startDate})` };
    draftAnswer = `Today (${daily.startDate}), you recorded ${daily.entryCount} ${daily.entryCount === 1 ? 'transaction' : 'transactions'}: ${daily.creditCount} credit entries totaling ₹${formatINRNumber(daily.totalCredit)} and ${daily.paymentCount} payments totaling ₹${formatINRNumber(daily.totalPayments)}.`;
    facts = {
      date: daily.startDate,
      entryCount: daily.entryCount,
      creditCount: daily.creditCount,
      paymentCount: daily.paymentCount,
      totalCredit: daily.totalCredit,
      totalPayments: daily.totalPayments,
    };
    cards = [
      { label: 'Total Entries Today', value: String(daily.entryCount), tone: 'neutral' },
      { label: 'Credit Entries', value: `${daily.creditCount} (₹${formatINRNumber(daily.totalCredit)})`, tone: 'credit' },
      { label: 'Payments', value: `${daily.paymentCount} (₹${formatINRNumber(daily.totalPayments)})`, tone: 'payment' },
    ];
    followUps = [
      "Compare this week's credit with last week",
      'What is my total outstanding balance?',
    ];
  } else if (plan.intent === 'today_summary') {
    const daily = computeEnhancedReport(db, storeId, { period: 'daily' }, now);
    dateRange = { startDate: daily.startDate, endDate: daily.endDate, label: `Today (${daily.startDate})` };
    draftAnswer = `Today (${daily.startDate}): ₹${formatINRNumber(daily.totalCredit)} udhaar given, ₹${formatINRNumber(daily.totalPayments)} payments collected (${daily.entryCount} total transactions). Your overall pending balance is ₹${formatINRNumber(daily.totalOutstanding)}.`;
    facts = {
      date: daily.startDate,
      todayCredit: daily.totalCredit,
      todayPayments: daily.totalPayments,
      entryCount: daily.entryCount,
      totalOutstanding: daily.totalOutstanding,
    };
    cards = [
      { label: "Today's Udhaar", value: `₹${formatINRNumber(daily.totalCredit)}`, tone: 'credit' },
      { label: "Today's Collection", value: `₹${formatINRNumber(daily.totalPayments)}`, tone: 'payment' },
      { label: 'Total Outstanding', value: `₹${formatINRNumber(daily.totalOutstanding)}`, tone: 'neutral' },
    ];
    followUps = [
      'Who are my top 5 customers with pending payments?',
      "Compare this week's credit with last week",
    ];
  } else if (plan.intent === 'total_outstanding') {
    const intel = computeCustomerIntelligence(db, storeId, '', now);
    const pendingCount = intel.customers.filter((c) => c.outstanding > 0).length;
    dateRange = { startDate: todayISO, endDate: todayISO, label: `As of ${todayISO}` };
    draftAnswer = `Your total outstanding balance (pending collection) is ₹${formatINRNumber(intel.insights.totalOutstanding)} across ${pendingCount} ${pendingCount === 1 ? 'customer' : 'customers'} out of ${intel.insights.totalCustomers} total customers.`;
    facts = {
      asOf: todayISO,
      totalOutstanding: intel.insights.totalOutstanding,
      pendingCustomerCount: pendingCount,
      totalCustomers: intel.insights.totalCustomers,
    };
    cards = [
      { label: 'Total Outstanding', value: `₹${formatINRNumber(intel.insights.totalOutstanding)}`, tone: 'credit' },
      { label: 'Customers with Dues', value: String(pendingCount), tone: 'neutral' },
      { label: 'Overdue 30+ Days', value: String(intel.insights.noRecentPayments.length), tone: 'credit' },
    ];
    followUps = [
      'Who are my top 5 customers with pending payments?',
      'Which customers have not paid in the last 30 days?',
    ];
  } else if (plan.intent === 'top_pending_customers') {
    const limit = plan.limit ?? 5;
    const intel = computeCustomerIntelligence(db, storeId, '', now);
    const top = intel.customers
      .filter((c) => c.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, limit);
    dateRange = { startDate: todayISO, endDate: todayISO, label: `As of ${todayISO}` };
    if (top.length === 0) {
      draftAnswer = 'Great news! None of your customers currently have a pending balance.';
    } else {
      const listStr = top
        .map((c, idx) => `${idx + 1}. ${c.name} (₹${formatINRNumber(c.outstanding)})`)
        .join(', ');
      draftAnswer = `Your top ${top.length} ${top.length === 1 ? 'customer' : 'customers'} with pending payments: ${listStr}.`;
      table = {
        headers: ['Customer', 'Pending', 'Last Payment'],
        rows: top.map((c) => [
          c.name,
          `₹${formatINRNumber(c.outstanding)}`,
          c.lastPaymentDate ?? 'None yet',
        ]),
      };
      nextContext = {
        ...nextContext,
        lastCustomerId: top[0].customerId,
        lastCustomerName: top[0].name,
      };
    }
    facts = {
      asOf: todayISO,
      topPending: top.map((c) => ({ name: c.name, outstanding: c.outstanding })),
    };
    cards = [
      { label: 'Total Outstanding', value: `₹${formatINRNumber(intel.insights.totalOutstanding)}`, tone: 'credit' },
      { label: 'Top Pending Shown', value: String(top.length), tone: 'neutral' },
    ];
    followUps = top[0]
      ? [
          `Show ${top[0].name}'s complete history`,
          'Which customers have not paid in the last 30 days?',
        ]
      : ['How much udhaar did I give today?'];
  } else if (plan.intent === 'highest_outstanding_customer') {
    const intel = computeCustomerIntelligence(db, storeId, '', now);
    const top = intel.customers.filter((c) => c.outstanding > 0)[0];
    dateRange = { startDate: todayISO, endDate: todayISO, label: `As of ${todayISO}` };
    if (!top) {
      draftAnswer = 'No customer currently has an outstanding balance.';
    } else {
      draftAnswer = `${top.name} has the highest outstanding balance at ₹${formatINRNumber(top.outstanding)} (total credit ₹${formatINRNumber(top.totalCredit)}, total paid ₹${formatINRNumber(top.totalPayments)}).`;
      cards = [
        { label: 'Highest Outstanding', value: top.name, tone: 'neutral' },
        { label: 'Pending Balance', value: `₹${formatINRNumber(top.outstanding)}`, tone: 'credit' },
        { label: 'Total Paid', value: `₹${formatINRNumber(top.totalPayments)}`, tone: 'payment' },
      ];
      nextContext = {
        ...nextContext,
        lastCustomerId: top.customerId,
        lastCustomerName: top.name,
      };
      followUps = [
        `Show ${top.name}'s complete history`,
        'Who are my top 5 customers with pending payments?',
      ];
    }
    facts = top
      ? {
          customer: top.name,
          outstanding: top.outstanding,
          totalCredit: top.totalCredit,
          totalPayments: top.totalPayments,
        }
      : { customer: null };
  } else if (plan.intent === 'overdue_customers') {
    const days = plan.daysThreshold ?? 30;
    const intel = computeCustomerIntelligence(db, storeId, '', now);
    const overdue = intel.customers
      .filter(
        (c) =>
          c.outstanding > 0 &&
          (c.daysSinceLastPayment === null || c.daysSinceLastPayment >= days)
      )
      .sort(
        (a, b) =>
          (b.daysSinceLastPayment ?? 0) - (a.daysSinceLastPayment ?? 0) ||
          b.outstanding - a.outstanding
      );
    dateRange = {
      startDate: getOffsetDateISO(-days, now),
      endDate: todayISO,
      label: `No payment in ${days}+ days`,
    };
    if (overdue.length === 0) {
      draftAnswer = `No customers with pending dues have gone ${days} or more days without a payment.`;
    } else {
      const totalOverdueAmt = overdue.reduce((s, c) => s + c.outstanding, 0);
      draftAnswer = `${overdue.length} ${overdue.length === 1 ? 'customer has' : 'customers have'} not paid in the last ${days} days, with ₹${formatINRNumber(totalOverdueAmt)} pending in total.`;
      table = {
        headers: ['Customer', 'Pending', 'Days Since Payment'],
        rows: overdue.slice(0, 8).map((c) => [
          c.name,
          `₹${formatINRNumber(c.outstanding)}`,
          c.daysSinceLastPayment !== null ? `${c.daysSinceLastPayment}d` : 'No payment',
        ]),
      };
      cards = [
        { label: `Overdue ${days}+ Days`, value: String(overdue.length), tone: 'credit' },
        { label: 'Overdue Amount', value: `₹${formatINRNumber(totalOverdueAmt)}`, tone: 'credit' },
      ];
    }
    facts = {
      daysThreshold: days,
      count: overdue.length,
      customers: overdue.slice(0, 8).map((c) => ({
        name: c.name,
        outstanding: c.outstanding,
        daysSinceLastPayment: c.daysSinceLastPayment,
      })),
    };
    followUps = [
      'Who are my top 5 customers with pending payments?',
      'What is my total collection this month?',
    ];
  } else if (plan.intent === 'monthly_collection') {
    const monthly = computeEnhancedReport(db, storeId, { period: 'monthly' }, now);
    dateRange = {
      startDate: monthly.startDate,
      endDate: monthly.endDate,
      label: `This Month (${monthly.startDate} to ${monthly.endDate})`,
    };
    const deltaNote =
      monthly.previousPeriod.paymentDeltaPercent !== null
        ? ` (${monthly.previousPeriod.paymentDeltaPercent >= 0 ? '+' : ''}${monthly.previousPeriod.paymentDeltaPercent}% vs previous month's ₹${formatINRNumber(monthly.previousPeriod.totalPayments)})`
        : '';
    draftAnswer = `This month (${monthly.startDate} to ${monthly.endDate}), you collected ₹${formatINRNumber(monthly.totalPayments)}${deltaNote} and gave ₹${formatINRNumber(monthly.totalCredit)} in credit across ${monthly.entryCount} transactions.`;
    facts = {
      startDate: monthly.startDate,
      endDate: monthly.endDate,
      monthlyPayments: monthly.totalPayments,
      monthlyCredit: monthly.totalCredit,
      entryCount: monthly.entryCount,
      previousMonthPayments: monthly.previousPeriod.totalPayments,
      paymentDeltaPercent: monthly.previousPeriod.paymentDeltaPercent,
    };
    cards = [
      { label: 'Monthly Collection', value: `₹${formatINRNumber(monthly.totalPayments)}`, tone: 'payment' },
      { label: 'Monthly Udhaar', value: `₹${formatINRNumber(monthly.totalCredit)}`, tone: 'credit' },
      { label: 'Transactions', value: String(monthly.entryCount), tone: 'neutral' },
    ];
    followUps = [
      "Compare this week's credit with last week",
      'Show my highest credit transactions',
    ];
  } else if (plan.intent === 'weekly_comparison') {
    const weekly = computeEnhancedReport(db, storeId, { period: 'weekly' }, now);
    dateRange = {
      startDate: weekly.startDate,
      endDate: weekly.endDate,
      label: `Last 7 Days (${weekly.startDate} to ${weekly.endDate}) vs Prior 7 Days`,
    };
    const diff = weekly.totalCredit - weekly.previousPeriod.totalCredit;
    const pct = weekly.previousPeriod.creditDeltaPercent;
    const trendWord = diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'the same';
    draftAnswer = `This week (${weekly.startDate} to ${weekly.endDate}), you gave ₹${formatINRNumber(weekly.totalCredit)} in credit compared to ₹${formatINRNumber(weekly.previousPeriod.totalCredit)} last week (${weekly.previousPeriod.startDate} to ${weekly.previousPeriod.endDate}) — ₹${formatINRNumber(Math.abs(diff))} ${trendWord}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}. Payments collected were ₹${formatINRNumber(weekly.totalPayments)} vs ₹${formatINRNumber(weekly.previousPeriod.totalPayments)} last week.`;
    facts = {
      thisWeekRange: `${weekly.startDate} to ${weekly.endDate}`,
      thisWeekCredit: weekly.totalCredit,
      lastWeekCredit: weekly.previousPeriod.totalCredit,
      creditDeltaPercent: pct,
      thisWeekPayments: weekly.totalPayments,
      lastWeekPayments: weekly.previousPeriod.totalPayments,
    };
    cards = [
      { label: 'This Week Udhaar', value: `₹${formatINRNumber(weekly.totalCredit)}`, tone: 'credit' },
      { label: 'Last Week Udhaar', value: `₹${formatINRNumber(weekly.previousPeriod.totalCredit)}`, tone: 'neutral' },
      { label: 'This Week Collection', value: `₹${formatINRNumber(weekly.totalPayments)}`, tone: 'payment' },
    ];
    followUps = [
      'What is my total collection this month?',
      'Who are my top 5 customers with pending payments?',
    ];
  } else if (plan.intent === 'highest_credit_transactions') {
    const limit = plan.limit ?? 5;
    const topCredits = entries
      .filter((e) => !e.undone && e.direction === 'credit')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
    dateRange = { startDate: 'All-time', endDate: todayISO, label: 'All-time highest credit entries' };
    if (topCredits.length === 0) {
      draftAnswer = 'There are no credit (udhaar) transactions recorded in your store yet.';
    } else {
      draftAnswer = `Your highest credit transaction is ₹${formatINRNumber(topCredits[0].amount)} for ${topCredits[0].customer_name} on ${topCredits[0].date}. Here are the top ${topCredits.length} credit entries.`;
      table = {
        headers: ['Customer', 'Amount', 'Date', 'Note'],
        rows: topCredits.map((e) => [
          e.customer_name,
          `₹${formatINRNumber(e.amount)}`,
          e.date,
          e.note || '—',
        ]),
      };
      nextContext = {
        ...nextContext,
        lastCustomerId: topCredits[0].customer_id,
        lastCustomerName: topCredits[0].customer_name,
      };
    }
    facts = {
      topCreditTransactions: topCredits.map((e) => ({
        customer: e.customer_name,
        amount: e.amount,
        date: e.date,
      })),
    };
    followUps = [
      'Who are my top 5 customers with pending payments?',
      'How much udhaar did I give today?',
    ];
  } else if (plan.intent === 'customer_history' || plan.intent === 'customer_balance') {
    const targetName = plan.customerName || '';
    const matched = matchCustomerInText(targetName, customers);
    if (!matched) {
      draftAnswer = targetName
        ? `I could not find a customer named "${targetName}" in your store khata.`
        : 'Please mention the customer name so I can look up their khata.';
      facts = { customerFound: false, query: targetName };
      followUps = ['Who are my top 5 customers with pending payments?'];
    } else {
      const statement = computeCustomerStatement(db, storeId, matched.id, {}, now);
      if (statement) {
        const limit = plan.limit ?? 10;
        const shown = statement.entries.filter((e) => !e.undone).slice(0, limit);
        nextContext = {
          lastCustomerId: matched.id,
          lastCustomerName: matched.name,
          lastIntent: plan.intent,
        };
        dateRange = {
          startDate: matched.created_at.slice(0, 10),
          endDate: todayISO,
          label: `${matched.name} · Full Khata`,
        };
        draftAnswer = `${matched.name} has a ${statement.summary.outstanding > 0 ? `pending balance of ₹${formatINRNumber(statement.summary.outstanding)}` : statement.summary.outstanding < 0 ? `credit advance of ₹${formatINRNumber(Math.abs(statement.summary.outstanding))}` : 'settled ₹0 balance'}. Total credit given: ₹${formatINRNumber(statement.summary.totalCredit)}, total payments received: ₹${formatINRNumber(statement.summary.totalPayments)} across ${statement.summary.transactionCount} transactions.`;
        cards = [
          {
            label: 'Current Balance',
            value: `₹${formatINRNumber(Math.abs(statement.summary.outstanding))}`,
            tone: statement.summary.outstanding > 0 ? 'credit' : 'payment',
          },
          {
            label: 'Total Credit',
            value: `₹${formatINRNumber(statement.summary.totalCredit)}`,
            tone: 'credit',
          },
          {
            label: 'Total Paid',
            value: `₹${formatINRNumber(statement.summary.totalPayments)}`,
            tone: 'payment',
          },
        ];
        if (shown.length > 0) {
          table = {
            headers: ['Date', 'Type', 'Amount', 'Running Bal'],
            rows: shown.map((e) => [
              e.date,
              e.direction === 'credit' ? 'Udhaar' : 'Payment',
              `${e.direction === 'payment' ? '+' : '-'}₹${formatINRNumber(e.amount)}`,
              `₹${formatINRNumber(e.runningBalance)}`,
            ]),
          };
        }
        facts = {
          customerName: matched.name,
          outstanding: statement.summary.outstanding,
          totalCredit: statement.summary.totalCredit,
          totalPayments: statement.summary.totalPayments,
          transactionCount: statement.summary.transactionCount,
          recentShown: shown.length,
        };
        followUps = [
          `Show ${matched.name}'s last 5 transactions`,
          'Who are my top 5 customers with pending payments?',
        ];
      }
    }
  } else if (plan.intent === 'smart_search_transactions') {
    const res = searchTransactionsSmart(db, storeId, cleanMsg, { includeUndone: false }, now);
    dateRange = { startDate: todayISO, endDate: todayISO, label: res.appliedFilterSummary };
    draftAnswer =
      res.entries.length === 0
        ? `No transactions matched "${cleanMsg}".`
        : `Found ${res.entries.length} ${res.entries.length === 1 ? 'transaction' : 'transactions'} (${res.appliedFilterSummary}): ₹${formatINRNumber(res.totalCredit)} udhaar and ₹${formatINRNumber(res.totalPayments)} payments.`;
    cards = [
      { label: 'Matched Entries', value: String(res.entries.length), tone: 'neutral' },
      { label: 'Udhaar Total', value: `₹${formatINRNumber(res.totalCredit)}`, tone: 'credit' },
      { label: 'Payments Total', value: `₹${formatINRNumber(res.totalPayments)}`, tone: 'payment' },
    ];
    if (res.entries.length > 0) {
      table = {
        headers: ['Customer', 'Type', 'Amount', 'Date'],
        rows: res.entries.slice(0, 8).map((e) => [
          e.customerName,
          e.direction === 'credit' ? 'Udhaar' : 'Payment',
          `₹${formatINRNumber(e.amount)}`,
          e.date,
        ]),
      };
    }
    facts = {
      filter: res.appliedFilterSummary,
      count: res.entries.length,
      totalCredit: res.totalCredit,
      totalPayments: res.totalPayments,
    };
    followUps = ['How much udhaar did I give today?', 'What is my total outstanding balance?'];
  } else if (plan.intent === 'smart_search_customers') {
    const intel = computeCustomerIntelligence(db, storeId, cleanMsg, now);
    dateRange = { startDate: todayISO, endDate: todayISO, label: intel.appliedFilterSummary };
    draftAnswer =
      intel.customers.length === 0
        ? `No customers matched "${cleanMsg}".`
        : `Found ${intel.customers.length} ${intel.customers.length === 1 ? 'customer' : 'customers'} (${intel.appliedFilterSummary}).`;
    if (intel.customers.length > 0) {
      table = {
        headers: ['Customer', 'Pending', 'Last Tx'],
        rows: intel.customers.slice(0, 8).map((c) => [
          c.name,
          `₹${formatINRNumber(Math.max(0, c.outstanding))}`,
          c.lastTransactionDate ?? '—',
        ]),
      };
    }
    facts = {
      filter: intel.appliedFilterSummary,
      count: intel.customers.length,
    };
    followUps = ['Who are my top 5 customers with pending payments?'];
  } else {
    // general_overview
    const daily = computeEnhancedReport(db, storeId, { period: 'daily' }, now);
    const monthly = computeEnhancedReport(db, storeId, { period: 'monthly' }, now);
    dateRange = { startDate: monthly.startDate, endDate: todayISO, label: `Store Overview (${todayISO})` };
    draftAnswer = `${storeName} overview: Total outstanding balance is ₹${formatINRNumber(daily.totalOutstanding)} across ${customers.length} customers. Today you gave ₹${formatINRNumber(daily.totalCredit)} udhaar and collected ₹${formatINRNumber(daily.totalPayments)}. This month's total collection is ₹${formatINRNumber(monthly.totalPayments)}.`;
    cards = [
      { label: 'Total Outstanding', value: `₹${formatINRNumber(daily.totalOutstanding)}`, tone: 'credit' },
      { label: "Today's Collection", value: `₹${formatINRNumber(daily.totalPayments)}`, tone: 'payment' },
      { label: 'Monthly Collection', value: `₹${formatINRNumber(monthly.totalPayments)}`, tone: 'payment' },
    ];
    facts = {
      storeName,
      totalOutstanding: daily.totalOutstanding,
      customersCount: customers.length,
      todayCredit: daily.totalCredit,
      todayPayments: daily.totalPayments,
      monthlyPayments: monthly.totalPayments,
    };
    followUps = [
      'Who are my top 5 customers with pending payments?',
      'Which customers have not paid in the last 30 days?',
      "Compare this week's credit with last week",
    ];
  }

  const polished = input.skipAiPolish
    ? { text: draftAnswer, poweredBy: 'deterministic-bi' as const }
    : await polishAnswerWithGemini({
        question: cleanMsg,
        draftAnswer,
        facts,
        language: plan.replyLanguage,
        shopName: storeName,
      });

  const metadata: ChatMessageMetadata = {
    intent: plan.intent,
    dateRange,
    cards: cards.length > 0 ? cards : undefined,
    table,
    followUps,
    context: nextContext,
    poweredBy: polished.poweredBy,
  };

  const assistantMsgId = makeId('msg', storeId);
  const replyIso = new Date(now.getTime() + 1).toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO chat_messages (id, session_id, store_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      assistantMsgId,
      sessionRow!.id,
      storeId,
      'assistant',
      polished.text,
      JSON.stringify(metadata),
      replyIso
    );
    // Update session title if it was default "New Khata Chat"
    const nextTitle =
      sessionRow!.title === 'New Khata Chat'
        ? cleanMsg.length > 48
          ? `${cleanMsg.slice(0, 48)}...`
          : cleanMsg
        : sessionRow!.title;
    db.prepare(
      'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND store_id = ?'
    ).run(nextTitle, replyIso, sessionRow!.id, storeId);
  });
  tx();

  const updatedSession = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as msg_count
       FROM chat_sessions s WHERE s.id = ?`
    )
    .get(sessionRow.id) as ChatSessionRow & { msg_count: number };

  return {
    session: {
      id: updatedSession.id,
      title: updatedSession.title,
      createdAt: updatedSession.created_at,
      updatedAt: updatedSession.updated_at,
      messageCount: updatedSession.msg_count,
    },
    userMessage: {
      id: userMsgId,
      sessionId: sessionRow.id,
      role: 'user',
      content: cleanMsg,
      createdAt: nowIso,
    },
    assistantMessage: {
      id: assistantMsgId,
      sessionId: sessionRow.id,
      role: 'assistant',
      content: polished.text,
      metadata,
      createdAt: replyIso,
    },
  };
}
