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
import { Model22PrintModal } from '../components/ui/Model22PrintModal';
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
  Model22Voucher,
} from '../types/asset-management';
import { formatETB, formatGcToEc } from '../utils/eth-date';
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
  onSuccess: (result: TransactionApproval, voucher?: Model22Voucher) => void;
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

  // Selected store item
  const initialItem = availableItems[0];
  const [selectedItemId, setSelectedItemId] = useState<string>(initialItem?.id ?? '');

  // Header fields matching photo
  const [model22No, setModel22No] = useState<string>('0004653/A Inventory');
  const [issuedDateGc, setIssuedDateGc] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState<string>('Move Order Issue');
  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>(
    employees[0]?.departmentId ?? departments[0]?.id ?? ''
  );
  const [recipientEmployeeId, setRecipientEmployeeId] = useState<string>(employees[0]?.id ?? '');

  // Line item particulars matching photo columns
  const [itemCode, setItemCode] = useState<string>(initialItem?.itemCode ?? '');
  const [itemDescription, setItemDescription] = useState<string>(initialItem?.name ?? '');
  const [uom, setUom] = useState<string>(initialItem?.uom ?? 'EA');
  const [subInventory, setSubInventory] = useState<string>(
    initialItem?.subInventory ?? initialItem?.storeLocation?.siteName ?? 'Spareparts'
  );
  const [itemCategory, setItemCategory] = useState<string>(
    initialItem?.itemCategoryDisplay ?? initialItem?.category?.replace(/_/g, ' ') ?? 'Spare parts'
  );
  const [lotBatchNo, setLotBatchNo] = useState<string>(initialItem?.lotBatchNo ?? '');
  const [serialNo, setSerialNo] = useState<string>(initialItem?.serialNumber ?? '');
  const [printedPadFrom, setPrintedPadFrom] = useState<string>(initialItem?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState<string>(initialItem?.printedPadTo ?? '');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(initialItem?.unitCostETB ?? 18963.5);
  const [transportationCost, setTransportationCost] = useState<number>(0);
  const [remark, setRemark] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('Move Order Issue for Ministry Operations');
  const [attachmentFileName, setAttachmentFileName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-populate when an item is selected from store
  const handleItemSelect = (id: string) => {
    setSelectedItemId(id);
    const item = availableItems.find((i) => i.id === id);
    if (item) {
      setItemCode(item.itemCode || '');
      setItemDescription(item.name || '');
      setUom(item.uom || 'EA');
      setSubInventory(item.subInventory || item.storeLocation?.siteName || 'Spareparts');
      setItemCategory(item.itemCategoryDisplay || item.category?.replace(/_/g, ' ') || 'Spare parts');
      setLotBatchNo(item.lotBatchNo || '');
      setSerialNo(item.serialNumber || '');
      setPrintedPadFrom(item.printedPadFrom || '');
      setPrintedPadTo(item.printedPadTo || '');
      setUnitPrice(item.unitCostETB || 0);
    }
  };

  const handleEmployeeChange = (empId: string) => {
    setRecipientEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp && emp.departmentId) {
      setDestinationDepartmentId(emp.departmentId);
    }
  };

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleReset = () => {
    const it = availableItems[0];
    setSelectedItemId(it?.id ?? '');
    setModel22No('0004653/A Inventory');
    setIssuedDateGc(new Date().toISOString().split('T')[0]);
    setTransactionType('Move Order Issue');
    setDestinationDepartmentId(employees[0]?.departmentId ?? departments[0]?.id ?? '');
    setRecipientEmployeeId(employees[0]?.id ?? '');
    setItemCode(it?.itemCode ?? '');
    setItemDescription(it?.name ?? '');
    setUom(it?.uom ?? 'EA');
    setSubInventory(it?.subInventory ?? it?.storeLocation?.siteName ?? 'Spareparts');
    setItemCategory(it?.itemCategoryDisplay ?? it?.category?.replace(/_/g, ' ') ?? 'Spare parts');
    setLotBatchNo(it?.lotBatchNo ?? '');
    setSerialNo(it?.serialNumber ?? '');
    setPrintedPadFrom(it?.printedPadFrom ?? '');
    setPrintedPadTo(it?.printedPadTo ?? '');
    setQuantity(1);
    setUnitPrice(it?.unitCostETB ?? 18963.5);
    setTransportationCost(0);
    setRemark('');
    setPurpose('Move Order Issue for Ministry Operations');
    setAttachmentFileName('');
    setFormError(null);
  };

  const totalAmount = quantity * unitPrice;
  const grandTotal = totalAmount + transportationCost;
  const ethDate = formatGcToEc(issuedDateGc);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedItemId) {
      const msg = 'Please select an available store item to issue.';
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }
    if (!model22No.trim()) {
      const msg = 'Model 22 Voucher Number is mandatory.';
      setFormError(msg);
      toast.warning('Voucher Required', msg);
      return;
    }
    if (!recipientEmployeeId) {
      const msg = 'Please select the recipient staff member.';
      setFormError(msg);
      toast.warning('Recipient Required', msg);
      return;
    }

    const policy = getSystemSettings().historicalDataAttachmentPolicy;
    const isAttachmentRequired = policy === 'REQUIRED';
    if (isAttachmentRequired && !attachmentFileName) {
      const msg = 'System Policy requires a scanned IFMIS issue voucher attachment.';
      setFormError(msg);
      toast.warning('Attachment Required', msg);
      return;
    }

    setSubmitting(true);
    const registeredById = user?.id || employees[0]?.id || '';
    const selectedItem = availableItems.find((i) => i.id === selectedItemId);
    const recipient = employees.find((e) => e.id === recipientEmployeeId);
    const dept = departments.find((d) => d.id === destinationDepartmentId);

    try {
      const result = await api.registerStockOut({
        itemId: selectedItemId,
        recipientEmployeeId,
        targetDepartmentId: destinationDepartmentId,
        ifmisSlipNumber: model22No.trim(),
        ifmisSlipDateGc: issuedDateGc,
        ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
        purpose: purpose.trim() || 'Move Order Issue for Ministry Operations',
        registeredById,
        transactionType,
        destination: dept ? `${dept.nameEn} (${dept.code})` : destinationDepartmentId,
        subInventory,
        lotBatchNo,
        printedPadFrom,
        printedPadTo,
        quantity,
        unitPrice,
        totalAmount,
        transportationCost,
        remark: remark.trim() || undefined,
      });

      const voucher: Model22Voucher = {
        model22No: model22No.trim(),
        issuedDateGc,
        issuedDateEc: ethDate,
        transactionType,
        destination: dept ? `${dept.nameEn} (${dept.code})` : destinationDepartmentId,
        destinationDepartmentId,
        subInventory,
        issuedByName: user?.fullNameEn || 'Store Custodian',
        receivedByName: recipient?.fullNameEn || 'Staff Recipient',
        receivedByEmployeeId: recipientEmployeeId,
        items: [
          {
            sNo: 1,
            itemCode: itemCode || selectedItem?.itemCode || '—',
            itemDescription: itemDescription || selectedItem?.name || '—',
            uom,
            subInventory,
            itemCategory,
            lotBatchNo,
            serialNo,
            printedPadFrom,
            printedPadTo,
            quantity,
            unitPrice,
            totalAmount,
            remark,
          },
        ],
        total: totalAmount,
        transportationCost,
        grandTotal,
        reportPrintedBy: user?.payrollId || 'store.keeper',
        reportPrintedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      };

      toast.success(
        'Model 22 Issue Voucher Submitted',
        `Receipt for Articles Or Property Issued (${model22No.trim()}) to ${recipient?.fullNameEn || 'staff'} registered for approval.`
      );
      onSuccess(result, voucher);
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

      {/* ── Section 1: Header / Document Details ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-700" />
          1. Issue Voucher Header Information
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Model 22 No. *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 0004653/A Inventory"
              value={model22No}
              onChange={(e) => setModel22No(e.target.value)}
              className={`${inputClass} font-mono font-bold text-blue-950`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Issued Date (G.C.) *
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={issuedDateGc}
                onChange={(e) => setIssuedDateGc(e.target.value)}
                className={inputClass}
              />
              <span className="text-[10px] text-slate-500 font-mono block mt-1">
                E.C.: {ethDate}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Transaction Type *
            </label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className={inputClass}
            >
              <option value="Move Order Issue">Move Order Issue</option>
              <option value="Direct Store Issue">Direct Store Issue</option>
              <option value="Department Assignment">Department Assignment</option>
              <option value="Project Allocation">Project Allocation</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Destination Directorate *
            </label>
            <select
              value={destinationDepartmentId}
              onChange={(e) => setDestinationDepartmentId(e.target.value)}
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

      {/* ── Section 2: Flat Single-Item Particulars ── */}
      <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <PackageMinus className="w-3.5 h-3.5 text-blue-700" />
            2. Issued Item Particulars (የሚወጣው ዕቃ ዝርዝር መረጃ)
          </h4>
          <span className="text-[10px] text-blue-800 font-bold bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
            Single Item Flat Mode
          </span>
        </div>

        {/* Available item selector */}
        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
          <label className="block text-xs font-bold text-blue-950 mb-1">
            Select Available Store Item to Issue *
          </label>
          <select
            value={selectedItemId}
            onChange={(e) => handleItemSelect(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {availableItems.length === 0 ? (
              <option value="">No items available in store</option>
            ) : (
              availableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.itemCode} — {item.name} ({formatETB(item.unitCostETB)})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Flat Grid matching provided document columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Battery 12v - 70 Amp"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className={`${inputClass} font-medium`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Code (Inventory Code) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 103108101.0004"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className={`${inputClass} font-mono font-bold text-blue-800`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              UOM (Unit of Measure) *
            </label>
            <input
              type="text"
              value={uom}
              onChange={(e) => setUom(e.target.value.toUpperCase())}
              className={`${inputClass} font-mono uppercase text-center`}
              placeholder="EA"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Sub Inventory *
            </label>
            <input
              type="text"
              placeholder="e.g. Spareparts / General Store"
              value={subInventory}
              onChange={(e) => setSubInventory(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Category *
            </label>
            <input
              type="text"
              placeholder="e.g. Spare parts / IT Equipment"
              value={itemCategory}
              onChange={(e) => setItemCategory(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Lot / Batch No.
            </label>
            <input
              type="text"
              placeholder="e.g. LOT-2026"
              value={lotBatchNo}
              onChange={(e) => setLotBatchNo(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Serial Number
            </label>
            <input
              type="text"
              placeholder="e.g. SN-49202"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Sequence # Printed Pad (From / To)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="From"
                value={printedPadFrom}
                onChange={(e) => setPrintedPadFrom(e.target.value)}
                className={`${inputClass} font-mono text-center`}
              />
              <input
                type="text"
                placeholder="To"
                value={printedPadTo}
                onChange={(e) => setPrintedPadTo(e.target.value)}
                className={`${inputClass} font-mono text-center`}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Quantity *
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className={`${inputClass} font-mono text-right font-bold`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Unit Price (ETB) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={unitPrice}
              onChange={(e) => setUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
              className={`${inputClass} font-mono text-right font-bold text-slate-900`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Transportation Cost (ETB)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={transportationCost}
              onChange={(e) => setTransportationCost(Math.max(0, parseFloat(e.target.value) || 0))}
              className={`${inputClass} font-mono text-right`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Total Amount (ETB)
            </label>
            <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono font-bold text-right text-slate-900">
              {formatETB(totalAmount)}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Grand Total (ETB)
            </label>
            <div className="px-3 py-2 bg-blue-50 border border-blue-300 rounded-xl text-xs font-mono font-black text-right text-blue-950">
              {formatETB(grandTotal)}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Remark / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Routine maintenance issue for central pool"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Requisition Purpose / Reason *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Move Order Issue for Agricultural Operations"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ── Section 3: Signatures & Custody ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-blue-700" />
          3. Custody & Signatures (ማረጋገጫ እና ፊርማዎች)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Issued By : Name (Store Custodian)
            </label>
            <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-700 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{user?.fullNameEn || 'Current User (Store Keeper)'}</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Received By : Name (Recipient Staff Member) *
            </label>
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

          <div className="sm:col-span-2">
            {(() => {
              const policy = getSystemSettings().historicalDataAttachmentPolicy;
              const isAttachmentReq = policy === 'REQUIRED';
              return (
                <>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Attach Scanned Issue Voucher {isAttachmentReq ? '*' : <span className="text-slate-400 font-normal">(Optional)</span>}
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
            Submit Model 22 Issue Voucher
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
  onPrintModel22?: (approval: TransactionApproval) => void;
  highlightApprovalId?: string;
}

const StockOutTable: React.FC<StockOutTableProps> = ({
  approvals,
  onRefresh,
  refreshing,
  onNavigate,
  onOpenVoucher,
  onOpenReturn,
  onPrintModel22,
  highlightApprovalId,
}) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<StockOutSortField>('createdAtGc');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  const q = search.trim().toLowerCase();
  const filtered = approvals.filter((a) => {
    if (!q) return true;
    return (
      (a.itemName || '').toLowerCase().includes(q) ||
      (a.itemCode || '').toLowerCase().includes(q) ||
      (a.ifmisSlipNumber || '').toLowerCase().includes(q) ||
      (a.purposeOrRemarks || '').toLowerCase().includes(q) ||
      (a.recipientEmployee?.fullNameEn || '').toLowerCase().includes(q) ||
      ((a as any).targetDepartment?.nameEn || a.targetDepartmentId || '').toLowerCase().includes(q) ||
      (a.status || '').toLowerCase().includes(q)
    );
  });

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
            placeholder="Search by item name, code, IFMIS slip, recipient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {search.trim() && (
          <span className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-xl font-medium shrink-0">
            {filtered.length} of {approvals.length} found
          </span>
        )}
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
                    <span>Model 22 / Slip No.</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('purposeOrRemarks')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition min-w-[150px] max-w-[200px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Purpose / Remark</span>
                    {renderSortIcon('purposeOrRemarks')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('createdAtGc')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date (G.C.)</span>
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
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right w-44 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((approval) => {
                const isJustSubmitted = highlightApprovalId && highlightApprovalId === approval.id;
                return (
                  <tr
                    key={approval.id}
                    className={`transition ${
                      isJustSubmitted ? 'bg-blue-50/90 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap w-32">
                      <div className="flex items-center gap-1.5">
                        <span>{approval.itemCode}</span>
                        {isJustSubmitted && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-700 text-white tracking-wider animate-pulse">
                            New
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-900 font-medium min-w-[170px] max-w-[220px] truncate">
                      {approval.itemName}
                    </td>
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
                    <td className="px-3 py-2.5 text-right whitespace-nowrap w-44">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => (onPrintModel22 ? onPrintModel22(approval) : onOpenVoucher(approval))}
                          className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-300 hover:border-blue-300 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                          title="Print Official Model 22 Receipt"
                        >
                          <Printer className="w-3.5 h-3.5 text-blue-700" />
                          <span>Print M22</span>
                        </button>
                        {approval.status === ApprovalStatus.APPROVED && (
                          <button
                            onClick={() => onOpenReturn(approval.itemCode)}
                            className="px-2 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 transition cursor-pointer font-bold text-[10px] flex items-center gap-1 border border-purple-300"
                            title="Return Issued Item to Store (Model 22)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
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
  const { user } = useAuth();
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

  const [activeVoucher, setActiveVoucher] = useState<Model22Voucher | null>(null);
  const [selectedVoucherApproval, setSelectedVoucherApproval] = useState<TransactionApproval | null>(null);
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);

  const getHeaderConfig = () => {
    switch (mode) {
      case 'assign':
        return {
          title: 'Asset Assignment & Custody Issue (የንብረት ድልድል - ሞዴል 22)',
          subtitle: 'Assign store inventory items to custodian personnel using official Model 22 Issue Slips.',
          buttonLabel: 'Assign Asset (Model 22)',
        };
      case 'transfer':
        return {
          title: 'Asset Transfer Registration (የንብረት ዝውውር - ሞዴል 22)',
          subtitle: 'Transfer assets between departments, store locations, or employee custodians.',
          buttonLabel: 'Transfer Asset',
        };
      default:
        return {
          title: 'Stock-Out — Property Issued (ሞዴል 22)',
          subtitle: 'Issue items from store following official FDRE Ministry of Agriculture Model 22 vouchers (Move Order Issue).',
          buttonLabel: 'Issue Asset (Model 22)',
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

  const handlePrintModel22 = async (approval: TransactionApproval) => {
    let itemDetails: ItemWithRelations | undefined;
    try {
      const items = await api.getItems({ search: approval.itemCode });
      itemDetails = items.find((i) => i.itemCode === approval.itemCode) || items[0];
    } catch {
      // fallback to approval data
    }

    const targetDept = departments.find((d) => d.id === approval.targetDepartmentId);
    const destination = targetDept ? `${targetDept.nameEn} (${targetDept.code})` : 'Central Operations';
    const recipient = employees.find((e) => e.id === approval.recipientEmployeeId) || approval.recipientEmployee;
    const requester = employees.find((e) => e.id === approval.requestedById) || approval.requestedBy;

    const issuedDateGc = approval.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0];
    const issuedDateEc = approval.createdAtEc || formatGcToEc(issuedDateGc);
    const unitPrice = itemDetails?.unitCostETB || 0;
    const qty = 1;
    const totalAmount = unitPrice * qty;

    const voucher: Model22Voucher = {
      model22No: approval.ifmisSlipNumber || '0004653/A Inventory',
      issuedDateGc,
      issuedDateEc,
      transactionType: 'Move Order Issue',
      destination,
      destinationDepartmentId: approval.targetDepartmentId,
      subInventory: itemDetails?.subInventory || 'Spareparts',
      issuedByName: requester?.fullNameEn || user?.fullNameEn || 'Store Custodian',
      receivedByName: recipient?.fullNameEn || 'Recipient Staff Member',
      receivedByEmployeeId: approval.recipientEmployeeId,
      items: [
        {
          sNo: 1,
          itemCode: approval.itemCode,
          itemDescription: approval.itemName,
          uom: itemDetails?.uom || 'EA',
          subInventory: itemDetails?.subInventory || 'Spareparts',
          itemCategory: itemDetails?.itemCategoryDisplay || (itemDetails?.category as string) || 'Spare parts',
          lotBatchNo: itemDetails?.lotBatchNo || undefined,
          serialNo: itemDetails?.serialNumber || undefined,
          quantity: qty,
          unitPrice,
          totalAmount,
          remark: approval.purposeOrRemarks || '',
        },
      ],
      total: totalAmount,
      transportationCost: 0,
      grandTotal: totalAmount,
      reportPrintedBy: user?.payrollId || 'lidlyats',
      reportPrintedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    };

    setActiveVoucher(voucher);
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

  const handleSuccess = (result: TransactionApproval, voucher?: Model22Voucher) => {
    setLastSubmitted(result);
    setIsModalOpen(false);
    fetchData(true);
    if (voucher) {
      setActiveVoucher(voucher);
    }
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
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <PackageMinus className="w-5 h-5 text-blue-700" />
            {headerConfig.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerConfig.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200 text-xs whitespace-nowrap shrink-0 hidden sm:inline-block">
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
          onPrintModel22={handlePrintModel22}
          onOpenReturn={(code) => handleOpenReturnByCode(code)}
          highlightApprovalId={lastSubmitted?.id}
        />
      </div>

      {/* ── Stock-Out Modal (Model 22 Single-Item Form) ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Issue Item from Store — Receipt For Articles Or Property Issued (Model 22)"
        subtitle="The Federal Democratic Republic of Ethiopia • Ministry of Agriculture"
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

      {/* ── Official Model 22 Printable Voucher Modal ── */}
      <Model22PrintModal
        isOpen={!!activeVoucher}
        onClose={() => setActiveVoucher(null)}
        voucher={activeVoucher}
      />

      {/* ── Printable Custody Voucher Modal (Model 20 Legacy) ── */}
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
