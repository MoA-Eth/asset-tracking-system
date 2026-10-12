import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Store, StoreKeeper } from '../types/asset-management';

export interface StoreKeepersView {
  /** The stores have been loaded */
  ready: boolean;
  /** The active store men of a store (by its id) */
  ofStore: (storeId?: string | null) => StoreKeeper[];
  /** The active store men of the store a location is in */
  ofLocation: (locationId?: string | null) => StoreKeeper[];
  /** The store's name, for messages */
  storeName: (storeId?: string | null) => string;
}

/**
 * The store men of every store, so a form can offer the ones of the store it works in, and refuse a store with
 * none. Loaded once for the form; a store that has changed since is checked again by the server.
 */
export function useStoreKeepers(): StoreKeepersView {
  const [stores, setStores] = useState<Store[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getStores()
      .then((list) => {
        if (!cancelled) setStores(list);
      })
      .catch(() => {
        // The form still works: the server decides, and says so
        if (!cancelled) setStores([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ofStore = (storeId?: string | null): StoreKeeper[] =>
    (stores?.find((s) => s.id === storeId)?.storeKeepers ?? []).filter((k) => k.isActive !== false);

  return {
    ready: stores !== null,
    ofStore,
    ofLocation: (locationId) => {
      if (!locationId) return [];
      const store = stores?.find((s) => s.locations.some((l) => l.id === locationId));
      return ofStore(store?.id);
    },
    storeName: (storeId) => stores?.find((s) => s.id === storeId)?.name ?? 'This store',
  };
}
