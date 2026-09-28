export type AttachmentPolicy = 'REQUIRED' | 'OPTIONAL';

export interface SystemSettings {
  historicalDataAttachmentPolicy: AttachmentPolicy;
}

const STORAGE_KEY = 'moa_ams_system_settings';

const DEFAULT_SETTINGS: SystemSettings = {
  historicalDataAttachmentPolicy: 'OPTIONAL',
};

export const getSystemSettings = (): SystemSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read system settings:', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSystemSettings = (settings: Partial<SystemSettings>): SystemSettings => {
  const current = getSystemSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('system-settings-changed'));
  } catch (e) {
    console.error('Failed to save system settings:', e);
  }
  return updated;
};
