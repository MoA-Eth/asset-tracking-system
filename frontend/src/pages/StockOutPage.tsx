import React, { useState, useEffect, useCallback } from 'react';
import {
  PackageMinus,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Eye,
  Clock,
  XCircle,
  Search,
  User,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Printer,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { CustodyVoucherModal } from '../components/ui/CustodyVoucherModal';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { ConditionBadge } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  ItemStatus,
  ApprovalStatus,
  ItemWithRelations,
  TransactionApproval,
  Department,
  Employee,
  UserRole,
} from '../types/asset-management';
import { formatETB } from '../utils/eth-date';
import { getSystemSettings } from '../utils/system-settings';

interface StockOutPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  mode?: 'stock-out' | 'assign' | 'transfer';
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const APPROVAL_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  [ApprovalStatus.PENDING]: {
    label: 'Pending Approval',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  [ApprovalStatus.APPROVED]: {
    label: 'Approved / Issued',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [ApprovalStatus.REJECTED]: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

const ApprovalStatusBadge: React.FC<{ status: ApprovalStatus }> = ({ status }) => {
  const style = APPROVAL_STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.className}`}
    >
      {style.label}
    </span>
  );
};

// ─── Stock-Out Form (inside modal) ───────────────────────────────────────────

interface StockOutFormProps {
  availableItems: ItemWithRelations[];
  departments: Department[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: TransactionApproval) => void;
}

const StockOutForm: React.FC<StockOutFormProps> = ({
  availableItems,
  departments,
  employees,
  onCancel,
  onSuccess,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([availableItems[0]?.id ?? '']);
  const [recipientEmployeeId, setRecipientEmployeeId] = useState(employees[0]?.id ?? '');
  const [targetDepartmentId, setTargetDepartmentId] = useState(employees[0]?.departmentId ?? '');
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState('');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((i) => i !== id) : prev) : [...prev, id]
    );
  };

  const handleEmployeeChange = (empId: string) => {
    setRecipientEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp) setTargetDepartmentId(emp.departmentId);
  };

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleReset = () => {
    setSelectedItemIds([availableItems[0]?.id ?? '']);
    setRecipientEmployeeId(employees[0]?.id ?? '');
    setTargetDepartmentId(employees[0]?.departmentId ?? '');
    setIfmisSlipNumber('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setAttachmentFileName('');
    setPurpose('');
    setNotes('');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (selectedItemIds.length === 0) {
      const msg = 'Please select at least one available store item to issue.';
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }
    if (!ifmisSlipNumber.trim()) {
      const msg = 'IFMIS Stock-Out Slip Number (Model 20) is mandatory.';
      setFormError(msg);
      toast.warning('Voucher Required', msg);
      return;
    }
    if (!purpose.trim()) {
      const msg = 'Please provide the official purpose/requisition reason.';
      setFormError(msg);
      toast.warning('Purpose Required', msg);
      return;
    }

    const policy = getSystemSettings().historicalDataAttachmentPolicy;
    const isAttachmentRequired = policy === 'REQUIRED';

    if (isAttachmentRequired && !attachmentFileName) {
      const msg = 'System Policy configured in Settings requires a scanned IFMIS issue voucher attachment.';
      setFormError(msg);
      toast.warning('Attachment Required', msg);
      return;
    }

    setSubmitting(true);
    const registeredById = user?.id || employees[0]?.id || '';

    try {
      let lastRes: TransactionApproval | null = null;
      for (const itemId of selectedItemIds) {
        lastRes = await api.registerStockOut({
          itemId,
          recipientEmployeeId,
          targetDepartmentId,
          ifmisSlipNumber: ifmisSlipNumber.trim(),
          ifmisSlipDateGc,
          ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
          purpose,
          registeredById,
        });
      }
      if (lastRes) {
        const recipient = employees.find((e) => e.id === recipientEmployeeId);
        toast.success(
          'Stock-Out Requisition Submitted',
          `Model 20 voucher (${ifmisSlipNumber.trim()}) for ${selectedItemIds.length} item(s) to ${recipient?.fullNameEn || 'staff'} submitted for verification.`
        );
        onSuccess(lastRes);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`Stock-Out failed: ${errMsg}`);
      toast.error('Stock-Out Failed', errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500';

  return (
    <form id="stock-out-form" onSubmit={handleSubmit} className="space-y-4">
      {/* Inline Form Error Alert */}
      {formError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}
      {/* Workflow Banner */}
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2">
        <FileText className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900 leading-relaxed">
          <strong>Batch Requisition Rule:</strong> You can select multiple items to issue under a single IFMIS Model 20 Slip Number. Requests stay{' '}
          <span className="text-amber-800 bg-amber-100 px-1 rounded font-bold font-mono">PENDING</span> until approved.
        </p>
      </div>

      {/* Section 1 — Select Item(s) */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            1. Select Items to Issue from Store ({selectedItemIds.length} Selected)
          </h3>
          <span className="text-[10px] text-blue-800 font-bold bg-blue-100 px-2 py-0.5 rounded border border-blue-200 uppercase">
            Multi-Item Batch Mode
          </span>
        </div>

        <div className="max-h-44 overflow-y-auto space-y-1.5 p-2 bg-white rounded-xl border border-slate-300">
          {availableItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer text-xs ${
                  isSelected ? 'bg-blue-50/80 border-blue-400' : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItemSelection(item.id)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer shrink-0"
                  />
                  <div className="truncate">
                    <span className="font-mono font-bold text-blue-800 mr-2">{item.itemCode}</span>
                    <span className="font-semibold text-slate-900">{item.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                  <ConditionBadge condition={item.condition} />
                  <span className="font-mono font-bold text-slate-700">{formatETB(item.unitCostETB)}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Section 2 — Recipient */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          2. Recipient Personnel & Department
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Recipient Staff Member *</label>
            <select
              value={recipientEmployeeId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className={inputClass}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullNameEn} ({emp.payrollId})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assigning Directorate *</label>
            <select
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              className={inputClass}
            >
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.nameEn} ({dept.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3 — IFMIS Slip & Purpose */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          3. IFMIS Stock-Out Reference — የዕቃ ወጪ ማዘዣ እና መረከቢያ (ሞዴል 20)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">IFMIS / Model 20 Slip Number *</label>
            <input
              type="text"
              required
              placeholder="e.g. M20-IFMIS-SIV-2024-0412"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Slip Date *</label>
            <input
              type="date"
              required
              value={ifmisSlipDateGc}
              onChange={(e) => setIfmisSlipDateGc(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Official Requisition Purpose / Justification *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Assigned for national agricultural census survey field operations"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            {(() => {
              const policy = getSystemSettings().historicalDataAttachmentPolicy;
              const isAttachmentReq = policy === 'REQUIRED';
              return (
                <>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Attach Scanned Issue Voucher {isAttachmentReq ? '*' : <span className="text-slate-400 font-normal">(Optional per System Settings)</span>}
                  </label>
                  <div className={`flex items-center gap-2 p-2.5 rounded-xl border border-dashed bg-white ${
                    isAttachmentReq && !attachmentFileName ? 'border-amber-400' : 'border-slate-300'
                  }`}>
                    <Upload className="w-4 h-4 text-blue-700 shrink-0" />
                    <span className="text-xs text-slate-600 flex-1 truncate">
                      {attachmentFileName || (
                        <span className={isAttachmentReq ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                          {isAttachmentReq ? 'Required — upload scanned slip' : 'No file chosen (Optional)'}
                        </span>
                      )}
                    </span>
                    <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold cursor-pointer transition">
                      Browse
                      <input
                        type="file"
                        onChange={handleSimulateUpload}
                        className="hidden"
                        accept="image/*,application/pdf"
                      />
                    </label>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          Reset Form
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Submit Stock-Out for Dept Head Approval
          </button>
        </div>
      </div>
    </form>
  );
};

type StockOutSortField = 'itemCode' | 'itemName' | 'ifmisSlipNumber' | 'purposeOrRemarks' | 'createdAtGc' | 'status';

interface StockOutTableProps {
  approvals: TransactionApproval[];
  onRefresh: () => void;
  refreshing: boolean;
  onNavigate: (tab: string) => void;
  onOpenVoucher: (approval: TransactionApproval) => void;
  onOpenReturn: (itemCode: string) => void;
}

const StockOutTable: React.FC<StockOutTableProps> = ({
  approvals,
  onRefresh,
  refreshing,
  onNavigate,
  onOpenVoucher,
  onOpenReturn,
}) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<StockOutSortField>('itemCode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: StockOutSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: StockOutSortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-700 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-700 font-bold shrink-0" />
    );
  };

  const filtered = approvals.filter(
    (a) =>
      a.itemName.toLowerCase().includes(search.toLowerCase()) ||
      a.itemCode.toLowerCase().includes(search.toLowerCase()) ||
      (a.ifmisSlipNumber ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    let valA: any = a[sortField] ?? '';
    let valB: any = b[sortField] ?? '';

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by item name, code or IFMIS slip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs">
          {search ? 'No requests match your search.' : 'No stock-out requests recorded yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs min-w-[840px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th
                  onClick={() => handleSort('itemCode')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-32 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item Code</span>
                    {renderSortIcon('itemCode')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('itemName')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition min-w-[170px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item Name</span>
                    {renderSortIcon('itemName')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ifmisSlipNumber')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-36 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ሞዴል 20 / IFMIS Slip</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('purposeOrRemarks')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition min-w-[150px] max-w-[200px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Purpose</span>
                    {renderSortIcon('purposeOrRemarks')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('createdAtGc')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    {renderSortIcon('createdAtGc')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right w-36 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((approval) => (
                <tr key={approval.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap w-32">{approval.itemCode}</td>
                  <td className="px-3 py-2.5 text-slate-900 font-medium min-w-[170px] max-w-[220px] truncate">{approval.itemName}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap w-36">
                    {approval.ifmisSlipNumber || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-600 min-w-[150px] max-w-[200px] truncate">
                    {approval.purposeOrRemarks || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap w-28">
                    {approval.createdAtGc ? approval.createdAtGc.split('T')[0] : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap w-28">
                    <ApprovalStatusBadge status={approval.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap w-36">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onOpenVoucher(approval)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                        title="Print Handover Certificate (Model 20)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {approval.status === ApprovalStatus.APPROVED && (
                        <button
                          onClick={() => onOpenReturn(approval.itemCode)}
                          className="px-2 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 transition cursor-pointer font-bold text-[10px] flex items-center gap-1 border border-purple-300"
                          title="Return Issued Item to Store (Model 22)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Model 22 Return
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending nudge */}
      {approvals.some((a) => a.status === ApprovalStatus.PENDING) && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Some stock-out requests are awaiting approval. Go to{' '}
            <button
              onClick={() => onNavigate('approvals')}
              className="font-bold underline cursor-pointer hover:no-underline"
            >
              Approvals Queue
            </button>{' '}
            to track status.
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const StockOutPage: React.FC<StockOutPageProps> = ({ currentRole, onNavigate, mode = 'stock-out' }) => {
  const toast = useToast();
  const [availableItems, setAvailableItems] = useState<ItemWithRelations[]>([]);
  const [stockOutApprovals, setStockOutApprovals] = useState<TransactionApproval[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<TransactionApproval | null>(null);

  const [selectedVoucherApproval, setSelectedVoucherApproval] = useState<TransactionApproval | null>(null);
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);

  const getHeaderConfig = () => {
    switch (mode) {
      case 'assign':
        return {
          badge: 'Asset Custody Workflow • የንብረት ድልድል እና ወጪ (ሞዴል 20)',
          title: 'Asset Assignment & Custody Issue (የንብረት ድልድል - ሞዴል 20)',
          subtitle: 'Assign store inventory items to custodian personnel using official IFMIS Model 20 Issue Slips.',
          buttonLabel: 'Assign Asset (Model 20)',
        };
      case 'transfer':
        return {
          badge: 'Inter-Department Transfer Workflow • የንብረት ዝውውር (ሞዴል 20/22)',
          title: 'Asset Transfer Registration (የንብረት ዝውውር - ሞዴል 20/22)',
          subtitle: 'Transfer assets between departments, store locations, or employee custodians.',
          buttonLabel: 'Transfer Asset',
        };
      default:
        return {
          badge: 'Outbound Store Issue • የዕቃ ወጪ ማዘዣ እና መረከቢያ (ሞዴል 20)',
          title: 'Stock-Out — የዕቃ ወጪ ማዘዣ (ሞዴል 20)',
          subtitle: 'Issue items from store following official IFMIS Model 20 Stock-Out vouchers (ሞዴል 20 / SIV).',
          buttonLabel: 'Issue Asset',
        };
    }
  };

  const headerConfig = getHeaderConfig();

  const handleOpenReturnByCode = async (itemCode: string) => {
    try {
      const items = await api.getItems({ search: itemCode });
      const found = items.find((i) => i.itemCode === itemCode) || items[0];
      if (found) {
        setReturnItem(found);
      }
    } catch {
      toast.error('Item Fetch Error', `Could not fetch details for item ${itemCode}`);
    }
  };

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [items, deps, emps, approvals] = await Promise.all([
        api.getItems({ status: ItemStatus.AVAILABLE }),
        api.getDepartments(),
        api.getEmployees(),
        api.getApprovals(),
      ]);
      setAvailableItems(items);
      setDepartments(deps);
      setEmployees(emps);
      setStockOutApprovals(approvals.filter((a) => a.transactionType === 'STOCK_OUT'));
    } catch (err: any) {
      console.error('Failed to load stock-out data:', err);
      setError(err.message || 'Failed to load stock availability and approvals.');
    } finally {
      if (isRefresh) setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSuccess = (result: TransactionApproval) => {
    setLastSubmitted(result);
    setIsModalOpen(false);
    fetchData(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-400" />
        Loading stock availability...
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
          onClick={() => fetchData()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
              {headerConfig.badge}
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Stock-Out Request → Data Encoder → Dept Head Approval → Issued
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <PackageMinus className="w-5 h-5 text-blue-700" />
            {headerConfig.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerConfig.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200 text-xs hidden sm:inline-block">
            {availableItems.length} Available in Store
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={availableItems.length === 0}
            className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            {headerConfig.buttonLabel}
          </button>
        </div>
      </div>

      {/* No Stock Warning */}
      {availableItems.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-bold">No Items Currently Available in Store</p>
            <p className="mt-0.5 text-amber-800">
              All items are either pending approval or already issued. Register inbound items via{' '}
              <button
                onClick={() => onNavigate('stock-in')}
                className="font-bold underline cursor-pointer hover:no-underline"
              >
                Stock-In
              </button>{' '}
              first.
            </p>
          </div>
        </div>
      )}

      {/* ── Last Submission Banner ── */}
      {lastSubmitted && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-300 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-blue-900">Stock-Out Request Submitted for Approval!</p>
            <p className="text-slate-700 mt-0.5">
              <span className="font-mono font-bold text-blue-800">{lastSubmitted.itemCode}</span>{' '}
              — {lastSubmitted.itemName} is now{' '}
              <span className="font-bold text-amber-800 bg-amber-100 px-1 rounded font-mono">PENDING</span> Department
              Head approval.
            </p>
          </div>
          <button
            onClick={() => setLastSubmitted(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Stock-Out Requests Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            Stock-Out Requests ({stockOutApprovals.length})
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
              {stockOutApprovals.filter((a) => a.status === ApprovalStatus.PENDING).length} Pending
            </span>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
              {stockOutApprovals.filter((a) => a.status === ApprovalStatus.APPROVED).length} Approved
            </span>
            <span className="bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
              {stockOutApprovals.filter((a) => a.status === ApprovalStatus.APPROVED).length} Issued
            </span>
          </div>
        </div>
        <StockOutTable
          approvals={stockOutApprovals}
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          onNavigate={onNavigate}
          onOpenVoucher={(appr) => setSelectedVoucherApproval(appr)}
          onOpenReturn={(code) => handleOpenReturnByCode(code)}
        />
      </div>

      {/* ── Stock-Out Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Issue Item from Store (Stock-Out)"
        subtitle="Submit an outbound issue request for Department Head approval"
        accentColor="blue"
        size="xl"
      >
        {availableItems.length > 0 ? (
          <StockOutForm
            availableItems={availableItems}
            departments={departments}
            employees={employees}
            onCancel={() => setIsModalOpen(false)}
            onSuccess={handleSuccess}
          />
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            No available items to issue. Register stock-in items first.
          </div>
        )}
      </Modal>

      {/* ── Printable Custody Voucher Modal ── */}
      <CustodyVoucherModal
        isOpen={!!selectedVoucherApproval}
        onClose={() => setSelectedVoucherApproval(null)}
        approval={selectedVoucherApproval}
        voucherType="MODEL_20_STOCK_OUT"
      />

      {/* ── Model 22 Return to Store Modal ── */}
      <ReturnToStoreModal
        isOpen={!!returnItem}
        onClose={() => setReturnItem(null)}
        item={returnItem}
        employees={employees}
        onSuccess={() => fetchData(true)}
      />
    </div>
  );
};
