import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { UnauthorizedError } from '../errors/app-error';

import { createSessionToken } from '../security/credentials';
const db = vi.hoisted(() => ({ employee: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
beforeEach(() => vi.resetAllMocks());

describe('AuthService unit tests', () => {
  const authService = AuthService.getInstance();

  it('maintains a single shared instance (Singleton pattern)', () => {
    const instanceA = AuthService.getInstance();
    const instanceB = AuthService.getInstance();
    expect(instanceA).toBe(instanceB);
  });

  it('rejects missing passwords and persona shortcuts before querying employees', async () => {
    await expect(authService.login({ usernameOrEmail: 'admin@example.test' })).rejects.toThrow(UnauthorizedError);
    await expect(authService.login({ usernameOrEmail: '', personaRole: 'SYSTEM_ADMIN' } as any)).rejects.toThrow(UnauthorizedError);
    expect(db.employee.findFirst).not.toHaveBeenCalled();
  });

  it('checks and upgrades a legacy password and returns effective access', async () => {
    db.employee.findFirst.mockResolvedValue({ id: 'admin', role: 'SYSTEM_ADMIN', password: 'correct' });
    await expect(authService.login({ usernameOrEmail: 'admin@example.test', password: 'wrong' })).rejects.toThrow(UnauthorizedError);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
    const result = await authService.login({ usernameOrEmail: 'admin@example.test', password: 'correct' });
    expect(result.user.permissions).toContain('roles.assign');
    expect(result.user).not.toHaveProperty('password');
    expect(db.employee.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { password: expect.stringMatching(/^scrypt\$/) } }));
  });

  it('reads the latest database role on every authenticated request', async () => {
    const token = createSessionToken('admin');
    db.employee.findUnique.mockResolvedValueOnce({ id: 'admin', role: 'SYSTEM_ADMIN' })
      .mockResolvedValueOnce({ id: 'admin', role: 'MANAGER' });
    expect((await authService.verifyToken(token)).permissions).toContain('roles.assign');
    expect((await authService.verifyToken(token)).permissions).not.toContain('roles.assign');
  });

  describe('verifyToken', () => {
    it('invalidates the session when its account no longer exists', async () => {
      db.employee.findUnique.mockResolvedValue(null);
      await expect(authService.verifyToken(createSessionToken('deleted'))).rejects.toMatchObject({ statusCode: 401 });
    });
    it('throws UnauthorizedError when token is empty or undefined', async () => {
      await expect(authService.verifyToken('')).rejects.toThrow(UnauthorizedError);
      await expect(authService.verifyToken(undefined as any)).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('rejects when token is corrupted or references non-existent user', async () => {
      await expect(authService.verifyToken('not-valid-base64-payload!!!')).rejects.toThrow();
    });
  });
});
