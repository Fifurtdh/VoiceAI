import type {
  AppSettings,
  Customer,
  EntryDirection,
  LedgerEntry,
  PendingConfirmation,
} from '../types/khata.ts';
import { getOffsetDateISO, getTodayISO } from './format.ts';

export interface CustomerSummary {
  customer: Customer;
  balance: number;
  lastEntry: LedgerEntry | null;
  entryCount: number;
}

export interface DashboardTotals {
  todayCredit: number;
  todayPayments: number;
  totalOutstanding: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'en',
  shopName: 'Lakshmi Kirana',
  voiceWsUrl: '',
  demoMode: false,
  aiDisclosurePlayed: false,
};

/**
 * Generates 6 deterministic synthetic customers (including two named "Ramesh")
 * and realistic kirana entries for immediate usability and demo mode.
 */
export function createSampleSeedData(now: Date = new Date()): {
  customers: Customer[];
  entries: LedgerEntry[];
} {
  const today = getTodayISO(now);
  const yesterday = getOffsetDateISO(-1, now);
  const twoDaysAgo = getOffsetDateISO(-2, now);
  const threeDaysAgo = getOffsetDateISO(-3, now);

  const customers: Customer[] = [
    {
      id: 'cust-ramesh-p',
      name: 'Ramesh Patel',
      phone: '9820414821',
      tag: 'Near Temple',
      remindersOptIn: true,
      createdAt: `${threeDaysAgo}T09:00:00.000Z`,
    },
    {
      id: 'cust-ramesh-v',
      name: 'Ramesh Verma',
      phone: '9876501934',
      tag: 'Dairy Corner',
      remindersOptIn: false,
      createdAt: `${threeDaysAgo}T09:10:00.000Z`,
    },
    {
      id: 'cust-sita',
      name: 'Sita Devi',
      phone: '9811237742',
      tag: 'Block B',
      remindersOptIn: false,
      createdAt: `${threeDaysAgo}T09:20:00.000Z`,
    },
    {
      id: 'cust-mahesh',
      name: 'Mahesh Kumar',
      phone: '9765423310',
      tag: 'Auto Stand',
      remindersOptIn: true,
      createdAt: `${threeDaysAgo}T09:30:00.000Z`,
    },
    {
      id: 'cust-anita',
      name: 'Anita Sharma',
      phone: '9930118825',
      tag: 'Gali No. 4',
      remindersOptIn: false,
      createdAt: `${threeDaysAgo}T09:40:00.000Z`,
    },
    {
      id: 'cust-irfan',
      name: 'Irfan Khan',
      phone: '9845096612',
      tag: 'Tailor Shop',
      remindersOptIn: false,
      createdAt: `${threeDaysAgo}T09:50:00.000Z`,
    },
  ];

  const entries: LedgerEntry[] = [
    {
      id: 'ent-1',
      customerId: 'cust-ramesh-p',
      customerName: 'Ramesh Patel',
      amount: 340,
      direction: 'credit',
      date: today,
      createdAt: `${today}T10:15:00.000Z`,
      note: 'Atta & cooking oil',
    },
    {
      id: 'ent-2',
      customerId: 'cust-sita',
      customerName: 'Sita Devi',
      amount: 200,
      direction: 'payment',
      date: today,
      createdAt: `${today}T09:40:00.000Z`,
      note: 'Cash paid',
    },
    {
      id: 'ent-3',
      customerId: 'cust-mahesh',
      customerName: 'Mahesh Kumar',
      amount: 1250,
      direction: 'credit',
      date: yesterday,
      createdAt: `${yesterday}T18:20:00.000Z`,
      note: 'Monthly ration',
    },
    {
      id: 'ent-4',
      customerId: 'cust-ramesh-v',
      customerName: 'Ramesh Verma',
      amount: 580,
      direction: 'credit',
      date: yesterday,
      createdAt: `${yesterday}T14:10:00.000Z`,
      note: 'Milk & sugar',
    },
    {
      id: 'ent-5',
      customerId: 'cust-sita',
      customerName: 'Sita Devi',
      amount: 650,
      direction: 'credit',
      date: twoDaysAgo,
      createdAt: `${twoDaysAgo}T11:30:00.000Z`,
      note: 'Dal & spices',
    },
    {
      id: 'ent-6',
      customerId: 'cust-anita',
      customerName: 'Anita Sharma',
      amount: 420,
      direction: 'payment',
      date: twoDaysAgo,
      createdAt: `${twoDaysAgo}T10:05:00.000Z`,
      note: 'UPI payment',
    },
    {
      id: 'ent-7',
      customerId: 'cust-anita',
      customerName: 'Anita Sharma',
      amount: 790,
      direction: 'credit',
      date: threeDaysAgo,
      createdAt: `${threeDaysAgo}T16:45:00.000Z`,
      note: 'Rice 10kg',
    },
    {
      id: 'ent-8',
      customerId: 'cust-irfan',
      customerName: 'Irfan Khan',
      amount: 185,
      direction: 'credit',
      date: threeDaysAgo,
      createdAt: `${threeDaysAgo}T12:15:00.000Z`,
      note: 'Tea & biscuits',
    },
  ];

  return { customers, entries };
}

