import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Boxes,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  PackageMinus,
  ArrowRightLeft,
  Undo2,
  Pencil,
  ChevronRight,
  X,
  Filter,
  Download,
  Trash2,
  Copy,
  MoreVertical,
  Info,
  Send,
  XCircle,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { CloseButton } from '../components/ui/CloseButton';
import { BackButton } from '../components/ui/BackButton';
import { AssetsTableSkeleton } from '../components/ui/Skeleton';
import { broadcastApprovalsUpdated, useRealtimeSync } from '../utils/realtime-sync';
import { FilterPopover, FilterSection, FilterPill, FilterSelect } from '../components/ui/FilterPopover';
import { SortableHeader } from '../components/ui/SortableHeader';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu, RowAction } from '../components/ui/RowActionsMenu';
import { AssetRecord } from '../components/assets/AssetRecord';
import { SlipRecord, SlipStatus, slipLineTotal } from '../components/assets/SlipRecord';
import { isConsumable, itemsLabel, supplyKey, unitsLabel } from '../utils/counting';
import { inCategory } from '../components/assets/receipt-options';
import { assetsViewKey } from '../utils/assets-view';
import { OPEN_CORRECTION_EVENT, OPEN_SLIP_EVENT, slipKey, slipNames, takePendingCorrection, takePendingSlip } from '../components/assets/slip-groups';
import { Model19PrintModal } from '../components/ui/Model19PrintModal';
import { Model22PrintModal } from '../components/ui/Model22PrintModal';
import { Model21PrintModal } from '../components/ui/Model21PrintModal';
import { StockInForm, buildModel19Voucher, templateFromItem, templateFromSlip, ReceiptTemplate } from '../components/assets/ReceiptForm';
import { FormNotice } from '../components/ui/FormKit';
import { costOf, valueOf } from '../utils/item-cost';
import { StockOutForm, buildModel22Voucher } from '../components/assets/IssueForm';
import { TransferForm, buildModel21Voucher } from '../components/assets/TransferForm';
import { DisposalForm, buildDisposalVoucher } from '../components/assets/DisposalForm';
import { DisposalPrintModal } from '../components/ui/DisposalPrintModal';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ApprovalStatus,
  Department,
  DisposalVoucher,
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
import { Model19ImportModal } from '../components/assets/Model19ImportModal';
import { departmentLabel } from '../utils/department';
import { downloadCsv } from '../utils/csv';
import { downloadAssetsWorkbook } from '../utils/assets-workbook';
import {
  AssetGroup,
  AssetRow,
  AssetState,
  AssetStatus,
  CATEGORY_OPTIONS,
  ITEM_TYPE_OPTIONS,
  ItemTypeBadge,
  ENDORSED_REASON,
  requestLabel,
  STALE_IN_STORE_DAYS,
  ShownGroup,
  daysInStore,
  decidedOn,
  isStale,
  recipientOf,
  categoryLabel,
} from '../components/assets/asset-state';

// Where an item is now, or what it waits for. (A "Transferred / returned" filter was history, not a state: a moved
// record says which Model 21 moved it, and "model 21" in the search finds them.) A view saved with it opens on All.
type AssetFilter = 'ALL' | 'IN_STORE' | 'ISSUED' | 'PENDING' | 'REJECTED' | 'DISPOSED';
const FILTERS: { value: AssetFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_STORE', label: 'In store' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DISPOSED', label: 'Disposed' },
];
/** What each status count is: items (one per line received), not units; an item can count under more than one */
const FILTER_HINTS: Record<AssetFilter, string> = {
  ALL: 'Every item, whatever its status',
  IN_STORE: 'Items with units in store, including those on a waiting issue or disposal',
  ISSUED: 'Items with all or some units issued; a partly issued item also counts under In store',
  PENDING: 'Items waiting for an approver',
  REJECTED: 'Rejected receipts, receipts sent back to their requester, and items whose last request was rejected',
  DISPOSED: 'Items with all or some units disposed of',
};

