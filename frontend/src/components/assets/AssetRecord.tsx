import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, Lock, MapPin, Paperclip, Printer, Tag, Users, X, FileText } from 'lucide-react';
import { btn, statusTone, pill } from '../ui/theme';
import { Row } from '../ui/RecordDetailModal';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { RowAction } from '../ui/RowActionsMenu';
import { ApprovalStatus, TransactionApproval } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { storeLocationLabel } from '../../utils/location';
import { departmentLabel } from '../../utils/department';
import { AssetRow, AssetStatus, REQUEST_LABELS, RejectionNote, STAGE_LABELS, shortDate } from './asset-state';

type Tab = 'custody' | 'requests';

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
  /** Form shown in place of the details while the pending receipt or request is being corrected */
  editForm?: React.ReactNode;
  /** Id of that form, so the toolbar's Save submits it */
  editFormId?: string;
  saving: boolean;
  onCancelEdit: () => void;
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

const isBlank = (value: React.ReactNode) => value === undefined || value === null || value === '' || value === false;

/** One detail: a small label over its value. `wide` spans both columns. Left out by its group when empty. */
const Field: React.FC<{ label: string; children?: React.ReactNode; mono?: boolean; wide?: boolean }> = ({ label, children, mono, wide }) => (
  <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
    <dd className={`mt-0.5 break-words text-xs font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{children}</dd>
  </div>
);

/** A titled two-column group of details, showing only those that have a value */
const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const filled = React.Children.toArray(children).filter(
    (child) => React.isValidElement<{ children?: React.ReactNode }>(child) && !isBlank(child.props.children),
  );
  if (filled.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">{title}</h4>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3">{filled}</dl>
    </div>
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
 * One asset record, opened from the register: what can be done now in the toolbar, the Model 19 details on
 * the left, and where its units are and its requests on the right.
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
  editFormId,
  saving,
  onCancelEdit,
  onPrintRequest,
  onPrintReceipt,
  onSelect,
  onClose,
}) => {
  const [tab, setTab] = useState<Tab>('custody');
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const { item } = row;
  const uom = item.uom || 'EA';
  const editing = !!editForm;

  const prints = actions.filter((a) => !a.hidden && a.label.startsWith('Print'));
  const steps = actions.filter((a) => !a.hidden && !a.label.startsWith('Print'));
  const pending = row.request;
  const approved = row.state !== 'RECEIPT_PENDING' && row.state !== 'REJECTED';

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'custody', label: 'Custody', icon: Users },
    { id: 'requests', label: 'Requests', icon: FileText, count: requests.length },
  ];

  return (
    <section aria-label={`Asset record ${item.itemCode}`} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* ── Title and toolbar ── */}
      <header className="relative space-y-2 border-b border-slate-200 px-5 py-4">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer lg:hidden">
          <ArrowLeft className="h-3 w-3" /> All assets
        </button>
        <button type="button" onClick={onClose} aria-label="Close record" title="Close" className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer lg:inline-flex">
          <X className="h-4 w-4" />
        </button>
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

        <div role="toolbar" aria-label="Asset actions" className="flex flex-wrap items-center gap-2 2xl:justify-end">
          {editing ? (
            <>
              <button type="submit" form={editFormId} disabled={saving} className={btn.primary}>
                <Check className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={onCancelEdit} disabled={saving} className={btn.secondary}>
                <X className="h-4 w-4" />
                Cancel
              </button>
            </>
          ) : (
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
          )}
        </div>
        </div>
        {!editing && steps.some((a) => a.disabled) && (
          <p className="text-[11px] text-slate-500">{steps.find((a) => a.disabled)?.reason}</p>
        )}
      </header>

      {editing ? (
        <div className="p-4">{editForm}</div>
      ) : (
        <div className="grid min-w-0 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
          {/* ── Left: the Model 19 record ── */}
          <div className="min-w-0 space-y-5 px-5 py-4">
            <FieldGroup title="Receipt · Model 19">
              <Field label="Model 19 No." mono>
                {item.ifmisSlipNumber && (
                  <span className="inline-flex items-center gap-1">
                    {item.ifmisSlipNumber}
                    <CopyButton text={item.ifmisSlipNumber} label="Copy Model 19 number" />
                    {item.ifmisSlipAttachmentUrl && (
                      <button
                        type="button"
                        onClick={() => setSlipUrl(item.ifmisSlipAttachmentUrl!)}
                        className="rounded p-0.5 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                        aria-label="View scanned Model 19 slip"
                        title="View scanned Model 19 slip"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                )}
              </Field>
              <Field label="Received on">
                {item.ifmisSlipDateEc ? (
                  <>
                    {item.ifmisSlipDateEc} E.C.
                    <span className="block text-[10px] font-normal text-slate-500">{item.ifmisSlipDateGc}</span>
                  </>
                ) : (
                  item.ifmisSlipDateGc
                )}
              </Field>
              <Field label="Supplier">{item.source}</Field>
              <Field label="Transaction type">{item.transactionType}</Field>
              <Field label="PO number" mono>
                {item.poNumber ? (
                  <span className="inline-flex items-center gap-1">
                    {item.poNumber}
                    <CopyButton text={item.poNumber} label="Copy PO number" />
                  </span>
                ) : undefined}
              </Field>
              <Field label="Store">{item.storeLocation ? storeLocationLabel(item.storeLocation) : undefined}</Field>
            </FieldGroup>

            <FieldGroup title="Item">
              <Field label="Category">{item.itemCategoryDisplay || item.category?.replace(/_/g, ' ')}</Field>
              <Field label="Condition">{item.condition?.replace(/_/g, ' ')}</Field>
              <Field label="Quantity" mono>{totals ? `${totals.total} ${uom} received` : `${row.units} ${uom}`}</Field>
              <Field label="Unit price" mono>{formatETB(item.unitCostETB)}</Field>
              <Field label="Total valuation" mono>
                {formatETB((item.unitCostETB || 0) * (totals?.total ?? row.units))}
                {totals && totals.issued > 0 && (
                  <span className="block text-[10px] font-normal text-slate-500">
                    {formatETB((item.unitCostETB || 0) * totals.inStore)} in store · {formatETB((item.unitCostETB || 0) * totals.issued)} issued
                  </span>
                )}
              </Field>
              <Field label="Serial number" mono>
                {item.serialNumber ? (
                  <span className="inline-flex items-center gap-1">
                    {item.serialNumber}
                    <CopyButton text={item.serialNumber} label="Copy serial number" />
                  </span>
                ) : undefined}
              </Field>
              <Field label="Lot / batch no." mono>{item.lotBatchNo}</Field>
              <Field label="Sub inventory">{item.subInventory}</Field>
              <Field label="Remark" wide>{item.remark}</Field>
            </FieldGroup>

            <FieldGroup title="People">
              <Field label="Delivered by">{item.deliveredBy}</Field>
              <Field label="Received by">{item.receivedBy}</Field>
              <Field label="Registered by">{item.registeredBy?.fullNameEn}</Field>
            </FieldGroup>

            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              {approved
                ? 'Approved records are locked. To correct one, an approver rejects the request and it is registered again.'
                : row.state === 'REJECTED'
                  ? 'This receipt was rejected and is kept for the record.'
                  : 'The receipt can be corrected until the Team Leader endorses it.'}
            </p>
          </div>

          {/* ── Right: custody and requests ── */}
          <div className="min-w-0 border-t border-slate-200 xl:border-t-0">
            <div role="tablist" aria-label="Asset record" className="flex border-b border-slate-200 px-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
                    tab === t.id ? "-mb-px border-b-2 border-emerald-700 text-emerald-900" : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count !== undefined && <span className="font-mono font-normal opacity-70">{t.count}</span>}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="px-5 py-4 text-xs">
              {tab === 'custody' && (
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
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      <p className="font-semibold">
                        {REQUEST_LABELS[pending.transactionType]?.pending ?? 'Request pending'} · {STAGE_LABELS[pending.currentStage] ?? 'waiting'}
                      </p>
                      {row.goingTo && <p>→ {row.goingTo}</p>}
                    </div>
                  )}
                  {row.rejected && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <RejectionNote request={row.rejected} />
                    </div>
                  )}
                  {units.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Issued from this batch</p>
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
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
              )}

              {tab === 'requests' &&
                (requests.length === 0 ? (
                  <p className="py-2 text-slate-400">No requests on this record.</p>
                ) : (
                  <ol className="divide-y divide-slate-100">
                    {requests.map((r) => {
                      const kind = REQUEST_LABELS[r.transactionType];
                      const to =
                        r.transactionType === 'STOCK_OUT' || r.transactionType === 'TRANSFER'
                          ? r.recipientEmployee?.fullNameEn
                          : r.transactionType === 'RETURN'
                            ? 'Store'
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
                            onClick={() => (r.transactionType === 'STOCK_IN' ? onPrintReceipt() : onPrintRequest(r))}
                            className={btn.row}
                          >
                            <Printer className={btn.rowIcon} />
                            Print {kind?.model ?? 'voucher'}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ))}
            </div>
          </div>
        </div>
      )}
      {slipUrl && <SlipViewerModal url={slipUrl} onClose={() => setSlipUrl(null)} />}
    </section>
  );
};
