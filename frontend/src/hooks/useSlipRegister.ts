import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TransactionApproval } from '../types/asset-management';

/**
 * The voucher numbers already used by requests, so a form can warn before the same number is entered twice.
 * A request rejected for good keeps its number (it can't be entered again); one rejected before rejections were final
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

  /** The request that already uses this number, when there is one (ignoring the request being corrected) */
  const findUsed = (number: string, types: string[], exceptId?: string): TransactionApproval | undefined => {
    const wanted = number.trim().toLowerCase();
    if (!wanted) return undefined;
    return requests.find(
      (r) => r.id !== exceptId && types.includes(r.transactionType) && (r.status !== 'REJECTED' || r.rejectionFinal === true) && (r.ifmisSlipNumber || '').trim().toLowerCase() === wanted,
    );
  };

  return { findUsed };
}

/** "Already used for MOA-IT-2026-0007 (issue, pending)" */
export function usedMessage(number: string, used: TransactionApproval): string {
  if (used.status === 'REJECTED') {
    const by = used.reviewedBy?.fullNameEn ? ` by ${used.reviewedBy.fullNameEn}` : '';
    return `${number.trim()} was rejected${by}${used.reviewRemarks ? `: "${used.reviewRemarks}"` : ''}. A rejected voucher can't be entered again; one that only needs correcting is returned for correction instead.`;
  }
  const kind = used.transactionType === 'STOCK_OUT' ? 'issue' : used.transactionType === 'RETURN' ? 'return to store' : used.transactionType.toLowerCase();
  const state = used.status === 'PENDING' ? 'pending' : used.status === 'RETURNED' ? 'returned for correction' : used.status.toLowerCase();
  return `${number.trim()} is already used for ${used.itemCode} (${kind}, ${state}). Check the number on the slip.`;
}
