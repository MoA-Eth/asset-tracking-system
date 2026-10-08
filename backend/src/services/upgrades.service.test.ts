import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  employee: { findFirst: vi.fn() },
  item: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  systemSetting: { findUnique: vi.fn(), create: vi.fn() },
  rolePermissionSet: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { DISPOSALS_GRANT_MARKER, runStartupUpgrades } from './upgrades.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.employee.findFirst.mockResolvedValue({ id: 'EMP-ADMIN-01' });
  db.systemSetting.findUnique.mockResolvedValue(null);
  db.rolePermissionSet.findMany.mockResolvedValue([]);
});

describe('startup upgrade: rejected receipts', () => {
  it('moves DISPOSED records that were never disposed of to REJECTED, and logs it once', async () => {
    db.item.updateMany.mockResolvedValue({ count: 2 });
    await runStartupUpgrades();
    expect(db.item.updateMany).toHaveBeenCalledWith({
      where: { status: 'DISPOSED', history: { none: { action: 'DISPOSAL_APPROVED' } } },
      data: { status: 'REJECTED' },
    });
    // Audit entries must belong to an employee: the first System Administrator
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'SYSTEM_UPGRADE_RECEIPT_STATUS', userId: 'EMP-ADMIN-01', userName: 'System upgrade' });
  });

  it('still counts the step as done when the audit entry fails', async () => {
    db.item.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.create.mockRejectedValue(new Error('Foreign key constraint violated'));
    await runStartupUpgrades();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/audit entry/), expect.anything());
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringMatching(/did not run/), expect.anything());
  });

  it('writes no audit entry on a database without an administrator', async () => {
    db.item.updateMany.mockResolvedValue({ count: 1 });
    db.employee.findFirst.mockResolvedValue(null);
    await runStartupUpgrades();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('writes no audit entry when there is nothing to move', async () => {
    await runStartupUpgrades();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('startup upgrade: disposal permission', () => {
  it('adds "Request disposals" once to saved roles that can issue items', async () => {
    db.rolePermissionSet.findMany.mockResolvedValue([
      { role: 'DATA_ENCODER', permissions: ['inventory.read', 'stock-out.write'] },
      { role: 'MANAGER', permissions: ['dashboard.read'] },
      // An approver that can also issue would break segregation of duties: left alone
      { role: 'TEAM_LEADER', permissions: ['stock-out.write', 'approvals.endorse'] },
      { role: 'DEPARTMENT_HEAD', permissions: ['stock-out.write', 'disposals.write'] },
    ]);

    await runStartupUpgrades();

    expect(db.rolePermissionSet.update).toHaveBeenCalledTimes(1);
    expect(db.rolePermissionSet.update).toHaveBeenCalledWith({
      where: { role: 'DATA_ENCODER' },
      data: { permissions: ['inventory.read', 'stock-out.write', 'disposals.write'], updatedById: 'system' },
    });
    expect(db.systemSetting.create).toHaveBeenCalledWith({ data: { key: DISPOSALS_GRANT_MARKER, value: 'done', updatedById: 'system' } });
  });

  it("doesn't run again once done, so a permission an administrator removed stays removed", async () => {
    db.systemSetting.findUnique.mockResolvedValue({ key: DISPOSALS_GRANT_MARKER, value: 'done' });
    await runStartupUpgrades();
    expect(db.rolePermissionSet.findMany).not.toHaveBeenCalled();
    expect(db.systemSetting.create).not.toHaveBeenCalled();
  });

  it('only warns when the database fails, so the API still starts', async () => {
    db.item.updateMany.mockRejectedValue(new Error('connection lost'));
    db.systemSetting.findUnique.mockRejectedValue(new Error('connection lost'));
    await expect(runStartupUpgrades()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
