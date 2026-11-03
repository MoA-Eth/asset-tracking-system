import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRightLeft, ChevronDown, ChevronRight, Copy, FileText, PackageMinus, Paperclip, Pencil, Printer, Send } from 'lucide-react';
import { btn, pill, statusTone } from '../ui/theme';
import { CloseButton } from '../ui/CloseButton';
import { BackButton } from '../ui/BackButton';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { FieldGrid, Field as FormKitField, ReadOnlyValue, TotalValue } from '../ui/FormKit';
import { ItemWithRelations } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { costOf } from '../../utils/item-cost';
import { storeLocationLabel } from '../../utils/location';
import { getSlipDisplayName } from '../../utils/slip-upload';
import { AssetRow, AssetState, AssetStatus, ItemTypeBadge, requestLabel, shortDate } from './asset-state';
import { voucherSize } from './slip-groups';

/** What a line of a receipt cost, as on its Model 19 (VAT or other charges included) */
export const slipLineTotal = (item: ItemWithRelations): number => {
  if (Number(item.totalAmount) > 0) return Number(item.totalAmount);
  const qty = item.balance?.total || Number(item.quantity) || 1;
  const base = (Number(item.unitCostETB) || 0) * qty;
  return item.vatApplicable ? base + Math.round(base * 0.15 * 100) / 100 : base + (Number(item.additionalCharges) || 0);
};

const STATE_WORDS: Record<AssetState, string> = {
  RECEIPT_PENDING: 'receipt pending',
  IN_STORE: 'in store',
  ISSUED: 'issued',
  REQUEST_PENDING: 'request pending',
  REJECTED: 'rejected',
  DISPOSED: 'disposed',
};

/** How each state looks as a badge, in the colours used across the table */
const STATE_BADGES: Record<AssetState, { label: string; tone: string }> = {
  RECEIPT_PENDING: { label: 'Receipt pending', tone: statusTone.pending },
  REQUEST_PENDING: { label: 'Request pending', tone: statusTone.pending },
  IN_STORE: { label: 'In store', tone: statusTone.inStore },
  ISSUED: { label: 'Issued', tone: statusTone.issued },
  REJECTED: { label: 'Rejected', tone: statusTone.rejected },
  DISPOSED: { label: 'Disposed', tone: statusTone.neutral },
};

/**
 * How the items of a receipt stand, grouped: by state, and a pending request by its kind ("Issue pending",
 * "Disposal pending"), as each item's own badge says it
 */
const standings = (rows: AssetRow[], partly?: Set<string>) => {
  const groups = new Map<string, { key: string; label: string; word: string; tone: string; n: number }>();
  for (const r of rows) {
    // A rejected request is with its requester, whatever kind it is
    const returned = r.request?.status === 'REJECTED' ? 'Rejected' : undefined;
    const pending = returned ?? (r.state === 'REQUEST_PENDING' && r.request ? requestLabel(r.request.transactionType, r.request.requestDetails).pending : undefined);
    // An item with some units issued and the rest in store says so, as its own row does
    const someOut = !returned && !pending && r.state === 'IN_STORE' && !!partly?.has(r.item.id);
    const key = returned ? 'REJECTED' : pending ? `REQUEST:${pending}` : someOut ? 'PARTLY' : r.state;
    const g = groups.get(key) ?? {
      key,
      label: pending ?? (someOut ? 'Partly issued' : STATE_BADGES[r.state].label),
      word: pending ? pending.toLowerCase() : someOut ? 'partly issued' : STATE_WORDS[r.state],
      tone: returned ? statusTone.rejected : someOut ? statusTone.partly : STATE_BADGES[r.state].tone,
      n: 0,
    };
    groups.set(key, { ...g, n: g.n + 1 });
  }
  return [...groups.values()];
};

/** "2 in store · 1 issued": where the items of a receipt stand */
export const slipStatusSummary = (rows: AssetRow[], partly?: Set<string>): string => standings(rows, partly).map(({ word, n }) => `${n} ${word}`).join(' · ');

export interface SlipStatusProps {
  rows: AssetRow[];
  /** Items with some units issued and the rest in store */
  partly?: Set<string>;
  isOpen?: boolean;
  onViewDetails?: () => void;
}

/**
 * The status of a Model 19 of several items: compact summary on the table row with an expandable
 * breakdown popover detailing counts for each status.
 */
