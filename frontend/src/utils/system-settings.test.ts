import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getSystemSettings, loadSystemSettings, saveSystemSettings } from './system-settings';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: { getSystemSettings: vi.fn(), updateSystemSettings: vi.fn() } }));

describe('system settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('starts with the slip optional and single uploader default until the server answers', () => {
    expect(getSystemSettings()).toEqual({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
  });

  it('loads the settings from the server and tells the forms', async () => {
    vi.mocked(api.getSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'REQUIRED', showScannedSlipField: true });
    const listener = vi.fn();
    window.addEventListener('system-settings-changed', listener);

    await expect(loadSystemSettings()).resolves.toEqual({ slipAttachmentPolicy: 'REQUIRED', showScannedSlipField: true });
    expect(getSystemSettings().slipAttachmentPolicy).toBe('REQUIRED');
    expect(getSystemSettings().showScannedSlipField).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('system-settings-changed', listener);
  });

  it('saves a change on the server, never in the browser', async () => {
    vi.mocked(api.updateSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
    await saveSystemSettings({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });

    expect(api.updateSystemSettings).toHaveBeenCalledWith({ slipAttachmentPolicy: 'OPTIONAL', showScannedSlipField: false });
    expect(getSystemSettings().slipAttachmentPolicy).toBe('OPTIONAL');
    expect(getSystemSettings().showScannedSlipField).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('keeps the current setting when the server refuses the change', async () => {
    vi.mocked(api.getSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'REQUIRED', showScannedSlipField: true });
    await loadSystemSettings();
    vi.mocked(api.updateSystemSettings).mockRejectedValue(new Error('Only System Administrators can change system settings.'));

    await expect(saveSystemSettings({ slipAttachmentPolicy: 'OPTIONAL' })).rejects.toThrow('Only System Administrators');
    expect(getSystemSettings().slipAttachmentPolicy).toBe('REQUIRED');
    expect(getSystemSettings().showScannedSlipField).toBe(true);
  });
});
