import React, { useState, useEffect, useMemo } from 'react';
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
  Undo2,
} from 'lucide-react';
import { api } from '../api/client';
import { ApprovalsSkeleton } from '../components/ui/Skeleton';
import { table, btn } from '../components/ui/theme';
import { FilterPopover, FilterSection, FilterSelect, FilterPill } from '../components/ui/FilterPopover';
import { ApprovalVoucherModal } from '../components/ui/ApprovalVoucherModal';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { SortableHeader, SortDirection } from '../components/ui/SortableHeader';
import {
  ApprovalStatus,
  TransactionApproval,
  TransactionType,
  UserRole,
  Employee,
} from '../types/asset-management';
import { getTodayGcAndEc } from '../utils/eth-date';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SlipViewerModal } from '../components/ui/SlipViewerModal';
import { getSlipDisplayName } from '../utils/slip-upload';
import { RefreshButton } from '../components/ui/RefreshButton';
import { approvalPolicy, approvalRowKey, groupBySlip, isSlipGroup, needsChiefDirector, slipNames, voucherName } from '../components/assets/slip-groups';
import { formatETB } from '../utils/eth-date';
import { shortDate } from '../components/assets/asset-state';

interface ApprovalsPageProps {
  currentRole?: UserRole;
  onNavigate: (tab: string) => void;
  onRefreshPendingCount?: () => void;
}

type TabFilter = 'MY_QUEUE' | 'STAGE_1' | 'STAGE_2' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'ALL';

/**
 * Queue tabs shown to a role. Stage approvers only get their own queue
 * ("Pending my action"); the other stage's queue is one they cannot act on.
 */
export { HIGH_VALUE_THRESHOLD } from '../components/assets/slip-groups';

export function getVisibleQueueTabs(role: UserRole, permissions?: string[]): TabFilter[] {
  if (role === UserRole.SUPER_ADMIN) {
    return ['MY_QUEUE', 'STAGE_1', 'STAGE_2', 'APPROVED', 'RETURNED', 'REJECTED', 'ALL'];
  }
  const canEndorse = permissions ? permissions.includes('approvals.endorse') : (role === UserRole.TEAM_LEADER);
  const canAuthorize = permissions ? permissions.includes('approvals.authorize') : (role === UserRole.DEPARTMENT_HEAD || role === UserRole.CHIEF_DIRECTOR);
  const isSingleStageApprover = (canEndorse && !canAuthorize) || (!canEndorse && canAuthorize);
  return isSingleStageApprover
    ? ['MY_QUEUE', 'APPROVED', 'RETURNED', 'REJECTED', 'ALL']
    : ['MY_QUEUE', 'STAGE_1', 'STAGE_2', 'APPROVED', 'RETURNED', 'REJECTED', 'ALL'];
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
  RETURN: { label: 'Model 21 Return', approved: 'Asset is now RETURNED to store inventory.' },
  DISPOSAL: { label: 'Disposal request', approved: 'The asset is now recorded as DISPOSED.' },
};
// A Model 22 can be a disposal (write-off) instead of an issue
const typeText = (type?: string, details?: { disposal?: boolean } | null) =>
  type === 'STOCK_OUT' && details?.disposal
    ? { label: 'Model 22 disposal', approved: 'The units are now recorded as DISPOSED.' }
    : TYPE_TEXT[type ?? ''] ?? { label: 'Request', approved: 'The request is approved.' };

