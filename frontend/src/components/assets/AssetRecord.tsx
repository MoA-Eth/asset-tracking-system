import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Clock, Copy, Lock, MapPin, Paperclip, Printer, Tag, Users, X, FileText, PackagePlus, Upload, AlertCircle } from 'lucide-react';
import { btn, statusTone, pill } from '../ui/theme';
import { CloseButton } from '../ui/CloseButton';
import { BackButton } from '../ui/BackButton';
import { Row } from '../ui/RecordDetailModal';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { RowAction } from '../ui/RowActionsMenu';
import { HeaderActionButton } from '../ui/HeaderActionButton';
import { FormSection, FieldGrid, Field as FormKitField, ReadOnlyValue, TotalValue, FormNotice } from '../ui/FormKit';
import { ApprovalStatus, ItemStatus, TransactionApproval } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { valueOf } from '../../utils/item-cost';
import { isGeneratedSerialNumber, displaySerialNumber } from '../../utils/asset-tag';
import { storeLocationLabel } from '../../utils/location';
import { departmentLabel, isUnassignedDepartment } from '../../utils/department';
import { AssetRow, AssetStatus, categoryLabel, requestLabel, RejectionNote, stageLabel, shortDate, recipientOf } from './asset-state';

export interface AssetRecordProps {
  row: AssetRow;
  /** For a batch, the records of the units issued from it */
  units: AssetRow[];
  /** For an issued unit, the batch it came from */
  batch?: AssetRow;
  /** Batch totals: some units out, the rest in store */
  partly: boolean;
  totals?: { total: number; issued: number; inStore: number; requested?: number };
  /** Every request on this record, newest first */
  requests: TransactionApproval[];
  /** What can be done now (Issue, Transfer, Return, Edit…); the print actions go in their own group */
  actions: RowAction[];
  /** Form shown in place of the details while a request is being made or the pending receipt or request corrected; it has its own Submit and Cancel at the bottom */
  editForm?: React.ReactNode;
  /** Actions of the open form, as buttons at the top right of the header */
  formActions?: RowAction[];
  /** Prints a request's voucher, from the list of requests on the record */
  onPrintRequest: (request: TransactionApproval) => void;
  onSelect: (itemId: string) => void;
  onClose: () => void;
  /** Cancels the currently open form (issue, transfer, disposal, edit) to return to the record */
  onCancelForm?: () => void;
  /** Where this record sits in the list, and the way to the one before and after it */
  position?: { index: number; total: number };
  onPrevious?: () => void;
  onNext?: () => void;
  /** The Model 19 this record was opened from, to go back to it */
  backTo?: { label: string; onClick: () => void };
  /** Records the fixed asset's IFMIS tag number; absent when this person can't */
  onSaveIfmisTag?: (tag: string) => Promise<void>;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const CopyButton: React.FC<{ text: string; label?: string; className?: string }> = ({
  text,
  label = 'Copy',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied to clipboard!' : `${label} (${text})`}
      aria-label={copied ? 'Copied' : label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200/80 hover:text-slate-800 transition cursor-pointer ${className}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
      {copied && <span className="text-[10px] font-bold text-emerald-700">Copied</span>}
    </button>
  );
};

const RequestStatus: React.FC<{ request: TransactionApproval }> = ({ request }) =>
  request.status === ApprovalStatus.PENDING ? (
    <span className={`${pill} ${statusTone.pending}`}>
      <Clock className="h-3 w-3" />
      {stageLabel(request, 'Pending')}
    </span>
  ) : (
    <span className={`${pill} ${request.status === ApprovalStatus.APPROVED ? statusTone.approved : statusTone.rejected}`}>
      {request.status === ApprovalStatus.APPROVED ? 'Approved' : request.status === ApprovalStatus.CANCELLED ? 'Cancelled' : 'Rejected'}
    </span>
  );

/**
 * A fixed asset's tag number in IFMIS (e.g. MOA-016341). The receipt doesn't carry it; it is recorded here, or when a
 * Model 21 or disposal form first names it, and those forms then find the asset by it.
 */
const IfmisTagField: React.FC<{ tag?: string; onSave?: (tag: string) => Promise<void> }> = ({ tag, onSave }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (draft === null || !onSave) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
      setDraft(null);
    } catch {
      // The page says what went wrong; the typed tag stays to be corrected
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormKitField label="IFMIS tag number" optional hint={draft === null ? 'As IFMIS prints it on the Model 21 and disposal form' : 'Leave empty to remove it'}>
      {draft === null ? (
        <div className="relative flex items-center w-full">
          <ReadOnlyValue mono className={tag || onSave ? 'pr-16' : ''}>{tag || '—'}</ReadOnlyValue>
          <div className="absolute right-1.5 flex items-center gap-1">
            {tag && <CopyButton text={tag} label="Copy IFMIS tag number" />}
            {onSave && (
              <button type="button" onClick={() => setDraft(tag ?? '')} className="rounded px-1.5 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                {tag ? 'Change' : 'Add'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            id="ifmis-tag-number"
            aria-label="IFMIS tag number"
            autoFocus
            value={draft}
            placeholder="e.g. MOA-016341"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); }
            }}
            className="min-w-0 flex-1 rounded-[3px] border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-100"
          />
          <button type="button" onClick={save} disabled={saving} className={btn.row}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setDraft(null)} disabled={saving} className={btn.row}>Cancel</button>
        </div>
      )}
    </FormKitField>
  );
};

