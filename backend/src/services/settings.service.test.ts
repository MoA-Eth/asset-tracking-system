import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  systemSetting: { findMany: vi.fn(), upsert: vi.fn() },
  employee: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { applySystemSettings, getSystemSettings, initSystemSettings, isSlipRequired, updateSystemSettings } from './settings.service';

const admin = { id: 'admin', fullNameEn: 'Admin Person', role: 'SYSTEM_ADMIN' };

beforeEach(() => {
  vi.resetAllMocks();
  applySystemSettings({});
  db.employee.findUnique.mockResolvedValue(admin);
  db.systemSetting.upsert.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

describe('system settings', () => {
  it('treats the scanned slip as optional until an administrator says otherwise', () => {
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL' });
    expect(isSlipRequired()).toBe(false);
  });

  it('loads the saved setting at startup, and ignores a value it does not know', async () => {
    db.systemSetting.findMany.mockResolvedValue([{ key: 'slipAttachmentPolicy', value: 'REQUIRED' }]);
    await initSystemSettings();
    expect(isSlipRequired()).toBe(true);

    db.systemSetting.findMany.mockResolvedValue([{ key: 'slipAttachmentPolicy', value: 'SOMETIMES' }]);
    await initSystemSettings();
    expect(isSlipRequired()).toBe(false);
  });

  it('keeps the defaults when the database is not ready', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.systemSetting.findMany.mockRejectedValue(new Error('relation "system_settings" does not exist'));
    await initSystemSettings();
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL' });
  });

  it('saves a change, applies it at once and records it in the audit log', async () => {
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'admin')).resolves.toEqual({ slipAttachmentPolicy: 'REQUIRED' });
    expect(db.systemSetting.upsert.mock.calls[0][0]).toMatchObject({ where: { key: 'slipAttachmentPolicy' }, update: { value: 'REQUIRED', updatedById: 'admin' } });
    expect(isSlipRequired()).toBe(true);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'UPDATE_SYSTEM_SETTINGS',
      userId: 'admin',
      previousState: { slipAttachmentPolicy: 'OPTIONAL' },
      newState: { slipAttachmentPolicy: 'REQUIRED' },
    });
  });

  it.each(['DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD', 'MANAGER'])('refuses a change by %s', async (role) => {
    db.employee.findUnique.mockResolvedValue({ id: 'someone', fullNameEn: 'Someone', role });
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'someone')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
    expect(isSlipRequired()).toBe(false);
  });

  it.each([undefined, '', 'required', 'YES', 1, null])('refuses a value that is not REQUIRED or OPTIONAL (%j)', async (value) => {
    await expect(updateSystemSettings({ slipAttachmentPolicy: value }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('does not apply a change that could not be saved', async () => {
    db.systemSetting.upsert.mockRejectedValue(new Error('database down'));
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'admin')).rejects.toThrow('database down');
    expect(isSlipRequired()).toBe(false);
  });
});
