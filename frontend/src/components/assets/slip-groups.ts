/**
 * Items received on the same Model 19 with the same PO are one receipt: the Assets register and the Approvals queue
 * show them as one row. Each line is still its own record and its own approval.
 */

/** What makes lines one receipt: the Model 19 No. and the PO number (none on both counts as the same) */
export const slipKey = (slipNo?: string | null, poNumber?: string | null): string | undefined => {
  const slip = (slipNo ?? '').trim().toLowerCase();
  // No number yet, or a placeholder given while the slip number was unknown: nothing to group by
  if (!slip || slip === '—' || slip === '-' || slip.startsWith('pending-')) return undefined;
  const po = (poNumber ?? '').trim().toLowerCase();
  return `${slip}|${po === '—' ? '' : po}`;
};

export interface SlipGroup<T> {
  key: string;
  members: T[];
}

/**
 * Lines of the same receipt, together, in the order the first of each appears; a line on its own (or without a
 * slip) is a single. Groups of one line are returned as singles.
 */
export function groupBySlip<T>(list: T[], keyOf: (entry: T) => string | undefined): (SlipGroup<T> | { single: T })[] {
  const byKey = new Map<string, T[]>();
  for (const entry of list) {
    const key = keyOf(entry);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  const placed = new Set<string>();
  const result: (SlipGroup<T> | { single: T })[] = [];
  for (const entry of list) {
    const key = keyOf(entry);
    const members = key ? byKey.get(key)! : undefined;
    if (!key || !members || members.length < 2) {
      result.push({ single: entry });
    } else if (!placed.has(key)) {
      placed.add(key);
      result.push({ key, members });
    }
  }
  return result;
}

export const isSlipGroup = <T,>(entry: SlipGroup<T> | { single: T }): entry is SlipGroup<T> => 'members' in entry;

/**
 * What makes requests one row of the approvals queue: the lines of a receipt (same slip and PO) waiting at the same
 * stage. Other requests have none and are a row each.
 */
export const approvalRowKey = (a: { transactionType: string; ifmisSlipNumber?: string | null; poNumber?: string | null; status: string; currentStage?: number }): string | undefined => {
  if (a.transactionType !== 'STOCK_IN') return undefined;
  const key = slipKey(a.ifmisSlipNumber, a.poNumber);
  return key && `${key}|${a.status}|${a.currentStage ?? 1}`;
};

/** How many rows a list of requests makes in the approvals queue (a receipt of several lines counts once) */
export const countApprovalRows = <T extends Parameters<typeof approvalRowKey>[0]>(list: T[]): number => groupBySlip<T>(list, approvalRowKey).length;

// A receipt asked to be opened from elsewhere (the top-bar search): the Assets page opens it once it has loaded
let pendingSlip: string | null = null;
export const OPEN_SLIP_EVENT = 'moa_open_slip';
export const requestOpenSlip = (key: string) => {
  pendingSlip = key;
  window.dispatchEvent(new CustomEvent(OPEN_SLIP_EVENT));
};
/** The receipt waiting to be opened, once the page has it */
export const takePendingSlip = (has: (key: string) => boolean): string | null => {
  if (!pendingSlip || !has(pendingSlip)) return null;
  const key = pendingSlip;
  pendingSlip = null;
  return key;
};

/** "Dell Latitude, HP Printer +3" */
export const slipNames = (names: string[], shown = 2): string => {
  const distinct = [...new Set(names.filter(Boolean))];
  const head = distinct.slice(0, shown).join(', ');
  return distinct.length > shown ? `${head} +${distinct.length - shown}` : head;
};
