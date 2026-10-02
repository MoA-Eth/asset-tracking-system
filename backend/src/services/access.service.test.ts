import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeOwnPassword, checkNewPassword, grantAccess, removeAccess, resetPassword } from './access.service';
import { AuthService } from './auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createSessionToken, hashPassword, verifyPassword } from '../security/credentials';
import { resetSignInThrottle } from '../security/login-throttle';
import { resetAllRolePermissions } from '../security/role-policy';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  transactionApproval: { count: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const people: Record<string, any> = {};

beforeEach(async () => {
  vi.resetAllMocks();
  resetAllRolePermissions();
  resetSignInThrottle();
  Object.assign(people, {
    admin: { id: 'admin', payrollId: 'A-1', fullNameEn: 'Admin', role: 'SYSTEM_ADMIN', isActive: true, password: await hashPassword('admin-pass-1') },
    encoder: { id: 'encoder', payrollId: 'E-1', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true, password: await hashPassword('old-pass-1') },
    staff: { id: 'staff', payrollId: '00275823', fullNameEn: 'Getahun Bahiru', role: null, isActive: true, password: null },
    gone: { id: 'gone', payrollId: 'G-1', fullNameEn: 'Gone', role: null, isActive: false, password: null },
  });
  db.$transaction.mockImplementation((fn) => fn(db));
  db.employee.findUnique.mockImplementation(({ where }) => Promise.resolve(people[where.id] ? { ...people[where.id] } : null));
  db.employee.update.mockImplementation(({ where, data }) => Promise.resolve({ ...people[where.id], ...data }));
  db.employee.count.mockResolvedValue(2);
  db.transactionApproval.count.mockResolvedValue(0);
});

describe('Password rules', () => {
  it('needs 8 characters with a letter and a number', () => {
    expect(() => checkNewPassword('short1')).toThrow('at least 8 characters');
    expect(() => checkNewPassword('onlyletters')).toThrow('one letter and one number');
    expect(() => checkNewPassword('12345678')).toThrow('one letter and one number');
    expect(checkNewPassword('good-pass-1')).toBe('good-pass-1');
  });
});

describe('Giving and removing sign-in', () => {
  it('gives an employee a role and a temporary password they must change', async () => {
    const result = await grantAccess('staff', { role: 'DATA_ENCODER', password: 'temp-pass-1' }, 'admin');
    expect(result).toMatchObject({ role: 'DATA_ENCODER', mustChangePassword: true });
    const data = db.employee.update.mock.calls[0][0].data;
    expect(data.password).toMatch(/^scrypt\$/);
    expect(await verifyPassword('temp-pass-1', data.password)).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'GRANT_ACCESS' }) });
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('temp-pass-1');
  });

  it('needs a role, a password for a first sign-in, an active employee and an administrator', async () => {
    await expect(grantAccess('staff', { role: 'NOPE', password: 'temp-pass-1' }, 'admin')).rejects.toThrow('Choose a role.');
    await expect(grantAccess('staff', { role: 'MANAGER' }, 'admin')).rejects.toThrow('temporary password');
    await expect(grantAccess('staff', { role: 'MANAGER', password: 'weak' }, 'admin')).rejects.toThrow('at least 8');
    await expect(grantAccess('gone', { role: 'MANAGER', password: 'temp-pass-1' }, 'admin')).rejects.toThrow('deactivated');
    await expect(grantAccess('staff', { role: 'MANAGER', password: 'temp-pass-1' }, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it('changes a role without touching the password, but never your own or the last administrator', async () => {
    await grantAccess('encoder', { role: 'TEAM_LEADER' }, 'admin');
    expect(db.employee.update.mock.calls[0][0].data).toEqual({ role: 'TEAM_LEADER' });
    await expect(grantAccess('admin', { role: 'MANAGER' }, 'admin')).rejects.toThrow("can't change your own role");
  });

  it('removes sign-in and clears the password; not your own, not with pending requests', async () => {
    const result = await removeAccess('encoder', 'admin');
    expect(result.role).toBeNull();
    expect(db.employee.update).toHaveBeenCalledWith({ where: { id: 'encoder' }, data: { role: null, password: null, mustChangePassword: false } });
    await expect(removeAccess('admin', 'admin')).rejects.toThrow("can't remove your own sign-in");
    db.transactionApproval.count.mockResolvedValue(2);
    await expect(removeAccess('encoder', 'admin')).rejects.toThrow('2 pending requests');
  });

  it('resets a password to a temporary one', async () => {
    const result = await resetPassword('encoder', 'new-temp-9', 'admin');
    expect(result.mustChangePassword).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'RESET_PASSWORD' }) });
    await expect(resetPassword('staff', 'new-temp-9', 'admin')).rejects.toThrow('has no sign-in');
    await expect(resetPassword('admin', 'new-temp-9', 'admin')).rejects.toThrow('Use "Change password"');
  });
});