export const SlipStatus: React.FC<SlipStatusProps> = ({ rows, partly, isOpen, onViewDetails }) => {
  const list = standings(rows, partly);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrowOffset: number; up: boolean }>({
    top: 0,
    left: 0,
    arrowOffset: 24,
    up: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Place the popover under the button, aligning the arrow with the button center
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const popoverW = 256;
    const popoverH = popoverRef.current?.offsetHeight ?? 180;
    const up = r.bottom + 8 + popoverH > window.innerHeight - 8 && r.top - 8 - popoverH > 8;
    const triggerCenter = r.left + r.width / 2;
    let left = triggerCenter - 32;
    if (left + popoverW > window.innerWidth - 8) left = window.innerWidth - popoverW - 8;
    if (left < 8) left = 8;
    const arrowOffset = Math.max(12, Math.min(triggerCenter - left - 6, popoverW - 20));
    setPos({
      top: up ? r.top - 8 - popoverH : r.bottom + 8,
      left,
      arrowOffset,
      up,
    });
  }, [open]);

  // Close on outside click, Escape, scroll or resize
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  // All the same: the badge of one item; a rejected receipt keeps its reason
  if (list.length === 1) {
    return (
      <AssetStatus
        row={{ ...rows[0], rejected: rows[0].state === 'REJECTED' ? rows[0].rejected : undefined }}
        partly={list[0].key === 'PARTLY'}
      />
    );
  }

  // Summary chips for table row: roll up multiple pending requests into "X Pending" if mixed
  const pendingList = list.filter((s) => s.key === 'RECEIPT_PENDING' || s.key === 'REQUEST_PENDING' || s.key.startsWith('REQUEST:'));
  const nonPendingList = list.filter((s) => s.key !== 'RECEIPT_PENDING' && s.key !== 'REQUEST_PENDING' && !s.key.startsWith('REQUEST:'));
  const totalPending = pendingList.reduce((sum, s) => sum + s.n, 0);

  const summaryChips = [
    ...nonPendingList.map((s) => ({
      key: s.key,
      label: `${s.n} ${s.label}`,
      kind: s.key === 'IN_STORE' ? 'inStore' : s.key === 'ISSUED' ? 'issued' : s.key === 'REJECTED' ? 'rejected' : s.key === 'PARTLY' ? 'partly' : 'neutral',
      tone: s.tone,
    })),
    ...(totalPending > 0
      ? [
          {
            key: 'PENDING_GROUP',
            label: pendingList.length > 1 ? `${totalPending} Pending` : `${pendingList[0].n} ${pendingList[0].label}`,
            kind: 'pending',
            tone: statusTone.pending,
          },
        ]
      : []),
  ];

  return (
    <div className="inline-flex items-center gap-1.5 whitespace-nowrap" aria-label={slipStatusSummary(rows, partly)}>
      {summaryChips.length <= 2 ? (
        summaryChips.map((chip) => {
          const isStore = chip.kind === 'inStore';
          const isPend = chip.kind === 'pending';
          return (
            <span
              key={chip.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                isStore
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/90'
                  : isPend
                  ? 'bg-amber-50 text-amber-800 border-amber-200/90'
                  : `${pill} ${chip.tone}`
              }`}
            >
              {isStore && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
              {isPend && <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
              <span>{chip.label}</span>
            </span>
          );
        })
      ) : (
        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200/80">
          {list.length} statuses
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="View status breakdown"
        title="View status breakdown"
        className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
          open
            ? 'bg-sky-100 text-sky-800 border-sky-300 ring-2 ring-sky-200/50'
            : 'bg-sky-50 text-sky-700 border-sky-200/80 hover:bg-sky-100 hover:border-sky-300'
        }`}
      >
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              zIndex: 9999,
            }}
            className="w-64 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              className={`absolute h-2.5 w-2.5 rotate-45 border-slate-200 bg-white ${
                pos.up ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-t border-l'
              }`}
              style={{ left: `${pos.arrowOffset}px` }}
            />
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">Status Breakdown</h4>
            <div className="space-y-2 mt-2.5 mb-3">
              {list.map(({ key, label, n }) => {
                const isPend = key === 'RECEIPT_PENDING' || key === 'REQUEST_PENDING' || key.startsWith('REQUEST:');
                const isStore = key === 'IN_STORE';
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                      {isStore ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                      ) : isPend ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-400 ring-2 ring-slate-100 shrink-0" />
                      )}
                      <span>{label}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                        isStore
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : isPend
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          : 'bg-slate-100 text-slate-700 border border-slate-200/60'
                      }`}
                    >
                      {n}
                    </span>
                  </div>
                );
              })}
            </div>
            {onViewDetails && (
              <div className="border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onViewDetails();
                  }}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{isOpen ? 'Hide item details' : 'View all details'}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export interface SlipUnitCostProps {
  rows: AssetRow[];
  isOpen?: boolean;
  onViewDetails?: () => void;
}

