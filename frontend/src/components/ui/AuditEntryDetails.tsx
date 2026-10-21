import React, { useState } from 'react';
import { AuditLogEntry, Employee, ItemWithRelations, TransactionApproval } from '../../types/asset-management';
import { requestLabel, shortDate } from '../assets/asset-state';
import { actionText, roleName, withRoleNames } from '../../utils/roles';
import { formatETB } from '../../utils/eth-date';

/** What an expanded audit entry can say about the record and request it touched; loaded once, on first expand */
export interface AuditContext {
  items: Map<string, ItemWithRelations>;
  employees: Map<string, Employee>;
  approvals: TransactionApproval[];
}

const ITEM_STATUS: Record<string, string> = {
  AVAILABLE: 'In store',
  ISSUED: 'Issued',
  PENDING_STOCK_IN: 'Receipt pending',
  PENDING_STOCK_OUT: 'Issue pending',
  PENDING_DISPOSAL: 'Disposal pending',
  UNDER_TRANSFER: 'Transfer pending',
  DISPOSED: 'Disposed',
  REJECTED: 'Rejected',
};

const REQUEST_TYPES = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'RETURN', 'DISPOSAL'];
const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();

/**
 * The request an entry was about: on the same record, of the kind the action names, on the same voucher; the
 * latest one made by the day of the entry
 */
export function relatedRequest(log: AuditLogEntry, approvals: TransactionApproval[]): TransactionApproval | undefined {
  const type = log.action.match(/(STOCK_IN|STOCK_OUT|TRANSFER|RETURN|DISPOSAL)$/)?.[1] ?? (REQUEST_TYPES.includes(log.entityType) ? log.entityType : undefined);
  const slip = norm(log.ifmisSlipNumber);
  const candidates = approvals
    .filter((a) => a.itemId === log.entityId && (!type || a.transactionType === type) && (!slip || norm(a.ifmisSlipNumber) === slip))
    .sort((a, b) => String(b.createdAt ?? b.createdAtGc).localeCompare(String(a.createdAt ?? a.createdAtGc)));
  const day = (log.timestampGc ?? '').slice(0, 10);
  return candidates.find((a) => (a.createdAtGc ?? '').slice(0, 10) <= day) ?? candidates[candidates.length - 1];
}

/** Where a request stands now */
const requestStatus = (a: TransactionApproval): string =>
  a.status === 'PENDING' ? `Waiting · stage ${a.currentStage ?? 1} (${(a.currentStage ?? 1) === 2 ? 'Department Head' : 'Team Leader'})`
  : a.status === 'RETURNED' ? 'Returned for correction'
  : a.status === 'APPROVED' ? 'Approved'
  : a.status === 'REJECTED' ? 'Rejected'
  : String(a.status);

/** Names for the recorded fields that read badly spelled out from code */
const FIELD_NAMES: Record<string, string> = {
  unitCostETB: 'Unit price (ETB)',
  ifmisSlipNumber: 'Slip no.',
  ifmisSlipDateGc: 'Slip date (G.C.)',
  ifmisSlipAttachmentUrl: 'Slip attachment',
  storeLocationId: 'Store',
  serialNumber: 'Serial number',
  itemType: 'Item type',
  ifmisItemCode: 'IFMIS item code',
  ifmisTagNumber: 'IFMIS tag number',
  recipientEmployeeId: 'Recipient',
  targetDepartmentId: 'Directorate',
  targetLocationId: 'Location',
};

const fieldLabel = (key: string): string => {
  if (FIELD_NAMES[key]) return FIELD_NAMES[key];
  const text = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const fieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return withRoleNames(String(value));
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2 text-[11px]">
    <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
    <dd className="min-w-0 break-words text-slate-800">{children}</dd>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`min-w-0 rounded-md border border-slate-200 bg-white p-3 ${className}`}>
    <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</h4>
    <dl className="space-y-1">{children}</dl>
  </section>
);

/** "Getnet Taye · 21 Oct 2026" */
const byOn = (person?: Employee, gc?: string) => [person?.fullNameEn, shortDate(gc)].filter(Boolean).join(' · ') || '—';

