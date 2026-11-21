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
      undone INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
    CREATE INDEX IF NOT EXISTS idx_entries_store_created ON ledger_entries(store_id, created_at DESC);
  `);

  // Non-destructive migration in case an existing SQLite DB has an older users/stores table
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

  return db;
}
