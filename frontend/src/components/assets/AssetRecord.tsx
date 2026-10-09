import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, Lock, MapPin, Paperclip, Printer, Tag, Users, X, FileText, PackagePlus, Upload } from 'lucide-react';
import { btn, statusTone, pill } from '../ui/theme';
import { CloseButton } from '../ui/CloseButton';
import { Row } from '../ui/RecordDetailModal';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { RowAction } from '../ui/RowActionsMenu';
import { FormSection, FieldGrid, Field as FormKitField, ReadOnlyValue, TotalValue, FormNotice } from '../ui/FormKit';
import { ApprovalStatus, TransactionApproval } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { storeLocationLabel } from '../../utils/location';
import { departmentLabel } from '../../utils/department';
import { AssetRow, AssetStatus, REQUEST_LABELS, RejectionNote, STAGE_LABELS, shortDate } from './asset-state';

export interface AssetRecordProps {
  row: AssetRow;
  /** For a batch, the records of the units issued from it */
  units: AssetRow[];
  /** For an issued unit, the batch it came from */
  batch?: AssetRow;
  /** Batch totals: some units out, the rest in store */
  partly: boolean;
  totals?: { total: number; issued: number; inStore: number };
  /** Every request on this record, newest first */
  requests: TransactionApproval[];
  /** What can be done now (Issue, Transfer, Return, Edit…); the print actions go in their own group */
  actions: RowAction[];
  /** Form shown in place of the details while a request is being made or the pending receipt or request corrected; it has its own Submit and Cancel at the bottom */
  editForm?: React.ReactNode;
  onPrintRequest: (request: TransactionApproval) => void;
  onPrintReceipt: () => void;
  onSelect: (itemId: string) => void;
  onClose: () => void;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A printer icon: prints the record's voucher, or lists its vouchers when it has more than one */
const PrintButton: React.FC<{ prints: RowAction[] }> = ({ prints }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const single = prints.length === 1;
  const label = single ? prints[0].label : 'Print a voucher';
  return (
    <span ref={ref} className="relative sm:ml-auto 2xl:ml-2">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        onClick={() => (single ? prints[0].onClick?.() : setOpen((o) => !o))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-emerald-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer"
      >
        <Printer className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Print a voucher" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {prints.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onClick?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-emerald-50 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-emerald-700" />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

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
      {STAGE_LABELS[request.currentStage] ?? 'Pending'}
    </span>
  ) : (
    <span className={`${pill} ${request.status === ApprovalStatus.APPROVED ? statusTone.approved : statusTone.rejected}`}>
      {request.status === ApprovalStatus.APPROVED ? 'Approved' : 'Rejected'}
    </span>
  );

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
  onPrintRequest,
  onPrintReceipt,
  onSelect,
  onClose,
}) => {
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const { item } = row;
  const uom = item.uom || 'EA';
  const editing = !!editForm;

  const prints = actions.filter((a) => !a.hidden && a.label.startsWith('Print'));
  const steps = actions.filter((a) => !a.hidden && !a.label.startsWith('Print'));
  const pending = row.request;
  const approved = row.state !== 'RECEIPT_PENDING' && row.state !== 'REJECTED';

  return (
    <section
      aria-label={`Asset record ${item.itemCode}`}
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:h-[calc(100vh-10rem)] lg:sticky lg:top-4"
    >
      {/* ── Title and toolbar ── */}
      <header className="shrink-0 relative space-y-2 border-b border-slate-200 px-5 py-4 bg-white z-10">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer lg:hidden">
          <ArrowLeft className="h-3 w-3" /> All assets
        </button>
        <CloseButton
          onClose={onClose}
          label="Close record"
          title="Close (Esc)"
          className="absolute right-3 top-3 hidden lg:inline-flex"
        />
        <div className="flex flex-col gap-3 lg:pr-8 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold text-slate-900" title={item.name}>{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-700 bg-slate-100 pl-2 pr-1 py-0.5 rounded-md border border-slate-200">
                {item.itemCode}
                <CopyButton text={item.itemCode} label="Copy item code" />
              </span>
              {/* Quick Action Badges */}
              <AssetStatus row={{ ...row, rejected: undefined }} partly={partly} />
              {item.category && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Tag className="w-2.5 h-2.5 text-emerald-600" />
                  {item.itemCategoryDisplay || item.category.replace(/_/g, ' ')}
                </span>
              )}
              {item.condition && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {item.condition.replace(/_/g, ' ')}
                </span>
              )}
              {row.where && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200" title={`Location / Custody: ${row.where}`}>
                  <MapPin className="w-2.5 h-2.5 text-blue-600" />
                  <span className="max-w-[160px] truncate">{row.where}</span>
                </span>
              )}
            </div>
          </div>

