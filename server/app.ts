import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import {
  clearSessionCookie,
  generateRecoveryCode,
  hashSecret,
  initJwtSecret,
  isAllowedOrigin,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  verifyMutationOrigin,
  verifySecret,
  type AuthenticatedRequest,
} from './auth.ts';
import type { CustomerRow, LedgerEntryRow, StoreRow, UserRow } from './db.ts';
import {
  normalizeIndianPhone,
  validateLoginInput,
  validateRegistrationInput,
} from './validation.ts';
import {
  extractVoiceIntent,
  getVerifiedVoicePipelineStatus,
  synthesizeWithGnani,
  transcribeWithGnani,
} from './voicePipeline.ts';
import {
  computeLedgerReport,
  createSampleSeedData,
  filterLedgerEntries,
  type ReportPeriodType,
} from '../src/utils/ledgerLogic.ts';
import type { LanguageCode } from '../src/types/khata.ts';

function mapStore(row: StoreRow) {
  return {
    id: row.id,
    storeName: row.store_name,
    storeLocation: row.store_location,
    language: row.language,
    theme: row.theme,
    voiceWsUrl: row.voice_ws_url,
    demoMode: Boolean(row.demo_mode),
    aiDisclosurePlayed: Boolean(row.ai_disclosure_played),
    createdAt: row.created_at,
  };
}

function mapCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    tag: row.tag ?? undefined,
    remindersOptIn: Boolean(row.reminders_opt_in),
    createdAt: row.created_at,
  };
}

function mapEntry(row: LedgerEntryRow) {
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
  };
}

