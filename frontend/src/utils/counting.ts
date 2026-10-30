/**
 * How the dashboard counts what is held, for every page that shows the same figures: fixed assets in units,
 * consumables by the different supplies (litres, reams and pieces don't add up).
 */
type Countable = { itemType?: string | null; ifmisItemCode?: string | null; name?: string | null; uom?: string | null };

/** One supply: the same IFMIS item code (a stray space ignored) is one; without a code, its name and unit */
export const supplyKey = (i: Countable): string => {
  const code = String(i.ifmisItemCode ?? '').replace(/\s+/g, '').toLowerCase();
  return code ? `code:${code}` : `name:${String(i.name ?? '').trim().toLowerCase()}|${String(i.uom || 'EA').toUpperCase()}`;
};

export const isConsumable = (i: Countable) => i.itemType === 'CONSUMABLE';

export interface HeldCounts {
  /** Fixed assets, in units */
  fixed: { held: number; inStore: number; issued: number };
  /** Consumables, in different supplies: in store if any is left, issued once all of it is out */
  supplies: { held: number; inStore: number; issued: number };
}

/** What a list of records holds, given each record's units in store and issued */
export function heldCounts<T extends Countable>(records: T[], balance: (r: T) => { available: number; issued: number }): HeldCounts {
  const fixed = { held: 0, inStore: 0, issued: 0 };
  const bySupply = new Map<string, { inStore: number; issued: number }>();
  for (const r of records) {
    const b = balance(r);
    if (isConsumable(r)) {
      const s = bySupply.get(supplyKey(r)) ?? { inStore: 0, issued: 0 };
      s.inStore += b.available;
      s.issued += b.issued;
      bySupply.set(supplyKey(r), s);
    } else {
      fixed.inStore += b.available;
      fixed.issued += b.issued;
      fixed.held += b.available + b.issued;
    }
  }
  const held = [...bySupply.values()].filter((s) => s.inStore + s.issued > 0);
  return {
    fixed,
    supplies: { held: held.length, inStore: held.filter((s) => s.inStore > 0).length, issued: held.filter((s) => s.inStore <= 0).length },
  };
}

/** "33 fixed assets (units), 4 consumables (items)" style wording */
export const unitsLabel = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'unit' : 'units'}`;
export const itemsLabel = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'item' : 'items'}`;