const approvalUnits = (a: TransactionApproval): string | null => {
  const uom = a.requestDetails?.uom || a.itemUom || 'EA';
  if ((a.transactionType === 'STOCK_OUT' || a.transactionType === 'DISPOSAL') && a.requestDetails?.quantity) {
    const partOf =
      a.status === 'PENDING' && a.itemUnits && a.requestDetails.quantity < a.itemUnits ? ` of ${a.itemUnits} in store` : '';
    return `Qty ${a.requestDetails.quantity} ${uom}${partOf}`;
  }
  return a.status === 'PENDING' && a.itemUnits ? `Qty ${a.itemUnits} ${uom}` : null;
};

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

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onNavigate, onRefreshPendingCount }) => {
  const { user, role } = useAuth();
  const toast = useToast();
  const isChiefDirector = role === UserRole.CHIEF_DIRECTOR;
  const isDeptHead = role === UserRole.DEPARTMENT_HEAD;
  const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
  const canApprove = user?.permissions?.includes('approvals.authorize') ?? (isDeptHead || isChiefDirector);
  const canReview = canEndorse || canApprove;

  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Navigation Controls
  const [activeTab, setActiveTab] = useState<TabFilter>('MY_QUEUE');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [valueFilter, setValueFilter] = useState<'ALL' | 'HIGH_VALUE' | 'STANDARD'>('ALL');

  // Multi-Selection State for Batch Processing
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchActionType, setBatchActionType] = useState<'ENDORSE' | 'APPROVE' | 'REJECT' | null>(null);
  const [batchRemarks, setBatchRemarks] = useState('');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Single Item Review Modal State
  const [selectedApproval, setSelectedApproval] = useState<TransactionApproval | null>(null);
  // Read-only view of a request and its item
  const [viewingApproval, setViewingApproval] = useState<TransactionApproval | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Scanned IFMIS slip preview (opens above the review modal)
  const [viewingSlipUrl, setViewingSlipUrl] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const [apprs, emps] = await Promise.all([
        api.getApprovals(),
        api.getEmployees(),
      ]);
      setApprovals(apprs);
      setEmployees(emps);
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
        itemCode: `${g.members.length} items`,
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

  // Compute live counter metrics
  const metrics = useMemo(() => {
    const pending = rows.filter((a) => a.status === ApprovalStatus.PENDING);
    const stage1 = pending.filter((a) => (a.currentStage ?? 1) === 1);
    const stage2 = pending.filter((a) => a.currentStage === 2);
    const approved = rows.filter((a) => a.status === ApprovalStatus.APPROVED);
    const rejected = rows.filter((a) => a.status === ApprovalStatus.REJECTED);
    const returned = rows.filter((a) => a.status === ApprovalStatus.RETURNED);

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
      returnedCount: returned.length,
      totalCount: rows.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, slipLines, canEndorse, canApprove]);

  // Filtered approvals list
  const filteredApprovals = useMemo(() => {
    return rows.filter((item) => {
      // 1. Tab Status Filter
      if (activeTab === 'MY_QUEUE') {
        if (item.status !== ApprovalStatus.PENDING) return false;
        if (canEndorse && canApprove) {
          if ((item.currentStage ?? 1) !== 1 && item.currentStage !== 2) return false;
        } else if (canEndorse && (item.currentStage ?? 1) !== 1) {
          return false;
        }
        if (canApprove) {
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
        if (item.status !== ApprovalStatus.APPROVED) return false;
      } else if (activeTab === 'RETURNED') {
        if (item.status !== ApprovalStatus.RETURNED) return false;
      } else if (activeTab === 'REJECTED') {
        if (item.status !== ApprovalStatus.REJECTED) return false;
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
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          item.ifmisSlipNumber.toLowerCase().includes(q) ||
          (item.purposeOrRemarks && item.purposeOrRemarks.toLowerCase().includes(q)) ||
          (item.requestedBy?.fullNameEn && item.requestedBy.fullNameEn.toLowerCase().includes(q)) ||
          (item.endorsedBy?.fullNameEn && item.endorsedBy.fullNameEn.toLowerCase().includes(q)) ||
          (item.poNumber && item.poNumber.toLowerCase().includes(q)) ||
          // A receipt is found by any of its items
          (slipLines.get(item.id) ?? []).some((l) => l.itemName.toLowerCase().includes(q) || l.itemCode.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, slipLines, activeTab, typeFilter, valueFilter, searchTerm, canEndorse, canApprove]);

  type ApprovalSortColumn = 'type' | 'item' | 'slip' | 'stage' | 'requester';
  const [sortColumn, setSortColumn] = useState<ApprovalSortColumn>('type');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
      } else if (sortColumn === 'slip') {
        const slipA = a.ifmisSlipNumber || '';
        const slipB = b.ifmisSlipNumber || '';
        diff = slipA.localeCompare(slipB);
      } else if (sortColumn === 'stage') {
        diff = (a.currentStage ?? 1) - (b.currentStage ?? 1);
      } else if (sortColumn === 'requester') {
        const reqA = a.requestedBy?.fullNameEn || '';
        const reqB = b.requestedBy?.fullNameEn || '';
        diff = reqA.localeCompare(reqB);
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [filteredApprovals, sortColumn, sortDirection]);

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
  const decide = (id: string, action: 'ENDORSE' | 'APPROVE' | 'REJECT' | 'RETURN', reviewedById?: string, remarks?: string) => {
    const receipt = slipLines.get(id);
    return receipt
      ? api.handleSlipApproval({ approvalIds: receipt.map((l) => l.id), action, reviewedById: reviewedById as string, reviewRemarks: remarks })
      : api.handleApproval({ approvalId: id, action, reviewedById: reviewedById as string, reviewRemarks: remarks });
  };

  // Single Action Handler
  const handleAction = async (approvalId: string, action: 'ENDORSE' | 'APPROVE' | 'REJECT' | 'RETURN') => {
    setActionError(null);
    if (action === 'REJECT' && !reviewRemarks.trim()) {
      setActionError('Please provide a mandatory reason for rejection.');
      toast.warning('Remarks Required', 'A reason or remarks must be provided when rejecting a transaction.');
      return;
    }
    if (action === 'RETURN' && !reviewRemarks.trim()) {
      setActionError('Say what needs correcting: the requester sees it with the returned request.');
      toast.warning('Reason Required', 'Say what needs correcting before returning the request.');
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
      setReviewRemarks('');
      setSelectedIds((prev) => prev.filter((id) => id !== approvalId));
      await fetchApprovals();
      onRefreshPendingCount?.();
      window.dispatchEvent(new CustomEvent('moa_approvals_updated'));

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
      } else if (action === 'RETURN') {
        toast.success(
          'Returned for Correction',
          `${typeLabel} (${itemCode}) went back to ${target?.requestedBy?.fullNameEn || 'its requester'} with your reason. It comes back to the Team Leader once corrected.`
        );
      } else if (action === 'REJECT') {
        toast.warning(
          'Transaction Rejected',
          `${typeLabel} (${itemCode}) has been rejected for good: its number can't be entered again.`
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
    window.dispatchEvent(new CustomEvent('moa_approvals_updated'));

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

  // Light, pastel, subtle badges
  const getTypeBadge = (type: TransactionType, details?: { disposal?: boolean } | null) => {
    if (type === TransactionType.STOCK_OUT && details?.disposal) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <PackageMinus className="w-3 h-3 text-rose-700" />
          Model 22 (DISPOSAL)
        </span>
      );
    }
    switch (type) {
      case TransactionType.STOCK_IN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <PackagePlus className="w-3 h-3 text-emerald-700" />
            Model 19 (IN)
          </span>
        );
      case TransactionType.STOCK_OUT:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            <PackageMinus className="w-3 h-3 text-sky-700" />
            Model 22 (OUT)
          </span>
        );
      case TransactionType.RETURN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-700" />
            Model 21 (RET)
          </span>
        );
      case TransactionType.TRANSFER:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-800 border border-violet-200">
            <ArrowRightLeft className="w-3 h-3 text-violet-700" />
            Model 21 (TRF)
          </span>
        );
      case TransactionType.DISPOSAL:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            <Trash2 className="w-3 h-3 text-slate-600" />
            Disposal (DSP)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  // Clean, understated stage stepper
  const getStageIndicator = (appr: TransactionApproval) => {
    // Decided or returned: the outcome, who by (their role) and when, and the reason on one line; the rest on hover
    if (appr.status !== ApprovalStatus.PENDING) {
      const returned = appr.status === ApprovalStatus.RETURNED;
      const rejected = appr.status === ApprovalStatus.REJECTED;
      const person = returned ? appr.returnedBy : appr.reviewedBy;
      const stage = returned ? appr.returnedFromStage : appr.status === ApprovalStatus.APPROVED ? 2 : appr.currentStage;
      const by = deciderRole(person?.role, stage);
      const date = returned ? appr.returnedAtGc : appr.reviewedAtGc;
      const reason = (returned ? appr.returnRemarks : rejected ? appr.reviewRemarks : undefined)?.trim();
      const tone = returned
        ? { badge: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', icon: <Undo2 className="w-3 h-3 text-amber-700" />, label: 'Returned' }
        : rejected
          ? { badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', icon: <XCircle className="w-3 h-3 text-rose-600" />, label: 'Rejected' }
          : { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: '', icon: <CheckCircle2 className="w-3 h-3 text-emerald-700" />, label: 'Approved' };
      const detail = [person?.fullNameEn, shortDate(date), reason].filter(Boolean).join(' · ');
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
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
            stage === 1
              ? 'bg-slate-50 text-slate-800 border-slate-300 font-bold'
              : 'bg-transparent text-slate-400 border-transparent'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${stage === 1 ? 'bg-amber-500' : 'bg-slate-300'}`} />
          1. Endorse
        </span>
        <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
            stage === 2
              ? 'bg-slate-50 text-slate-800 border-slate-300 font-bold'
              : 'bg-transparent text-slate-400 border-transparent'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${stage === 2 ? (isHighValue ? 'bg-purple-600' : 'bg-emerald-600') : 'bg-slate-300'}`} />
          {isHighValue ? '2. Chief Director (>10M)' : '2. Dept. Head'}
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
      // With their requesters to correct and resubmit
      { id: 'RETURNED' as TabFilter, label: 'Returned', count: metrics.returnedCount },
      { id: 'REJECTED' as TabFilter, label: 'Rejected', count: metrics.rejectedCount },
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
    <div className="space-y-2.5 animate-fadeIn pb-8">

      {/* Role Permission Context Banner (Light & Simple) */}
      <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600 shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            Active Role: <strong className="font-bold text-slate-900">{role.replace(/_/g, ' ')}</strong>.
            {canEndorse && canApprove && (
              <span className="ml-1 text-slate-700 font-medium">
                You are authorized for both <strong>Stage 1 Endorsements</strong> and <strong>Stage 2 Authorizations</strong>.
              </span>
            )}
            {canEndorse && !canApprove && (
              <span className="ml-1 text-slate-700 font-medium">
                You are authorized to review and record <strong>Stage 1 Technical Endorsements</strong>.
              </span>
            )}
            {isChiefDirector && (
              <span className="ml-1 text-slate-700 font-medium">
                {approvalPolicy.chiefDirectorAboveThreshold ? (
                  <>You hold final signing authority as <strong>Chief Director</strong> to authorize high-value transactions exceeding <strong>10,000,000 ETB</strong>.</>
                ) : (
                  <>Requests are authorized by the <strong>Department Head</strong> for now; the Chief Director step is not in use.</>
                )}
              </span>
            )}
            {isDeptHead && (
              <span className="ml-1 text-slate-700 font-medium">
                You hold final signing authority to grant <strong>Stage 2 Store Issue Authorizations</strong>{approvalPolicy.chiefDirectorAboveThreshold ? ' (up to 10,000,000 ETB)' : ''}.
              </span>
            )}
            {canApprove && !isChiefDirector && !isDeptHead && (
              <span className="ml-1 text-slate-700 font-medium">
                You hold final signing authority to grant <strong>Stage 2 Authorizations</strong>.
              </span>
            )}
            {!canReview && (
              <span className="ml-1 text-slate-700 font-medium">
                Oversight & Monitoring: View-only access to transaction requests and statuses.
              </span>
            )}
          </span>
        </div>

      </div>

      {/* ── 2. Filters & Search Control Bar ── */}
      <div className="rounded-md p-3.5 bg-white space-y-3 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        {/* Row 1: Search + Unified FilterPopover matching Assets & System pages */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search requests"
              placeholder="Search by tracking code, item name, slip #, or staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 hover:border-slate-500 rounded-[4px] text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
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

        {/* Row 2: Queue Tabs (Quick Access Segmented Navigation) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 no-scrollbar touch-pan-x -mx-1 px-1">
          {visibleQueueTabsList.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === tab.id
                  ? 'bg-emerald-800 text-white font-bold shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === tab.id
                    ? 'bg-emerald-900/80 text-emerald-100'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Active Filter Chips */}
        {(typeFilter !== 'ALL' || valueFilter !== 'ALL') && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-xs">
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
      </div>

      {/* ── 4. Main Approvals Display Area ── */}
      {loading && approvals.length === 0 ? (
        <ApprovalsSkeleton />
      ) : filteredApprovals.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-white border border-dashed border-slate-300 space-y-2 shadow-xs">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No Approvals Matching Criteria</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All registered stock transactions are fully cleared for the selected filters.
          </p>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           HIGH-DENSITY DATA TABLE (Enterprise Standard)
           ══════════════════════════════════════════════════════════════════════ */
        <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] min-w-[940px]">
              <thead>
                <tr className={table.headRow}>
                  {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                    <th className="py-1.5 px-3 w-10 text-center shrink-0">
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
                    label="Form"
                    columnKey="type"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-1.5 px-3 w-32 whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Asset"
                    columnKey="item"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-1.5 px-3 min-w-[190px]"
                  />
                  <SortableHeader
                    label="IFMIS slip"
                    columnKey="slip"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-1.5 px-3 w-36 whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Stage"
                    columnKey="stage"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-1.5 px-3 w-36 whitespace-nowrap shrink-0"
                  />
                  <SortableHeader
                    label="Requested by"
                    columnKey="requester"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-1.5 px-3 min-w-[170px]"
                  />
                  <th className="sticky right-0 z-[1] bg-slate-100 py-1.5 px-3 text-right w-36 whitespace-nowrap shrink-0 font-normal">Review</th>
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

                  return (
                    <tr
                      key={appr.id}
                      className={`hover:bg-slate-50/80 transition group ${
                        isSelected ? 'bg-slate-50' : ''
                      }`}
                    >
                      {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                        <td className="py-2 px-3 text-center">
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

                      {/* Statutory Type Badge */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {getTypeBadge(appr.transactionType, appr.requestDetails)}
                      </td>

                      {/* Tracking Code & Item Name */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span className="text-slate-900 line-clamp-1">{appr.itemName}</span>
                          <span className="flex items-center gap-x-1.5 whitespace-nowrap">
                            <span className={table.code}>{appr.itemCode}</span>
                            {/* A voucher of several lines lists each quantity when reviewed; its row would show only the first */}
                            {!slipLines.has(appr.id) && approvalUnits(appr) && <span className="text-xs text-sky-800">· {approvalUnits(appr)}</span>}
                          </span>
                        </div>
                      </td>

                      {/* IFMIS Slip Number & Slip Date */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="tabular-nums text-slate-700">{appr.ifmisSlipNumber}</span>
                            {appr.ifmisSlipAttachmentUrl && (
                              <button
                                type="button"
                                onClick={() => setViewingSlipUrl(appr.ifmisSlipAttachmentUrl ?? null)}
                                className="p-1 rounded text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                                title="View attached slip"
                                aria-label={`View attached slip for ${appr.ifmisSlipNumber}`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">{appr.ifmisSlipDateEc} E.C.</span>
                          {appr.poNumber && <span className="text-xs text-slate-500">PO {appr.poNumber}</span>}
                        </div>
                      </td>

                      {/* 2-Stage Progress Indicator */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {getStageIndicator(appr)}
                      </td>

                      {/* Requester & Justification */}
                      <td className="py-2 px-3 max-w-xs">
                        <div className="flex flex-col text-slate-600">
                          <span className="text-slate-800 truncate">
                            {appr.requestedBy?.fullNameEn || '—'}
                          </span>
                          <span className="text-xs text-slate-500 truncate" title={appr.purposeOrRemarks}>
                            {appr.purposeOrRemarks || 'No remarks provided'}
                          </span>
                        </div>
                      </td>

                      {/* Review & Signing Button: pinned to the right edge so it never needs sideways scrolling */}
                      <td className="sticky right-0 z-[1] bg-white py-2 px-3 text-right whitespace-nowrap shadow-[-10px_0_10px_-10px_rgba(15,23,42,0.18)]">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingApproval(slipLines.get(appr.id)?.[0] ?? appr)}
                            className={btn.row}
                            title="View the voucher"
                          >
                            <FileSearch className={btn.rowIcon} />
                            View
                          </button>
                          {appr.status === ApprovalStatus.RETURNED && canReview && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedApproval(appr);
                                setReviewRemarks('');
                              }}
                              className={btn.row}
                              title="A returned request waits for its requester; it can still be rejected for good"
                            >
                              <XCircle className={btn.rowIcon} />
                              Reject
                            </button>
                          )}
                          {isActionableForMe && (
                          <button
                            onClick={() => {
                              setSelectedApproval(appr);
                              setReviewRemarks('');
                            }}
                            className={`px-3 py-1.5 rounded-[4px] font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                              isActionableForMe
                                ? 'bg-emerald-800 hover:bg-emerald-900 text-white'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{stage === 1 ? 'Endorse' : isHighValue ? 'Authorize (> 10M)' : 'Authorize'}</span>
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 5. Sticky Floating Batch Action Bar ── */}
      {selectedIds.length > 0 && canReview && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md text-slate-800 px-4 py-2.5 rounded-lg shadow-xl border border-slate-300 ring-1 ring-slate-900/5 flex items-center gap-4 animate-slideUp">
          <div className="flex items-center gap-2">
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center tabular-nums">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-700">
              Selected Requests
            </span>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            {canEndorse && canApprove ? (
              <>
                <button
                  onClick={() => handleOpenBatchModal('ENDORSE')}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Batch Endorse ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => handleOpenBatchModal('APPROVE')}
                  className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Batch Authorize ({selectedIds.length})</span>
                </button>
              </>
            ) : canEndorse ? (
              <button
                onClick={() => handleOpenBatchModal('ENDORSE')}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Batch Endorse ({selectedIds.length})</span>
              </button>
            ) : canApprove ? (
              <button
                onClick={() => handleOpenBatchModal('APPROVE')}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-md w-full max-w-2xl p-5 space-y-4 shadow-2xl text-slate-900 my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-800" />
                {selectedApproval.status === ApprovalStatus.RETURNED
                  ? 'Returned for correction: reject it for good?'
                  : selectedApproval.currentStage === 1
                  ? 'Stage 1: Team Leader Endorsement'
                  : isHigh(selectedApproval)
                    ? 'Stage 2: Chief Director Final Authorization (> 10M ETB)'
                    : 'Stage 2: Department Head Final Authorization'}
              </h3>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-[4px]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{selectedApproval.itemName}</span>
                  {getTypeBadge(selectedApproval.transactionType, selectedApproval.requestDetails)}
                </div>
                <p className="font-mono text-slate-800 font-bold">{selectedApproval.itemCode}</p>
                {!slipLines.has(selectedApproval.id) && approvalUnits(selectedApproval) && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Quantity:</span>
                    <span className="font-mono font-semibold text-sky-800">{approvalUnits(selectedApproval)!.replace(/^Qty /, '')}</span>
                  </div>
                )}
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
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-slate-800 space-y-1">
                  <div className="font-bold flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-slate-900">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      Stage 1 Endorsement Verified
                    </span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono font-semibold">
                      Ready for Final Sign-Off
                    </span>
                  </div>
                  <p className="text-slate-700">
                    Endorsed by: <strong>{selectedApproval.endorsedBy.fullNameEn}</strong> on{' '}
                    {selectedApproval.endorsedAtGc}
                  </p>
                  <p className="italic text-slate-600">
                    Remarks: "{selectedApproval.endorsementRemarks || 'Endorsed'}"
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
                  {selectedApproval.status === ApprovalStatus.RETURNED
                    ? 'Give the reason. A rejection is final: this voucher can\'t be entered again.'
                    : 'Needed to return or reject. Return sends it back to the requester to correct; Reject refuses it for good.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[3px] text-xs font-semibold transition"
              >
                Cancel
              </button>

              {selectedApproval.status === ApprovalStatus.RETURNED && canReview && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction(selectedApproval.id, 'REJECT')}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <XCircle className="w-4 h-4" /> Reject for good
                </button>
              )}

              {selectedApproval.status === ApprovalStatus.PENDING && selectedApproval.currentStage === 1 && canEndorse && (
                <>
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
                    onClick={() => handleAction(selectedApproval.id, 'RETURN')}
                    title="Send it back to the requester to correct and resubmit"
                    className="px-4 py-2 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Undo2 className="w-4 h-4" /> Return for correction
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction(selectedApproval.id, 'ENDORSE')}
                    className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
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
                    onClick={() => handleAction(selectedApproval.id, 'RETURN')}
                    title="Send it back to the requester to correct and resubmit"
                    className="px-4 py-2 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Undo2 className="w-4 h-4" /> Return for correction
                  </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedApproval.id, 'APPROVE')}
                        className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-[3px] text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
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
                    : 'bg-emerald-800 hover:bg-emerald-900'
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
