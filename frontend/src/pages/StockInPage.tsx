import React, { useState, useEffect, useCallback } from 'react';
import {
  PackagePlus,
  Package,
  Layers,
  DollarSign,
  ExternalLink,
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
  Pencil,
  Lock,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { Modal, StatCard } from '../components/ui';
import {
  FormSection,
  FieldGrid,
  Field,
  TotalValue,
  ReadOnlyValue,
  FormError,
  FileDropField,
  FormFooter,
  inputClass,
} from '../components/ui/FormKit';
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
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../utils/slip-upload';
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
    className: statusTone.pending,
  },
  [ItemStatus.AVAILABLE]: {
    label: 'Available (In Store)',
    className: statusTone.inStore,
  },
  [ItemStatus.PENDING_STOCK_OUT]: {
    label: 'Pending Stock-Out',
    className: statusTone.pending,
  },
  [ItemStatus.ISSUED]: {
    label: 'Issued',
    className: statusTone.issued,
  },
};

/** Who the Stock-In request is waiting on, so two "pending" rows are told apart */
const PENDING_STAGE_LABELS: Record<number, string> = {
  1: 'Awaiting Team Leader',
  2: 'Awaiting Dept. Head',
};

const StatusBadge: React.FC<{ status: ItemStatus; stage?: number; partlyIssued?: boolean }> = ({ status, stage, partlyIssued }) => {
  const base = STATUS_STYLES[status] ?? { label: status, className: statusTone.neutral };
  const stageLabel = status === ItemStatus.PENDING_STOCK_IN && stage ? PENDING_STAGE_LABELS[stage] : undefined;
  // Some units are with custodians while the rest are still in store
  const style = stageLabel
    ? { ...base, label: stageLabel }
    : partlyIssued
      ? { label: 'Partly issued', className: statusTone.partly }
      : base;
  return (
    <span className={`${pill} ${style.className}`}>
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
  /** When set, the form corrects this registration instead of creating a new one */
  editItem?: ItemWithRelations;
}

const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess, editItem }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editItem;

  // Section 1: Document Voucher Header Metadata
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState(editItem?.ifmisSlipNumber ?? '');
  const [poNumber, setPoNumber] = useState(editItem?.poNumber ?? '');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(editItem?.ifmisSlipDateGc || new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState(editItem?.transactionType || 'PO Receipt');
  const [source, setSource] = useState(editItem?.source ?? '');
  const [buyer, setBuyer] = useState(editItem?.buyer ?? '');
  const [programName, setProgramName] = useState(editItem?.programName ?? 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa');
  const [storeLocationId, setStoreLocationId] = useState(editItem?.storeLocationId ?? locations[0]?.id ?? '');

  // Section 2: Single-Item Particulars
  const [name, setName] = useState(editItem?.name ?? '');
  const [category, setCategory] = useState<AssetCategory>(editItem?.category ?? AssetCategory.IT_EQUIPMENT);
  const [itemCode, setItemCode] = useState(editItem?.itemCode ?? '');
  const [uom, setUom] = useState(editItem?.uom || 'EA');
  const [subInventory, setSubInventory] = useState(editItem?.subInventory ?? 'General Store');
  const [lotBatchNo, setLotBatchNo] = useState(editItem?.lotBatchNo ?? '');
  const [serialNumber, setSerialNumber] = useState(editItem?.serialNumber ?? '');
  const [printedPadFrom, setPrintedPadFrom] = useState(editItem?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState(editItem?.printedPadTo ?? '');
  const [quantity, setQuantity] = useState<number>(Number(editItem?.quantity) || 1);
  const [unitCostETB, setUnitCostETB] = useState<number>(editItem?.unitCostETB ?? 0);
  const [condition, setCondition] = useState<ItemCondition>(editItem?.condition ?? ItemCondition.NEW);
  const [remark, setRemark] = useState(editItem?.remark ?? '');

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState(editItem?.deliveredBy ?? '');
  const [receivedBy, setReceivedBy] = useState(editItem?.receivedBy || user?.fullNameEn || '');
  // In edit mode the current slip is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState(
    editItem?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editItem.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
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
    setAttachmentFile(null);
    setFormError(null);
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

    if (editItem) {
      try {
        const selectedCat = COMMON_CATEGORIES.find((c) => c.value === category);
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        const res = await api.updateStockIn(editItem.id, {
          name: name.trim(),
          category,
          serialNumber: serialNumber.trim() || undefined,
          unitCostETB: Number(unitCostETB) || 0,
          condition,
          storeLocationId,
          ifmisSlipNumber: slipNo,
          ifmisSlipDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          poNumber: poNumber.trim() || undefined,
          transactionType,
          source: source.trim() || undefined,
          buyer: buyer.trim() || undefined,
          programName: programName.trim() || undefined,
          uom: uom.trim() || 'EA',
          subInventory: subInventory.trim() || undefined,
          itemCategoryDisplay: selectedCat?.label,
          lotBatchNo: lotBatchNo.trim() || undefined,
          printedPadFrom: printedPadFrom.trim() || undefined,
          printedPadTo: printedPadTo.trim() || undefined,
          quantity: Number(quantity) || 1,
          deliveredBy: deliveredBy.trim() || undefined,
          receivedBy: receivedBy.trim() || undefined,
          remark: remark.trim() || undefined,
        });
        toast.success('Stock-In Updated', `${editItem.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res);
      } catch (err: any) {
        const errMsg = err.message || 'Server error';
        setFormError(`Update failed: ${errMsg}`);
        toast.error('Stock-In Update Failed', errMsg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

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

      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      const res = await api.registerStockIn({
        name: name.trim(),
        category,
        serialNumber: serialNumber.trim() || '',
        unitCostETB: Number(unitCostETB) || 0,
        condition,
        storeLocationId,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
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

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} className="space-y-4">
      <FormError message={formError} />

      {/* ── Section 1: Voucher & procurement ── */}
      <FormSection
        step={1}
        title="Voucher & procurement"
        subtitle="የሰነድ እና የግዥ መረጃ · IFMIS Model 19 header"
        icon={FileText}
        accent="emerald"
      >
        <FieldGrid>
          <Field label="Model 19 No." required>
            <input
              type="text"
              required
              placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              className={`${input({ mono: true })} font-semibold`}
            />
          </Field>

          <Field label="PO number" optional>
            <input
              type="text"
              placeholder="e.g. 186"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className={input({ mono: true })}
            />
          </Field>

          <Field label="Received date (G.C.)" required hint={`${formatGcToEc(ifmisSlipDateGc)} E.C.`}>
            <input
              type="date"
              required
              value={ifmisSlipDateGc}
              onChange={(e) => setIfmisSlipDateGc(e.target.value)}
              className={input()}
            />
          </Field>

          <Field label="Transaction type" required>
            <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
              <option value="PO Receipt">PO Receipt</option>
              <option value="Direct Delivery">Direct Delivery</option>
              <option value="Donation / Grant Receipt">Donation / Grant Receipt</option>
              <option value="Transfer Receipt">Transfer Receipt</option>
              <option value="Internal Production">Internal Production</option>
            </select>
          </Field>

          <Field label="Source (supplier / vendor)" required>
            <input
              type="text"
              required
              placeholder="e.g. ERMEJA TRADING ONE MEMBER P.L.C"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={input()}
            />
          </Field>

          <Field label="Buyer / procurement officer" optional>
            <input
              type="text"
              placeholder="e.g. Teka, Yebirgual Tamiru"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              className={input()}
            />
          </Field>

          <Field label="Program / project" optional span="sm:col-span-2">
            <input
              type="text"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa"
              className={input()}
            />
          </Field>

          <Field label="Receiving store" required>
            <select value={storeLocationId} onChange={(e) => setStoreLocationId(e.target.value)} className={input()}>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.siteName} {loc.roomNumber ? `(${loc.roomNumber})` : ''}
                </option>
              ))}
            </select>
          </Field>
        </FieldGrid>
      </FormSection>

      {/* ── Section 2: Item received ── */}
      <FormSection step={2} title="Item received" subtitle="የተረከቡት ዕቃ ዝርዝር መረጃ" icon={PackagePlus} accent="emerald">
        <div className="space-y-3.5">
          <FieldGrid>
            <Field label="Item description" required span="sm:col-span-2">
              <input
                type="text"
                required
                placeholder="e.g. Dell Latitude 5440 Laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Category" required>
              <select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)} className={input()}>
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            {isEdit ? (
              <Field label="Item code" hint="The item code can't be changed after registration">
                <ReadOnlyValue mono>{itemCode}</ReadOnlyValue>
              </Field>
            ) : (
              <Field label="Item code" optional hint="Leave blank to generate one automatically">
                <input
                  type="text"
                  placeholder="e.g. 107101102.4336"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  className={input({ mono: true })}
                />
              </Field>
            )}

            <Field label="Serial number" optional>
              <input
                type="text"
                placeholder="e.g. SN-892348"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Physical condition" required>
              <select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} className={input()}>
                <option value={ItemCondition.NEW}>New (አዲስ)</option>
                <option value={ItemCondition.GOOD}>Good (ጥሩ)</option>
                <option value={ItemCondition.FAIR}>Fair (መካከለኛ)</option>
                <option value={ItemCondition.NEEDS_REPAIR}>Needs repair (ጥገና የሚያስፈልገው)</option>
                <option value={ItemCondition.DAMAGED}>Damaged (የተበላሸ)</option>
              </select>
            </Field>
          </FieldGrid>

          {/* Quantity & valuation */}
          <FieldGrid cols={4}>
            <Field label="Quantity" required>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>

            <Field label="Unit of measure" required>
              <input
                type="text"
                list="uom-options"
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
                step="any"
                required
                placeholder="0.00"
                value={unitCostETB || ''}
                onChange={(e) => setUnitCostETB(parseFloat(e.target.value) || 0)}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>

            <Field label="Total (ETB)">
              <TotalValue accent="emerald">
                {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </TotalValue>
            </Field>
          </FieldGrid>

          {/* Inventory references */}
          <FieldGrid cols={4}>
            <Field label="Sub inventory" optional>
              <input
                type="text"
                placeholder="e.g. General Store"
                value={subInventory}
                onChange={(e) => setSubInventory(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Lot / batch no." optional>
              <input
                type="text"
                placeholder="e.g. BATCH-2026-09"
                value={lotBatchNo}
                onChange={(e) => setLotBatchNo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

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
          </FieldGrid>

          <Field label="Remark" optional>
            <input
              type="text"
              placeholder="Specification notes or remarks for the voucher"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className={input()}
            />
          </Field>
        </div>
      </FormSection>

      {/* ── Section 3: Delivery & attachment ── */}
      <FormSection
        step={3}
        title="Delivery & attachment"
        subtitle="ፊርማ እና ሰነድ"
        icon={Upload}
        accent="emerald"
        aside={
          <span
            className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isAttachmentRequired ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Slip {isAttachmentRequired ? 'required' : 'optional'}
          </span>
        }
      >
        <div className="space-y-3.5">
          <FieldGrid cols={2}>
            <Field label="Delivered by" optional>
              <input
                type="text"
                placeholder="e.g. Delivery driver / vendor agent"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Received by" optional>
              <input
                type="text"
                placeholder="Store custodian name"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className={input()}
              />
            </Field>
          </FieldGrid>

          <FileDropField
            label="Scanned Model 19 voucher"
            accent="emerald"
            required={isAttachmentRequired}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSlipSelected}
          />
        </div>
      </FormSection>

      <datalist id="uom-options">
        {COMMON_UOMS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Register Model 19 item'}
        onCancel={onCancel}
        onReset={isEdit ? undefined : handleReset}
      />
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
  /** Approval stage (1 or 2) of each item with a pending Stock-In request */
  pendingStages: Map<string, number>;
  /** Only the Data Encoder can correct a registration */
  canEdit: boolean;
  onEdit: (item: ItemWithRelations) => void;
  highlightItemId?: string;
}

const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  onRefresh,
  refreshing,
  onNavigate,
  onPrintModel19,
  pendingStages,
  canEdit,
  onEdit,
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
          <table className="w-full text-xs min-w-[1000px]">
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
                  onClick={() => handleSort('name')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition min-w-[180px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Name / Description</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('category')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th className="px-3 py-2.5 w-16 text-center whitespace-nowrap">
                  UOM
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
                    <span>Model 19 / IFMIS</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('createdAt')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date (G.C.)</span>
                    {renderSortIcon('createdAt')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('unitCostETB')}
                  className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Unit Cost</span>
                    {renderSortIcon('unitCostETB')}
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
                <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">
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
                        ? `${table.rowHighlight} font-medium`
                        : table.row
                    }`}
                  >
                    <td className={`px-3 py-2.5 ${table.code} whitespace-nowrap w-32`}>
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
                      {item.balance?.total ?? item.quantity ?? 1}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-700 whitespace-nowrap w-16">
                      {item.balance?.issued ?? 0}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-emerald-800 font-semibold whitespace-nowrap w-16">
                      {item.balance?.available ?? 0}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap w-36">
                      <div className="flex items-center gap-1.5">
                        <span>{item.ifmisSlipNumber || '—'}</span>
                        {item.ifmisSlipAttachmentUrl && (
                          <a
                            href={item.ifmisSlipAttachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-800 transition p-0.5 rounded hover:bg-emerald-50 inline-flex items-center"
                            title="View Scanned Voucher Attachment"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap w-28 text-[11px]">
                      {item.ifmisSlipDateGc || item.createdAtGc || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 text-right whitespace-nowrap w-28">
                      {formatETB(item.unitCostETB)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap w-28">
                      <StatusBadge
                        status={item.status}
                        stage={pendingStages.get(item.id)}
                        partlyIssued={(item.balance?.issued ?? 0) > 0 && (item.balance?.available ?? 0) > 0}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {canEdit && pendingStages.get(item.id) === 1 && (
                          <button
                            onClick={() => onEdit(item)}
                            className={btn.row}
                            title="Correct this registration (allowed until the Team Leader endorses it)"
                            aria-label={`Edit ${item.itemCode}`}
                          >
                            <Pencil className={btn.rowIcon} />
                            <span>Edit</span>
                          </button>
                        )}
                        {canEdit && pendingStages.get(item.id) === 2 && (
                          <button
                            disabled
                            className={btn.rowLocked}
                            title="Locked: the Team Leader has already endorsed this registration. To correct it, ask an approver to reject it and register it again."
                            aria-label={`Edit ${item.itemCode} (locked after Team Leader endorsement)`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          onClick={() => onPrintModel19(item)}
                          className={btn.row}
                          title="Print Official Model 19 Report"
                        >
                          <Printer className={btn.rowIcon} />
                          <span>Print M19</span>
                        </button>
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

export const StockInPage: React.FC<StockInPageProps> = ({ currentRole, onNavigate, mode = 'stock-in' }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<any | null>(null);
  // Registration being corrected (null = registering a new item)
  const [editItem, setEditItem] = useState<ItemWithRelations | null>(null);
  const [pendingStages, setPendingStages] = useState<Map<string, number>>(new Map());

  const openRegister = () => {
    setEditItem(null);
    setIsModalOpen(true);
  };
  const openEdit = (item: ItemWithRelations) => {
    setEditItem(item);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditItem(null);
  };

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
      const [locs, emps, allItems, approvals] = await Promise.all([
        api.getLocations(),
        api.getEmployees(),
        api.getItems(),
        api.getApprovals(),
      ]);
      setLocations(locs);
      setEmployees(emps);
      setItems(allItems.filter((i) => !i.parentItemId));
      // Stage 1 rows can still be corrected; Stage 2 rows are locked
      setPendingStages(
        new Map(
          approvals
            .filter((a) => a.transactionType === 'STOCK_IN' && a.status === 'PENDING')
            .map((a) => [a.itemId, a.currentStage ?? 1] as [string, number])
        )
      );
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
    setEditItem(null);

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
      quantity: it.balance?.total || Number(it.quantity) || 1,
      unitPrice: Number(it.unitCostETB) || 0,
      totalAmount: (Number(it.unitCostETB) || 0) * (it.balance?.total || Number(it.quantity) || 1),
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

  // Metric calculations strictly excluding pending items from inbound counts & valuation (see docs/reminder.md)
  const approvedInboundItems = items.filter((i) => i.status === ItemStatus.AVAILABLE);
  const totalInboundCount = approvedInboundItems.length;
  const pendingApprovalCount = items.filter(
    (i) => i.status === ItemStatus.PENDING_STOCK_IN
  ).length;
  const availableStoreCount = approvedInboundItems.length;
  const totalInboundValue = approvedInboundItems.reduce(
    (acc, i) => acc + (Number(i.unitCostETB) || 0) * (Number(i.quantity) || 1),
    0
  );

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
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
            onClick={openRegister}
            className={btn.primary}
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

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Inbound (Approved)"
          value={totalInboundCount}
          subtitle="Verified assets in store"
          icon={<Package className="w-5 h-5 text-emerald-600" />}
          valueColor="text-emerald-700"
        />
        <StatCard
          label="Pending Approval"
          value={pendingApprovalCount}
          subtitle="Awaiting Dept Head review"
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          valueColor={pendingApprovalCount > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <StatCard
          label="Available in Store"
          value={availableStoreCount}
          subtitle="Ready for issuance"
          icon={<Layers className="w-5 h-5 text-blue-600" />}
          valueColor="text-blue-700"
        />
        <StatCard
          label="Total Inbound Value"
          value={formatETB(totalInboundValue)}
          subtitle="Acquisition valuation (ETB)"
          icon={<DollarSign className="w-5 h-5 text-purple-600" />}
          valueColor="text-purple-700"
        />
      </div>

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
          </div>
        </div>
        <ItemsTable
          items={items}
          onRefresh={() => initData(true)}
          refreshing={refreshing}
          onNavigate={onNavigate}
          onPrintModel19={handlePrintItem}
          pendingStages={pendingStages}
          canEdit={currentRole === UserRole.DATA_ENCODER}
          onEdit={openEdit}
          highlightItemId={lastRegistered?.item?.id || lastRegistered?.item?.itemCode}
        />
      </div>

      {/* ── Stock-In Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editItem ? `Edit registration · ${editItem.itemCode}` : 'Register goods received · Model 19'}
        subtitle={
          editItem
            ? 'Corrections are allowed until the Team Leader endorses it. Every change is recorded in the item history and audit log.'
            : 'The item is held as pending until the Team Leader endorses and the Department Head approves it.'
        }
        accentColor="emerald"
        size="2xl"
      >
        {locations.length > 0 && employees.length > 0 ? (
          <StockInForm
            key={editItem?.id ?? 'new'}
            locations={locations}
            employees={employees}
            editItem={editItem ?? undefined}
            onCancel={closeModal}
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
