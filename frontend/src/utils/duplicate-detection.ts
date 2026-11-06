import { ItemWithRelations, Location } from '../types/asset-management';

/**
 * Master feature toggle for duplicate detection UI helpers.
 * When set to false, all duplicate detection returns an empty map,
 * instantly hiding all badges, filters, and banners without touching any database records.
 */
export const ENABLE_DUPLICATE_DETECTION = true;

export interface DuplicateSuspect {
  suspectItemId: string;
  matchedItemId: string;
  matchedItemCode: string;
  matchedItemName: string;
  matchedSlipNumber: string;
  matchedUnitPrice: number;
  matchedQuantity: number;
  matchedStatus: string;
  matchedCreatedDate?: string;
  storeName?: string;
  similarity: number;
  isSamePrice: boolean;
  severity: 'HIGH' | 'MEDIUM';
  reason: string;
  /** True if this entry represents the pre-existing original asset pointing to its newer duplicate */
  isOriginal?: boolean;
}

const STOP_WORDS = new Set([
  'and', 'with', 'for', 'the', 'item', 'size', 'type', 'set', 'pcs', 'pcs.', 'unit', 'no', 'no.', 'of', 'in'
]);

export function tokenizeItemName(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function computeWordSimilarity(words1: string[], words2: string[]): number {
  if (!words1.length || !words2.length) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }
  const minSize = Math.min(set1.size, set2.size);
  return minSize > 0 ? intersection / minSize : 0;
}

const PLACEHOLDERS = new Set(['n/a', 'na', 'none', '-', '--', 'null', 'nil', '0', 'undefined']);

function cleanIdentifier(val?: string | null): string | null {
  if (!val) return null;
  const s = val.trim().toLowerCase();
  return PLACEHOLDERS.has(s) || s.length < 2 ? null : s;
}

/**
 * Detects duplicate items across the inventory:
 * 1. Matching physical Serial Number (HIGH confidence, 100%)
 * 2. Matching physical IFMIS Tag Number (HIGH confidence, 100%)
 * 3. Matching Item Name + Identical Unit Price across different vouchers in the same store (HIGH confidence)
 * 4. High word similarity (>= 80%) + Identical Unit Price in the same store (HIGH confidence)
 *
 * Returns a Map where:
 * - Each suspect duplicate item points to the pre-existing original item (`isOriginal: false`).
 * - Each pre-existing original item points to the newer suspect duplicate (`isOriginal: true`).
 */
