import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TransactionApproval } from '../types/asset-management';

/**
 * The voucher numbers already used by requests, so a form can warn before the same number is entered twice.
 * A rejected request still with its requester keeps its number (it is corrected there); a closed or cancelled one
 * frees it. A failed load only means no warning.
 */
export function useSlipRegister() {
  const [requests, setRequests] = useState<TransactionApproval[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getApprovals())
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setRequests(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The request that already uses this number, when there is one (ignoring the request being corrected). One for an
   * asset on this form comes first, a rejected one with its requester included: the same asset can't go on a voucher twice.
   */
  const findUsed = (number: string, types: string[], exceptId?: string, itemIds: string[] = []): TransactionApproval | undefined => {
    const wanted = number.trim().toLowerCase();
    if (!wanted) return undefined;
    const sameNumber = (r: TransactionApproval) =>
      r.id !== exceptId && types.includes(r.transactionType) && (r.ifmisSlipNumber || '').trim().toLowerCase() === wanted;
    return (
      requests.find((r) => sameNumber(r) && itemIds.includes(r.itemId) && (r.status === 'PENDING' || r.status === 'REJECTED')) ??
      requests.find((r) => sameNumber(r) && r.status !== 'REJECTED' && r.status !== 'CANCELLED')
    );
  };

  return { findUsed };
}

/** Whether the request using the number is for one of these assets: then this would enter it twice */
export const isSameAsset = (used: TransactionApproval | undefined, itemIds: string[]): boolean =>
  !!used && itemIds.includes(used.itemId) && (used.status === 'PENDING' || used.status === 'REJECTED');

/** "Already used for MOA-IT-2026-0007 (issue, pending)"; for the same asset, what to do instead */
export function usedMessage(number: string, used: TransactionApproval, itemIds: string[] = []): string {
  const kind = used.transactionType === 'STOCK_OUT' ? 'issue' : used.transactionType === 'RETURN' ? 'return to store' : used.transactionType.toLowerCase();
  if (isSameAsset(used, itemIds)) {
    return used.status === 'REJECTED'
      ? `${used.itemCode} is already on ${number.trim()} (${kind}, rejected and with its requester). Correct and resubmit that request, or cancel it, instead of entering it again.`
      : `${used.itemCode} is already on ${number.trim()} (${kind}, waiting for approval). Correct that request instead of entering it again.`;
  }
  const state = used.status === 'PENDING' ? 'pending' : used.status === 'REJECTED' ? 'rejected, to correct or cancel' : used.status.toLowerCase();
  return `${number.trim()} is already used for ${used.itemCode} (${kind}, ${state}). Check the number on the slip.`;
}
