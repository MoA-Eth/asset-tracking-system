import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getSystemSettings,
  saveSystemSettings,
  SystemSettings,
} from './system-settings';

describe('system-settings utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default settings when storage is empty', () => {
    const settings = getSystemSettings();
    expect(settings).toEqual({
      historicalDataAttachmentPolicy: 'OPTIONAL',
    });
  });

  it('saves settings to localStorage and dispatches system-settings-changed event', () => {
    const eventListener = vi.fn();
    window.addEventListener('system-settings-changed', eventListener);

    const updated = saveSystemSettings({
      historicalDataAttachmentPolicy: 'REQUIRED',
    });

    expect(updated.historicalDataAttachmentPolicy).toBe('REQUIRED');
    expect(eventListener).toHaveBeenCalledTimes(1);

    const reloaded = getSystemSettings();
    expect(reloaded.historicalDataAttachmentPolicy).toBe('REQUIRED');

    window.removeEventListener('system-settings-changed', eventListener);
  });

  it('merges partial settings while preserving existing properties', () => {
    saveSystemSettings({ historicalDataAttachmentPolicy: 'REQUIRED' });
    const result = saveSystemSettings({});
    expect(result.historicalDataAttachmentPolicy).toBe('REQUIRED');
  });

  it('gracefully falls back to default settings when localStorage contains corrupted JSON', () => {
    localStorage.setItem('moa_ams_system_settings', '{corrupted_json:::');
    const settings = getSystemSettings();
    expect(settings).toEqual({
      historicalDataAttachmentPolicy: 'OPTIONAL',
    });
  });
});