          {/* While a form is open, its own Submit and Cancel at the bottom replace these */}
          {!editing && (
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
                {prints.length > 0 && <PrintButton prints={prints} />}
              </>
          </div>
          )}
        </div>
        {!editing && steps.some((a) => a.disabled) && (
          <p className="text-[11px] text-slate-500">{steps.find((a) => a.disabled)?.reason}</p>
        )}
      </header>

      {editing ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">{editForm}</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          {/* Status-based field locking notice */}
          {(() => {
            if (row.state === 'REQUEST_PENDING' && row.request) {
              const reqNoun = REQUEST_LABELS[row.request.transactionType]?.noun || 'request';
              const isStage1 = (row.request.currentStage ?? 1) === 1;
              return (
                <FormNotice icon={isStage1 ? Clock : Lock} tone={isStage1 ? 'warn' : 'info'}>
                  <span className="font-bold">
                    {isStage1
                      ? `${capital(reqNoun)} request pending endorsement · Editable in correction mode`
                      : `${capital(reqNoun)} request endorsed · Awaiting Dept. Head approval`}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {isStage1
                      ? `The ${reqNoun} request (recipient, quantity, slip) can be corrected with the Edit button until the Team Leader endorses it. Inventory master fields are fixed.`
                      : 'Endorsed by Team Leader — changes are locked while awaiting final Department Head approval.'}
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
                      ? 'Receipt pending endorsement · Editable in correction mode'
                      : 'Receipt endorsed · Awaiting Dept. Head approval'}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {isStage1
                      ? 'The receipt can be corrected until the Team Leader endorses it.'
                      : 'Endorsed by Team Leader — changes are locked while awaiting final Department Head approval.'}
                  </p>
                </FormNotice>
              );
            }
            if (row.state === 'REJECTED') {
              return (
                <FormNotice icon={Lock} tone="warn">
                  <span className="font-bold">Rejected record · Archived</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    This receipt was rejected and is kept for the record.
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
            return (
              <FormNotice icon={Lock} tone="info">
                <span className="font-bold">Approved inventory record · Form fields locked</span>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Approved records are locked. To issue, transfer, or return this asset, use the action buttons in the toolbar.
                </p>
              </FormNotice>
            );
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
              <FormKitField label="Model 19 No." required>
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

              <FormKitField
                label="Received date (G.C.)"
                required
                hint={item.ifmisSlipDateEc ? `${item.ifmisSlipDateEc} E.C.` : undefined}
              >
                <ReadOnlyValue mono>{item.ifmisSlipDateGc || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Transaction type" required>
                <ReadOnlyValue>{item.transactionType || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Source (supplier / vendor)" required>
                <ReadOnlyValue>{item.source || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Buyer / procurement officer" optional>
                <ReadOnlyValue>{item.buyer || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Program / project" optional>
                <ReadOnlyValue>{item.programName || '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Receiving store" required>
                <ReadOnlyValue>
                  {item.storeLocation?.siteName || (item.storeLocation ? storeLocationLabel(item.storeLocation).split(' · ')[0] : '—')}
                </ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Location in store" required>
                <ReadOnlyValue>
                  {item.storeLocation?.roomNumber || (item.storeLocation ? storeLocationLabel(item.storeLocation).split(' · ')[1] || storeLocationLabel(item.storeLocation) : '—')}
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
              <FormKitField label="Item description / Name" required span="sm:col-span-2">
                <ReadOnlyValue>{item.name}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Category" required>
                <ReadOnlyValue>{item.itemCategoryDisplay || item.category?.replace(/_/g, ' ')}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Item code" required>
                <ReadOnlyValue mono>{item.itemCode}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Serial number" optional>
                <div className="relative flex items-center w-full">
                  <ReadOnlyValue mono className={item.serialNumber ? 'pr-9' : ''}>
                    {item.serialNumber || '—'}
                  </ReadOnlyValue>
                  {item.serialNumber && (
                    <div className="absolute right-1.5 flex items-center">
                      <CopyButton text={item.serialNumber} label="Copy serial number" />
                    </div>
                  )}
                </div>
              </FormKitField>

              <FormKitField label="Physical condition">
                <ReadOnlyValue>{item.condition ? item.condition.replace(/_/g, ' ') : '—'}</ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Quantity" required>
                <ReadOnlyValue mono>
                  {totals ? `${totals.total} ${uom} received` : `${row.units} ${uom}`}
                </ReadOnlyValue>
              </FormKitField>

              <FormKitField label="Unit price" required>
                <ReadOnlyValue mono>{formatETB(item.unitCostETB)}</ReadOnlyValue>
              </FormKitField>

              <FormKitField
                label="Total valuation"
                hint={
                  totals && totals.issued > 0
                    ? `${formatETB((item.unitCostETB || 0) * totals.inStore)} in store · ${formatETB((item.unitCostETB || 0) * totals.issued)} issued`
                    : undefined
                }
              >
                <TotalValue accent="emerald">
                  {formatETB((item.unitCostETB || 0) * (totals?.total ?? row.units))}
                </TotalValue>
              </FormKitField>

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
                <FormKitField label="Remark / notes" optional span={item.lotBatchNo && item.subInventory ? undefined : 'sm:col-span-2'}>
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
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
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

          {/* Section 4: Custody & Location */}
          <FormSection
            step={4}
            title="Custody & Location"
            subtitle="የይዞታ እና የስምሪት ሁኔታ · Current allocation"
            icon={Users}
            accent="emerald"
          >
            <div className="space-y-3">
              {totals && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Received', totals.total],
                    ['Issued', totals.issued],
                    ['In store', totals.inStore],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="font-mono text-lg font-black text-slate-900">{value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Row label={row.state === 'ISSUED' || item.currentCustodian ? 'Held by' : 'Kept in'}>{row.where}</Row>
                {item.currentCustodian?.payrollId && <Row label="Payroll ID" mono>{item.currentCustodian.payrollId}</Row>}
                {item.heldByContact && <Row label="Contact person">{item.heldByContact}</Row>}
                {item.heldByOrganization && (
                  <p className="pt-1 text-[11px] text-slate-500">
                    Issued to an outside organization. Return and transfer aren't available for it yet.
                  </p>
                )}
                {item.assignedDepartment && <Row label="Directorate">{departmentLabel(item.assignedDepartment)}</Row>}
                {batch && (
                  <Row label="Part of">
                    <button type="button" onClick={() => onSelect(batch.item.id)} className="font-mono font-bold text-emerald-800 hover:underline cursor-pointer">
                      {batch.item.itemCode}
                    </button>
                  </Row>
                )}
              </div>
              {pending && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
                  <p className="font-semibold">
                    {REQUEST_LABELS[pending.transactionType]?.pending ?? 'Request pending'} · {STAGE_LABELS[pending.currentStage] ?? 'waiting'}
                  </p>
                  {row.goingTo && <p>→ {row.goingTo}</p>}
                </div>
              )}
              {row.rejected && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                  <RejectionNote request={row.rejected} />
                </div>
              )}
              {units.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Issued from this batch</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
                    {units.map((u) => (
                      <li key={u.item.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(u.item.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50/60 cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block font-mono font-bold text-slate-800">{u.item.itemCode}</span>
                            <span className="block truncate text-slate-600">{u.where}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-slate-700">
                              {u.units} {u.item.uom || 'EA'}
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

          {/* Section 5: Transaction Requests */}
          <FormSection
            step={5}
            title="Transaction Requests"
            subtitle="የጥያቄዎች እና እንቅስቃሴዎች ታሪክ · Activity log"
            icon={Clock}
            accent="emerald"
          >
            {requests.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">No requests on this record.</p>
            ) : (
              <ol className="divide-y divide-slate-100 text-xs">
                {requests.map((r) => {
                  const kind = REQUEST_LABELS[r.transactionType];
                  const to =
                    r.transactionType === 'STOCK_OUT' || r.transactionType === 'TRANSFER'
                      ? r.recipientEmployee?.fullNameEn || r.requestDetails?.organizationName
                      : r.transactionType === 'RETURN'
                        ? 'Store'
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
                        {r.transactionType === 'STOCK_OUT' && r.requestDetails?.quantity ? ` · ${r.requestDetails.quantity} ${uom}` : ''}
                      </p>
                      {r.status === ApprovalStatus.REJECTED && r.reviewRemarks && <p className="text-red-700">Reason: {r.reviewRemarks}</p>}
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
