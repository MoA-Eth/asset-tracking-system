import React, { useState, useEffect } from 'react';
import { PackagePlus, FileText, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { FormSection, FieldGrid, Field, TotalValue, ReadOnlyValue, FormError, FileDropField, FormFooter, QuantityInput, inputClass } from '../ui/FormKit';
import { AssetCategory, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, Model19Voucher, Model19LineItem } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

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

export interface StockInFormProps {
  locations: Location[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: any, voucher?: Model19Voucher) => void;
  /** When set, the form corrects this registration instead of creating a new one */
  editItem?: ItemWithRelations;
  /** Inside the asset record the toolbar has Save and Cancel, so the form leaves out its own */
  hideFooter?: boolean;
  /** Tells the toolbar while a save is in progress */
  onSubmittingChange?: (submitting: boolean) => void;
}

export const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess, editItem, hideFooter, onSubmittingChange }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    onSubmittingChange?.(submitting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);
  const isEdit = !!editItem;

  // Section 1: Document Voucher Header Metadata
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState(editItem?.ifmisSlipNumber ?? '');
  const [poNumber, setPoNumber] = useState(editItem?.poNumber ?? '');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(editItem?.ifmisSlipDateGc || new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState(editItem?.transactionType || '');
  const [source, setSource] = useState(editItem?.source ?? '');
  const [buyer, setBuyer] = useState(editItem?.buyer ?? '');
  const [programName, setProgramName] = useState(editItem?.programName ?? '');
  const [storeLocationId, setStoreLocationId] = useState(editItem?.storeLocationId ?? '');
  // The store is picked first; its locations then fill the second list
  const [storeId, setStoreId] = useState(() => locations.find((l) => l.id === editItem?.storeLocationId)?.storeId ?? '');
  const stores = [...new Map(locations.map((l) => [l.storeId, l.storeName])).entries()];
  const storeLocations = locations.filter((l) => l.storeId === storeId);
  const chooseStore = (id: string) => {
    setStoreId(id);
    const inStore = locations.filter((l) => l.storeId === id);
    // A store with a single location needs no second choice
    setStoreLocationId(inStore.length === 1 ? inStore[0].id : '');
  };

  // Section 2: Single-Item Particulars
  const [name, setName] = useState(editItem?.name ?? '');
  const [category, setCategory] = useState<AssetCategory | ''>(editItem?.category ?? '');
  const [itemCode, setItemCode] = useState(editItem?.itemCode ?? '');
  const [uom, setUom] = useState(editItem?.uom || 'EA');
  const [subInventory, setSubInventory] = useState(editItem?.subInventory ?? '');
  const [lotBatchNo, setLotBatchNo] = useState(editItem?.lotBatchNo ?? '');
  const [serialNumber, setSerialNumber] = useState(editItem?.serialNumber ?? '');
  const [printedPadFrom, setPrintedPadFrom] = useState(editItem?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState(editItem?.printedPadTo ?? '');
  const [quantity, setQuantity] = useState<number>(Number(editItem?.quantity) || 1);
  const [unitCostETB, setUnitCostETB] = useState<number>(editItem?.unitCostETB ?? 0);
  const [condition, setCondition] = useState<ItemCondition | ''>(editItem?.condition ?? '');
  const [remark, setRemark] = useState(editItem?.remark ?? '');

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState(editItem?.deliveredBy ?? '');
  // Left empty: the person who signs for the delivery isn't necessarily the one entering it
  const [receivedBy, setReceivedBy] = useState(editItem?.receivedBy ?? '');
  // In edit mode the current slip is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState(
    editItem?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editItem.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const policy = useSystemSettings().slipAttachmentPolicy;
  const isAttachmentRequired = policy === 'REQUIRED';

  const totalAmount = (Number(quantity) || 0) * (Number(unitCostETB) || 0);

  // Required fields still empty; the receipt can only be submitted once this is empty
  const missingFields = [
    !ifmisSlipNumber.trim() && 'Model 19 No.',
    !ifmisSlipDateGc && 'received date',
    !transactionType && 'transaction type',
    !source.trim() && 'source',
    !storeId && 'receiving store',
    storeId && !storeLocationId && 'location in store',
    !name.trim() && 'item description',
    !category && 'category',
    !condition && 'physical condition',
    !(quantity >= 1) && 'quantity',
    !uom.trim() && 'unit of measure',
    !(unitCostETB > 0) && 'unit price',
    isAttachmentRequired && !attachmentFileName && 'scanned slip',
  ].filter(Boolean) as string[];

  const handleReset = () => {
    setIfmisSlipNumber('');
    setPoNumber('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setTransactionType('');
    setSource('');
    setBuyer('');
    setStoreLocationId('');
    setStoreId('');
    setName('');
    setCategory('');
    setItemCode('');
    setUom('EA');
    setSubInventory('');
    setLotBatchNo('');
    setSerialNumber('');
    setPrintedPadFrom('');
    setPrintedPadTo('');
    setQuantity(1);
    setUnitCostETB(0);
    setCondition('');
    setRemark('');
    setDeliveredBy('');
    setReceivedBy('');
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

    const unchosen = [
      !transactionType && 'transaction type',
      !storeLocationId && (storeId ? 'location in the store' : 'receiving store'),
      !category && 'category',
      !condition && 'physical condition',
    ].filter(Boolean);
    if (unchosen.length > 0) {
      const msg = `Please select the ${unchosen.join(', ')}.`;
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }

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

    if (!uom.trim()) {
      const msg = 'Unit of measure is required, e.g. EA, KG or BOX.';
      setFormError(msg);
      toast.warning('Unit Required', msg);
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
    const registeredById = user?.id || '';

    if (editItem) {
      try {
        const selectedCat = COMMON_CATEGORIES.find((c) => c.value === category);
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        const res = await api.updateStockIn(editItem.id, {
          name: name.trim(),
          category: category as AssetCategory,
          serialNumber: serialNumber.trim() || undefined,
          unitCostETB: Number(unitCostETB) || 0,
          condition: condition as ItemCondition,
          storeLocationId,
          ifmisSlipNumber: slipNo,
          ifmisSlipDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          poNumber: poNumber.trim() || undefined,
          transactionType,
          source: source.trim() || undefined,
          buyer: buyer.trim() || undefined,
          programName: programName.trim() || undefined,
          uom: uom.trim(),
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
        toast.success('Receipt updated', `${editItem.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res);
      } catch (err: any) {
        const errMsg = err.message || 'Server error';
        setFormError(`Update failed: ${errMsg}`);
        toast.error("Receipt couldn't be updated", errMsg);
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
        category: category as AssetCategory,
        serialNumber: serialNumber.trim() || undefined,
        unitCostETB: Number(unitCostETB) || 0,
        condition: condition as ItemCondition,
        uom: uom.trim(),
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
        category: category as AssetCategory,
        serialNumber: serialNumber.trim() || '',
        unitCostETB: Number(unitCostETB) || 0,
        condition: condition as ItemCondition,
        storeLocationId,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
        isHistoricalData: false,
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
        uom: uom.trim(),
        subInventory: subInventory.trim() || targetStore?.name || '',
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
        approvalState: 'PENDING',
        invModel19No: slipNo,
        poNumber: poNumber.trim() || '—',
        receivedDateGc: ifmisSlipDateGc,
        receivedDateEc: formatGcToEc(ifmisSlipDateGc),
        transactionType: transactionType || '—',
        source: source.trim() || '—',
        buyer: buyer.trim() || '—',
        programName: programName.trim(),
        storeLocationId,
        storeLocationName: targetStore?.siteName,
        deliveredByName: deliveredBy.trim(),
        receivedByName: receivedBy.trim(),
        printedBy: user?.fullNameEn,
        items: voucherItems,
        grandTotal: totalAmount,
      };

      toast.success(
        'Receipt registered',
        `Item "${name.trim()}" (Model 19 #${slipNo}, Total ${formatETB(totalAmount)}) registered and submitted for Team Leader verification.`
      );

      onSuccess(res, generatedVoucher);
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`The receipt could not be saved: ${errMsg}`);
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
          <Field label="Model 19 No." required htmlFor="stock-in-model19">
            <input
              id="stock-in-model19"
              type="text"
              required
              placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              className={`${input({ mono: true })} font-semibold`}
            />
          </Field>

          <Field label="PO number" optional htmlFor="stock-in-po">
            <input
              id="stock-in-po"
              type="text"
              placeholder="e.g. 186"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className={input({ mono: true })}
            />
          </Field>

          <Field label="Received date (G.C.)" required hint={`${formatGcToEc(ifmisSlipDateGc)} E.C.`} htmlFor="stock-in-slip-date">
            <input
              id="stock-in-slip-date"
              type="date"
              required
              value={ifmisSlipDateGc}
              onChange={(e) => setIfmisSlipDateGc(e.target.value)}
              className={input()}
            />
          </Field>

          <Field label="Transaction type" required htmlFor="stock-in-transaction-type">
            <select id="stock-in-transaction-type" required value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
              <option value="" disabled>Select…</option>
              <option value="PO Receipt">PO Receipt</option>
              <option value="Direct Delivery">Direct Delivery</option>
              <option value="Donation / Grant Receipt">Donation / Grant Receipt</option>
              <option value="Transfer Receipt">Transfer Receipt</option>
              <option value="Internal Production">Internal Production</option>
            </select>
          </Field>

          <Field label="Source (supplier / vendor)" required htmlFor="stock-in-source">
            <input
              id="stock-in-source"
              type="text"
              required
              placeholder="Supplier or vendor name"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={input()}
            />
          </Field>

          <Field label="Buyer / procurement officer" optional>
            <input
              type="text"
              placeholder="Name of the buyer or procurement officer"
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
              placeholder="Program or project the goods were bought for"
              className={input()}
            />
          </Field>

          <Field label="Receiving store" required htmlFor="stock-in-store">
            <select id="stock-in-store" required value={storeId} onChange={(e) => chooseStore(e.target.value)} className={input()}>
              <option value="" disabled>Select…</option>
              {stores.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location in store" required htmlFor="stock-in-location" hint={storeId ? undefined : 'Choose the store first.'}>
            <select
              id="stock-in-location"
              required
              disabled={!storeId}
              value={storeLocationId}
              onChange={(e) => setStoreLocationId(e.target.value)}
              className={input()}
            >
              <option value="" disabled>Select…</option>
              {storeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
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
            <Field label="Item description" required span="sm:col-span-2" htmlFor="stock-in-item-name">
              <input
                id="stock-in-item-name"
                type="text"
                required
                placeholder="e.g. Dell Latitude 5440 Laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Category" required htmlFor="stock-in-category">
              <select id="stock-in-category" required value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)} className={input()}>
                <option value="" disabled>Select…</option>
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
              <Field label="Item code" optional hint="Leave blank to generate one automatically" htmlFor="stock-in-item-code">
                <input
                  id="stock-in-item-code"
                  type="text"
                  placeholder="e.g. 107101102.4336"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  className={input({ mono: true })}
                />
              </Field>
            )}

            <Field label="Serial number" optional htmlFor="stock-in-serial">
              <input
                id="stock-in-serial"
                type="text"
                placeholder="e.g. SN-892348"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Physical condition" required htmlFor="stock-in-condition">
              <select id="stock-in-condition" required value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} className={input()}>
                <option value="" disabled>Select…</option>
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
              <QuantityInput min={1} required value={quantity} onChange={setQuantity} />
            </Field>

            <Field label="Unit of measure" required htmlFor="stock-in-uom">
              <input
                id="stock-in-uom"
                type="text"
                list="uom-options"
                required
                value={uom}
                onChange={(e) => setUom(e.target.value.toUpperCase())}
                className={`${input({ mono: true })} uppercase`}
                placeholder="EA, KG, BOX…"
              />
            </Field>

            <Field label="Unit price (ETB)" required htmlFor="stock-in-unit-cost">
              <input
                id="stock-in-unit-cost"
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
                placeholder={locations.find((l) => l.id === storeLocationId)?.name || 'Defaults to the location in store'}
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

            <Field label="Received by" optional htmlFor="stock-in-received-by">
              <input
                id="stock-in-received-by"
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

      {!hideFooter && (
        <FormFooter
          accent="emerald"
          submitting={submitting}
          submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
          // Submit stays off until every required field is filled
          submitDisabled={missingFields.length > 0}
          note={missingFields.length > 0 ? 'Fill in all required fields (*) to submit' : undefined}
          onCancel={onCancel}
          onReset={isEdit ? undefined : handleReset}
        />
      )}
    </form>
  );
};

/**
 * Model 19 voucher for a registration. Records received on the same slip print together;
 * units issued off a registration print under their registration.
 */
export const buildModel19Voucher = (record: ItemWithRelations, allItems: ItemWithRelations[], printedBy?: string): Model19Voucher => {
  const item = (record.parentItemId && allItems.find((i) => i.id === record.parentItemId)) || record;
  const registrations = allItems.filter((i) => !i.parentItemId);
  const siblingItems = registrations.filter((i) => i.ifmisSlipNumber && i.ifmisSlipNumber === item.ifmisSlipNumber);
  const targetItems = siblingItems.length > 0 ? siblingItems : [item];

  const voucherItems: Model19LineItem[] = targetItems.map((it, idx) => ({
    id: it.id,
    sNo: idx + 1,
    itemCode: it.itemCode,
    itemDescription: it.name,
    uom: it.uom || 'EA',
    subInventory: it.subInventory || item.storeLocation?.roomNumber || '—',
    itemCategory: it.itemCategoryDisplay || it.category.replace(/_/g, ' '),
    lotBatchNo: it.lotBatchNo || '',
    serialNo: it.serialNumber || '',
    printedPadFrom: it.printedPadFrom || '',
    printedPadTo: it.printedPadTo || '',
    quantity: it.balance?.total || Number(it.quantity) || 1,
    unitPrice: Number(it.unitCostETB) || 0,
    totalAmount: (Number(it.unitCostETB) || 0) * (it.balance?.total || Number(it.quantity) || 1),
    // Notes hold the saved form data for newer items: only plain-text notes belong on the slip
    remark: it.remark || (it.notes && !it.notes.trim().startsWith('{') ? it.notes : ''),
  }));

  return {
    approvalState: item.status === ItemStatus.PENDING_STOCK_IN ? 'PENDING' : item.status === ItemStatus.DISPOSED ? 'REJECTED' : undefined,
    invModel19No: item.ifmisSlipNumber,
    poNumber: item.poNumber || '—',
    receivedDateGc: item.ifmisSlipDateGc,
    receivedDateEc: item.ifmisSlipDateEc || formatGcToEc(item.ifmisSlipDateGc),
    transactionType: item.transactionType || '—',
    source: item.source || '—',
    buyer: item.buyer || '—',
    programName: item.programName || '',
    storeLocationId: item.storeLocationId,
    storeLocationName: item.storeLocation?.siteName,
    deliveredByName: item.deliveredBy,
    receivedByName: item.receivedBy,
    printedBy,
    items: voucherItems,
    grandTotal: voucherItems.reduce((acc, curr) => acc + curr.totalAmount, 0),
  };
};
