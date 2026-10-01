import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSessionToken, readSessionToken, hashPassword, verifyPassword } from './credentials';

afterEach(() => vi.useRealTimers());
describe('Session and password credentials', () => {
  it('accepts a signed session and rejects tampering, old Base64 tokens, and expiry', () => {
    vi.useFakeTimers();
    const token = createSessionToken('employee-1');
    expect(readSessionToken(token)).toBe('employee-1');
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 100000 })).toString('base64url');
    expect(() => readSessionToken(`${forged}.${signature}`)).toThrow();
    expect(() => readSessionToken(Buffer.from('employee-1:SYSTEM_ADMIN:1').toString('base64'))).toThrow();
    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(() => readSessionToken(token)).toThrow();
  });
  it('salts password hashes and verifies both migrated and legacy credentials', async () => {
    const hash = await hashPassword('correct-password');
    expect(hash).not.toContain('correct-password');
    expect(await hashPassword('correct-password')).not.toBe(hash);
    expect(await verifyPassword('correct-password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await verifyPassword('old-password', 'old-password')).toBe(true);
    expect(await verifyPassword('anything', 'scrypt$bad$hash')).toBe(false);
  });
});
