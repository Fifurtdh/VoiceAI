/**
 * Supported languages across Voice Khata.
 * Covers Hindi, Kannada, Tamil, Telugu, Marathi, Bengali, and English.
 */
export type LanguageCode = 'hi' | 'kn' | 'ta' | 'te' | 'mr' | 'bn' | 'en';

export type ThemeMode = 'dark' | 'light';

/**
 * Ledger transaction direction:
 * - 'credit': shopkeeper gave goods on credit (udhaar given) -> increases customer balance
 * - 'payment': customer paid back money (payment received) -> decreases customer balance
 */
export type EntryDirection = 'credit' | 'payment';

export type AppScreen =
  | 'home'
  | 'talk'
  | 'ledger'
  | 'history'
  | 'assistant'
  | 'reports'
  | 'reminders'
  | 'settings';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  /** Optional shop/locality note to disambiguate duplicate names like two Rameshes */
  tag?: string;
  /** Per-customer opt-in for polite reminders. OFF by default. */
  remindersOptIn: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  direction: EntryDirection;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** ISO timestamp for sorting */
  createdAt: string;
  note?: string;
  /** True if this entry was undone or is a reversing entry */
  undone?: boolean;
  /** Present when this entry is an auditable correction of a reversed entry */
  reversalOfId?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  language: LanguageCode;
  shopName: string;
  /** Optional WebSocket endpoint for live 16kHz PCM voice backend. Default empty. */
  voiceWsUrl: string;
  /** Hidden demo mode toggle for offline simulated voice sessions */
  demoMode: boolean;
  /** Tracks whether AI assistant disclosure has been spoken on the first voice session */
  aiDisclosurePlayed: boolean;
}

export interface PendingConfirmation {
  customerId?: string;
  customerName: string;
  amount: number;
  direction: EntryDirection;
  date: string;
  note?: string;
  rawTranscript?: string;
}

export interface DisambiguationOption {
  customerId: string;
  customerName: string;
  phoneSuffix: string;
  tag?: string;
  lastTxSummary: string;
  balance: number;
}

export interface DisambiguationState {
  pending: PendingConfirmation;
  options: DisambiguationOption[];
  question: string;
}

/**
 * Expected JSON messages from a configured Voice Backend WebSocket server.
 * Note: No API keys are stored or sent from the frontend.
 */
export type WsServerMessage =
  | {
      type: 'stt_ready';
      provider: 'gnani-prisma-v3' | 'unconfigured';
      ttsProvider?: 'gnani-timbre-v3' | 'browser-fallback';
      gnaniAuthState?: 'connected' | 'unconfigured' | 'auth_failed' | 'unreachable';
      gnaniError?: string;
    }
  | { type: 'vad_state'; state: 'speech_start' | 'speech_end' }
  | { type: 'transcript_partial'; text: string; stableText?: string }
  | {
      type: 'transcript_final';
      text: string;
      detectedLanguage?: string;
      latencyMs?: number;
      autoEndpointed?: boolean;
    }
  | {
      type: 'entry_parsed';
      customer: string;
      amount: number;
      direction: EntryDirection;
      date?: string;
      note?: string;
      rawTranscript?: string;
    }
  | {
      type: 'correction_parsed';
      amount?: number;
      direction?: EntryDirection;
      customerName?: string;
    }
  | {
      type: 'query_today_summary';
    }
  | {
      type: 'query_customer_balance';
      customerName: string;
    }
  | {
      type: 'need_clarification';
      question?: string;
      options: Array<{
        customerId?: string;
        customerName: string;
        phoneSuffix?: string;
        lastTxSummary?: string;
        balance?: number;
      }>;
      pending?: Partial<PendingConfirmation>;
    }
  | {
      type: 'agent_audio';
      /** Base64 encoded 16kHz PCM or audio payload */
      audioBase64: string;
      sampleRate?: number;
    }
  | {
      type: 'agent_audio_start';
      requestId: string;
      sampleRate: number;
      format: 'pcm16';
    }
  | {
      type: 'agent_audio_chunk';
      requestId: string;
      chunkIndex: number;
      audioBase64: string;
      sampleRate: number;
    }
  | {
      type: 'agent_audio_end';
      requestId: string;
      firstChunkLatencyMs?: number;
      totalLatencyMs?: number;
    }
  | {
      type: 'agent_audio_error';
      requestId: string;
      code?: string;
      error: string;
    }
  | { type: 'pong'; ts?: number }
  | { type: 'answer_text'; text: string }
  | { type: 'voice_error'; code?: string; error: string };
