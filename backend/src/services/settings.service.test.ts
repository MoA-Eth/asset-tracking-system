import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  systemSetting: { findMany: vi.fn(), upsert: vi.fn() },
  employee: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import {
  applySystemSettings,
  getSystemSettings,
  initSystemSettings,
  isSlipRequired,
  isScannedSlipFieldVisible,
  updateSystemSettings,
} from './settings.service';

const admin = { id: 'admin', fullNameEn: 'Admin Person', role: 'SYSTEM_ADMIN' };

beforeEach(() => {
  vi.resetAllMocks();
  applySystemSettings({});
  db.employee.findUnique.mockResolvedValue(admin);
  db.systemSetting.upsert.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

describe('system settings', () => {
  it('treats the scanned slip as optional and single uploader as default until an administrator says otherwise', () => {
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
    expect(isSlipRequired()).toBe(false);
    expect(isScannedSlipFieldVisible()).toBe(false);
  });

  it('loads the saved setting at startup, and ignores a value it does not know', async () => {
    db.systemSetting.findMany.mockResolvedValue([
      { key: 'slipAttachmentPolicy', value: 'REQUIRED' },
      { key: 'showScannedSlipField', value: 'true' },
    ]);
    await initSystemSettings();
    expect(isSlipRequired()).toBe(true);
    expect(isScannedSlipFieldVisible()).toBe(true);

    db.systemSetting.findMany.mockResolvedValue([{ key: 'slipAttachmentPolicy', value: 'SOMETIMES' }]);
    await initSystemSettings();
    expect(isSlipRequired()).toBe(false);
  });

  it('keeps the defaults when the database is not ready', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.systemSetting.findMany.mockRejectedValue(new Error('relation "system_settings" does not exist'));
    await initSystemSettings();
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
  });

  it('saves a change, applies it at once and records it in the audit log', async () => {
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'admin')).resolves.toEqual({
      slipAttachmentPolicy: 'REQUIRED',
      showScannedSlipField: false,
    });
    expect(db.systemSetting.upsert.mock.calls[0][0]).toMatchObject({
      where: { key: 'slipAttachmentPolicy' },
      update: { value: 'REQUIRED', updatedById: 'admin' },
    });
    expect(isSlipRequired()).toBe(true);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'UPDATE_SYSTEM_SETTINGS',
      userId: 'admin',
      previousState: { slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false },
      newState: { slipAttachmentPolicy: 'REQUIRED', showScannedSlipField: false },
    });
  });

  it('toggles the scanned slip field on and off and records it in the audit log', async () => {
    await expect(updateSystemSettings({ showScannedSlipField: true }, 'admin')).resolves.toEqual({
      slipAttachmentPolicy: 'OPTIONAL',
      showScannedSlipField: true,
    });
    expect(db.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'showScannedSlipField' },
        create: { key: 'showScannedSlipField', value: 'true', updatedById: 'admin' },
        update: { value: 'true', updatedById: 'admin' },
      })
    );
    expect(isScannedSlipFieldVisible()).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('shown (two uploaders)'),
        }),
      })
    );

    // Toggle back off
    await expect(updateSystemSettings({ showScannedSlipField: false }, 'admin')).resolves.toEqual({
      slipAttachmentPolicy: 'OPTIONAL',
      showScannedSlipField: false,
    });
    expect(isScannedSlipFieldVisible()).toBe(false);
  });

  it('ignores a store man rule saved by an earlier version', async () => {
    db.systemSetting.findMany.mockResolvedValue([{ key: 'storeManPolicy', value: 'REQUIRED' }]);
    await initSystemSettings();
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
  });

  it.each(['DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD', 'MANAGER'])('refuses a change by %s', async (role) => {
    db.employee.findUnique.mockResolvedValue({ id: 'someone', fullNameEn: 'Someone', role });
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'someone')).rejects.toMatchObject({ statusCode: 403 });
    await expect(updateSystemSettings({ showScannedSlipField: true }, 'someone')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
    expect(isSlipRequired()).toBe(false);
  });

  it.each([undefined, '', 'required', 'YES', 1, null])('refuses a value that is not REQUIRED or OPTIONAL (%j)', async (value) => {
    await expect(updateSystemSettings({ slipAttachmentPolicy: value }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it.each(['yes', 1, 'true', null])('refuses non-boolean showScannedSlipField (%j)', async (value) => {
    await expect(updateSystemSettings({ showScannedSlipField: value }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('refuses an update with no recognized settings', async () => {
    await expect(updateSystemSettings({}, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('does not apply a change that could not be saved', async () => {
    db.systemSetting.upsert.mockRejectedValue(new Error('database down'));
    await expect(updateSystemSettings({ slipAttachmentPolicy: 'REQUIRED' }, 'admin')).rejects.toThrow('database down');
    expect(isSlipRequired()).toBe(false);
  });
});
