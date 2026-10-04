import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  PackageMinus,
  ArrowRightLeft,
  RotateCcw,
  Eye,
  Pencil,
  Printer,
  ChevronRight,
  X,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { CloseButton } from '../components/ui/CloseButton';
import { FilterPopover, FilterSection, FilterPill, FilterSelect } from '../components/ui/FilterPopover';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu, RowAction } from '../components/ui/RowActionsMenu';
import { AssetRecord } from '../components/assets/AssetRecord';
import { ReturnForm } from '../components/ui/ReturnToStoreModal';
import { Model19PrintModal } from '../components/ui/Model19PrintModal';
import { Model22PrintModal } from '../components/ui/Model22PrintModal';
import { Model21PrintModal } from '../components/ui/Model21PrintModal';
import { StockInForm, buildModel19Voucher } from '../components/assets/ReceiptForm';
import { StockOutForm, buildModel22Voucher } from '../components/assets/IssueForm';
import { TransferForm, buildModel21Voucher } from '../components/assets/TransferForm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
import {
  AssetGroup,
  AssetRow,
  AssetState,
  AssetStatus,
  CATEGORY_OPTIONS,
  ENDORSED_REASON,
  REQUEST_LABELS,
  ShownGroup,
  decidedOn,
} from '../components/assets/asset-state';

type AssetFilter = 'ALL' | 'IN_STORE' | 'ISSUED' | 'PENDING' | 'REJECTED';
const FILTERS: { value: AssetFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_STORE', label: 'In store' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
];

export type SortColumn = 'activity' | 'name' | 'status' | 'units' | 'where' | 'slip' | 'cost';
export type SortDirection = 'asc' | 'desc';

