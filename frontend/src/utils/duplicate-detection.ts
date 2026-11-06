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

/**
 * Detects if a pending/count item likely duplicates a pre-existing inventory asset.
 * Checks within the same store location:
 * 1. Exact or near-exact name match + exact or near-identical unit price => HIGH confidence duplicate
 * 2. High token similarity (>= 80%) + exact or near-identical unit price => HIGH confidence duplicate
 * 3. High token similarity (>= 85%) with different price => MEDIUM confidence suspect
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

  // Count / newly imported items in PENDING_STOCK_IN
  const isCount = (i: ItemWithRelations) =>
    Boolean(i.isHistoricalData || /^(count-|drive-|ቆጠራ)/i.test(i.ifmisSlipNumber || ''));

  const pendingCountItems = items.filter(
    (i) => isCount(i) && (i.status === 'PENDING_STOCK_IN' || !i.status)
  );

  // Pre-existing active items in system (not disposed or rejected)
  const activeExistingItems = items.filter(
    (i) => !isCount(i) && i.status !== 'REJECTED' && i.status !== 'DISPOSED'
  );

  if (pendingCountItems.length === 0 || activeExistingItems.length === 0) {
    return suspectMap;
  }

  for (const c of pendingCountItems) {
    const cTokens = tokenizeItemName(c.name);
    if (!cTokens.length) continue;

    let bestMatch: DuplicateSuspect | null = null;

    for (const p of activeExistingItems) {
      // Must be same store location (or both without location)
      if (c.storeLocationId && p.storeLocationId && c.storeLocationId !== p.storeLocationId) {
        continue;
      }

      const pTokens = tokenizeItemName(p.name);
      if (!pTokens.length) continue;

      const sim = computeWordSimilarity(cTokens, pTokens);
      const isExactName = c.name.trim().toLowerCase() === p.name.trim().toLowerCase();

      // Check price proximity (equal or within 0.5%)
      const cPrice = Number(c.unitCostETB) || 0;
      const pPrice = Number(p.unitCostETB) || 0;
      const priceDiff = Math.abs(cPrice - pPrice);
      const isSamePrice = (cPrice > 0 && pPrice > 0 && (priceDiff === 0 || priceDiff / Math.max(cPrice, pPrice) < 0.005));

      let severity: 'HIGH' | 'MEDIUM' | null = null;
      let reason = '';

      if (isExactName && isSamePrice) {
        severity = 'HIGH';
        reason = `Exact item name match and identical unit price (${cPrice.toLocaleString()} ETB) in ${storeMap.get(c.storeLocationId) || 'the same store'}`;
      } else if (sim >= 0.75 && isSamePrice) {
        severity = 'HIGH';
        reason = `${Math.round(sim * 100)}% name match and identical unit price (${cPrice.toLocaleString()} ETB) in ${storeMap.get(c.storeLocationId) || 'the same store'}`;
      } else if (isExactName && !isSamePrice && cPrice > 0 && pPrice > 0) {
        severity = 'MEDIUM';
        reason = `Exact item name match with different unit price (Pending: ${cPrice.toLocaleString()} ETB vs Existing: ${pPrice.toLocaleString()} ETB)`;
      } else if (sim >= 0.85 && cTokens.length >= 2 && pTokens.length >= 2) {
        severity = 'MEDIUM';
        reason = `${Math.round(sim * 100)}% similar description in ${storeMap.get(c.storeLocationId) || 'the same store'}`;
      }

      if (severity) {
        // Prioritize HIGH severity over MEDIUM, and higher similarity
        if (
          !bestMatch ||
          (severity === 'HIGH' && bestMatch.severity === 'MEDIUM') ||
          (severity === bestMatch.severity && sim > bestMatch.similarity)
        ) {
          bestMatch = {
            suspectItemId: c.id,
            matchedItemId: p.id,
            matchedItemCode: p.itemCode,
            matchedItemName: p.name,
            matchedSlipNumber: p.ifmisSlipNumber,
            matchedUnitPrice: pPrice,
            matchedQuantity: p.balance?.available ?? p.balance?.total ?? 1,
            matchedStatus: p.status,
            matchedCreatedDate: p.createdAt,
            storeName: storeMap.get(c.storeLocationId) || c.storeLocation?.name || 'Same Store',
            similarity: Math.round(sim * 100),
            isSamePrice,
            severity,
            reason,
          };
        }
      }
    }

    if (bestMatch) {
      suspectMap.set(c.id, bestMatch);
    }
  }

  return suspectMap;
}
