import React from 'react';
import { Clock } from 'lucide-react';
import { statusTone, pill } from '../ui/theme';
import { ItemWithRelations, TransactionApproval } from '../../types/asset-management';

/**
 * Where an asset record is in its life: received into store (Model 19), issued to someone (Model 22),
 * then transferred to someone else or returned to store (Model 21). Each step waits for approval.
 */
export type AssetState = 'RECEIPT_PENDING' | 'IN_STORE' | 'ISSUED' | 'REQUEST_PENDING' | 'REJECTED';

/** Who a pending request is waiting for */
export const STAGE_LABELS: Record<number, string> = {
  1: 'With Team Leader',
  2: 'With Dept. Head',
};

export const REQUEST_LABELS: Record<string, { noun: string; pending: string; model: string }> = {
  STOCK_IN: { noun: 'receipt', pending: 'Receipt pending', model: 'Model 19' },
  STOCK_OUT: { noun: 'issue', pending: 'Issue pending', model: 'Model 22' },
  TRANSFER: { noun: 'transfer', pending: 'Transfer pending', model: 'Model 21' },
  RETURN: { noun: 'return', pending: 'Return pending', model: 'Model 21' },
};

export const ENDORSED_REASON = 'The Team Leader has endorsed it. To correct it, ask an approver to reject it.';

export interface AssetRow {
  item: ItemWithRelations;
  state: AssetState;
  /** The open request on this record, if any */
  request?: TransactionApproval;
  units: number;
  /** Who holds it, or the store it sits in */
  where: string;
  /** Where a pending request takes it */
  goingTo?: string;
  /** Latest activity, for ordering */
  activity: string;
  /** The approved issue that put this record with someone, for reprinting its Model 22 */
  lastIssue?: TransactionApproval;
  /** The latest approved transfer or return, for reprinting its Model 21 */
  lastMove?: TransactionApproval;
  /** The record's latest decided request, when it was rejected */
  rejected?: TransactionApproval;
}

/** A registration with the units issued from it */
export interface AssetGroup {
  row: AssetRow;
  children: AssetRow[];
  /** Latest activity in the batch, for ordering */
  activity: string;
}

export interface ShownGroup extends AssetGroup {
  /** The units listed under the batch: all of them, or those matching the filter or search */
  units: AssetRow[];
  /** Unfolded because a filter or search matched one of its units */
  forceOpen: boolean;
}

/** When a request was decided; the request time breaks same-day ties */
export const decidedOn = (a: TransactionApproval) => `${a.reviewedAtGc || ''}|${a.createdAtGc || ''}`;
export const shortDate = (gc?: string) =>
  gc ? new Date(gc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** "Issue rejected · 30 Sep 2026", with the reviewer's reason underneath */
export const RejectionNote: React.FC<{ request: TransactionApproval }> = ({ request }) => {
  const kind = REQUEST_LABELS[request.transactionType]?.noun ?? 'request';
  const reason = request.reviewRemarks?.trim();
  return (
    <span className="block max-w-[220px] whitespace-normal text-[10px] leading-snug text-red-700" title={reason}>
      <span className="font-semibold">
        {kind.charAt(0).toUpperCase() + kind.slice(1)} rejected{request.reviewedAtGc ? ` · ${shortDate(request.reviewedAtGc)}` : ''}
      </span>
      {reason && <span className="block line-clamp-2 text-red-700/80">{reason}</span>}
    </span>
  );
};

/** `partly`: a batch with some units out and the rest still in store */
export const AssetStatus: React.FC<{ row: AssetRow; partly?: boolean }> = ({ row, partly }) => {
  const settled =
    row.state === 'REJECTED' ? <span className={`${pill} ${statusTone.rejected}`}>Rejected</span>
    : row.state === 'IN_STORE' && partly ? <span className={`${pill} ${statusTone.partly}`}>Partly issued</span>
    : row.state === 'IN_STORE' ? <span className={`${pill} ${statusTone.inStore}`}>In store</span>
    : row.state === 'ISSUED' ? <span className={`${pill} ${statusTone.issued}`}>Issued</span>
    : null;
  if (settled) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        {settled}
        {row.rejected && <RejectionNote request={row.rejected} />}
      </span>
    );
  }
  const label = REQUEST_LABELS[row.request?.transactionType ?? 'STOCK_IN']?.pending ?? 'Pending';
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`${pill} ${statusTone.pending}`}>
        <Clock className="h-3 w-3" />
        {label}
      </span>
      {row.request && <span className="text-[10px] text-slate-500">{STAGE_LABELS[row.request.currentStage] ?? 'Waiting for approval'}</span>}
    </span>
  );
};
