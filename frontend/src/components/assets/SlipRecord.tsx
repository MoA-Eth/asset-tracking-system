import React, { useState } from 'react';
import { Copy, FileText, PackageMinus, Paperclip, Printer, Send } from 'lucide-react';
import { btn, pill, statusTone } from '../ui/theme';
import { CloseButton } from '../ui/CloseButton';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { FieldGrid, Field as FormKitField, ReadOnlyValue, TotalValue } from '../ui/FormKit';
import { ItemWithRelations } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { storeLocationLabel } from '../../utils/location';
import { getSlipDisplayName } from '../../utils/slip-upload';
import { AssetRow, AssetState, AssetStatus, ItemTypeBadge, requestLabel } from './asset-state';

/** What a line of a receipt cost, as on its Model 19 (VAT or other charges included) */
export const slipLineTotal = (item: ItemWithRelations): number => {
  if (item.provisionType === 'DONATION') return 0;
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
const standings = (rows: AssetRow[]) => {
  const groups = new Map<string, { key: string; label: string; word: string; tone: string; n: number }>();
  for (const r of rows) {
    // A request returned for correction is with its requester, whatever kind it is
    const returned = r.request?.status === 'RETURNED' ? 'Returned for correction' : undefined;
    const pending = returned ?? (r.state === 'REQUEST_PENDING' && r.request ? requestLabel(r.request.transactionType, r.request.requestDetails).pending : undefined);
    const key = returned ? 'RETURNED' : pending ? `REQUEST:${pending}` : r.state;
    const g = groups.get(key) ?? {
      key,
      label: pending ?? STATE_BADGES[r.state].label,
      word: pending ? pending.toLowerCase() : STATE_WORDS[r.state],
      tone: STATE_BADGES[r.state].tone,
      n: 0,
    };
    groups.set(key, { ...g, n: g.n + 1 });
  }
  return [...groups.values()];
};

/** "2 in store · 1 issued": where the items of a receipt stand */
export const slipStatusSummary = (rows: AssetRow[]): string => standings(rows).map(({ word, n }) => `${n} ${word}`).join(' · ');

/**
 * The status of a Model 19 of several items, as badges: one normal badge when all its items stand the same way,
 * otherwise one badge per state with how many items are in it ("2 In store", "1 Issue pending").
 */
export const SlipStatus: React.FC<{ rows: AssetRow[] }> = ({ rows }) => {
  const list = standings(rows);
  // All the same: the badge of one item; a rejected receipt keeps its reason, other states don't show an older rejection
  if (list.length === 1) return <AssetStatus row={{ ...rows[0], rejected: rows[0].state === 'REJECTED' ? rows[0].rejected : undefined }} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={slipStatusSummary(rows)}>
      {list.map(({ key, label, tone, n }) => (
        <span key={key} className={`${pill} ${tone}`}>
          {n} {label}
        </span>
      ))}
    </span>
  );
};

export interface SlipRecordProps {
  /** The registrations received on this Model 19 (one per line), in slip order */
  rows: AssetRow[];
  onOpenItem: (itemId: string) => void;
  onPrint: () => void;
  /** Opens a new receipt with every item of this one; absent when this person can't receive */
  onDuplicate?: () => void;
  /** Opens a Model 22 with this receipt's items still in store; absent when none is, or this person can't issue */
  onIssue?: () => void;
  /** Sends this receipt, returned for correction, back to the Team Leader; absent when it isn't returned or this person can't */
  onResubmit?: () => void;
  /** A form open on this receipt (the Model 22 issuing its items), shown in place of the details */
  form?: React.ReactNode;
  onClose: () => void;
}

/**
 * A Model 19 receipt of several items, opened from its one row in the register: what the slip says, its total and
 * scanned copy, and its items, each opening its own record (where it is issued, transferred, corrected…).
 */
export const SlipRecord: React.FC<SlipRecordProps> = ({ rows, onOpenItem, onPrint, onDuplicate, onIssue, onResubmit, form, onClose }) => {
  const [viewingSlip, setViewingSlip] = useState(false);
  const lead = rows[0].item;
  const total = rows.reduce((sum, r) => sum + slipLineTotal(r.item), 0);
  const slipUrl = rows.find((r) => r.item.ifmisSlipAttachmentUrl)?.item.ifmisSlipAttachmentUrl;
  const value = (v?: string | null) => v?.trim() || '—';

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
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold text-slate-900">Model 19 #{lead.ifmisSlipNumber}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{rows.length} items{lead.poNumber ? ` · PO ${lead.poNumber}` : ''}</span>
              <SlipStatus rows={rows} />
            </div>
          </div>
          {/* While a form is open, its own Submit and Cancel replace these */}
          {!form && (
          <div role="toolbar" aria-label="Receipt actions" className="flex flex-wrap items-center gap-2">
            {onResubmit && (
              <button type="button" onClick={onResubmit} className={btn.primary} title="Correct its items first: open each from the list below">
                <Send className="h-3.5 w-3.5" /> Resubmit Model 19
              </button>
            )}
            {onIssue && (
              <button type="button" onClick={onIssue} className={btn.primary}>
                <PackageMinus className="h-3.5 w-3.5" /> Issue (Model 22)
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
          <FileText className="h-3.5 w-3.5" /> Open an item to issue, transfer or correct it on its own.
        </p>
      </div>
      )}

      {viewingSlip && slipUrl && <SlipViewerModal url={slipUrl} onClose={() => setViewingSlip(false)} />}
    </section>
  );
};
