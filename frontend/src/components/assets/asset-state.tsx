import React from 'react';
import { Clock } from 'lucide-react';
import { statusTone, pill } from '../ui/theme';
import { ItemWithRelations, TransactionApproval, AssetCategory } from '../../types/asset-management';

export const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery & Supplies' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles & Transport' },
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
];

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
  /** Whole days its units have waited in store; set only for records in store */
  daysInStore?: number;
}

/** Items should be distributed within this many days of arriving in store (same limit as the dashboard) */
export const STALE_IN_STORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days a record's units have been in store, counted the same way as the dashboard:
 * from the latest approved return if it came back, otherwise from the Model 19 receiving date.
 */
export function daysInStore(item: ItemWithRelations, today: Date = new Date()): number | undefined {
  const returned = (item.history ?? [])
    .filter((h) => h.action === 'RETURN_APPROVED')
    .map((h) => h.dateGc)
    .sort();
  const since = (returned[returned.length - 1] ?? item.ifmisSlipDateGc ?? String(item.createdAtGc || '')).slice(0, 10);
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) return undefined;
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((todayMs - sinceMs) / DAY_MS));
}

export const isStale = (row: AssetRow) => (row.daysInStore ?? 0) > STALE_IN_STORE_DAYS;

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
        {row.state === 'IN_STORE' && isStale(row) && (
          <span
            className="text-[10px] font-semibold text-amber-800"
            title={`Waiting in store longer than ${STALE_IN_STORE_DAYS} days; items should be issued sooner`}
          >
            {row.daysInStore} days in store
          </span>
        )}
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