export function findDuplicateSuspects(
  items: ItemWithRelations[],
  locations?: Location[]
): Map<string, DuplicateSuspect> {
  const suspectMap = new Map<string, DuplicateSuspect>();
  if (!ENABLE_DUPLICATE_DETECTION || !items || items.length === 0) {
    return suspectMap;
  }

  const storeMap = new Map<string, string>();
  if (locations) {
    for (const loc of locations) {
      storeMap.set(loc.id, loc.name);
    }
  }

  // Active items only (skip disposed / rejected)
  const activeItems = items.filter(
    (i) => i.status !== 'REJECTED' && i.status !== 'DISPOSED'
  );

  if (activeItems.length < 2) return suspectMap;

  // Sort chronologically so older items are treated as originals, and newer items are suspects
  const sorted = [...activeItems].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - db;
  });

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const curSerial = cleanIdentifier(cur.serialNumber);
    const curTag = cleanIdentifier(cur.ifmisTagNumber);
    const curTokens = tokenizeItemName(cur.name);
    const curPrice = Number(cur.unitCostETB ?? (cur as any).unitPrice ?? 0) || 0;

    for (let j = 0; j < i; j++) {
      const prev = sorted[j];

      // A split child unit is NEVER a duplicate of its parent batch or sibling units
      if (
        (cur.parentItemId && cur.parentItemId === prev.id) ||
        (prev.parentItemId && prev.parentItemId === cur.id) ||
        (cur.parentItemId && prev.parentItemId && cur.parentItemId === prev.parentItemId) ||
        (cur.itemCode && prev.itemCode && (
          cur.itemCode.startsWith(prev.itemCode + '-') ||
          prev.itemCode.startsWith(cur.itemCode + '-')
        ))
      ) {
        continue;
      }

      const prevSerial = cleanIdentifier(prev.serialNumber);
      const prevTag = cleanIdentifier(prev.ifmisTagNumber);
      const prevPrice = Number(prev.unitCostETB ?? (prev as any).unitPrice ?? 0) || 0;

      let severity: 'HIGH' | 'MEDIUM' | null = null;
      let reason = '';
      let isSamePrice = false;
      let sim = 0;

      // 1. Serial Number Match (100% physically identical)
      if (curSerial && prevSerial && curSerial === prevSerial) {
        severity = 'HIGH';
        reason = `Identical Serial Number "${cur.serialNumber?.trim()}" already registered on ${prev.itemCode}`;
      }
      // 2. IFMIS Tag Match (100% physically identical)
      else if (curTag && prevTag && curTag === prevTag) {
        severity = 'HIGH';
        reason = `Identical IFMIS Tag Number "${cur.ifmisTagNumber?.trim()}" already registered on ${prev.itemCode}`;
      }
      // 3. Name & Price Match across different slips in the same store
      else {
        // Skip if same slip (that's multiple line items on the same voucher)
        if (cur.ifmisSlipNumber && prev.ifmisSlipNumber && cur.ifmisSlipNumber === prev.ifmisSlipNumber) {
          continue;
        }

        // Store location check: if both have location assigned and they differ, they're in different stores
        if (cur.storeLocationId && prev.storeLocationId && cur.storeLocationId !== prev.storeLocationId) {
          continue;
        }

        const prevTokens = tokenizeItemName(prev.name);
        sim = computeWordSimilarity(curTokens, prevTokens);
        const isExactName = cur.name.trim().toLowerCase() === prev.name.trim().toLowerCase();

        const priceDiff = Math.abs(curPrice - prevPrice);
        isSamePrice = curPrice > 0 && prevPrice > 0 && (priceDiff === 0 || priceDiff / Math.max(curPrice, prevPrice) < 0.005);

        const storeName = storeMap.get(cur.storeLocationId || '') || cur.storeLocation?.name || prev.storeLocation?.name || 'the same store';

        if (isExactName && isSamePrice) {
          severity = 'HIGH';
          reason = `Exact item name match and identical unit price (${curPrice.toLocaleString()} ETB) across slip ${prev.ifmisSlipNumber || '—'} and ${cur.ifmisSlipNumber || '—'} in ${storeName}`;
        } else if (sim >= 0.8 && isSamePrice) {
          severity = 'HIGH';
          reason = `${Math.round(sim * 100)}% name match and identical unit price (${curPrice.toLocaleString()} ETB) in ${storeName}`;
        }
      }

      if (severity) {
        const storeName = storeMap.get(cur.storeLocationId || '') || cur.storeLocation?.name || prev.storeLocation?.name || 'Same Store';

        // Add suspect entry (newer item -> points to original)
        suspectMap.set(cur.id, {
          suspectItemId: cur.id,
          matchedItemId: prev.id,
          matchedItemCode: prev.itemCode,
          matchedItemName: prev.name,
          matchedSlipNumber: prev.ifmisSlipNumber || '—',
          matchedUnitPrice: prevPrice,
          matchedQuantity: prev.balance?.available ?? prev.balance?.total ?? 1,
          matchedStatus: prev.status,
          matchedCreatedDate: prev.createdAt,
          storeName,
          similarity: sim ? Math.round(sim * 100) : 100,
          isSamePrice,
          severity,
          reason,
          isOriginal: false,
        });

        // Add original entry (original item -> points to newer suspect) if not already pointing to one
        if (!suspectMap.has(prev.id)) {
          suspectMap.set(prev.id, {
            suspectItemId: cur.id,
            matchedItemId: cur.id,
            matchedItemCode: cur.itemCode,
            matchedItemName: cur.name,
            matchedSlipNumber: cur.ifmisSlipNumber || '—',
            matchedUnitPrice: curPrice,
            matchedQuantity: cur.balance?.available ?? cur.balance?.total ?? 1,
            matchedStatus: cur.status,
            matchedCreatedDate: cur.createdAt,
            storeName,
            similarity: sim ? Math.round(sim * 100) : 100,
            isSamePrice,
            severity,
            reason: `This original asset is duplicated by newer record ${cur.itemCode} on Model 19 #${cur.ifmisSlipNumber || '—'}`,
            isOriginal: true,
          });
        }

        break;
      }
    }
  }

  return suspectMap;
}