export function createApiApp(db: Database.Database): express.Express {
  initJwtSecret(db);

  const app = express();
  app.set('trust proxy', 1);
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host) as
        | string
        | undefined;
      if (isAllowedOrigin(origin, hostHeader)) {
        callback(null, {
          origin: origin || true,
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
        });
      } else {
        callback(null, { origin: false });
      }
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api', verifyMutationOrigin);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // =========================================================================
  // AUTHENTICATION ROUTES
  // =========================================================================

  /**
   * POST /api/auth/register
   * Registers a new store owner with unique +91 phone number, bcrypt-hashed password,
   * creates their store row, and sets an HTTP-only JWT session cookie.
   */
  app.post('/api/auth/register', async (req, res) => {
    try {
      const validation = validateRegistrationInput(req.body ?? {});
      if (!validation.ok) {
        res.status(400).json({ error: validation.error, field: validation.field });
        return;
      }

      const { storeName, storeLocation, phoneNumber, password } = validation.data;

      // Check duplicate phone number
      const existing = db
        .prepare('SELECT id FROM users WHERE phone_number = ?')
        .get(phoneNumber) as { id: number } | undefined;

      if (existing) {
        res.status(409).json({
          field: 'phoneNumber',
          error:
            'This phone number is already registered. Please log in instead.',
        });
        return;
      }

      const passwordHash = await hashSecret(password);
      const recoveryCode = generateRecoveryCode();
      const recoveryCodeHash = await hashSecret(recoveryCode);
      const nowIso = new Date().toISOString();

      const createAccountTx = db.transaction(() => {
        const userInfo = db
          .prepare(
            'INSERT INTO users (phone_number, password_hash, recovery_code_hash, created_at) VALUES (?, ?, ?, ?)'
          )
          .run(phoneNumber, passwordHash, recoveryCodeHash, nowIso);
        const userId = Number(userInfo.lastInsertRowid);

        const storeInfo = db
          .prepare(
            'INSERT INTO stores (user_id, store_name, store_location, created_at) VALUES (?, ?, ?, ?)'
          )
          .run(userId, storeName, storeLocation, nowIso);
        const storeId = Number(storeInfo.lastInsertRowid);

        return { userId, storeId };
      });

      const { userId, storeId } = createAccountTx();
      const token = signSessionToken({ userId, storeId, phoneNumber });
      setSessionCookie(req, res, token);

      const storeRow = db
        .prepare('SELECT * FROM stores WHERE id = ?')
        .get(storeId) as StoreRow;

      res.status(201).json({
        user: { id: userId, phoneNumber },
        store: mapStore(storeRow),
        recoveryCode,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Could not register store right now.' });
    }
  });

  /**
   * POST /api/auth/login
   * Verifies +91 phone number and bcrypt password hash, issues HTTP-only JWT cookie.
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const validation = validateLoginInput(req.body ?? {});
      if (!validation.ok) {
        res.status(400).json({ error: validation.error, field: validation.field });
        return;
      }

      const { phoneNumber, password } = validation.data;
      const user = db
        .prepare('SELECT * FROM users WHERE phone_number = ?')
        .get(phoneNumber) as UserRow | undefined;

      if (!user) {
        res.status(401).json({
          error: 'Invalid phone number or password.',
        });
        return;
      }

      const validPassword = await verifySecret(password, user.password_hash);
      if (!validPassword) {
        res.status(401).json({
          error: 'Invalid phone number or password.',
        });
        return;
      }

      const storeRow = db
        .prepare('SELECT * FROM stores WHERE user_id = ?')
        .get(user.id) as StoreRow | undefined;

      if (!storeRow) {
        res.status(500).json({ error: 'Store record not found for user.' });
        return;
      }

      const token = signSessionToken({
        userId: user.id,
        storeId: storeRow.id,
        phoneNumber: user.phone_number,
      });
      setSessionCookie(req, res, token);

      res.json({
        user: { id: user.id, phoneNumber: user.phone_number },
        store: mapStore(storeRow),
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Could not log in right now.' });
    }
  });

  /**
   * POST /api/auth/forgot-password
   * Resets password only after verifying the phone number and 6-digit Store Recovery Code.
   */
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const phoneNumber = normalizeIndianPhone(req.body?.phoneNumber);
      if (!phoneNumber) {
        res.status(400).json({
          error: 'Please enter a valid 10-digit Indian mobile number.',
        });
        return;
      }

      const recoveryCode =
        typeof req.body?.recoveryCode === 'string'
          ? req.body.recoveryCode.trim()
          : '';
      const newPassword =
        typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (!/^\d{6}$/.test(recoveryCode)) {
        res.status(400).json({
          error: 'Please enter your 6-digit Store Recovery Code.',
        });
        return;
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        res.status(400).json({
          error: 'New password must be at least 6 characters long.',
        });
        return;
      }

      const user = db
        .prepare('SELECT * FROM users WHERE phone_number = ?')
        .get(phoneNumber) as UserRow | undefined;

      if (!user || !user.recovery_code_hash) {
        res.status(401).json({
          error: 'Invalid phone number or recovery code.',
        });
        return;
      }

      const validCode = await verifySecret(recoveryCode, user.recovery_code_hash);
      if (!validCode) {
        res.status(401).json({
          error: 'Invalid phone number or recovery code.',
        });
        return;
      }

      const nextHash = await hashSecret(newPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        nextHash,
        user.id
      );

      res.json({ ok: true, message: 'Password updated. Please log in.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Could not reset password right now.' });
    }
  });

  /**
   * POST /api/auth/logout
   * Clears the HTTP-only session cookie.
   */
  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  /**
   * GET /api/auth/me
   * Returns current authenticated user & store profile or 401.
   */
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const user = db
      .prepare('SELECT id, phone_number, created_at FROM users WHERE id = ?')
      .get(userId) as { id: number; phone_number: string; created_at: string } | undefined;
    const store = db
      .prepare('SELECT * FROM stores WHERE id = ? AND user_id = ?')
      .get(storeId, userId) as StoreRow | undefined;

    if (!user || !store) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Session no longer valid.' });
      return;
    }

    res.json({
      user: { id: user.id, phoneNumber: user.phone_number },
      store: mapStore(store),
    });
  });

  /**
   * POST /api/auth/recovery-code
   * Allows an authenticated store owner to generate/rotate a fresh 6-digit recovery code.
   */
  app.post(
    '/api/auth/recovery-code',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      const { userId } = req.auth!;
      const recoveryCode = generateRecoveryCode();
      const recoveryCodeHash = await hashSecret(recoveryCode);
      db.prepare('UPDATE users SET recovery_code_hash = ? WHERE id = ?').run(
        recoveryCodeHash,
        userId
      );
      res.json({ recoveryCode });
    }
  );

  // =========================================================================
  // PROTECTED STORE-SCOPED KHATA ROUTES (100% isolated by req.auth.storeId)
  // =========================================================================

  /**
   * GET /api/khata
   * Returns store settings, customers, and ledger entries strictly for the signed-in store.
   */
  app.get('/api/khata', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const store = db
      .prepare('SELECT * FROM stores WHERE id = ? AND user_id = ?')
      .get(storeId, userId) as StoreRow | undefined;

    if (!store) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    const customers = db
      .prepare('SELECT * FROM customers WHERE store_id = ? ORDER BY created_at DESC')
      .all(storeId) as CustomerRow[];

    const entries = db
      .prepare('SELECT * FROM ledger_entries WHERE store_id = ? ORDER BY created_at DESC')
      .all(storeId) as LedgerEntryRow[];

    res.json({
      store: mapStore(store),
      customers: customers.map(mapCustomer),
      entries: entries.map(mapEntry),
    });
  });

  /**
   * PUT /api/store/settings
   * Updates store profile and preferences for the authenticated user's store only.
   */
  app.put('/api/store/settings', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const current = db
      .prepare('SELECT * FROM stores WHERE id = ? AND user_id = ?')
      .get(storeId, userId) as StoreRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    const body = req.body ?? {};
    const storeName =
      typeof body.storeName === 'string' && body.storeName.trim().length >= 2
        ? body.storeName.trim().slice(0, 80)
        : current.store_name;
    const storeLocation =
      typeof body.storeLocation === 'string' && body.storeLocation.trim().length >= 2
        ? body.storeLocation.trim().slice(0, 200)
        : current.store_location;
    const allowedLangs = new Set(['hi', 'kn', 'ta', 'te', 'mr', 'bn', 'en']);
    const language =
      typeof body.language === 'string' && allowedLangs.has(body.language)
        ? body.language
        : current.language;
    const theme =
      body.theme === 'light' || body.theme === 'dark'
        ? body.theme
        : current.theme;
    const voiceWsUrl =
      typeof body.voiceWsUrl === 'string'
        ? body.voiceWsUrl.trim().slice(0, 300)
        : current.voice_ws_url;
    const demoMode =
      typeof body.demoMode === 'boolean'
        ? body.demoMode
          ? 1
          : 0
        : current.demo_mode;
    const aiDisclosurePlayed =
      typeof body.aiDisclosurePlayed === 'boolean'
        ? body.aiDisclosurePlayed
          ? 1
          : 0
        : current.ai_disclosure_played;

    db.prepare(
      `UPDATE stores
       SET store_name = ?, store_location = ?, language = ?, theme = ?, voice_ws_url = ?, demo_mode = ?, ai_disclosure_played = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      storeName,
      storeLocation,
      language,
      theme,
      voiceWsUrl,
      demoMode,
      aiDisclosurePlayed,
      storeId,
      userId
    );

    const updated = db
      .prepare('SELECT * FROM stores WHERE id = ?')
      .get(storeId) as StoreRow;
    res.json({ store: mapStore(updated) });
  });

  /**
   * POST /api/entries
   * Adds a new entry (and creates customer if needed) scoped to the authenticated store.
   */
  app.post('/api/entries', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const body = req.body ?? {};
    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim().length > 0
        ? body.customerName.trim().slice(0, 80)
        : 'Walk-in Customer';
    const amount = Number(body.amount);
    const direction = body.direction;
    const date =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : new Date().toISOString().slice(0, 10);
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().slice(0, 160)
        : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }
    if (direction !== 'credit' && direction !== 'payment') {
      res.status(400).json({ error: 'Invalid transaction direction.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const roundedAmount = Math.max(1, Math.round(amount));

    const tx = db.transaction(() => {
      let customer: CustomerRow | undefined;
      if (typeof body.customerId === 'string' && body.customerId.trim()) {
        customer = db
          .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
          .get(body.customerId.trim(), storeId) as CustomerRow | undefined;
      }
      if (!customer) {
        customer = db
          .prepare(
            'SELECT * FROM customers WHERE store_id = ? AND LOWER(name) = LOWER(?)'
          )
          .get(storeId, customerName) as CustomerRow | undefined;
      }

      if (!customer) {
        const newCustId = `cust-${storeId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        db.prepare(
          'INSERT INTO customers (id, store_id, name, phone, tag, reminders_opt_in, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
        ).run(newCustId, storeId, customerName, '', null, nowIso);
        customer = db
          .prepare('SELECT * FROM customers WHERE id = ?')
          .get(newCustId) as CustomerRow;
      }

      const newEntryId = `ent-${storeId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      db.prepare(
        `INSERT INTO ledger_entries (id, store_id, customer_id, customer_name, amount, direction, date, created_at, note, undone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(
        newEntryId,
        storeId,
        customer.id,
        customer.name,
        roundedAmount,
        direction,
        date,
        nowIso,
        note
      );

      const createdEntry = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ?')
        .get(newEntryId) as LedgerEntryRow;

      return { customer, createdEntry };
    });

    const result = tx();
    res.status(201).json({
      customer: mapCustomer(result.customer),
      entry: mapEntry(result.createdEntry),
    });
  });

  /**
   * PATCH /api/entries/:id
   * Edits an existing entry owned by the authenticated store.
   */
  app.patch('/api/entries/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const entryId = req.params.id;
    const current = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?')
      .get(entryId, storeId) as LedgerEntryRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const body = req.body ?? {};
    const amount =
      body.amount !== undefined
        ? Math.max(1, Math.round(Number(body.amount) || current.amount))
        : current.amount;
    const direction =
      body.direction === 'credit' || body.direction === 'payment'
        ? body.direction
        : current.direction;
    const date =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : current.date;
    const note =
      body.note === undefined
        ? current.note
        : typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().slice(0, 160)
        : null;

    db.prepare(
      'UPDATE ledger_entries SET amount = ?, direction = ?, date = ?, note = ? WHERE id = ? AND store_id = ?'
    ).run(amount, direction, date, note, entryId, storeId);

    const updated = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ?')
      .get(entryId) as LedgerEntryRow;
    res.json({ entry: mapEntry(updated) });
  });

  /**
   * POST /api/entries/:id/undo
   * Toggles undone flag on an entry owned by the authenticated store.
   */
  app.post('/api/entries/:id/undo', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const entryId = req.params.id;
    const current = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?')
      .get(entryId, storeId) as LedgerEntryRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const nextUndone = current.undone ? 0 : 1;
    db.prepare(
      'UPDATE ledger_entries SET undone = ? WHERE id = ? AND store_id = ?'
    ).run(nextUndone, entryId, storeId);

    const updated = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ?')
      .get(entryId) as LedgerEntryRow;
    res.json({ entry: mapEntry(updated) });
  });

  /**
   * DELETE /api/entries/:id
   * Deletes an entry owned by the authenticated store.
   */
  app.delete('/api/entries/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const info = db
      .prepare('DELETE FROM ledger_entries WHERE id = ? AND store_id = ?')
      .run(req.params.id, storeId);

    if (info.changes === 0) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/customers/:id/toggle-reminder
   * Toggles reminders_opt_in for a customer owned by the authenticated store.
   */
  app.post(
    '/api/customers/:id/toggle-reminder',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const customerId = req.params.id;
      const current = db
        .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
        .get(customerId, storeId) as CustomerRow | undefined;

      if (!current) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      const nextOptIn = current.reminders_opt_in ? 0 : 1;
      db.prepare(
        'UPDATE customers SET reminders_opt_in = ? WHERE id = ? AND store_id = ?'
      ).run(nextOptIn, customerId, storeId);

      const updated = db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(customerId) as CustomerRow;
      res.json({ customer: mapCustomer(updated) });
    }
  );

  /**
   * POST /api/khata/seed-demo
   * Seeds 6 synthetic customers (two Rameshes) into the authenticated store
   * ONLY if the store currently has zero customers (preserves existing data).
   */
  app.post('/api/khata/seed-demo', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM customers WHERE store_id = ?')
      .get(storeId) as { cnt: number };

    if (countRow.cnt === 0) {
      const seed = createSampleSeedData();
      const insertCust = db.prepare(
        'INSERT INTO customers (id, store_id, name, phone, tag, reminders_opt_in, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const insertEntry = db.prepare(
        'INSERT INTO ledger_entries (id, store_id, customer_id, customer_name, amount, direction, date, created_at, note, undone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
      );

      const seedTx = db.transaction(() => {
        const idMap = new Map<string, string>();
        for (const c of seed.customers) {
          const scopedId = `${c.id}-s${storeId}`;
          idMap.set(c.id, scopedId);
          insertCust.run(
            scopedId,
            storeId,
            c.name,
            c.phone,
            c.tag ?? null,
            c.remindersOptIn ? 1 : 0,
            c.createdAt
          );
        }
        for (const e of seed.entries) {
          const scopedEntryId = `${e.id}-s${storeId}`;
          const mappedCustId = idMap.get(e.customerId) ?? e.customerId;
          insertEntry.run(
            scopedEntryId,
            storeId,
            mappedCustId,
            e.customerName,
            e.amount,
            e.direction,
            e.date,
            e.createdAt,
            e.note ?? null
          );
        }
      });

      seedTx();
    }

    const customers = db
      .prepare('SELECT * FROM customers WHERE store_id = ? ORDER BY created_at DESC')
      .all(storeId) as CustomerRow[];
    const entries = db
      .prepare('SELECT * FROM ledger_entries WHERE store_id = ? ORDER BY created_at DESC')
      .all(storeId) as LedgerEntryRow[];

    res.json({
      customers: customers.map(mapCustomer),
      entries: entries.map(mapEntry),
    });
  });

  /**
   * DELETE /api/khata
   * Clears customers and entries strictly for the authenticated store.
   */
  app.delete('/api/khata', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM ledger_entries WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM customers WHERE store_id = ?').run(storeId);
    });
    tx();
    res.json({ ok: true });
  });

  // =========================================================================
  // CUSTOMER CRUD ROUTES (Store-scoped)
  // =========================================================================

  app.post('/api/customers', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const body = req.body ?? {};
    const name =
      typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const phoneDigits = rawPhone.replace(/\D/g, '').slice(-10);
    const tag =
      typeof body.tag === 'string' && body.tag.trim()
        ? body.tag.trim().slice(0, 60)
        : null;
    const remindersOptIn = body.remindersOptIn === true ? 1 : 0;

    if (name.length < 1) {
      res.status(400).json({ error: 'Customer name is required.' });
      return;
    }

    if (rawPhone && !/^[6-9]\d{9}$/.test(phoneDigits)) {
      res
        .status(400)
        .json({ error: 'Please enter a valid 10-digit mobile number or leave it blank.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const id = `cust-${storeId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    db.prepare(
      'INSERT INTO customers (id, store_id, name, phone, tag, reminders_opt_in, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, storeId, name, phoneDigits, tag, remindersOptIn, nowIso);

    const created = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(id) as CustomerRow;
    res.status(201).json({ customer: mapCustomer(created) });
  });

  app.patch('/api/customers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const customerId = req.params.id;
    const current = db
      .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
      .get(customerId, storeId) as CustomerRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const body = req.body ?? {};
    const name =
      typeof body.name === 'string'
        ? body.name.trim().slice(0, 80)
        : current.name;
    if (!name) {
      res.status(400).json({ error: 'Customer name cannot be empty.' });
      return;
    }

    let phone = current.phone;
    if (body.phone !== undefined) {
      const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (!rawPhone) {
        phone = '';
      } else {
        const digits = rawPhone.replace(/\D/g, '').slice(-10);
        if (!/^[6-9]\d{9}$/.test(digits)) {
          res
            .status(400)
            .json({ error: 'Please enter a valid 10-digit mobile number or leave it blank.' });
          return;
        }
        phone = digits;
      }
    }

    const tag =
      body.tag === undefined
        ? current.tag
        : typeof body.tag === 'string' && body.tag.trim()
        ? body.tag.trim().slice(0, 60)
        : null;
    const remindersOptIn =
      typeof body.remindersOptIn === 'boolean'
        ? body.remindersOptIn
          ? 1
          : 0
        : current.reminders_opt_in;

    const updateTx = db.transaction(() => {
      db.prepare(
        'UPDATE customers SET name = ?, phone = ?, tag = ?, reminders_opt_in = ? WHERE id = ? AND store_id = ?'
      ).run(name, phone, tag, remindersOptIn, customerId, storeId);
      if (name !== current.name) {
        db.prepare(
          'UPDATE ledger_entries SET customer_name = ? WHERE customer_id = ? AND store_id = ?'
        ).run(name, customerId, storeId);
      }
    });
    updateTx();

    const updated = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(customerId) as CustomerRow;
    res.json({ customer: mapCustomer(updated) });
  });

  app.delete('/api/customers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const customerId = req.params.id;
    const info = db
      .prepare('DELETE FROM customers WHERE id = ? AND store_id = ?')
      .run(customerId, storeId);

    if (info.changes === 0) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // FILTERED TRANSACTIONS & REPORTS ROUTES
  // =========================================================================

  app.get('/api/entries', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const rows = db
      .prepare('SELECT * FROM ledger_entries WHERE store_id = ? ORDER BY created_at DESC')
      .all(storeId) as LedgerEntryRow[];

    const mapped = rows.map(mapEntry);
    const dirParam = req.query.direction;
    const direction =
      dirParam === 'credit' || dirParam === 'payment' ? dirParam : 'all';

    const filtered = filterLedgerEntries(mapped, {
      search: typeof req.query.search === 'string' ? req.query.search : '',
      direction,
      startDate:
        typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate:
        typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      includeUndone: req.query.includeUndone !== 'false',
    });

    res.json({ entries: filtered });
  });

  app.get('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const customers = (
      db
        .prepare('SELECT * FROM customers WHERE store_id = ?')
        .all(storeId) as CustomerRow[]
    ).map(mapCustomer);
    const entries = (
      db
        .prepare('SELECT * FROM ledger_entries WHERE store_id = ?')
        .all(storeId) as LedgerEntryRow[]
    ).map(mapEntry);

    const rawPeriod = String(req.query.period || 'daily');
    const period: ReportPeriodType =
      rawPeriod === 'weekly' || rawPeriod === 'monthly' || rawPeriod === 'custom'
        ? rawPeriod
        : 'daily';

    const report = computeLedgerReport(customers, entries, {
      period,
      startDate:
        typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate:
        typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    });

    res.json({ report });
  });

  // =========================================================================
  // VOICE PIPELINE ROUTES (Gnani STT/TTS + Server-side Gemini Intent)
  // =========================================================================

  app.get('/api/voice/status', requireAuth, async (_req, res) => {
    const status = await getVerifiedVoicePipelineStatus();
    res.json(status);
  });

  app.post(
    '/api/voice/process',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { storeId } = req.auth!;
        const body = req.body ?? {};
        const allowedLangs = new Set(['hi', 'kn', 'ta', 'te', 'mr', 'bn', 'en']);
        const language: LanguageCode = allowedLangs.has(body.language)
          ? body.language
          : 'en';
        const hasPendingConfirmation = Boolean(body.hasPendingConfirmation);

        let transcript =
          typeof body.transcript === 'string' ? body.transcript.trim() : '';
        let sttProvider: 'gnani-prisma-v3' | 'text-input' = 'text-input';

        if (!transcript && typeof body.audioBase64 === 'string' && body.audioBase64) {
          const audioBuffer = Buffer.from(body.audioBase64, 'base64');
          if (audioBuffer.byteLength === 0) {
            res.status(400).json({ error: 'Recorded audio is empty.' });
            return;
          }

          const mimeType =
            typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm';
          const sttResult = await transcribeWithGnani({
            audioBuffer,
            mimeType,
            language,
          });

          if (!sttResult.ok) {
            // Avoid 502/503 here because hosting reverse proxies intercept 502/503/504
            // and replace JSON error payloads with 200 OK HTML fallback pages.
            const statusCode =
              sttResult.code === 'GNANI_NOT_CONFIGURED' ? 501 : 424;
            res.status(statusCode).json({
              code: sttResult.code,
              error: sttResult.error,
              audioBytesReceived: audioBuffer.byteLength,
            });
            return;
          }

          transcript = sttResult.transcript;
          sttProvider = sttResult.provider;
        }

        if (!transcript) {
          res.status(400).json({ error: 'Please speak or enter a command.' });
          return;
        }

        const customerRows = db
          .prepare('SELECT name FROM customers WHERE store_id = ?')
          .all(storeId) as Array<Pick<CustomerRow, 'name'>>;

        const extracted = await extractVoiceIntent({
          transcript,
          language,
          hasPendingConfirmation,
          customerNames: customerRows.map((c) => c.name),
        });

        res.json({
          transcript,
          sttProvider,
          intentProvider: extracted.intentProvider,
          outcome: extracted.outcome,
          confirmationRequired: true,
        });
      } catch (err) {
        console.error('Voice process error:', err);
        res.status(500).json({ error: 'Could not process voice request.' });
      }
    }
  );

  app.post('/api/voice/tts', requireAuth, async (req, res) => {
    const body = req.body ?? {};
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
    const allowedLangs = new Set(['hi', 'kn', 'ta', 'te', 'mr', 'bn', 'en']);
    const language: LanguageCode = allowedLangs.has(body.language)
      ? body.language
      : 'en';

    if (!text) {
      res.status(400).json({ error: 'Text is required for speech output.' });
      return;
    }

    const result = await synthesizeWithGnani({ text, language });
    if (!result.ok) {
      res.json({
        provider: 'not_configured',
        code: result.code,
        error: result.error,
      });
      return;
    }

    res.json({
      provider: result.provider,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
    });
  });

  return app;
}