interface AssetsPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const AssetsPage: React.FC<AssetsPageProps> = () => {
  const { user } = useAuth();
  const toast = useToast();
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
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('activity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'cost' || col === 'units' || col === 'activity' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortColumn === col) {
      return sortDirection === 'asc' ? (
        <ArrowUp className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
      );
    }
    return <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 shrink-0 opacity-40 group-hover:opacity-100 transition" aria-hidden="true" />;
  };

  // Pop-ups: one per form, each either new (from a row or the header) or correcting a pending request
  const [receipt, setReceipt] = useState<{ edit?: ItemWithRelations } | null>(null);
  const [issue, setIssue] = useState<{ itemId?: string; edit?: TransactionApproval } | null>(null);
  const [transfer, setTransfer] = useState<{ itemId?: string; edit?: TransactionApproval } | null>(null);
  const [returning, setReturning] = useState<{ item: ItemWithRelations; edit?: TransactionApproval } | null>(null);
  // The asset record open beside the list, and whether what it has pending is being corrected in place
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const closeRecord = () => {
    setSelectedId(null);
    setReceipt(null);
    setReturning(null);
    setTransfer(null);
    setIssue(null);
    setEditing(false);
  };
  const openReceipt = (edit?: ItemWithRelations) => {
    setSelectedId(null);
    setReturning(null);
    setTransfer(null);
    setIssue(null);
    setEditing(false);
    setReceipt({ edit });
  };
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

  useEffect(() => {
    const handleUpdate = () => {
      fetchData(true);
    };
    window.addEventListener('moa_approvals_updated', handleUpdate);
    return () => window.removeEventListener('moa_approvals_updated', handleUpdate);
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

  const inFilter = (row: AssetRow, f: AssetFilter, locId = locationFilter, cat = categoryFilter) => {
    const matchesState =
      f === 'ALL' ||
      (f === 'PENDING'
        ? row.state === 'RECEIPT_PENDING' || row.state === 'REQUEST_PENDING'
        : f === 'REJECTED'
          ? row.state === 'REJECTED' || !!row.rejected
          : row.state === f);
    if (!matchesState) return false;

    if (locId !== 'ALL' && row.item.storeLocationId !== locId) {
      return false;
    }

    if (cat !== 'ALL' && row.item.category !== cat) {
      return false;
    }

    return true;
  };

  // A batch is one row; the units issued from it fold underneath
  const groups = useMemo<AssetGroup[]>(() => {
    const ids = new Set(rows.map((r) => r.item.id));
    const units = new Map<string, AssetRow[]>();
    const tops: AssetRow[] = [];
    for (const r of rows) {
      const parentId = r.item.parentItemId;
      if (parentId && ids.has(parentId)) units.set(parentId, [...(units.get(parentId) ?? []), r]);
      else tops.push(r);
    }
    return tops
      .map((row) => {
        const children = (units.get(row.item.id) ?? []).sort((a, b) => a.item.itemCode.localeCompare(b.item.itemCode, undefined, { numeric: true }));
        const activity = [row, ...children].reduce((latest, r) => (r.activity > latest ? r.activity : latest), row.activity);
        return { row, children, activity };
      })
      .sort((a, b) => b.activity.localeCompare(a.activity) || a.row.item.itemCode.localeCompare(b.row.item.itemCode));
  }, [rows]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (row: AssetRow) => {
    if (!q) return true;
    const { item } = row;
    return [item.name, item.itemCode, item.serialNumber, item.ifmisSlipNumber, item.itemCategoryDisplay, item.category, row.where, row.goingTo, row.request?.ifmisSlipNumber]
      .some((v) => (v || '').toLowerCase().includes(q));
  };
  /** The batch shows when it or any of its units matches; with a filter or search, only the matching units unfold */
  const visibleGroup = (g: AssetGroup, f: AssetFilter, locId = locationFilter, cat = categoryFilter): ShownGroup | null => {
    const hits = g.children.filter((c) => inFilter(c, f, locId, cat) && matchesSearch(c));
    const self = inFilter(g.row, f, locId, cat) && matchesSearch(g.row);
    if (!self && hits.length === 0) return null;
    const narrowed = f !== 'ALL' || locId !== 'ALL' || cat !== 'ALL' || !!q;
    return { ...g, units: narrowed ? hits : g.children, forceOpen: narrowed && hits.length > 0 };
  };
  const shown = useMemo(
    () => groups.map((g) => visibleGroup(g, filter, locationFilter, categoryFilter)).filter((g): g is ShownGroup => !!g),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, filter, locationFilter, categoryFilter, search],
  );

  const sortedShown = useMemo(() => {
    const list = [...shown];
    if (sortColumn === 'activity') {
      return list.sort((a, b) => {
        const cmp = b.activity.localeCompare(a.activity) || a.row.item.itemCode.localeCompare(b.row.item.itemCode);
        return sortDirection === 'desc' ? cmp : -cmp;
      });
    }

    return list.sort((a, b) => {
      let res = 0;
      switch (sortColumn) {
        case 'name': {
          const aVal = (a.row.item.name || '') + ' ' + (a.row.item.itemCode || '');
          const bVal = (b.row.item.name || '') + ' ' + (b.row.item.itemCode || '');
          res = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'status': {
          const aVal = a.row.state || '';
          const bVal = b.row.state || '';
          res = aVal.localeCompare(bVal);
          break;
        }
        case 'units': {
          const aVal = a.row.units ?? 0;
          const bVal = b.row.units ?? 0;
          res = aVal - bVal;
          break;
        }
        case 'where': {
          const aVal = a.row.where || '';
          const bVal = b.row.where || '';
          res = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
          break;
        }
        case 'slip': {
          const aVal = a.row.item.ifmisSlipNumber || '';
          const bVal = b.row.item.ifmisSlipNumber || '';
          res = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'cost': {
          const aVal = a.row.item.unitCostETB ?? 0;
          const bVal = b.row.item.unitCostETB ?? 0;
          res = aVal - bVal;
          break;
        }
      }
      if (res === 0) {
        res = a.row.item.itemCode.localeCompare(b.row.item.itemCode);
      }
      return sortDirection === 'asc' ? res : -res;
    });
  }, [shown, sortColumn, sortDirection]);

  const pager = usePagination(sortedShown, { resetKey: `${filter}|${locationFilter}|${categoryFilter}|${search}|${sortColumn}|${sortDirection}` });
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
  const toggleBatch = (id: string) =>
    setOpenBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });


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
    window.dispatchEvent(new CustomEvent('moa_approvals_updated'));
  };

  /** Open a record in view mode with its actions in the toolbar */
  const openRecord = (itemId: string) => {
    setReceipt(null);
    setReturning(null);
    setTransfer(null);
    setIssue(null);
    setSelectedId(itemId);
    setEditing(false);
  };

  /** Open a record straight into correcting what it has pending (its receipt or its request) */
  const editInRecord = (itemId: string) => {
    setSelectedId(itemId);
    setEditing(true);
  };

  /**
   * The form that corrects what a record has pending, shown in place of its details and saved from the record's
   * toolbar. Only a receipt or request still with the Team Leader can be corrected.
   */
  const editFormFor = (row: AssetRow): { id: string; form: React.ReactNode } | undefined => {
    const { item, request } = row;
    const done = (voucher?: unknown, print?: (v: any) => void) => {
      setEditing(false);
      setReturning(null);
      setTransfer(null);
      setIssue(null);
      saved(item.id);
      if (voucher && print) print(voucher);
    };
    const common = { hideFooter: true, onSubmittingChange: setEditSaving };
    if (row.state === 'RECEIPT_PENDING') {
      return {
        id: 'stock-in-form',
        form: (
          <StockInForm
            key={item.id}
            locations={locations}
            employees={employees}
            editItem={item}
            {...common}
            onCancel={() => setEditing(false)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher19)}
          />
        ),
      };
    }
    if (returning && returning.item.id === item.id) {
      return {
        id: 'return-form',
        form: (
          <ReturnForm
            key={`return-${item.id}`}
            isOpen
            inline
            item={item}
            employees={employees}
            editApproval={returning.edit}
            onSubmittingChange={setEditSaving}
            onClose={() => setReturning(null)}
            onSuccess={(voucher) => done(voucher, setVoucher21)}
          />
        ),
      };
    }
    if (transfer && (transfer.itemId === item.id || transfer.edit?.itemId === item.id)) {
      return {
        id: 'transfer-form',
        form: (
          <TransferForm
            key={transfer.edit?.id ?? `transfer-${item.id}`}
            items={items}
            employees={employees}
            departments={departments}
            locations={locations}
            pendingByItem={pendingByItem}
            editTransfer={transfer.edit}
            initialItemId={item.id}
            {...common}
            onCancel={() => setTransfer(null)}
            onSaved={(voucher) => done(voucher, setVoucher21)}
          />
        ),
      };
    }
    if (issue && (issue.itemId === item.id || issue.edit?.itemId === item.id)) {
      return {
        id: 'stock-out-form',
        form: (
          <StockOutForm
            key={issue.edit?.id ?? `issue-${item.id}`}
            availableItems={availableItems}
            departments={departments}
            employees={employees}
            editApproval={issue.edit}
            editItem={item}
            initialItemId={item.id}
            {...common}
            onCancel={() => setIssue(null)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher22)}
          />
        ),
      };
    }
    if (row.state !== 'REQUEST_PENDING' || !request) return undefined;
    if (request.transactionType === 'STOCK_OUT') {
      return {
        id: 'stock-out-form',
        form: (
          <StockOutForm
            key={request.id}
            availableItems={availableItems}
            departments={departments}
            employees={employees}
            editApproval={request}
            editItem={item}
            {...common}
            onCancel={() => setEditing(false)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher22)}
          />
        ),
      };
    }
    if (request.transactionType === 'TRANSFER') {
      return {
        id: 'transfer-form',
        form: (
          <TransferForm
            key={request.id}
            items={items}
            employees={employees}
            departments={departments}
            locations={locations}
            pendingByItem={pendingByItem}
            editTransfer={request}
            {...common}
            onCancel={() => setEditing(false)}
            onSaved={(voucher) => done(voucher, setVoucher21)}
          />
        ),
      };
    }
    if (request.transactionType === 'RETURN') {
      return {
        id: 'return-form',
        form: (
          <ReturnForm
            key={request.id}
            isOpen
            inline
            item={item}
            employees={employees}
            editApproval={request}
            onSubmittingChange={setEditSaving}
            onClose={() => setEditing(false)}
            onSuccess={(voucher) => done(voucher, setVoucher21)}
          />
        ),
      };
    }
    return undefined;
  };

  const actionsFor = (row: AssetRow): RowAction[] => {
    const { item, request } = row;
    const view: RowAction = { label: 'View details', icon: Eye, onClick: () => openRecord(item.id) };
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
            // Corrected in place, in the asset's record
            onClick: () => editInRecord(item.id),
            hidden: !canReceive || !request,
            disabled: request?.currentStage === 2,
            reason: request?.currentStage === 2 ? ENDORSED_REASON : undefined,
          },
          view,
          printReceipt,
        ];
      case 'IN_STORE':
        return [
          {
            label: 'Issue (Model 22)',
            icon: PackageMinus,
            onClick: () => {
              setSelectedId(item.id);
              setIssue({ itemId: item.id });
              setTransfer(null);
              setReturning(null);
            },
            hidden: !canIssue,
          },
          view,
          printReceipt,
          { ...printMove, hidden: row.lastMove?.transactionType !== 'RETURN' },
        ];
      case 'ISSUED':
        return [
          {
            label: 'Transfer (Model 21)',
            icon: ArrowRightLeft,
            onClick: () => {
              setSelectedId(item.id);
              setTransfer({ itemId: item.id });
              setIssue(null);
              setReturning(null);
            },
            hidden: !canTransfer,
          },
          {
            label: 'Return to store (Model 21)',
            icon: RotateCcw,
            onClick: () => {
              setSelectedId(item.id);
              setReturning({ item });
              setTransfer(null);
              setIssue(null);
            },
            hidden: !canTransfer,
          },
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
            onClick: () => editInRecord(item.id),
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
        <button onClick={() => fetchData()} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-[3px] transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }

  /** Units of a whole batch, from the registration's balance (it covers the records issued from it) */
  const batchSummary = (row: AssetRow, children: AssetRow[]) => {
    const { item } = row;
    const out = children.filter((c) => c.item.status === ItemStatus.ISSUED || c.item.status === ItemStatus.UNDER_TRANSFER);
    const issuedUnits = item.balance?.issued ?? out.reduce((acc, c) => acc + c.units, 0) + (row.state === 'ISSUED' ? row.units : 0);
    const inStoreUnits = item.balance?.available ?? (row.state === 'ISSUED' ? 0 : row.units) + children.filter((c) => c.state === 'IN_STORE').reduce((acc, c) => acc + c.units, 0);
    const totalUnits = item.balance?.total ?? issuedUnits + inStoreUnits;
    return {
      isBatch: children.length > 0,
      out,
      issuedUnits,
      inStoreUnits,
      totalUnits,
      holders: [...new Set(out.map((c) => c.where))],
      partly: children.length > 0 && issuedUnits > 0 && inStoreUnits > 0,
    };
  };

  const handleExportCSV = () => {
    if (sortedShown.length === 0) {
      toast.warning('No Records', 'There are no assets matching current filters to export.');
      return;
    }
    try {
      const headers = [
        '#',
        'Asset Code',
        'Asset Name',
        'Category',
        'Status',
        'UoM',
        'Total Quantity',
        'In Store Quantity',
        'Issued Quantity',
        'Held By / Where',
        'Model 19 Slip #',
        'Slip Date (G.C.)',
        'Unit Cost (ETB)',
        'Total Value (ETB)',
      ];

      const csvRows = sortedShown.map((group, index) => {
        const { item } = group.row;
        const children = group.children ?? [];
        const { isBatch, totalUnits, inStoreUnits, issuedUnits, holders } = batchSummary(group.row, children);
        const uom = item.uom || 'EA';
        const totalValue = (item.unitCostETB || 0) * (isBatch ? totalUnits : group.row.units);
        const whereText = isBatch && group.row.state !== 'ISSUED' && inStoreUnits === 0
          ? '—'
          : group.row.where || '';
        const custodySummary = isBatch && issuedUnits > 0
          ? `${whereText} (${issuedUnits} with ${holders.join('; ')})`
          : whereText;

        return [
          index + 1,
          `"${item.itemCode}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.category || ''}"`,
          `"${group.row.state}"`,
          `"${uom}"`,
          isBatch ? totalUnits : group.row.units,
          isBatch ? inStoreUnits : (group.row.state === 'IN_STORE' ? group.row.units : 0),
          isBatch ? issuedUnits : (group.row.state === 'ISSUED' ? group.row.units : 0),
          `"${custodySummary.replace(/"/g, '""')}"`,
          `"${item.ifmisSlipNumber || ''}"`,
          `"${item.ifmisSlipDateGc || String(item.createdAtGc || '').slice(0, 10)}"`,
          item.unitCostETB || 0,
          totalValue,
        ];
      });

      const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `moa-assets-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV Exported', `Exported ${sortedShown.length} asset records.`);
    } catch {
      toast.error('Export Failed', 'Failed to generate asset spreadsheet.');
    }
  };

  /**
   * One table row. A batch with issued units shows the whole batch (received · issued · in store) and a toggle
   * for those units; a unit listed under its batch is indented.
   */
  const renderRow = (row: AssetRow, batch?: { group: ShownGroup; open: boolean }) => {
    const { item } = row;
    const uom = item.uom || 'EA';
    const nested = !batch && !!item.parentItemId && rows.some((r) => r.item.id === item.parentItemId);
    const orphanParent = !batch && !nested && item.parentItemId ? items.find((i) => i.id === item.parentItemId) : undefined;
    const children = batch?.group.children ?? [];
    const { isBatch, out, issuedUnits, inStoreUnits, totalUnits, holders } = batchSummary(row, children);

    return (
      <tr
        key={item.id}
        tabIndex={0}
        aria-label={`Open ${item.itemCode}`}
        // The whole row opens the record; its own buttons (the toggle, ⋮) keep their meaning
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a, input')) openRecord(item.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) openRecord(item.id);
        }}
        className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
          item.id === lastTouchedId ? table.rowHighlight : nested ? 'bg-slate-50/70 hover:bg-slate-100/70 transition' : table.row
        }`}
      >
        <td className={`py-2 pr-3 ${nested ? 'pl-8' : 'pl-3'}`}>
          <span className="block font-medium text-slate-900">
            {nested && <span className="mr-1 text-slate-400" aria-hidden="true">↳</span>}
            {item.name}
          </span>
          <span className={`block ${table.code}`}>{item.itemCode}</span>
          {orphanParent && <span className="block text-[10px] text-slate-500">Part of {orphanParent.itemCode}</span>}
          {isBatch && (
            <button
              type="button"
              onClick={() => toggleBatch(item.id)}
              aria-expanded={batch!.open}
              className="mt-1 inline-flex items-center gap-1 rounded-md text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${batch!.open ? 'rotate-90' : ''}`} />
              {batch!.open ? 'Hide' : 'Show'} {children.length} issued {children.length === 1 ? 'record' : 'records'}
            </button>
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <AssetStatus row={row} partly={isBatch && issuedUnits > 0 && inStoreUnits > 0} />
        </td>
        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
          {isBatch ? totalUnits : row.units}
          <span className="ml-1 text-[10px] font-normal uppercase text-slate-500">{uom}</span>
          {isBatch && (
            <span className="block font-sans text-[10px] font-normal text-slate-500">
              {issuedUnits} issued · {inStoreUnits} in store
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-slate-700">
          <span className="block">{isBatch && row.state !== 'ISSUED' && inStoreUnits === 0 ? '—' : row.where}</span>
          {row.goingTo && <span className="block text-[10px] text-amber-800">→ {row.goingTo}</span>}
          {isBatch && out.length > 0 && (
            <span className="block text-[10px] text-slate-500">
              {out.reduce((acc, c) => acc + c.units, 0)} with {holders.length === 1 ? holders[0] : `${holders.length} people`}
            </span>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
          <span className="block">{item.ifmisSlipNumber || '—'}</span>
          <span className="block text-[10px] text-slate-400">{item.ifmisSlipDateGc || String(item.createdAtGc || '').slice(0, 10) || '—'}</span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">{formatETB(item.unitCostETB)}</td>
        <td className={`px-3 py-2 ${table.actionsCell} ${nested ? '!bg-slate-50' : ''}`}>
          <RowActionsMenu label={item.itemCode} actions={actionsFor(row)} />
        </td>
      </tr>
    );
  };

  // ── The open record ──
  const selectedRow = selectedId ? rows.find((r) => r.item.id === selectedId) : undefined;
  const selectedGroup = selectedRow
    ? groups.find((g) => g.row.item.id === selectedRow.item.id || g.children.some((c) => c.item.id === selectedRow.item.id))
    : undefined;
  const selectedIsBatch = !!selectedGroup && selectedGroup.row.item.id === selectedRow?.item.id;
  const selectedUnits = selectedIsBatch ? selectedGroup!.children : [];
  const selectedSummary = selectedRow ? batchSummary(selectedRow, selectedUnits) : undefined;
  // Requests made on this record, and the issue that created it when it is a unit split off a batch
  const selectedRequests = selectedRow
    ? approvals
        .filter((a) => a.itemId === selectedRow.item.id || a.requestDetails?.issuedItemCode === selectedRow.item.itemCode)
        .sort((a, b) => String(b.createdAtGc).localeCompare(String(a.createdAtGc)))
    : [];

  /** A line in the list beside an open record */
  const listEntry = (row: AssetRow, opts: { partly?: boolean; nested?: boolean } = {}) => {
    const selected = row.item.id === selectedId;
    return (
      <button
        key={row.item.id}
        id={`asset-list-item-${row.item.id}`}
        type="button"
        onClick={() => openRecord(row.item.id)}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-start justify-between gap-1.5 border-l-4 py-2 pr-2.5 text-left transition cursor-pointer ${opts.nested ? 'pl-5' : 'pl-2.5'} ${
          selected ? 'border-emerald-600 bg-emerald-50' : 'border-transparent hover:bg-slate-50'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-900">
            {opts.nested && <span className="mr-1 text-slate-400" aria-hidden="true">↳</span>}
            {row.item.name}
          </span>
          <span className="block font-mono text-[10px] font-bold text-slate-600 truncate">{row.item.itemCode}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <AssetStatus row={{ ...row, rejected: undefined }} partly={opts.partly} />
          <span className="font-mono text-[9px] text-slate-500">
            {row.units} {row.item.uom || 'EA'}
          </span>
        </span>
      </button>
    );
  };

  // ── Keyboard Navigation in Master-Detail View ──
  const flatSelectableIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of sortedShown) {
      ids.push(g.row.item.id);
      const open = g.forceOpen || g.row.item.id === selectedId || g.children.some((c) => c.item.id === selectedId);
      if (open) {
        for (const u of g.units) {
          ids.push(u.item.id);
        }
      }
    }
    return ids;
  }, [sortedShown, selectedId]);

  useEffect(() => {
    if (!selectedId && !receipt) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in inputs or when a modal is active
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (voucher19 || voucher21 || voucher22 || issue || transfer || returning) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (receipt) setReceipt(null);
        else if (returning) setReturning(null);
        else if (transfer) setTransfer(null);
        else if (issue) setIssue(null);
        else closeRecord();
        return;
      }

      if (!selectedId) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const currIdx = flatSelectableIds.indexOf(selectedId);
        if (currIdx !== -1 && currIdx < flatSelectableIds.length - 1) {
          openRecord(flatSelectableIds[currIdx + 1]);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const currIdx = flatSelectableIds.indexOf(selectedId);
        if (currIdx > 0) {
          openRecord(flatSelectableIds[currIdx - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, flatSelectableIds, voucher19, voucher21, voucher22, receipt, issue, transfer, returning]);

  useEffect(() => {
    if (selectedId) {
      const el = document.getElementById(`asset-list-item-${selectedId}`);
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedId]);


  const activeFilterCount =
    (filter !== 'ALL' ? 1 : 0) +
    (locationFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0);

  const issueItem = issue?.edit ? items.find((i) => i.id === issue.edit!.itemId) : undefined;
  const availableItems = items.filter((i) => i.status === ItemStatus.AVAILABLE && !pendingByItem.has(i.id));

  return (
    <div className="space-y-2.5 animate-fadeIn pb-1">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2">
        <p className="text-xs text-slate-500">
          Every asset from receipt to custody. Receive on Model 19, issue on Model 22, then transfer or return on Model 21.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Reusable Filter Popover */}
          <FilterPopover
            label="Filter"
            ariaLabel="Filter assets"
            title="Filters"
            resetLabel="Reset"
            activeCount={activeFilterCount}
            onReset={() => {
              setFilter('ALL');
              setLocationFilter('ALL');
              setCategoryFilter('ALL');
            }}
            resultCountText={`${sortedShown.length} ${sortedShown.length === 1 ? 'group' : 'groups'}`}
          >
            {/* Status Filter */}
            <FilterSection label="Lifecycle Status">
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {FILTERS.map((f) => (
                  <FilterPill
                    key={f.value}
                    label={f.label}
                    count={groups.filter((g) => visibleGroup(g, f.value, locationFilter, categoryFilter)).length}
                    active={filter === f.value}
                    onClick={() => setFilter(f.value)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* Store & Location */}
            <FilterSection label="Store & Custody Location" htmlFor="filter-store-location">
              <FilterSelect
                id="filter-store-location"
                ariaLabel="Filter by store location"
                placeholder="All Stores & Locations"
                value={locationFilter}
                onChange={setLocationFilter}
                options={locations.map((loc) => ({
                  value: loc.id,
                  label: storeLocationLabel(loc),
                }))}
              />
            </FilterSection>

            {/* Asset Category */}
            <FilterSection label="Asset Category" htmlFor="filter-asset-category">
              <FilterSelect
                id="filter-asset-category"
                ariaLabel="Filter by asset category"
                placeholder="All Categories"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={CATEGORY_OPTIONS}
              />
            </FilterSection>
          </FilterPopover>

          <button
            type="button"
            onClick={handleExportCSV}
            title="Export filtered assets to CSV"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {selectedRow || receipt ? (
        /* ── Split view: the list on the left, the open record or registration on the right ── */
        <div className="grid items-start gap-3 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)]">
          <aside aria-label="Asset list" className="hidden lg:flex flex-col lg:h-[calc(100vh-10rem)] lg:sticky lg:top-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="shrink-0 space-y-1.5 border-b border-slate-200 p-2.5 bg-white z-10">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    aria-label="Search assets"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search assets…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                {canReceive && (
                  <button
                    type="button"
                    onClick={() => openReceipt()}
                    title="Receive items (Model 19)"
                    aria-label="Receive items (Model 19)"
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold transition cursor-pointer ${
                      receipt && !receipt.edit
                        ? 'border-emerald-800 bg-emerald-800 text-white shadow-xs'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-900 active:scale-95'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5 px-0.5">
                <span>↑/↓ or j/k to navigate</span>
                <span>Esc to close</span>
              </div>
            </div>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {sortedShown.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">No assets match.</li>}
              {sortedShown.map((group) => {
                const open =
                  group.forceOpen || group.row.item.id === selectedId || group.children.some((c) => c.item.id === selectedId);
                return (
                  <li key={group.row.item.id}>
                    {listEntry(group.row, { partly: batchSummary(group.row, group.children).partly })}
                    {open && group.units.map((unit) => listEntry(unit, { nested: true }))}
                  </li>
                );
              })}
            </ul>
          </aside>

          {receipt ? (
            <section
              aria-label="Receive items"
              className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:h-[calc(100vh-10rem)] lg:sticky lg:top-4"
            >
              {/* Fishbowl TitleBar */}
              <header className="shrink-0 relative space-y-2 border-b border-slate-200 px-5 py-4 bg-white z-10">
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer lg:hidden"
                >
                  <ArrowLeft className="h-3 w-3" /> All assets
                </button>
                <CloseButton
                  onClose={() => setReceipt(null)}
                  label="Close registration"
                  title="Close (Esc)"
                  className="absolute right-3 top-3 hidden lg:inline-flex"
                />
                <div className="flex flex-col gap-3 lg:pr-8 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {receipt.edit ? `Edit receipt · ${receipt.edit.itemCode}` : 'Receive items · Model 19'}
                      </h3>
                      <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {receipt.edit ? 'Correction' : 'New Delivery'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {receipt.edit
                        ? 'Corrections are allowed until the Team Leader endorses it. Every change is recorded in the item history and audit log.'
                        : 'The items are held as pending until the Team Leader endorses and the Department Head approves the receipt.'}
                    </p>
                  </div>
                  <div role="toolbar" aria-label="Receipt actions" className="flex flex-wrap items-center gap-2 2xl:justify-end">
                    <button
                      type="submit"
                      form="stock-in-form"
                      disabled={receiptSaving}
                      className={`${btn.primary} disabled:opacity-60`}
                    >
                      <Check className="h-4 w-4" />
                      {receiptSaving ? 'Saving…' : receipt.edit ? 'Save changes' : 'Submit for approval'}
                    </button>
                    <button type="button" onClick={() => setReceipt(null)} className={btn.secondary}>
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              </header>

              <div className="flex-1 p-5 overflow-y-auto">
                {locations.length > 0 ? (
                  <StockInForm
                    key={receipt.edit?.id ?? 'new'}
                    locations={locations}
                    employees={employees}
                    editItem={receipt.edit}
                    hideFooter
                    onSubmittingChange={setReceiptSaving}
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
                )}
              </div>
            </section>
          ) : selectedRow ? (
            <AssetRecord
              row={selectedRow}
              units={selectedUnits}
              batch={selectedGroup && !selectedIsBatch ? selectedGroup.row : undefined}
              partly={!!selectedSummary?.partly}
              totals={
                selectedSummary?.isBatch
                  ? { total: selectedSummary.totalUnits, issued: selectedSummary.issuedUnits, inStore: selectedSummary.inStoreUnits }
                  : undefined
              }
              requests={selectedRequests}
              actions={actionsFor(selectedRow).filter((a) => a.label !== 'View details')}
              editForm={
                editing ||
                (returning && returning.item.id === selectedRow.item.id) ||
                (transfer && (transfer.itemId === selectedRow.item.id || transfer.edit?.itemId === selectedRow.item.id)) ||
                (issue && (issue.itemId === selectedRow.item.id || issue.edit?.itemId === selectedRow.item.id))
                  ? editFormFor(selectedRow)?.form
                  : undefined
              }
              editFormId={
                editing ||
                (returning && returning.item.id === selectedRow.item.id) ||
                (transfer && (transfer.itemId === selectedRow.item.id || transfer.edit?.itemId === selectedRow.item.id)) ||
                (issue && (issue.itemId === selectedRow.item.id || issue.edit?.itemId === selectedRow.item.id))
                  ? editFormFor(selectedRow)?.id
                  : undefined
              }
              saving={editSaving}
              onCancelEdit={() => {
                setEditing(false);
                setReturning(null);
                setTransfer(null);
                setIssue(null);
              }}
              onPrintRequest={(r) => printRequest(r, selectedRow.item)}
              onPrintReceipt={() => setVoucher19(buildModel19Voucher(selectedRow.item, items))}
              onSelect={openRecord}
              onClose={closeRecord}
            />
          ) : null}
        </div>
      ) : (
        /* ── Register ── */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-2.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
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
            {canReceive && (
              <button
                type="button"
                onClick={() => openReceipt()}
                className={`${btn.primary} shrink-0`}
              >
                <Plus className="w-4 h-4" />
                <span>Receive items (Model 19)</span>
              </button>
            )}
          </div>

          {/* Active Filter Chips (if any filter, search, or sort is active) */}
          {(locationFilter !== 'ALL' || categoryFilter !== 'ALL' || filter !== 'ALL' || search || sortColumn !== 'activity' || sortDirection !== 'desc') && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-xs">
              <span className="text-[11px] font-semibold text-slate-500">Active filters:</span>
              {locationFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Store: {storeLocationLabel(locations.find((l) => l.id === locationFilter) || ({ nameEn: locationFilter } as any))}</span>
                  <button
                    type="button"
                    onClick={() => setLocationFilter('ALL')}
                    title="Remove store filter"
                    aria-label="Remove store filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {categoryFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Category: {CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label || categoryFilter}</span>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('ALL')}
                    title="Remove category filter"
                    aria-label="Remove category filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Status: {FILTERS.find((f) => f.value === filter)?.label || filter}</span>
                  <button
                    type="button"
                    onClick={() => setFilter('ALL')}
                    title="Remove status filter"
                    aria-label="Remove status filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Search: "{search}"</span>
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    title="Clear search"
                    aria-label="Clear search"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {(sortColumn !== 'activity' || sortDirection !== 'desc') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Sorted by: {sortColumn} ({sortDirection})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSortColumn('activity');
                      setSortDirection('desc');
                    }}
                    title="Reset sort"
                    aria-label="Reset sort"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setFilter('ALL');
                  setLocationFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearch('');
                  setSortColumn('activity');
                  setSortDirection('desc');
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-700 hover:underline cursor-pointer ml-1"
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
            Loading assets…
          </div>
        ) : sortedShown.length === 0 ? (
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
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilter('ALL');
                  setLocationFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearch('');
                  setSortColumn('activity');
                  setSortDirection('desc');
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className={table.headRow}>
                  <tr>
                    <th className="px-3 py-2 min-w-[200px]" aria-sort={sortColumn === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className="group inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Asset name"
                      >
                        Asset
                        {renderSortIcon('name')}
                      </button>
                    </th>
                    <th className="px-3 py-2 w-36" aria-sort={sortColumn === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className="group inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Status"
                      >
                        Status
                        {renderSortIcon('status')}
                      </button>
                    </th>
                    <th className="px-3 py-2 w-20 text-right" aria-sort={sortColumn === 'units' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('units')}
                        className="group ml-auto inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Quantity"
                      >
                        Qty
                        {renderSortIcon('units')}
                      </button>
                    </th>
                    <th className="px-3 py-2 min-w-[170px]" aria-sort={sortColumn === 'where' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('where')}
                        className="group inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Location or Custodian"
                      >
                        Held by / where
                        {renderSortIcon('where')}
                      </button>
                    </th>
                    <th className="px-3 py-2 w-36 whitespace-nowrap" aria-sort={sortColumn === 'slip' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('slip')}
                        className="group inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Model 19 slip number"
                      >
                        Model 19 slip
                        {renderSortIcon('slip')}
                      </button>
                    </th>
                    <th className="px-3 py-2 w-28 text-right whitespace-nowrap" aria-sort={sortColumn === 'cost' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort('cost')}
                        className="group ml-auto inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer"
                        title="Sort by Unit cost"
                      >
                        Unit cost
                        {renderSortIcon('cost')}
                      </button>
                    </th>
                    <th className={`px-3 py-2 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map((group) => {
                    const open = group.forceOpen || openBatches.has(group.row.item.id);
                    return (
                      <React.Fragment key={group.row.item.id}>
                        {renderRow(group.row, { group, open })}
                        {open && group.units.map((unit) => renderRow(unit))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pager={pager} label="assets" />
          </>
        )}
      </div>
      )}

      <Model19PrintModal isOpen={!!voucher19} voucher={voucher19} onClose={() => setVoucher19(null)} />
      <Model22PrintModal isOpen={!!voucher22} voucher={voucher22} onClose={() => setVoucher22(null)} />
      <Model21PrintModal isOpen={!!voucher21} voucher={voucher21} onClose={() => setVoucher21(null)} />
    </div>
  );
};
