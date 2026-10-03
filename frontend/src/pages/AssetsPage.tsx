import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Warehouse,
  UserCheck,
  Clock,
  PackagePlus,
  PackageMinus,
  ArrowRightLeft,
  RotateCcw,
  Eye,
  Pencil,
  Printer,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { Modal } from '../components/ui/Modal';
import { StatCard } from '../components/ui/StatCard';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu, RowAction } from '../components/ui/RowActionsMenu';
import { RecordDetailModal } from '../components/ui/RecordDetailModal';
import { RefreshButton } from '../components/ui/RefreshButton';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { Model19PrintModal } from '../components/ui/Model19PrintModal';
import { Model22PrintModal } from '../components/ui/Model22PrintModal';
import { Model21PrintModal } from '../components/ui/Model21PrintModal';
import { StockInForm, buildModel19Voucher } from '../components/assets/ReceiptForm';
import { StockOutForm, buildModel22Voucher } from '../components/assets/IssueForm';
import { TransferForm, buildModel21Voucher } from '../components/assets/TransferForm';
import { useAuth } from '../context/AuthContext';
import {
  ApprovalStatus,
  Department,
  Employee,
  ItemStatus,
  ItemWithRelations,
  Location,
  Model19Voucher,
  Model21Voucher,
  Model22Voucher,
  TransactionApproval,
  UserRole,
} from '../types/asset-management';
import { formatETB } from '../utils/eth-date';
import { storeLocationLabel } from '../utils/location';
import { departmentLabel } from '../utils/department';

/**
 * Where an asset record is in its life: received into store (Model 19), issued to someone (Model 22),
 * then transferred to someone else or returned to store (Model 21). Each step waits for approval.
 */
type AssetState = 'RECEIPT_PENDING' | 'IN_STORE' | 'ISSUED' | 'REQUEST_PENDING' | 'REJECTED';

type AssetFilter = 'ALL' | 'IN_STORE' | 'ISSUED' | 'PENDING' | 'REJECTED';
const FILTERS: { value: AssetFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_STORE', label: 'In store' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
];

/** Who a pending request is waiting for */
const STAGE_LABELS: Record<number, string> = {
  1: 'With Team Leader',
  2: 'With Dept. Head',
};

const REQUEST_LABELS: Record<string, { noun: string; pending: string; model: string }> = {
  STOCK_IN: { noun: 'receipt', pending: 'Receipt pending', model: 'Model 19' },
  STOCK_OUT: { noun: 'issue', pending: 'Issue pending', model: 'Model 22' },
  TRANSFER: { noun: 'transfer', pending: 'Transfer pending', model: 'Model 21' },
  RETURN: { noun: 'return', pending: 'Return pending', model: 'Model 21' },
};

const ENDORSED_REASON = 'The Team Leader has endorsed it. To correct it, ask an approver to reject it.';