/** Format ISO or YYYY-MM-DD date to MM/DD/YYYY (e.g. 03/16/2026) */
function formatCreatedDate(raw?: string): string {
  if (!raw) return '—';
  const clean = String(raw).trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${mm}/${dd}/${yyyy}`;
  }
  const d = new Date(clean);
  if (isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export type SortColumn = 'activity' | 'name' | 'status' | 'units' | 'where' | 'created' | 'cost' | 'total';
const SORT_LABELS: Record<SortColumn, string> = {
  activity: 'latest activity',
  name: 'asset',
  status: 'status',
  units: 'quantity',
  where: 'held by / where',
  created: 'date created',
  cost: 'unit cost',
  total: 'total',
};
export type SortDirection = 'asc' | 'desc';
const SORT_COLUMNS: SortColumn[] = ['activity', 'name', 'status', 'units', 'where', 'cost', 'total'];

/** Filters and sort, remembered per person in this browser so a refresh keeps the view */
interface SavedView {
  filter: AssetFilter;
  location: string;
  category: string;
  /** The directorate holding them */
  department: string;
  staleOnly: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  /** Fixed asset or consumable, only when a dashboard figure opened the page (not remembered after) */
  itemType?: string;
}
const DEFAULT_VIEW: SavedView = { filter: 'ALL', location: 'ALL', category: 'ALL', department: 'ALL', staleOnly: false, sortColumn: 'activity', sortDirection: 'desc' };
const viewKey = assetsViewKey;

function loadView(userId?: string): SavedView {
  try {
    const saved = JSON.parse(localStorage.getItem(viewKey(userId)) || '{}');
    return {
      filter: FILTERS.some((f) => f.value === saved.filter) ? saved.filter : DEFAULT_VIEW.filter,
      location: typeof saved.location === 'string' && saved.location ? saved.location : DEFAULT_VIEW.location,
      category: typeof saved.category === 'string' && saved.category ? saved.category : DEFAULT_VIEW.category,
      department: typeof saved.department === 'string' && saved.department ? saved.department : DEFAULT_VIEW.department,
      itemType: saved.itemType === 'FIXED' || saved.itemType === 'CONSUMABLE' ? saved.itemType : undefined,
      staleOnly: saved.staleOnly === true,
      sortColumn: SORT_COLUMNS.includes(saved.sortColumn) ? saved.sortColumn : DEFAULT_VIEW.sortColumn,
      sortDirection: saved.sortDirection === 'asc' ? 'asc' : DEFAULT_VIEW.sortDirection,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

interface AssetsPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const AssetsPage: React.FC<AssetsPageProps> = () => {
  const { user } = useAuth();
  const toast = useToast();
  const can = (permission: string) => user?.role === UserRole.SUPER_ADMIN || (user?.permissions?.includes(permission) ?? false);
  const canReceive = can('stock-in.write');
  const canIssue = can('stock-out.write');
  const canTransfer = can('transfers.write');
  const canDispose = can('disposals.write');
  const canEndorse = can('approvals.endorse');
  const canAuthorize = can('approvals.authorize');
  /** The approver a request waits for may correct it (not their own request) instead of rejecting it for a typo */
  const approverCorrects = (r?: TransactionApproval | null) =>
    !!r && r.status === ApprovalStatus.PENDING && r.requestedById !== user?.id && ((r.currentStage ?? 1) === 1 ? canEndorse : canAuthorize);

  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedView] = useState(() => loadView(user?.id));
  const [filter, setFilter] = useState<AssetFilter>(savedView.filter);
  const [locationFilter, setLocationFilter] = useState<string>(savedView.location);
  const [categoryFilter, setCategoryFilter] = useState<string>(savedView.category);
  const [departmentFilter, setDepartmentFilter] = useState<string>(savedView.department);
  // Fixed asset or consumable item (not remembered between visits, unless a dashboard figure opened the page on it)
  const [typeFilter, setTypeFilter] = useState<string>(savedView.itemType ?? 'ALL');
  const [programFilter, setProgramFilter] = useState<string>('ALL');
  const [dbPrograms, setDbPrograms] = useState<string[]>([]);
  const [staleOnly, setStaleOnly] = useState<boolean>(savedView.staleOnly);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>(savedView.sortColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>(savedView.sortDirection);

  useEffect(() => {
    try {
      const view: SavedView = { filter, location: locationFilter, category: categoryFilter, department: departmentFilter, staleOnly, sortColumn, sortDirection };
      localStorage.setItem(viewKey(user?.id), JSON.stringify(view));
    } catch {
      // Storage can be unavailable (private window); the view then simply isn't remembered
    }
  }, [user?.id, filter, locationFilter, categoryFilter, departmentFilter, staleOnly, sortColumn, sortDirection]);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);

  // 3-Dot Actions Menu
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  // Receiving several Model 19s from the Excel template
  const [isModel19ImportOpen, setIsModel19ImportOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActionsMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsMenuOpen]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'cost' || col === 'total' || col === 'units' || col === 'activity' ? 'desc' : 'asc');
    }
  };

  // Pop-ups: one per form, each either new (from a row or the header) or correcting a pending request
  const [receipt, setReceipt] = useState<{
    edit?: ItemWithRelations;
    template?: ReceiptTemplate;
    templateKey?: string;
    copyOf?: string;
    editBatch?: ItemWithRelations[];
    returned?: boolean;
  } | null>(null);
  // A new issue of one item, or of the items of a Model 19 (`slip` is its key, `itemIds` its items in store)
  const [issue, setIssue] = useState<{ itemId?: string; edit?: TransactionApproval; slip?: string; itemIds?: string[] } | null>(null);
  const [transfer, setTransfer] = useState<{ itemId?: string; edit?: TransactionApproval; asReturn?: boolean } | null>(null);
  const [disposing, setDisposing] = useState<{ itemId: string } | null>(null);
  // The asset record open beside the list, and whether what it has pending is being corrected in place
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // A Model 19 of several items open beside the list; and the one an item was opened from, to go back to
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const [slipBack, setSlipBack] = useState<string | null>(null);
  const closeRecord = () => {
    setSelectedId(null);
    setSelectedSlip(null);
    setSlipBack(null);
    setReceipt(null);
    setTransfer(null);
    setIssue(null);
    setDisposing(null);
    setEditing(false);
  };
  const openReceipt = (
    edit?: ItemWithRelations,
    template?: ReceiptTemplate,
    templateKey?: string,
    copyOf?: string,
    editBatch?: ItemWithRelations[],
    returned?: boolean
  ) => {
    setSelectedId(null);
    setSelectedSlip(null);
    setSlipBack(null);
    setTransfer(null);
    setIssue(null);
    setDisposing(null);
    setEditing(false);
    setReceipt({ edit, template, templateKey, copyOf, editBatch, returned });
  };
  const [voucher19, setVoucher19] = useState<Model19Voucher | null>(null);
  const [voucher22, setVoucher22] = useState<Model22Voucher | null>(null);
  const [voucher21, setVoucher21] = useState<Model21Voucher | null>(null);
  const [voucherDisposal, setVoucherDisposal] = useState<DisposalVoucher | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const progsPromise = typeof api.getPrograms === 'function'
        ? api.getPrograms().catch(() => [])
        : Promise.resolve([]);
      const [itemsRes, approvalsRes, locsRes, empsRes, deptsRes, progsRes] = await Promise.all([
        api.getItems(),
        api.getApprovals(),
        api.getLocations(),
        api.getEmployees(),
        api.getDepartments(),
        progsPromise,
      ]);
      setItems(itemsRes);
      setApprovals(approvalsRes);
      setLocations(locsRes);
      setEmployees(empsRes);
      setDepartments(deptsRes);
      if (Array.isArray(progsRes)) {
        setDbPrograms(progsRes.map((p: any) => p.name));
      }
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

  /** An asset changed elsewhere (e.g. a form recorded its IFMIS tag): the list takes the new tag without reloading */
  const itemUpdated = useCallback((updated: ItemWithRelations) => {
    setItems((list) => list.map((i) => (i.id === updated.id ? { ...i, ifmisTagNumber: updated.ifmisTagNumber } : i)));
  }, []);

  const saveIfmisTag = async (item: ItemWithRelations, tag: string) => {
    try {
      const { item: updated } = await api.setIfmisTag(item.id, tag);
      itemUpdated(updated);
      toast.success(updated.ifmisTagNumber ? 'IFMIS tag recorded' : 'IFMIS tag removed', updated.ifmisTagNumber ? `${updated.ifmisTagNumber} is the IFMIS tag number of ${item.itemCode}.` : `${item.itemCode} has no IFMIS tag number now.`);
    } catch (err: any) {
      toast.warning("The tag wasn't saved", err?.message || 'Try again.');
      throw err;
    }
  };

  const isFormActive = Boolean(
    editing ||
    receipt ||
    transfer ||
    issue ||
    disposing
  );

  useRealtimeSync(
    useCallback(() => {
      fetchData(true);
    }, [fetchData]),
    { enabled: !isFormActive }
  );

  // The open requests of each record, oldest first: several issue requests can wait on one record
  const openByItem = useMemo(() => {
    const map = new Map<string, TransactionApproval[]>();
    for (const a of approvals) {
      if (a.status === ApprovalStatus.PENDING) map.set(a.itemId, [...(map.get(a.itemId) ?? []), a]);
    }
    const when = (a: TransactionApproval) => String(a.createdAt ?? a.createdAtGc ?? '');
    for (const list of map.values()) list.sort((x, y) => when(x).localeCompare(when(y)));
    return map;
  }, [approvals]);
  // The open request a record is known by: the oldest
  const pendingByItem = useMemo(() => new Map([...openByItem].map(([id, list]) => [id, list[0]] as const)), [openByItem]);
  // Which of a record's open requests is being corrected, when it has several
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

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
      // A partial issue, disposal, transfer or return is filed under the record split off for those units
      const splitCode =
        a.status === ApprovalStatus.APPROVED
          ? a.requestDetails?.issuedItemCode ?? a.requestDetails?.disposedItemCode ?? a.requestDetails?.transferredItemCode ?? a.requestDetails?.returnedItemCode
          : undefined;
      add(vouchers, (splitCode && idByCode.get(splitCode)) || a.itemId, a);
      add(raised, a.itemId, a);
    }
    for (const map of [vouchers, raised]) for (const list of map.values()) list.sort((x, y) => decidedOn(y).localeCompare(decidedOn(x)));
    return { vouchers, raised };
  }, [approvals, items]);

  // What can go on a Model 21: records in store or issued, whose waiting requests (if any) are only Model 21 (transfers/returns) with remaining balance
  const transferableItems = useMemo(() => {
    const onTransfers = new Map<string, number>();
    const blocked = new Set<string>();
    for (const a of approvals) {
      if (a.status !== ApprovalStatus.PENDING) continue;
      if (a.transactionType !== 'TRANSFER' && a.transactionType !== 'RETURN') blocked.add(a.itemId);
      else onTransfers.set(a.itemId, (onTransfers.get(a.itemId) ?? 0) + (Number(a.requestDetails?.quantity) || 1));
    }
    return items.filter((i) => {
      if (i.status !== ItemStatus.AVAILABLE && i.status !== ItemStatus.ISSUED && i.status !== ItemStatus.UNDER_TRANSFER) return false;
      if (blocked.has(i.id)) return false;
      if (i.heldByOrganization) return false;
      if (i.itemType === 'CONSUMABLE' && i.status !== ItemStatus.AVAILABLE) return false;
      const total = Number(i.quantity) || 1;
      const pending = onTransfers.get(i.id) ?? 0;
      return total - pending > 0;
    });
  }, [items, approvals]);

  const rows = useMemo<AssetRow[]>(() => {
    const employeeName = (id?: string | null) => employees.find((e) => e.id === id)?.fullNameEn;
    const today = new Date();
    return items
      .map((item) => {
        const request = pendingByItem.get(item.id) ?? (item.status === ItemStatus.PENDING_STOCK_IN ? decided.raised.get(item.id)?.[0] : undefined);
        const requests = openByItem.get(item.id) ?? [];
        const store = item.storeLocation ? storeLocationLabel(item.storeLocation) : 'Store';
        const holder = item.currentCustodian?.fullNameEn || employeeName(item.currentCustodianId) || item.heldByOrganization || (item.assignedDepartment ? departmentLabel(item.assignedDepartment) : undefined);
        let state: AssetState;
        if (item.status === ItemStatus.REJECTED) state = 'REJECTED';
        else if (item.status === ItemStatus.DISPOSED) state = 'DISPOSED';
        else if (item.status === ItemStatus.PENDING_STOCK_IN) state = 'RECEIPT_PENDING';
        else if (request) state = 'REQUEST_PENDING';
        else if (item.status === ItemStatus.AVAILABLE) state = 'IN_STORE';
        else state = 'ISSUED';

        let goingTo: string | undefined;
        if (requests.length > 1) {
          // Several issues: each recipient, with what they asked for
          goingTo = requests
            .map((r) => `${recipientOf(r) || employeeName(r.recipientEmployeeId) || 'Recipient not set'}${r.requestDetails?.quantity ? ` · ${r.requestDetails.quantity} ${(item.uom || 'EA').toLowerCase()}` : ''}`)
            .join(', ');
        } else if (request?.transactionType === 'STOCK_OUT' || request?.transactionType === 'TRANSFER') {
          goingTo = request.recipientEmployee?.fullNameEn || employeeName(request.recipientEmployeeId) || request.requestDetails?.organizationName;
        } else if (request?.transactionType === 'RETURN') {
          const target = locations.find((l) => l.id === request.targetLocationId);
          goingTo = target ? storeLocationLabel(target) : store;
        } else if (request?.transactionType === 'DISPOSAL') {
          goingTo = request.requestDetails?.recipientName || 'Disposal';
        }
        // An issued record (or one waiting to be transferred or returned) is with someone; the rest is in store
        const withSomeone = item.status === ItemStatus.ISSUED || item.status === ItemStatus.UNDER_TRANSFER;
        const approved = (decided.vouchers.get(item.id) ?? []).filter((a) => a.status === ApprovalStatus.APPROVED);
        const lastRaised = decided.raised.get(item.id)?.[0];
        const lastDisposal = approved.find((a) => a.transactionType === 'DISPOSAL');
        // A disposed record has left the store: say where it went instead
        const disposedTo = state === 'DISPOSED' ? lastDisposal?.requestDetails?.recipientName || 'Disposed' : undefined;
        return {
          item,
          state,
          request,
          requests,
          // A record with no quantity kept (older ones) is one unit; a piece emptied by a reversal holds none
          units: item.quantity === undefined || item.quantity === null || !Number.isFinite(Number(item.quantity)) ? 1 : Number(item.quantity),
          where: disposedTo ?? (withSomeone ? holder || '—' : store),
          goingTo,
          activity: String(request?.createdAt || item.createdAt || request?.createdAtGc || item.createdAtGc || ''),
          lastIssue: approved.find((a) => a.transactionType === 'STOCK_OUT'),
          lastMove: approved.find((a) => a.transactionType === 'TRANSFER' || a.transactionType === 'RETURN'),
          lastDisposal,
          // A new request replaces the rejected one; until then the row says what happened
          // (an issued record doesn't show an issue that lost to the one that issued it)
          rejected:
            !request &&
            (lastRaised?.status === ApprovalStatus.REJECTED || lastRaised?.status === ApprovalStatus.CANCELLED) &&
            !(state === 'ISSUED' && lastRaised.transactionType === 'STOCK_OUT')
              ? lastRaised
              : undefined,
          // Units on a waiting issue or disposal are still on the shelf, so they keep counting their days in store
          daysInStore:
            state === 'IN_STORE' || item.status === ItemStatus.PENDING_STOCK_OUT || item.status === ItemStatus.PENDING_DISPOSAL
              ? daysInStore(item, today)
              : undefined,
        };
      })
      .sort((a, b) => {
        if (a.item.ifmisSlipNumber && a.item.ifmisSlipNumber !== '—' && a.item.ifmisSlipNumber === b.item.ifmisSlipNumber) {
          return a.item.itemCode.localeCompare(b.item.itemCode, undefined, { numeric: true });
        }
        return b.activity.localeCompare(a.activity) || a.item.itemCode.localeCompare(b.item.itemCode);
      });
  }, [items, pendingByItem, openByItem, decided, employees, locations]);

  /** A waiting issue or disposal on a voucher already approved for this record: a copy that would take its units twice */
  const copyOfApproved = (row: AssetRow) => {
    const request = row.request;
    if (!request || request.status !== ApprovalStatus.PENDING || (request.transactionType !== 'DISPOSAL' && request.transactionType !== 'STOCK_OUT')) return undefined;
    const number = String(request.ifmisSlipNumber ?? '').trim().toLowerCase();
    if (!number || number.startsWith('pending-')) return undefined;
    return (decided.raised.get(row.item.id) ?? []).find(
      (a) => a.status === ApprovalStatus.APPROVED && a.transactionType === request.transactionType && String(a.ifmisSlipNumber ?? '').trim().toLowerCase() === number,
    );
  };
  const voucherName = (type?: string) => (type === 'DISPOSAL' ? 'disposal form' : 'Model 22');

  const inFilter = (row: AssetRow, f: AssetFilter, locId = locationFilter, cat = categoryFilter) => {
    // A receipt rejected back to its requester waits on them, not on an approver
    const sentBack = row.state === 'RECEIPT_PENDING' && row.request?.status === ApprovalStatus.REJECTED;
    // Units on a waiting issue or disposal are still on the shelf until the last approver approves
    const stillInStore = row.item.status === ItemStatus.PENDING_STOCK_OUT || row.item.status === ItemStatus.PENDING_DISPOSAL;
    const matchesState =
      f === 'ALL' ||
      (f === 'PENDING'
        ? (row.state === 'RECEIPT_PENDING' && !sentBack) || row.state === 'REQUEST_PENDING'
        : f === 'REJECTED'
          ? row.state === 'REJECTED' || !!row.rejected || sentBack
          : f === 'IN_STORE'
            ? row.state === 'IN_STORE' || stillInStore
            : row.state === f);
    if (!matchesState) return false;

    if (locId !== 'ALL' && row.item.storeLocationId !== locId) {
      return false;
    }

    // Vehicles with Accessories lists the vehicles themselves
    if (!inCategory(row.item, cat)) {
      return false;
    }

    if (typeFilter !== 'ALL' && (row.item.itemType ?? 'FIXED') !== typeFilter) {
      return false;
    }

    // As the dashboard's directorate allocation: the directorate the record is assigned to
    if (departmentFilter !== 'ALL' && (row.item.assignedDepartmentId || '') !== departmentFilter) {
      return false;
    }

    if (programFilter !== 'ALL' && (row.item.programName || '') !== programFilter) {
      return false;
    }

    if (staleOnly && !(row.daysInStore !== undefined && isStale(row))) {
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
      // A piece whose issue or disposal was reversed holds nothing (its units went back): not listed under its batch
      if (parentId && ids.has(parentId) && r.state === 'REJECTED' && r.units === 0) continue;
      if (parentId && ids.has(parentId)) units.set(parentId, [...(units.get(parentId) ?? []), r]);
      else tops.push(r);
    }
    return tops
      .map((row) => {
        const children = (units.get(row.item.id) ?? []).sort((a, b) => a.item.itemCode.localeCompare(b.item.itemCode, undefined, { numeric: true }));
        const activity = [row, ...children].reduce((latest, r) => (r.activity > latest ? r.activity : latest), row.activity);
        return { row, children, activity };
      })
      .sort((a, b) => {
        if (a.row.item.ifmisSlipNumber && a.row.item.ifmisSlipNumber !== '—' && a.row.item.ifmisSlipNumber === b.row.item.ifmisSlipNumber) {
          return a.row.item.itemCode.localeCompare(b.row.item.itemCode, undefined, { numeric: true });
        }
        return b.activity.localeCompare(a.activity) || a.row.item.itemCode.localeCompare(b.row.item.itemCode);
      });
  }, [rows]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (row: AssetRow) => {
    if (!q) return true;
    const { item } = row;

    const hasModel19 = Boolean(item.ifmisSlipNumber || row.request?.transactionType === 'STOCK_IN');
    const hasModel22 =
      Boolean(row.lastIssue) ||
      row.request?.transactionType === 'STOCK_OUT' ||
      (row.requests || []).some((r) => r.transactionType === 'STOCK_OUT') ||
      row.rejected?.transactionType === 'STOCK_OUT' ||
      (item.history || []).some((h) => h.action.includes('STOCK_OUT') || h.action.includes('ISSUE')) ||
      (decided.vouchers.get(item.id) || []).some((v) => v.transactionType === 'STOCK_OUT');
    const hasModel21 =
      Boolean(row.lastMove) ||
      row.request?.transactionType === 'TRANSFER' ||
      row.request?.transactionType === 'RETURN' ||
      (row.requests || []).some((r) => r.transactionType === 'TRANSFER' || r.transactionType === 'RETURN') ||
      row.rejected?.transactionType === 'TRANSFER' ||
      row.rejected?.transactionType === 'RETURN' ||
      (item.history || []).some((h) => h.action.includes('TRANSFER') || h.action.includes('RETURN')) ||
      (decided.vouchers.get(item.id) || []).some((v) => v.transactionType === 'TRANSFER' || v.transactionType === 'RETURN');
    const hasModel20 =
      Boolean(row.lastDisposal) ||
      row.request?.transactionType === 'DISPOSAL' ||
      (row.requests || []).some((r) => r.transactionType === 'DISPOSAL') ||
      row.rejected?.transactionType === 'DISPOSAL' ||
      (item.history || []).some((h) => h.action.includes('DISPOSAL')) ||
      (decided.vouchers.get(item.id) || []).some((v) => v.transactionType === 'DISPOSAL');

    const modelTags = [
      hasModel19 ? 'model 19 model-19 model19 m19 receipt receiving' : '',
      hasModel22 ? 'model 22 model-22 model22 m22 issue siv' : '',
      hasModel21 ? 'model 21 model-21 model21 m21 transfer return' : '',
      hasModel20 ? 'model 20 model-20 model20 m20 disposal model 22/b' : '',
    ].filter(Boolean).join(' ');

    const slipNumbers = [
      item.ifmisSlipNumber,
      item.poNumber,
      row.lastIssue?.ifmisSlipNumber,
      row.lastMove?.ifmisSlipNumber,
      row.lastDisposal?.ifmisSlipNumber,
      row.request?.ifmisSlipNumber,
      row.request?.poNumber,
      row.rejected?.ifmisSlipNumber,
      ...(row.requests || []).map((r) => r.ifmisSlipNumber),
      ...(decided.vouchers.get(item.id) || []).map((v) => v.ifmisSlipNumber),
      ...(item.history || []).map((h) => h.ifmisSlipNumber),
      ...(item.history || []).map((h) => h.notes),
    ];

    const poVariations = [
      ...(item.poNumber ? [item.poNumber.replace(/[-_#]/g, ' '), item.poNumber.replace(/[-_#]/g, '')] : []),
      ...(row.request?.poNumber ? [row.request.poNumber.replace(/[-_#]/g, ' '), row.request.poNumber.replace(/[-_#]/g, '')] : []),
    ];
    const codeVariations = [
      ...(item.itemCode ? [item.itemCode.replace(/[-_.]/g, ' '), item.itemCode.replace(/[-_.]/g, '')] : []),
      ...(item.ifmisItemCode ? [item.ifmisItemCode.replace(/[.]/g, ' ')] : []),
      ...(item.ifmisTagNumber ? [item.ifmisTagNumber.replace(/[-_.]/g, ' '), item.ifmisTagNumber.replace(/[-_.]/g, '')] : []),
    ];

    const targets = [
      item.name,
      item.itemCode,
      item.ifmisTagNumber,
      item.ifmisItemCode,
      ...codeVariations,
      ...poVariations,
      item.serialNumber,
      item.itemCategoryDisplay,
      item.category,
      item.programName,
      item.source,
      item.buyer,
      item.notes,
      row.where,
      row.goingTo,
      item.currentCustodian?.fullNameEn,
      item.currentCustodian?.fullNameAm,
      item.heldByOrganization,
      row.request?.recipientEmployee?.fullNameEn,
      row.request?.recipientEmployee?.fullNameAm,
      row.request?.requestDetails?.organizationName,
      row.request?.requestDetails?.recipientName,
      row.request?.purposeOrRemarks,
      ...slipNumbers,
      modelTags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (targets.includes(q)) return true;
    const words = q.split(/\s+/).filter(Boolean);
    return words.length > 1 && words.every((w) => targets.includes(w));
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
    [groups, filter, locationFilter, categoryFilter, typeFilter, departmentFilter, programFilter, staleOnly, search],
  );

  const sortedShown = useMemo(() => {
    const list = [...shown];
    if (sortColumn === 'activity') {
      return list.sort((a, b) => {
        if (a.row.item.ifmisSlipNumber && a.row.item.ifmisSlipNumber !== '—' && a.row.item.ifmisSlipNumber === b.row.item.ifmisSlipNumber) {
          return a.row.item.itemCode.localeCompare(b.row.item.itemCode, undefined, { numeric: true });
        }
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
        case 'created': {
          const aVal = a.row.item.createdAtGc || a.row.item.createdAt || '';
          const bVal = b.row.item.createdAtGc || b.row.item.createdAt || '';
          res = aVal.localeCompare(bVal);
          break;
        }
        case 'cost': {
          const aVal = costOf(a.row.item);
          const bVal = costOf(b.row.item);
          res = aVal - bVal;
          break;
        }
        case 'total': {
          // All the units a record was received with (the server's balance), as the Total column shows them
          const total = (r: AssetRow) => valueOf(r.item, r.item.balance?.total ?? r.units);
          res = total(a.row) - total(b.row);
          break;
        }
      }
      if (res === 0) {
        res = a.row.item.itemCode.localeCompare(b.row.item.itemCode);
      }
      return sortDirection === 'asc' ? res : -res;
    });
  }, [shown, sortColumn, sortDirection]);

  // Registrations received on the same Model 19 with the same PO: one receipt, shown as one row (2 or more items)
  const slips = useMemo(() => {
    const byKey = new Map<string, AssetGroup[]>();
    for (const g of groups) {
      if (g.row.item.parentItemId) continue;
      const key = slipKey(g.row.item.ifmisSlipNumber, g.row.item.poNumber);
      if (key) byKey.set(key, [...(byKey.get(key) ?? []), g]);
    }
    for (const [key, list] of byKey) {
      if (list.length < 2) byKey.delete(key);
      else list.sort((a, b) => a.row.item.itemCode.localeCompare(b.row.item.itemCode, undefined, { numeric: true }));
    }
    return byKey;
  }, [groups]);
  const slipOfItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, list] of slips) for (const g of list) map.set(g.row.item.id, key);
    return map;
  }, [slips]);
  type ListEntry = { group: ShownGroup; slip?: undefined } | { slip: string; members: AssetGroup[]; group?: undefined };
  /** The rows of the table: a receipt of several items is one row, where the first of its items would be */
  const listed = useMemo(() => {
    const out: ListEntry[] = [];
    const placed = new Set<string>();
    for (const g of sortedShown) {
      const key = slipOfItem.get(g.row.item.id);
      if (!key) out.push({ group: g });
      else if (!placed.has(key)) {
        placed.add(key);
        out.push({ slip: key, members: slips.get(key)! });
      }
    }
    return out;
  }, [sortedShown, slips, slipOfItem]);

  const pager = usePagination(listed, { resetKey: `${filter}|${locationFilter}|${categoryFilter}|${typeFilter}|${departmentFilter}|${programFilter}|${staleOnly}|${search}|${sortColumn}|${sortDirection}|${lastTouchedId}` });
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
    if (request.transactionType === 'STOCK_IN') {
      // The receipt: the Model 19 lists every item registered on the same slip
      if (item) setVoucher19(buildModel19Voucher(item, items, user?.fullNameEn, request));
    } else if (request.transactionType === 'STOCK_OUT') {
      setVoucher22(buildModel22Voucher(request, { item, departments, employees, printedBy: user?.fullNameEn, requests: approvals, items }));
    } else if (request.transactionType === 'DISPOSAL') {
      // The disposal form lists every asset filed on it (the same No.)
      setVoucherDisposal(buildDisposalVoucher(request, { item, employees, printedBy: user?.fullNameEn, requests: approvals, items }));
    } else if (request.transactionType === 'TRANSFER' || request.transactionType === 'RETURN') {
      setVoucher21(await buildModel21Voucher(request, { item, employees, locations, printedBy: user?.fullNameEn, requests: approvals, items }));
    }
  };

  // ── After a form is saved ──
  const saved = (itemId: string | undefined) => {
    if (itemId) setLastTouchedId(itemId);
    setSortColumn('activity');
    setSortDirection('desc');
    fetchData(true);
    broadcastApprovalsUpdated();
  };

  /** Open a record in view mode with its actions in the toolbar */
  const openRecord = (itemId: string, fromSlip?: string) => {
    setReceipt(null);
    setTransfer(null);
    setIssue(null);
    setDisposing(null);
    setSelectedSlip(null);
    setSlipBack(fromSlip ?? null);
    setSelectedId(itemId);
    setEditing(false);
  };
  /** Open a Model 19 of several items: its details and its items */
  const openSlip = (key: string) => {
    setReceipt(null);
    setTransfer(null);
    setIssue(null);
    setDisposing(null);
    setSelectedId(null);
    setSlipBack(null);
    setEditing(false);
    setSelectedSlip(key);
  };

  /** Whether a form is open on this record: a correction, or a new issue, transfer, return or disposal */
  const formOpenFor = (itemId: string) =>
    editing ||
    (!!transfer && (transfer.itemId === itemId || transfer.edit?.itemId === itemId)) ||
    (!!issue && (issue.itemId === itemId || issue.edit?.itemId === itemId)) ||
    disposing?.itemId === itemId;

  /** Open a record straight into correcting what it has pending (its receipt or its request) */
  const editInRecord = (itemId: string, requestId?: string) => {
    const target = rows.find((r) => r.item.id === itemId);
    if (target?.state === 'REJECTED' || target?.item.status === ItemStatus.REJECTED) return;
    setSelectedId(itemId);
    setEditingRequestId(requestId ?? null);
    setEditing(true);
  };

  /**
   * The form that corrects what a record has pending, shown in place of its details and saved from the record's
   * toolbar. Only a receipt or request still with the Team Leader can be corrected.
   */
  const editFormFor = (row: AssetRow): { id: string; form: React.ReactNode; actions?: RowAction[] } | undefined => {
    const { item } = row;
    // The request chosen from several, else the record's one
    const request = row.requests?.find((r) => r.id === editingRequestId) ?? row.request;
    const done = (voucher?: unknown, print?: (v: any) => void) => {
      setEditing(false);
      setTransfer(null);
      setIssue(null);
      setDisposing(null);
      saved(item.id);
      if (voucher && print) print(voucher);
    };
    if (row.state === 'RECEIPT_PENDING') {
      const slipKeyOfItem = slipOfItem.get(item.id);
      const siblingMembers = slipKeyOfItem ? slips.get(slipKeyOfItem) : undefined;
      const isMultiItemBatch = siblingMembers && siblingMembers.length > 1;
      const batchItems = isMultiItemBatch
        ? [item, ...siblingMembers.map((g) => g.row.item).filter((i) => i.id !== item.id)]
        : undefined;
      return {
        id: 'stock-in-form',
        form: (
          <StockInForm
            key={item.id}
            locations={locations}
            employees={employees}
            editItem={item}
            editBatch={batchItems}
            returned={(pendingByItem.get(item.id) ?? decided.raised.get(item.id)?.[0])?.status === ApprovalStatus.REJECTED}
            registered={items.filter((i) => !i.parentItemId && i.status !== ItemStatus.REJECTED && (batchItems ? !batchItems.some((b) => b.id === i.id) : i.id !== item.id)).map((i) => ({ slipNumber: i.ifmisSlipNumber, name: i.name, itemCode: i.itemCode, ifmisItemCode: i.ifmisItemCode, unitCostETB: i.unitCostETB }))}
            onCancel={() => setEditing(false)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher19)}
          />
        ),
      };
    }
    if (transfer && (transfer.itemId === item.id || transfer.edit?.itemId === item.id)) {
      return {
        id: 'transfer-form',
        form: (
          <TransferForm
            key={transfer.edit?.id ?? `${transfer.asReturn ? 'return' : 'transfer'}-${item.id}`}
            items={items}
            employees={employees}
            departments={departments}
            locations={locations}
            pendingByItem={pendingByItem}
            openByItem={openByItem}
            editTransfer={transfer.edit}
            initialItemId={item.id}
            asReturn={transfer.asReturn}
            onItemUpdated={itemUpdated}
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
            onCancel={() => setIssue(null)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher22)}
          />
        ),
      };
    }
    if (disposing && disposing.itemId === item.id) {
      return {
        id: 'disposal-form',
        form: (
          <DisposalForm
            key={`disposal-${item.id}`}
            item={item}
            allItems={items}
            pendingItemIds={new Set(pendingByItem.keys())}
            onItemUpdated={itemUpdated}
            onCancel={() => setDisposing(null)}
            onSuccess={(_result, voucher) => done(voucher, setVoucherDisposal)}
          />
        ),
      };
    }
    if (row.state !== 'REQUEST_PENDING' || !request) return undefined;
    if (request.transactionType === 'DISPOSAL') {
      return {
        id: 'disposal-form',
        form: (
          <DisposalForm
            key={request.id}
            item={item}
            editApproval={request}
            onItemUpdated={itemUpdated}
            onCancel={() => setEditing(false)}
            onSuccess={() => done()}
          />
        ),
      };
    }
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
            onCancel={() => setEditing(false)}
            onSuccess={(_result, voucher) => done(voucher, setVoucher22)}
          />
        ),
      };
    }
    if (request.transactionType === 'TRANSFER' || request.transactionType === 'RETURN') {
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
            openByItem={openByItem}
            editTransfer={request}
            onItemUpdated={itemUpdated}
            onCancel={() => setEditing(false)}
            onSaved={(voucher) => done(voucher, setVoucher21)}
          />
        ),
      };
    }
    return undefined;
  };

  /** A rejected request's voucher, every line of it still with its requester: resubmitted or cancelled at once */
  const voucherOfRequest = (request: TransactionApproval) => {
    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
    const key = (a: TransactionApproval) => `${a.transactionType}|${norm(a.ifmisSlipNumber)}|${a.transactionType === 'STOCK_IN' ? norm(a.poNumber) : ''}`;
    return approvals.filter((a) => a.status === ApprovalStatus.REJECTED && key(a) === key(request));
  };
  const VOUCHER_OF: Record<string, string> = { STOCK_IN: 'Model 19', STOCK_OUT: 'Model 22', TRANSFER: 'Model 21', RETURN: 'Model 21', DISPOSAL: 'disposal form' };
  const [resubmitting, setResubmitting] = useState(false);
  const resubmit = async (request: TransactionApproval) => {
    const lines = voucherOfRequest(request);
    if (lines.length === 0 || resubmitting) return;
    setResubmitting(true);
    try {
      await api.resubmitApprovals(lines.map((a) => a.id));
      toast.success(
        'Resubmitted for approval',
        `${VOUCHER_OF[request.transactionType] ?? 'Voucher'} ${request.ifmisSlipNumber}${lines.length > 1 ? ` (${lines.length} items)` : ''} went back to the Team Leader.`,
      );
      broadcastApprovalsUpdated();
      await fetchData(true);
    } catch (err: any) {
      toast.error('Could not resubmit', err?.message || 'Try again.');
    } finally {
      setResubmitting(false);
    }
  };
  /** Who may correct and resubmit each kind of request */
  const mayCorrect = (type: string) => ({ STOCK_IN: canReceive, STOCK_OUT: canIssue, DISPOSAL: canDispose, TRANSFER: canTransfer, RETURN: canTransfer } as Record<string, boolean>)[type] ?? false;
  // Cancelling closes a rejected request for good, so it is confirmed first
  const [cancelling, setCancelling] = useState<{ request: TransactionApproval; lines: TransactionApproval[]; reason: string; busy: boolean } | null>(null);
  const askCancel = (request: TransactionApproval) => {
    const lines = voucherOfRequest(request);
    if (lines.length) setCancelling({ request, lines, reason: '', busy: false });
  };
  const confirmCancel = async () => {
    if (!cancelling || cancelling.busy) return;
    setCancelling({ ...cancelling, busy: true });
    const { request, lines, reason } = cancelling;
    try {
      await api.cancelApprovals(lines.map((a) => a.id), reason.trim() || undefined);
      toast.success(
        'Request cancelled',
        `${VOUCHER_OF[request.transactionType] ?? 'Voucher'} ${request.ifmisSlipNumber}${lines.length > 1 ? ` (${lines.length} items)` : ''} is cancelled and its records are released.`,
      );
      setCancelling(null);
      broadcastApprovalsUpdated();
      await fetchData(true);
    } catch (err: any) {
      toast.error('Could not cancel', err?.message || 'Try again.');
      setCancelling((c) => (c ? { ...c, busy: false } : c));
    }
  };
  const cancelAction = (request?: TransactionApproval): RowAction => ({
    label: 'Cancel request',
    icon: XCircle,
    onClick: () => request && askCancel(request),
    hidden: !request || request.status !== ApprovalStatus.REJECTED || !mayCorrect(request.transactionType),
  });
  const resubmitAction = (request?: TransactionApproval): RowAction => ({
    label: `Resubmit ${VOUCHER_OF[request?.transactionType ?? ''] ?? 'request'}`,
    icon: Send,
    onClick: () => request && void resubmit(request),
    hidden: !request || request.status !== ApprovalStatus.REJECTED || !mayCorrect(request.transactionType),
    disabled: resubmitting,
  });

  const actionsFor = (row: AssetRow): RowAction[] => {
    const { item, request } = row;
    // A rejected or cancelled record: the one thing left to do is receive it again
    if (row.state === 'REJECTED' || item.status === ItemStatus.REJECTED) {
      return [
        {
          label: 'Duplicate as new receipt',
          icon: Copy,
          onClick: () => duplicateItem(item),
          hidden: !canReceive || !!item.parentItemId,
        },
      ];
    }
    // Viewing is clicking the row; printing is from the record's list of requests
    switch (row.state) {
      case 'RECEIPT_PENDING':
        return [
          {
            label: 'Edit receipt',
            icon: Pencil,
            // Corrected in place, in the asset's record
            onClick: () => editInRecord(item.id),
            hidden: !request || !(canReceive || approverCorrects(request)),
            disabled: request?.currentStage === 2 && !approverCorrects(request),
            reason: request?.currentStage === 2 && !approverCorrects(request) ? ENDORSED_REASON : undefined,
          },
          resubmitAction(request),
          cancelAction(request),
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
              setDisposing(null);
            },
            hidden: !canIssue,
          },
          {
            // A fixed asset or consumable in store can be transferred (Model 21)
            label: 'Transfer (Model 21)',
            icon: ArrowRightLeft,
            onClick: () => {
              setSelectedId(item.id);
              setTransfer({ itemId: item.id });
              setIssue(null);
              setDisposing(null);
            },
            hidden: !canTransfer,
          },
          {
            label: 'Dispose',
            icon: Trash2,
            onClick: () => {
              setSelectedId(item.id);
              setDisposing({ itemId: item.id });
              setIssue(null);
              setTransfer(null);
            },
            hidden: !canDispose,
          },
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
            },
            // Consumables are issued (Model 22) and used up; only a fixed asset moves on
            hidden: !canTransfer || !!item.heldByOrganization || item.itemType === 'CONSUMABLE',
          },
          {
            label: 'Return to store (Model 21)',
            icon: Undo2,
            onClick: () => {
              setSelectedId(item.id);
              setTransfer({ itemId: item.id, asReturn: true });
              setIssue(null);
            },
            hidden: !canTransfer || !!item.heldByOrganization,
          },
        ];
      case 'REQUEST_PENDING': {
        const editPermission: Record<string, boolean> = { STOCK_OUT: canIssue, DISPOSAL: canDispose, TRANSFER: canTransfer, RETURN: canTransfer };
        const open = row.requests?.length ? row.requests : [request!];
        // Several issues: one Edit each, named by its Model 22 No.; a rejected one is resubmitted or cancelled
        const returned = open.find((r) => r.status === ApprovalStatus.REJECTED);
        return [
          ...open.map((r): RowAction => ({
            label: `Edit ${requestLabel(r.transactionType, r.requestDetails).noun}${open.length > 1 ? ` ${r.ifmisSlipNumber}` : ''}`,
            icon: Pencil,
            onClick: () => editInRecord(item.id, r.id),
            hidden: !(editPermission[r.transactionType] || approverCorrects(r)),
            disabled: r.currentStage === 2 && !approverCorrects(r),
            reason: r.currentStage === 2 && !approverCorrects(r) ? (open.length > 1 ? `Model 22 ${r.ifmisSlipNumber}: ${ENDORSED_REASON}` : ENDORSED_REASON) : undefined,
          })),
          resubmitAction(returned ?? request),
          cancelAction(returned ?? request),
          {
            // Units on issues still waiting stay in store, so another Model 22 can ask for them
            label: 'Issue (Model 22)',
            icon: PackageMinus,
            onClick: () => {
              setSelectedId(item.id);
              setIssue({ itemId: item.id });
              setTransfer(null);
              setDisposing(null);
            },
            hidden: !canIssue || !availableItems.some((i) => i.id === item.id),
          },
          {
            // Remaining units on transfers/returns still waiting can be transferred on another Model 21
            label: 'Transfer (Model 21)',
            icon: ArrowRightLeft,
            onClick: () => {
              setSelectedId(item.id);
              setTransfer({ itemId: item.id });
              setIssue(null);
              setDisposing(null);
            },
            hidden: !canTransfer || !transferableItems.some((i) => i.id === item.id),
          },
          {
            label: 'Return to store (Model 21)',
            icon: Undo2,
            onClick: () => {
              setSelectedId(item.id);
              setTransfer({ itemId: item.id, asReturn: true });
              setIssue(null);
              setDisposing(null);
            },
            hidden:
              !canTransfer ||
              (item.status !== ItemStatus.ISSUED && item.status !== ItemStatus.UNDER_TRANSFER) ||
              !transferableItems.some((i) => i.id === item.id),
          },
        ];
      }
      default:
        return [];
    }
  };
  const duplicateItem = (item: ItemWithRelations) =>
    openReceipt(undefined, templateFromItem(item), `copy-${item.id}-${Date.now()}`, `${item.itemCode} · ${item.name}`);
  /** The items of a Model 19 that can be issued now: in store, approved, with nothing pending on them */
  const issuableOf = (members: AssetGroup[]) => members.map((g) => g.row.item.id).filter((id) => availableItems.some((i) => i.id === id));
  /** A Model 22 issuing the items of a Model 19 still in store, opened on the receipt */
  const issueSlip = (key: string, members: AssetGroup[]) => {
    openSlip(key);
    setIssue({ slip: key, itemIds: issuableOf(members) });
  };
  /** The items of a Model 19 that can be transferred now: in store, approved, with nothing pending or remaining balance */
  const transferableOf = (members: AssetGroup[]) => members.map((g) => g.row.item.id).filter((id) => transferableItems.some((i) => i.id === id));
  /** A Model 21 transferring an item of a Model 19 still in store */
  const transferSlip = (key: string, members: AssetGroup[]) => {
    const ids = transferableOf(members);
    if (!ids.length) return;
    openRecord(ids[0], key);
    setTransfer({ itemId: ids[0] });
  };
  /** A Model 19 of several items, every item on it, as a new receipt */
  const duplicateSlip = (members: AssetGroup[]) => {
    const lead = members[0].row.item;
    openReceipt(undefined, templateFromSlip(members.map((g) => g.row.item)), `copy-slip-${lead.id}-${Date.now()}`, `Model 19 #${lead.ifmisSlipNumber} · ${members.length} items`);
  };
  /** Adjust a whole rejected Model 19 of several items together and resubmit */
  const editSlip = (members: AssetGroup[]) => {
    const itemsOfSlip = members.map((g) => g.row.item);
    const returned = returnedReceiptOf(members);
    openReceipt(
      itemsOfSlip[0],
      undefined,
      `edit-slip-${itemsOfSlip[0].id}-${Date.now()}`,
      undefined,
      itemsOfSlip,
      !!returned
    );
  };

