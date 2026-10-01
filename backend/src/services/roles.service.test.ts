import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignEmployeeRole, getRoleDirectory, updateRolePermissions, resetRolePermissionsToDefault } from './roles.service';
import { UserRole } from '../types/asset-management';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  auditLog: { create: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(fn => fn(db));
  db.employee.findUnique.mockImplementation(({ where }) => Promise.resolve({
    id: where.id, fullNameEn: where.id, role: where.id === 'admin' ? 'SYSTEM_ADMIN' : 'DATA_ENCODER',
  }));
  db.employee.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
  db.employee.count.mockResolvedValue(2);
});

describe('Role assignments', () => {
  it('validates role values and actor permissions before writing', async () => {
    await expect(assignEmployeeRole('target', 'UNKNOWN', 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(assignEmployeeRole('target', 'MANAGER', 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing employee and avoids audit for unchanged roles', async () => {
    await assignEmployeeRole('target', 'DATA_ENCODER', 'admin');
    expect(db.auditLog.create).not.toHaveBeenCalled();
    db.employee.findUnique.mockResolvedValueOnce({ id: 'admin', role: 'SYSTEM_ADMIN' }).mockResolvedValueOnce(null);
    await expect(assignEmployeeRole('missing', 'MANAGER', 'admin')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('protects the last administrator', async () => {
    db.employee.count.mockResolvedValue(1);
    await expect(assignEmployeeRole('admin', UserRole.MANAGER, 'admin')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('writes role and structured audit in one serializable transaction with the actor role before demotion', async () => {
    await assignEmployeeRole('admin', 'MANAGER', 'admin');
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'admin', userRole: 'SYSTEM_ADMIN', entityType: 'USER', entityId: 'admin',
      previousState: { role: 'SYSTEM_ADMIN' }, newState: { role: 'MANAGER' },
    }) });
  });
  it('propagates audit failure so the transaction rolls back', async () => {
    db.auditLog.create.mockRejectedValue(new Error('audit failed'));
    await expect(assignEmployeeRole('target', 'MANAGER', 'admin')).rejects.toThrow('audit failed');
  });
  it('rechecks policy after concurrent write conflicts and bounds retries', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await assignEmployeeRole('target', 'MANAGER', 'admin');
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(assignEmployeeRole('target', 'MANAGER', 'admin')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('includes unassigned system roles and database member counts', async () => {
    db.employee.groupBy.mockResolvedValue([{ role: 'SYSTEM_ADMIN', _count: { _all: 2 } }]);
    const directory = await getRoleDirectory();
    expect(directory.roles).toHaveLength(5);
    expect(directory.roles.find(role => role.code === 'SYSTEM_ADMIN')?.memberCount).toBe(2);
    expect(directory.roles.find(role => role.code === 'MANAGER')?.memberCount).toBe(0);
  });

  describe('Role permissions dynamic updates', () => {
    it('prevents non-admins from modifying permissions', async () => {
      await expect(
        updateRolePermissions(UserRole.DATA_ENCODER, ['inventory.read'], 'encoder')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects invalid permissions or unknown roles', async () => {
      await expect(
        updateRolePermissions('INVALID_ROLE' as any, ['inventory.read'], 'admin')
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        updateRolePermissions(UserRole.DATA_ENCODER, ['fake.permission' as any], 'admin')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('enforces lockout protection on SYSTEM_ADMIN core permissions', async () => {
      await expect(
        updateRolePermissions(UserRole.SYSTEM_ADMIN, ['dashboard.read'], 'admin')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('updates role permissions and records structured audit log', async () => {
      db.employee.groupBy.mockResolvedValue([]);
      const updated = await updateRolePermissions(
        UserRole.MANAGER,
        ['dashboard.read', 'reports.read', 'inventory.read', 'stock-in.write'],
        'admin'
      );
      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin',
          action: 'UPDATE_ROLE_PERMISSIONS',
        }),
      });
      const manager = updated.roles.find((r) => r.code === UserRole.MANAGER);
      expect(manager?.permissions).toContain('stock-in.write');
    });

    it('resets role permissions to defaults with audit log', async () => {
      db.employee.groupBy.mockResolvedValue([]);
      const reset = await resetRolePermissionsToDefault(UserRole.MANAGER, 'admin');
      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin',
          action: 'RESET_ROLE_PERMISSIONS',
        }),
      });
      const manager = reset.roles.find((r) => r.code === UserRole.MANAGER);
      expect(manager?.permissions).not.toContain('stock-in.write');
    });
  });
});

