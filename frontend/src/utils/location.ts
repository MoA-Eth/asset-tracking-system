import { Location } from '../types/asset-management';

/**
 * Where an item is kept, as "Store · Location", from the stores set up in Settings.
 * Shows a dash when the item has no location, never a made-up name.
 */
export const storeLocationLabel = (location?: Pick<Location, 'siteName' | 'roomNumber'> | null): string =>
  location ? [location.siteName, location.roomNumber].filter(Boolean).join(' · ') || '—' : '—';
