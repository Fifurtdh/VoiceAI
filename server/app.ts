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
import {
  computeCustomerIntelligence,
  computeCustomerStatement,
  computeEnhancedReport,
  createChatSession,
  findPotentialDuplicateEntries,
  generateSmartReminderMessage,
  getChatSessionMessages,
  getRemindersOverview,
  handleBusinessChatTurn,
  listAuditLogs,
  listChatSessions,
  searchTransactionsSmart,
  writeAuditLog,
  type ReminderLanguage,
} from './businessIntelligence.ts';
import type { PaymentReminderRow } from './db.ts';

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
    reversalOfId: row.reversal_of_id ?? undefined,
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
   * POST /api/entries/check-duplicate
   * Detects potential duplicate entries (same customer, amount, direction on same date or within 15 min)
   * without auto-blocking legitimate repeat purchases.
   */
  app.post(
    '/api/entries/check-duplicate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const body = req.body ?? {};
      const customerName =
        typeof body.customerName === 'string' ? body.customerName.trim() : '';
      const amount = Number(body.amount);
      const direction = body.direction;
      const date =
        typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
          ? body.date
          : new Date().toISOString().slice(0, 10);

      if (!customerName || !Number.isFinite(amount) || amount <= 0 || (direction !== 'credit' && direction !== 'payment')) {
        res.json({ isDuplicate: false, matches: [] });
        return;
      }

      const matches = findPotentialDuplicateEntries(db, storeId, {
        customerId: typeof body.customerId === 'string' ? body.customerId.trim() : undefined,
        customerName,
        amount,
        direction,
        date,
      });

      res.json({ isDuplicate: matches.length > 0, matches });
    }
  );

  /**
   * POST /api/entries
   * Adds a new entry (and creates customer if needed) scoped to the authenticated store.
   * Supports idempotent clientRequestId, optional duplicate guard, and audit logging.
   */
  app.post('/api/entries', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
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
    const clientRequestId =
      typeof body.clientRequestId === 'string' && body.clientRequestId.trim()
        ? body.clientRequestId.trim().slice(0, 80)
        : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }
    if (direction !== 'credit' && direction !== 'payment') {
      res.status(400).json({ error: 'Invalid transaction direction.' });
      return;
    }

    // Idempotency protection: return existing entry if same clientRequestId already committed
    if (clientRequestId) {
      const existingByReq = db
        .prepare(
          'SELECT * FROM ledger_entries WHERE store_id = ? AND client_request_id = ?'
        )
        .get(storeId, clientRequestId) as LedgerEntryRow | undefined;
      if (existingByReq) {
        const cust = db
          .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
          .get(existingByReq.customer_id, storeId) as CustomerRow;
        res.status(200).json({
          customer: mapCustomer(cust),
          entry: mapEntry(existingByReq),
          deduplicated: true,
        });
        return;
      }
    }

    // Optional duplicate check when requested by client before explicit confirmation
    if (body.checkDuplicate === true && body.confirmDuplicate !== true) {
      const matches = findPotentialDuplicateEntries(db, storeId, {
        customerId: typeof body.customerId === 'string' ? body.customerId.trim() : undefined,
        customerName,
        amount,
        direction,
        date,
      });
      if (matches.length > 0) {
        res.status(409).json({
          code: 'POTENTIAL_DUPLICATE',
          error: `A matching ₹${Math.round(amount)} ${direction} entry for ${matches[0].customerName} was already recorded on ${matches[0].date}. Please confirm to save anyway.`,
          duplicates: matches,
        });
        return;
      }
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
        `INSERT INTO ledger_entries (id, store_id, customer_id, customer_name, amount, direction, date, created_at, note, undone, client_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).run(
        newEntryId,
        storeId,
        customer.id,
        customer.name,
        roundedAmount,
        direction,
        date,
        nowIso,
        note,
        clientRequestId
      );

      const createdEntry = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ?')
        .get(newEntryId) as LedgerEntryRow;

      writeAuditLog(db, {
        storeId,
        userId,
        action: 'entry_created',
        entityType: 'ledger_entry',
        entityId: newEntryId,
        after: mapEntry(createdEntry),
        reason: body.confirmDuplicate ? 'Confirmed after duplicate warning' : null,
      });

      return { customer, createdEntry };
    });

    const result = tx();
    res.status(201).json({
      customer: mapCustomer(result.customer),
      entry: mapEntry(result.createdEntry),
    });
  });

  /**
   * POST /api/entries/:id/reverse
   * Auditable reversal or correction of a committed entry.
   * Marks the original entry undone (preserving history) and optionally inserts a corrected entry
   * inside one atomic SQLite transaction with full audit trail.
   */
  app.post(
    '/api/entries/:id/reverse',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { userId, storeId } = req.auth!;
      const entryId = req.params.id;
      const current = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?')
        .get(entryId, storeId) as LedgerEntryRow | undefined;

      if (!current) {
        res.status(404).json({ error: 'Entry not found.' });
        return;
      }

      const body = req.body ?? {};
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 160)
          : 'Reversed by shopkeeper';
      const hasReplacement =
        body.replacementAmount !== undefined &&
        Number.isFinite(Number(body.replacementAmount)) &&
        Number(body.replacementAmount) > 0;

      const nowIso = new Date().toISOString();

      const tx = db.transaction(() => {
        db.prepare(
          'UPDATE ledger_entries SET undone = 1 WHERE id = ? AND store_id = ?'
        ).run(entryId, storeId);

        const reversedRow = db
          .prepare('SELECT * FROM ledger_entries WHERE id = ?')
          .get(entryId) as LedgerEntryRow;

        let replacementRow: LedgerEntryRow | null = null;
        if (hasReplacement) {
          const repId = `ent-${storeId}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          const repAmount = Math.max(1, Math.round(Number(body.replacementAmount)));
          const repDirection =
            body.replacementDirection === 'credit' ||
            body.replacementDirection === 'payment'
              ? body.replacementDirection
              : current.direction;
          const repNote =
            typeof body.replacementNote === 'string' && body.replacementNote.trim()
              ? body.replacementNote.trim().slice(0, 160)
              : `Correction of ₹${current.amount} (${reason})`;

          db.prepare(
            `INSERT INTO ledger_entries (id, store_id, customer_id, customer_name, amount, direction, date, created_at, note, undone, reversal_of_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
          ).run(
            repId,
            storeId,
            current.customer_id,
            current.customer_name,
            repAmount,
            repDirection,
            current.date,
            nowIso,
            repNote,
            current.id
          );
          replacementRow = db
            .prepare('SELECT * FROM ledger_entries WHERE id = ?')
            .get(repId) as LedgerEntryRow;
        }

        writeAuditLog(db, {
          storeId,
          userId,
          action: hasReplacement ? 'entry_corrected' : 'entry_reversed',
          entityType: 'ledger_entry',
          entityId: entryId,
          before: mapEntry(current),
          after: replacementRow ? mapEntry(replacementRow) : mapEntry(reversedRow),
          reason,
        });

        return { reversedRow, replacementRow };
      });

      const out = tx();
      res.json({
        reversedEntry: mapEntry(out.reversedRow),
        replacementEntry: out.replacementRow ? mapEntry(out.replacementRow) : null,
      });
    }
  );

  /**
   * PATCH /api/entries/:id
   * Edits an existing entry owned by the authenticated store (with audit log).
   */
  app.patch('/api/entries/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
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

    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE ledger_entries SET amount = ?, direction = ?, date = ?, note = ? WHERE id = ? AND store_id = ?'
      ).run(amount, direction, date, note, entryId, storeId);

      const updated = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ?')
        .get(entryId) as LedgerEntryRow;

      writeAuditLog(db, {
        storeId,
        userId,
        action: 'entry_edited',
        entityType: 'ledger_entry',
        entityId: entryId,
        before: mapEntry(current),
        after: mapEntry(updated),
      });

      return updated;
    });

    const updated = tx();
    res.json({ entry: mapEntry(updated) });
  });

  /**
   * POST /api/entries/:id/undo
   * Toggles undone flag on an entry owned by the authenticated store (with audit log).
   */
  app.post('/api/entries/:id/undo', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const entryId = req.params.id;
    const current = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?')
      .get(entryId, storeId) as LedgerEntryRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const nextUndone = current.undone ? 0 : 1;
    if (nextUndone === 0) {
      const activeReplacement = db
        .prepare(
          'SELECT id FROM ledger_entries WHERE store_id = ? AND reversal_of_id = ? AND COALESCE(undone, 0) = 0 LIMIT 1'
        )
        .get(storeId, entryId) as { id: string } | undefined;
      if (activeReplacement) {
        res.status(409).json({
          error:
            'This entry was already superseded by a corrected entry. Undo or reverse the corrected entry first to avoid double-counting.',
        });
        return;
      }
    }

    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE ledger_entries SET undone = ? WHERE id = ? AND store_id = ?'
      ).run(nextUndone, entryId, storeId);

      const updated = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ?')
        .get(entryId) as LedgerEntryRow;

      writeAuditLog(db, {
        storeId,
        userId,
        action: nextUndone ? 'entry_undone' : 'entry_restored',
        entityType: 'ledger_entry',
        entityId: entryId,
        before: mapEntry(current),
        after: mapEntry(updated),
      });

      return updated;
    });

    const updated = tx();
    res.json({ entry: mapEntry(updated) });
  });

  /**
   * DELETE /api/entries/:id
   * Deletes an entry owned by the authenticated store (with audit log).
   */
  app.delete('/api/entries/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const current = db
      .prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?')
      .get(req.params.id, storeId) as LedgerEntryRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM ledger_entries WHERE id = ? AND store_id = ?').run(
        req.params.id,
        storeId
      );
      writeAuditLog(db, {
        storeId,
        userId,
        action: 'entry_deleted',
        entityType: 'ledger_entry',
        entityId: current.id,
        before: mapEntry(current),
      });
    });
    tx();
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
  // BUSINESS INTELLIGENCE, CUSTOMER INSIGHTS, SMART SEARCH, REMINDERS & CHAT
  // =========================================================================

  /**
   * GET /api/reports/enhanced
   * Full daily/weekly/monthly/custom BI analytics with previous-period comparisons,
   * daily chart series, top customers, increasing balances, and exportable transaction list.
   */
  app.get('/api/reports/enhanced', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const rawPeriod = String(req.query.period || 'daily');
    const period: ReportPeriodType =
      rawPeriod === 'weekly' || rawPeriod === 'monthly' || rawPeriod === 'custom'
        ? rawPeriod
        : 'daily';

    const report = computeEnhancedReport(db, storeId, {
      period,
      startDate:
        typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate:
        typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    });
    res.json({ report });
  });

  /**
   * GET /api/customers/intelligence
   * Returns enriched customer intelligence profiles, insight segments,
   * and optional natural-language smart customer search (?q=...).
   */
  app.get(
    '/api/customers/intelligence',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const result = computeCustomerIntelligence(db, storeId, q);
      res.json(result);
    }
  );

  /**
   * GET /api/customers/:id/statement
   * Returns complete customer profile with running-balance ledger, timestamps,
   * monthly activity, and optional date/search filters.
   */
  app.get(
    '/api/customers/:id/statement',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const statement = computeCustomerStatement(db, storeId, req.params.id, {
        startDate:
          typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate:
          typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        search:
          typeof req.query.search === 'string' ? req.query.search : undefined,
      });

      if (!statement) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }
      res.json({ statement });
    }
  );

  /**
   * GET /api/entries/search
   * Natural-language smart transaction search ("yesterday's payments", "above 1,000 rupees", etc.).
   */
  app.get('/api/entries/search', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const dirParam = req.query.direction;
    const direction =
      dirParam === 'credit' || dirParam === 'payment' ? dirParam : 'all';

    const result = searchTransactionsSmart(db, storeId, q, {
      direction,
      startDate:
        typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate:
        typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      includeUndone: req.query.includeUndone !== 'false',
    });
    res.json(result);
  });

  /**
   * GET /api/audit-logs
   * Returns recent auditable financial mutation logs strictly for the authenticated store.
   */
  app.get('/api/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const limit = Number(req.query.limit) || 40;
    const logs = listAuditLogs(db, storeId, limit);
    res.json({ logs });
  });

  // ---- KHATA AI ASSISTANT CHATBOT ROUTES ----

  app.get('/api/chat/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    res.json({ sessions: listChatSessions(db, storeId) });
  });

  app.post('/api/chat/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storeId } = req.auth!;
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 80)
        : 'New Khata Chat';
    const session = createChatSession(db, storeId, title);
    res.status(201).json({ session });
  });

  app.get(
    '/api/chat/sessions/:id/messages',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const messages = getChatSessionMessages(db, storeId, req.params.id);
      if (!messages) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }
      res.json({ messages });
    }
  );

  app.delete(
    '/api/chat/sessions/:id',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const info = db
        .prepare('DELETE FROM chat_sessions WHERE id = ? AND store_id = ?')
        .run(req.params.id, storeId);
      if (info.changes === 0) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/chat/message',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { userId, storeId } = req.auth!;
        const body = req.body ?? {};
        const message =
          typeof body.message === 'string' ? body.message.trim() : '';
        if (!message) {
          res.status(400).json({ error: 'Please enter a question for Khata AI Assistant.' });
          return;
        }

        const store = db
          .prepare('SELECT * FROM stores WHERE id = ? AND user_id = ?')
          .get(storeId, userId) as StoreRow | undefined;
        if (!store) {
          res.status(404).json({ error: 'Store not found.' });
          return;
        }

        const allowedLangs = new Set(['hi', 'kn', 'ta', 'te', 'mr', 'bn', 'en']);
        const language: LanguageCode | undefined = allowedLangs.has(body.language)
          ? (body.language as LanguageCode)
          : undefined;
        const storeLang: LanguageCode = allowedLangs.has(store.language)
          ? (store.language as LanguageCode)
          : 'en';

        const result = await handleBusinessChatTurn(
          db,
          storeId,
          store.store_name,
          storeLang,
          {
            sessionId:
              typeof body.sessionId === 'string' ? body.sessionId.trim() : undefined,
            message,
            language,
          }
        );

        res.json(result);
      } catch (err) {
        console.error('Khata AI chat error:', err);
        res.status(500).json({ error: 'Could not answer right now. Please retry.' });
      }
    }
  );

  // ---- SMART PAYMENT REMINDERS ROUTES ----

  app.get(
    '/api/reminders/overview',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const { storeId } = req.auth!;
      const sortBy = req.query.sort === 'overdue' ? 'overdue' : 'amount';
      res.json(getRemindersOverview(db, storeId, sortBy));
    }
  );

  app.post(
    '/api/reminders/generate',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { userId, storeId } = req.auth!;
        const body = req.body ?? {};
        const customerId =
          typeof body.customerId === 'string' ? body.customerId.trim() : '';
        if (!customerId) {
          res.status(400).json({ error: 'Customer ID is required.' });
          return;
        }

        const store = db
          .prepare('SELECT * FROM stores WHERE id = ? AND user_id = ?')
          .get(storeId, userId) as StoreRow | undefined;
        const customer = db
          .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
          .get(customerId, storeId) as CustomerRow | undefined;

        if (!store || !customer) {
          res.status(404).json({ error: 'Customer not found.' });
          return;
        }

        const statement = computeCustomerStatement(db, storeId, customerId);
        const amountDue = Math.max(0, statement?.summary.outstanding ?? 0);
        if (amountDue <= 0) {
          res.status(400).json({
            error: `${customer.name} currently has no pending balance to remind.`,
          });
          return;
        }

        const allowedReminderLangs = new Set([
          'hi',
          'hinglish',
          'kn',
          'en',
          'ta',
          'te',
          'mr',
          'bn',
        ]);
        const language: ReminderLanguage = allowedReminderLangs.has(body.language)
          ? (body.language as ReminderLanguage)
          : allowedReminderLangs.has(store.language)
          ? (store.language as ReminderLanguage)
          : 'en';

        const generated = await generateSmartReminderMessage({
          customerName: customer.name,
          shopName: store.store_name,
          amount: amountDue,
          language,
          daysOverdue: statement?.summary.daysSinceLastPayment,
          useAiPolish: body.useAiPolish === true,
        });

        res.json({
          customerId: customer.id,
          customerName: customer.name,
          phone: customer.phone,
          amountDue,
          language,
          message: generated.message,
          generatedBy: generated.generatedBy,
          remindersOptIn: Boolean(customer.reminders_opt_in),
        });
      } catch (err) {
        console.error('Reminder generate error:', err);
        res.status(500).json({ error: 'Could not generate reminder message.' });
      }
    }
  );

  app.post('/api/reminders', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const body = req.body ?? {};
    const customerId =
      typeof body.customerId === 'string' ? body.customerId.trim() : '';
    const message =
      typeof body.message === 'string' ? body.message.trim().slice(0, 800) : '';
    const language =
      typeof body.language === 'string' ? body.language.trim().slice(0, 16) : 'en';
    const channel =
      body.channel === 'sms' || body.channel === 'copy' ? body.channel : 'whatsapp';
    const status: PaymentReminderRow['status'] =
      body.status === 'opened_whatsapp' ||
      body.status === 'marked_sent' ||
      body.status === 'customer_responded'
        ? body.status
        : 'marked_sent';

    if (!customerId || !message) {
      res.status(400).json({ error: 'Customer and reminder message are required.' });
      return;
    }

    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?')
      .get(customerId, storeId) as CustomerRow | undefined;
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const statement = computeCustomerStatement(db, storeId, customerId);
    const amountDue = Math.max(0, statement?.summary.outstanding ?? 0);
    const nowIso = new Date().toISOString();
    const id = `rem-${storeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const sentAt = status === 'marked_sent' || status === 'opened_whatsapp' ? nowIso : null;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO payment_reminders (id, store_id, customer_id, customer_name, amount_due, language, message, channel, status, customer_response, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        id,
        storeId,
        customer.id,
        customer.name,
        amountDue,
        language,
        message,
        channel,
        status,
        nowIso,
        sentAt
      );

      writeAuditLog(db, {
        storeId,
        userId,
        action: 'reminder_logged',
        entityType: 'payment_reminder',
        entityId: id,
        after: { customerId: customer.id, amountDue, channel, status },
      });
    });
    tx();

    const row = db
      .prepare('SELECT * FROM payment_reminders WHERE id = ?')
      .get(id) as PaymentReminderRow;

    res.status(201).json({
      reminder: {
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        amountDue: row.amount_due,
        language: row.language,
        message: row.message,
        channel: row.channel,
        status: row.status,
        customerResponse: row.customer_response ?? undefined,
        createdAt: row.created_at,
        sentAt: row.sent_at ?? undefined,
      },
    });
  });

  app.patch('/api/reminders/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { userId, storeId } = req.auth!;
    const reminderId = req.params.id;
    const current = db
      .prepare('SELECT * FROM payment_reminders WHERE id = ? AND store_id = ?')
      .get(reminderId, storeId) as PaymentReminderRow | undefined;

    if (!current) {
      res.status(404).json({ error: 'Reminder record not found.' });
      return;
    }

    const body = req.body ?? {};
    const customerResponse =
      body.customerResponse !== undefined
        ? typeof body.customerResponse === 'string' && body.customerResponse.trim()
          ? body.customerResponse.trim().slice(0, 300)
          : null
        : current.customer_response;
    const status: PaymentReminderRow['status'] =
      body.status === 'draft' ||
      body.status === 'opened_whatsapp' ||
      body.status === 'marked_sent' ||
      body.status === 'customer_responded'
        ? body.status
        : customerResponse
        ? 'customer_responded'
        : current.status;
    const sentAt =
      current.sent_at ??
      (status === 'marked_sent' || status === 'customer_responded'
        ? new Date().toISOString()
        : null);

    db.prepare(
      'UPDATE payment_reminders SET status = ?, customer_response = ?, sent_at = ? WHERE id = ? AND store_id = ?'
    ).run(status, customerResponse, sentAt, reminderId, storeId);

    writeAuditLog(db, {
      storeId,
      userId,
      action: 'reminder_updated',
      entityType: 'payment_reminder',
      entityId: reminderId,
      before: { status: current.status, customerResponse: current.customer_response },
      after: { status, customerResponse },
    });

    const updated = db
      .prepare('SELECT * FROM payment_reminders WHERE id = ?')
      .get(reminderId) as PaymentReminderRow;

    res.json({
      reminder: {
        id: updated.id,
        customerId: updated.customer_id,
        customerName: updated.customer_name,
        amountDue: updated.amount_due,
        language: updated.language,
        message: updated.message,
        channel: updated.channel,
        status: updated.status,
        customerResponse: updated.customer_response ?? undefined,
        createdAt: updated.created_at,
        sentAt: updated.sent_at ?? undefined,
      },
    });
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
          clientDate:
            typeof body.clientDate === 'string' ? body.clientDate : undefined,
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
