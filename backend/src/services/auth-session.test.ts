import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ employee: { findUnique: vi.fn(), findFirst: vi.fn() } }));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { AuthService } from './auth.service';
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

  it('still rejects a missing token (401)', async () => {
    await expect(AuthService.getInstance().verifyToken('')).rejects.toMatchObject({ statusCode: 401 });
  });
});
