import React from 'react';
import { Clock, Undo2 } from 'lucide-react';
import { statusTone, pill } from '../ui/theme';
import { ItemWithRelations, TransactionApproval, AssetCategory, ItemType } from '../../types/asset-management';

export const ITEM_TYPE_OPTIONS: { value: ItemType; label: string; amharic: string }[] = [
  { value: ItemType.FIXED, label: 'Fixed asset', amharic: 'ቋሚ ዕቃ' },
  { value: ItemType.CONSUMABLE, label: 'Consumable item', amharic: 'አላቂ ዕቃ' },
];

/** "Fixed asset (ቋሚ ዕቃ)" for a type; items from before types existed are fixed assets */
export const itemTypeLabel = (type?: ItemType | string | null): string => {
  const option = ITEM_TYPE_OPTIONS.find((o) => o.value === type) ?? ITEM_TYPE_OPTIONS[0];
  return `${option.label} (${option.amharic})`;
};

/** Small tag beside an asset's name saying whether it is a fixed asset or a consumable item */
export const ItemTypeBadge: React.FC<{ type?: ItemType | string | null }> = ({ type }) => {
  const consumable = type === ItemType.CONSUMABLE;
  return (
    <span
      title={itemTypeLabel(type)}
      className={`inline-block rounded px-1.5 py-px text-[10px] font-semibold leading-4 border ${
        // Violet, a colour no status uses, so the type is never read as a state such as "Receipt pending" (amber)
        consumable ? 'bg-violet-50 text-violet-800 border-violet-200' : 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {consumable ? 'Consumable' : 'Fixed'}
    </span>
  );
};

export const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery & Supplies' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles & Transport' },
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
  { value: AssetCategory.TOOLS_EQUIPMENT, label: 'Tools & Equipment' },
  { value: AssetCategory.OFFICE_SUPPLIES, label: 'Office Supplies & Stationery' },
  { value: AssetCategory.FUEL_LUBRICANTS, label: 'Fuel & Lubricants' },
  { value: AssetCategory.OTHER_SUPPLIES, label: 'Other Materials & Supplies' },
];

/** The category as the forms and lists name it ("IT Equipment & Accessories") */
export const categoryLabel = (item: { category?: string | null; itemCategoryDisplay?: string | null }): string =>
  item.itemCategoryDisplay ||
  CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label ||
  (item.category ?? '').replace(/_/g, ' ');

/**
 * Where an asset record is in its life: received into store (Model 19), issued to someone (Model 22),
 * then transferred to someone else or returned to store (Model 21), and finally disposed of. Each step waits for approval.
 */
export type AssetState = 'RECEIPT_PENDING' | 'IN_STORE' | 'ISSUED' | 'REQUEST_PENDING' | 'REJECTED' | 'DISPOSED';

/** Who a pending request is waiting for */
export const STAGE_LABELS: Record<number, string> = {
  1: 'With Team Leader',
  2: 'With Dept. Head',
};

/**
 * Who a pending request is waiting for, by name: at stage 2 the Chief Director instead of the Department Head when
 * its voucher is above 10 million birr (the server says so in requiredRole, from the voucher's grand total).
 */
export const stageLabel = (request: { status?: string; currentStage?: number; requiredRole?: string }, fallback = 'Waiting for approval'): string =>
  request.status === 'REJECTED' ? 'Rejected'
  : request.currentStage === 2 && request.requiredRole === 'CHIEF_DIRECTOR' ? 'With Chief Director' : STAGE_LABELS[request.currentStage ?? 1] ?? fallback;

export const REQUEST_LABELS: Record<string, { noun: string; pending: string; model: string }> = {
  STOCK_IN: { noun: 'receipt', pending: 'Receipt pending', model: 'Model 19' },
  STOCK_OUT: { noun: 'issue', pending: 'Issue pending', model: 'Model 22' },
  TRANSFER: { noun: 'transfer', pending: 'Transfer pending', model: 'Model 21' },
  RETURN: { noun: 'return to store', pending: 'Return to store pending', model: 'Model 21' },
  DISPOSAL: { noun: 'disposal', pending: 'Disposal pending', model: 'disposal voucher' },
};

/** Labels for a request type, with a plain fallback for a type this screen doesn't know yet */
export const requestLabel = (type?: string, details?: { disposal?: boolean } | null) =>
  (type === 'STOCK_OUT' && details?.disposal ? { noun: 'disposal', pending: 'Disposal pending', model: 'Model 22' } : REQUEST_LABELS[type ?? '']) ??
  { noun: 'request', pending: 'Pending', model: 'voucher' };

/** Who an issue or transfer request is for: the employee, or the outside organization */
export const recipientOf = (request: TransactionApproval): string | undefined =>
  request.recipientEmployee?.fullNameEn || request.requestDetails?.organizationName || request.requestDetails?.recipientName || undefined;

export const ENDORSED_REASON = 'The Team Leader has endorsed it: now only the Department Head can correct it, or reject it.';

export interface AssetRow {
  item: ItemWithRelations;
  state: AssetState;
  /** The open request on this record, if any: the oldest when several issue requests wait on it */
  request?: TransactionApproval;
  /** Every open request on this record, oldest first (several issue requests can wait on one record) */
  requests?: TransactionApproval[];
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
  /** The approved disposal that took this record off the register, for reprinting its voucher */
  lastDisposal?: TransactionApproval;
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
/** No voucher in the system is older than this; an earlier year is a typo or a misread slip */
const EARLIEST_SLIP_YEAR = 2000;

export function daysInStore(item: ItemWithRelations, today: Date = new Date()): number | undefined {
  const returned = (item.history ?? [])
    .filter((h) => h.action === 'RETURN_APPROVED')
    .map((h) => h.dateGc)
    .sort();
  // A slip date with an impossible year (e.g. 0026, saved before the year was checked) counts from the record's date,
  // as the dashboard does, instead of making it thousands of years in store
  const slipDate = item.ifmisSlipDateGc && Number(item.ifmisSlipDateGc.slice(0, 4)) >= EARLIEST_SLIP_YEAR ? item.ifmisSlipDateGc : undefined;
  const since = (returned[returned.length - 1] ?? slipDate ?? String(item.createdAtGc || '')).slice(0, 10);
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

/** "Issue rejected · 30 Sep 2026" (or cancelled by its requester), with the reason underneath */
export const RejectionNote: React.FC<{ request: TransactionApproval }> = ({ request }) => {
  const kind = requestLabel(request.transactionType, request.requestDetails).noun;
  const reason = request.reviewRemarks?.trim();
  return (
    <span className="block max-w-[220px] whitespace-normal text-[10px] leading-snug text-red-700" title={reason}>
      <span className="font-semibold">
        {kind.charAt(0).toUpperCase() + kind.slice(1)} {request.status === 'CANCELLED' ? 'cancelled' : 'rejected'}{request.reviewedAtGc ? ` · ${shortDate(request.reviewedAtGc)}` : ''}
      </span>
      {reason && <span className="block line-clamp-2 text-red-700/80">{reason}</span>}
    </span>
  );
};

/** "by Team Leader: Price is entered as USD." — who rejected it (the stage) and what to correct; the name and date on hover */
export const ReturnedNote: React.FC<{ request: TransactionApproval }> = ({ request }) => {
  const reason = request.returnRemarks?.trim();
  const by = request.returnedFromStage === 2 ? 'Department Head' : 'Team Leader';
  const detail = [request.returnedBy?.fullNameEn, shortDate(request.returnedAtGc), reason].filter(Boolean).join(' · ');
  return (
    <span className="block max-w-[220px] whitespace-normal text-[10px] leading-snug text-amber-800 line-clamp-2" title={detail}>
      <span className="text-slate-500">by {by}{reason ? ': ' : ''}</span>
      {reason && <span>{reason}</span>}
    </span>
  );
};

/** `partly`: a batch with some units out and the rest still in store */
export const AssetStatus: React.FC<{ row: AssetRow; partly?: boolean }> = ({ row, partly }) => {
  const settled =
    // A piece split off a batch is only ever closed by reversing the issue or disposal that made it: its units went back
    row.state === 'REJECTED' && row.item.parentItemId ? (
      <span className={`${pill} ${statusTone.neutral}`} title="Reversed: the issue or disposal that made this piece was undone, and its units went back">
        Reversed
      </span>
    )
    : row.state === 'REJECTED' ? (
      <span
        className={`${pill} ${statusTone.rejected}`}
        title={
          row.rejected
            ? [
                row.rejected.status === 'CANCELLED' ? 'Receipt cancelled' : 'Receipt rejected',
                row.rejected.reviewedAtGc ? shortDate(row.rejected.reviewedAtGc) : undefined,
                row.rejected.reviewRemarks?.trim() ? `Reason: ${row.rejected.reviewRemarks.trim()}` : undefined,
              ].filter(Boolean).join(' · ')
            : undefined
        }
      >
        {row.rejected?.status === 'CANCELLED' ? 'Cancelled' : 'Rejected'}
      </span>
    )
    : row.state === 'DISPOSED' ? (
      <span className={`${pill} ${statusTone.neutral}`} title="Disposed">
        Disposed
      </span>
    )
    : row.state === 'IN_STORE' ? (
      <span
        className={`${pill} ${partly ? statusTone.partly : statusTone.inStore}`}
        title={[
          partly ? 'Partly issued' : 'In store',
          isStale(row) ? `${row.daysInStore} days in store` : undefined,
          row.rejected ? `${requestLabel(row.rejected.transactionType, row.rejected.requestDetails).noun} rejected · ${row.rejected.reviewRemarks || ''}` : undefined,
        ].filter(Boolean).join(' · ')}
      >
        {partly ? 'Partly issued' : 'In store'}
      </span>
    )
    : row.state === 'ISSUED' ? (
      <span className={`${pill} ${statusTone.issued}`} title="Issued">
        Issued
      </span>
    )
    : null;

  if (settled) {
    return settled;
  }

  // Rejected and with its requester, to correct and resubmit or cancel
  if (row.request?.status === 'REJECTED') {
    const reason = row.request.returnRemarks?.trim();
    const by = row.request.returnedFromStage === 2 ? 'by Department Head' : 'by Team Leader';
    const detail = [by ? `${by}:` : undefined, reason, shortDate(row.request.returnedAtGc)].filter(Boolean).join(' ');
    return (
      <span
        className={`${pill} ${statusTone.rejected}`}
        title={detail || 'Rejected'}
      >
        <Undo2 className="h-3 w-3" />
        Rejected
      </span>
    );
  }

  // Several issues waiting on one record: how many, and where each one is
  const open = row.requests ?? [];

  // A waiting issue or disposal for only part of the units: they are still where they were, so the status says that,
  // and the request goes underneath ("Disposal pending: 6 of 17")
  const asked = Number(row.request?.requestDetails?.quantity);
  if (
    row.request?.status === 'PENDING' &&
    (row.request.transactionType === 'STOCK_OUT' || row.request.transactionType === 'DISPOSAL') &&
    open.length <= 1 &&
    asked > 0 &&
    asked < row.units
  ) {
    const pending = requestLabel(row.request.transactionType, row.request.requestDetails).pending;
    // One pill: where the units are, with a clock for the request; the request itself on hover and in the record
    return (
      <span
        className={`${pill} ${partly ? statusTone.partly : statusTone.inStore}`}
        title={`${pending}: ${asked.toLocaleString()} of ${row.units.toLocaleString()} · ${stageLabel(row.request)}`}
        aria-label={`${partly ? 'Partly issued' : 'In store'}, ${pending.toLowerCase()} for ${asked} of ${row.units}`}
      >
        {partly ? 'Partly issued' : 'In store'}
        <Clock className="h-3 w-3 text-amber-700" aria-hidden />
      </span>
    );
  }
  if (open.length > 1) {
    const noun = requestLabel(open[0].transactionType, open[0].requestDetails).noun;
    const where = new Map<string, number>();
    for (const r of open) where.set(stageLabel(r), (where.get(stageLabel(r)) ?? 0) + 1);
    const whereText = where.size === 1
      ? [...where.keys()][0]
      : [...where].map(([label, n]) => `${n} ${label.replace(/^With /, 'with ').replace(/^Rejected$/, 'rejected')}`).join(' · ');
    return (
      <span
        className={`${pill} ${statusTone.pending}`}
        title={`${open.length} ${noun}s pending · ${whereText}`}
      >
        <Clock className="h-3 w-3" />
        {open.length} {noun}s pending
      </span>
    );
  }

  const label = requestLabel(row.request?.transactionType ?? 'STOCK_IN', row.request?.requestDetails).pending;
  return (
    <span
      className={`${pill} ${statusTone.pending}`}
      title={row.request ? `${label} · ${stageLabel(row.request)}` : label}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
};