interface AssetRow {
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

/** When a request was decided; the request time breaks same-day ties */
const decidedOn = (a: TransactionApproval) => `${a.reviewedAtGc || ''}|${a.createdAtGc || ''}`;
const shortDate = (gc?: string) =>
  gc ? new Date(gc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** "Issue rejected · 30 Sep 2026", with the reviewer's reason underneath */
const RejectionNote: React.FC<{ request: TransactionApproval }> = ({ request }) => {
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

const AssetStatus: React.FC<{ row: AssetRow }> = ({ row }) => {
  const settled =
    row.state === 'REJECTED' ? <span className={`${pill} ${statusTone.rejected}`}>Rejected</span>
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

interface AssetsPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const AssetsPage: React.FC<AssetsPageProps> = () => {
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions?.includes(permission) ?? false;
  const canReceive = can('stock-in.write');
  const canIssue = can('stock-out.write');
  const canTransfer = can('transfers.write');

  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<AssetFilter>('ALL');
  const [search, setSearch] = useState('');
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);

  // Pop-ups: one per form, each either new (from a row or the header) or correcting a pending request
  const [receipt, setReceipt] = useState<{ edit?: ItemWithRelations } | null>(null);
  const [issue, setIssue] = useState<{ itemId?: string; edit?: TransactionApproval } | null>(null);
  const [transfer, setTransfer] = useState<{ itemId?: string; edit?: TransactionApproval } | null>(null);
  const [returning, setReturning] = useState<{ item: ItemWithRelations; edit?: TransactionApproval } | null>(null);
  const [viewing, setViewing] = useState<{ itemId: string; approval?: TransactionApproval } | null>(null);
  const [voucher19, setVoucher19] = useState<Model19Voucher | null>(null);
  const [voucher22, setVoucher22] = useState<Model22Voucher | null>(null);
  const [voucher21, setVoucher21] = useState<Model21Voucher | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [itemsRes, approvalsRes, locsRes, empsRes, deptsRes] = await Promise.all([
        api.getItems(),
        api.getApprovals(),
        api.getLocations(),
        api.getEmployees(),
        api.getDepartments(),
      ]);
      setItems(itemsRes);
      setApprovals(approvalsRes);
      setLocations(locsRes);
      setEmployees(empsRes);
      setDepartments(deptsRes);
    } catch (err: any) {
      console.error('Failed to load assets:', err);
      setError(err.message || 'The assets could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // One open request per record at most
  const pendingByItem = useMemo(
    () => new Map(approvals.filter((a) => a.status === ApprovalStatus.PENDING).map((a) => [a.itemId, a] as const)),
    [approvals],
  );

  // Decided requests, newest first, grouped two ways:
  // - vouchers: an approved partial issue is filed under the unit it created, whose custody it records
  // - raised: every request under the record it was made on, to tell whether that record's last request was rejected
  const decided = useMemo(() => {
    const idByCode = new Map(items.map((i) => [i.itemCode, i.id] as const));
    const vouchers = new Map<string, TransactionApproval[]>();
    const raised = new Map<string, TransactionApproval[]>();
    const add = (map: Map<string, TransactionApproval[]>, id: string, a: TransactionApproval) => map.set(id, [...(map.get(id) ?? []), a]);
    for (const a of approvals) {
      if (a.status === ApprovalStatus.PENDING) continue;
      const issuedCode = a.status === ApprovalStatus.APPROVED ? a.requestDetails?.issuedItemCode : undefined;
      add(vouchers, (issuedCode && idByCode.get(issuedCode)) || a.itemId, a);
      add(raised, a.itemId, a);
    }
    for (const map of [vouchers, raised]) for (const list of map.values()) list.sort((x, y) => decidedOn(y).localeCompare(decidedOn(x)));
    return { vouchers, raised };
  }, [approvals, items]);

  const rows = useMemo<AssetRow[]>(() => {
    const employeeName = (id?: string | null) => employees.find((e) => e.id === id)?.fullNameEn;
    return items
      .map((item) => {
        const request = pendingByItem.get(item.id);
        const store = item.storeLocation ? storeLocationLabel(item.storeLocation) : 'Store';
        const holder = item.currentCustodian?.fullNameEn || employeeName(item.currentCustodianId) || (item.assignedDepartment ? departmentLabel(item.assignedDepartment) : undefined);
        let state: AssetState;
        if (item.status === ItemStatus.DISPOSED) state = 'REJECTED';
        else if (item.status === ItemStatus.PENDING_STOCK_IN) state = 'RECEIPT_PENDING';
        else if (request) state = 'REQUEST_PENDING';
        else if (item.status === ItemStatus.AVAILABLE) state = 'IN_STORE';
        else state = 'ISSUED';

        let goingTo: string | undefined;
        if (request?.transactionType === 'STOCK_OUT' || request?.transactionType === 'TRANSFER') {
          goingTo = request.recipientEmployee?.fullNameEn || employeeName(request.recipientEmployeeId);
        } else if (request?.transactionType === 'RETURN') {
          const target = locations.find((l) => l.id === request.targetLocationId);
          goingTo = target ? storeLocationLabel(target) : store;
        }
        // An issued record (or one waiting to be transferred or returned) is with someone; the rest is in store
        const withSomeone = item.status === ItemStatus.ISSUED || item.status === ItemStatus.UNDER_TRANSFER;
        const approved = (decided.vouchers.get(item.id) ?? []).filter((a) => a.status === ApprovalStatus.APPROVED);
        const lastRaised = decided.raised.get(item.id)?.[0];
        return {
          item,
          state,
          request,
          units: Number(item.quantity) || 1,
          where: withSomeone ? holder || '—' : store,
          goingTo,
          activity: String(request?.createdAtGc || item.createdAtGc || ''),
          lastIssue: approved.find((a) => a.transactionType === 'STOCK_OUT'),
          lastMove: approved.find((a) => a.transactionType === 'TRANSFER' || a.transactionType === 'RETURN'),
          // A new request replaces the rejected one; until then the row says what happened
          rejected: !request && lastRaised?.status === ApprovalStatus.REJECTED ? lastRaised : undefined,
        };
      })
      .sort((a, b) => b.activity.localeCompare(a.activity) || a.item.itemCode.localeCompare(b.item.itemCode));
  }, [items, pendingByItem, decided, employees, locations]);

  const inFilter = (row: AssetRow, f: AssetFilter) =>
    f === 'ALL' ||
    (f === 'PENDING'
      ? row.state === 'RECEIPT_PENDING' || row.state === 'REQUEST_PENDING'
      : f === 'REJECTED'
        ? row.state === 'REJECTED' || !!row.rejected
        : row.state === f);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!inFilter(row, filter)) return false;
      if (!q) return true;
      const { item } = row;
      return [item.name, item.itemCode, item.serialNumber, item.ifmisSlipNumber, item.itemCategoryDisplay, item.category, row.where, row.goingTo, row.request?.ifmisSlipNumber]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, filter, search]);
  const pager = usePagination(shown, { resetKey: `${filter}|${search}` });

  // Summary
  const sumUnits = (list: AssetRow[]) => list.reduce((acc, r) => acc + r.units, 0);
  const inStore = rows.filter((r) => r.state === 'IN_STORE' || (r.state === 'REQUEST_PENDING' && r.item.status !== ItemStatus.ISSUED && r.item.status !== ItemStatus.UNDER_TRANSFER));
  const issued = rows.filter((r) => r.item.status === ItemStatus.ISSUED || r.item.status === ItemStatus.UNDER_TRANSFER);
  const pendingReceipts = rows.filter((r) => r.state === 'RECEIPT_PENDING').length;
  const pendingRequests = rows.filter((r) => r.state === 'REQUEST_PENDING').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const receivedThisMonth = items.filter(
    (i) => !i.parentItemId && i.status !== ItemStatus.PENDING_STOCK_IN && i.status !== ItemStatus.DISPOSED && String(i.ifmisSlipDateGc || i.createdAtGc || '').startsWith(thisMonth),
  );
  const inStoreValue = inStore.reduce((acc, r) => acc + (Number(r.item.unitCostETB) || 0) * r.units, 0);

  // ── Printing ──
  const printRequest = async (request: TransactionApproval, record?: ItemWithRelations) => {
    const item = record ?? items.find((i) => i.id === request.itemId);
    if (request.transactionType === 'STOCK_OUT') {
      setVoucher22(buildModel22Voucher(request, { item, departments, employees, printedBy: user?.payrollId }));
    } else {
      setVoucher21(await buildModel21Voucher(request, { item, employees, locations, printedBy: user?.payrollId }));
    }
  };

  // ── After a form is saved ──
  const saved = (itemId: string | undefined) => {
    if (itemId) setLastTouchedId(itemId);
    fetchData(true);
  };

  const editRequest = (row: AssetRow) => {
    const request = row.request!;
    if (request.transactionType === 'STOCK_OUT') setIssue({ edit: request });
    else if (request.transactionType === 'TRANSFER') setTransfer({ edit: request });
    else if (request.transactionType === 'RETURN') setReturning({ item: row.item, edit: request });
  };

  const actionsFor = (row: AssetRow): RowAction[] => {
    const { item, request } = row;
    const view: RowAction = { label: 'View details', icon: Eye, onClick: () => setViewing({ itemId: item.id, approval: request }) };
    const printReceipt: RowAction = { label: 'Print Model 19', icon: Printer, onClick: () => setVoucher19(buildModel19Voucher(item, items)) };
    // Vouchers of requests already approved, so signed copies can be printed again
    const printIssue: RowAction = { label: 'Print Model 22 (issue)', icon: Printer, onClick: () => printRequest(row.lastIssue!, item), hidden: !row.lastIssue };
    const printMove: RowAction = {
      label: `Print Model 21 (${row.lastMove?.transactionType === 'RETURN' ? 'return' : 'transfer'})`,
      icon: Printer,
      onClick: () => printRequest(row.lastMove!, item),
      hidden: !row.lastMove,
    };
    switch (row.state) {
      case 'RECEIPT_PENDING':
        return [
          {
            label: 'Edit receipt',
            icon: Pencil,
            onClick: () => setReceipt({ edit: item }),
            hidden: !canReceive || !request,
            disabled: request?.currentStage === 2,
            reason: request?.currentStage === 2 ? ENDORSED_REASON : undefined,
          },
          view,
          printReceipt,
        ];
      case 'IN_STORE':
        return [
          { label: 'Issue (Model 22)', icon: PackageMinus, onClick: () => setIssue({ itemId: item.id }), hidden: !canIssue },
          view,
          printReceipt,
          { ...printMove, hidden: row.lastMove?.transactionType !== 'RETURN' },
        ];
      case 'ISSUED':
        return [
          { label: 'Transfer (Model 21)', icon: ArrowRightLeft, onClick: () => setTransfer({ itemId: item.id }), hidden: !canTransfer },
          { label: 'Return to store (Model 21)', icon: RotateCcw, onClick: () => setReturning({ item }), hidden: !canTransfer },
          view,
          printIssue,
          printMove,
        ];
      case 'REQUEST_PENDING': {
        const kind = REQUEST_LABELS[request!.transactionType];
        const mayEdit = request!.transactionType === 'STOCK_OUT' ? canIssue : canTransfer;
        return [
          {
            label: `Edit ${kind.noun}`,
            icon: Pencil,
            onClick: () => editRequest(row),
            hidden: !mayEdit,
            disabled: request!.currentStage === 2,
            reason: request!.currentStage === 2 ? ENDORSED_REASON : undefined,
          },
          view,
          { label: `Print ${kind.model}`, icon: Printer, onClick: () => printRequest(request!, item) },
        ];
      }
      default:
        return [view];
    }
  };

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">The assets could not be loaded</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button onClick={() => fetchData()} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }

  const issueItem = issue?.edit ? items.find((i) => i.id === issue.edit!.itemId) : undefined;
  const availableItems = items.filter((i) => i.status === ItemStatus.AVAILABLE && !pendingByItem.has(i.id));

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-700" />
            Assets — ንብረቶች
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every asset from receipt to custody. Receive on Model 19, issue on Model 22, then transfer or return on Model 21.
          </p>
        </div>
        {canReceive && (
          <button type="button" onClick={() => setReceipt({})} className={btn.primary}>
            <Plus className="w-4 h-4" />
            Receive items (Model 19)
          </button>
        )}
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="In store" value={sumUnits(inStore).toLocaleString()} subtitle={`Units · ${formatETB(inStoreValue)}`} icon={<Warehouse className="w-5 h-5" />} />
        <StatCard label="Issued" value={sumUnits(issued).toLocaleString()} subtitle="Units with custodians" icon={<UserCheck className="w-5 h-5" />} />
        <StatCard
          label="Pending"
          value={pendingReceipts + pendingRequests}
          subtitle={`${pendingReceipts} ${pendingReceipts === 1 ? 'receipt' : 'receipts'} · ${pendingRequests} ${pendingRequests === 1 ? 'request' : 'requests'}`}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          label="Received this month"
          value={receivedThisMonth.length}
          subtitle={`${receivedThisMonth.length === 1 ? 'Registration' : 'Registrations'} approved`}
          icon={<PackagePlus className="w-5 h-5" />}
        />
      </div>

      {/* ── Register ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Show assets" className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filter === f.value ? 'bg-emerald-800 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.label} <span className="ml-0.5 opacity-75">{rows.filter((r) => inFilter(r, f.value)).length}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search assets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, serial, slip or person…"
                className={table.search.replace('pr-8', 'pr-3')}
              />
            </div>
            <RefreshButton onClick={() => fetchData(true)} loading={loading || refreshing} label="assets" />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
            Loading assets…
          </div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center space-y-1">
            <Boxes className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800">{rows.length === 0 ? 'No assets yet' : 'No assets match'}</p>
            <p className="text-xs text-slate-500">
              {rows.length === 0
                ? canReceive
                  ? 'Use "Receive items" to record the first delivery on Model 19.'
                  : 'Assets appear here once they are received into store.'
                : 'Try a different filter or search.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className={table.headRow}>
                  <tr>
                    <th className="px-3 py-2.5 min-w-[200px]">Asset</th>
                    <th className="px-3 py-2.5 w-36">Status</th>
                    <th className="px-3 py-2.5 w-20 text-right">Qty</th>
                    <th className="px-3 py-2.5 min-w-[170px]">Held by / where</th>
                    <th className="px-3 py-2.5 w-36 whitespace-nowrap">Model 19 slip</th>
                    <th className="px-3 py-2.5 w-28 text-right whitespace-nowrap">Unit cost</th>
                    <th className={`px-3 py-2.5 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map((row) => {
                    const { item } = row;
                    const parent = item.parentItemId ? items.find((i) => i.id === item.parentItemId) : undefined;
                    return (
                      <tr key={item.id} className={item.id === lastTouchedId ? table.rowHighlight : table.row}>
                        <td className="px-3 py-2.5">
                          <span className="block font-medium text-slate-900">{item.name}</span>
                          <span className={`block ${table.code}`}>{item.itemCode}</span>
                          {parent && <span className="block text-[10px] text-slate-500">Part of {parent.itemCode}</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <AssetStatus row={row} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {row.units}
                          <span className="ml-1 text-[10px] font-normal uppercase text-slate-500">{item.uom || 'EA'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <span className="block">{row.where}</span>
                          {row.goingTo && <span className="block text-[10px] text-amber-800">→ {row.goingTo}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          <span className="block">{item.ifmisSlipNumber || '—'}</span>
                          <span className="block text-[10px] text-slate-400">{item.ifmisSlipDateGc || String(item.createdAtGc || '').slice(0, 10) || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">{formatETB(item.unitCostETB)}</td>
                        <td className={`px-3 py-2.5 ${table.actionsCell}`}>
                          <RowActionsMenu label={item.itemCode} actions={actionsFor(row)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pager={pager} label="assets" />
          </>
        )}
      </div>

      {/* ── Receive (Model 19) ── */}
      <Modal
        isOpen={!!receipt}
        onClose={() => setReceipt(null)}
        title={receipt?.edit ? `Edit receipt · ${receipt.edit.itemCode}` : 'Receive items · Model 19'}
        subtitle={
          receipt?.edit
            ? 'Corrections are allowed until the Team Leader endorses it. Every change is recorded in the item history and audit log.'
            : 'The items are held as pending until the Team Leader endorses and the Department Head approves the receipt.'
        }
        size="2xl"
      >
        {receipt &&
          (locations.length > 0 ? (
            <StockInForm
              key={receipt.edit?.id ?? 'new'}
              locations={locations}
              employees={employees}
              editItem={receipt.edit}
              onCancel={() => setReceipt(null)}
              onSuccess={(result, voucher) => {
                setReceipt(null);
                saved(result?.item?.id ?? result?.items?.[0]?.id);
                if (voucher) setVoucher19(voucher);
              }}
            />
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
              No active store was found. Ask the System Administrator to add one under Settings → Stores, then reload.
            </div>
          ))}
      </Modal>

      {/* ── Issue (Model 22) ── */}
      <Modal
        isOpen={!!issue}
        onClose={() => setIssue(null)}
        title={issue?.edit ? `Edit issue · ${issue.edit.itemCode}` : 'Issue from store · Model 22'}
        subtitle={
          issue?.edit
            ? 'You can correct this request until the Team Leader endorses it. Each change is recorded in the item history.'
            : 'The item stays in store until the Team Leader endorses and the Department Head approves the issue.'
        }
        size="xl"
      >
        {issue && (
          <StockOutForm
            key={issue.edit?.id ?? issue.itemId ?? 'new'}
            availableItems={availableItems}
            departments={departments}
            employees={employees}
            editApproval={issue.edit}
            editItem={issueItem}
            initialItemId={issue.itemId}
            onCancel={() => setIssue(null)}
            onSuccess={(result, voucher) => {
              setIssue(null);
              saved(result?.itemId ?? issue.itemId);
              if (voucher) setVoucher22(voucher);
            }}
          />
        )}
      </Modal>

      {/* ── Transfer (Model 21) ── */}
      <Modal
        isOpen={!!transfer}
        onClose={() => setTransfer(null)}
        title={transfer?.edit ? `Edit transfer · ${transfer.edit.itemCode}` : 'Transfer · Model 21'}
        subtitle={
          transfer?.edit
            ? 'You can correct this transfer until the Team Leader endorses it. Each change is recorded in the item history.'
            : 'Custody moves to the new holder only after the Team Leader endorses and the Department Head approves it.'
        }
        size="xl"
      >
        {transfer && (
          <TransferForm
            key={transfer.edit?.id ?? transfer.itemId ?? 'new'}
            items={items}
            employees={employees}
            departments={departments}
            locations={locations}
            pendingByItem={pendingByItem}
            editTransfer={transfer.edit}
            initialItemId={transfer.itemId}
            onCancel={() => setTransfer(null)}
            onSaved={(voucher) => {
              const itemId = transfer.edit?.itemId ?? transfer.itemId;
              setTransfer(null);
              saved(itemId);
              if (voucher) setVoucher21(voucher);
            }}
          />
        )}
      </Modal>

      {/* ── Return to store (Model 21) ── */}
      <ReturnToStoreModal
        isOpen={!!returning}
        item={returning?.item ?? null}
        employees={employees}
        editApproval={returning?.edit}
        onClose={() => setReturning(null)}
        onSuccess={(voucher) => {
          const itemId = returning?.item.id;
          setReturning(null);
          saved(itemId);
          if (voucher) setVoucher21(voucher);
        }}
      />

      {viewing && <RecordDetailModal itemId={viewing.itemId} approval={viewing.approval} onClose={() => setViewing(null)} />}

      <Model19PrintModal isOpen={!!voucher19} voucher={voucher19} onClose={() => setVoucher19(null)} />
      <Model22PrintModal isOpen={!!voucher22} voucher={voucher22} onClose={() => setVoucher22(null)} />
      <Model21PrintModal isOpen={!!voucher21} voucher={voucher21} onClose={() => setVoucher21(null)} />
    </div>
  );
};
