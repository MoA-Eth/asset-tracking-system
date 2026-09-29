import React, { useState, useEffect } from 'react';
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

interface ApprovalsPageProps {
  currentRole?: UserRole;
  onNavigate: (tab: string) => void;
}

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onNavigate }) => {
  const { user, role } = useAuth();
  const canEndorse = role === UserRole.SYSTEM_ADMIN || role === UserRole.TEAM_LEADER;
  const canApprove = role === UserRole.SYSTEM_ADMIN || role === UserRole.DEPARTMENT_HEAD;
  const canReview = canEndorse || canApprove;

  const [approvals, setApprovals] = useState<TransactionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<TransactionApproval | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    setError(null);
    try {
      const statusParam = statusFilter === 'ALL' ? undefined : (statusFilter as ApprovalStatus);
      const [apprs, emps] = await Promise.all([
        api.getApprovals(statusParam),
        api.getEmployees(),
      ]);
      setApprovals(apprs);
      setEmployees(emps);
    } catch (err: any) {
      console.error('Failed to load approvals:', err);
      setError(err.message || 'Failed to load approvals list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [statusFilter]);

  const handleAction = async (approvalId: string, action: 'ENDORSE' | 'APPROVE' | 'REJECT') => {
    setActionError(null);
    if (action === 'REJECT' && !reviewRemarks.trim()) {
      setActionError('Please provide a reason or remarks for rejection.');
      return;
    }

    if (!canReview) {
      setActionError('Access Denied: You do not have permission to perform approval actions.');
      return;
    }

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
      fetchApprovals();
    } catch (err: any) {
      setActionError(`Approval action failed: ${err.message || 'Server error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const [stageSubFilter, setStageSubFilter] = useState<'ALL' | 'STAGE_1' | 'STAGE_2'>(() => {
    if (role === UserRole.TEAM_LEADER) return 'STAGE_1';
    if (role === UserRole.DEPARTMENT_HEAD) return 'STAGE_2';
    return 'ALL';
  });

  const pendingStage1Count = approvals.filter(
    (a) => a.status === ApprovalStatus.PENDING && (a.currentStage ?? 1) === 1
  ).length;
  const pendingStage2Count = approvals.filter(
    (a) => a.status === ApprovalStatus.PENDING && a.currentStage === 2
  ).length;

  const rolePendingCount =
    role === UserRole.TEAM_LEADER
      ? pendingStage1Count
      : role === UserRole.DEPARTMENT_HEAD
      ? pendingStage2Count
      : approvals.filter((a) => a.status === ApprovalStatus.PENDING).length;

  const displayedApprovals = approvals.filter((a) => {
    if (statusFilter === ApprovalStatus.PENDING) {
      if (stageSubFilter === 'STAGE_1') return (a.currentStage ?? 1) === 1;
      if (stageSubFilter === 'STAGE_2') return a.currentStage === 2;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-amber-500" />
        Loading pending approvals & sign-off queue...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Data Connection Error</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => fetchApprovals()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-amber-600" />
              2-Stage Sequential Authorization Queue
            </h2>
            {rolePendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                {rolePendingCount} Pending Action
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Multi-stage workflow: <strong>Stage 1</strong> Team Leader Endorsement → <strong>Stage 2</strong> Directorate Head Final Authorization.
          </p>
        </div>

        <button
          onClick={fetchApprovals}
          className="p-2 rounded-xl bg-white text-slate-700 hover:text-slate-900 border border-slate-200 transition w-fit shadow-xs"
          title="Refresh Queue"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Role Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center gap-2.5">
        <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          Logged in as <strong>{user?.fullNameEn || 'Officer'}</strong> ({role}).{' '}
          {role === UserRole.TEAM_LEADER && <span>Stage 1 Action: You are authorized to review & <strong>Endorse</strong> requests.</span>}
          {role === UserRole.DEPARTMENT_HEAD && <span>Stage 2 Action: You are authorized to grant <strong>Final Approval</strong> on endorsed requests.</span>}
          {role === UserRole.SYSTEM_ADMIN && <span>Admin Override: Authorized for Stage 1 Endorsement and Stage 2 Final Approvals.</span>}
          {role === UserRole.DATA_ENCODER && <span>Read-Only View: Requester status monitoring mode.</span>}
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 border-b border-slate-200 pb-2">
        {[
          { label: 'Pending Action', value: ApprovalStatus.PENDING },
          { label: 'Approved', value: ApprovalStatus.APPROVED },
          { label: 'Rejected', value: ApprovalStatus.REJECTED },
          { label: 'All Records', value: 'ALL' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === tab.value
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stage Sub-Filter toolbar when Pending Action is selected */}
      {statusFilter === ApprovalStatus.PENDING && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider pl-1">
            Filter Stage:
          </span>
          <button
            onClick={() => setStageSubFilter('STAGE_1')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              stageSubFilter === 'STAGE_1'
                ? 'bg-amber-700 text-white font-bold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
            }`}
          >
            <span>Stage 1 (Team Leader Endorsement)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-950 font-black">
              {pendingStage1Count}
            </span>
          </button>
          <button
            onClick={() => setStageSubFilter('STAGE_2')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              stageSubFilter === 'STAGE_2'
                ? 'bg-purple-700 text-white font-bold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
            }`}
          >
            <span>Stage 2 (Dept Head Approval)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-950 font-black">
              {pendingStage2Count}
            </span>
          </button>
          <button
            onClick={() => setStageSubFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              stageSubFilter === 'ALL'
                ? 'bg-slate-800 text-white font-bold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>All Stages</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-900 font-black">
              {pendingStage1Count + pendingStage2Count}
            </span>
          </button>
        </div>
      )}

      {/* Approvals Listing */}
      {loading && approvals.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 text-amber-600 animate-spin mx-auto mb-2" />
          Loading approval requests...
        </div>
      ) : displayedApprovals.length === 0 ? (
        <div className="py-12 text-center rounded-2xl bg-white border border-dashed border-slate-300 space-y-1 shadow-xs">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No Approvals Pending in Queue</h3>
          <p className="text-xs text-slate-500">All registered stock transactions are up to date for this view.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedApprovals.map((appr) => {
            const isStockIn = appr.transactionType === TransactionType.STOCK_IN;
            const isPending = appr.status === ApprovalStatus.PENDING;
            const stage = appr.currentStage ?? 1;

            return (
              <div
                key={appr.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isPending
                    ? stage === 1
                      ? 'bg-white border-amber-400 ring-1 ring-amber-400/30 shadow-xs'
                      : 'bg-white border-purple-400 ring-1 ring-purple-400/30 shadow-xs'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        isStockIn
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}
                    >
                      {isStockIn ? 'Stock-In Verification' : 'Stock-Out Authorization'}
                    </span>

                    {/* Stage & Status Badges */}
                    <div className="flex items-center gap-1">
                      {isPending && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                            stage === 1
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-purple-100 text-purple-900 border-purple-300'
                          }`}
                        >
                          {stage === 1 ? 'Stage 1 Pending (Team Leader)' : 'Stage 2 Pending (Dept Head)'}
                        </span>
                      )}
                      {!isPending && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            appr.status === ApprovalStatus.APPROVED
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border border-rose-300'
                          }`}
                        >
                          {appr.status}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{appr.itemName}</h3>
                  <p className="text-xs font-mono text-emerald-700 font-bold mt-0.5">{appr.itemCode}</p>

                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">IFMIS Slip:</span>
                      <span className="font-mono text-amber-800 font-bold bg-amber-100 px-1.5 py-0.2 rounded">
                        {appr.ifmisSlipNumber}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Slip Date:</span>
                      <span className="text-slate-800">
                        {appr.ifmisSlipDateEc} E.C. ({appr.ifmisSlipDateGc})
                      </span>
                    </div>
                    {appr.purposeOrRemarks && (
                      <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-700">
                        <strong>Purpose / Note:</strong> {appr.purposeOrRemarks}
                      </div>
                    )}
                    {stage === 2 && appr.endorsedBy && (
                      <div className="pt-1 border-t border-slate-200 text-[11px] text-purple-900 font-medium">
                        <strong>Stage 1 Endorsement:</strong> {appr.endorsedBy.fullNameEn} ({appr.endorsementRemarks || 'Endorsed'})
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">
                    Created: {appr.createdAtEc} E.C.
                  </span>

                  {isPending ? (
                    stage === 1 ? (
                      canEndorse ? (
                        <button
                          onClick={() => setSelectedApproval(appr)}
                          className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          Review & Endorse (Stage 1)
                        </button>
                      ) : (
                        <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-[10px] font-semibold border border-amber-200">
                          Awaiting Team Leader Endorsement
                        </span>
                      )
                    ) : (
                      canApprove ? (
                        <button
                          onClick={() => setSelectedApproval(appr)}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          Final Approve (Stage 2)
                        </button>
                      ) : (
                        <span className="px-2 py-1 rounded-md bg-purple-50 text-purple-800 text-[10px] font-semibold border border-purple-200">
                          Endorsed • Awaiting Dept Head Approval
                        </span>
                      )
                    )
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      {appr.reviewRemarks || 'Reviewed'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-amber-600" />
                {selectedApproval.currentStage === 1
                  ? 'Stage 1: Team Leader Endorsement'
                  : 'Stage 2: Department Head Final Authorization'}
              </h3>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-bold text-slate-900 text-sm">{selectedApproval.itemName}</p>
                <p className="font-mono text-emerald-800 font-bold">{selectedApproval.itemCode}</p>
                <p className="text-slate-700">
                  Transaction: <strong>{selectedApproval.transactionType}</strong>
                </p>
                <p className="text-slate-700">
                  IFMIS Slip: <strong className="font-mono text-amber-800 bg-amber-100 px-1 rounded">{selectedApproval.ifmisSlipNumber}</strong>
                </p>
                <p className="text-slate-600 italic mt-1">
                  Justification: "{selectedApproval.purposeOrRemarks}"
                </p>
              </div>

              {/* Endorsement Banner if Stage 2 */}
              {selectedApproval.currentStage === 2 && selectedApproval.endorsedBy && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 space-y-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>Stage 1 Endorsement Status: ENDORSED</span>
                    <span className="text-[10px] bg-purple-200 px-1.5 py-0.2 rounded font-mono">Stage 2 Ready</span>
                  </div>
                  <p>
                    Endorsed by: <strong>{selectedApproval.endorsedBy.fullNameEn}</strong> ({selectedApproval.endorsedBy.role}) on {selectedApproval.endorsedAtGc}
                  </p>
                  <p className="italic text-slate-700">
                    Remarks: "{selectedApproval.endorsementRemarks || 'Endorsed'}"
                  </p>
                </div>
              )}

              {/* Simulated IFMIS Attachment Preview */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-center">
                <FileText className="w-8 h-8 text-emerald-700 mx-auto" />
                <p className="text-[11px] font-bold text-emerald-950">
                  Attached IFMIS Document: {selectedApproval.ifmisSlipNumber}.pdf
                </p>
                <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  Verified Government Voucher
                </span>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {selectedApproval.currentStage === 1
                    ? 'Team Leader Endorsement Remarks:'
                    : 'Department Head Authorization Comments:'}
                </label>
                <input
                  type="text"
                  placeholder={
                    selectedApproval.currentStage === 1
                      ? 'e.g. Endorsed specification and IFMIS voucher details.'
                      : 'e.g. Approved and authorized for store release.'
                  }
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-600 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
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
                  <CheckCircle2 className="w-4 h-4" /> Endorse Request (Stage 1)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction(selectedApproval.id, 'APPROVE')}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Final Approve & Sign-Off
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

