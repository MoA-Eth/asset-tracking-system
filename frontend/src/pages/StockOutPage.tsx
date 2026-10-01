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
  Pencil,
  Lock,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { Modal } from '../components/ui/Modal';
import {
  FormSection,
  FieldGrid,
  Field,
  ReadOnlyValue,
  TotalValue,
  FormError,
  FileDropField,
  FormFooter,
  inputClass,
} from '../components/ui/FormKit';
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
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../utils/slip-upload';

interface StockOutPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  mode?: 'stock-out' | 'assign' | 'transfer';
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const APPROVAL_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  [ApprovalStatus.PENDING]: {
    label: 'Pending Approval',
    className: statusTone.pending,
  },
  [ApprovalStatus.APPROVED]: {
    label: 'Approved / Issued',
    className: statusTone.approved,
  },
  [ApprovalStatus.REJECTED]: {
    label: 'Rejected',
    className: statusTone.rejected,
  },
};

/** Who a pending request is waiting on, so two "pending" rows are told apart */
const PENDING_STAGE_LABELS: Record<number, string> = {
  1: 'Awaiting Team Leader',
  2: 'Awaiting Dept. Head',
};

const ApprovalStatusBadge: React.FC<{ status: ApprovalStatus; stage?: number }> = ({ status, stage }) => {
  const base = APPROVAL_STATUS_STYLES[status] ?? {
    label: status,
    className: statusTone.neutral,
  };
  const stageLabel = status === ApprovalStatus.PENDING && stage ? PENDING_STAGE_LABELS[stage] : undefined;
  const style = stageLabel ? { ...base, label: stageLabel } : base;
  return (
    <span
      className={`${pill} ${style.className}`}
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
  /** When set, the form corrects this pending request instead of creating a new one */
  editApproval?: TransactionApproval;
  /** The item of the request being corrected (it is not in the available list while pending) */
  editItem?: ItemWithRelations;
}

/** Splits the stored "purpose (Remark: remark)" text back into its two fields */
const splitPurposeAndRemark = (text: string): { purpose: string; remark: string } => {
  const match = /^([\s\S]*) \(Remark: ([\s\S]*)\)$/.exec(text || '');
  return match ? { purpose: match[1], remark: match[2] } : { purpose: text || '', remark: '' };
};

const StockOutForm: React.FC<StockOutFormProps> = ({
  availableItems,
  departments,
  employees,
  onCancel,
  onSuccess,
  editApproval,
  editItem,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editApproval;
  const editNotes = splitPurposeAndRemark(editApproval?.purposeOrRemarks ?? '');

  // Selected store item
  const initialItem = availableItems[0];
  const [selectedItemId, setSelectedItemId] = useState<string>(initialItem?.id ?? '');

  // Header fields matching photo
  const [model22No, setModel22No] = useState<string>(editApproval?.ifmisSlipNumber ?? '0004653/A Inventory');
  const [issuedDateGc, setIssuedDateGc] = useState<string>(
    editApproval?.ifmisSlipDateGc || editApproval?.createdAtGc?.split('T')[0] || new Date().toISOString().split('T')[0]
  );
  const [transactionType, setTransactionType] = useState<string>('Move Order Issue');
  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>(
    editApproval?.targetDepartmentId ?? employees[0]?.departmentId ?? departments[0]?.id ?? ''
  );
  const [recipientEmployeeId, setRecipientEmployeeId] = useState<string>(
    editApproval?.recipientEmployeeId ?? employees[0]?.id ?? ''
  );

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
  const [quantity, setQuantity] = useState<number>(
    Number(editApproval?.requestDetails?.quantity) || Number(editItem?.quantity) || Number(initialItem?.quantity) || 1
  );
  const [unitPrice, setUnitPrice] = useState<number>(initialItem?.unitCostETB ?? 18963.5);
  const [transportationCost, setTransportationCost] = useState<number>(0);
  const [remark, setRemark] = useState<string>(editNotes.remark);
  const [purpose, setPurpose] = useState<string>(isEdit ? editNotes.purpose : 'Move Order Issue for Ministry Operations');
  // In edit mode the current slip is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState<string>(
    editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-populate when an item is selected from store
  const handleItemSelect = (id: string) => {
    setSelectedItemId(id);
    const item = availableItems.find((i) => i.id === id);
    if (item) {
      // Default to issuing everything in store; lower it to issue part of the batch
      setQuantity(Number(item.quantity) || 1);
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

  const handleSlipSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid Slip File', error);
      return;
    }
    setFormError(null);
    setAttachmentFile(file);
    setAttachmentFileName(file.name);
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
    setQuantity(Number(it?.quantity) || 1);
    setUnitPrice(it?.unitCostETB ?? 18963.5);
    setTransportationCost(0);
    setRemark('');
    setPurpose('Move Order Issue for Ministry Operations');
    setAttachmentFileName('');
    setAttachmentFile(null);
    setFormError(null);
  };

  const quantityItem = editItem ?? availableItems.find((i) => i.id === selectedItemId);
  const inStore = Number(quantityItem?.quantity) || 1;
  const inStoreUom = quantityItem?.uom || uom || 'EA';
  const totalAmount = quantity * unitPrice;
  const grandTotal = totalAmount + transportationCost;
  const ethDate = formatGcToEc(issuedDateGc);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isEdit && !selectedItemId) {
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
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      const msg = `Quantity must be a whole number from 1 to ${inStore} (${inStoreUom} in store).`;
      setFormError(msg);
      toast.warning('Check Quantity', msg);
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

    if (!purpose.trim()) {
      const msg = 'Purpose of issue is required.';
      setFormError(msg);
      toast.warning('Purpose Required', msg);
      return;
    }

    setSubmitting(true);

    if (editApproval) {
      try {
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        const res = await api.updateStockOut(editApproval.id, {
          quantity,
          recipientEmployeeId,
          targetDepartmentId: destinationDepartmentId,
          ifmisSlipNumber: model22No.trim(),
          ifmisSlipDateGc: issuedDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          purpose: purpose.trim(),
          remark: remark.trim() || undefined,
        });
        toast.success('Stock-Out Updated', `The request for ${editApproval.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res.approval);
      } catch (err: any) {
        const errMsg = err.message || 'Server error';
        setFormError(`Update failed: ${errMsg}`);
        toast.error('Stock-Out Update Failed', errMsg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const registeredById = user?.id || employees[0]?.id || '';
    const selectedItem = availableItems.find((i) => i.id === selectedItemId);
    const recipient = employees.find((e) => e.id === recipientEmployeeId);
    const dept = departments.find((d) => d.id === destinationDepartmentId);

    try {
      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      const result = await api.registerStockOut({
        itemId: selectedItemId,
        recipientEmployeeId,
        targetDepartmentId: destinationDepartmentId,
        ifmisSlipNumber: model22No.trim(),
        ifmisSlipDateGc: issuedDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
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

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);
  const isAttachmentReq = getSystemSettings().historicalDataAttachmentPolicy === 'REQUIRED';

  return (
    <form id="stock-out-form" onSubmit={handleSubmit} className="space-y-4">
      <FormError message={formError} />

      {/* ── Section 1: Voucher details ── */}
      <FormSection step={1} title="Voucher details" subtitle="የወጪ ማዘዣ መረጃ · Model 22 header" icon={FileText} accent="emerald">
        <FieldGrid>
          <Field label="Model 22 No." required>
            <input
              type="text"
              required
              placeholder="e.g. 0004653/A Inventory"
              value={model22No}
              onChange={(e) => setModel22No(e.target.value)}
              className={`${input({ mono: true })} font-semibold`}
            />
          </Field>

          <Field label="Issued date (G.C.)" required hint={`${ethDate} E.C.`}>
            <input
              type="date"
              required
              value={issuedDateGc}
              onChange={(e) => setIssuedDateGc(e.target.value)}
              className={input()}
            />
          </Field>

          {!isEdit && (
            <Field label="Transaction type" required>
              <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
                <option value="Move Order Issue">Move Order Issue</option>
                <option value="Direct Store Issue">Direct Store Issue</option>
                <option value="Department Assignment">Department Assignment</option>
                <option value="Project Allocation">Project Allocation</option>
              </select>
            </Field>
          )}
        </FieldGrid>
      </FormSection>

      {/* ── Section 2: Item issued ── */}
      <FormSection step={2} title="Item issued" subtitle="የሚወጣው ዕቃ ዝርዝር መረጃ" icon={PackageMinus} accent="emerald">
        {editApproval ? (
          <FieldGrid>
            <Field label="Item code" hint="The item can't be changed. To issue a different item, ask an approver to reject this request.">
              <ReadOnlyValue mono>{editApproval.itemCode}</ReadOnlyValue>
            </Field>
            <Field label="Item description" span="sm:col-span-2">
              <ReadOnlyValue>{editApproval.itemName}</ReadOnlyValue>
            </Field>
            <Field label="Quantity to issue" required hint={`${inStore} ${inStoreUom} in store`}>
              <input
                type="number"
                min="1"
                max={inStore}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.min(inStore, Math.max(1, parseInt(e.target.value) || 1)))}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>
          </FieldGrid>
        ) : (
        <div className="space-y-3.5">
          <Field label="Store item" required hint="Only items currently available in store are listed.">
            <select
              value={selectedItemId}
              onChange={(e) => handleItemSelect(e.target.value)}
              className={`${input()} font-medium`}
            >
              {availableItems.length === 0 ? (
                <option value="">No items available in store</option>
              ) : (
                availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} — {item.name} · {item.quantity || 1} {item.uom || 'EA'} in store ({formatETB(item.unitCostETB)} each)
                  </option>
                ))
              )}
            </select>
          </Field>

          <FieldGrid>
            <Field label="Item description" required span="sm:col-span-2">
              <input
                type="text"
                required
                placeholder="e.g. Battery 12v - 70 Amp"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Item code" required>
              <input
                type="text"
                required
                placeholder="e.g. 103108101.0004"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                className={`${input({ mono: true })} font-semibold`}
              />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
            <Field label="Category" required>
              <input
                type="text"
                placeholder="e.g. IT Equipment"
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Sub inventory" required>
              <input
                type="text"
                placeholder="e.g. Spareparts"
                value={subInventory}
                onChange={(e) => setSubInventory(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Serial number" optional>
              <input
                type="text"
                placeholder="e.g. SN-49202"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Lot / batch no." optional>
              <input
                type="text"
                placeholder="e.g. LOT-2026"
                value={lotBatchNo}
                onChange={(e) => setLotBatchNo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>
          </FieldGrid>

          {/* Quantity & cost */}
          <FieldGrid cols={4}>
            <Field label="Quantity to issue" required hint={`${inStore} ${inStoreUom} in store`}>
              <input
                type="number"
                min="1"
                max={inStore}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.min(inStore, Math.max(1, parseInt(e.target.value) || 1)))}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>

            <Field label="Unit of measure" required>
              <input
                type="text"
                value={uom}
                onChange={(e) => setUom(e.target.value.toUpperCase())}
                className={`${input({ mono: true })} uppercase`}
                placeholder="EA"
              />
            </Field>

            <Field label="Unit price (ETB)" required>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>

            <Field label="Transport cost (ETB)" optional>
              <input
                type="number"
                min="0"
                step="0.01"
                value={transportationCost}
                onChange={(e) => setTransportationCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
            <Field label="Printed pad from" optional>
              <input
                type="text"
                placeholder="From #"
                value={printedPadFrom}
                onChange={(e) => setPrintedPadFrom(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Printed pad to" optional>
              <input
                type="text"
                placeholder="To #"
                value={printedPadTo}
                onChange={(e) => setPrintedPadTo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Item total (ETB)">
              <ReadOnlyValue mono align="right">{formatETB(totalAmount)}</ReadOnlyValue>
            </Field>

            <Field label="Grand total (ETB)" hint="Item total + transport">
              <TotalValue accent="emerald">{formatETB(grandTotal)}</TotalValue>
            </Field>
          </FieldGrid>
        </div>
        )}
      </FormSection>

      {/* ── Section 3: Recipient & custody ── */}
      <FormSection
        step={3}
        title="Recipient & custody"
        subtitle="ማረጋገጫ እና ፊርማዎች"
        icon={User}
        accent="emerald"
        aside={
          <span
            className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isAttachmentReq ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Slip {isAttachmentReq ? 'required' : 'optional'}
          </span>
        }
      >
        <div className="space-y-3.5">
          <FieldGrid cols={2}>
            <Field label="Received by (recipient)" required hint="Selecting a recipient fills in their directorate.">
              <select
                value={recipientEmployeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className={input()}
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullNameEn} ({emp.payrollId})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Destination directorate" required>
              <select
                value={destinationDepartmentId}
                onChange={(e) => setDestinationDepartmentId(e.target.value)}
                className={input()}
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.nameEn} ({dept.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Purpose of issue" required>
              <input
                type="text"
                required
                placeholder="e.g. Move Order Issue for Agricultural Operations"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Remark" optional>
              <input
                type="text"
                placeholder="e.g. Routine maintenance issue for central pool"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Issued by (store custodian)">
              <ReadOnlyValue>{editApproval?.requestedBy?.fullNameEn || user?.fullNameEn || 'Current user'}</ReadOnlyValue>
            </Field>
          </FieldGrid>

          <FileDropField
            label="Scanned issue voucher"
            accent="emerald"
            required={isAttachmentReq}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSlipSelected}
          />
        </div>
      </FormSection>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
        onCancel={onCancel}
        onReset={isEdit ? undefined : handleReset}
      />
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
  /** Only the Data Encoder can correct a request */
  canEdit: boolean;
  /** All items, for each request's item balance */
  items: ItemWithRelations[];
  /** Items with an open transfer or return request, which can't be returned again yet */
  busyItemIds: Set<string>;
  onEdit: (approval: TransactionApproval) => void;
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
  canEdit,
  items,
  busyItemIds,
  onEdit,
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
      <ArrowUp className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    );
  };

  const itemsById = new Map(items.map((i) => [i.id, i]));

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
            className={table.search}
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
          <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl font-medium shrink-0">
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
          <table className="w-full text-xs min-w-[1040px]">
            <thead>
              <tr className={table.headRow}>
                <th
                  onClick={() => handleSort('itemCode')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-32 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item Code</span>
                    {renderSortIcon('itemCode')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('itemName')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition min-w-[170px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item Name</span>
                    {renderSortIcon('itemName')}
                  </div>
                </th>
                <th className="px-3 py-2.5 w-16 text-right whitespace-nowrap" title="Units in this request">
                  Qty
                </th>
                <th className="px-3 py-2.5 w-16 text-right whitespace-nowrap" title="All units received">
                  Received
                </th>
                <th className="px-3 py-2.5 w-16 text-right whitespace-nowrap" title="Units with custodians">
                  Issued
                </th>
                <th className="px-3 py-2.5 w-16 text-right whitespace-nowrap" title="Units in store">
                  In Store
                </th>
                <th
                  onClick={() => handleSort('ifmisSlipNumber')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-36 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Model 22 / Slip No.</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('purposeOrRemarks')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition min-w-[150px] max-w-[200px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Purpose / Remark</span>
                    {renderSortIcon('purposeOrRemarks')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('createdAtGc')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date (G.C.)</span>
                    {renderSortIcon('createdAtGc')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="px-3 py-2.5 text-right w-44 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((approval) => {
                const isJustSubmitted = highlightApprovalId && highlightApprovalId === approval.id;
                return (
                  <tr
                    key={approval.id}
                    className={`transition ${
                      isJustSubmitted ? `${table.rowHighlight} font-medium` : table.row
                    }`}
                  >
                    <td className={`px-3 py-2.5 ${table.code} whitespace-nowrap w-32`}>
                      <div className="flex items-center gap-1.5">
                        <span>{approval.itemCode}</span>
                        {isJustSubmitted && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-700 text-white tracking-wider animate-pulse">
                            New
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-900 font-medium min-w-[170px] max-w-[220px] truncate">
                      {approval.itemName}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right font-bold text-slate-900 whitespace-nowrap w-16">
                      {approval.requestDetails?.quantity ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-700 whitespace-nowrap w-16">
                      {itemsById.get(approval.itemId)?.balance?.total ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-700 whitespace-nowrap w-16">
                      {itemsById.get(approval.itemId)?.balance?.issued ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-emerald-800 font-semibold whitespace-nowrap w-16">
                      {itemsById.get(approval.itemId)?.balance?.available ?? '—'}
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
                      <ApprovalStatusBadge status={approval.status} stage={approval.currentStage} />
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap w-44">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && approval.status === ApprovalStatus.PENDING && approval.currentStage === 1 && (
                          <button
                            onClick={() => onEdit(approval)}
                            className={btn.row}
                            title="Correct this request (allowed until the Team Leader endorses it)"
                            aria-label={`Edit ${approval.itemCode}`}
                          >
                            <Pencil className={btn.rowIcon} />
                            <span>Edit</span>
                          </button>
                        )}
                        {canEdit && approval.status === ApprovalStatus.PENDING && approval.currentStage === 2 && (
                          <button
                            disabled
                            className={btn.rowLocked}
                            title="Locked: the Team Leader has already endorsed this request. To correct it, ask an approver to reject it and submit it again."
                            aria-label={`Edit ${approval.itemCode} (locked after Team Leader endorsement)`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          onClick={() => (onPrintModel22 ? onPrintModel22(approval) : onOpenVoucher(approval))}
                          className={btn.row}
                          title="Print Official Model 22 Receipt"
                        >
                          <Printer className={btn.rowIcon} />
                          <span>Print M22</span>
                        </button>
                        {approval.status === ApprovalStatus.APPROVED && !busyItemIds.has(approval.itemId) && (
                          <button
                            onClick={() => onOpenReturn(approval.itemCode)}
                            className={btn.row}
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
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const StockOutPage: React.FC<StockOutPageProps> = ({ currentRole, onNavigate, mode = 'stock-out' }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [availableItems, setAvailableItems] = useState<ItemWithRelations[]>([]);
  const [allItems, setAllItems] = useState<ItemWithRelations[]>([]);
  const [stockOutApprovals, setStockOutApprovals] = useState<TransactionApproval[]>([]);
  const [busyItemIds, setBusyItemIds] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editApproval, setEditApproval] = useState<TransactionApproval | null>(null);
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
    const qty = Number(approval.requestDetails?.quantity) || Number(itemDetails?.quantity) || 1;
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
        api.getItems(),
        api.getDepartments(),
        api.getEmployees(),
        api.getApprovals(),
      ]);
      setAllItems(items);
      setAvailableItems(items.filter((i) => i.status === ItemStatus.AVAILABLE));
      setDepartments(deps);
      setEmployees(emps);
      setStockOutApprovals(approvals.filter((a) => a.transactionType === 'STOCK_OUT'));
      setBusyItemIds(new Set(approvals.filter((a) => a.status === ApprovalStatus.PENDING).map((a) => a.itemId)));
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

  const openIssue = () => {
    setEditApproval(null);
    setIsModalOpen(true);
  };

  const openEdit = (approval: TransactionApproval) => {
    setEditApproval(approval);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditApproval(null);
  };

  const handleSuccess = (result: TransactionApproval, voucher?: Model22Voucher) => {
    if (editApproval) {
      closeModal();
      fetchData(true);
      return;
    }
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
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
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
            <PackageMinus className="w-5 h-5 text-emerald-700" />
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
            onClick={openIssue}
            disabled={availableItems.length === 0}
            className={btn.primary}
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
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-emerald-900">Stock-Out Request Submitted for Approval!</p>
            <p className="text-slate-700 mt-0.5">
              <span className="font-mono font-bold text-emerald-800">{lastSubmitted.itemCode}</span>{' '}
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
            <span className={`${statusTone.issued} border px-1.5 py-0.5 rounded font-bold`}>
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
          canEdit={currentRole === UserRole.DATA_ENCODER}
          items={allItems}
          busyItemIds={busyItemIds}
          onEdit={openEdit}
          highlightApprovalId={lastSubmitted?.id}
        />
      </div>

      {/* ── Stock-Out Modal (Model 22 Single-Item Form) ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editApproval ? `Edit request · ${editApproval.itemCode}` : 'Issue item from store · Model 22'}
        subtitle={
          editApproval
            ? 'You can correct this request until the Team Leader endorses it. Each change is recorded in the item history.'
            : 'The item stays in store until the Team Leader endorses and the Department Head approves the issue.'
        }
        accentColor="emerald"
        size="xl"
      >
        {editApproval || availableItems.length > 0 ? (
          <StockOutForm
            key={editApproval?.id ?? 'new'}
            availableItems={availableItems}
            departments={departments}
            employees={employees}
            onCancel={closeModal}
            onSuccess={handleSuccess}
            editApproval={editApproval ?? undefined}
            editItem={editApproval ? allItems.find((i) => i.id === editApproval.itemId) : undefined}
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