/** The before-and-after values: what changed, and every recorded field on request */
const Changes: React.FC<{ before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }> = ({ before, after }) => {
  const [all, setAll] = useState(false);
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const both = !!before && !!after;
  const changed = keys.filter((k) => fieldValue(before?.[k]) !== fieldValue(after?.[k]));
  const shown = all || !both ? keys : changed;
  return (
    <Card title={both ? `Changes (${changed.length} of ${keys.length} fields)` : 'Recorded values'} className="md:col-span-2">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="w-40 py-0.5 pr-2 font-normal">Field</th>
            {before && <th className="py-0.5 pr-2 font-normal">Before</th>}
            {after && <th className="py-0.5 font-normal">After</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((k) => {
            const differs = both && changed.includes(k);
            return (
              <tr key={k} className="align-top">
                <td className="py-0.5 pr-2 text-slate-500">{fieldLabel(k)}</td>
                {before && <td className={`py-0.5 pr-2 break-words ${differs ? 'text-rose-700 line-through decoration-rose-300' : 'text-slate-700'}`}>{fieldValue(before[k])}</td>}
                {after && <td className={`py-0.5 break-words ${differs ? 'font-semibold text-emerald-800' : 'text-slate-700'}`}>{fieldValue(after[k])}</td>}
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr><td colSpan={3} className="py-0.5 text-slate-500">No field changed.</td></tr>
          )}
        </tbody>
      </table>
      {both && keys.length > changed.length && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer">
          {all ? 'Show only what changed' : `Show all ${keys.length} fields`}
        </button>
      )}
    </Card>
  );
};

/**
 * An audit entry opened: who did what, when, to which record, the request behind it as it stands now (with who
 * endorsed, decided or returned it and why), and the values it changed
 */
export const AuditEntryDetails: React.FC<{ log: AuditLogEntry; context: AuditContext | null }> = ({ log, context }) => {
  const item = context?.items.get(log.entityId);
  const person = log.entityType === 'USER' ? context?.employees.get(log.entityId) : undefined;
  const request = context ? relatedRequest(log, context.approvals) : undefined;
  const hasStates = Boolean(log.previousState || log.newState);
  const details = request?.requestDetails as Record<string, any> | undefined;
  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      <Card title="Entry">
        <Row label="Action">
          {actionText(log.action)} <span className="font-mono text-[10px] text-slate-400">{log.action}</span>
        </Row>
        <Row label="Done by">{log.userName} · {roleName(log.userRole)}</Row>
        <Row label="When">
          {log.timestampEc} E.C. <span className="text-slate-500">· {log.timestampGc} G.C.</span>
        </Row>
        {log.ifmisSlipNumber && <Row label="Slip no.">{log.ifmisSlipNumber}</Row>}
        {person ? (
          <Row label="Employee">{person.fullNameEn}{person.payrollId ? ` · ${person.payrollId}` : ''}</Row>
        ) : item ? (
          <Row label="Record">
            <span className="font-mono">{item.itemCode}</span> · {item.name}
            <span className="text-slate-500"> · now {ITEM_STATUS[item.status] ?? String(item.status).toLowerCase()}</span>
          </Row>
        ) : (
          <Row label="Record"><span className="font-mono text-slate-500">{log.entityId}</span></Row>
        )}
      </Card>

      {context === null ? (
        <Card title="Request"><p className="text-[11px] text-slate-500">Loading…</p></Card>
      ) : request ? (
        <Card title="Request, as it stands now">
          <Row label="Request">
            {(() => { const n = requestLabel(request.transactionType, request.requestDetails).noun; return n.charAt(0).toUpperCase() + n.slice(1); })()}
            {request.ifmisSlipNumber && !request.ifmisSlipNumber.startsWith('PENDING-') ? ` · ${request.ifmisSlipNumber}` : ''}
          </Row>
          <Row label="Status">{requestStatus(request)}</Row>
          {(details?.quantity || request.totalAmount) ? (
            <Row label="Quantity / value">
              {[details?.quantity ? `${details.quantity} ${details.uom || request.itemUom || ''}`.trim() : '', request.totalAmount ? formatETB(request.totalAmount) : ''].filter(Boolean).join(' · ')}
            </Row>
          ) : null}
          <Row label="Requested by">{byOn(request.requestedBy, request.createdAtGc)}</Row>
          {request.endorsedBy && <Row label="Endorsed by">{byOn(request.endorsedBy, request.endorsedAtGc)}</Row>}
          {request.status === 'APPROVED' && <Row label="Approved by">{byOn(request.reviewedBy, request.reviewedAtGc)}</Row>}
          {request.status === 'REJECTED' && (
            <Row label="Rejected by">
              {byOn(request.reviewedBy, request.reviewedAtGc)}
              {request.reviewRemarks && <span className="block text-rose-700">{request.reviewRemarks}</span>}
            </Row>
          )}
          {request.returnRemarks && (
            <Row label={request.status === 'RETURNED' ? 'Returned by' : 'Last returned by'}>
              {byOn(request.returnedBy, request.returnedAtGc)}
              {(request.returnCount ?? 0) > 1 ? ` · ${request.returnCount} times` : ''}
              <span className="block text-amber-800">{request.returnRemarks}</span>
            </Row>
          )}
        </Card>
      ) : null}

      {hasStates && <Changes before={log.previousState} after={log.newState} />}
    </div>
  );
};
