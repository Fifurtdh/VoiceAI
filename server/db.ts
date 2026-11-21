import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface UserRow {
  id: number;
  phone_number: string;
  password_hash: string;
  recovery_code_hash: string | null;
  created_at: string;
}

export interface StoreRow {
  id: number;
  user_id: number;
  store_name: string;
  store_location: string;
  language: string;
  theme: string;
  voice_ws_url: string;
  demo_mode: number;
  ai_disclosure_played: number;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  store_id: number;
  name: string;
  phone: string;
  tag: string | null;
  reminders_opt_in: number;
  created_at: string;
}

export interface LedgerEntryRow {
  id: string;
  store_id: number;
  customer_id: string;
  customer_name: string;
  amount: number;
  direction: 'credit' | 'payment';
  date: string;
  created_at: string;
  note: string | null;
  undone: number;
  reversal_of_id?: string | null;
  client_request_id?: string | null;
}

export interface ChatSessionRow {
  id: string;
  store_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  store_id: number;
  role: 'user' | 'assistant';
  content: string;
  metadata_json: string | null;
  created_at: string;
}

export interface PaymentReminderRow {
  id: string;
  store_id: number;
  customer_id: string;
  customer_name: string;
  amount_due: number;
  language: string;
  message: string;
  channel: string;
  status: 'draft' | 'opened_whatsapp' | 'marked_sent' | 'customer_responded';
  customer_response: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface AuditLogRow {
  id: string;
  store_id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
}

const DEFAULT_DB_PATH =
  process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'voice_khata.db');

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  let targetPath = dbPath;
  if (targetPath !== ':memory:') {
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      targetPath = path.join(os.tmpdir(), 'voice_khata.db');
    }
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables non-destructively so existing customer or transaction data is preserved
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      recovery_code_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      store_name TEXT NOT NULL,
      store_location TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      theme TEXT NOT NULL DEFAULT 'dark',
      voice_ws_url TEXT NOT NULL DEFAULT '',
      demo_mode INTEGER NOT NULL DEFAULT 0,
      ai_disclosure_played INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      tag TEXT,
      reminders_opt_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('credit', 'payment')),
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT,
      undone INTEGER NOT NULL DEFAULT 0,
      reversal_of_id TEXT,
      client_request_id TEXT
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_reminders (
      id TEXT PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      amount_due INTEGER NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      message TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL CHECK(status IN ('draft', 'opened_whatsapp', 'marked_sent', 'customer_responded')),
      customer_response TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
    CREATE INDEX IF NOT EXISTS idx_entries_store_created ON ledger_entries(store_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_store_date ON ledger_entries(store_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_store ON chat_sessions(store_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_reminders_store ON payment_reminders(store_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reminders_customer ON payment_reminders(store_id, customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs(store_id, created_at DESC);
  `);

  // Non-destructive migration in case an existing SQLite DB has older tables
  const userCols = db
    .prepare("PRAGMA table_info('users')")
    .all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'recovery_code_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;');
  }

  const storeCols = db
    .prepare("PRAGMA table_info('stores')")
    .all() as Array<{ name: string }>;
  const storeMigrations: Array<[string, string]> = [
    ['language', "TEXT NOT NULL DEFAULT 'en'"],
    ['theme', "TEXT NOT NULL DEFAULT 'dark'"],
    ['voice_ws_url', "TEXT NOT NULL DEFAULT ''"],
    ['demo_mode', 'INTEGER NOT NULL DEFAULT 0'],
    ['ai_disclosure_played', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, def] of storeMigrations) {
    if (!storeCols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE stores ADD COLUMN ${col} ${def};`);
    }
  }

  const entryCols = db
    .prepare("PRAGMA table_info('ledger_entries')")
    .all() as Array<{ name: string }>;
  const entryMigrations: Array<[string, string]> = [
    ['reversal_of_id', 'TEXT'],
    ['client_request_id', 'TEXT'],
  ];
  for (const [col, def] of entryMigrations) {
    if (!entryCols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ledger_entries ADD COLUMN ${col} ${def};`);
    }
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_entries_store_reqid ON ledger_entries(store_id, client_request_id);'
  );

  return db;
}
