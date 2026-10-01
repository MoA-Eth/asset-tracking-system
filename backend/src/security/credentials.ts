import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../errors/app-error';

const developmentKey = randomBytes(32);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 32 && configured !== 'moa_ams_secure_jwt_secret_2026') return Buffer.from(configured);
  if (process.env.NODE_ENV === 'production') throw new Error('Set JWT_SECRET to a unique secret of at least 32 characters.');
  return developmentKey;
}

function signature(payload: string) {
  return createHmac('sha256', signingKey()).update(`moa-session-v1.${payload}`).digest();
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function readSessionToken(token: string): string {
  const invalid = () => new UnauthorizedError('Invalid or expired session. Please sign in again.');
  if (typeof token !== 'string' || token.length > 2048) throw invalid();
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined || !/^[\w-]+$/.test(payload) || !/^[\w-]+$/.test(sig)) throw invalid();
  const actual = Buffer.from(sig, 'base64url');
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.sub !== 'string' || !data.sub || !Number.isFinite(data.exp) || data.exp <= Date.now()) throw invalid();
    return data.sub;
  } catch { throw invalid(); }
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || !password || password.length > 1024 || typeof stored !== 'string') return false;
  if (!stored.startsWith('scrypt$')) {
    // Existing credentials are upgraded only after a successful password check.
    const left = Buffer.from(password), right = Buffer.from(stored);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  const [, salt, hash, extra] = stored.split('$');
  if (extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'));
}