describe('Changing your own password', () => {
  it('needs the current password and a different, valid new one', async () => {
    await expect(changeOwnPassword('encoder', 'wrong', 'brand-new-1')).rejects.toThrow('current password is not correct');
    await expect(changeOwnPassword('encoder', 'old-pass-1', 'old-pass-1')).rejects.toThrow('different from your current one');
    await expect(changeOwnPassword('encoder', 'old-pass-1', 'short')).rejects.toThrow('at least 8');
    expect(db.employee.update).not.toHaveBeenCalled();

    await changeOwnPassword('encoder', 'old-pass-1', 'brand-new-1');
    const data = db.employee.update.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(false);
    expect(await verifyPassword('brand-new-1', data.password)).toBe(true);
  });
});

describe('Temporary passwords', () => {
  const auth = AuthService.getInstance();
  const run = async (url: string) => {
    const req: any = { headers: { authorization: `Bearer ${createSessionToken('encoder')}` }, originalUrl: url };
    let error: any;
    await new Promise<void>((resolve) => {
      requireAuth(req, {} as any, (err?: any) => {
        error = err;
        resolve();
      });
    });
    return { req, error };
  };

  it('sign-in tells the app the password must be changed', async () => {
    db.employee.findFirst.mockResolvedValue({ ...people.encoder, mustChangePassword: true });
    const { user } = await auth.login({ usernameOrEmail: 'E-1', password: 'old-pass-1' });
    expect(user.mustChangePassword).toBe(true);
  });

  it('until then, only the session check and the password change are allowed', async () => {
    people.encoder.mustChangePassword = true;
    expect((await run('/api/items')).error).toMatchObject({ statusCode: 403, message: 'Choose a new password before continuing.' });
    expect((await run('/api/auth/change-password')).error).toBeUndefined();
    people.encoder.mustChangePassword = false;
    expect((await run('/api/items')).error).toBeUndefined();
  });
});

describe('Repeated failed sign-ins', () => {
  const auth = AuthService.getInstance();

  it('locks the account for a while after 5 wrong passwords, even for the right one', async () => {
    db.employee.findFirst.mockResolvedValue({ ...people.encoder });
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ usernameOrEmail: 'E-1', password: 'wrong-pass' }, '10.0.0.1')).rejects.toMatchObject({ statusCode: 401 });
    }
    await expect(auth.login({ usernameOrEmail: 'e-1 ', password: 'old-pass-1' }, '10.0.0.1')).rejects.toMatchObject({ statusCode: 429 });
    // Another account from the same address is still fine
    db.employee.findFirst.mockResolvedValue({ ...people.admin });
    expect((await auth.login({ usernameOrEmail: 'A-1', password: 'admin-pass-1' }, '10.0.0.1')).user.id).toBe('admin');
  });

  it("gives the same message for an unknown account and a wrong password, so accounts can't be discovered", async () => {
    db.employee.findFirst.mockResolvedValue(null);
    const unknown = await auth.login({ usernameOrEmail: 'nobody', password: 'x-pass-1' }).catch((e) => e.message);
    db.employee.findFirst.mockResolvedValue({ ...people.encoder });
    const wrong = await auth.login({ usernameOrEmail: 'E-1', password: 'x-pass-1' }).catch((e) => e.message);
    expect(unknown).toBe(wrong);
  });
});
