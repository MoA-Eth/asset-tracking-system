import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TransactionApproval } from '../types/asset-management';

/**
 * The voucher numbers already used by requests, so a form can warn before the same number is entered twice.
 * A rejected request frees its number (it is registered again with the same slip), and a failed load only means no warning.
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
      (r) => r.id !== exceptId && types.includes(r.transactionType) && r.status !== 'REJECTED' && (r.ifmisSlipNumber || '').trim().toLowerCase() === wanted,
    );
  };

  return { findUsed };
}

/** "Already used for MOA-IT-2026-0007 (issue, pending)" */
export function usedMessage(number: string, used: TransactionApproval): string {
  const kind = used.transactionType === 'STOCK_OUT' ? 'issue' : used.transactionType === 'RETURN' ? 'transfer to store' : used.transactionType.toLowerCase();
  const state = used.status === 'PENDING' ? 'pending' : used.status.toLowerCase();
  return `${number.trim()} is already used for ${used.itemCode} (${kind}, ${state}). Check the number on the slip.`;
}