/**
 * One asset record, opened from the register:
 * Matches the Receive Items form layout (FormSections, no tabs), with status-based field locking.
 */
export const AssetRecord: React.FC<AssetRecordProps> = ({
  row,
  units,
  batch,
  partly,
  totals,
  requests,
  actions,
  editForm,
  formActions,
  onPrintRequest,
  onSelect,
  onClose,
  onCancelForm,
  position,
  onPrevious,
  onNext,
  onSaveIfmisTag,
  backTo,
}) => {
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const { item } = row;
  const uom = (item.uom || 'EA').toLowerCase();
  const editing = !!editForm;

  const steps = actions.filter((a) => !a.hidden && !a.label.startsWith('Print'));
  const pending = row.request;
  // An approved record in store or issued: nothing on it can be typed over, only acted on
  const locked = row.state === 'IN_STORE' || row.state === 'ISSUED';

  return (
    <section
      aria-label={`Asset record ${item.itemCode}`}
      className="rounded-xl flex min-w-0 flex-1 flex-col overflow-hidden bg-white min-h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-4.5rem)] lg:sticky lg:top-2 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]"
    >
      {/* ── Title and toolbar ── */}
      <header className="shrink-0 relative space-y-2 border-b border-slate-200 px-5 py-4 bg-white z-10">
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {editing && formActions?.map((a) => <HeaderActionButton key={a.label} action={a} />)}
          {/* Moving to another asset is for reading; a form being filled stays put */}
          {!editing && position && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!onPrevious}
                aria-label="Previous asset"
                title="Previous asset (↑)"
                className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[3.5rem] text-center font-medium tabular-nums">{position.index + 1} of {position.total}</span>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next asset"
                title="Next asset (↓)"
                className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <CloseButton onClose={onClose} label="Close record" title="Back to assets (Esc)" />
        </div>
        <div className={`flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between ${editing && formActions?.length ? 'pr-32 lg:pr-40' : !editing && position ? 'pr-44' : 'pr-8'}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            {editing && (
              <BackButton
                onBack={onCancelForm || onClose}
                label="Back to asset record"
                title="Back to asset record"
              />
            )}
            <div className="min-w-0">
              {backTo && (
                <button
                  type="button"
                  onClick={backTo.onClick}
                  className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                >
                  <ChevronLeft className="h-3 w-3" /> {backTo.label}
                </button>
              )}
              <h3 className="truncate text-base font-extrabold text-slate-900" title={item.name}>{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-700 bg-slate-100 pl-2 pr-1 py-0.5 rounded-md border border-slate-200">
                {item.itemCode}
                <CopyButton text={item.itemCode} label="Copy item code" />
              </span>
              {/* Quick Action Badges */}
              <AssetStatus row={{ ...row, rejected: undefined }} partly={partly} />
              {!editing && locked && (
                <span className="inline-flex items-center text-slate-400" title="Approved record: its fields are locked" aria-label="Approved record, fields locked">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
              {/* While a form is open it shows these itself, so the header keeps only the name, code and status */}
              {!editing && item.category && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Tag className="w-2.5 h-2.5 text-emerald-600" />
                  {categoryLabel(item)}
                </span>
              )}
              {!editing && row.where && row.state !== 'DISPOSED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200" title={`Location / Custody: ${row.where}`}>
                  <MapPin className="w-2.5 h-2.5 text-blue-600" />
                  <span className="max-w-[160px] truncate">{row.where}</span>
                </span>
              )}
            </div>
          </div>
        </div>

          {/* While a form is open, its own Submit and Cancel at the bottom replace these */}
          {!editing && steps.length > 0 && (
          <div role="toolbar" aria-label="Asset actions" className="flex flex-wrap items-center gap-2 2xl:justify-end">
              <>
                {steps.map((a, i) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    disabled={a.disabled}
                    title={a.disabled ? a.reason : undefined}
                    className={`${i === 0 ? btn.primary : btn.secondary} disabled:opacity-60`}
                  >
                    {a.disabled ? <Lock className="h-4 w-4" /> : <a.icon className="h-4 w-4" />}
                    {a.label}
                  </button>
                ))}
              </>
          </div>
          )}
        </div>
        {/* Why each locked step is locked (several issues on one record can each be locked) */}
        {!editing &&
          [...new Set(steps.filter((a) => a.disabled && a.reason).map((a) => a.reason!))].map((reason) => (
            <p key={reason} className="text-[11px] text-slate-500">{reason}</p>
          ))}
      </header>

      {editing ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">{editForm}</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          {/* Status-based field locking notice */}
          {(() => {
            // Several issues waiting: each one, as it is
            if (row.state === 'REQUEST_PENDING' && (row.requests?.length ?? 0) > 1) {
              const open = row.requests!;
              const noun = requestLabel(open[0].transactionType, open[0].requestDetails).noun;
              return (
                <FormNotice icon={Clock} tone="info">
                  <span className="font-bold">{open.length} {noun} requests are waiting on this record</span>
                  <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
                    {open.map((r) => (
                      <li key={r.id}>
                        <span className="font-semibold">{requestLabel(r.transactionType, r.requestDetails).model} {r.ifmisSlipNumber}</span>
                        {r.requestDetails?.quantity ? ` · ${r.requestDetails.quantity} ${uom}` : ''}
                        {recipientOf(r) ? ` → ${recipientOf(r)}` : ''} · {stageLabel(r)}
                        {r.status === ApprovalStatus.REJECTED && r.returnRemarks ? `: ${r.returnRemarks}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Nothing leaves the store until each is approved; the first approved takes its units. Each can be corrected with its own Edit until the Team Leader endorses it.
                  </p>
                </FormNotice>
              );
            }
            if (row.request?.status === ApprovalStatus.REJECTED) {
              const r = row.request;
              const noun = requestLabel(r.transactionType, r.requestDetails).noun;
              const stage = r.returnedFromStage === 2 ? 'Department Head' : 'Team Leader';
              return (
                <FormNotice icon={Clock} tone="warn">
                  <span className="font-bold">
                    {capital(noun)} rejected{r.returnedBy ? ` by ${r.returnedBy.fullNameEn} (${stage})` : ''}{r.returnedAtGc ? ` · ${shortDate(r.returnedAtGc)}` : ''}
                  </span>
                  {r.returnRemarks && <p className="mt-0.5 text-[12px] text-amber-900">Reason: {r.returnRemarks}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Correct it with Edit and save: it goes back to the Team Leader (Resubmit, if nothing needs changing). If it shouldn't go ahead, cancel the request.
                  </p>
                </FormNotice>
              );
            }
            if (row.state === 'REQUEST_PENDING' && row.request) {
              const reqNoun = requestLabel(row.request.transactionType, row.request.requestDetails).noun;
              const isStage1 = (row.request.currentStage ?? 1) === 1;
              return (
                <FormNotice icon={isStage1 ? Clock : Lock} tone={isStage1 ? 'warn' : 'info'}>
                  <span className="font-bold">
                    {isStage1
                      ? `${capital(reqNoun)} request waiting for the Team Leader`
                      : `${capital(reqNoun)} request endorsed · waiting for the Department Head`}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {isStage1
                      ? `Until the Team Leader endorses it, the request (recipient, quantity, voucher) can be corrected with Edit. The item's own details stay as received.`
                      : 'The Team Leader has endorsed it, so it can no longer be changed. To correct it, ask an approver to reject it.'}
                  </p>
                </FormNotice>
              );
            }
            if (row.state === 'RECEIPT_PENDING') {
              const isStage1 = (row.request?.currentStage ?? 1) === 1;
              return (
                <FormNotice icon={isStage1 ? Clock : Lock} tone={isStage1 ? 'warn' : 'info'}>
                  <span className="font-bold">
                    {isStage1
                      ? 'Receipt waiting for the Team Leader'
                      : 'Receipt endorsed · waiting for the Department Head'}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {isStage1
                      ? 'Until the Team Leader endorses it, the receipt can be corrected with Edit.'
                      : 'The Team Leader has endorsed it, so it can no longer be changed. To correct it, ask an approver to reject it.'}
                  </p>
                </FormNotice>
              );
            }
            if (row.state === 'REJECTED') {
              return (
                <FormNotice icon={Lock} tone="warn">
                  <span className="font-bold">Rejected record · Archived</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row.rejected?.status === 'CANCELLED'
                      ? 'Its receipt was cancelled and is kept for audit history. Use Duplicate as new receipt to receive it again.'
                      : 'This record was rejected and is kept for audit history. Rejected batches and records cannot be edited: use Duplicate as new receipt to receive it again.'}
                  </p>
                </FormNotice>
              );
            }
            if (row.state === 'DISPOSED') {
              const d = row.lastDisposal;
              return (
                <FormNotice icon={Lock} tone="info">
                  <span className="font-bold">Disposed · Archived</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {d
                      ? `Disposed of${d.reviewedAtGc ? ` on ${shortDate(d.reviewedAtGc)}` : ''}${d.requestDetails?.reason ? `: ${d.requestDetails.reason}` : ''}${d.requestDetails?.recipientName ? ` (to ${d.requestDetails.recipientName})` : ''}. Kept for the record.`
                      : 'This asset was disposed of and is kept for the record.'}
                  </p>
                </FormNotice>
              );
            }
            // An approved record says so with the lock by its status
            return null;
          })()}

          {/* Section 1: Voucher & procurement */}
          <FormSection
            step={1}
            title="Voucher & procurement"
            subtitle="የሰነድ እና የግዥ መረጃ · IFMIS Model 19 header"
            icon={FileText}
            accent="emerald"
          >
            <FieldGrid>
              <FormKitField label="Model 19 No." optional>
                <div className="relative flex items-center w-full">
                  <ReadOnlyValue mono className={item.ifmisSlipNumber ? (item.ifmisSlipAttachmentUrl ? 'pr-16' : 'pr-9') : ''}>
                    {item.ifmisSlipNumber || '—'}
                  </ReadOnlyValue>
                  <div className="absolute right-1.5 flex items-center gap-0.5">
                    {item.ifmisSlipNumber && <CopyButton text={item.ifmisSlipNumber} label="Copy Model 19 number" />}
                    {item.ifmisSlipAttachmentUrl && (
                      <button
                        type="button"
                        onClick={() => setSlipUrl(item.ifmisSlipAttachmentUrl!)}
                        className="rounded p-1 text-emerald-700 hover:bg-emerald-50 cursor-pointer shrink-0"
                        aria-label="View scanned Model 19 slip"
                        title="View scanned Model 19 slip"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </FormKitField>

              {item.provisionType !== 'DONATION' && (
              <FormKitField label="PO number" optional>
                <div className="relative flex items-center w-full">
                  <ReadOnlyValue mono className={item.poNumber ? 'pr-9' : ''}>
                    {item.poNumber || '—'}
                  </ReadOnlyValue>
                  {item.poNumber && (
                    <div className="absolute right-1.5 flex items-center">
                      <CopyButton text={item.poNumber} label="Copy PO number" />
                    </div>
                  )}
                </div>
              </FormKitField>
              )}

              <FormKitField
                label="Received date (G.C.)"
                optional
                hint={item.ifmisSlipDateEc ? `${item.ifmisSlipDateEc} E.C.` : undefined}
              >
                <ReadOnlyValue mono>{item.ifmisSlipDateGc || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Transaction type" optional>
                <ReadOnlyValue>{item.transactionType || '—'}</ReadOnlyValue>
              </FormKitField>

              {item.provisionType !== 'DONATION' ? (
                <>
                  <FormKitField label="Source (supplier / vendor)" optional>
                    <ReadOnlyValue>{item.source || '—'}</ReadOnlyValue>
                  </FormKitField>

                  <FormKitField label="Buyer" optional>
                    <ReadOnlyValue>{item.buyer || '—'}</ReadOnlyValue>
                  </FormKitField>
                </>
              ) : (
                item.source && item.source !== '—' && (
                  <FormKitField label="Donor / Sponsoring organization" optional>
                    <ReadOnlyValue>{item.source}</ReadOnlyValue>
                  </FormKitField>
                )
              )}

              <FormKitField label="Program / project" optional>
                <ReadOnlyValue>{item.programName || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Receiving store" optional>
                <ReadOnlyValue>
                  {item.storeLocation ? storeLocationLabel(item.storeLocation) : '—'}
                </ReadOnlyValue>
              </FormKitField>
            </FieldGrid>
          </FormSection>

          {/* Section 2: Item particulars */}
          <FormSection
            step={2}
            title="Item particulars"
            subtitle="የእቃው ዝርዝር መረጃ · Line item details"
            icon={PackagePlus}
            accent="emerald"
          >
            <FieldGrid>
              <FormKitField label="Item description / Name" optional span="sm:col-span-2">
                <ReadOnlyValue>{item.name}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Category" optional>
                <ReadOnlyValue>{categoryLabel(item)}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Record code" optional>
                <ReadOnlyValue mono>{item.itemCode}</ReadOnlyValue>
              </FormKitField>

              {item.itemType !== 'CONSUMABLE' && <IfmisTagField key={item.id} tag={item.ifmisTagNumber} onSave={editing || row.state === 'REJECTED' || item.status === ItemStatus.REJECTED ? undefined : onSaveIfmisTag} />}

              {item.ifmisItemCode && (
                <FormKitField label="Item code">
                  <ReadOnlyValue mono>{item.ifmisItemCode}</ReadOnlyValue>
                </FormKitField>
              )}

              <FormKitField label="Serial number" optional>
                <div className="relative flex items-center w-full">
                  <ReadOnlyValue mono className={item.serialNumber && !isGeneratedSerialNumber(item.serialNumber) ? 'pr-9' : ''}>
                    {displaySerialNumber(item.serialNumber)}
                  </ReadOnlyValue>
                  {item.serialNumber && !isGeneratedSerialNumber(item.serialNumber) && (
                    <div className="absolute right-1.5 flex items-center">
                      <CopyButton text={item.serialNumber} label="Copy serial number" />
                    </div>
                  )}
                </div>
              </FormKitField>

              <FormKitField label="Quantity" optional>
                <ReadOnlyValue mono>
                  {totals ? `${totals.total} ${uom} received` : `${row.units} ${uom}`}
                </ReadOnlyValue>
              </FormKitField>

              {(() => {
                const totalUnits = totals ? totals.total : row.units;
                const baseTotal = (item.unitCostETB || 0) * (totalUnits || 1);
                const isVat = Boolean(item.vatApplicable) || (!!item.totalAmount && Math.abs(Number(item.totalAmount) - Math.round(baseTotal * 1.15 * 100) / 100) < 0.05);
                const vatAmount = isVat ? Math.round(baseTotal * 0.15 * 100) / 100 : 0;
                const addlCharges = isVat ? 0 : Number(item.additionalCharges) || 0;
                const computedTotal = baseTotal + (isVat ? vatAmount : addlCharges);
                // A batch: every unit it received at what a unit cost (VAT and charges in, the charges counted once)
                const displayTotal = (item.totalAmount !== undefined && Number(item.totalAmount) > 0 && !totals)
                  ? Number(item.totalAmount)
                  : totals ? valueOf(item, totalUnits) : computedTotal;

                const inStoreRatio = totalUnits > 0 ? (totals ? totals.inStore : (row.state === 'IN_STORE' ? row.units : 0)) / totalUnits : 1;
                const inStoreValuation = displayTotal * inStoreRatio;
                const issuedValuation = displayTotal * (1 - inStoreRatio);

                const totalValuationHint = totals && totals.issued > 0
                  ? `${formatETB(inStoreValuation)} in store · ${formatETB(issuedValuation)} issued${isVat ? ' · includes 15% VAT' : ''}`
                  : isVat
                    ? `Includes 15% VAT (${formatETB(vatAmount)})`
                    : addlCharges > 0
                      ? `Includes additional charges (${formatETB(addlCharges)})`
                      : undefined;

                return (
                  <>
                    <FormKitField label="Unit price" optional>
                      <ReadOnlyValue mono>{formatETB(item.unitCostETB)}</ReadOnlyValue>
                    </FormKitField>

                    {isVat && (
                      <FormKitField label="VAT (15%)" optional>
                        <ReadOnlyValue mono>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{formatETB(vatAmount)}</span>
                            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              15% applied
                            </span>
                          </span>
                        </ReadOnlyValue>
                      </FormKitField>
                    )}

                    {!isVat && addlCharges > 0 && (
                      <FormKitField label="Additional charges" optional>
                        <ReadOnlyValue mono>{formatETB(addlCharges)}</ReadOnlyValue>
                      </FormKitField>
                    )}

                    <FormKitField
                      label="Total valuation"
                      hint={totalValuationHint}
                    >
                      <TotalValue accent="emerald">
                        {formatETB(displayTotal)}
                      </TotalValue>
                    </FormKitField>
                  </>
                );
              })()}

              {item.lotBatchNo && (
                <FormKitField label="Lot / batch no." optional>
                  <ReadOnlyValue mono>{item.lotBatchNo}</ReadOnlyValue>
                </FormKitField>
              )}

              {item.subInventory && (
                <FormKitField label="Sub inventory" optional>
                  <ReadOnlyValue>{item.subInventory}</ReadOnlyValue>
                </FormKitField>
              )}

              {item.remark && (
                <FormKitField label={item.provisionType === 'DONATION' ? "Full asset description / technical specifications" : "Remark / notes"} optional span={item.lotBatchNo && item.subInventory ? undefined : 'sm:col-span-2'}>
                  <ReadOnlyValue>{item.remark}</ReadOnlyValue>
                </FormKitField>
              )}
            </FieldGrid>
          </FormSection>

          {/* Section 3: Signatures & document scan */}
          <FormSection
            step={3}
            title="Signatures & document scan"
            subtitle="ፊርማ እና አባሪ ሰነድ · Model 19 verification"
            icon={Upload}
            accent="emerald"
          >
            <FieldGrid>
              {item.deliveredBy && (
                <FormKitField label="Delivered by" optional>
                  <ReadOnlyValue>{item.deliveredBy}</ReadOnlyValue>
                </FormKitField>
              )}
              {item.receivedBy && (
                <FormKitField label="Received by" optional>
                  <ReadOnlyValue>{item.receivedBy}</ReadOnlyValue>
                </FormKitField>
              )}
              {item.registeredBy && (
                <FormKitField label="Registered by" optional>
                  <ReadOnlyValue>{item.registeredBy.fullNameEn}</ReadOnlyValue>
                </FormKitField>
              )}
              {item.ifmisSlipAttachmentUrl && (
                <FormKitField label="Scanned IFMIS Model 19 slip" span="sm:col-span-2">
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-mono text-slate-700 truncate">{item.ifmisSlipNumber}_slip.pdf</span>
                    <button
                      type="button"
                      onClick={() => setSlipUrl(item.ifmisSlipAttachmentUrl!)}
                      className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline cursor-pointer ml-2 shrink-0"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> View slip
                    </button>
                  </div>
                </FormKitField>
              )}
            </FieldGrid>
          </FormSection>

          {/* Section 4: Custody & location */}
          <FormSection
            step={4}
            title="Custody & location"
            subtitle="የይዞታ እና የስምሪት ሁኔታ · Current allocation"
            icon={Users}
            accent="emerald"
          >
            <div className="space-y-3">
              {totals && (
                <div className={`grid gap-2 text-center ${totals.requested ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {[
                    ['Received', totals.total],
                    ['Issued', totals.issued],
                    ['In store', totals.inStore],
                    // On a pending issue or disposal: part of "in store" until the last approver approves
                    ...(totals.requested ? [['Requested', totals.requested]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="font-mono text-lg font-extrabold text-slate-900">{value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Row label={row.state === 'ISSUED' || item.currentCustodian ? 'Held by' : 'Kept in'}>{row.where}</Row>
                {row.state === 'IN_STORE' && row.daysInStore !== undefined && (
                  <Row label="Time in store">{row.daysInStore === 1 ? '1 day' : `${row.daysInStore} days`}</Row>
                )}
                {item.currentCustodian?.payrollId && <Row label="Payroll ID" mono>{item.currentCustodian.payrollId}</Row>}
                {item.heldByContact && <Row label="Contact person">{item.heldByContact}</Row>}
                {item.heldByOrganization && (
                  <p className="pt-1 text-[11px] text-slate-500">
                    Issued to an outside organization. Return and transfer aren't available for it yet.
                  </p>
                )}
                {item.assignedDepartment && (
                  <div>
                    <Row label="Directorate">{departmentLabel(item.assignedDepartment)}</Row>
                    {isUnassignedDepartment(item.assignedDepartment) && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-800">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                        Directorate is unassigned. Go to Settings → Employees to assign their directorate.
                      </p>
                    )}
                  </div>
                )}
                {batch && (
                  <Row label="Part of">
                    <button type="button" onClick={() => onSelect(batch.item.id)} className="font-mono font-bold text-emerald-800 hover:underline cursor-pointer">
                      {batch.item.itemCode}
                    </button>
                  </Row>
                )}
              </div>
              {pending && (row.requests?.length ?? 0) > 1 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs space-y-0.5">
                  {row.requests!.map((r) => (
                    <p key={r.id}>
                      <span className="font-semibold">{requestLabel(r.transactionType, r.requestDetails).pending} · {stageLabel(r, 'waiting')}</span>
                      {recipientOf(r) ? ` → ${recipientOf(r)}` : ''}
                      {r.requestDetails?.quantity ? ` · ${r.requestDetails.quantity} ${uom}` : ''}
                    </p>
                  ))}
                </div>
              )}
              {pending && (row.requests?.length ?? 0) <= 1 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
                  <p className="font-semibold">
                    {requestLabel(pending.transactionType, pending.requestDetails).pending} · {stageLabel(pending, 'waiting')}
                  </p>
                  {row.goingTo && <p>→ {row.goingTo}</p>}
                </div>
              )}
              {row.rejected && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs">
                  <RejectionNote request={row.rejected} />
                </div>
              )}
              {units.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Units & split records from this batch</p>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-xs">
                    {units.map((u) => (
                      <li key={u.item.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(u.item.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50 cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block font-mono font-bold text-slate-800">{u.item.itemCode}</span>
                            <span className="block truncate text-slate-600">{u.where}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-slate-700">
                              {u.units} {(u.item.uom || 'EA').toLowerCase()}
                            </span>
                            <AssetStatus row={u} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </FormSection>

          {/* Section 5: Transaction requests */}
          <FormSection
            step={5}
            title="Transaction requests"
            subtitle="የጥያቄዎች እና እንቅስቃሴዎች ታሪክ · Activity log"
            icon={Clock}
            accent="emerald"
          >
            {requests.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">No requests on this record.</p>
            ) : (
              <ol className="divide-y divide-slate-100 text-xs">
                {requests.map((r) => {
                  const kind = requestLabel(r.transactionType, r.requestDetails);
                  const to =
                    r.transactionType === 'STOCK_OUT' || r.transactionType === 'TRANSFER'
                      ? r.recipientEmployee?.fullNameEn || r.requestDetails?.organizationName
                      : r.transactionType === 'RETURN'
                        ? [
                            // The store it goes back to: its own, unless the return names another
                            r.targetLocationId && r.targetLocationId !== item.storeLocationId ? 'another store' : item.storeLocation ? storeLocationLabel(item.storeLocation) : 'store',
                            r.requestDetails?.storeRecipientName ? `received by ${r.requestDetails.storeRecipientName}` : '',
                          ].filter(Boolean).join(' · ')
                        : r.transactionType === 'DISPOSAL'
                          ? r.requestDetails?.recipientName || 'Disposal'
                          : undefined;
                  return (
                    <li key={r.id} className="space-y-1 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {capital(kind?.noun ?? 'request')} · <span className="font-mono">{r.ifmisSlipNumber}</span>
                        </span>
                        <RequestStatus request={r} />
                      </div>
                      <p className="text-slate-600">
                        {shortDate(r.createdAtGc)}
                        {to ? ` · to ${to}` : ''}
                        {r.requestDetails?.quantity ? ` · ${r.requestDetails.quantity} ${uom}` : ''}
                      </p>
                      {r.status === ApprovalStatus.REJECTED && r.reviewRemarks && <p className="text-red-700">Reason: {r.reviewRemarks}</p>}
                      {r.returnRemarks && (
                        <p className="text-amber-800">
                          {r.status === ApprovalStatus.REJECTED ? 'Rejected, to correct' : `Rejected earlier${(r.returnCount ?? 0) > 1 ? ` (${r.returnCount} times)` : ''}`}: {r.returnRemarks}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onPrintRequest(r)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                      >
                        <Printer className="h-3 w-3" /> Print {kind?.model ?? 'voucher'}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </FormSection>
        </div>
      )}

      {slipUrl && <SlipViewerModal url={slipUrl} onClose={() => setSlipUrl(null)} />}
    </section>
  );
};
