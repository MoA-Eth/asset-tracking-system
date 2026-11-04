import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { broadcastApprovalsUpdated, useRealtimeSync } from '../utils/realtime-sync';
import {

  FileCheck2,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  RefreshCw,
  Search,
  X,
  Eye,
  FileSearch,
  AlertTriangle,
  User,
  ShieldAlert,
  AlertCircle,

  CheckSquare,
  Square,
  ArrowUpDown,
  Send,
  PackagePlus,
  PackageMinus,
  RotateCcw,
  Trash2,
  Sparkles,
  Layers,
  ChevronRight,
  ShieldCheck,
  Paperclip,
  ArrowRightLeft,
  Ban,
  MessageSquare,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { api } from '../api/client';
import { ApprovalsSkeleton } from '../components/ui/Skeleton';
import { table, btn } from '../components/ui/theme';
import { FilterPopover, FilterSection, FilterSelect, FilterPill } from '../components/ui/FilterPopover';
import { ApprovalVoucherModal } from '../components/ui/ApprovalVoucherModal';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { SortableHeader, SortDirection } from '../components/ui/SortableHeader';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import {
  ApprovalStatus,
  TransactionApproval,
  TransactionType,
  UserRole,
  Employee,
  Department,
  Location,
} from '../types/asset-management';
import { getTodayGcAndEc } from '../utils/eth-date';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SlipViewerModal } from '../components/ui/SlipViewerModal';
import { Modal } from '../components/ui/Modal';
import { BackButton } from '../components/ui/BackButton';
import { CloseButton } from '../components/ui/CloseButton';
import { getSlipDisplayName } from '../utils/slip-upload';
import { RefreshButton } from '../components/ui/RefreshButton';
import { approvalPolicy, approvalRowKey, groupBySlip, isSlipGroup, needsChiefDirector, requestCorrection, slipNames, voucherName, voucherUnits } from '../components/assets/slip-groups';
import { formatETB } from '../utils/eth-date';
import { shortDate } from '../components/assets/asset-state';

interface ApprovalsPageProps {
  currentRole?: UserRole;
  onNavigate: (tab: string) => void;
  onRefreshPendingCount?: () => void;
}

type TabFilter = 'MY_QUEUE' | 'STAGE_1' | 'STAGE_2' | 'APPROVED' | 'REJECTED' | 'VOIDED' | 'ALL';

/**
 * Queue tabs shown to a role. Stage approvers only get their own queue
 * ("Pending my action"); the other stage's queue is one they cannot act on.
 */
export { HIGH_VALUE_THRESHOLD } from '../components/assets/slip-groups';

export function getVisibleQueueTabs(role: UserRole, permissions?: string[]): TabFilter[] {
  const canVoid = permissions ? permissions.includes('approvals.void') : (role === UserRole.SUPER_ADMIN);
  if (role === UserRole.SUPER_ADMIN) {
    return ['MY_QUEUE', 'STAGE_1', 'STAGE_2', 'APPROVED', 'REJECTED', 'VOIDED', 'ALL'];
  }
  const canEndorse = permissions ? permissions.includes('approvals.endorse') : (role === UserRole.TEAM_LEADER);
  const canAuthorize = permissions ? permissions.includes('approvals.authorize') : (role === UserRole.DEPARTMENT_HEAD || role === UserRole.CHIEF_DIRECTOR);
  const isSingleStageApprover = (canEndorse && !canAuthorize) || (!canEndorse && canAuthorize);
  const base: TabFilter[] = isSingleStageApprover
    ? ['MY_QUEUE', 'APPROVED', 'REJECTED']
    : ['MY_QUEUE', 'STAGE_1', 'STAGE_2', 'APPROVED', 'REJECTED'];
  if (canVoid) {
    base.push('VOIDED');
  }
  base.push('ALL');
  return base;
}


/**
 * Units a request covers. Stock-Out keeps its requested quantity; other requests use the units on the
 * item record, which only stays meaningful while the request is pending (a later partial issue changes it).
 */
/** How each request type is named in messages, and what its approval does */
const TYPE_TEXT: Record<string, { label: string; approved: string }> = {
  STOCK_IN: { label: 'Model 19 receipt', approved: 'The item is now available in store.' },
  STOCK_OUT: { label: 'Model 22 issue', approved: 'Asset is now ISSUED to staff custodian.' },
  TRANSFER: { label: 'Model 21 Transfer', approved: 'Custody has moved to the new custodian.' },
  RETURN: { label: 'Model 21 Return', approved: 'Asset is now returned to store inventory.' },
  DISPOSAL: { label: 'Disposal request', approved: 'The asset is now recorded as DISPOSED.' },
};
// A Model 22 can be a disposal (write-off) instead of an issue
const typeText = (type?: string, details?: { disposal?: boolean } | null) =>
  type === 'STOCK_OUT' && details?.disposal
    ? { label: 'Model 22 disposal', approved: 'The units are now recorded as DISPOSED.' }
    : TYPE_TEXT[type ?? ''] ?? { label: 'Request', approved: 'The request is approved.' };

const approvalUnits = (a: TransactionApproval): string | null => {
  const uom = a.requestDetails?.uom || a.itemUom || 'EA';
  if (a.requestDetails?.quantity) {
    const isHeld = a.transactionType === 'TRANSFER' || a.transactionType === 'RETURN';
    const partOf =
      a.status === 'PENDING' && a.itemUnits && a.requestDetails.quantity < a.itemUnits
        ? isHeld
          ? ` of ${a.itemUnits} held`
          : ` of ${a.itemUnits} in store`
        : '';
    return `Qty ${a.requestDetails.quantity} ${uom}${partOf}`;
  }
  return a.status === 'PENDING' && a.itemUnits ? `Qty ${a.itemUnits} ${uom}` : null;
};
/** The units of a voucher's lines together ("9 ea"), when they all count in one unit */
const linesUnits = (lines: TransactionApproval[]): string | null =>
  voucherUnits(lines.map((l) => ({ units: l.requestDetails?.quantity ?? l.itemUnits, uom: l.requestDetails?.uom || l.itemUom })));

/** Who decided, by role: from their account, or else the stage they decided at */
const deciderRole = (role?: string, stage?: number): string =>
  role === 'CHIEF_DIRECTOR' ? 'Chief Director'
  : role === 'DEPARTMENT_HEAD' ? 'Department Head'
  : role === 'TEAM_LEADER' ? 'Team Leader'
  : role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' ? 'Administrator'
  : stage === 2 ? 'Department Head' : 'Team Leader';

/** "21 Oct", with the year only when it isn't this year */
const dayMonth = (gc?: string): string => {
  if (!gc) return '';
  const d = new Date(gc);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};


