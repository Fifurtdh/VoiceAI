import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'vk_session';
const BCRYPT_ROUNDS = 10;

// In-memory secret initialized from process.env.JWT_SECRET or persisted in SQLite system_config
let activeJwtSecret =
  process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

/**
 * Ensures the JWT signing secret stays consistent across server restarts
 * when process.env.JWT_SECRET is not explicitly provided.
 */
export function initJwtSecret(db: Database.Database): void {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    activeJwtSecret = process.env.JWT_SECRET.trim();
    return;
  }

  try {
    const existing = db
      .prepare("SELECT value FROM system_config WHERE key = 'jwt_secret'")
      .get() as { value: string } | undefined;
    if (existing?.value && existing.value.length >= 32) {
      activeJwtSecret = existing.value;
      return;
    }

    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare(
      "INSERT OR REPLACE INTO system_config (key, value) VALUES ('jwt_secret', ?)"
    ).run(generated);
    activeJwtSecret = generated;
  } catch {
    // Keep in-memory randomBytes secret if system_config is unavailable
  }
}

export interface AuthPayload {
  userId: number;
  storeId: number;
  phoneNumber: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload;
}

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifySecret(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateRecoveryCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function signSessionToken(payload: AuthPayload): string {
  return jwt.sign(payload, activeJwtSecret, { expiresIn: '7d' });
}

export function verifySessionToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, activeJwtSecret) as Partial<AuthPayload>;
    if (
      typeof decoded.userId === 'number' &&
      typeof decoded.storeId === 'number' &&
      typeof decoded.phoneNumber === 'string'
    ) {
      return {
        userId: decoded.userId,
        storeId: decoded.storeId,
        phoneNumber: decoded.phoneNumber,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function isRequestHttps(req: Request): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  return req.secure || fwdProto.includes('https') || origin.startsWith('https://');
}

/**
 * Sets an HTTP-only session cookie compatible with both iframe HTTPS previews
 * and local localhost HTTP testing.
 */
export function setSessionCookie(
  req: Request,
  res: Response,
  token: string
): void {
  const isHttps = isRequestHttps(req);
  const maxAgeSec = 7 * 24 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Checks whether an origin is allowed for CORS / credentialed requests.
 */
export function isAllowedOrigin(origin: string | undefined, hostHeader?: string): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (hostHeader && parsed.host === hostHeader) {
      return true;
    }
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0'
    ) {
      return true;
    }
    if (process.env.APP_URL) {
      try {
        const appUrl = new URL(process.env.APP_URL);
        if (parsed.origin === appUrl.origin) return true;
      } catch {
        // ignore invalid APP_URL
      }
    }
    if (process.env.CORS_ORIGIN) {
      const extra = process.env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (extra.includes(parsed.origin)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Verifies same-origin or custom X-Requested-With header on state-changing
 * cookie-authenticated routes to prevent cross-site request forgery.
 */
export function verifyMutationOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'VoiceKhata') {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as
    | string
    | undefined;
  if (origin && isAllowedOrigin(origin, host)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Forbidden request origin.' });
}

/**
 * Express middleware that requires a valid HTTP-only JWT session cookie.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'Please log in to access your khata.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
    return;
  }

  req.auth = payload;
  next();
}