/**
 * The unit cost of a Model 19 of several items: single price if identical, or a compact "X types"
 * badge with an expandable popover detailing the distinct costs and item counts.
 */
export const SlipUnitCost: React.FC<SlipUnitCostProps> = ({ rows, isOpen, onViewDetails }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrowOffset: number; up: boolean }>({
    top: 0,
    left: 0,
    arrowOffset: 200,
    up: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const costGroups = useMemo(() => {
    const map = new Map<string, { cost: number; count: number; isUnpriced: boolean }>();
    for (const r of rows) {
      const raw = costOf(r.item);
      const c = Math.round(raw * 100) / 100;
      const isUnpriced = c <= 0;
      const key = isUnpriced ? 'UNPRICED' : String(c);
      const existing = map.get(key) ?? { cost: c, count: 0, isUnpriced };
      existing.count += 1;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => {
      // Unpriced / "Varies" first, matching mockup
      if (a.isUnpriced) return -1;
      if (b.isUnpriced) return 1;
      return b.cost - a.cost;
    });
  }, [rows]);

  // Place the popover under the button, aligning the arrow with the button center
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const popoverW = 240;
    const popoverH = popoverRef.current?.offsetHeight ?? 160;
    const up = r.bottom + 8 + popoverH > window.innerHeight - 8 && r.top - 8 - popoverH > 8;
    const triggerCenter = r.left + r.width / 2;
    let left = triggerCenter - popoverW + 36;
    if (left + popoverW > window.innerWidth - 8) left = window.innerWidth - popoverW - 8;
    if (left < 8) left = 8;
    const arrowOffset = Math.max(12, Math.min(triggerCenter - left - 6, popoverW - 20));
    setPos({
      top: up ? r.top - 8 - popoverH : r.bottom + 8,
      left,
      arrowOffset,
      up,
    });
  }, [open]);

  // Close on outside click, Escape, scroll or resize
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  // Identical price across all items
  if (costGroups.length === 1) {
    if (costGroups[0].isUnpriced) {
      return <span className="text-slate-400 whitespace-nowrap">-</span>;
    }
    return (
      <span className="tabular-nums text-slate-700 whitespace-nowrap">
        {formatETB(costGroups[0].cost)}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 justify-end whitespace-nowrap">
      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200/80">
        {costGroups.length} types
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="View unit cost details"
        title="View unit cost details"
        className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
          open
            ? 'bg-sky-100 text-sky-800 border-sky-300 ring-2 ring-sky-200/50'
            : 'bg-sky-50 text-sky-700 border-sky-200/80 hover:bg-sky-100 hover:border-sky-300'
        }`}
      >
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              zIndex: 9999,
            }}
            className="w-60 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xl ring-1 ring-black/5 text-left animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              className={`absolute h-2.5 w-2.5 rotate-45 border-slate-200 bg-white ${
                pos.up ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-t border-l'
              }`}
              style={{ left: `${pos.arrowOffset}px` }}
            />
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">Unit Cost Details</h4>
            <div className="space-y-2 mt-2.5 mb-3">
              {costGroups.map((g, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  {g.isUnpriced ? (
                    <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200/70">
                      Varies
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-800 tabular-nums">
                      {formatETB(g.cost)}
                    </span>
                  )}
                  <span className="text-slate-500 tabular-nums text-xs">
                    {g.count} {g.count === 1 ? 'item' : 'items'}
                  </span>
                </div>
              ))}
            </div>
            {onViewDetails && (
              <div className="border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onViewDetails();
                  }}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{isOpen ? 'Hide item details' : 'View all details'}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export interface SlipRecordProps {
  /** The registrations received on this Model 19 (one per line), in slip order */
  rows: AssetRow[];
  /** Its items with some units issued and the rest in store */
  partly?: Set<string>;
  onOpenItem: (itemId: string) => void;
  onPrint: () => void;
  /** Opens a new receipt with every item of this one; absent when this person can't receive */
  onDuplicate?: () => void;
  /** Opens a Model 22 with this receipt's items still in store; absent when none is, or this person can't issue */
  onIssue?: () => void;
  /** Opens a Model 21 with this receipt's items still in store; absent when none is, or this person can't transfer */
  onTransfer?: () => void;
  /** Opens the receipt form to adjust every item of this rejected receipt together */
  onEdit?: () => void;
  /** Sends this rejected receipt back to the Team Leader; absent when it isn't rejected or this person can't */
  onResubmit?: () => void;
  /** Withdraws this rejected receipt; absent when it isn't rejected or this person can't */
  onCancelRequest?: () => void;
  /** A form open on this receipt (the Model 22 issuing its items), shown in place of the details */
  form?: React.ReactNode;
  onClose: () => void;
}

/**
 * A Model 19 receipt of several items, opened from its one row in the register: what the slip says, its total and
 * scanned copy, and its items, each opening its own record (where it is issued, transferred, corrected…).
 */
export const SlipRecord: React.FC<SlipRecordProps> = ({ rows, partly, onOpenItem, onPrint, onDuplicate, onIssue, onTransfer, onEdit, onResubmit, onCancelRequest, form, onClose }) => {
  const [viewingSlip, setViewingSlip] = useState(false);
  const lead = rows[0].item;
  const total = rows.reduce((sum, r) => sum + slipLineTotal(r.item), 0);
  const slipUrl = rows.find((r) => r.item.ifmisSlipAttachmentUrl)?.item.ifmisSlipAttachmentUrl;
  const value = (v?: string | null) => v?.trim() || '—';
  const rejected = rows.find((r) => r.rejected)?.rejected;

  return (
    <section
      aria-label={`Model 19 ${lead.ifmisSlipNumber}`}
      className="rounded-xl flex min-w-0 flex-1 flex-col overflow-hidden bg-white min-h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-4.5rem)] lg:sticky lg:top-2 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]"
    >
      <header className="shrink-0 relative space-y-2 border-b border-slate-200 px-5 py-4 bg-white z-10">
        <div className="absolute right-3 top-3">
          <CloseButton onClose={onClose} label="Close receipt" title="Back to assets (Esc)" />
        </div>
        <div className="flex flex-col gap-3 pr-8 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex items-start gap-2.5 min-w-0">
            <BackButton onBack={onClose} label="Back to assets" title="Back to assets (Esc)" />
            <div className="min-w-0">
              <nav aria-label="Breadcrumb navigation" className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={onClose}
                  className="font-medium text-slate-500 hover:text-emerald-700 hover:underline transition cursor-pointer"
                >
                  Assets Register
                </button>
                <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="font-bold text-slate-900">
                  Model 19 #{lead.ifmisSlipNumber}
                </span>
              </nav>
              <h3 className="truncate text-base font-extrabold text-slate-900">Model 19 #{lead.ifmisSlipNumber}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>
                  {/* Received on the slip (the units issued since included), as its row in the list counts them */}
                  {voucherSize(rows.map((r) => ({ units: r.item.balance?.total ?? r.units, uom: r.item.uom })))}
                  {lead.poNumber ? ` · PO ${lead.poNumber}` : ''}
                </span>
                <SlipStatus rows={rows} partly={partly} />
              </div>
            </div>
          </div>
          {/* While a form is open, its own Submit and Cancel replace these */}
          {!form && (
          <div role="toolbar" aria-label="Receipt actions" className="flex flex-wrap items-center gap-2">
            {onEdit && (
              <button type="button" onClick={onEdit} className={btn.primary}>
                <Pencil className="h-3.5 w-3.5" /> Edit receipt
              </button>
            )}
            {onResubmit && (
              <button
                type="button"
                onClick={onResubmit}
                className={onEdit ? btn.secondary : btn.primary}
                title={onEdit ? "Resubmit Model 19 as-is" : "Correct its items first: open each from the list below"}
              >
                <Send className="h-3.5 w-3.5" /> Resubmit Model 19
              </button>
            )}
            {onCancelRequest && (
              <button type="button" onClick={onCancelRequest} className={btn.secondary}>
                Cancel request
              </button>
            )}
            {onIssue && (
              <button type="button" onClick={onIssue} className={btn.primary}>
                <PackageMinus className="h-3.5 w-3.5" /> Issue (Model 22)
              </button>
            )}
            {onTransfer && (
              <button type="button" onClick={onTransfer} className={btn.secondary}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer (Model 21)
              </button>
            )}
            <button type="button" onClick={onPrint} className={btn.secondary}>
              <Printer className="h-3.5 w-3.5" /> Print Model 19
            </button>
            {slipUrl && (
              <button type="button" onClick={() => setViewingSlip(true)} className={btn.secondary} title={getSlipDisplayName(slipUrl)}>
                <Paperclip className="h-3.5 w-3.5" /> Scanned slip
              </button>
            )}
            {onDuplicate && (
              <button type="button" onClick={onDuplicate} className={btn.secondary}>
                <Copy className="h-3.5 w-3.5" /> Duplicate as new receipt
              </button>
            )}
          </div>
          )}
        </div>
      </header>

      {form ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">{form}</div>
      ) : (
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {rejected && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-red-800">
                {rejected.status === 'CANCELLED' ? 'Receipt cancelled' : 'Receipt rejected'}
                {rejected.reviewedAtGc ? ` · ${shortDate(rejected.reviewedAtGc)}` : ''}
              </p>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 transition-colors cursor-pointer"
                >
                  <Pencil className="h-3 w-3" /> Adjust &amp; Resubmit
                </button>
              )}
            </div>
            {rejected.reviewRemarks?.trim() && (
              <p className="mt-1 text-red-700">{rejected.reviewRemarks.trim()}</p>
            )}
          </div>
        )}
        <FieldGrid>
          <FormKitField label="Received date (G.C.)" hint={lead.ifmisSlipDateEc ? `${lead.ifmisSlipDateEc} E.C.` : undefined}>
            <ReadOnlyValue mono>{value(lead.ifmisSlipDateGc)}</ReadOnlyValue>
          </FormKitField>
          <FormKitField label="Transaction type"><ReadOnlyValue>{value(lead.transactionType)}</ReadOnlyValue></FormKitField>
          <FormKitField label="PO number"><ReadOnlyValue mono>{value(lead.poNumber)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Source (supplier / vendor)"><ReadOnlyValue>{value(lead.source)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Buyer"><ReadOnlyValue>{value(lead.buyer)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Program / project"><ReadOnlyValue>{value(lead.programName)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Receiving store"><ReadOnlyValue>{lead.storeLocation ? storeLocationLabel(lead.storeLocation) : '—'}</ReadOnlyValue></FormKitField>
          <FormKitField label="Delivered by"><ReadOnlyValue>{value(lead.deliveredBy)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Received by"><ReadOnlyValue>{value(lead.receivedBy)}</ReadOnlyValue></FormKitField>
          <FormKitField label="Total"><TotalValue accent="emerald">{formatETB(total)}</TotalValue></FormKitField>
        </FieldGrid>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-xs" aria-label="Items on this Model 19">
            <thead className="bg-slate-100 text-left text-[11px] text-slate-600">
              <tr>
                <th className="px-3 py-1.5 font-normal">Item</th>
                <th className="px-3 py-1.5 font-normal text-right">Qty</th>
                <th className="px-3 py-1.5 font-normal text-right">Unit price</th>
                <th className="px-3 py-1.5 font-normal text-right">Total</th>
                <th className="px-3 py-1.5 font-normal">Status</th>
                <th className="px-3 py-1.5 font-normal">Held by / where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.item.id}
                  tabIndex={0}
                  aria-label={`Open ${r.item.itemCode}`}
                  onClick={() => onOpenItem(r.item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenItem(r.item.id);
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                >
                  <td className="px-3 py-2">
                    <span className="block text-slate-900">{r.item.name}</span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-500">{r.item.itemCode}</span>
                      <ItemTypeBadge type={r.item.itemType} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {r.item.balance?.total || r.units} {(r.item.uom || 'EA').toLowerCase()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatETB(r.item.unitCostETB)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatETB(slipLineTotal(r.item))}</td>
                  <td className="px-3 py-2"><AssetStatus row={r} /></td>
                  <td className="px-3 py-2 text-slate-700">{r.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <FileText className="h-3.5 w-3.5" /> Open an item to issue, transfer or view its record.
        </p>
      </div>
      )}

      {viewingSlip && slipUrl && <SlipViewerModal url={slipUrl} onClose={() => setViewingSlip(false)} />}
    </section>
  );
};
