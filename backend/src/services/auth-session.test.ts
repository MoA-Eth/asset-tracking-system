import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ employee: { findUnique: vi.fn(), findFirst: vi.fn() } }));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { AuthService } from './auth.service';
import { createHmac } from 'node:crypto';
import { createSessionToken } from '../security/credentials';

const tokenFor = (id: string) => createSessionToken(id);
const outage = () =>
  Object.assign(new Error("Can't reach database server at `localhost:5432`"), { name: 'PrismaClientInitializationError' });

describe('session check when the database is down', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the outage (503) instead of calling the session invalid', async () => {
    db.employee.findUnique.mockRejectedValue(outage());
    await expect(AuthService.getInstance().verifyToken(tokenFor('EMP-1'))).rejects.toMatchObject({ statusCode: 503 });
  });

  it('rejects a session whose user no longer exists (401)', async () => {
    db.employee.findUnique.mockResolvedValue(null);
    await expect(AuthService.getInstance().verifyToken(tokenFor('EMP-GONE'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses an unsigned token made by hand, without looking anyone up', async () => {
    const forged = Buffer.from('EMP-ADMIN-01:SYSTEM_ADMIN:1').toString('base64');
    await expect(AuthService.getInstance().verifyToken(forged)).rejects.toMatchObject({ statusCode: 401 });
    expect(db.employee.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a session from before passwords were stamped, so everyone signs in again once', async () => {
    const secret = 'a-test-signing-secret-of-at-least-32-chars';
    vi.stubEnv('JWT_SECRET', secret);
    try {
      db.employee.findUnique.mockResolvedValue({ id: 'EMP-1', role: 'DATA_ENCODER', isActive: true, password: null });
      // Signed as sessions were before: who and until when, no password stamp
      const payload = Buffer.from(JSON.stringify({ sub: 'EMP-1', exp: Date.now() + 60_000 })).toString('base64url');
      const sig = createHmac('sha256', Buffer.from(secret)).update(`moa-session-v1.${payload}`).digest('base64url');
      await expect(AuthService.getInstance().verifyToken(`${payload}.${sig}`)).rejects.toMatchObject({ statusCode: 401 });
      // The same person signed in now is fine
      expect((await AuthService.getInstance().verifyToken(createSessionToken('EMP-1', null))).id).toBe('EMP-1');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still rejects a missing token (401)', async () => {
    await expect(AuthService.getInstance().verifyToken('')).rejects.toMatchObject({ statusCode: 401 });
  });
});