function getSupersededIds(entries: LedgerEntry[]): Set<string> {
  const superseded = new Set<string>();
  for (const e of entries) {
    if (!e.undone && e.reversalOfId) {
      superseded.add(e.reversalOfId);
    }
  }
  return superseded;
}

/**
 * Computes net balance for a customer.
 * Positive = customer owes shopkeeper (outstanding udhaar).
 * Zero = settled. Negative = advance paid.
 * Excludes undone entries and entries superseded by an active replacement (`reversalOfId`).
 */
export function computeCustomerBalance(
  customerId: string,
  entries: LedgerEntry[]
): number {
  const superseded = getSupersededIds(entries);
  return entries.reduce((sum, entry) => {
    if (entry.customerId !== customerId || entry.undone || superseded.has(entry.id)) {
      return sum;
    }
    return entry.direction === 'credit' ? sum + entry.amount : sum - entry.amount;
  }, 0);
}

/**
 * Computes summaries for all customers sorted by highest outstanding balance first.
 */
export function computeCustomerSummaries(
  customers: Customer[],
  entries: LedgerEntry[]
): CustomerSummary[] {
  const superseded = getSupersededIds(entries);
  const sortedEntries = [...entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return customers
    .map((customer) => {
      const custEntries = sortedEntries.filter(
        (e) => e.customerId === customer.id && !e.undone && !superseded.has(e.id)
      );
      const balance = custEntries.reduce(
        (acc, e) => (e.direction === 'credit' ? acc + e.amount : acc - e.amount),
        0
      );
      return {
        customer,
        balance,
        lastEntry: custEntries[0] ?? null,
        entryCount: custEntries.length,
      };
    })
    .sort((a, b) => b.balance - a.balance || a.customer.name.localeCompare(b.customer.name));
}

/**
 * Computes Today's udhaar given, Today's payments received, and Total outstanding across all customers.
 */
export function computeDashboardTotals(
  customers: Customer[],
  entries: LedgerEntry[],
  todayISO: string = getTodayISO()
): DashboardTotals {
  const superseded = getSupersededIds(entries);
  let todayCredit = 0;
  let todayPayments = 0;

  for (const entry of entries) {
    if (entry.undone || superseded.has(entry.id)) continue;
    if (entry.date === todayISO) {
      if (entry.direction === 'credit') {
        todayCredit += entry.amount;
      } else {
        todayPayments += entry.amount;
      }
    }
  }

  let totalOutstanding = 0;
  for (const customer of customers) {
    const bal = computeCustomerBalance(customer.id, entries);
    if (bal > 0) {
      totalOutstanding += bal;
    }
  }

  return {
    todayCredit,
    todayPayments,
    totalOutstanding,
  };
}

/**
 * Commits a confirmed ledger entry, creating a new customer (with remindersOptIn = false by default)
 * if no existing customerId is matched.
 */
export function commitConfirmedEntry(
  state: { customers: Customer[]; entries: LedgerEntry[] },
  pending: PendingConfirmation,
  now: Date = new Date()
): { customers: Customer[]; entries: LedgerEntry[]; createdEntry: LedgerEntry } {
  const cleanName = pending.customerName.trim() || 'Walk-in Customer';
  const amount = Math.max(1, Math.round(pending.amount));
  let targetCustomer = pending.customerId
    ? state.customers.find((c) => c.id === pending.customerId)
    : state.customers.find(
        (c) => c.name.toLowerCase() === cleanName.toLowerCase()
      );

  let nextCustomers = state.customers;
  if (!targetCustomer) {
    targetCustomer = {
      id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      phone: '',
      remindersOptIn: false, // Opt-in OFF by default
      createdAt: now.toISOString(),
    };
    nextCustomers = [targetCustomer, ...state.customers];
  }

  const createdEntry: LedgerEntry = {
    id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: targetCustomer.id,
    customerName: targetCustomer.name,
    amount,
    direction: pending.direction,
    date: pending.date || getTodayISO(now),
    createdAt: now.toISOString(),
    note: pending.note,
  };

  return {
    customers: nextCustomers,
    entries: [createdEntry, ...state.entries],
    createdEntry,
  };
}

/**
 * Edits an existing entry in place.
 */
export function updateLedgerEntry(
  entries: LedgerEntry[],
  entryId: string,
  updates: Partial<Pick<LedgerEntry, 'amount' | 'direction' | 'date' | 'customerName' | 'note'>>
): LedgerEntry[] {
  return entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          ...updates,
          amount:
            updates.amount !== undefined
              ? Math.max(1, Math.round(updates.amount))
              : e.amount,
        }
      : e
  );
}

