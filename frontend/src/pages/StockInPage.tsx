import React, { useState, useEffect, useCallback } from 'react';
import {
  PackagePlus,
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
  Printer,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { Model19PrintModal } from '../components/ui/Model19PrintModal';
import {
  AssetCategory,
  ItemStatus,
  ItemCondition,
  ItemWithRelations,
  Location,
  Employee,
  UserRole,
  Model19Voucher,
  Model19LineItem,
} from '../types/asset-management';
import { formatETB, formatGcToEc } from '../utils/eth-date';
import { getSystemSettings } from '../utils/system-settings';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface StockInPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  mode?: 'stock-in' | 'return';
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  [ItemStatus.PENDING_STOCK_IN]: {
    label: 'Pending Approval',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  [ItemStatus.AVAILABLE]: {
    label: 'Available (In Store)',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [ItemStatus.PENDING_STOCK_OUT]: {
    label: 'Pending Stock-Out',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  [ItemStatus.ISSUED]: {
    label: 'Issued',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
};

const StatusBadge: React.FC<{ status: ItemStatus }> = ({ status }) => {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.className}`}>
      {style.label}
    </span>
  );
};


const COMMON_UOMS = ['EA', 'PKT', 'SET', 'ROLL', 'PCS', 'BOX', 'BAG', 'KG', 'LTR', 'CAN', 'BOTTLE'];
const COMMON_CATEGORIES = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery & Supplies' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles & Transport' },
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
];

// ─── Stock-In Form (Flat Single-Item Format) ────────────────────────────────

interface StockInFormProps {
  locations: Location[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: any, voucher?: Model19Voucher) => void;
}

const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Section 1: Document Voucher Header Metadata
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState('PO Receipt');
  const [source, setSource] = useState('');
  const [buyer, setBuyer] = useState('');
  const [programName, setProgramName] = useState('MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa');
  const [storeLocationId, setStoreLocationId] = useState(locations[0]?.id ?? '');

  // Section 2: Single-Item Particulars
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>(AssetCategory.IT_EQUIPMENT);
  const [itemCode, setItemCode] = useState('');
  const [uom, setUom] = useState('EA');
  const [subInventory, setSubInventory] = useState('General Store');
  const [lotBatchNo, setLotBatchNo] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [printedPadFrom, setPrintedPadFrom] = useState('');
  const [printedPadTo, setPrintedPadTo] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCostETB, setUnitCostETB] = useState<number>(0);
  const [condition, setCondition] = useState<ItemCondition>(ItemCondition.NEW);
  const [remark, setRemark] = useState('');

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState('');
  const [receivedBy, setReceivedBy] = useState(user?.fullNameEn || '');
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeLocationId && locations.length > 0) {
      setStoreLocationId(locations[0].id);
    }
  }, [locations, storeLocationId]);

  useEffect(() => {
    if (user?.fullNameEn && !receivedBy) {
      setReceivedBy(user.fullNameEn);
    }
  }, [user, receivedBy]);

  const policy = getSystemSettings().historicalDataAttachmentPolicy;
  const isAttachmentRequired = policy === 'REQUIRED';

  const totalAmount = (Number(quantity) || 0) * (Number(unitCostETB) || 0);

  const handleReset = () => {
    setIfmisSlipNumber('');
    setPoNumber('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setTransactionType('PO Receipt');
    setSource('');
    setBuyer('');
    setStoreLocationId(locations[0]?.id ?? '');
    setName('');
    setCategory(AssetCategory.IT_EQUIPMENT);
    setItemCode('');
    setUom('EA');
    setSubInventory('General Store');
    setLotBatchNo('');
    setSerialNumber('');
    setPrintedPadFrom('');
    setPrintedPadTo('');
    setQuantity(1);
    setUnitCostETB(0);
    setCondition(ItemCondition.NEW);
    setRemark('');
    setDeliveredBy('');
    setReceivedBy(user?.fullNameEn || '');
    setAttachmentFileName('');
    setFormError(null);
  };

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const slipNo = ifmisSlipNumber.trim();
    if (!slipNo) {
      const msg = 'INV Model 19 Voucher Number is mandatory.';
      setFormError(msg);
      toast.warning('Voucher Required', msg);
      return;
    }

    if (!name.trim()) {
      const msg = 'Item Description / Name is required.';
      setFormError(msg);
      toast.warning('Description Required', msg);
      return;
    }

    if (quantity <= 0) {
      const msg = 'Quantity must be at least 1.';
      setFormError(msg);
      toast.warning('Invalid Quantity', msg);
      return;
    }

    if (unitCostETB < 0) {
      const msg = 'Unit price cannot be negative.';
      setFormError(msg);
      toast.warning('Invalid Unit Price', msg);
      return;
    }

    if (isAttachmentRequired && !attachmentFileName) {
      const msg = 'System Policy requires a scanned IFMIS Model 19 slip attachment.';
      setFormError(msg);
      toast.warning('Attachment Required', msg);
      return;
    }

    setSubmitting(true);
    const registeredById = user?.id || employees[0]?.id || '';

    try {
      const selectedCat = COMMON_CATEGORIES.find((c) => c.value === category);
      const itemsPayload = [{
        itemCode: itemCode.trim() || undefined,
        name: name.trim(),
        category,
        serialNumber: serialNumber.trim() || undefined,
        unitCostETB: Number(unitCostETB) || 0,
        condition,
        uom: uom.trim() || 'EA',
        subInventory: subInventory.trim() || undefined,
        itemCategoryDisplay: selectedCat?.label,
        lotBatchNo: lotBatchNo.trim() || undefined,
        printedPadFrom: printedPadFrom.trim() || undefined,
        printedPadTo: printedPadTo.trim() || undefined,
        quantity: Number(quantity) || 1,
        totalAmount,
        remark: remark.trim() || undefined,
      }];

      const res = await api.registerStockIn({
        name: name.trim(),
        category,
        serialNumber: serialNumber.trim() || '',
        unitCostETB: Number(unitCostETB) || 0,
        condition,
        storeLocationId,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
        isHistoricalData: policy === 'OPTIONAL',
        registeredById,
        notes: remark.trim() || undefined,
        poNumber: poNumber.trim() || undefined,
        transactionType,
        source: source.trim() || undefined,
        buyer: buyer.trim() || undefined,
        programName: programName.trim() || undefined,
        deliveredBy: deliveredBy.trim() || undefined,
        receivedBy: receivedBy.trim() || undefined,
        items: itemsPayload,
      });

      // Construct printable Model 19 voucher
      const targetStore = locations.find((l) => l.id === storeLocationId);
      const voucherItems: Model19LineItem[] = [{
        sNo: 1,
        itemCode: itemCode.trim() || (res.items?.[0]?.itemCode || res.item?.itemCode || '—'),
        itemDescription: name.trim(),
        uom: uom.trim() || 'EA',
        subInventory: subInventory.trim() || 'General Store',
        itemCategory: selectedCat?.label || category.replace(/_/g, ' '),
        lotBatchNo: lotBatchNo.trim() || '',
        serialNo: serialNumber.trim() || '',
        printedPadFrom: printedPadFrom.trim() || '',
        printedPadTo: printedPadTo.trim() || '',
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitCostETB) || 0,
        totalAmount,
        remark: remark.trim() || '',
      }];

      const generatedVoucher: Model19Voucher = {
        invModel19No: slipNo,
        poNumber: poNumber.trim() || '—',
        receivedDateGc: ifmisSlipDateGc,
        receivedDateEc: formatGcToEc(ifmisSlipDateGc),
        transactionType: transactionType || 'PO Receipt',
        source: source.trim() || '—',
        buyer: buyer.trim() || '—',
        programName: programName.trim() || 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa',
        storeLocationId,
        storeLocationName: targetStore?.siteName,
        deliveredByName: deliveredBy.trim(),
        receivedByName: receivedBy.trim() || user?.fullNameEn,
        reportTakenBy: user?.fullNameEn || 'azebmif',
        items: voucherItems,
        grandTotal: totalAmount,
      };

      toast.success(
        'Stock-In Registered',
        `Item "${name.trim()}" (Model 19 #${slipNo}, Total ${formatETB(totalAmount)}) registered and submitted for Team Leader verification.`
      );

      onSuccess(res, generatedVoucher);
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`Stock-In failed: ${errMsg}`);
      toast.error('Stock-In Registration Failed', errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500';

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} className="space-y-4">
      {/* Inline Form Error Alert */}
      {formError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Top Document Reference & Policy Notice */}
      <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
        <span className="font-semibold text-slate-700">
          Integrated Financial Management Information System (IFMIS) • Model 19 Receiving
        </span>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
          isAttachmentRequired
            ? 'bg-amber-100 text-amber-900 border-amber-300'
            : 'bg-emerald-100 text-emerald-900 border-emerald-300'
        }`}>
          Voucher Scan: {isAttachmentRequired ? 'Mandatory Attachment' : 'Optional Attachment'}
        </span>
      </div>

      {/* ── Section 1: Official Voucher Details ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-emerald-700" />
          1. Voucher & Procurement Header (የሰነድ እና የግዥ መረጃ)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              INV Model 19 No. *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              className={`${inputClass} font-mono font-bold`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              PO Number
            </label>
            <input
              type="text"
              placeholder="e.g. 186"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Received Date (G.C.) *
            </label>
            <input
              type="date"
              required
              value={ifmisSlipDateGc}
              onChange={(e) => setIfmisSlipDateGc(e.target.value)}
              className={inputClass}
            />
            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
              Eth. Date: {formatGcToEc(ifmisSlipDateGc)} E.C.
            </span>
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
              <option value="PO Receipt">PO Receipt</option>
              <option value="Direct Delivery">Direct Delivery</option>
              <option value="Donation / Grant Receipt">Donation / Grant Receipt</option>
              <option value="Transfer Receipt">Transfer Receipt</option>
              <option value="Internal Production">Internal Production</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Source (Supplier / Vendor) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. ERMEJA TRADING ONE MEMBER P.L.C"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Buyer / Procurement Officer
            </label>
            <input
              type="text"
              placeholder="e.g. Teka, Yebirgual Tamiru"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Program / Project Name
            </label>
            <input
              type="text"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Receiving Store Location *
            </label>
            <select
              value={storeLocationId}
              onChange={(e) => setStoreLocationId(e.target.value)}
              className={inputClass}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.siteName} {loc.roomNumber ? `(${loc.roomNumber})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 2: Flat Item Particulars ── */}
      <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <PackagePlus className="w-3.5 h-3.5 text-emerald-700" />
          2. Received Item Particulars (የተረከቡት ዕቃ ዝርዝር መረጃ)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Description / Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sulfa Drug In Vial"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} font-medium`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className={inputClass}
            >
              {COMMON_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Item Code (Inventory Code)
            </label>
            <input
              type="text"
              placeholder="e.g. 107101102.4336 (Optional)"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Unit of Measure (UOM) *
            </label>
            <input
              type="text"
              list="uom-options"
              value={uom}
              onChange={(e) => setUom(e.target.value.toUpperCase())}
              className={`${inputClass} font-mono uppercase text-center`}
              placeholder="EA"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Sub Inventory
            </label>
            <input
              type="text"
              placeholder="e.g. AMedicine / General Store"
              value={subInventory}
              onChange={(e) => setSubInventory(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Lot / Batch No.
            </label>
            <input
              type="text"
              placeholder="e.g. BATCH-2026-09"
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
              placeholder="e.g. SN-892348"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Sequence # of Printed Pad (FROM / TO)
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
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className={`${inputClass} font-mono font-bold`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Unit Price (ETB) *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              required
              placeholder="0.00"
              value={unitCostETB || ''}
              onChange={(e) => setUnitCostETB(parseFloat(e.target.value) || 0)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Total Amount (ETB)
            </label>
            <div className="w-full px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-mono font-bold text-emerald-900 flex items-center justify-between">
              <span>Grand Total:</span>
              <span>{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ETB</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Physical Condition *
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as ItemCondition)}
              className={inputClass}
            >
              <option value={ItemCondition.NEW}>New / Brand New (አዲስ)</option>
              <option value={ItemCondition.GOOD}>Good (ጥሩ)</option>
              <option value={ItemCondition.FAIR}>Fair (መካከለኛ)</option>
              <option value={ItemCondition.NEEDS_REPAIR}>Needs Repair (ጥገና የሚያስፈልገው)</option>
              <option value={ItemCondition.DAMAGED}>Damaged (የተበላሸ)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Remark / Notes
            </label>
            <input
              type="text"
              placeholder="Optional remarks or specification notes"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ── Section 3: Signatures & Document Scan ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-emerald-700" />
          3. Verification, Signatures & Attachment (ፊርማ እና ሰነድ)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Delivered By : Name
            </label>
            <input
              type="text"
              placeholder="e.g. Delivery Driver / Vendor Agent"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Received By : Name
            </label>
            <input
              type="text"
              placeholder="Store Custodian Name"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Attachment */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Attach Scanned Model 19 Voucher {isAttachmentRequired ? '*' : <span className="text-slate-400 font-normal">(Optional)</span>}
            </label>
            <div className={`flex items-center gap-2 p-2 rounded-xl border border-dashed bg-white ${
              isAttachmentRequired && !attachmentFileName
                ? 'border-amber-400'
                : 'border-slate-300'
            }`}>
              <Upload className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-xs text-slate-600 flex-1 truncate">
                {attachmentFileName || (
                  <span className={isAttachmentRequired ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                    {isAttachmentRequired ? 'Required — upload scanned copy of Model 19' : 'No file chosen (Optional)'}
                  </span>
                )}
              </span>
              <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold cursor-pointer transition">
                Browse
                <input type="file" onChange={handleSimulateUpload} className="hidden" accept="image/*,application/pdf" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* UOM Datalist */}
      <datalist id="uom-options">
        {COMMON_UOMS.map((uom) => (
          <option key={uom} value={uom} />
        ))}
      </datalist>

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
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Register Model 19 Item
          </button>
        </div>
      </div>
    </form>
  );
};

// ─── Items Table ─────────────────────────────────────────────────────────────

type SortField = 'createdAt' | 'itemCode' | 'name' | 'category' | 'ifmisSlipNumber' | 'unitCostETB' | 'status';

interface ItemsTableProps {
  items: ItemWithRelations[];
  onRefresh: () => void;
  refreshing: boolean;
  onNavigate: (tab: string) => void;
  onPrintModel19: (item: ItemWithRelations) => void;
  highlightItemId?: string;
}

const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  onRefresh,
  refreshing,
  onNavigate,
  onPrintModel19,
  highlightItemId,
}) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    );
  };

  const q = search.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!q) return true;
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.itemCode || '').toLowerCase().includes(q) ||
      (item.serialNumber || '').toLowerCase().includes(q) ||
      (item.ifmisSlipNumber || '').toLowerCase().includes(q) ||
      (item.source || '').toLowerCase().includes(q) ||
      (item.poNumber || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.itemCategoryDisplay || '').toLowerCase().includes(q) ||
      (item.subInventory || '').toLowerCase().includes(q) ||
      (item.status || '').toLowerCase().includes(q) ||
      (item.uom || '').toLowerCase().includes(q) ||
      (item.deliveredBy || '').toLowerCase().includes(q) ||
      (item.receivedBy || '').toLowerCase().includes(q) ||
      (item.notes || '').toLowerCase().includes(q) ||
      (item.remark || '').toLowerCase().includes(q) ||
      (item.storeLocation?.siteName || '').toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA: any = a[sortField] ?? '';
    let valB: any = b[sortField] ?? '';

    if (sortField === 'createdAt') {
      valA = new Date((a as any).createdAt || a.createdAtGc || 0).getTime();
      valB = new Date((b as any).createdAt || b.createdAtGc || 0).getTime();
    } else if (sortField === 'unitCostETB') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else if (typeof valA === 'string') {
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
            placeholder="Search by name, code, IFMIS slip, serial, vendor, PO number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
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
            {filtered.length} of {items.length} found
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          title="Refresh Inventory"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs">
          {search ? 'No items match your search.' : 'No items registered yet. Click "Register New Item" to begin.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs min-w-[880px]">
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
                  onClick={() => handleSort('name')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition min-w-[180px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Name / Description</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('category')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 w-16 text-center whitespace-nowrap">
                  UOM
                </th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 w-16 text-right whitespace-nowrap">
                  Qty
                </th>
                <th
                  onClick={() => handleSort('ifmisSlipNumber')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-36 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Model 19 / IFMIS</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('createdAt')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date (G.C.)</span>
                    {renderSortIcon('createdAt')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('unitCostETB')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition w-28 text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Unit Cost</span>
                    {renderSortIcon('unitCostETB')}
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
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-24 whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((item) => {
                const isJustRegistered =
                  highlightItemId &&
                  (item.id === highlightItemId || item.itemCode === highlightItemId);
                return (
                  <tr
                    key={item.id}
                    className={`transition ${
                      isJustRegistered
                        ? 'bg-emerald-50/90 border-l-4 border-emerald-600 font-medium'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold text-emerald-700 whitespace-nowrap w-32">
                      <div className="flex items-center gap-1.5">
                        <span>{item.itemCode}</span>
                        {isJustRegistered && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-700 text-white tracking-wider animate-pulse">
                            New
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-900 font-medium min-w-[180px] max-w-[240px] truncate">
                      {item.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap w-28">
                      {item.itemCategoryDisplay || item.category.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-center text-slate-700 uppercase whitespace-nowrap w-16">
                      {item.uom || 'EA'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-900 font-bold whitespace-nowrap w-16">
                      {item.quantity || 1}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap w-36">
                      {item.ifmisSlipNumber || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap w-28 text-[11px]">
                      {item.ifmisSlipDateGc || item.createdAtGc || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 text-right whitespace-nowrap w-28">
                      {formatETB(item.unitCostETB)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap w-28">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap w-24">
                      <button
                        onClick={() => onPrintModel19(item)}
                        className="px-2 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 hover:border-emerald-300 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                        title="Print Official Model 19 Report"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Print M19</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval nudge */}
      {items.some((i) => i.status === ItemStatus.PENDING_STOCK_IN) && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Some items are pending Department Head approval. Go to{' '}
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

export const StockInPage: React.FC<StockInPageProps> = ({ currentRole, onNavigate, mode = 'stock-in' }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<any | null>(null);

  // Model 19 Print Modal State
  const [activeVoucher, setActiveVoucher] = useState<Model19Voucher | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const getHeaderConfig = () => {
    if (mode === 'return') {
      return {
        badge: 'Store Return Workflow • የዕቃ መመለሻ መረከቢያ (ሞዴል 22)',
        title: 'Return to Store Registration (የዕቃ መመለሻ መረከቢያ - ሞዴል 22)',
        subtitle: 'Receive returned assets back into central store inventory following official IFMIS Model 22 Return Slips.',
        buttonLabel: '+ Record Return (Model 22)',
      };
    }
    return {
      badge: 'Inbound Store Receipt • የዕቃ መረከቢያ (ሞዴል 19)',
      title: 'Stock-In — የዕቃ መረከቢያ (ሞዴል 19)',
      subtitle: 'Register incoming goods into store matching official Ethiopian IFMIS Model 19 receiving vouchers.',
      buttonLabel: 'Register New Model 19 Voucher',
    };
  };

  const headerConfig = getHeaderConfig();

  const initData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [locs, emps, allItems] = await Promise.all([
        api.getLocations(),
        api.getEmployees(),
        api.getItems(),
      ]);
      setLocations(locs);
      setEmployees(emps);
      setItems(allItems);
    } catch (err: any) {
      console.error('Failed to load stock-in data:', err);
      setError(err.message || 'Failed to load store parameters and inventory items.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    initData();
  }, [initData]);

  const handleSuccess = (result: any, voucher?: Model19Voucher) => {
    setLastRegistered(result);
    setIsModalOpen(false);

    // Optimistically prepend registered item to table immediately
    if (result?.item) {
      setItems((prev) => [result.item, ...prev.filter((i) => i.id !== result.item.id)]);
    } else if (result?.items && result.items.length > 0) {
      const newIds = new Set(result.items.map((i: any) => i.id));
      setItems((prev) => [...result.items, ...prev.filter((i) => !newIds.has(i.id))]);
    }

    initData(true);
    if (voucher) {
      setActiveVoucher(voucher);
      setIsPrintModalOpen(true);
    }
  };

  const handlePrintItem = (item: ItemWithRelations) => {
    // Group sibling items under the same Model 19 slip if available
    const siblingItems = items.filter(
      (i) => i.ifmisSlipNumber && i.ifmisSlipNumber === item.ifmisSlipNumber
    );
    const targetItems = siblingItems.length > 0 ? siblingItems : [item];

    const voucherItems: Model19LineItem[] = targetItems.map((it, idx) => ({
      id: it.id,
      sNo: idx + 1,
      itemCode: it.itemCode,
      itemDescription: it.name,
      uom: it.uom || 'EA',
      subInventory: it.subInventory || 'General Store',
      itemCategory: it.itemCategoryDisplay || it.category.replace(/_/g, ' '),
      lotBatchNo: it.lotBatchNo || '',
      serialNo: it.serialNumber || '',
      printedPadFrom: it.printedPadFrom || '',
      printedPadTo: it.printedPadTo || '',
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitCostETB) || 0,
      totalAmount: Number(it.totalAmount) || (Number(it.unitCostETB) * (Number(it.quantity) || 1)),
      remark: it.remark || it.notes || '',
    }));

    const grandTotal = voucherItems.reduce((acc, curr) => acc + curr.totalAmount, 0);

    const voucher: Model19Voucher = {
      invModel19No: item.ifmisSlipNumber,
      poNumber: item.poNumber || '186',
      receivedDateGc: item.ifmisSlipDateGc,
      receivedDateEc: item.ifmisSlipDateEc || formatGcToEc(item.ifmisSlipDateGc),
      transactionType: item.transactionType || 'PO Receipt',
      source: item.source || 'ERMEJA TRADING ONE MEMBER P.L.C',
      buyer: item.buyer || 'Teka, Yebirgual Tamiru',
      programName: item.programName || 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa',
      storeLocationId: item.storeLocationId,
      storeLocationName: item.storeLocation?.siteName,
      deliveredByName: item.deliveredBy,
      receivedByName: item.receivedBy || item.registeredBy?.fullNameEn,
      reportTakenBy: item.registeredBy?.fullNameEn || 'azebmif',
      items: voucherItems,
      grandTotal,
    };

    setActiveVoucher(voucher);
    setIsPrintModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
        Loading store parameters...
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
          onClick={() => initData()}
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
              {headerConfig.badge}
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Official Ethiopian Government Standard • Model 19
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-700" />
            {headerConfig.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerConfig.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            {headerConfig.buttonLabel}
          </button>
        </div>
      </div>

      {/* ── Last Registration Banner ── */}
      {lastRegistered && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-emerald-900">Stock-In Voucher Successfully Registered!</p>
            <p className="text-slate-700 mt-0.5">
              <span className="font-mono font-bold text-emerald-800">
                {lastRegistered.item?.itemCode || 'New Voucher'}
              </span>{' '}
              — {lastRegistered.item?.name} (Model 19 #{lastRegistered.item?.ifmisSlipNumber}) is now pending Department Head approval.
            </p>
            {activeVoucher && (
              <div className="mt-2.5">
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Model 19 Goods Receiving Report</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setLastRegistered(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Items Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            Registered Items ({items.length})
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.PENDING_STOCK_IN).length} Pending
            </span>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.AVAILABLE).length} Available
            </span>
            <span className="bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.ISSUED).length} Issued
            </span>
          </div>
        </div>
        <ItemsTable
          items={items}
          onRefresh={() => initData(true)}
          refreshing={refreshing}
          onNavigate={onNavigate}
          onPrintModel19={handlePrintItem}
          highlightItemId={lastRegistered?.item?.id || lastRegistered?.item?.itemCode}
        />
      </div>

      {/* ── Stock-In Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register Goods Receiving Note (Model 19)"
        subtitle="Ethiopian Government IFMIS Model 19 Voucher Specification"
        accentColor="emerald"
        size="2xl"
      >
        {locations.length > 0 && employees.length > 0 ? (
          <StockInForm
            locations={locations}
            employees={employees}
            onCancel={() => setIsModalOpen(false)}
            onSuccess={handleSuccess}
          />
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            Failed to load reference data. Please reload the page.
          </div>
        )}
      </Modal>

      {/* ── Official Model 19 Print Modal ── */}
      <Model19PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        voucher={activeVoucher}
      />
    </div>
  );
};
