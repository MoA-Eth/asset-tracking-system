import React, { useEffect, useState } from 'react';
import { withRoleNames } from '../../utils/roles';
import { FileText, History, Package, Paperclip, RefreshCw, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';
import { SlipViewerModal } from './SlipViewerModal';
import { statusTone, pill } from './theme';
import { api } from '../../api/client';
import { formatETB } from '../../utils/eth-date';
import {
  ItemWithRelations,
  TransactionApproval,
  Department,
  Location,
  ItemStatus,
} from '../../types/asset-management';

interface RecordDetailModalProps {
  /** Item to show; its details and history are loaded when the modal opens */
  itemId: string;
  /** The request being reviewed, when opened from Approvals */
  approval?: TransactionApproval;
  onClose: () => void;
}

const REQUEST_LABELS: Record<string, string> = {
  STOCK_IN: 'Stock-In (Model 19)',
  STOCK_OUT: 'Stock-Out (Model 22)',
  TRANSFER: 'Transfer (Model 21)',
  RETURN: 'Return (Model 21)',
};

const ITEM_STATUS: Record<string, { label: string; tone: keyof typeof statusTone }> = {
  [ItemStatus.PENDING_STOCK_IN]: { label: 'Awaiting registration approval', tone: 'pending' },
  [ItemStatus.AVAILABLE]: { label: 'In store', tone: 'inStore' },
  [ItemStatus.PENDING_STOCK_OUT]: { label: 'Stock-Out pending', tone: 'pending' },
  [ItemStatus.ISSUED]: { label: 'Issued', tone: 'issued' },
  [ItemStatus.UNDER_TRANSFER]: { label: 'Under transfer', tone: 'pending' },
  // An item only leaves the register this way when its Stock-In is rejected
  [ItemStatus.DISPOSED]: { label: 'Rejected', tone: 'rejected' },
};

/** Label / value pair; empty values show a dash */
const Row: React.FC<{ label: string; children?: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
    <span className="text-slate-500 shrink-0">{label}</span>
    <span className={`text-right text-slate-900 font-medium break-words ${mono ? 'font-mono' : ''}`}>
      {children === undefined || children === null || children === '' ? '—' : children}
    </span>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white">
    <h4 className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 rounded-t-xl text-[11px] font-bold uppercase tracking-wider text-slate-600">
      <Icon className="w-3.5 h-3.5 text-emerald-700" />
      {title}
    </h4>
    <div className="px-4 py-2 text-xs">{children}</div>
  </section>
);

/** Read-only view of a record: the request (if any), the item and its history */
export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ itemId, approval, onClose }) => {
  const [item, setItem] = useState<ItemWithRelations | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewingSlipUrl, setViewingSlipUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.getItemById(itemId), api.getDepartments(), api.getLocations()])
      .then(([loadedItem, deps, locs]) => {
        if (!active) return;
        setItem(loadedItem);
        setDepartments(deps);
        setLocations(locs);
      })
      .catch((err: any) => active && setError(err.message || 'Could not load this record.'));
    return () => {
      active = false;
    };
  }, [itemId]);

  const deptName = (id?: string | null) => departments.find((d) => d.id === id)?.nameEn;
  const locationName = (id?: string | null) => {
    const loc = locations.find((l) => l.id === id);
    return loc ? [loc.siteName, loc.roomNumber].filter(Boolean).join(' · ') : undefined;
  };

  const d = approval?.requestDetails;
  const uom = d?.uom || approval?.itemUom || item?.uom || 'EA';
  const b = item?.balance;
  const partly = !!b && b.issued > 0 && b.available > 0;
  const itemStatus = item
    ? partly
      ? { label: 'Partly issued', tone: 'partly' as const }
      : ITEM_STATUS[item.status] ?? { label: item.status, tone: 'neutral' as const }
    : null;
  const requestStatus = approval
    ? approval.status === 'PENDING'
      ? { label: approval.currentStage === 1 ? 'Awaiting Team Leader' : 'Awaiting Dept. Head', tone: 'pending' as const }
      : approval.status === 'APPROVED'
        ? { label: 'Approved', tone: 'approved' as const }
        : { label: 'Rejected', tone: 'rejected' as const }
    : null;

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={`${approval ? REQUEST_LABELS[approval.transactionType] ?? approval.transactionType : 'Item'} · ${approval?.itemCode ?? item?.itemCode ?? ''}`}
        subtitle={approval?.itemName ?? item?.name ?? 'Loading record…'}
        size="xl"
      >
        {error ? (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : !item ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading record…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {approval && (
                <Section title="Request" icon={FileText}>
                  <Row label="Type">{REQUEST_LABELS[approval.transactionType] ?? approval.transactionType}</Row>
                  <Row label="Status">
                    {requestStatus && <span className={`${pill} ${statusTone[requestStatus.tone]}`}>{requestStatus.label}</span>}
                  </Row>
                  {approval.transactionType === 'STOCK_OUT' && (
                    <Row label="Quantity" mono>
                      {d?.quantity ? `${d.quantity} ${uom}` : undefined}
                    </Row>
                  )}
                  <Row label="IFMIS slip" mono>
                    <span className="inline-flex items-center gap-1.5">
                      {approval.ifmisSlipNumber}
                      {approval.ifmisSlipAttachmentUrl && (
                        <button
                          type="button"
                          onClick={() => setViewingSlipUrl(approval.ifmisSlipAttachmentUrl!)}
                          className="p-0.5 rounded text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          title="View scanned slip"
                          aria-label="View scanned slip"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  </Row>
                  <Row label="Slip date">
                    {approval.ifmisSlipDateEc} E.C. ({approval.ifmisSlipDateGc})
                  </Row>
                  <Row label="Requested by">{approval.requestedBy?.fullNameEn}</Row>
                  <Row label="Submitted">{approval.createdAtEc} E.C.</Row>
                  {approval.transactionType !== 'STOCK_IN' && (
                    <>
                      <Row label={approval.transactionType === 'RETURN' ? 'Returned by' : 'Recipient'}>
                        {approval.recipientEmployee?.fullNameEn}
                      </Row>
                      {approval.targetDepartmentId && <Row label="Directorate">{deptName(approval.targetDepartmentId)}</Row>}
                      {approval.targetLocationId && <Row label="Location">{locationName(approval.targetLocationId)}</Row>}
                    </>
                  )}
                  {d?.reason && <Row label="Reason">{d.reason}</Row>}
                  {d?.condition && <Row label="Condition">{d.condition.replace(/_/g, ' ')}</Row>}
                  {d?.remark && <Row label={approval.transactionType === 'RETURN' ? 'Defects' : 'Remark'}>{d.remark}</Row>}
                  {!d?.reason && approval.purposeOrRemarks && <Row label="Purpose / remark">{approval.purposeOrRemarks}</Row>}
                  {approval.endorsedBy && (
                    <Row label="Endorsed by">
                      {approval.endorsedBy.fullNameEn}
                      {approval.endorsementRemarks ? ` — ${approval.endorsementRemarks}` : ''}
                    </Row>
                  )}
                  {approval.reviewedBy && (
                    <Row label={approval.status === 'REJECTED' ? 'Rejected by' : 'Approved by'}>
                      {approval.reviewedBy.fullNameEn}
                      {approval.reviewRemarks ? ` — ${approval.reviewRemarks}` : ''}
                    </Row>
                  )}
                </Section>
              )}

              <Section title="Item" icon={Package}>
                <Row label="Item code" mono>{item.itemCode}</Row>
                <Row label="Description">{item.name}</Row>
                <Row label="Category">{item.itemCategoryDisplay || item.category.replace(/_/g, ' ')}</Row>
                <Row label="Status">
                  {itemStatus && <span className={`${pill} ${statusTone[itemStatus.tone]}`}>{itemStatus.label}</span>}
                </Row>
                {b && (
                  <Row label="Units" mono>
                    {b.total} received · {b.issued} issued · {b.available} in store ({item.uom || 'EA'})
                  </Row>
                )}
                <Row label="Unit price">{formatETB(item.unitCostETB)}</Row>
                <Row label="Serial number" mono>{item.serialNumber}</Row>
                <Row label="Condition">{item.condition?.replace(/_/g, ' ')}</Row>
                <Row label="Store">{item.storeLocation?.siteName}</Row>
                <Row label="Custodian">{item.currentCustodian?.fullNameEn}</Row>
                <Row label="Directorate">{item.assignedDepartment?.nameEn}</Row>
                <Row label="Model 19 slip" mono>
                  <span className="inline-flex items-center gap-1.5">
                    {item.ifmisSlipNumber}
                    {item.ifmisSlipAttachmentUrl && (
                      <button
                        type="button"
                        onClick={() => setViewingSlipUrl(item.ifmisSlipAttachmentUrl!)}
                        className="p-0.5 rounded text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                        title="View scanned Model 19 slip"
                        aria-label="View scanned Model 19 slip"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </Row>
                <Row label="Received on">{item.ifmisSlipDateEc} E.C. ({item.ifmisSlipDateGc})</Row>
                <Row label="Supplier">{item.source}</Row>
                <Row label="Registered by">{item.registeredBy?.fullNameEn}</Row>
              </Section>
            </div>

            <Section title={`History (${item.history?.length ?? 0})`} icon={History}>
              {(item.history ?? []).length === 0 ? (
                <p className="py-2 text-slate-400">No history recorded.</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {item.history.map((h) => (
                    <li key={h.id} className="py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold text-slate-900">{h.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{h.dateEc} E.C. · {h.dateGc}</span>
                      </div>
                      <p className="text-slate-600">
                        {withRoleNames(h.performedBy)}
                        {h.fromEntity || h.toEntity ? ` · ${h.fromEntity ?? '—'} → ${h.toEntity ?? '—'}` : ''}
                      </p>
                      {h.notes && <p className="text-slate-500 mt-0.5">{h.notes}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </Modal>
      {viewingSlipUrl && <SlipViewerModal url={viewingSlipUrl} onClose={() => setViewingSlipUrl(null)} />}
    </>
  );
};
