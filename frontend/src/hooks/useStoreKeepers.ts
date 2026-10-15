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
  /** Every usable location, labelled "Store · Location", to pick where something goes */
  locations: { id: string; storeId: string; label: string }[];
  /** The store's name, for messages */
  storeName: (storeId?: string | null) => string;
  /**
   * The store man with this name and his store, when exactly one matches. Word order and commas don't matter,
   * since IFMIS prints "Last, First Middle".
   */
  findByName: (name?: string | null) => { storeId: string; keeper: StoreKeeper } | undefined;
  /** The one store this employee is a store man of, if exactly one */
  storeOfKeeper: (employeeId?: string | null) => string | undefined;
}

/**
 * A name as a sorted set of lower-case words, so "Tesfaye, Abel Girma" equals "Abel Girma Tesfaye". A note in
 * brackets is not part of the name: "Kassahun Tolosa (Property Director)" equals "Tolosa, Kassahun".
 */
export const nameKey = (name: string): string =>
  name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

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

  const locations = (stores ?? [])
    .filter((s) => s.isActive !== false)
    .flatMap((s) => s.locations.filter((l) => l.isActive !== false).map((l) => ({ id: l.id, storeId: s.id, label: `${s.name} · ${l.name}` })));

  return {
    ready: stores !== null,
    locations,
    ofStore,
    ofLocation: (locationId) => {
      if (!locationId) return [];
      const store = stores?.find((s) => s.locations.some((l) => l.id === locationId));
      return ofStore(store?.id);
    },
    storeName: (storeId) => stores?.find((s) => s.id === storeId)?.name ?? 'This store',
    findByName: (name) => {
      const key = name ? nameKey(name) : '';
      if (!key) return undefined;
      const matches = (stores ?? [])
        .filter((s) => s.isActive !== false)
        .flatMap((s) => ofStore(s.id).filter((k) => nameKey(k.fullNameEn) === key).map((keeper) => ({ storeId: s.id, keeper })));
      return matches.length === 1 ? matches[0] : undefined;
    },
    storeOfKeeper: (employeeId) => {
      if (!employeeId) return undefined;
      const own = (stores ?? []).filter((s) => s.isActive !== false && ofStore(s.id).some((k) => k.employeeId === employeeId));
      return own.length === 1 ? own[0].id : undefined;
    },
  };
}
