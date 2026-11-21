import type {
  AppSettings,
  Customer,
  EntryDirection,
  LanguageCode,
  LedgerEntry,
  PendingConfirmation,
} from '../types/khata';
import { getTodayISO } from './format';
import type { LedgerReportSummary, ReportPeriodType } from './ledgerLogic';
import type { VoiceParseOutcome } from './voiceParser';

export interface StoreProfile {
  id: number;
  storeName: string;
  storeLocation: string;
  language: AppSettings['language'];
  theme: AppSettings['theme'];
  voiceWsUrl: string;
  demoMode: boolean;
  aiDisclosurePlayed: boolean;
  createdAt: string;
}

export interface AuthSessionResponse {
  user: { id: number; phoneNumber: string };
  store: StoreProfile;
  recoveryCode?: string;
}

export interface KhataLoadResponse {
  store: StoreProfile;
  customers: Customer[];
  entries: LedgerEntry[];
}

export interface VoiceStatusResponse {
  gnaniSttConfigured: boolean;
  gnaniTtsConfigured: boolean;
  geminiConfigured: boolean;
  sttProvider: 'gnani-prisma-v3' | 'unconfigured';
  ttsProvider: 'gnani-timbre-v3' | 'browser-fallback';
  intentProvider: 'gemini-4-hydrogen' | 'local-parser';
  missingCredentials?: string[];
  gnaniAuthState?: 'connected' | 'unconfigured' | 'auth_failed' | 'unreachable';
  gnaniError?: string;
}

export interface VoiceProcessResponse {
  transcript: string;
  sttProvider: 'gnani-prisma-v3' | 'text-input';
  intentProvider: 'gemini-4-hydrogen' | 'local-parser';
  outcome: VoiceParseOutcome;
  confirmationRequired: boolean;
}

export interface ApiError extends Error {
  status?: number;
  field?: string;
  code?: string;
  audioBytesReceived?: number;
  duplicates?: DuplicateMatch[];
}

export interface DuplicateMatch {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  direction: EntryDirection;
  date: string;
  createdAt: string;
  note?: string;
  minutesAgo: number;
}

export interface EnhancedReportData {
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
    direction: EntryDirection;
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

export interface CustomerStatementData {
  customer: Customer;
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
  entries: Array<{
    id: string;
    date: string;
    createdAt: string;
    direction: EntryDirection;
    amount: number;
    note?: string;
    undone: boolean;
    reversalOfId?: string;
    runningBalance: number;
  }>;
}

export interface SmartTransactionSearchResponse {
  query: string;
  appliedFilterSummary: string;
  totalAmount: number;
  totalCredit: number;
  totalPayments: number;
  entries: LedgerEntry[];
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason?: string;
  createdAt: string;
}

export interface ChatSessionItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessageMetadata {
  intent: string;
  dateRange?: { startDate: string; endDate: string; label: string };
  cards?: Array<{
    label: string;
    value: string;
    tone?: 'neutral' | 'credit' | 'payment';
  }>;
  table?: { headers: string[]; rows: string[][] };
  followUps?: string[];
  poweredBy?: 'gemini-4-hydrogen' | 'deterministic-bi';
}

export interface ChatMessageItem {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: ChatMessageMetadata;
  createdAt: string;
}

export type ReminderLanguage = LanguageCode | 'hinglish';

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

export interface PaymentReminderHistoryItem {
  id: string;
  customerId: string;
  customerName: string;
  amountDue: number;
  language: string;
  message: string;
  channel: string;
  status: 'draft' | 'opened_whatsapp' | 'marked_sent' | 'customer_responded';
  customerResponse?: string;
  createdAt: string;
  sentAt?: string;
}

export interface RemindersOverviewResponse {
  pendingCustomers: ReminderPendingCustomer[];
  history: PaymentReminderHistoryItem[];
  summary: {
    pendingCustomerCount: number;
    totalPendingAmount: number;
    overdue30dCount: number;
    remindersSentCount: number;
  };
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'VoiceKhata');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  let data: Record<string, unknown> = {};
  let jsonParseFailed = false;

  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    jsonParseFailed = true;
    data = {};
  }

  if (!res.ok) {
    const err = new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Request failed. Please try again.'
    ) as ApiError;
    err.status = res.status;
    err.field = typeof data.field === 'string' ? data.field : undefined;
    err.code = typeof data.code === 'string' ? data.code : undefined;
    err.audioBytesReceived =
      typeof data.audioBytesReceived === 'number'
        ? data.audioBytesReceived
        : undefined;
    err.duplicates = Array.isArray(data.duplicates)
      ? (data.duplicates as DuplicateMatch[])
      : undefined;
    throw err;
  }

  if (jsonParseFailed || (!isJson && Object.keys(data).length === 0)) {
    const err = new Error(
      'Server returned an unexpected response. Please try again.'
    ) as ApiError;
    err.status = res.status;
    err.code = 'INVALID_JSON_RESPONSE';
    throw err;
  }

  return data as T;
}

export function fetchCurrentSession(): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/api/auth/me', { method: 'GET' });
}

