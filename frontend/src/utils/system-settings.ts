import { useEffect, useState } from 'react';
import { api } from '../api/client';

export type AttachmentPolicy = 'REQUIRED' | 'OPTIONAL';

export interface SystemSettings {
  /** Whether a scanned slip must be attached to Stock-In, Stock-Out and Return requests */
  slipAttachmentPolicy: AttachmentPolicy;
}

const DEFAULT_SETTINGS: SystemSettings = {
  slipAttachmentPolicy: 'OPTIONAL',
};

const CHANGED_EVENT = 'system-settings-changed';

// The settings live on the server and are the same for everyone; this is the copy last fetched
let current: SystemSettings = DEFAULT_SETTINGS;

const apply = (settings: Partial<SystemSettings>): SystemSettings => {
  current = { ...DEFAULT_SETTINGS, ...settings };
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return current;
};

export const getSystemSettings = (): SystemSettings => current;

/** Fetch the settings from the server; called after sign-in and when the settings page opens */
export const loadSystemSettings = async (): Promise<SystemSettings> => apply(await api.getSystemSettings());

/** Change a setting on the server (System Administrator only) */
export const saveSystemSettings = async (settings: Partial<SystemSettings>): Promise<SystemSettings> =>
  apply(await api.updateSystemSettings(settings));

/** The current settings, re-rendering when they are loaded or changed */
export const useSystemSettings = (): SystemSettings => {
  const [settings, setSettings] = useState(current);
  useEffect(() => {
    const onChange = () => setSettings(current);
    onChange();
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);
  return settings;
};