/** Format GC date like "Oct 28, 2026" */
const formatDateRaised = (gc?: string): string => {
  if (!gc) return '—';
  const d = new Date(gc);
  if (Number.isNaN(d.getTime())) return gc;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onNavigate, onRefreshPendingCount }) => {
  const { user, role } = useAuth();
  const toast = useToast();
  const isChiefDirector = role === UserRole.CHIEF_DIRECTOR;
  const isDeptHead = role === UserRole.DEPARTMENT_HEAD;
  const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
  const canApprove = user?.permissions?.includes('approvals.authorize') ?? (isDeptHead || isChiefDirector);
  const canReview = canEndorse || canApprove;
  const canVoid = user?.permissions?.includes('approvals.void') ?? (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.SYSTEM_ADMIN ||
    role === UserRole.DEPARTMENT_HEAD ||
    role === UserRole.CHIEF_DIRECTOR
  );

  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Navigation Controls
  const [activeTab, setActiveTab] = useState<TabFilter>('MY_QUEUE');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [valueFilter, setValueFilter] = useState<'ALL' | 'HIGH_VALUE' | 'STANDARD'>('ALL');

  // Multi-Selection State for Batch Processing
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set());
  const [batchActionType, setBatchActionType] = useState<'ENDORSE' | 'APPROVE' | 'REJECT' | null>(null);
  const [batchRemarks, setBatchRemarks] = useState('');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Single Item Review Modal State
  const [selectedApproval, setSelectedApproval] = useState<TransactionApproval | null>(null);
  // Read-only view of a request and its item
  const [viewingApproval, setViewingApproval] = useState<TransactionApproval | null>(null);
  // Rejected straight from its row: only the reason is asked
  const [rejecting, setRejecting] = useState<TransactionApproval | null>(null);
  // Voiding an already approved voucher
  const [voidingApproval, setVoidingApproval] = useState<TransactionApproval | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Scanned IFMIS slip preview (opens above the review modal)
  const [viewingSlipUrl, setViewingSlipUrl] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const [apprs, emps, deps, locs] = await Promise.all([
        api.getApprovals(),
        api.getEmployees(),
        typeof api.getDepartments === 'function' ? api.getDepartments().catch(() => []) : Promise.resolve([]),
        typeof api.getLocations === 'function' ? api.getLocations().catch(() => []) : Promise.resolve([]),
      ]);
      setApprovals(apprs);
      setEmployees(emps);
      setDepartments(deps);
      setLocations(locs);
    } catch (err: any) {
      console.error('Failed to load approvals:', err);
      toast.error('Approvals Load Failed', err.message || 'Failed to load approvals list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  useRealtimeSync(
    useCallback(() => {
      fetchApprovals();
    }, []),
    { enabled: !actionLoading && !batchProcessing }
  );

  // The lines of one voucher (a Model 19 receipt: same slip and PO; a Model 22 issue: same number), waiting at the
  // same stage, are one row: it is reviewed as a whole. Its row stands in for them; slipLines holds the lines behind it.
  const { rows, slipLines } = useMemo(() => {
    const lines = new Map<string, TransactionApproval[]>();
    const grouped = groupBySlip<TransactionApproval>(approvals, approvalRowKey);
    const list = grouped.map((g): TransactionApproval => {
      if (!isSlipGroup(g)) return g.single;
      const id = `slip:${g.key}`;
      lines.set(id, g.members);
      const lead = g.members[0];
      // Signed as a whole: the grand total decides whether the Chief Director authorizes it
      const total = g.members.reduce((sum, m) => sum + (m.totalAmount || 0), 0);
      const high = needsChiefDirector(total);
      return {
        ...lead,
        id,
        itemName: slipNames(g.members.map((m) => m.itemName)),
        itemCode: `${g.members.length} lines`,
        itemUnits: undefined,
        totalAmount: total,
        requiredRole: high ? 'CHIEF_DIRECTOR' : 'DEPARTMENT_HEAD',
        ifmisSlipAttachmentUrl: g.members.find((m) => m.ifmisSlipAttachmentUrl)?.ifmisSlipAttachmentUrl,
      };
    });
    return { rows: list, slipLines: lines };
  }, [approvals]);
  /** Above 10 million birr: a request by its amount, a voucher of several lines by its grand total (its row's amount) */
  const isHigh = (a: TransactionApproval) => needsChiefDirector(a.totalAmount || 0);

  const poVariations = (p?: string) => (p ? [p, p.replace(/[-_#]/g, ' '), p.replace(/[-_#]/g, '')] : []);
  const codeVariations = (c?: string) => (c ? [c, c.replace(/[-_.]/g, ' '), c.replace(/[-_.]/g, '')] : []);

  const matchesSearch = useCallback(
    (item: TransactionApproval) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      const vName = voucherName(item.transactionType).toLowerCase();
      const altModel =
        item.transactionType === 'STOCK_IN'
          ? 'model 19 model-19 model19 m19 receipt receiving'
          : item.transactionType === 'STOCK_OUT'
            ? 'model 22 model-22 model22 m22 issue siv'
            : item.transactionType === 'TRANSFER' || item.transactionType === 'RETURN'
              ? 'model 21 model-21 model21 m21 transfer return'
              : 'model 20 model-20 model20 m20 disposal model 22/b';

      const lines = slipLines.get(item.id) ?? [];
      const targets = [
        item.itemCode,
        ...codeVariations(item.itemCode),
        item.ifmisItemCode,
        ...codeVariations(item.ifmisItemCode),
        item.ifmisTagNumber,
        ...codeVariations(item.ifmisTagNumber),
        item.serialNumber,
        item.itemName,
        item.ifmisSlipNumber,
        item.poNumber,
        ...poVariations(item.poNumber),
        item.purposeOrRemarks,
        item.requestedBy?.fullNameEn,
        item.requestedBy?.fullNameAm,
        item.endorsedBy?.fullNameEn,
        item.endorsedBy?.fullNameAm,
        item.recipientEmployee?.fullNameEn,
        item.recipientEmployee?.fullNameAm,
        item.requestDetails?.organizationName,
        item.requestDetails?.recipientName,
        item.targetDepartmentId ? departments.find((d) => d.id === item.targetDepartmentId)?.nameEn : undefined,
        item.targetLocationId ? locations.find((l) => l.id === item.targetLocationId)?.siteName : undefined,
        vName,
        altModel,
        ...lines.flatMap((l) => [
          l.itemName,
          l.itemCode,
          ...codeVariations(l.itemCode),
          l.ifmisItemCode,
          ...codeVariations(l.ifmisItemCode),
          l.ifmisTagNumber,
          ...codeVariations(l.ifmisTagNumber),
          l.serialNumber,
          l.ifmisSlipNumber,
          l.poNumber,
          ...poVariations(l.poNumber),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const words = q.split(/\s+/).filter(Boolean);
      return targets.includes(q) || (words.length > 1 && words.every((w) => targets.includes(w)));
    },
    [departments, locations, searchTerm, slipLines],
  );

  // Compute live counter metrics
  const metrics = useMemo(() => {
    const base = searchTerm.trim() ? rows.filter(matchesSearch) : rows;
    const pending = base.filter((a) => a.status === ApprovalStatus.PENDING);
    const stage1 = pending.filter((a) => (a.currentStage ?? 1) === 1);
    const stage2 = pending.filter((a) => a.currentStage === 2);
    const approved = base.filter((a) => a.status === ApprovalStatus.APPROVED && !a.voidDetails?.voided);
    const rejected = base.filter((a) => a.status === ApprovalStatus.REJECTED);
    const voided = base.filter((a) => a.status === ApprovalStatus.VOIDED || Boolean(a.voidDetails?.voided));

    let myQueueCount = 0;
    if (canEndorse && canApprove) {
      myQueueCount = stage1.length + stage2.length;
    } else if (canEndorse) {
      myQueueCount = stage1.length;
    } else if (isChiefDirector) {
      myQueueCount = stage2.filter((a) => isHigh(a)).length;
    } else if (isDeptHead) {
      myQueueCount = stage2.filter((a) => !isHigh(a)).length;
    } else if (canApprove) {
      myQueueCount = stage2.length;
    } else {
      myQueueCount = pending.length;
    }

    return {
      myQueueCount,
      stage1Count: stage1.length,
      stage2Count: stage2.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      voidedCount: voided.length,
      totalCount: base.length,
    };
  }, [rows, searchTerm, matchesSearch, canEndorse, canApprove, isChiefDirector, isDeptHead]);

  // Filtered approvals list
  const filteredApprovals = useMemo(() => {
    return rows.filter((item) => {
      // 1. Tab Status Filter
      if (activeTab === 'MY_QUEUE') {
        if (item.status !== ApprovalStatus.PENDING) return false;
        if (canEndorse && canApprove) {
          if ((item.currentStage ?? 1) !== 1 && item.currentStage !== 2) return false;
          if (item.currentStage === 2) {
            const high = isHigh(item);
            if (isChiefDirector && !high) return false;
            if (isDeptHead && high) return false;
          }
        } else if (canEndorse) {
          if ((item.currentStage ?? 1) !== 1) return false;
        } else if (canApprove) {
          if (item.currentStage !== 2) return false;
          const high = isHigh(item);
          if (isChiefDirector && !high) return false;
          if (isDeptHead && high) return false;
        }
      } else if (activeTab === 'STAGE_1') {
        if (item.status !== ApprovalStatus.PENDING || (item.currentStage ?? 1) !== 1) return false;
      } else if (activeTab === 'STAGE_2') {
        if (item.status !== ApprovalStatus.PENDING || item.currentStage !== 2) return false;
      } else if (activeTab === 'APPROVED') {
        if (item.status !== ApprovalStatus.APPROVED || item.voidDetails?.voided) return false;
      } else if (activeTab === 'REJECTED') {
        if (item.status !== ApprovalStatus.REJECTED) return false;
      } else if (activeTab === 'VOIDED') {
        if (item.status !== ApprovalStatus.VOIDED && !item.voidDetails?.voided) return false;
      }

      // 2. Type Filter
      if (typeFilter !== 'ALL' && item.transactionType !== typeFilter) {
        return false;
      }

      // 3. Value Filter
      if (valueFilter === 'HIGH_VALUE' && !isHigh(item)) {
        return false;
      }
      if (valueFilter === 'STANDARD' && isHigh(item)) {
        return false;
      }

      // 4. Search Filter
      return matchesSearch(item);
    });
  }, [rows, activeTab, canEndorse, canApprove, isChiefDirector, isDeptHead, typeFilter, valueFilter, matchesSearch]);

  type ApprovalSortColumn = 'type' | 'item' | 'stage' | 'requester' | 'created' | 'total';
  const [sortColumn, setSortColumn] = useState<ApprovalSortColumn>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const toggleExpandSlip = (id: string) => {
    setExpandedSlips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (colKey: string) => {
    const col = colKey as ApprovalSortColumn;
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const sortedApprovals = useMemo(() => {
    return [...filteredApprovals].sort((a, b) => {
      let diff = 0;
      if (sortColumn === 'type') {
        diff = a.transactionType.localeCompare(b.transactionType);
      } else if (sortColumn === 'item') {
        const itemA = a.itemName || a.itemCode || '';
        const itemB = b.itemName || b.itemCode || '';
        diff = itemA.localeCompare(itemB);
      } else if (sortColumn === 'stage') {
        diff = (a.currentStage ?? 1) - (b.currentStage ?? 1);
      } else if (sortColumn === 'requester') {
        const reqA = a.requestedBy?.fullNameEn || '';
        const reqB = b.requestedBy?.fullNameEn || '';
        diff = reqA.localeCompare(reqB);
      } else if (sortColumn === 'created') {
        const dateA = a.createdAtGc || '';
        const dateB = b.createdAtGc || '';
        diff = dateA.localeCompare(dateB);
      } else if (sortColumn === 'total') {
        diff = (a.totalAmount || 0) - (b.totalAmount || 0);
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [filteredApprovals, sortColumn, sortDirection]);


  const cumulativePendingValue = useMemo(() => {
    return filteredApprovals
      .filter((a) => a.status === ApprovalStatus.PENDING)
      .reduce((sum, a) => sum + (a.totalAmount || 0), 0);
  }, [filteredApprovals]);
  const queueStats = useMemo(() => {
    const totalVal = filteredApprovals.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
    const s1 = filteredApprovals.filter((a) => a.status === ApprovalStatus.PENDING && (a.currentStage ?? 1) === 1).length;
    const s2 = filteredApprovals.filter((a) => a.status === ApprovalStatus.PENDING && a.currentStage === 2).length;
    return { totalVal, s1, s2 };
  }, [filteredApprovals]);

  const selectedTotalValue = useMemo(() => {
    return rows
      .filter((r) => selectedIds.includes(r.id))
      .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  }, [rows, selectedIds]);

  const pager = usePagination(sortedApprovals, { resetKey: `${activeTab}|${typeFilter}|${valueFilter}|${searchTerm}|${sortColumn}|${sortDirection}` });

  // Checkbox selection. "Select all" covers the page on screen, so nothing out of sight is approved in bulk.
  const actionablePendingItems = useMemo(() => {
    return pager.pageItems.filter((a) => {
      if (a.status !== ApprovalStatus.PENDING) return false;
      if (canEndorse && canApprove) return (a.currentStage ?? 1) === 1 || a.currentStage === 2;
    if (canEndorse) return (a.currentStage ?? 1) === 1;
      if (canApprove) return a.currentStage === 2;
      return canReview;
    });
  }, [pager.pageItems, canEndorse, canApprove, canReview]);

  const isAllSelected =
    actionablePendingItems.length > 0 &&
    actionablePendingItems.every((item) => selectedIds.includes(item.id));

  const handleToggleSelectAll = () => {
    const pageIds = actionablePendingItems.map((i) => i.id);
    if (isAllSelected) {
      // Requests picked on other pages stay selected
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  /** Sends a decision: every line of a receipt at once (all or none), or a single request */
  const decide = (id: string, action: 'ENDORSE' | 'APPROVE' | 'REJECT', reviewedById?: string, remarks?: string) => {
    const receipt = slipLines.get(id);
    return receipt
      ? api.handleSlipApproval({ approvalIds: receipt.map((l) => l.id), action, reviewedById: reviewedById as string, reviewRemarks: remarks })
      : api.handleApproval({ approvalId: id, action, reviewedById: reviewedById as string, reviewRemarks: remarks });
  };

  // Single Action Handler
  /** A small mistake is corrected in the asset's record instead of rejecting the request; not on one's own request */
  const correctButton = (a: TransactionApproval) =>
    a.requestedById !== user?.id && (
      <button
        type="button"
        disabled={actionLoading}
        onClick={() => {
          setSelectedApproval(null);
          requestCorrection(a.itemId, a.transactionType === 'STOCK_IN' ? undefined : a.id);
          onNavigate('assets');
        }}
        title="Fix a typo in the request yourself; it stays with you to endorse or authorize"
        className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
      >
        <Pencil className="w-4 h-4" /> Edit
      </button>
    );

  const handleAction = async (approvalId: string, action: 'ENDORSE' | 'APPROVE' | 'REJECT') => {
    setActionError(null);
    if (action === 'REJECT' && !reviewRemarks.trim()) {
      setActionError('Please provide a mandatory reason for rejection.');
      toast.warning('Remarks Required', 'A reason or remarks must be provided when rejecting a transaction.');
      return;
    }

    if (!canReview) {
      const msg = 'Access Denied: You do not have permission to perform approval actions.';
      setActionError(msg);
      toast.error('Permission Denied', msg);
      return;
    }

    const target = rows.find((a) => a.id === approvalId) || selectedApproval;
    const receipt = slipLines.get(approvalId);
    const itemCode = receipt ? `${voucherName(target?.transactionType)} #${target?.ifmisSlipNumber}, ${receipt.length} items` : target?.itemCode || 'Transaction';
    const typeLabel = typeText(target?.transactionType, target?.requestDetails).label;

    setActionLoading(true);
    // The server records the signed-in reviewer
    const approverId = user?.id;

    try {
      await decide(approvalId, action, approverId, reviewRemarks.trim() || undefined);

      setSelectedApproval(null);
      setRejecting(null);
      setReviewRemarks('');
      setSelectedIds((prev) => prev.filter((id) => id !== approvalId));
      await fetchApprovals();
      onRefreshPendingCount?.();
      broadcastApprovalsUpdated();

      if (action === 'ENDORSE') {
        toast.success(
          'Stage 1 Endorsement Recorded',
          `${typeLabel} (${itemCode}) verified and advanced to the ${target && isHigh(target) ? 'Chief Director (above 10,000,000 ETB)' : 'Department Head'} for Stage 2 final approval.`
        );
      } else if (action === 'APPROVE') {
        const resultDesc = typeText(target?.transactionType, target?.requestDetails).approved;
        toast.success(
          'Authorization Approved',
          `${typeLabel} (${itemCode}) granted final sign-off. ${resultDesc}`
        );
      } else if (action === 'REJECT') {
        toast.warning(
          'Transaction Rejected',
          `${typeLabel} (${itemCode}) went back to ${target?.requestedBy?.fullNameEn || 'its requester'} with your reason, to correct and resubmit, or cancel.`
        );
      }
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setActionError(`Approval action failed: ${errMsg}`);
      toast.error('Approval Action Failed', errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const getVoidReversalDescription = (appr: TransactionApproval): string => {
    switch (appr.transactionType) {
      case TransactionType.STOCK_OUT:
        return 'Restores issued asset/quantity back into store inventory as Available and clears custodian assignment.';
      case TransactionType.STOCK_IN:
        return 'Marks received asset as Cancelled (removed from active store inventory).';
      case TransactionType.TRANSFER:
        return 'Reverts asset custody back to the previous holder / source department.';
      case TransactionType.RETURN:
        return 'Reverts asset from store back into custodian custody.';
      case TransactionType.DISPOSAL:
        return 'Restores disposed asset/units back to Available in store inventory.';
      default:
        return 'Reverses this approved transaction and updates item inventory records.';
    }
  };

  const handleVoidApproved = async () => {
    if (!voidingApproval) return;
    const reason = voidReason.trim();
    if (reason.length < 10) {
      setVoidError('Please provide a specific audit justification (minimum 10 characters required).');
      return;
    }

    setVoidLoading(true);
    setVoidError(null);

    const lines = slipLines.get(voidingApproval.id);
    const targetIds = lines && lines.length > 0 ? lines.map((l) => l.id) : [voidingApproval.id];
    const voucherDesc = voucherName(voidingApproval.transactionType);
    const slipDesc = voidingApproval.ifmisSlipNumber ? `#${voidingApproval.ifmisSlipNumber}` : voidingApproval.itemCode;

    try {
      const res = await api.voidApprovals(targetIds, reason);
      toast.success(
        'Transaction Voided',
        `Successfully voided ${voucherDesc} ${slipDesc} (${res.length} item(s)). Inventory states and custody have been restored.`
      );
      setVoidingApproval(null);
      setVoidReason('');
      await fetchApprovals();
      onRefreshPendingCount?.();
      broadcastApprovalsUpdated();
    } catch (err: any) {
      const msg = err.message || 'Failed to void transaction.';
      setVoidError(msg);
      toast.error('Void Action Failed', msg);
    } finally {
      setVoidLoading(false);
    }
  };

  // Batch Multi-Item Processing
  const handleOpenBatchModal = (action: 'ENDORSE' | 'APPROVE' | 'REJECT') => {
    if (selectedIds.length === 0) return;
    setBatchActionType(action);
    setBatchRemarks('');
    setIsBatchModalOpen(true);
  };

  const handleExecuteBatch = async () => {
    if (!batchActionType || selectedIds.length === 0) return;
    if (batchActionType === 'REJECT' && !batchRemarks.trim()) {
      toast.warning('Remarks Required', 'Please provide a reason or remarks for batch rejection.');
      return;
    }

    setBatchProcessing(true);
    // The server records the signed-in reviewer
    const approverId = user?.id;

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        await decide(id, batchActionType, approverId, batchRemarks.trim() || undefined);
        successCount++;
      } catch (err) {
        console.error(`Failed to process approval ${id}:`, err);
        failCount++;
      }
    }

    setBatchProcessing(false);
    setIsBatchModalOpen(false);
    setSelectedIds([]);
    await fetchApprovals();
    onRefreshPendingCount?.();
    broadcastApprovalsUpdated();

    const actionText =
      batchActionType === 'ENDORSE'
        ? 'endorsed'
        : batchActionType === 'APPROVE'
        ? 'approved'
        : 'rejected';

    if (successCount > 0) {
      toast.success(
        'Batch Processing Complete',
        `Successfully ${actionText} ${successCount} request(s).`
      );
    }
    if (failCount > 0) {
      toast.error(
        'Batch Warnings',
        `${failCount} request(s) failed processing. Please inspect individually.`
      );
    }
  };

  // Statutory form badges adhering to app brand
  const getTypeBadge = (type: TransactionType, details?: { disposal?: boolean } | null) => {
    if (type === TransactionType.STOCK_OUT && details?.disposal) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
          <PackageMinus className="w-3 h-3 text-slate-600" />
          Model 22 (DISPOSAL)
        </span>
      );
    }
    switch (type) {
      case TransactionType.STOCK_IN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            <PackagePlus className="w-3 h-3 text-emerald-700" />
            Model 19 (IN)
          </span>
        );
      case TransactionType.STOCK_OUT:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            <PackageMinus className="w-3 h-3 text-sky-700" />
            Model 22 (OUT)
          </span>
        );
      case TransactionType.RETURN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            <RotateCcw className="w-3 h-3 text-amber-700" />
            Model 21 (RET)
          </span>
        );
      case TransactionType.TRANSFER:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            <ArrowRightLeft className="w-3 h-3 text-violet-700" />
            Model 21 (TRF)
          </span>
        );
      case TransactionType.DISPOSAL:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            <Trash2 className="w-3 h-3 text-slate-600" />
            Disposal (DSP)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  // Clean, understated stage stepper
  const getStageIndicator = (appr: TransactionApproval) => {
    // Decided, returned or voided: the outcome, who by (their role) and when, and the reason on one line; the rest on hover
    if (appr.status !== ApprovalStatus.PENDING) {
      const isVoided = appr.status === ApprovalStatus.VOIDED || Boolean(appr.voidDetails?.voided);
      const cancelled = appr.status === ApprovalStatus.CANCELLED;
      const rejected = appr.status === ApprovalStatus.REJECTED;
      const person = isVoided
        ? { fullNameEn: appr.voidDetails?.voidedByName || 'Admin', role: 'ADMIN' }
        : (appr.returnedBy || appr.reviewedBy);
      const stage = appr.returnedFromStage || (appr.status === ApprovalStatus.APPROVED ? 2 : appr.currentStage);
      const by = isVoided
        ? (appr.voidDetails?.voidedByName || 'Administrator')
        : (cancelled ? 'the requester' : deciderRole(person?.role, stage));
      const date = isVoided
        ? (appr.voidDetails?.voidedAtGc || appr.reviewedAtGc)
        : (appr.returnedAtGc || appr.reviewedAtGc);
      const reason = (isVoided ? appr.voidDetails?.voidReason : (appr.returnRemarks || appr.reviewRemarks))?.trim();
      const tone = isVoided
        ? { badge: 'bg-rose-50 text-rose-800 border-rose-300 font-bold', text: 'text-rose-700', icon: <Ban className="w-3 h-3 text-rose-700" />, label: 'Voided' }
        : rejected
          ? { badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', icon: <XCircle className="w-3 h-3 text-rose-600" />, label: 'Rejected' }
          : cancelled
            ? { badge: 'bg-slate-100 text-slate-700 border-slate-300', text: 'text-slate-600', icon: <XCircle className="w-3 h-3 text-slate-500" />, label: 'Cancelled' }
            : { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: '', icon: <CheckCircle2 className="w-3 h-3 text-emerald-700" />, label: 'Approved' };
      const detail = [isVoided ? `Voided by ${appr.voidDetails?.voidedByName || 'Admin'}` : person?.fullNameEn, shortDate(date), reason].filter(Boolean).join(' · ');
      return (
        <div className="flex min-w-[150px] max-w-[220px] flex-col gap-0.5" title={detail}>
          <span className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${tone.badge}`}>
            {tone.icon}
            {tone.label}
          </span>
          <span className="truncate text-[11px] text-slate-500">{[`by ${by}`, dayMonth(date)].filter(Boolean).join(' · ')}</span>
          {reason && <span className={`truncate text-[11px] ${tone.text}`}>{reason}</span>}
        </div>
      );
    }

    const stage = appr.currentStage ?? 1;
    const isHighValue = isHigh(appr);
    const stage2Label = isHighValue ? '2. Chief Director (>10M)' : '2. Dept. Head';
    const stage2PillText = isHighValue ? 'Stage 2: Chief Director (>10M)' : 'Stage 2: Dept. Head';

    if (stage === 1) {
      return (
        <div className="flex flex-col gap-1 text-xs whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300/90 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span>Stage 1 (Team Leader)</span>
            <span className="sr-only">1. Endorse</span>
          </span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 pl-1">
            <span className="text-slate-400 select-none">→</span>
            <span>Stage 2 (Awaiting)</span>
            <span className="sr-only">{stage2Label}</span>
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1 text-xs whitespace-nowrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/90 w-fit">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>Stage 1 (Done)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 w-fit">
          <span className={`w-1.5 h-1.5 rounded-full ${isHighValue ? 'bg-purple-600' : 'bg-emerald-600'} shrink-0`} />
          <span>{stage2PillText}</span>
          <span className="sr-only">{stage2Label}</span>
        </span>
      </div>
    );
  };

  const visibleQueueTabsList = useMemo(() => {
    return [
      { id: 'MY_QUEUE' as TabFilter, label: 'Pending My Action', count: metrics.myQueueCount },
      { id: 'STAGE_1' as TabFilter, label: 'Stage 1 (Team Leader)', count: metrics.stage1Count },
      { id: 'STAGE_2' as TabFilter, label: 'Stage 2 (Dept Head)', count: metrics.stage2Count },
      { id: 'APPROVED' as TabFilter, label: 'Approved History', count: metrics.approvedCount },
      { id: 'REJECTED' as TabFilter, label: 'Rejected', count: metrics.rejectedCount },
      { id: 'VOIDED' as TabFilter, label: 'Voided', count: metrics.voidedCount },
      { id: 'ALL' as TabFilter, label: 'All Records', count: metrics.totalCount },
    ].filter((tab) => getVisibleQueueTabs(role, user?.permissions).includes(tab.id));
  }, [role, user?.permissions, metrics]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'ALL') count++;
    if (valueFilter !== 'ALL') count++;
    if (activeTab !== 'MY_QUEUE') count++;
    return count;
  }, [typeFilter, valueFilter, activeTab]);

  const viewChanged = activeFilterCount > 0 || !!searchTerm.trim();

  const handleResetFilters = () => {
    setTypeFilter('ALL');
    setValueFilter('ALL');
    setActiveTab('MY_QUEUE');
    setSelectedIds([]);
  };

  const handleClearAll = () => {
    handleResetFilters();
    setSearchTerm('');
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-8">

      {/* ── 1. Top Header with Title & Global Search/Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-1 rounded-md bg-slate-100 text-slate-700">
            <FileCheck2 className="w-5 h-5 text-slate-800" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Approval Requests</h1>
          {metrics.myQueueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {metrics.myQueueCount} Action Required
            </span>
          )}
        </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72 md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search requests"
                placeholder="Search by item code, IFMIS code, PO #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded-md text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-colors shadow-2xs"
              />
            </div>
            <FilterPopover
              label="Filter"
              ariaLabel="Filter approval requests"
              title="Filters"
              resetLabel="Reset all"
              activeCount={activeFilterCount}
              onReset={handleResetFilters}
              onClear={handleClearAll}
              showClear={viewChanged}
              resultCountText={`${sortedApprovals.length} ${sortedApprovals.length === 1 ? 'request' : 'requests'}`}
            >
              {/* Statutory Forms */}
              <FilterSection label="Statutory Form" htmlFor="filter-statutory-form">
                <FilterSelect
                  id="filter-statutory-form"
                  ariaLabel="Filter by statutory form"
                  placeholder="All Statutory Forms"
                  value={typeFilter}
                  onChange={(val) => setTypeFilter(val as any)}
                  options={[
                    { value: TransactionType.STOCK_IN, label: 'Receiving (Model 19)' },
                    { value: TransactionType.STOCK_OUT, label: 'Issuing (Model 22)' },
                    { value: TransactionType.RETURN, label: 'Model 21 (Return to Store)' },
                    { value: TransactionType.TRANSFER, label: 'Model 21 (Asset Transfer)' },
                    { value: TransactionType.DISPOSAL, label: 'Disposal' },
                  ]}
                />
              </FilterSection>

              {/* Review Queue / Stage */}
              <FilterSection label="Review Queue">
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {visibleQueueTabsList.map((tab) => (
                    <FilterPill
                      key={tab.id}
                      label={tab.label}
                      count={tab.count}
                      active={activeTab === tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setSelectedIds([]);
                      }}
                    />
                  ))}
                </div>
              </FilterSection>

              {/* Transaction Value */}
              {approvalPolicy.chiefDirectorAboveThreshold && (
              <FilterSection label="Transaction Value" htmlFor="filter-approval-value">
                <FilterSelect
                  id="filter-approval-value"
                  ariaLabel="Filter by transaction value"
                  placeholder="All Transaction Values"
                  value={valueFilter}
                  onChange={(val) => setValueFilter(val as any)}
                  options={[
                    { value: 'HIGH_VALUE', label: 'High Value (> 10M ETB · Chief Director)' },
                    { value: 'STANDARD', label: 'Standard (≤ 10M ETB)' },
                  ]}
                />
              </FilterSection>
              )}
            </FilterPopover>
          </div>
        </div>

      {/* Active Filter Chips */}
      {(typeFilter !== 'ALL' || valueFilter !== 'ALL') && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-semibold text-slate-500">Active filters:</span>
          {typeFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 text-[11px] font-medium border border-emerald-200">
              <span>
                {typeFilter === TransactionType.STOCK_IN
                  ? 'Model 19 (Receipt)'
                  : typeFilter === TransactionType.STOCK_OUT
                  ? 'Model 22 (Issue)'
                  : typeFilter === TransactionType.RETURN
                  ? 'Model 21 (Return)'
                  : typeFilter === TransactionType.TRANSFER
                  ? 'Model 21 (Transfer)'
                  : 'Disposal'}
              </span>
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                title="Remove statutory form filter"
                aria-label="Remove statutory form filter"
                className="hover:text-emerald-950 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {valueFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-900 text-[11px] font-medium border border-purple-200">
              <span>{valueFilter === 'HIGH_VALUE' ? 'High Value (> 10M ETB)' : 'Standard (≤ 10M ETB)'}</span>
              <button
                type="button"
                onClick={() => setValueFilter('ALL')}
                title="Remove value filter"
                aria-label="Remove value filter"
                className="hover:text-purple-950 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* ── 2. Unified Container (Tab Strip + Table + Footer) ── */}
      <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)] border border-slate-200">
        
        {/* Status Tab Strip */}
        <div className="border-b border-slate-200/90 bg-slate-50/70 px-3.5 sm:px-4 py-2">
          <div role="group" aria-label="Review Queue" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {visibleQueueTabsList.map((tab) => {
              const isActive = activeTab === tab.id;
              const isPending = (tab.id === 'MY_QUEUE' || tab.id === 'STAGE_1' || tab.id === 'STAGE_2') && tab.count > 0;
              const isRejected = tab.id === 'REJECTED' && tab.count > 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedIds([]);
                  }}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[5px] text-xs font-semibold transition cursor-pointer select-none whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white text-emerald-950 border border-slate-300 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 border border-transparent'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums min-w-[18px] ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : isPending
                        ? 'bg-amber-100 text-amber-800'
                        : isRejected
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        {loading && approvals.length === 0 ? (
          <ApprovalsSkeleton />
        ) : filteredApprovals.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">No Approvals Matching Criteria</h3>
            <div className="text-xs text-slate-500 max-w-md mx-auto space-y-3">
              {searchTerm.trim() && metrics.totalCount > 0 ? (
                <>
                  <p>
                    No requests in <strong>{visibleQueueTabsList.find((t) => t.id === activeTab)?.label}</strong> match "{searchTerm}", but found <strong>{metrics.totalCount}</strong> matching request{metrics.totalCount === 1 ? '' : 's'} in other tabs.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ALL')}
                    className="px-3.5 py-1.5 bg-moa-green hover:bg-moa-green-hover text-white rounded-[4px] font-semibold text-xs transition cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  >
                    View in All Records ({metrics.totalCount})
                  </button>
                </>
              ) : (
                <p>All registered stock transactions are fully cleared for the selected filters.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className={table.headRow}>
                  {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                    <th className="py-2.5 px-3 w-10 text-center shrink-0">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer w-4 h-4"
                        title="Select All Actionable Items"
                      />
                    </th>
                  )}
                  <SortableHeader
                    label="Asset / details"
                    columnKey="item"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-2.5 px-3 min-w-[200px]"
                  />
                  <SortableHeader
                    label="Initiator"
                    columnKey="requester"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="hidden md:table-cell py-2.5 px-2.5 w-36 max-w-[140px] whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Date Raised"
                    columnKey="created"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="hidden lg:table-cell py-2.5 px-2 w-24 whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Workflow Stage"
                    columnKey="stage"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-2.5 px-2.5 w-40 whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Value (ETB)"
                    columnKey="total"
                    align="right"
                    title="Total (ETB)"
                    ariaLabel="Total (ETB)"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-2.5 px-2.5 text-right w-28 whitespace-nowrap shrink-0"
                  />
                  <th className="py-2.5 px-2 text-center w-36 whitespace-nowrap shrink-0 font-normal">
                    Approval Actions
                  </th>
                  <th className="py-2.5 px-2 text-center w-12 whitespace-nowrap shrink-0 font-normal">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pager.pageItems.map((appr) => {
                  const isSelected = selectedIds.includes(appr.id);
                  const isPending = appr.status === ApprovalStatus.PENDING;
                  const stage = appr.currentStage ?? 1;
                  const isHighValue = isHigh(appr);
                  const canAuthorizeThis =
                    canApprove &&
                    stage === 2 &&
                    ((isChiefDirector && isHighValue) ||
                      (isDeptHead && !isHighValue) ||
                      (!isChiefDirector && !isDeptHead));
                  const isActionableForMe = isPending && ((canEndorse && stage === 1) || canAuthorizeThis);
                  const isExpanded = expandedSlips.has(appr.id);
                  const lines = slipLines.get(appr.id);

                  return (
                    <React.Fragment key={appr.id}>
                      <tr
                        className={`hover:bg-slate-50/80 transition group ${
                          isSelected ? 'bg-slate-50' : isExpanded ? 'bg-sky-50/30' : ''
                        }`}
                      >
                        {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                          <td className="py-2.5 px-3 text-center">
                            {isActionableForMe ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectItem(appr.id)}
                                className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer w-4 h-4"
                              />
                            ) : (
                              <span className="text-slate-300 font-mono text-[10px]">—</span>
                            )}
                          </td>
                        )}

                        {/* 1. Asset / details */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpandSlip(appr.id)}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `Hide details for ${appr.itemCode || appr.itemName}` : `Show details for ${appr.itemCode || appr.itemName}`}
                              className="mt-0.5 -ml-1 text-slate-400 hover:text-slate-800 transition cursor-pointer p-0.5 rounded hover:bg-slate-200/60 shrink-0"
                            >
                              <ChevronRight className={`h-4 w-4 transition-transform duration-150 ${isExpanded ? 'rotate-90 text-slate-700' : ''}`} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <span className="text-slate-900 font-semibold block leading-snug">{appr.itemName}</span>
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600 mt-0.5 [&>*]:whitespace-nowrap">
                                {getTypeBadge(appr.transactionType, appr.requestDetails)}
                                <span className={table.code}>{appr.itemCode}</span>
                                {appr.ifmisItemCode && appr.ifmisItemCode !== appr.itemCode && (
                                  <span className="text-xs text-slate-500 font-mono">· IFMIS {appr.ifmisItemCode}</span>
                                )}
                                {appr.ifmisTagNumber && (
                                  <span className="text-xs text-slate-500 font-mono">· Tag {appr.ifmisTagNumber}</span>
                                )}
                                {appr.poNumber && <span className="text-xs text-slate-500">PO {appr.poNumber}</span>}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {lines ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandSlip(appr.id)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 transition cursor-pointer"
                                      title="Expand/collapse line items"
                                    >
                                      <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                      <span>Batch · {lines.length} lines</span>
                                    </button>
                                    {linesUnits(lines) && <span className="text-xs text-sky-800 font-medium">· Qty {linesUnits(lines)}</span>}
                                  </>
                                ) : approvalUnits(appr) ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium bg-sky-50 text-sky-800 border border-sky-100">
                                    · {approvalUnits(appr)}
                                  </span>
                                ) : null}
                                {appr.ifmisSlipAttachmentUrl && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingSlipUrl(appr.ifmisSlipAttachmentUrl ?? null);
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
                                    title="View attached scanned slip"
                                    aria-label={`View attached slip for ${appr.ifmisSlipNumber || appr.itemCode}`}
                                  >
                                    <Paperclip className="w-3 h-3 text-slate-500" />
                                    <span>Slip</span>
                                  </button>
                                )}
                              </div>
                              {/* Reason subline when expanded */}
                              {isExpanded && appr.purposeOrRemarks && (
                                <div className="mt-2 text-xs text-slate-600 flex items-start gap-1 font-normal italic">
                                  <span className="text-slate-400 select-none not-italic font-mono">└</span>
                                  <span>Reason: {appr.purposeOrRemarks}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Initiator */}
                        <td className="hidden md:table-cell py-2.5 px-2.5 w-36 max-w-[140px] whitespace-nowrap">
                          <div className="flex flex-col text-slate-600 max-w-[140px] overflow-hidden">
                            <span className="text-slate-800 font-medium truncate" title={appr.requestedBy?.fullNameEn}>
                              {appr.requestedBy?.fullNameEn || '—'}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              {appr.requestedBy?.role ? deciderRole(appr.requestedBy.role, 1) : 'Store Encoder'}
                            </span>
                            {appr.purposeOrRemarks && (
                              <span className="text-[10px] text-slate-400 truncate mt-0.5" title={appr.purposeOrRemarks}>
                                {appr.purposeOrRemarks}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Date Raised */}
                        <td className="hidden lg:table-cell py-2.5 px-2 w-24 whitespace-nowrap text-slate-600 text-xs">
                          {formatDateRaised(appr.createdAtGc)}
                        </td>

                        {/* 5. Workflow Stage */}
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {getStageIndicator(appr)}
                        </td>

                        {/* 6. Total Amount / Value */}
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-900">{formatETB(appr.totalAmount || 0)}</span>
                          {isHighValue && (
                            <span className="block text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.2 mt-0.5 w-fit ml-auto">
                              &gt; 10M ETB
                            </span>
                          )}
                        </td>

                        {/* 7. Approval Actions (Inline Decision Buttons) */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {isActionableForMe ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedApproval(appr);
                                  setReviewRemarks('');
                                }}
                                className="px-3 py-1 rounded-[4px] bg-moa-green hover:bg-moa-green-hover text-white font-semibold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{stage === 1 ? 'Endorse' : isHighValue ? 'Authorize (> 10M)' : 'Authorize'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejecting(appr);
                                  setReviewRemarks('');
                                  setActionError(null);
                                }}
                                title="Reject"
                                aria-label="Reject"
                                className="px-2.5 py-1 rounded-[4px] border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingApproval(slipLines.get(appr.id)?.[0] ?? appr)}
                                className={btn.row}
                                title="View the voucher"
                                aria-label="View"
                              >
                                <FileSearch className={btn.rowIcon} />
                                <span>View</span>
                              </button>
                              {canVoid && appr.status === ApprovalStatus.APPROVED && !appr.voidDetails?.voided && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidingApproval(appr);
                                    setVoidReason('');
                                    setVoidError(null);
                                  }}
                                  className="px-2 py-1 rounded-[4px] border border-rose-300 bg-white font-bold text-xs text-rose-700 transition cursor-pointer flex items-center gap-1 shadow-2xs hover:bg-rose-50"
                                  title="Void this approved voucher and reverse inventory movements"
                                >
                                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Void</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 8. Kebab Actions Menu */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <RowActionsMenu
                            label={`Actions for ${appr.itemCode || appr.itemName}`}
                            actions={[
                              {
                                label: 'View Full Voucher',
                                icon: FileText,
                                onClick: () => setViewingApproval(slipLines.get(appr.id)?.[0] ?? appr),
                              },
                              ...(appr.ifmisSlipAttachmentUrl
                                ? [
                                    {
                                      label: 'View Attached Slip',
                                      icon: Eye,
                                      onClick: () => setViewingSlipUrl(appr.ifmisSlipAttachmentUrl ?? null),
                                    },
                                  ]
                                : []),
                              {
                                label: 'Send Back',
                                icon: MessageSquare,
                                disabled: !isActionableForMe,
                                reason: !isActionableForMe ? 'Not actionable in your current queue' : undefined,
                                onClick: () => {
                                  setRejecting(appr);
                                  setReviewRemarks('');
                                  setActionError(null);
                                },
                              },
                              {
                                label: 'Void / Cancel Request',
                                icon: Ban,
                                disabled: !canVoid,
                                reason: !canVoid ? 'Only administrators and authorized executives can void' : undefined,
                                onClick: () => {
                                  setVoidingApproval(appr);
                                  setVoidReason('');
                                  setVoidError(null);
                                },
                              },
                            ]}
                          />
                        </td>
                      </tr>

                      {/* Expandable nested sub-rows for batch voucher lines */}
                      {isExpanded &&
                        lines?.map((sub, idx) => (
                          <tr
                            key={sub.id}
                            className="bg-sky-50/20 hover:bg-sky-50/40 text-xs transition border-t border-slate-100"
                          >
                            {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                              <td className="py-2 px-3 text-center text-slate-300">
                                <span className="font-mono text-[10px]">↳</span>
                              </td>
                            )}
                            <td className="py-2 px-3.5">
                              <div className="flex flex-col pl-4 border-l-2 border-sky-300">
                                <span className="text-[11px] font-semibold text-slate-500 mb-0.5">Line {idx + 1}</span>
                                <span className="font-medium text-slate-800">{sub.itemName}</span>
                                <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 font-mono">
                                  <span>{sub.itemCode}</span>
                                  {sub.ifmisItemCode && <span>· IFMIS {sub.ifmisItemCode}</span>}
                                  {approvalUnits(sub) && <span className="text-sky-800 font-sans font-semibold">· {approvalUnits(sub)}</span>}
                                </span>
                              </div>
                            </td>
                            <td className="hidden md:table-cell py-2 px-3.5 text-slate-400 text-[11px]">
                              {/* Inherited */}
                            </td>
                            <td className="hidden lg:table-cell py-2 px-3.5 text-slate-400 text-[11px]">
                              {/* Inherited */}
                            </td>
                            <td className="py-2 px-3.5 text-slate-400 text-[11px]">
                              {/* Inherited */}
                            </td>
                            <td className="py-2 px-3.5 text-right tabular-nums text-slate-700 whitespace-nowrap font-medium">
                              {formatETB(sub.totalAmount || 0)}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-400 text-xs" colSpan={2}>
                              (Action taken on parent voucher)
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/90 border-t border-slate-200 text-xs text-slate-600 font-medium">
          <div className="flex flex-wrap items-center gap-2.5">
            <span>Showing <strong>{filteredApprovals.length}</strong> {filteredApprovals.length === 1 ? 'request' : 'requests'}</span>
            {queueStats.s1 > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span><strong>{queueStats.s1}</strong> Stage 1 (Endorsement)</span>
              </span>
            )}
            {queueStats.s2 > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200/90 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span><strong>{queueStats.s2}</strong> Stage 2 (Authorization)</span>
              </span>
            )}
          </div>
          <div className="text-right tabular-nums flex items-center gap-1.5 ml-auto">
            <span className="text-slate-500">Cumulative Value Pending:</span>
            <strong className="text-slate-900 font-bold text-xs">{formatETB(cumulativePendingValue)}</strong>
            <span className="sr-only">Queue Valuation: {formatETB(queueStats.totalVal)}</span>
          </div>
        </div>
      </div>

      {/* ── 5. Sticky Floating Batch Action Bar ── */}
      {selectedIds.length > 0 && canReview && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md text-slate-800 px-4 py-2.5 rounded-lg shadow-xl border border-slate-300 ring-1 ring-slate-900/5 flex items-center gap-4 animate-slideUp">
          <div className="flex items-center gap-2">
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center tabular-nums">
              {selectedIds.length}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-700">
                Selected Requests
              </span>
              {selectedTotalValue > 0 && (
                <span className="text-[11px] font-bold text-emerald-800 tabular-nums">
                  Total: {formatETB(selectedTotalValue)}
                </span>
              )}
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            {canEndorse && canApprove ? (
              <>
                <button
                  onClick={() => handleOpenBatchModal('ENDORSE')}
                  className="px-3.5 py-1.5 bg-moa-green hover:bg-moa-green-hover text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Batch Endorse ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => handleOpenBatchModal('APPROVE')}
                  className="px-3.5 py-1.5 bg-moa-green hover:bg-moa-green-hover text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Batch Authorize ({selectedIds.length})</span>
                </button>
              </>
            ) : canEndorse ? (
              <button
                onClick={() => handleOpenBatchModal('ENDORSE')}
                className="px-3.5 py-1.5 bg-moa-green hover:bg-moa-green-hover text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Batch Endorse ({selectedIds.length})</span>
              </button>
            ) : canApprove ? (
              <button
                onClick={() => handleOpenBatchModal('APPROVE')}
                className="px-3.5 py-1.5 bg-moa-green hover:bg-moa-green-hover text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Batch Authorize ({selectedIds.length})</span>
              </button>
            ) : null}

            <button
              onClick={() => handleOpenBatchModal('REJECT')}
              className="px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-slate-300 hover:border-rose-300 rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Batch Reject</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-[4px] text-xs font-medium transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <Pagination pager={pager} label="requests" className="rounded-2xl border border-slate-200" />

      {/* ── 6. Single Item Review & Inspection Modal ── */}
      {viewingApproval && (
        <ApprovalVoucherModal
          key={viewingApproval.id}
          approval={viewingApproval}
          onClose={() => setViewingApproval(null)}
        />
      )}

      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn">
          {/* Fits the screen at either stage: the header and the buttons stay, the middle scrolls */}
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col rounded-md border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-3 gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <BackButton
                  onBack={() => setSelectedApproval(null)}
                  label="Back to approvals"
                  title="Back to approvals (Esc)"
                />
                <div className="min-w-0">
                  <nav aria-label="Breadcrumb navigation" className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => setSelectedApproval(null)}
                      className="font-medium text-slate-500 hover:text-emerald-700 hover:underline transition cursor-pointer"
                    >
                      Approvals
                    </button>
                    <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
                    <span className="font-bold text-slate-900 truncate">
                      {selectedApproval.currentStage === 1 ? 'Stage 1 Endorsement' : 'Stage 2 Authorization'}
                    </span>
                  </nav>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 truncate">
                    <FileCheck2 className="w-4 h-4 text-emerald-800 shrink-0" />
                    {selectedApproval.currentStage === 1
                      ? 'Stage 1: Team Leader Endorsement'
                      : isHigh(selectedApproval)
                        ? 'Stage 2: Chief Director Final Authorization (> 10M ETB)'
                        : 'Stage 2: Department Head Final Authorization'}
                  </h3>
                </div>
              </div>
              <CloseButton
                onClose={() => setSelectedApproval(null)}
                label="Close review"
                title="Close (Esc)"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs">
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{selectedApproval.itemName}</span>
                  {getTypeBadge(selectedApproval.transactionType, selectedApproval.requestDetails)}
                </div>
                <p className="font-mono text-slate-800 font-bold">{selectedApproval.itemCode}</p>
                {slipLines.has(selectedApproval.id) ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Batch Voucher:</span>
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                      {slipLines.get(selectedApproval.id)!.length} lines decided together
                      {linesUnits(slipLines.get(selectedApproval.id)!) ? ` · ${linesUnits(slipLines.get(selectedApproval.id)!)}` : ''}
                    </span>
                  </div>
                ) : approvalUnits(selectedApproval) ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Quantity:</span>
                    <span className="font-mono font-semibold text-sky-800">{approvalUnits(selectedApproval)!.replace(/^Qty /, '')}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">IFMIS Slip:</span>
                  <span className="font-mono text-slate-800 font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    {selectedApproval.ifmisSlipNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Slip Date:</span>
                  <span className="text-slate-800">
                    {selectedApproval.ifmisSlipDateEc} E.C. ({selectedApproval.ifmisSlipDateGc})
                  </span>
                </div>
                {selectedApproval.poNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">PO number:</span>
                    <span className="font-mono text-slate-800">{selectedApproval.poNumber}</span>
                  </div>
                )}
                {/* Specific operational parameters */}
                {selectedApproval.transactionType === 'STOCK_OUT' && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Recipient:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedApproval.recipientEmployee?.fullNameEn || selectedApproval.requestDetails?.organizationName || '—'}
                      {selectedApproval.recipientEmployee?.departmentId && (() => {
                        const dep = departments.find((d) => d.id === selectedApproval.recipientEmployee?.departmentId);
                        return dep ? ` (${dep.nameEn})` : '';
                      })()}
                    </span>
                  </div>
                )}
                {selectedApproval.transactionType === 'TRANSFER' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">New Recipient:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedApproval.recipientEmployee?.fullNameEn || selectedApproval.requestDetails?.organizationName || '—'}
                      </span>
                    </div>
                    {selectedApproval.targetDepartmentId && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Target Directorate:</span>
                        <span className="text-slate-800">{departments.find((d) => d.id === selectedApproval.targetDepartmentId)?.nameEn || '—'}</span>
                      </div>
                    )}
                    {selectedApproval.targetLocationId && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Target Location:</span>
                        <span className="text-slate-800">{locations.find((l) => l.id === selectedApproval.targetLocationId)?.siteName || '—'}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedApproval.transactionType === 'RETURN' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Target Store:</span>
                      <span className="font-semibold text-slate-800">
                        {locations.find((l) => l.id === selectedApproval.targetLocationId)?.siteName || 'Store'}
                      </span>
                    </div>
                    {selectedApproval.recipientEmployee && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Store Receiver:</span>
                        <span className="text-slate-800">{selectedApproval.recipientEmployee.fullNameEn}</span>
                      </div>
                    )}
                    {selectedApproval.requestDetails?.condition && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Return Condition:</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          selectedApproval.requestDetails.condition === 'GOOD' ? 'bg-emerald-100 text-emerald-800' :
                          selectedApproval.requestDetails.condition === 'NEEDS_REPAIR' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {selectedApproval.requestDetails.condition.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    {selectedApproval.requestDetails?.remark && (
                      <div className="flex items-center justify-between text-amber-800">
                        <span className="text-slate-500">Defect Notes:</span>
                        <span className="font-medium">{selectedApproval.requestDetails.remark}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedApproval.transactionType === 'DISPOSAL' && (
                  <>
                    {selectedApproval.requestDetails?.recipientName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Disposed To:</span>
                        <span className="font-semibold text-slate-800">{selectedApproval.requestDetails.recipientName}</span>
                      </div>
                    )}
                    {selectedApproval.requestDetails?.reason && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Disposal Method:</span>
                        <span className="text-slate-800">{selectedApproval.requestDetails.reason}</span>
                      </div>
                    )}
                    {selectedApproval.requestDetails?.bookValue !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Book Value:</span>
                        <span className="font-mono text-slate-800">{formatETB(selectedApproval.requestDetails.bookValue)}</span>
                      </div>
                    )}
                    {selectedApproval.requestDetails?.proceedsETB !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Proceeds:</span>
                        <span className="font-mono text-slate-800">{formatETB(selectedApproval.requestDetails.proceedsETB)}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedApproval.purposeOrRemarks && (
                  <div className="pt-1 border-t border-slate-200 text-slate-700">
                    <strong>Official Purpose / Note:</strong> {selectedApproval.purposeOrRemarks}
                  </div>
                )}
              </div>

              {/* A voucher of several lines is decided as a whole: every line on it is listed */}
              {slipLines.has(selectedApproval.id) && (
                <div className="rounded-md border border-slate-200">
                  <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
                    Items on this {voucherName(selectedApproval.transactionType)} ({slipLines.get(selectedApproval.id)!.length}) · all are decided together
                  </p>
                  <table className="w-full" aria-label={`Items on this ${voucherName(selectedApproval.transactionType)}`}>
                    <tbody className="divide-y divide-slate-100">
                      {slipLines.get(selectedApproval.id)!.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-1.5">
                            <span className="block text-slate-900">{l.itemName}</span>
                            <span className="font-mono text-[10px] text-slate-500">{l.itemCode}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600 whitespace-nowrap">{approvalUnits(l)?.replace(/^Qty /, '')}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-800 whitespace-nowrap">{formatETB(l.totalAmount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200">
                        <td className="px-3 py-1.5 font-semibold text-slate-700" colSpan={2}>Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">{formatETB(selectedApproval.totalAmount || 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Endorsement Audit Trail Banner if Stage 2 */}
              {selectedApproval.currentStage === 2 && selectedApproval.endorsedBy && (
                <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <p>
                    Endorsed by <strong className="text-slate-900">{selectedApproval.endorsedBy.fullNameEn}</strong> · {selectedApproval.endorsedAtGc}
                    {selectedApproval.endorsementRemarks && <span className="italic text-slate-600"> · “{selectedApproval.endorsementRemarks}”</span>}
                  </p>
                </div>
              )}

              {/* Scanned IFMIS Slip Attachment */}
              {selectedApproval.ifmisSlipAttachmentUrl ? (
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {getSlipDisplayName(selectedApproval.ifmisSlipAttachmentUrl)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Scanned IFMIS slip attached by the requester
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingSlipUrl(selectedApproval.ifmisSlipAttachmentUrl ?? null)}
                    className="px-3 py-1.5 rounded-[4px] bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Slip
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-slate-50 border border-dashed border-slate-300 flex items-center gap-2 text-xs">
                  <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-700">No scanned slip attached</p>
                    <p className="text-[10px] text-slate-500">
                      This request was submitted without an IFMIS slip attachment.
                    </p>
                  </div>
                </div>
              )}

              {actionError && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  {selectedApproval.currentStage === 1
                    ? 'Team Leader Endorsement Remarks:'
                    : isHigh(selectedApproval)
                      ? 'Chief Director Authorization Comments:'
                      : 'Department Head Authorization Comments:'}
                </label>
                <input
                  type="text"
                  placeholder={
                    selectedApproval.currentStage === 1
                      ? 'e.g. Verified asset specifications against the attached Model 19 / 21 / 22 voucher.'
                      : 'e.g. Authorized for release under official store custody directive.'
                  }
                  value={reviewRemarks}
                  maxLength={500}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-[4px] text-slate-900 focus:outline-none focus:border-emerald-700 text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Needed to reject. A rejected request goes back to its requester, who corrects and resubmits it, or cancels it.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[3px] text-xs font-semibold transition"
              >
                Cancel
              </button>

              {selectedApproval.status === ApprovalStatus.PENDING && selectedApproval.currentStage === 1 && canEndorse && (
                <>
                  {correctButton(selectedApproval)}
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction(selectedApproval.id, 'REJECT')}
                    className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction(selectedApproval.id, 'ENDORSE')}
                    className="px-5 py-2 bg-moa-green hover:bg-moa-green-hover text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Endorse (Stage 1)
                  </button>
                </>
              )}

              {selectedApproval.status === ApprovalStatus.PENDING && selectedApproval.currentStage === 2 && canApprove && (
                (() => {
                  const isHighVal = isHigh(selectedApproval);
                  const canAuthorize = (isChiefDirector && isHighVal) || (isDeptHead && !isHighVal) || (!isChiefDirector && !isDeptHead);
                  if (!canAuthorize) {
                    return (
                      <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-[4px]">
                        {isHighVal
                          ? 'High-Value (> 10M ETB): Reserved for Chief Director'
                          : 'Standard (≤ 10M ETB): Handled by the Department Head'}
                      </span>
                    );
                  }
                  return (
                    <>
                      {correctButton(selectedApproval)}
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedApproval.id, 'REJECT')}
                        className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedApproval.id, 'APPROVE')}
                        className="px-5 py-2 bg-moa-green hover:bg-moa-green-hover text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Authorize & Sign-Off
                      </button>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <Modal
          isOpen
          onClose={() => !actionLoading && setRejecting(null)}
          title={`Reject ${voucherName(rejecting.transactionType)} ${rejecting.ifmisSlipNumber}${slipLines.get(rejecting.id) ? ` (${slipLines.get(rejecting.id)!.length} items)` : ''}?`}
          subtitle="It goes back to its requester with your reason, to correct and resubmit, or cancel."
          size="sm"
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-700">
              <span className="font-semibold text-slate-900">{rejecting.itemName}</span> · <span className="font-mono">{rejecting.itemCode}</span>
            </p>
            {actionError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{actionError}</p>
            )}
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">Reason for rejecting</span>
              <textarea
                autoFocus
                rows={3}
                value={reviewRemarks}
                maxLength={500}
                onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder="e.g. The quantity does not match the signed Model 19."
                className="w-full resize-y rounded-[4px] border border-slate-300 px-3 py-2 text-xs focus:border-rose-600 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setRejecting(null)} disabled={actionLoading} className={btn.secondary}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAction(rejecting.id, 'REJECT')}
                disabled={actionLoading || !reviewRemarks.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                <XCircle className="h-3.5 w-3.5" />
                {actionLoading ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {voidingApproval && (
        <Modal
          isOpen
          onClose={() => !voidLoading && setVoidingApproval(null)}
          title={`Void Approved ${voucherName(voidingApproval.transactionType)} ${voidingApproval.ifmisSlipNumber ? `#${voidingApproval.ifmisSlipNumber}` : ''}?`}
          subtitle="Administrative reversal: voids the approved voucher, records an immutable audit log, and restores inventory to its prior state."
          size="md"
        >
          <div className="space-y-3.5 text-xs">
            {/* Warning alert */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-amber-950 block">Audited Statutory Reversal</span>
                <p className="text-[11px] leading-relaxed">
                  {getVoidReversalDescription(voidingApproval)}
                </p>
                {slipLines.get(voidingApproval.id) && (
                  <p className="text-[11px] font-semibold text-amber-900 mt-1">
                    Affects {slipLines.get(voidingApproval.id)!.length} line items grouped on this voucher.
                  </p>
                )}
              </div>
            </div>

            {/* Voucher and item summary */}
            <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 space-y-1.5 text-slate-700">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-900">{voidingApproval.itemName}</span>
                <span className="font-mono text-slate-600">{voidingApproval.itemCode}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {voidingApproval.ifmisSlipNumber && <span>Slip: <strong className="text-slate-700">{voidingApproval.ifmisSlipNumber}</strong></span>}
                {voidingApproval.poNumber && <span>PO: <strong className="text-slate-700">{voidingApproval.poNumber}</strong></span>}
                {voidingApproval.totalAmount ? <span>Amount: <strong className="text-slate-700">{formatETB(voidingApproval.totalAmount)}</strong></span> : null}
                {voidingApproval.recipientEmployee && (
                  <span>Recipient: <strong className="text-slate-700">{voidingApproval.recipientEmployee.fullNameEn}</strong></span>
                )}
              </div>
            </div>

            {voidError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-xs">
                {voidError}
              </p>
            )}

            {/* Mandatory audit reason input */}
            <label className="block space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">
                  Mandatory Audit Reason <span className="text-red-600">*</span>
                </span>
                <span className={`text-[10px] ${voidReason.trim().length >= 10 ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>
                  {voidReason.trim().length}/10 chars min
                </span>
              </div>
              <textarea
                autoFocus
                rows={3}
                value={voidReason}
                maxLength={500}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Explain why this approved voucher is being voided (e.g. Issued to incorrect department; physical item returned unissued)..."
                className="w-full resize-y rounded-[4px] border border-slate-300 px-3 py-2 text-xs focus:border-red-600 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500">
                This explanation is permanently logged in the item audit trail and stamped on all printed voucher records.
              </p>
            </label>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setVoidingApproval(null)}
                disabled={voidLoading}
                className={btn.secondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoidApproved}
                disabled={voidLoading || voidReason.trim().length < 10}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-2xs transition"
              >
                <Ban className="h-3.5 w-3.5" />
                {voidLoading ? 'Voiding & Reversing…' : 'Confirm Void & Reversal'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewingSlipUrl && (
        <SlipViewerModal url={viewingSlipUrl} onClose={() => setViewingSlipUrl(null)} />
      )}

      {/* ── 7. Multi-Item Batch Confirmation Modal ── */}
      {isBatchModalOpen && batchActionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-md w-full max-w-md p-5 space-y-4 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {batchActionType === 'REJECT' ? (
                <XCircle className="w-4 h-4 text-rose-600" />
              ) : (
                <Layers className="w-4 h-4 text-emerald-700" />
              )}
                Batch {batchActionType === 'ENDORSE' ? 'Endorsement' : batchActionType === 'APPROVE' ? 'Authorization' : 'Rejection'}
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                You are about to batch {batchActionType.toLowerCase()}{' '}
                <strong className="font-extrabold text-slate-900">{selectedIds.length}</strong> selected transaction requests in a single action.
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Batch Remarks / Audit Note:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Batch verified under procurement directive."
                  value={batchRemarks}
                  maxLength={500}
                  onChange={(e) => setBatchRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-[4px] text-slate-900 focus:outline-none focus:border-emerald-700 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[3px] text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={batchProcessing}
                onClick={handleExecuteBatch}
                className={`px-5 py-2 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                  batchActionType === 'REJECT'
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-moa-green hover:bg-moa-green-hover'
                }`}
              >
                {batchProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Batch {batchActionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