export function loginStore(payload: {
  phoneNumber: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerStore(payload: {
  storeName: string;
  storeLocation: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetForgottenPassword(payload: {
  phoneNumber: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export function logoutStore(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function generateNewRecoveryCode(): Promise<{ recoveryCode: string }> {
  return apiFetch<{ recoveryCode: string }>('/api/auth/recovery-code', {
    method: 'POST',
  });
}

export function fetchKhataData(): Promise<KhataLoadResponse> {
  return apiFetch<KhataLoadResponse>('/api/khata', { method: 'GET' });
}

export function updateStoreSettingsApi(
  updates: Partial<{
    storeName: string;
    storeLocation: string;
    language: AppSettings['language'];
    theme: AppSettings['theme'];
    voiceWsUrl: string;
    demoMode: boolean;
    aiDisclosurePlayed: boolean;
  }>
): Promise<{ store: StoreProfile }> {
  return apiFetch<{ store: StoreProfile }>('/api/store/settings', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function createCustomerApi(payload: {
  name: string;
  phone?: string;
  tag?: string;
  remindersOptIn?: boolean;
}): Promise<{ customer: Customer }> {
  return apiFetch<{ customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCustomerApi(
  customerId: string,
  updates: {
    name?: string;
    phone?: string;
    tag?: string;
    remindersOptIn?: boolean;
  }
): Promise<{ customer: Customer }> {
  return apiFetch<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(customerId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

export function deleteCustomerApi(customerId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/customers/${encodeURIComponent(customerId)}`,
    {
      method: 'DELETE',
    }
  );
}

export function checkDuplicateEntryApi(
  pending: PendingConfirmation
): Promise<{ isDuplicate: boolean; matches: DuplicateMatch[] }> {
  return apiFetch<{ isDuplicate: boolean; matches: DuplicateMatch[] }>(
    '/api/entries/check-duplicate',
    {
      method: 'POST',
      body: JSON.stringify(pending),
    }
  );
}

export function createEntryApi(
  pending: PendingConfirmation & {
    clientRequestId?: string;
    checkDuplicate?: boolean;
    confirmDuplicate?: boolean;
  }
): Promise<{ customer: Customer; entry: LedgerEntry; deduplicated?: boolean }> {
  return apiFetch<{
    customer: Customer;
    entry: LedgerEntry;
    deduplicated?: boolean;
  }>('/api/entries', {
    method: 'POST',
    body: JSON.stringify(pending),
  });
}

export function reverseEntryApi(
  entryId: string,
  payload: {
    reason?: string;
    replacementAmount?: number;
    replacementDirection?: EntryDirection;
    replacementNote?: string;
  } = {}
): Promise<{
  reversedEntry: LedgerEntry;
  replacementEntry: LedgerEntry | null;
}> {
  return apiFetch(`/api/entries/${encodeURIComponent(entryId)}/reverse`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateEntryApi(
  entryId: string,
  updates: {
    amount?: number;
    direction?: EntryDirection;
    date?: string;
    note?: string;
  }
): Promise<{ entry: LedgerEntry }> {
  return apiFetch<{ entry: LedgerEntry }>(
    `/api/entries/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

export function toggleUndoEntryApi(
  entryId: string
): Promise<{ entry: LedgerEntry }> {
  return apiFetch<{ entry: LedgerEntry }>(
    `/api/entries/${encodeURIComponent(entryId)}/undo`,
    { method: 'POST' }
  );
}

export function deleteEntryApi(entryId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}

export function toggleCustomerReminderApi(
  customerId: string
): Promise<{ customer: Customer }> {
  return apiFetch<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(customerId)}/toggle-reminder`,
    { method: 'POST' }
  );
}

export function fetchReportsApi(params: {
  period: ReportPeriodType;
  startDate?: string;
  endDate?: string;
}): Promise<{ report: LedgerReportSummary }> {
  const search = new URLSearchParams({ period: params.period });
  if (params.startDate) search.set('startDate', params.startDate);
  if (params.endDate) search.set('endDate', params.endDate);
  return apiFetch<{ report: LedgerReportSummary }>(
    `/api/reports?${search.toString()}`,
    { method: 'GET' }
  );
}

export function fetchVoiceStatusApi(): Promise<VoiceStatusResponse> {
  return apiFetch<VoiceStatusResponse>('/api/voice/status', { method: 'GET' });
}

export function processVoiceApi(payload: {
  audioBase64?: string;
  mimeType?: string;
  transcript?: string;
  language: LanguageCode;
  hasPendingConfirmation?: boolean;
  clientDate?: string;
}): Promise<VoiceProcessResponse> {
  return apiFetch<VoiceProcessResponse>('/api/voice/process', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      clientDate: payload.clientDate ?? getTodayISO(),
    }),
  });
}

export function requestVoiceTtsApi(payload: {
  text: string;
  language: LanguageCode;
}): Promise<{
  provider: 'gnani-timbre-v3' | 'not_configured';
  audioBase64?: string;
  mimeType?: string;
  error?: string;
}> {
  return apiFetch('/api/voice/tts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function seedDemoDataApi(): Promise<{
  customers: Customer[];
  entries: LedgerEntry[];
}> {
  return apiFetch<{ customers: Customer[]; entries: LedgerEntry[] }>(
    '/api/khata/seed-demo',
    { method: 'POST' }
  );
}

export function clearStoreKhataApi(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/khata', { method: 'DELETE' });
}

// =========================================================================
// BI Reports, Customer Intelligence, Smart Search, Chat & Reminders APIs
// =========================================================================

export function fetchEnhancedReportApi(params: {
  period: ReportPeriodType;
  startDate?: string;
  endDate?: string;
}): Promise<{ report: EnhancedReportData }> {
  const search = new URLSearchParams({ period: params.period });
  if (params.startDate) search.set('startDate', params.startDate);
  if (params.endDate) search.set('endDate', params.endDate);
  return apiFetch<{ report: EnhancedReportData }>(
    `/api/reports/enhanced?${search.toString()}`,
    { method: 'GET' }
  );
}

export function fetchCustomerIntelligenceApi(
  query = ''
): Promise<CustomerIntelligenceResponse> {
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return apiFetch<CustomerIntelligenceResponse>(
    `/api/customers/intelligence${qs}`,
    { method: 'GET' }
  );
}

export function fetchCustomerStatementApi(
  customerId: string,
  params: { startDate?: string; endDate?: string; search?: string } = {}
): Promise<{ statement: CustomerStatementData }> {
  const sp = new URLSearchParams();
  if (params.startDate) sp.set('startDate', params.startDate);
  if (params.endDate) sp.set('endDate', params.endDate);
  if (params.search) sp.set('search', params.search);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  return apiFetch<{ statement: CustomerStatementData }>(
    `/api/customers/${encodeURIComponent(customerId)}/statement${qs}`,
    { method: 'GET' }
  );
}

export function searchTransactionsSmartApi(params: {
  q?: string;
  direction?: 'all' | EntryDirection;
  startDate?: string;
  endDate?: string;
  includeUndone?: boolean;
}): Promise<SmartTransactionSearchResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.direction && params.direction !== 'all') {
    sp.set('direction', params.direction);
  }
  if (params.startDate) sp.set('startDate', params.startDate);
  if (params.endDate) sp.set('endDate', params.endDate);
  if (params.includeUndone === false) sp.set('includeUndone', 'false');
  return apiFetch<SmartTransactionSearchResponse>(
    `/api/entries/search?${sp.toString()}`,
    { method: 'GET' }
  );
}

export function fetchAuditLogsApi(
  limit = 40
): Promise<{ logs: AuditLogItem[] }> {
  return apiFetch<{ logs: AuditLogItem[] }>(
    `/api/audit-logs?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET' }
  );
}

export function fetchChatSessionsApi(): Promise<{ sessions: ChatSessionItem[] }> {
  return apiFetch<{ sessions: ChatSessionItem[] }>('/api/chat/sessions', {
    method: 'GET',
  });
}

export function createChatSessionApi(
  title?: string
): Promise<{ session: ChatSessionItem }> {
  return apiFetch<{ session: ChatSessionItem }>('/api/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function fetchChatMessagesApi(
  sessionId: string
): Promise<{ messages: ChatMessageItem[] }> {
  return apiFetch<{ messages: ChatMessageItem[] }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: 'GET' }
  );
}

export function deleteChatSessionApi(
  sessionId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' }
  );
}

export function sendChatMessageApi(payload: {
  sessionId?: string;
  message: string;
  language?: LanguageCode;
}): Promise<{
  session: ChatSessionItem;
  userMessage: ChatMessageItem;
  assistantMessage: ChatMessageItem;
}> {
  return apiFetch('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchRemindersOverviewApi(
  sort: 'amount' | 'overdue' = 'amount'
): Promise<RemindersOverviewResponse> {
  return apiFetch<RemindersOverviewResponse>(
    `/api/reminders/overview?sort=${sort}`,
    { method: 'GET' }
  );
}

export function generateReminderDraftApi(payload: {
  customerId: string;
  language: ReminderLanguage;
  useAiPolish?: boolean;
}): Promise<{
  customerId: string;
  customerName: string;
  phone: string;
  amountDue: number;
  language: ReminderLanguage;
  message: string;
  generatedBy: 'gemini-4-hydrogen' | 'template';
  remindersOptIn: boolean;
}> {
  return apiFetch('/api/reminders/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveReminderLogApi(payload: {
  customerId: string;
  language: string;
  message: string;
  channel: 'whatsapp' | 'sms' | 'copy';
  status: 'opened_whatsapp' | 'marked_sent' | 'customer_responded';
}): Promise<{ reminder: PaymentReminderHistoryItem }> {
  return apiFetch('/api/reminders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateReminderLogApi(
  reminderId: string,
  payload: {
    status?: 'opened_whatsapp' | 'marked_sent' | 'customer_responded';
    customerResponse?: string;
  }
): Promise<{ reminder: PaymentReminderHistoryItem }> {
  return apiFetch(`/api/reminders/${encodeURIComponent(reminderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
