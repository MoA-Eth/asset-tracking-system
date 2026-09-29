import React, { useState, useEffect, useMemo } from 'react';
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  User,
  ShieldAlert,
  AlertCircle,
  List,
  LayoutGrid,
  CheckSquare,
  Square,
  ArrowUpDown,
  Send,
  PackagePlus,
  PackageMinus,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api/client';
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

interface ApprovalsPageProps {
  currentRole?: UserRole;
  onNavigate: (tab: string) => void;
  onRefreshPendingCount?: () => void;
}

type TabFilter = 'MY_QUEUE' | 'STAGE_1' | 'STAGE_2' | 'APPROVED' | 'REJECTED' | 'ALL';
type ViewMode = 'table' | 'cards';

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onNavigate, onRefreshPendingCount }) => {
  const { user, role } = useAuth();
  const toast = useToast();
  const canEndorse = role === UserRole.TEAM_LEADER;
  const canApprove = role === UserRole.DEPARTMENT_HEAD;
  const canReview = canEndorse || canApprove;

  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Navigation & View Controls
  const [activeTab, setActiveTab] = useState<TabFilter>(() => {
    if (role === UserRole.TEAM_LEADER) return 'STAGE_1';
    if (role === UserRole.DEPARTMENT_HEAD) return 'STAGE_2';
    return 'MY_QUEUE';
  });
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');

  // Multi-Selection State for Batch Processing
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchActionType, setBatchActionType] = useState<'ENDORSE' | 'APPROVE' | 'REJECT' | null>(null);
  const [batchRemarks, setBatchRemarks] = useState('');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Single Item Review Modal State
  const [selectedApproval, setSelectedApproval] = useState<TransactionApproval | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Compute live counter metrics
  const metrics = useMemo(() => {
    const pending = approvals.filter((a) => a.status === ApprovalStatus.PENDING);
    const stage1 = pending.filter((a) => (a.currentStage ?? 1) === 1);
    const stage2 = pending.filter((a) => a.currentStage === 2);
    const approved = approvals.filter((a) => a.status === ApprovalStatus.APPROVED);
    const rejected = approvals.filter((a) => a.status === ApprovalStatus.REJECTED);

    let myQueueCount = 0;
    if (role === UserRole.TEAM_LEADER) myQueueCount = stage1.length;
    else if (role === UserRole.DEPARTMENT_HEAD) myQueueCount = stage2.length;
    else myQueueCount = pending.length;

    return {
      myQueueCount,
      stage1Count: stage1.length,
      stage2Count: stage2.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      totalCount: approvals.length,
    };
  }, [approvals, role]);

  // Filtered approvals list
  const filteredApprovals = useMemo(() => {
    return approvals.filter((item) => {
      // 1. Tab Status Filter
      if (activeTab === 'MY_QUEUE') {
        if (item.status !== ApprovalStatus.PENDING) return false;
        if (role === UserRole.TEAM_LEADER && (item.currentStage ?? 1) !== 1) return false;
        if (role === UserRole.DEPARTMENT_HEAD && item.currentStage !== 2) return false;
      } else if (activeTab === 'STAGE_1') {
        if (item.status !== ApprovalStatus.PENDING || (item.currentStage ?? 1) !== 1) return false;
      } else if (activeTab === 'STAGE_2') {
        if (item.status !== ApprovalStatus.PENDING || item.currentStage !== 2) return false;
      } else if (activeTab === 'APPROVED') {
        if (item.status !== ApprovalStatus.APPROVED) return false;
      } else if (activeTab === 'REJECTED') {
        if (item.status !== ApprovalStatus.REJECTED) return false;
      }
      // 'ALL' tab includes all records

      // 2. Type Filter
      if (typeFilter !== 'ALL' && item.transactionType !== typeFilter) {
        return false;
      }

      // 3. Search Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          item.ifmisSlipNumber.toLowerCase().includes(q) ||
          (item.purposeOrRemarks && item.purposeOrRemarks.toLowerCase().includes(q)) ||
          (item.requestedBy?.fullNameEn && item.requestedBy.fullNameEn.toLowerCase().includes(q)) ||
          (item.endorsedBy?.fullNameEn && item.endorsedBy.fullNameEn.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [approvals, activeTab, typeFilter, searchTerm, role]);

  // Checkbox Selection logic
  const actionablePendingItems = useMemo(() => {
    return filteredApprovals.filter((a) => {
      if (a.status !== ApprovalStatus.PENDING) return false;
      if (role === UserRole.TEAM_LEADER) return (a.currentStage ?? 1) === 1;
      if (role === UserRole.DEPARTMENT_HEAD) return a.currentStage === 2;
      return true;
    });
  }, [filteredApprovals, role]);

  const isAllSelected =
    actionablePendingItems.length > 0 &&
    actionablePendingItems.every((item) => selectedIds.includes(item.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(actionablePendingItems.map((i) => i.id));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Single Action Handler
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

    const target = approvals.find((a) => a.id === approvalId) || selectedApproval;
    const itemCode = target?.itemCode || 'Transaction';
    const typeLabel =
      target?.transactionType === 'STOCK_IN'
        ? 'Model 19 Stock-In'
        : target?.transactionType === 'STOCK_OUT'
        ? 'Model 20 Stock-Out'
        : 'Model 22 Return';

    setActionLoading(true);
    const approverId =
      user?.id ||
      (role === UserRole.TEAM_LEADER
        ? employees.find((e) => e.role === UserRole.TEAM_LEADER)?.id
        : employees.find((e) => e.role === UserRole.DEPARTMENT_HEAD)?.id) ||
      employees[0]?.id;

    try {
      await api.handleApproval({
        approvalId,
        action,
        reviewedById: approverId,
        reviewRemarks: reviewRemarks.trim() || undefined,
      });

      setSelectedApproval(null);
      setReviewRemarks('');
      setSelectedIds((prev) => prev.filter((id) => id !== approvalId));
      await fetchApprovals();
      onRefreshPendingCount?.();
      window.dispatchEvent(new CustomEvent('moa_approvals_updated'));

      if (action === 'ENDORSE') {
        toast.success(
          'Stage 1 Endorsement Recorded',
          `${typeLabel} (${itemCode}) verified and advanced to Directorate Head for Stage 2 final approval.`
        );
      } else if (action === 'APPROVE') {
        const resultDesc =
          target?.transactionType === 'STOCK_IN'
            ? 'Asset is now AVAILABLE in Central Store.'
            : target?.transactionType === 'STOCK_OUT'
            ? 'Asset is now ISSUED to staff custodian.'
            : 'Asset is now RETURNED to store inventory.';
        toast.success(
          'Authorization Approved',
          `${typeLabel} (${itemCode}) granted final sign-off. ${resultDesc}`
        );
      } else if (action === 'REJECT') {
        toast.warning(
          'Transaction Rejected',
          `${typeLabel} (${itemCode}) has been rejected. Item status updated accordingly.`
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
    const approverId =
      user?.id ||
      (role === UserRole.TEAM_LEADER
        ? employees.find((e) => e.role === UserRole.TEAM_LEADER)?.id
        : employees.find((e) => e.role === UserRole.DEPARTMENT_HEAD)?.id) ||
      employees[0]?.id;

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        await api.handleApproval({
          approvalId: id,
          action: batchActionType,
          reviewedById: approverId,
          reviewRemarks: batchRemarks.trim() || undefined,
        });
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

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case TransactionType.STOCK_IN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <PackagePlus className="w-3 h-3 text-emerald-700" />
            Model 19 (IN)
          </span>
        );
      case TransactionType.STOCK_OUT:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <PackageMinus className="w-3 h-3 text-blue-700" />
            Model 20 (OUT)
          </span>
        );
      case TransactionType.RETURN:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <RotateCcw className="w-3 h-3 text-amber-700" />
            Model 22 (RET)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
            {type}
          </span>
        );
    }
  };

  const getStageIndicator = (appr: TransactionApproval) => {
    if (appr.status !== ApprovalStatus.PENDING) {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
            appr.status === ApprovalStatus.APPROVED
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}
        >
          {appr.status === ApprovalStatus.APPROVED ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          ) : (
            <XCircle className="w-3 h-3 text-rose-700" />
          )}
          {appr.status}
        </span>
      );
    }

    const stage = appr.currentStage ?? 1;
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
            stage === 1
              ? 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400/50'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          1. Endorse
        </span>
        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
            stage === 2
              ? 'bg-purple-100 text-purple-900 border-purple-300 ring-1 ring-purple-400/50'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          2. Authorize
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-24">
      {/* ── 1. Page Header & Live Role Alert Banner ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
              Statutory 2-Stage Governance
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Ethiopian Ministry of Agriculture Store Logistics Directive
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-amber-700" />
            Approvals & Authorization Queue (የማረጋገጫና ፈቃድ መስጫ)
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Toggle Button Group */}
          <div className="bg-slate-100 p-0.5 rounded-xl border border-slate-300 flex items-center">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                viewMode === 'table'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Compact Enterprise Table View (Recommended for high volume)"
            >
              <List className="w-4 h-4" />
              <span className="hidden md:inline pr-1">Table View</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                viewMode === 'cards'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline pr-1">Cards View</span>
            </button>
          </div>

          <button
            onClick={fetchApprovals}
            className="p-2 rounded-xl bg-white text-slate-700 hover:text-slate-900 border border-slate-300 transition shadow-xs cursor-pointer"
            title="Refresh Approvals List"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-700 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Role Permission Context Banner */}
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300/80 flex items-center justify-between text-xs text-amber-950 shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Active Role: <strong className="font-bold underline">{role.replace(/_/g, ' ')}</strong>.
            {role === UserRole.TEAM_LEADER && (
              <span className="ml-1 text-amber-900 font-medium">
                You are authorized to review and record <strong>Stage 1 Technical Endorsements</strong>.
              </span>
            )}
            {role === UserRole.DEPARTMENT_HEAD && (
              <span className="ml-1 text-purple-900 font-medium">
                You hold final signing authority to grant <strong>Stage 2 Store Issue Authorizations</strong>.
              </span>
            )}
            {role === UserRole.TOP_MANAGEMENT && (
              <span className="ml-1 text-emerald-900 font-medium">
                Executive Oversight: Full visibility into active approval throughput.
              </span>
            )}
            {role === UserRole.SYSTEM_ADMIN && (
              <span className="ml-1 text-slate-700 font-medium">
                Segregation of Duties (SOD): Read-only governance mode. Approvals require civil service operational roles.
              </span>
            )}
            {role === UserRole.DATA_ENCODER && (
              <span className="ml-1 text-slate-700 font-medium">
                Store Custodian: Tracking submitted vouchers and issue statuses.
              </span>
            )}
          </span>
        </div>
        <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-amber-900 border border-amber-300">
          SOD Protected
        </span>
      </div>

      {/* ── 2. Top Summary KPI Badges ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveTab('MY_QUEUE')}
          className={`p-3 rounded-2xl border transition cursor-pointer ${
            activeTab === 'MY_QUEUE'
              ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-amber-400 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'MY_QUEUE' ? 'text-amber-100' : 'text-slate-500'}`}>
              Pending My Action
            </span>
            <Clock className={`w-4 h-4 ${activeTab === 'MY_QUEUE' ? 'text-white' : 'text-amber-600'}`} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black">{metrics.myQueueCount}</span>
            <span className={`text-[10px] font-medium ${activeTab === 'MY_QUEUE' ? 'text-amber-100' : 'text-slate-500'}`}>
              Actionable
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab('STAGE_1')}
          className={`p-3 rounded-2xl border transition cursor-pointer ${
            activeTab === 'STAGE_1'
              ? 'bg-amber-700 text-white border-amber-800 shadow-md ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-amber-400 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'STAGE_1' ? 'text-amber-100' : 'text-slate-500'}`}>
              Stage 1 Endorsements
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black">{metrics.stage1Count}</span>
            <span className={`text-[10px] font-medium ${activeTab === 'STAGE_1' ? 'text-amber-100' : 'text-slate-500'}`}>
              Team Leader
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab('STAGE_2')}
          className={`p-3 rounded-2xl border transition cursor-pointer ${
            activeTab === 'STAGE_2'
              ? 'bg-purple-700 text-white border-purple-800 shadow-md ring-2 ring-purple-400'
              : 'bg-white border-slate-200 hover:border-purple-400 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'STAGE_2' ? 'text-purple-100' : 'text-slate-500'}`}>
              Stage 2 Authorizations
            </span>
            <span className="w-2 h-2 rounded-full bg-purple-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black">{metrics.stage2Count}</span>
            <span className={`text-[10px] font-medium ${activeTab === 'STAGE_2' ? 'text-purple-100' : 'text-slate-500'}`}>
              Directorate Head
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab('APPROVED')}
          className={`p-3 rounded-2xl border transition cursor-pointer ${
            activeTab === 'APPROVED'
              ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-emerald-400 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'APPROVED' ? 'text-emerald-100' : 'text-slate-500'}`}>
              Approved & Released
            </span>
            <CheckCircle2 className={`w-4 h-4 ${activeTab === 'APPROVED' ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black">{metrics.approvedCount}</span>
            <span className={`text-[10px] font-medium ${activeTab === 'APPROVED' ? 'text-emerald-100' : 'text-slate-500'}`}>
              Completed
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Filters & Search Control Bar ── */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Search + Transaction Type Dropdown */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by code, item name, slip #, or staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:bg-white font-mono"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-600 cursor-pointer w-full sm:w-auto"
            >
              <option value="ALL">All Statutory Types</option>
              <option value={TransactionType.STOCK_IN}>Model 19 (Stock-In Receipt)</option>
              <option value={TransactionType.STOCK_OUT}>Model 20 (Stock-Out Issue)</option>
              <option value={TransactionType.RETURN}>Model 22 (Return to Store)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Queue Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          {[
            { id: 'MY_QUEUE', label: 'Pending My Action', count: metrics.myQueueCount },
            { id: 'STAGE_1', label: 'Stage 1 (Team Leader)', count: metrics.stage1Count },
            { id: 'STAGE_2', label: 'Stage 2 (Dept Head)', count: metrics.stage2Count },
            { id: 'APPROVED', label: 'Approved History', count: metrics.approvedCount },
            { id: 'REJECTED', label: 'Rejected', count: metrics.rejectedCount },
            { id: 'ALL', label: 'All Records', count: metrics.totalCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabFilter);
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === tab.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Main Approvals Display Area ── */}
      {loading && approvals.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 text-amber-600 animate-spin mx-auto mb-2" />
          Loading approval requests registry...
        </div>
      ) : filteredApprovals.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-white border border-dashed border-slate-300 space-y-2 shadow-xs">
          <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No Approvals Matching Criteria</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All registered stock transactions are fully cleared for the selected filters.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* ══════════════════════════════════════════════════════════════════════
           HIGH-DENSITY DATA TABLE (Enterprise Standard - ServiceNow/Workday style)
           ══════════════════════════════════════════════════════════════════════ */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-4 h-4"
                        title="Select All Pending Items"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3">Statutory Form</th>
                  <th className="py-3 px-4">Tracking Code & Asset Description</th>
                  <th className="py-3 px-4">IFMIS Slip Reference</th>
                  <th className="py-3 px-4">Workflow Stage</th>
                  <th className="py-3 px-4">Requester / Justification</th>
                  <th className="py-3 px-4 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApprovals.map((appr) => {
                  const isSelected = selectedIds.includes(appr.id);
                  const isPending = appr.status === ApprovalStatus.PENDING;
                  const stage = appr.currentStage ?? 1;
                  const isActionableForMe =
                    isPending &&
                    ((role === UserRole.TEAM_LEADER && stage === 1) ||
                      (role === UserRole.DEPARTMENT_HEAD && stage === 2));

                  return (
                    <tr
                      key={appr.id}
                      className={`hover:bg-amber-50/40 transition group ${
                        isSelected ? 'bg-amber-50/70' : ''
                      }`}
                    >
                      {canReview && activeTab !== 'APPROVED' && activeTab !== 'REJECTED' && (
                        <td className="py-3 px-3 text-center">
                          {isActionableForMe ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(appr.id)}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-4 h-4"
                            />
                          ) : (
                            <span className="text-slate-300 font-mono text-[10px]">—</span>
                          )}
                        </td>
                      )}

                      {/* Statutory Type Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getTypeBadge(appr.transactionType)}
                      </td>

                      {/* Tracking Code & Item Name */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-emerald-800 text-xs">
                            {appr.itemCode}
                          </span>
                          <span className="font-medium text-slate-900 line-clamp-1 group-hover:text-amber-900 transition">
                            {appr.itemName}
                          </span>
                        </div>
                      </td>

                      {/* IFMIS Slip Number & Slip Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded w-fit text-[11px]">
                            {appr.ifmisSlipNumber}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">
                            {appr.ifmisSlipDateEc} E.C.
                          </span>
                        </div>
                      </td>

                      {/* 2-Stage Progress Indicator */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStageIndicator(appr)}
                      </td>

                      {/* Requester & Justification */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-col text-slate-600">
                          <span className="font-medium text-slate-800 truncate">
                            {appr.requestedBy?.fullNameEn || 'Store Custodian'}
                          </span>
                          <span className="text-[11px] text-slate-500 italic truncate" title={appr.purposeOrRemarks}>
                            {appr.purposeOrRemarks || 'No remarks provided'}
                          </span>
                        </div>
                      </td>

                      {/* Review & Signing Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedApproval(appr);
                              setReviewRemarks('');
                            }}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                              isActionableForMe
                                ? stage === 1
                                  ? 'bg-amber-700 hover:bg-amber-800 text-white'
                                  : 'bg-purple-700 hover:bg-purple-800 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {isActionableForMe
                                ? stage === 1
                                  ? 'Endorse'
                                  : 'Authorize'
                                : 'Inspect'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           COMPACT CARDS GRID (Visual Responsive Alternative)
           ══════════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredApprovals.map((appr) => {
            const isSelected = selectedIds.includes(appr.id);
            const isPending = appr.status === ApprovalStatus.PENDING;
            const stage = appr.currentStage ?? 1;
            const isActionableForMe =
              isPending &&
              ((role === UserRole.TEAM_LEADER && stage === 1) ||
                (role === UserRole.DEPARTMENT_HEAD && stage === 2));

            return (
              <div
                key={appr.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-50/80 border-amber-500 shadow-md ring-1 ring-amber-400'
                    : isPending
                    ? stage === 1
                      ? 'bg-white border-amber-300 ring-1 ring-amber-300/40 shadow-2xs hover:shadow-xs'
                      : 'bg-white border-purple-300 ring-1 ring-purple-300/40 shadow-2xs hover:shadow-xs'
                    : 'bg-white border-slate-200 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {canReview && isActionableForMe && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectItem(appr.id)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-3.5 h-3.5"
                        />
                      )}
                      {getTypeBadge(appr.transactionType)}
                    </div>
                    {getStageIndicator(appr)}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{appr.itemName}</h3>
                  <p className="text-xs font-mono text-emerald-800 font-bold mt-0.5">{appr.itemCode}</p>

                  <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">IFMIS Slip:</span>
                      <span className="font-mono text-amber-800 font-bold bg-amber-100 px-1 rounded">
                        {appr.ifmisSlipNumber}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Date:</span>
                      <span className="text-slate-800">{appr.ifmisSlipDateEc} E.C.</span>
                    </div>
                    {appr.purposeOrRemarks && (
                      <p className="text-[11px] text-slate-600 italic pt-1 border-t border-slate-200 line-clamp-2">
                        "{appr.purposeOrRemarks}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">
                    {appr.createdAtEc} E.C.
                  </span>
                  <button
                    onClick={() => {
                      setSelectedApproval(appr);
                      setReviewRemarks('');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs ${
                      isActionableForMe
                        ? stage === 1
                          ? 'bg-amber-700 hover:bg-amber-800 text-white'
                          : 'bg-purple-700 hover:bg-purple-800 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isActionableForMe ? (stage === 1 ? 'Endorse' : 'Authorize') : 'Inspect'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 5. Sticky Floating Batch Action Bar ── */}
      {selectedIds.length > 0 && canReview && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-slideUp">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold">
              Requests Selected
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            {role === UserRole.TEAM_LEADER ? (
              <button
                onClick={() => handleOpenBatchModal('ENDORSE')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Batch Endorse ({selectedIds.length})</span>
              </button>
            ) : role === UserRole.DEPARTMENT_HEAD ? (
              <button
                onClick={() => handleOpenBatchModal('APPROVE')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Batch Authorize ({selectedIds.length})</span>
              </button>
            ) : null}

            <button
              onClick={() => handleOpenBatchModal('REJECT')}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Batch Reject</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── 6. Single Item Review & Inspection Modal ── */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl text-slate-900 my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-amber-600" />
                {selectedApproval.currentStage === 1
                  ? 'Stage 1: Team Leader Endorsement'
                  : 'Stage 2: Directorate Head Final Authorization'}
              </h3>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{selectedApproval.itemName}</span>
                  {getTypeBadge(selectedApproval.transactionType)}
                </div>
                <p className="font-mono text-emerald-800 font-bold">{selectedApproval.itemCode}</p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">IFMIS Slip:</span>
                  <span className="font-mono text-amber-800 bg-amber-100 font-bold px-1.5 py-0.2 rounded">
                    {selectedApproval.ifmisSlipNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Slip Date:</span>
                  <span className="text-slate-800">
                    {selectedApproval.ifmisSlipDateEc} E.C. ({selectedApproval.ifmisSlipDateGc})
                  </span>
                </div>
                {selectedApproval.purposeOrRemarks && (
                  <div className="pt-1 border-t border-slate-200 text-slate-700">
                    <strong>Official Purpose / Note:</strong> {selectedApproval.purposeOrRemarks}
                  </div>
                )}
              </div>

              {/* Endorsement Audit Trail Banner if Stage 2 */}
              {selectedApproval.currentStage === 2 && selectedApproval.endorsedBy && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 space-y-1">
                  <div className="font-bold flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                      Stage 1 Endorsement Verified
                    </span>
                    <span className="text-[10px] bg-purple-200 px-1.5 py-0.2 rounded font-mono">
                      Ready for Final Sign-Off
                    </span>
                  </div>
                  <p>
                    Endorsed by: <strong>{selectedApproval.endorsedBy.fullNameEn}</strong> on{' '}
                    {selectedApproval.endorsedAtGc}
                  </p>
                  <p className="italic text-slate-700">
                    Remarks: "{selectedApproval.endorsementRemarks || 'Endorsed'}"
                  </p>
                </div>
              )}

              {/* Simulated IFMIS Attachment Document Badge */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-700" />
                  <div>
                    <p className="font-bold text-emerald-950">
                      {selectedApproval.ifmisSlipNumber}.pdf
                    </p>
                    <p className="text-[10px] text-emerald-800">
                      Official Scanned Government Voucher
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                  Verified
                </span>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  {selectedApproval.currentStage === 1
                    ? 'Team Leader Endorsement Remarks:'
                    : 'Directorate Head Authorization Comments:'}
                </label>
                <input
                  type="text"
                  placeholder={
                    selectedApproval.currentStage === 1
                      ? 'e.g. Verified asset specifications against Model 19/20 voucher.'
                      : 'e.g. Authorized for release under official store custody directive.'
                  }
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-600 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleAction(selectedApproval.id, 'REJECT')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>

              {selectedApproval.currentStage === 1 ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction(selectedApproval.id, 'ENDORSE')}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Endorse (Stage 1)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction(selectedApproval.id, 'APPROVE')}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Authorize & Sign-Off
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Multi-Item Batch Confirmation Modal ── */}
      {isBatchModalOpen && batchActionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
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
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">
                You are about to batch {batchActionType.toLowerCase()}{' '}
                <strong className="font-black text-amber-900">{selectedIds.length}</strong> selected transaction requests in a single action.
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Batch Remarks / Audit Note:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Batch verified under procurement directive."
                  value={batchRemarks}
                  onChange={(e) => setBatchRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-600 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={batchProcessing}
                onClick={handleExecuteBatch}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  batchActionType === 'REJECT'
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : batchActionType === 'ENDORSE'
                    ? 'bg-amber-700 hover:bg-amber-800'
                    : 'bg-emerald-700 hover:bg-emerald-800'
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
