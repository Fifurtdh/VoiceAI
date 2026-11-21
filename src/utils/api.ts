import type {
  AppSettings,
  Customer,
  EntryDirection,
  LanguageCode,
  LedgerEntry,
  PendingConfirmation,
} from '../types/khata';
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

export function createEntryApi(
  pending: PendingConfirmation
): Promise<{ customer: Customer; entry: LedgerEntry }> {
  return apiFetch<{ customer: Customer; entry: LedgerEntry }>('/api/entries', {
    method: 'POST',
    body: JSON.stringify(pending),
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
}): Promise<VoiceProcessResponse> {
  return apiFetch<VoiceProcessResponse>('/api/voice/process', {
    method: 'POST',
    body: JSON.stringify(payload),
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