/**
 * Undoes an entry by marking it undone (removing its effect from balance while keeping an explicit reversible audit trail, or toggling back).
 */
export function toggleUndoLedgerEntry(
  entries: LedgerEntry[],
  entryId: string
): LedgerEntry[] {
  return entries.map((e) =>
    e.id === entryId ? { ...e, undone: !e.undone } : e
  );
}

/**
 * Permanently removes a ledger entry.
 */
export function deleteLedgerEntry(
  entries: LedgerEntry[],
  entryId: string
): LedgerEntry[] {
  return entries.filter((e) => e.id !== entryId);
}

/**
 * Helper to return opposite direction for quick switches.
 */
export function flipDirection(direction: EntryDirection): EntryDirection {
  return direction === 'credit' ? 'payment' : 'credit';
}

export interface EntryFilterOptions {
  search?: string;
  direction?: 'all' | EntryDirection;
  startDate?: string;
  endDate?: string;
  includeUndone?: boolean;
}

/**
 * Pure filter for ledger transactions by customer/note search, direction, and date range.
 */
export function filterLedgerEntries(
  entries: LedgerEntry[],
  options: EntryFilterOptions = {}
): LedgerEntry[] {
  const q = (options.search ?? '').trim().toLowerCase();
  const dir = options.direction ?? 'all';
  const startDate = options.startDate?.trim() || '';
  const endDate = options.endDate?.trim() || '';
  const includeUndone = options.includeUndone ?? true;

  return entries
    .filter((entry) => {
      if (!includeUndone && entry.undone) return false;
      if (dir !== 'all' && entry.direction !== dir) return false;
      if (startDate && entry.date < startDate) return false;
      if (endDate && entry.date > endDate) return false;
      if (q) {
        const matchName = entry.customerName.toLowerCase().includes(q);
        const matchNote = (entry.note ?? '').toLowerCase().includes(q);
        const matchAmount = String(entry.amount).includes(q);
        if (!matchName && !matchNote && !matchAmount) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type ReportPeriodType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface LedgerReportSummary {
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
  }>;
}

/**
 * Resolves start/end YYYY-MM-DD bounds for daily, weekly (last 7 days), monthly (current month), or custom range.
 */
export function getReportDateRange(
  period: ReportPeriodType,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): { startDate: string; endDate: string } {
  const today = getTodayISO(now);
  if (period === 'daily') {
    return { startDate: today, endDate: today };
  }
  if (period === 'weekly') {
    return { startDate: getOffsetDateISO(-6, now), endDate: today };
  }
  if (period === 'monthly') {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return { startDate: `${year}-${month}-01`, endDate: today };
  }
  const s =
    customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : today;
  const e =
    customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : today;
  return s <= e ? { startDate: s, endDate: e } : { startDate: e, endDate: s };
}

/**
 * Computes pure aggregated credit, payment, daily breakdown, and customer breakdown for a report period.
 */
export function computeLedgerReport(
  customers: Customer[],
  entries: LedgerEntry[],
  options: {
    period: ReportPeriodType;
    startDate?: string;
    endDate?: string;
  },
  now: Date = new Date()
): LedgerReportSummary {
  const { startDate, endDate } = getReportDateRange(
    options.period,
    options.startDate,
    options.endDate,
    now
  );

  const scopedEntries = filterLedgerEntries(entries, {
    startDate,
    endDate,
    includeUndone: false,
  });

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

  for (const entry of scopedEntries) {
    if (entry.direction === 'credit') {
      totalCredit += entry.amount;
      creditCount++;
    } else {
      totalPayments += entry.amount;
      paymentCount++;
    }

    const dayRow = dailyMap.get(entry.date) ?? {
      date: entry.date,
      credit: 0,
      payment: 0,
      count: 0,
    };
    if (entry.direction === 'credit') {
      dayRow.credit += entry.amount;
    } else {
      dayRow.payment += entry.amount;
    }
    dayRow.count++;
    dailyMap.set(entry.date, dayRow);

    const custRow = custMap.get(entry.customerId) ?? {
      customerId: entry.customerId,
      customerName: entry.customerName,
      credit: 0,
      payment: 0,
      net: 0,
    };
    if (entry.direction === 'credit') {
      custRow.credit += entry.amount;
      custRow.net += entry.amount;
    } else {
      custRow.payment += entry.amount;
      custRow.net -= entry.amount;
    }
    custMap.set(entry.customerId, custRow);
  }

  let totalOutstanding = 0;
  for (const c of customers) {
    const bal = computeCustomerBalance(c.id, entries);
    if (bal > 0) totalOutstanding += bal;
  }

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
    dailyBreakdown: [...dailyMap.values()].sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
    customerBreakdown: [...custMap.values()].sort(
      (a, b) => b.credit + b.payment - (a.credit + a.payment)
    ),
  };
}