// Note: error UI is rendered before main return below to keep hook execution order unconditional

  /** Units of a whole batch, from the registration's balance (it covers the records issued from it) */
  // What a row's units cost, VAT and charges in: a batch by all its units (the pieces issued from it included), as the
  // Total value under the table counts it
  /** The items of a Model 19 with some units issued and the rest still in store */
  const partlyIn = (members: AssetGroup[]) => new Set(members.filter((g) => batchSummary(g.row, g.children).partly).map((g) => g.row.item.id));
  const rowTotal = (row: AssetRow, children: AssetRow[]) => {
    const { isBatch, totalUnits } = batchSummary(row, children);
    return valueOf(row.item, isBatch ? totalUnits : row.units);
  };
  const batchSummary = (row: AssetRow, children: AssetRow[]) => {
    const { item } = row;
    const out = children.filter((c) => c.item.status === ItemStatus.ISSUED || c.item.status === ItemStatus.UNDER_TRANSFER);
    const issuedUnits = item.balance?.issued ?? out.reduce((acc, c) => acc + c.units, 0) + (row.state === 'ISSUED' ? row.units : 0);
    // Units on a pending issue or disposal: still on the shelf, so still in store until the last approver approves
    const requestedUnits = item.balance?.requested ?? 0;
    const inStoreUnits = item.balance?.available ?? (row.state === 'IN_STORE' ? row.units : 0) + children.filter((c) => c.state === 'IN_STORE').reduce((acc, c) => acc + c.units, 0);
    const totalUnits = item.balance?.total ?? issuedUnits + inStoreUnits;
    // Disposed units left the batch for good; they're listed under it but not counted in it
    const disposed = children.filter((c) => c.item.status === ItemStatus.DISPOSED);
    const disposedUnits = disposed.reduce((acc, c) => acc + c.units, 0);
    const recordsKind = disposed.length === children.length ? 'disposed ' : disposed.length === 0 ? 'issued ' : '';
    return {
      isBatch: children.length > 0,
      out,
      issuedUnits,
      inStoreUnits,
      requestedUnits,
      disposedUnits,
      recordsKind,
      totalUnits,
      holders: [...new Set(out.map((c) => c.where))],
      partly: children.length > 0 && issuedUnits > 0 && inStoreUnits > 0,
    };
  };

  /** The listed rows, as both exports write them */
  const exportTable = () => {
      const headers = [
        '#',
        'Asset Code',
        'Asset Name',
        'Category',
        'Item Type',
        'Status',
        'UoM',
        'Total Quantity',
        'In Store Quantity',
        'Issued Quantity',
        'Held By / Where',
        'IFMIS Slip #',
        'Slip Date (G.C.)',
        'Unit Cost (ETB)',
        'Total Value (ETB)',
        // To check the dashboard: count different consumables by their code, and keep only what is on the register
        'IFMIS Item Code',
        'On Register',
        'Days In Store',
      ];

      const csvRows = sortedShown.map((group, index) => {
        const { item } = group.row;
        const children = group.children ?? [];
        const { isBatch, totalUnits, inStoreUnits, issuedUnits, holders } = batchSummary(group.row, children);
        const uom = item.uom || 'EA';
        // On the register as the dashboard counts it: approved and still held (not waiting for its receipt, rejected or
        // disposed of). Its units are those in store (a waiting issue or disposal still on the shelf) and those issued,
        // so the columns add up to the dashboard's Total, Available and Assigned
        const onRegister = !['RECEIPT_PENDING', 'REJECTED', 'DISPOSED'].includes(group.row.state) && inStoreUnits + issuedUnits > 0;
        const units = onRegister ? inStoreUnits + issuedUnits : isBatch ? totalUnits : group.row.units;
        // Every unit at what it cost, VAT and charges in (a batch's charges counted once, shared over its units)
        const totalValue = valueOf(item, units);
        const whereText = isBatch && group.row.state !== 'ISSUED' && inStoreUnits === 0
          ? '—'
          : group.row.where || '';
        const custodySummary = isBatch && issuedUnits > 0
          ? `${whereText} (${issuedUnits} with ${holders.join('; ')})`
          : whereText;

        return [
          index + 1,
          item.itemCode,
          item.name,
          // The category as people read it (the Summary groups fixed assets by it)
          categoryLabel(item),
          (item.itemType ?? 'FIXED') === 'CONSUMABLE' ? 'Consumable' : 'Fixed asset',
          group.row.state,
          uom,
          units,
          onRegister ? inStoreUnits : 0,
          onRegister ? issuedUnits : 0,
          custodySummary,
          item.ifmisSlipNumber || '',
          item.ifmisSlipDateGc || String(item.createdAtGc || '').slice(0, 10),
          Math.round(costOf(item) * 100) / 100,
          totalValue,
          item.ifmisItemCode || '',
          onRegister ? 'Yes' : 'No',
          // How long its units have been on the shelf (the longest of the batch), as the dashboard counts it
          onRegister && inStoreUnits > 0 ? Math.max(0, ...[group.row, ...children].map((r) => r.daysInStore ?? 0)) : '',
        ];
      });

      // Each issued piece, with the directorate holding it: a batch can be issued to several (the Excel Summary reads these)
      const issued = sortedShown.flatMap((group) =>
        [group.row, ...(group.children ?? [])]
          .filter((r) => r.item.status === ItemStatus.ISSUED || r.item.status === ItemStatus.UNDER_TRANSFER)
          .map((r) => [
            r.item.itemCode,
            r.item.name,
            (r.item.itemType ?? 'FIXED') === 'CONSUMABLE' ? 'Consumable' : 'Fixed asset',
            r.item.assignedDepartment ? departmentLabel(r.item.assignedDepartment) : '',
            r.units,
            r.item.uom || 'EA',
            r.item.ifmisItemCode || '',
          ]),
      );
      return { headers, rows: csvRows, issued };
  };

  const handleExportCSV = () => {
    if (sortedShown.length === 0) {
      toast.warning('No Records', 'There are no assets matching current filters to export.');
      return;
    }
    try {
      const { headers, rows: csvRows } = exportTable();
      downloadCsv(`moa-assets-export-${new Date().toISOString().split('T')[0]}.csv`, headers, csvRows);
      toast.success('CSV Exported', `Exported ${sortedShown.length} asset records.`);
    } catch {
      toast.error('Export Failed', 'Failed to generate asset spreadsheet.');
    }
  };

  /** The filters in force, written on the workbook's Summary so it says what its figures cover */
  const filtersInForce = () =>
    [
      filter !== 'ALL' ? `Status: ${FILTERS.find((f) => f.value === filter)?.label ?? filter}` : '',
      locationFilter !== 'ALL'
        ? `Store: ${(() => {
            const l = locations.find((x) => x.id === locationFilter);
            return l ? storeLocationLabel(l) : locationFilter;
          })()}`
        : '',
      categoryFilter !== 'ALL' ? `Category: ${CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label ?? categoryFilter}` : '',
      typeFilter !== 'ALL' ? `Item type: ${typeFilter === 'CONSUMABLE' ? 'Consumable' : 'Fixed asset'}` : '',
      departmentFilter !== 'ALL' ? `Directorate: ${departments.find((d) => d.id === departmentFilter)?.nameEn ?? departmentFilter}` : '',
      programFilter !== 'ALL' ? `Program: ${programFilter}` : '',
      staleOnly ? 'In store over 30 days' : '',
      search.trim() ? `Search: "${search.trim()}"` : '',
    ].filter(Boolean).join(' · ');

  /** An Excel workbook: the rows, and a Summary with the dashboard's figures worked out by formulas from them */
  const handleExportExcel = async () => {
    if (sortedShown.length === 0) {
      toast.warning('No Records', 'There are no assets matching current filters to export.');
      return;
    }
    try {
      const { headers, rows, issued } = exportTable();
      await downloadAssetsWorkbook(`moa-assets-${new Date().toISOString().split('T')[0]}.xlsx`, headers, rows, filtersInForce(), issued);
      toast.success('Excel Exported', `Exported ${sortedShown.length} asset records, with a summary.`);
    } catch {
      toast.error('Export Failed', 'Failed to generate the Excel workbook.');
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
    const { isBatch, out, issuedUnits, inStoreUnits, requestedUnits, disposedUnits, recordsKind, totalUnits, holders } = batchSummary(row, children);
    // How the units stand: shown for a batch, and for any record with units on a pending request
    const breakdown = isBatch || requestedUnits > 0;
    const received = Math.round((totalUnits + disposedUnits) * 10000) / 10000;
    const qtyBreakdown = [
      disposedUnits > 0 ? `${received} received` : '',
      `${issuedUnits} issued`,
      requestedUnits > 0 ? `${requestedUnits} requested` : '',
      `${inStoreUnits} in store`,
      disposedUnits > 0 ? `${disposedUnits} disposed` : '',
    ].filter(Boolean).join(' · ');
    // Under the units, only what is unusual: part of it out, or part of it gone
    // Every unit disposed of: what was received, and that it is all gone (not "0 of 260")
    const allDisposed = disposedUnits > 0 && totalUnits === 0;
    const qtyNote = allDisposed
      ? 'all disposed'
      : breakdown
        ? [isBatch && issuedUnits > 0 && inStoreUnits > 0 ? `${issuedUnits} issued` : '', disposedUnits > 0 ? `${disposedUnits} disposed` : ''].filter(Boolean).join(' · ')
        : '';
    const whereDetail = [
      row.goingTo ? `→ ${row.goingTo}` : '',
      row.lastMove && (row.state === 'ISSUED' || row.state === 'IN_STORE')
        ? `${row.lastMove.transactionType === 'RETURN' ? 'Returned' : 'Transferred'} on Model 21 No. ${row.lastMove.ifmisSlipNumber}`
        : '',
      isBatch && out.length > 0 ? `${out.reduce((acc, c) => acc + c.units, 0)} with ${holders.length === 1 ? holders[0] : `${holders.length} people`}` : '',
    ].filter(Boolean).join(' · ');

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
        <td className={`py-2.5 pr-4 ${nested ? 'pl-10' : 'pl-5'}`}>
          <span className="block text-slate-900">
            {nested && <span className="mr-1 text-slate-400" aria-hidden="true">↳</span>}
            {item.name}
          </span>
          {/* The code and the type on one line, so a row is two lines high; the type goes under the code when the column is narrow */}
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className={`${table.code} whitespace-nowrap`}>{item.itemCode}</span>
            <ItemTypeBadge type={item.itemType} />
          </span>
          {orphanParent && <span className="block text-[10px] text-slate-500">Part of {orphanParent.itemCode}</span>}
          {isBatch && (
            <button
              type="button"
              onClick={() => toggleBatch(item.id)}
              aria-expanded={batch!.open}
              className="mt-1 inline-flex items-center gap-1 rounded-[4px] text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${batch!.open ? 'rotate-90' : ''}`} />
              {batch!.open ? 'Hide' : 'Show'} {children.length} {recordsKind}{children.length === 1 ? 'record' : 'records'}
            </button>
          )}
        </td>
        <td className="px-3 py-2.5">
          <AssetStatus row={row} partly={isBatch && issuedUnits > 0 && inStoreUnits > 0} />
        </td>
        <td className="px-3 py-2.5 tabular-nums text-slate-600">
          {/* One line: the units on the register, and under them only what is unusual. The full breakdown is in the
              hover text and in the record */}
          <span className="whitespace-nowrap" title={breakdown ? qtyBreakdown : undefined}>
            {allDisposed ? received : isBatch || requestedUnits > 0 ? totalUnits : row.units}
            {/* With some disposed of, also what the Model 19 brought in: "17 of 32 ea" */}
            {disposedUnits > 0 && !allDisposed && ` of ${received}`} {uom.toLowerCase()}
          </span>
          {qtyNote && <span className="mt-0.5 block whitespace-nowrap font-sans text-[10px] font-normal leading-tight text-slate-500">{qtyNote}</span>}
        </td>
        <td className="pl-4 pr-3 py-2.5 text-slate-700">
          {/* The store or the person; where a request would send it, the Model 21 that moved it and who holds the
              issued units are in the hover text and the record */}
          <span className="block" title={whereDetail || undefined}>
            {row.state === 'DISPOSED' || (isBatch && row.state !== 'ISSUED' && inStoreUnits === 0) ? '—' : row.where}
          </span>
          {/* The one thing an approver must not miss stays in the row */}
          {copyOfApproved(row) && (
            <span
              className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-red-700"
              title={`Already ${row.request?.transactionType === 'DISPOSAL' ? 'disposed of' : 'issued'} on this ${voucherName(row.request?.transactionType)} No. ${row.request?.ifmisSlipNumber}${copyOfApproved(row)?.reviewedAtGc ? ` (approved ${formatCreatedDate(copyOfApproved(row)?.reviewedAtGc)})` : ''}: reject this copy`}
            >
              <AlertTriangle className="h-3 w-3" /> Duplicate: reject
            </span>
          )}
        </td>
        <td className="pl-2 pr-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{costOf(item) > 0 ? formatETB(Math.round(costOf(item) * 100) / 100) : '—'}</td>
        <td className="pl-2 pr-4 py-2.5 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
          {rowTotal(row, children) > 0 ? formatETB(rowTotal(row, children)) : '—'}
        </td>
        <td className={`py-2.5 pl-1 pr-3 ${table.actionsCell} ${nested ? '!bg-slate-50' : ''}`}>
          <RowActionsMenu
            label={item.itemCode}
            actions={[
              // Viewing and printing are done from the record (click the row; its printer button), not this menu
              ...actionsFor(row),
              {
                label: 'Duplicate as new receipt',
                icon: Copy,
                onClick: () => duplicateItem(item),
                // A piece split off a batch is not a receipt: duplicate the registration it came from.
                // A rejected record has it among its own actions already.
                hidden: !canReceive || !!item.parentItemId || row.state === 'REJECTED' || item.status === ItemStatus.REJECTED,
              },
            ]}
          />
        </td>
      </tr>
    );
  };

  /** One row for a Model 19 of several items: what they are, where they stand, the slip and its total */
  const renderSlipRow = (key: string, members: AssetGroup[]) => {
    const rowsOf = members.map((g) => g.row);
    const lead = rowsOf[0].item;
    const places = [...new Set(rowsOf.map((r) => r.where))];
    const total = rowsOf.reduce((sum, r) => sum + slipLineTotal(r.item), 0);
    const touched = rowsOf.some((r) => r.item.id === lastTouchedId);
    return (
      <tr
        key={`slip-${key}`}
        tabIndex={0}
        aria-label={`Open Model 19 ${lead.ifmisSlipNumber}`}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a, input')) openSlip(key);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) openSlip(key);
        }}
        className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${touched ? table.rowHighlight : table.row}`}
      >
        <td className="py-2.5 pr-4 pl-5">
          {/* Searching by an item's name puts that item first, so the row shows what was looked for, not "+1" */}
          <span className="block text-slate-900">
            {slipNames([
              ...rowsOf.filter((r) => q && matchesSearch(r)),
              ...rowsOf.filter((r) => !(q && matchesSearch(r))),
            ].map((r) => r.item.name))}
          </span>
          <span className="flex items-center gap-x-1.5 whitespace-nowrap text-xs text-slate-600">
            <span className="rounded-[4px] border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-700">Model 19</span>
            {lead.ifmisSlipNumber && <span className="font-mono text-[11px] text-slate-500">· {lead.ifmisSlipNumber}</span>}
            {lead.poNumber && <span className="text-[11px] text-slate-500">PO {lead.poNumber}</span>}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <SlipStatus rows={rowsOf} partly={partlyIn(members)} />
        </td>
        <td className="px-3 py-2.5 tabular-nums text-slate-600 whitespace-nowrap">{members.length} items</td>
        <td className="pl-4 pr-3 py-2.5 text-slate-700">{places.length === 1 ? places[0] : 'Several places'}</td>
        {/* Several items: no one unit cost */}
        <td className="px-3.5 py-2.5" aria-hidden="true" />
        <td className="pl-2 pr-4 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">
          {formatETB(total)}
        </td>
        <td className={`py-2.5 pl-1 pr-3 ${table.actionsCell}`}>
          <RowActionsMenu
            label={`Model 19 ${lead.ifmisSlipNumber}`}
            actions={[
              {
                label: 'Edit receipt',
                icon: Pencil,
                onClick: () => editSlip(members),
                hidden: !canReceive || !returnedReceiptOf(members),
              },
              resubmitAction(returnedReceiptOf(members)),
              cancelAction(returnedReceiptOf(members)),
              { label: 'Issue (Model 22)', icon: PackageMinus, onClick: () => issueSlip(key, members), hidden: !canIssue || issuableOf(members).length === 0 },
              { label: 'Transfer (Model 21)', icon: ArrowRightLeft, onClick: () => transferSlip(key, members), hidden: !canTransfer || transferableOf(members).length === 0 },
              { label: 'Duplicate as new receipt', icon: Copy, onClick: () => duplicateSlip(members), hidden: !canReceive },
            ]}
          />
        </td>
      </tr>
    );
  };
  /** The receipt request of a rejected Model 19, still with its requester, if it is */
  const returnedReceiptOf = (members: AssetGroup[]) =>
    members.map((g) => pendingByItem.get(g.row.item.id) ?? decided.raised.get(g.row.item.id)?.[0]).find((a) => a?.status === ApprovalStatus.REJECTED && a.transactionType === 'STOCK_IN');
  /** The Model 19 of a receipt of several items, with its approvers' signatures once approved */
  const printSlip = (members: AssetGroup[]) => {
    const lead = members[0].row.item;
    const receiptRequest = approvals
      .filter((a) => a.transactionType === 'STOCK_IN' && a.itemId === lead.id)
      .sort((a, b) => decidedOn(b).localeCompare(decidedOn(a)))[0];
    setVoucher19(buildModel19Voucher(lead, items, user?.fullNameEn, receiptRequest));
  };
  const selectedSlipMembers = selectedSlip ? slips.get(selectedSlip) : undefined;
  // A receipt chosen in the top-bar search opens here once the list has it
  useEffect(() => {
    const openRequested = () => {
      const key = takePendingSlip((k) => slips.has(k));
      if (key) openSlip(key);
    };
    openRequested();
    window.addEventListener(OPEN_SLIP_EVENT, openRequested);
    return () => window.removeEventListener(OPEN_SLIP_EVENT, openRequested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slips]);
  // A request an approver chose to correct from the approvals queue opens in its record's edit form
  useEffect(() => {
    const openRequested = () => {
      const taken = takePendingCorrection((id) => rows.some((r) => r.item.id === id));
      if (taken) editInRecord(taken.itemId, taken.requestId);
    };
    openRequested();
    window.addEventListener(OPEN_CORRECTION_EVENT, openRequested);
    return () => window.removeEventListener(OPEN_CORRECTION_EVENT, openRequested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
        // Its own requests, and those that split it off a batch (a partial issue or disposal)
        .filter((a) => a.itemId === selectedRow.item.id || [a.requestDetails?.issuedItemCode, a.requestDetails?.disposedItemCode].includes(selectedRow.item.itemCode))
        .sort((a, b) => String(b.createdAtGc).localeCompare(String(a.createdAtGc)))
    : [];

  // ── Keyboard: ↑/↓ or j/k open the previous or next asset, Esc goes back to the list ──
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

  // The assets either side of the open one, in the order of the list (also what ↑/↓ and j/k step through)
  const recordIndex = selectedId ? flatSelectableIds.indexOf(selectedId) : -1;
  const previousId = recordIndex > 0 ? flatSelectableIds[recordIndex - 1] : undefined;
  const nextId = recordIndex >= 0 && recordIndex < flatSelectableIds.length - 1 ? flatSelectableIds[recordIndex + 1] : undefined;

  useEffect(() => {
    if (!selectedId && !receipt) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in inputs or when a modal is active
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (voucher19 || voucher21 || voucher22 || voucherDisposal || issue || transfer || disposing) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (receipt) setReceipt(null);
        else if (transfer) setTransfer(null);
        else if (issue) setIssue(null);
        else if (disposing) setDisposing(null);
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
  }, [selectedId, flatSelectableIds, voucher19, voucher21, voucher22, voucherDisposal, receipt, issue, transfer, disposing]);


  const programOptions = useMemo(() => {
    const set = new Set(dbPrograms);
    for (const item of items) {
      if (item.programName?.trim()) set.add(item.programName.trim());
    }
    return Array.from(set).sort().map((name) => ({ value: name, label: name }));
  }, [dbPrograms, items]);

  // The status is in the tabs, always in sight: only the filters inside the popover are counted
  const activeFilterCount =
    (locationFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (departmentFilter !== 'ALL' ? 1 : 0) +
    (programFilter !== 'ALL' ? 1 : 0) +
    (staleOnly ? 1 : 0);
  // Anything that narrows or reorders the list: filters, search or a non-default sort
  const viewChanged = activeFilterCount > 0 || !!search || sortColumn !== 'activity' || sortDirection !== 'desc';
  const resetFilters = () => {
    setFilter('ALL');
    setLocationFilter('ALL');
    setCategoryFilter('ALL');
    setTypeFilter('ALL');
    setDepartmentFilter('ALL');
    setProgramFilter('ALL');
    setStaleOnly(false);
  };
  const resetView = () => {
    resetFilters();
    setSearch('');
    setSortColumn('activity');
    setSortDirection('desc');
  };

  // Records waiting in store longer than the limit, across the whole list
  const staleCount = groups.filter((g) => [g.row, ...g.children].some((r) => r.daysInStore !== undefined && isStale(r))).length;

  // Value of what is listed (same figures as the CSV export); receipts not yet approved and rejected ones don't count
  const totals = sortedShown.reduce(
    (acc, group) => {
      const { row } = group;
      if (row.state === 'REJECTED' || row.state === 'RECEIPT_PENDING' || row.state === 'DISPOSED') return acc;
      const { isBatch, totalUnits, inStoreUnits } = batchSummary(row, group.children ?? []);
      const units = isBatch ? totalUnits : row.units;
      const lineTotal = valueOf(row.item, units);
      acc.value += lineTotal;
      // The units free in store (a pending issue's units are not), at what a unit cost: a record with 1 of 3 on a
      // pending issue still has 2 in store
      acc.inStore += valueOf(row.item, Math.min(inStoreUnits, units));
      return acc;
    },
    { value: 0, inStore: 0 }
  );

  // What the listed records hold, counted as the dashboard counts it (fixed assets in units, consumables by supply), so
  // with no filter it reads as the dashboard's cards and with one as that slice of them. Each record by its own status:
  // a batch and the units issued from it are separate records, one in store and one assigned. A consumable is assigned
  // once none of it is left in store, as on the dashboard, so it is judged by all its stock, not only the listed records
  const onRegister = useMemo(() => {
    const inStore: string[] = [ItemStatus.AVAILABLE, ItemStatus.PENDING_STOCK_OUT, ItemStatus.PENDING_DISPOSAL];
    const assigned: string[] = [ItemStatus.ISSUED, ItemStatus.UNDER_TRANSFER];
    const held = (r: AssetRow) => inStore.includes(r.item.status) || assigned.includes(r.item.status);
    const units = (r: AssetRow) => Number(r.item.quantity) || 1;
    const all = groups.flatMap((g) => [g.row, ...g.children]).filter(held);
    const records = all.filter((r) => inFilter(r, filter, locationFilter, categoryFilter) && matchesSearch(r));
    // Supplies with some stock in store, within the store, category and type chosen (whatever the status shown)
    const stocked = new Set(
      all.filter((r) => isConsumable(r.item) && inStore.includes(r.item.status) && inFilter(r, 'ALL', locationFilter, categoryFilter)).map((r) => supplyKey(r.item)),
    );
    const fixed = records.filter((r) => !isConsumable(r.item));
    const fixedInStore = fixed.filter((r) => inStore.includes(r.item.status)).reduce((n, r) => n + units(r), 0);
    const fixedHeld = fixed.reduce((n, r) => n + units(r), 0);
    const supplies = [...new Set(records.filter((r) => isConsumable(r.item)).map((r) => supplyKey(r.item)))];
    const suppliesInStore = supplies.filter((k) => stocked.has(k)).length;
    return {
      fixed: { held: fixedHeld, inStore: fixedInStore, issued: fixedHeld - fixedInStore },
      supplies: { held: supplies.length, inStore: suppliesInStore, issued: supplies.length - suppliesInStore },
      value: records.reduce((sum, r) => sum + valueOf(r.item, units(r)), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, shown]);

  const issueItem = issue?.edit ? items.find((i) => i.id === issue.edit!.itemId) : undefined;
  // What can go on a Model 22: records in store with nothing waiting, and records whose waiting requests are all issues.
  // Units on issues still waiting stay in store until the last approver approves, so all of them can be requested again
  const availableItems = useMemo(() => {
    const onIssues = new Map<string, number>();
    const blocked = new Set<string>();
    for (const a of approvals) {
      if (a.status !== ApprovalStatus.PENDING) continue;
      if (a.transactionType !== 'STOCK_OUT') blocked.add(a.itemId);
      else onIssues.set(a.itemId, (onIssues.get(a.itemId) ?? 0) + (Number(a.requestDetails?.quantity) || 0));
    }
    return items.flatMap((i): ItemWithRelations[] => {
      if (blocked.has(i.id)) return [];
      if (i.status !== ItemStatus.AVAILABLE && i.status !== ItemStatus.PENDING_STOCK_OUT) return [];
      return onIssues.get(i.id) ? [{ ...i, unitsOnPendingIssues: onIssues.get(i.id) }] : [i];
    });
  }, [items, approvals]);

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

  return (
    <div className="space-y-2.5 animate-fadeIn pb-1">
      {selectedRow || receipt || selectedSlipMembers ? (
        /* ── The open record or registration, using the whole page; closing it (×, Esc) returns to the list as it was ── */
        <div className="grid items-start gap-3">
          {receipt ? (
            <section
              aria-label="Receive items"
              className="rounded-xl flex min-w-0 flex-1 flex-col overflow-hidden bg-white min-h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-4.5rem)] lg:sticky lg:top-2 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]"
            >
              {/* Fishbowl TitleBar */}
              <header className="shrink-0 relative space-y-2 border-b border-slate-200 px-5 py-4 bg-white z-10">
                <div className="absolute right-3 top-3 flex items-center gap-1.5">
                  <CloseButton onClose={() => setReceipt(null)} label="Close registration" title="Back to assets (Esc)" />
                </div>
                <div className="flex items-center gap-2.5 pr-8">
                  <BackButton onBack={() => setReceipt(null)} label="Back to assets" title="Back to assets (Esc)" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {receipt.editBatch && receipt.editBatch.length > 1
                          ? `Edit receipt · Model 19 #${receipt.edit?.ifmisSlipNumber || ''} (${receipt.editBatch.length} items)`
                          : receipt.edit
                          ? `Edit receipt · ${receipt.edit.itemCode}`
                          // A copy keeps the item's real name; the title says which record it was copied from
                          : receipt.copyOf
                          ? `Duplicate of ${receipt.copyOf}`
                          : 'Receive items · Model 19'}
                      </h3>
                      <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {receipt.edit ? 'Correction' : 'New Delivery'}
                      </span>
                    </div>
                    {receipt.edit && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Corrections are allowed until the Team Leader endorses it. Every change is recorded in the item history and audit log.
                      </p>
                    )}
                  </div>
                </div>
              </header>

              {/* Submit and Cancel are in the form's footer, after the last section, pinned to the bottom while scrolling */}
              <div className="flex-1 px-6 py-5 overflow-y-auto">
                {locations.length > 0 ? (
                  <StockInForm
                    key={receipt.edit?.id ?? receipt.templateKey ?? 'new'}
                    locations={locations}
                    employees={employees}
                    editItem={receipt.edit}
                    editBatch={receipt.editBatch}
                    returned={receipt.returned ?? (receipt.edit ? (pendingByItem.get(receipt.edit.id) ?? decided.raised.get(receipt.edit.id)?.[0])?.status === ApprovalStatus.REJECTED : false)}
                    template={receipt.template}
                    registered={items.filter((i) => !i.parentItemId && i.status !== ItemStatus.REJECTED && (receipt.editBatch ? !receipt.editBatch.some((b) => b.id === i.id) : (!receipt.edit || i.id !== receipt.edit.id))).map((i) => ({ slipNumber: i.ifmisSlipNumber, name: i.name, itemCode: i.itemCode, ifmisItemCode: i.ifmisItemCode, unitCostETB: i.unitCostETB }))}
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
          ) : selectedSlipMembers ? (
            <SlipRecord
              rows={selectedSlipMembers.map((g) => g.row)}
              partly={partlyIn(selectedSlipMembers)}
              onOpenItem={(id) => openRecord(id, selectedSlip!)}
              onPrint={() => printSlip(selectedSlipMembers)}
              onDuplicate={canReceive ? () => duplicateSlip(selectedSlipMembers) : undefined}
              onIssue={canIssue && issuableOf(selectedSlipMembers).length > 0 ? () => issueSlip(selectedSlip!, selectedSlipMembers) : undefined}
              onTransfer={canTransfer && transferableOf(selectedSlipMembers).length > 0 ? () => transferSlip(selectedSlip!, selectedSlipMembers) : undefined}
              onEdit={canReceive && returnedReceiptOf(selectedSlipMembers) ? () => editSlip(selectedSlipMembers) : undefined}
              onResubmit={(() => {
                const returned = returnedReceiptOf(selectedSlipMembers);
                return returned && canReceive ? () => void resubmit(returned) : undefined;
              })()}
              onCancelRequest={(() => {
                const returned = returnedReceiptOf(selectedSlipMembers);
                return returned && canReceive ? () => askCancel(returned) : undefined;
              })()}
              form={
                issue?.slip === selectedSlip ? (
                  <div className="space-y-3">
                    {/* The receipt's items that can't be issued now are named, with why, not just left out */}
                    {(() => {
                      const left = selectedSlipMembers.filter((g) => !(issue.itemIds ?? []).includes(g.row.item.id));
                      if (left.length === 0) return null;
                      const why = (g: AssetGroup) => {
                        const r = g.row;
                        if (r.state === 'REQUEST_PENDING' && r.request) {
                          return `its ${requestLabel(r.request.transactionType, r.request.requestDetails).noun} ${r.request.ifmisSlipNumber} is waiting for approval`;
                        }
                        return r.state === 'ISSUED' ? 'it is issued' : r.state === 'DISPOSED' ? 'it is disposed of' : r.state === 'RECEIPT_PENDING' ? 'its receipt is not approved yet' : r.state === 'REJECTED' ? 'its receipt was rejected' : 'none of it is left in store';
                      };
                      return (
                        <FormNotice icon={Info}>
                          Not on this Model 22: {left.map((g) => `${g.row.item.name} (${why(g)})`).join('; ')}.
                        </FormNotice>
                      );
                    })()}
                    <StockOutForm
                      key={`issue-slip-${selectedSlip}`}
                      availableItems={availableItems}
                      departments={departments}
                      employees={employees}
                      initialItemIds={issue.itemIds}
                      onCancel={() => setIssue(null)}
                      onSuccess={(_result, voucher) => {
                        setIssue(null);
                        saved(issue.itemIds?.[0]);
                        if (voucher) setVoucher22(voucher);
                      }}
                    />
                  </div>
                ) : undefined
              }
              onClose={closeRecord}
            />
          ) : selectedRow ? (
            <AssetRecord
              backTo={
                slipBack && slips.has(slipBack)
                  ? { label: `Model 19 #${slips.get(slipBack)![0].row.item.ifmisSlipNumber}`, onClick: () => openSlip(slipBack) }
                  : undefined
              }
              row={selectedRow}
              units={selectedUnits}
              batch={selectedGroup && !selectedIsBatch ? selectedGroup.row : undefined}
              partly={!!selectedSummary?.partly}
              totals={
                selectedSummary?.isBatch || (selectedSummary?.requestedUnits ?? 0) > 0
                  ? {
                      total: selectedSummary.totalUnits,
                      issued: selectedSummary.issuedUnits,
                      inStore: selectedSummary.inStoreUnits,
                      requested: selectedSummary.requestedUnits,
                      disposed: selectedSummary.disposedUnits,
                    }
                  : undefined
              }
              requests={selectedRequests}
              actions={actionsFor(selectedRow)}
              editForm={formOpenFor(selectedRow.item.id) ? editFormFor(selectedRow)?.form : undefined}
              formActions={formOpenFor(selectedRow.item.id) ? editFormFor(selectedRow)?.actions : undefined}
              onPrintRequest={(r) => printRequest(r, selectedRow.item)}
              onSelect={openRecord}
              onClose={closeRecord}
              onCancelForm={() => {
                setIssue(null);
                setTransfer(null);
                setDisposing(null);
                setEditing(false);
              }}
              position={recordIndex >= 0 ? { index: recordIndex, total: flatSelectableIds.length } : undefined}
              onPrevious={previousId ? () => openRecord(previousId) : undefined}
              onNext={nextId ? () => openRecord(nextId) : undefined}
              onSaveIfmisTag={
                selectedRow.item.itemType !== 'CONSUMABLE' &&
                selectedRow.state !== 'REJECTED' &&
                selectedRow.item.status !== ItemStatus.REJECTED &&
                (canReceive || canTransfer || canDispose)
                  ? (tag) => saveIfmisTag(selectedRow.item, tag)
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : (
        /* ── Register ── */
        <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-2.5">
          {/* Status: always in sight, with how many of each */}
          <div role="group" aria-label="Status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((f) => (
              <FilterPill
                key={f.value}
                label={f.label}
                // No number on All: it mixes items on the register with receipts waiting or rejected and items gone
                count={f.value === 'ALL' ? undefined : groups.filter((g) => visibleGroup(g, f.value, locationFilter, categoryFilter)).length}
                title={FILTER_HINTS[f.value]}
                active={filter === f.value}
                onClick={() => setFilter(f.value)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search assets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, serial, slip or person…"
                className={table.search.replace('pr-8', 'pr-3')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
              {/* Reusable Filter Popover */}
              <FilterPopover
                label="Filter"
                ariaLabel="Filter assets"
                title="Filters"
                resetLabel="Reset"
                activeCount={activeFilterCount}
                onReset={resetFilters}
                onClear={resetView}
                showClear={viewChanged}
                resultCountText={`${sortedShown.length} ${sortedShown.length === 1 ? 'group' : 'groups'}`}
              >
                {/* Store & Location */}
                <FilterSection label="Store or location" htmlFor="filter-store-location">
                  <FilterSelect
                    id="filter-store-location"
                    ariaLabel="Filter by store location"
                    placeholder="All stores and locations"
                    value={locationFilter}
                    onChange={setLocationFilter}
                    options={locations.map((loc) => ({
                      value: loc.id,
                      label: storeLocationLabel(loc),
                    }))}
                  />
                </FilterSection>

                {/* Asset Category */}
                <FilterSection label="Category" htmlFor="filter-asset-category">
                  <FilterSelect
                    id="filter-asset-category"
                    ariaLabel="Filter by asset category"
                    placeholder="All categories"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={CATEGORY_OPTIONS}
                  />
                </FilterSection>

                {/* Fixed asset or consumable item */}
                <FilterSection label="Item type" htmlFor="filter-item-type">
                  <FilterSelect
                    id="filter-item-type"
                    ariaLabel="Filter by item type"
                    placeholder="All types"
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={ITEM_TYPE_OPTIONS.map((t) => ({ value: t.value, label: `${t.label} (${t.amharic})` }))}
                  />
                </FilterSection>

                {/* The directorate holding them, as the dashboard's directorate allocation */}
                <FilterSection label="Directorate" htmlFor="filter-directorate">
                  <FilterSelect
                    id="filter-directorate"
                    ariaLabel="Filter by directorate"
                    placeholder="All directorates"
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    options={[...departments].sort((a, b) => a.nameEn.localeCompare(b.nameEn)).map((d) => ({ value: d.id, label: d.nameEn }))}
                  />
                </FilterSection>

                {/* Program or donor project */}
                {programOptions.length > 0 && (
                  <FilterSection label="Program or project" htmlFor="filter-program-project">
                    <FilterSelect
                      id="filter-program-project"
                      ariaLabel="Filter by program or project"
                      placeholder="All programs and projects"
                      value={programFilter}
                      onChange={setProgramFilter}
                      options={programOptions}
                    />
                  </FilterSection>
                )}

                {/* Stock waiting too long to be issued */}
                <FilterSection label="Time in store">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <FilterPill
                      label={`Over ${STALE_IN_STORE_DAYS} days`}
                      count={staleCount}
                      active={staleOnly}
                      onClick={() => setStaleOnly((v) => !v)}
                    />
                  </div>
                </FilterSection>
              </FilterPopover>

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

              {/* 3-Dot Actions Menu for Export & Print (at the right end) */}
              <div className="relative inline-flex" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isActionsMenuOpen}
                  aria-label="Asset export and print actions"
                  title="Export and print options"
                  className={`inline-flex items-center justify-center h-8 w-8 rounded-[4px] border transition cursor-pointer select-none shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActionsMenuOpen
                      ? 'border-emerald-700/60 bg-emerald-50/80 text-emerald-950 shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isActionsMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Asset export options"
                    className="absolute right-0 top-full mt-1.5 w-60 z-50 rounded-md border border-slate-200 bg-white p-1 shadow-lg animate-fadeIn text-xs"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        handleExportCSV();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[4px] text-slate-700 hover:text-emerald-900 hover:bg-emerald-50/70 font-semibold transition cursor-pointer text-left"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export CSV</span>
                    </button>
                    {/* The same rows, with a Summary sheet that works out the dashboard's figures from them */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        void handleExportExcel();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[4px] text-slate-700 hover:text-emerald-900 hover:bg-emerald-50/70 font-semibold transition cursor-pointer text-left"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export Excel (with summary)</span>
                    </button>
                    {/* Several Model 19s at once, from the Excel template: each waits for approval as from the receive form */}
                    {canReceive && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          setIsModel19ImportOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[4px] text-slate-700 hover:text-emerald-900 hover:bg-emerald-50/70 font-semibold transition cursor-pointer text-left"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Import Model 19s (Excel)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Filter Chips (if any filter, search, or sort is active) */}
          {viewChanged && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-xs">
              <span className="text-[11px] font-semibold text-slate-500">Active filters:</span>
              {staleOnly && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 text-[11px] font-medium border border-amber-200">
                  <span>In store over {STALE_IN_STORE_DAYS} days</span>
                  <button
                    type="button"
                    onClick={() => setStaleOnly(false)}
                    title="Remove time-in-store filter"
                    aria-label="Remove time-in-store filter"
                    className="hover:text-amber-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {locationFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
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
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
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
              {typeFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Type: {ITEM_TYPE_OPTIONS.find((t) => t.value === typeFilter)?.label || typeFilter}</span>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('ALL')}
                    title="Remove item type filter"
                    aria-label="Remove item type filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {departmentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Directorate: {departments.find((d) => d.id === departmentFilter)?.nameEn || departmentFilter}</span>
                  <button
                    type="button"
                    onClick={() => setDepartmentFilter('ALL')}
                    title="Remove directorate filter"
                    aria-label="Remove directorate filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {programFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Project: {programFilter}</span>
                  <button
                    type="button"
                    onClick={() => setProgramFilter('ALL')}
                    title="Remove program filter"
                    aria-label="Remove program filter"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
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
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <span>Sorted by {SORT_LABELS[sortColumn]} ({sortDirection === 'asc' ? 'ascending' : 'descending'})</span>
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
            </div>
          )}

          {/* The dashboard's figures for what is listed: the same counting, so a filter here matches a slice there */}
          {rows.length > 0 && (
            <div
              role="group"
              aria-label="Held in the listed assets"
              title="Counted as on the dashboard: approved records in store or assigned; receipts waiting for approval, rejected and disposed are not counted"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 border-t border-slate-100 text-xs text-slate-600"
            >
              <span>
                Fixed assets <b className="tabular-nums text-slate-900">{unitsLabel(onRegister.fixed.held)}</b>{' '}
                <span className="text-slate-500">({onRegister.fixed.inStore.toLocaleString()} in store · {onRegister.fixed.issued.toLocaleString()} assigned)</span>
              </span>
              <span>
                Consumables <b className="tabular-nums text-slate-900">{itemsLabel(onRegister.supplies.held)}</b>{' '}
                <span className="text-slate-500">({onRegister.supplies.inStore.toLocaleString()} in store · {onRegister.supplies.issued.toLocaleString()} assigned)</span>
              </span>
              <span>
                Value <b className="font-mono text-slate-900">{formatETB(onRegister.value)}</b>
              </span>
            </div>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <AssetsTableSkeleton />
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
                  setTypeFilter('ALL');
                  setDepartmentFilter('ALL');
                  setSearch('');
                  setSortColumn('activity');
                  setSortDirection('desc');
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[13px]">
                <thead className={table.headRow}>
                  <tr>
                    <SortableHeader
                      label="Asset"
                      columnKey="name"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      thClassName="pl-5 pr-4 py-2 min-w-[240px]"
                    />
                    <SortableHeader
                      label="Status"
                      columnKey="status"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      thClassName="px-3 py-2 w-32 min-w-[120px]"
                    />
                    <SortableHeader
                      label="Qty"
                      columnKey="units"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      title="Units held now; with some disposed of, out of those received (17 of 32)"
                      thClassName="px-3 py-2 w-24 min-w-[80px]"
                    />
                    <SortableHeader
                      label="Held by / where"
                      columnKey="where"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      thClassName="pl-4 pr-3 py-2 min-w-[180px]"
                    />
                    <SortableHeader
                      label="Unit cost"
                      columnKey="cost"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      align="right"
                      title="What one unit cost, VAT and additional charges included (the Model 19 line total ÷ its quantity)"
                      thClassName="pl-2 pr-2 py-2 w-28 min-w-[110px] text-right whitespace-nowrap"
                    />
                    <SortableHeader
                      label="Total"
                      columnKey="total"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={(key) => handleSort(key as SortColumn)}
                      align="right"
                      title="Unit cost × quantity: what the units on this row cost, VAT and charges included"
                      thClassName="pl-2 pr-4 py-2 w-32 min-w-[120px] text-right whitespace-nowrap"
                    />
                    <th className={`py-2 pl-1 pr-3 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pager.pageItems.map((entry) => {
                    if ('members' in entry && entry.members) return renderSlipRow(entry.slip, entry.members);
                    const { group } = entry;
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
            <div
              className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/40 px-3.5 py-1.5 text-xs text-slate-600"
              title="Approved records only: receipts waiting for approval and rejected receipts are not counted"
              role="group"
              aria-label="Totals of listed assets"
            >
              <span>
                Total value <span className="font-mono font-semibold text-slate-900">{formatETB(totals.value)}</span>
              </span>
              <span>
                In store <span className="font-mono font-semibold text-slate-900">{formatETB(totals.inStore)}</span>
              </span>
            </div>
            {/* Rows of the list (a Model 19 of several items and a batch are one row each), not assets: the line above the table counts those */}
            <Pagination pager={pager} label="rows" />
          </>
        )}
      </div>
      )}

      <Model19PrintModal isOpen={!!voucher19} voucher={voucher19} onClose={() => setVoucher19(null)} />
      {canReceive && (
        <Model19ImportModal
          isOpen={isModel19ImportOpen}
          onClose={() => setIsModel19ImportOpen(false)}
          onImported={() => fetchData(true)}
          // The stores goods can be received into, named as on the receive form
          stores={locations.filter((l) => l.isActive !== false).map((l) => ({ id: l.id, label: storeLocationLabel(l) }))}
        />
      )}
      <Model22PrintModal isOpen={!!voucher22} voucher={voucher22} onClose={() => setVoucher22(null)} />
      <Model21PrintModal isOpen={!!voucher21} voucher={voucher21} onClose={() => setVoucher21(null)} />
      <DisposalPrintModal isOpen={!!voucherDisposal} voucher={voucherDisposal} onClose={() => setVoucherDisposal(null)} />
      {cancelling && (
        <Modal
          isOpen
          onClose={() => !cancelling.busy && setCancelling(null)}
          title={`Cancel ${VOUCHER_OF[cancelling.request.transactionType] ?? 'request'} ${cancelling.request.ifmisSlipNumber}${cancelling.lines.length > 1 ? ` (${cancelling.lines.length} items)` : ''}?`}
          subtitle="The request closes and its records are released. It can't be resubmitted afterwards."
          size="sm"
        >
          <div className="space-y-3 text-xs">
            {cancelling.request.returnRemarks && <p className="text-slate-600">Rejected because: {cancelling.request.returnRemarks}</p>}
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">Reason (optional)</span>
              <input
                type="text"
                value={cancelling.reason}
                maxLength={500}
                onChange={(e) => setCancelling({ ...cancelling, reason: e.target.value })}
                placeholder="e.g. Entered twice"
                className="w-full rounded-[4px] border border-slate-300 px-3 py-2 text-xs focus:border-emerald-700 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCancelling(null)} disabled={cancelling.busy} className={btn.secondary}>
                Keep it
              </button>
              <button type="button" onClick={() => void confirmCancel()} disabled={cancelling.busy} className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60 cursor-pointer">
                {cancelling.busy ? 'Cancelling…' : 'Cancel request'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
