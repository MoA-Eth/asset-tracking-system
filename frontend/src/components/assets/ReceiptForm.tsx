import React, { useState, useEffect, useRef } from 'react';
import { PackagePlus, FileText, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FormSection, FieldGrid, Field, TotalValue, ReadOnlyValue, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { AssetCategory, ItemType, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, Model19Voucher, Model19LineItem } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { useSystemSettings } from '../../utils/system-settings';
import { ITEM_TYPE_OPTIONS } from './asset-state';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { readPdfRows, rowsToText, isModel21, parseModel21, isModel19, parseModel19, PdfRow, Model19SlipFields } from '../../utils/slip-reader';
import { ocrRows, isImageFile } from '../../utils/slip-ocr';
import { TRANSACTION_TYPES, CATEGORY_FROM_IFMIS, COMMON_UOMS, COMMON_CATEGORIES } from './receipt-options';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

// ─── Stock-In Form (Flat Single-Item Format) ────────────────────────────────

export interface StockInFormProps {
  locations: Location[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: any, voucher?: Model19Voucher) => void;
  /** When set, the form corrects this registration instead of creating a new one */
  editItem?: ItemWithRelations;
  /** A new receipt that starts from an earlier item or slip rather than empty */
  template?: ReceiptTemplate;
  /** A slip chosen before the form opened: it is attached and read as if picked in the form */
  initialSlip?: File;
}

/** What a new receipt can start from instead of empty: an earlier item ("Duplicate as new receipt") */
export interface ReceiptTemplate {
  transactionType?: string;
  source?: string;
  buyer?: string;
  programName?: string;
  storeLocationId?: string;
  name?: string;
  category?: AssetCategory;
  itemType?: ItemType;
  uom?: string;
  condition?: ItemCondition;
  unitCostETB?: number;
}

/** What a duplicate keeps from an item: what it is and where it comes from, never its number, serial, quantity or slip */
export const templateFromItem = (item: ItemWithRelations): ReceiptTemplate => ({
  transactionType: item.transactionType,
  source: item.source,
  buyer: item.buyer,
  programName: item.programName,
  storeLocationId: item.storeLocationId,
  name: item.name,
  category: item.category,
  itemType: item.itemType ?? ItemType.FIXED,
  uom: item.uom,
  condition: item.condition,
  unitCostETB: item.unitCostETB,
});

export const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess, editItem, template, initialSlip }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editItem;
  // A new receipt starts from the last one this person made: the same store, transaction type and the number to continue from
  const memory = isEdit ? {} : recallForm(user?.id, 'receipt');
  const start = isEdit ? undefined : template;
  const rememberedLocation = locations.find((l) => l.id === (start?.storeLocationId ?? memory.storeLocationId));

  // Section 1: Document Voucher Header Metadata
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState(editItem?.ifmisSlipNumber ?? '');
  const [poNumber, setPoNumber] = useState(editItem?.poNumber ?? '');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(editItem?.ifmisSlipDateGc || new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState(editItem?.transactionType || start?.transactionType || memory.transactionType || '');
  const [source, setSource] = useState(editItem?.source ?? start?.source ?? '');
  const [buyer, setBuyer] = useState(editItem?.buyer ?? start?.buyer ?? '');
  const [programName, setProgramName] = useState(editItem?.programName ?? start?.programName ?? '');
  const [storeLocationId, setStoreLocationId] = useState(editItem?.storeLocationId ?? rememberedLocation?.id ?? '');
  // The store is picked first; its locations then fill the second list
  const [storeId, setStoreId] = useState(() => locations.find((l) => l.id === editItem?.storeLocationId)?.storeId ?? rememberedLocation?.storeId ?? '');
  const stores = [...new Map(locations.map((l) => [l.storeId, l.storeName])).entries()];
  const storeLocations = locations.filter((l) => l.storeId === storeId);
  const chooseStore = (id: string) => {
    setStoreId(id);
    const inStore = locations.filter((l) => l.storeId === id);
    // A store with a single location needs no second choice
    setStoreLocationId(inStore.length === 1 ? inStore[0].id : '');
  };

  // Section 2: Single-Item Particulars
  const [name, setName] = useState(editItem?.name ?? start?.name ?? '');
  const [category, setCategory] = useState<AssetCategory | ''>(editItem?.category ?? start?.category ?? '');
  // Fixed asset or consumable: chosen on every receipt and kept with the item
  const [itemType, setItemType] = useState<ItemType | ''>(editItem?.itemType ?? (editItem ? ItemType.FIXED : start?.itemType ?? ''));
  const [itemCode, setItemCode] = useState(editItem?.itemCode ?? '');
  const [uom, setUom] = useState(editItem?.uom || start?.uom || 'EA');
  const [subInventory, setSubInventory] = useState(editItem?.subInventory ?? '');
  const [lotBatchNo, setLotBatchNo] = useState(editItem?.lotBatchNo ?? '');
  const [serialNumber, setSerialNumber] = useState(editItem?.serialNumber ?? '');
  const [printedPadFrom, setPrintedPadFrom] = useState(editItem?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState(editItem?.printedPadTo ?? '');
  // A new receipt starts empty (the field shows 0), so the number is always typed on purpose
  const [quantity, setQuantity] = useState<number>(editItem ? Number(editItem.quantity) || 1 : 0);
  const [unitCostETB, setUnitCostETB] = useState<number>(editItem?.unitCostETB ?? start?.unitCostETB ?? 0);
  const [condition, setCondition] = useState<ItemCondition | ''>(editItem?.condition ?? start?.condition ?? '');
  const [remark, setRemark] = useState(editItem?.remark ?? '');

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState(editItem?.deliveredBy ?? '');
  // Left empty: the person who signs for the delivery isn't necessarily the one entering it
  const [receivedBy, setReceivedBy] = useState(editItem?.receivedBy ?? '');
  // Who received the goods: a store man of the receiving store (a correction keeps the name it has until another is chosen)
  const [receivedById, setReceivedById] = useState('');
  const keepers = useStoreKeepers();
  const storeMen = keepers.ofStore(storeId);
  const receiverId = receivedById || (storeMen.length === 1 ? storeMen[0].employeeId : '');
  const receiverName = storeMen.find((k) => k.employeeId === receiverId)?.fullNameEn ?? receivedBy;
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
    !isEdit && storeMen.length > 1 && !receiverId && 'received by (store man)',
    storeId && !storeLocationId && 'location in store',
    !name.trim() && 'item description',
    !category && 'category',
    !itemType && 'item type',
    !condition && 'physical condition',
    !(quantity >= 1) && 'quantity',
    !uom.trim() && 'unit of measure',
    !(unitCostETB > 0) && 'unit price',
    isAttachmentRequired && !attachmentFileName && 'scanned slip',
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    model19No: !ifmisSlipNumber.trim() && 'Enter the number printed on the Model 19 slip.',
    transactionType: !transactionType && 'Choose the transaction type.',
    source: !source.trim() && 'Enter the supplier or vendor.',
    itemName: !name.trim() && 'Describe the item received.',
    category: !category && 'Choose the category.',
    itemType: !itemType && 'Choose fixed asset or consumable.',
    condition: !condition && 'Choose the physical condition.',
    uom: !uom.trim() && 'Enter the unit of measure, e.g. EA or KG.',
    unitCost: !(unitCostETB > 0) && 'Enter the unit price.',
  });

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
    setItemType('');
    setItemCode('');
    setUom('EA');
    setSubInventory('');
    setLotBatchNo('');
    setSerialNumber('');
    setPrintedPadFrom('');
    setPrintedPadTo('');
    setQuantity(0);
    setUnitCostETB(0);
    setCondition('');
    setRemark('');
    setDeliveredBy('');
    setReceivedBy('');
    setReceivedById('');
    setAttachmentFileName('');
    setAttachmentFile(null);
    setFormError(null);
  };

  // What reading the attached slip found, shown under it
  const [slipNote, setSlipNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  // Whether the slip being read is a scan (read with OCR), which can be misread
  const fromScan = useRef(false);
  const filledNote = (filled: string[], more: string) =>
    setSlipNote({
      tone: 'info',
      text: fromScan.current
        ? `Filled in from the scan: ${filled.join(', ')}. A scan can be misread, so check each one against the paper before submitting.${more}`
        : `Filled in from the slip: ${filled.join(', ')}. Check them against the paper before submitting.${more}`,
    });

  /**
   * An IFMIS PDF fills in what is still empty: the voucher number, date, transaction type, source and the item.
   * Only what the person has not typed is filled, and they check it against the paper before submitting.
   */
  /** A Model 19 from IFMIS: the header and the first item line, into the fields still empty */
  const fillFromModel19 = (slip: Model19SlipFields) => {
    const filled: string[] = [];
    // From a downloaded PDF the first line is exact. From a scan, only a line that holds together is used:
    // a real unit of measure, a quantity and a price whose product is the line total. Otherwise it may be misread.
    const holdsTogether = (l: Model19SlipFields['lines'][number]) =>
      !!l.description &&
      !!l.uom && COMMON_UOMS.includes(l.uom.toUpperCase()) &&
      !!l.quantity && !!l.unitPrice && !!l.totalAmount &&
      Math.abs(l.quantity * l.unitPrice - l.totalAmount) <= Math.max(1, l.totalAmount * 0.01);
    const line = fromScan.current ? slip.lines.find(holdsTogether) : slip.lines[0];
    const itemsUnreadable = fromScan.current && slip.lines.length > 0 && !line;
    const today = new Date().toISOString().split('T')[0];
    if (slip.model19No && !ifmisSlipNumber.trim()) {
      setIfmisSlipNumber(slip.model19No);
      filled.push('Model 19 No.');
    }
    if (slip.poNumber && !poNumber.trim()) {
      setPoNumber(slip.poNumber);
      filled.push('PO number');
    }
    if (slip.receivedDate && (!ifmisSlipDateGc || ifmisSlipDateGc === today)) {
      setIfmisSlipDateGc(slip.receivedDate);
      filled.push('received date');
    }
    const type = TRANSACTION_TYPES.find((t) => t.toLowerCase() === slip.transactionType?.toLowerCase());
    if (type && !transactionType) {
      setTransactionType(type);
      filled.push('transaction type');
    }
    if (slip.source && !source.trim()) {
      setSource(slip.source);
      filled.push('source');
    }
    if (slip.buyer && !buyer.trim()) {
      setBuyer(slip.buyer);
      filled.push('buyer');
    }
    if (slip.programName && !programName.trim()) {
      setProgramName(slip.programName);
      filled.push('program');
    }
    if (line) {
      if (line.description && !name.trim()) {
        setName(line.description);
        filled.push('item description');
      }
      const mapped = CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(line.category ?? ''))?.[1];
      if (mapped && !category) {
        setCategory(mapped);
        filled.push('category');
      }
      if (line.uom && (!uom.trim() || uom === 'EA') && line.uom.toUpperCase() !== uom) {
        setUom(line.uom.toUpperCase());
        filled.push('unit of measure');
      }
      if (line.quantity && !quantity) {
        setQuantity(line.quantity);
        filled.push('quantity');
      }
      if (line.unitPrice && !unitCostETB) {
        setUnitCostETB(line.unitPrice);
        filled.push('unit price');
      }
      // The IFMIS item code is the inventory code, shared by every delivery of that item, so it can't be the item code here
      if (line.itemCode && !remark.trim()) {
        setRemark(`IFMIS item code ${line.itemCode}`);
        filled.push('remark (IFMIS item code)');
      }
    }
    if (filled.length === 0) {
      setSlipNote({ tone: 'info', text: 'The slip was read, but every field it covers is already filled in.' });
      return;
    }
    const more = itemsUnreadable
      ? ' The item lines on this scan could not be read reliably, so fill in the item yourself.'
      : slip.lines.length > 1
        ? ` This slip lists ${slip.lines.length} items; ${line === slip.lines[0] ? 'the first one' : 'one that could be read'} was filled in. Register each of the others as its own receipt with the same Model 19 No.`
        : '';
    filledNote(filled, more);
  };

  const fillFromSlip = (rows: PdfRow[]) => {
    const text = rowsToText(rows);
    if (!text.trim()) {
      setSlipNote({ tone: 'warn', text: 'Nothing could be read from this slip. It is attached; fill in the fields as usual.' });
      return;
    }
    if (isModel19(text)) {
      fillFromModel19(parseModel19(rows));
      return;
    }
    if (!isModel21(text)) {
      setSlipNote({
        tone: 'warn',
        text: fromScan.current
          ? "The scan was read, but it doesn't look like an IFMIS Model 19 or transfer form. Fill in the fields as usual."
          : "This isn't an IFMIS form the app can read yet. Fill in the fields as usual.",
      });
      return;
    }
    const slip = parseModel21(text);
    const line = slip.lines[0];
    const filled: string[] = [];
    const today = new Date().toISOString().split('T')[0];
    if (slip.model21No && !ifmisSlipNumber.trim()) {
      setIfmisSlipNumber(slip.model21No);
      filled.push('voucher number');
    }
    if (line?.date && (!ifmisSlipDateGc || ifmisSlipDateGc === today)) {
      setIfmisSlipDateGc(line.date);
      filled.push('date');
    }
    if (!transactionType) {
      setTransactionType('Transfer Receipt');
      filled.push('transaction type');
    }
    const from = slip.fromLocation || slip.fromName;
    if (from && !source.trim()) {
      setSource(from);
      filled.push('source');
    }
    if (line) {
      if (line.description && !name.trim()) {
        setName(line.description);
        filled.push('item description');
      }
      if (line.tagNumber && !isEdit && !itemCode.trim()) {
        setItemCode(line.tagNumber);
        filled.push('item code (tag number)');
      }
      if (line.unit && !quantity) {
        setQuantity(line.unit);
        filled.push('quantity');
      }
      if (line.origCost && !unitCostETB) {
        setUnitCostETB(Math.round((line.origCost / (line.unit || 1)) * 100) / 100);
        filled.push('unit price');
      }
    }
    // It is the Fixed Asset form, so what it lists are fixed assets
    if (!itemType) {
      setItemType(ItemType.FIXED);
      filled.push('item type');
    }
    if (filled.length === 0) {
      setSlipNote({ tone: 'info', text: 'The slip was read, but every field it covers is already filled in.' });
      return;
    }
    const more = slip.lines.length > 1 ? ` This slip lists ${slip.lines.length} assets; the first one was filled in. Register each of the others as its own receipt.` : '';
    filledNote(filled, more);
  };

  // A slip chosen from the Assets page menu, read once when the form opens
  useEffect(() => {
    if (initialSlip) takeSlip(initialSlip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSlipSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) takeSlip(file);
  };

  const takeSlip = (file: File) => {
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid Slip File', error);
      return;
    }
    setFormError(null);
    setAttachmentFile(file);
    setAttachmentFileName(file.name);
    setSlipNote(null);
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (pdf || isImageFile(file)) {
      setSlipNote({ tone: 'info', text: 'Reading the slip…' });
      (async () => {
        fromScan.current = false;
        let rows = pdf ? await readPdfRows(file) : [];
        // No text inside: a scan or a photo, read with OCR
        if (!rowsToText(rows).trim()) {
          fromScan.current = true;
          setSlipNote({ tone: 'info', text: 'Reading the scan… this takes a few seconds.' });
          rows = await ocrRows(file);
        }
        fillFromSlip(rows);
      })().catch(() => setSlipNote({ tone: 'warn', text: "The slip couldn't be read. It is attached; fill in the fields as usual." }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const unchosen = [
      !transactionType && 'transaction type',
      !storeLocationId && (storeId ? 'location in the store' : 'receiving store'),
      !category && 'category',
      !itemType && 'item type',
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
          itemType: itemType as ItemType,
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
          receivedByEmployeeId: receivedById || undefined,
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
        itemType: itemType as ItemType,
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
        itemType: itemType as ItemType,
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
        receivedByEmployeeId: receiverId || undefined,
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
        itemType: itemType as ItemType,
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
        receivedByName: receiverName,
        printedBy: user?.fullNameEn,
        items: voucherItems,
        grandTotal: totalAmount,
      };

      toast.success(
        'Receipt registered',
        `Item "${name.trim()}" (Model 19 #${slipNo}, Total ${formatETB(totalAmount)}) registered and submitted for Team Leader verification.`
      );

      rememberForm(user?.id, 'receipt', { transactionType, storeLocationId });
      onSuccess(res, generatedVoucher);
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`The receipt could not be saved: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-4">
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
          <Field
            label="Model 19 No."
            required
            htmlFor="stock-in-model19"
            error={fieldErrors.error('model19No')}
          >
            <input
              id="stock-in-model19"
              type="text"
              required
              placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              onBlur={fieldErrors.touch('model19No')}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model19No') })} font-semibold`}
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

          <Field label="Transaction type" required htmlFor="stock-in-transaction-type" error={fieldErrors.error('transactionType')}>
            <select id="stock-in-transaction-type" required value={transactionType} onChange={(e) => setTransactionType(e.target.value)} onBlur={fieldErrors.touch('transactionType')} className={input({ invalid: !!fieldErrors.error('transactionType') })}>
              <option value="" disabled>Select…</option>
              <option value="PO Receipt">PO Receipt</option>
              <option value="Direct Delivery">Direct Delivery</option>
              <option value="Donation / Grant Receipt">Donation / Grant Receipt</option>
              <option value="Transfer Receipt">Transfer Receipt</option>
              <option value="Internal Production">Internal Production</option>
            </select>
          </Field>

          <Field label="Source (supplier / vendor)" required htmlFor="stock-in-source" error={fieldErrors.error('source')}>
            <input
              id="stock-in-source"
              type="text"
              required
              placeholder="Supplier or vendor name"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onBlur={fieldErrors.touch('source')}
              className={input({ invalid: !!fieldErrors.error('source') })}
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
            <Field label="Item description" required span="sm:col-span-2" htmlFor="stock-in-item-name" error={fieldErrors.error('itemName')}>
              <input
                id="stock-in-item-name"
                type="text"
                required
                placeholder="e.g. Dell Latitude 5440 Laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={fieldErrors.touch('itemName')}
                className={input({ invalid: !!fieldErrors.error('itemName') })}
              />
            </Field>

            <Field label="Category" required htmlFor="stock-in-category" error={fieldErrors.error('category')}>
              <select id="stock-in-category" required value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)} onBlur={fieldErrors.touch('category')} className={input({ invalid: !!fieldErrors.error('category') })}>
                <option value="" disabled>Select…</option>
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Item type" required htmlFor="stock-in-item-type" error={fieldErrors.error('itemType')} hint="ቋሚ ዕቃ (fixed) or አላቂ ዕቃ (consumable). It can't be changed once approved.">
              <select id="stock-in-item-type" required value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)} onBlur={fieldErrors.touch('itemType')} className={input({ invalid: !!fieldErrors.error('itemType') })}>
                <option value="" disabled>Select…</option>
                {ITEM_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} · {t.amharic}
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

            <Field label="Physical condition" required htmlFor="stock-in-condition" error={fieldErrors.error('condition')}>
              <select id="stock-in-condition" required value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} onBlur={fieldErrors.touch('condition')} className={input({ invalid: !!fieldErrors.error('condition') })}>
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
            <Field label="Quantity" required htmlFor="receipt-quantity">
              <QuantityInput id="receipt-quantity" min={1} required value={quantity} onChange={setQuantity} />
            </Field>

            <Field label="Unit of measure" required htmlFor="stock-in-uom" error={fieldErrors.error('uom')}>
              <input
                id="stock-in-uom"
                type="text"
                list="uom-options"
                required
                value={uom}
                onChange={(e) => setUom(e.target.value.toUpperCase())}
                onBlur={fieldErrors.touch('uom')}
                className={`${input({ mono: true, invalid: !!fieldErrors.error('uom') })} uppercase`}
                placeholder="EA, KG, BOX…"
              />
            </Field>

            <Field label="Unit price (ETB)" required htmlFor="stock-in-unit-cost" error={fieldErrors.error('unitCost')}>
              <MoneyInput
                id="stock-in-unit-cost"
                value={unitCostETB}
                onChange={setUnitCostETB}
                onBlur={fieldErrors.touch('unitCost')}
                invalid={!!fieldErrors.error('unitCost')}
              />
            </Field>

            <Field label="Total (ETB)">
              <TotalValue accent="emerald">
                {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </TotalValue>
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

            <StoreManField
              id="stock-in-received-by"
              label="Received by (store man)"
              keepers={storeMen}
              ready={keepers.ready}
              storeName={keepers.storeName(storeId)}
              hasStore={!!storeId}
              value={receivedById}
              onChange={setReceivedById}
              current={isEdit ? receivedBy || undefined : undefined}
              required={!isEdit}
            />
          </FieldGrid>

          <FileDropField
            label="Scanned Model 19 voucher"
            accent="emerald"
            required={isAttachmentRequired}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSlipSelected}
            hint="PDF, PNG, JPEG or WEBP · up to 10 MB. An IFMIS PDF fills in the form for you."
          />
          {slipNote && (
            <FormNotice icon={FileText} tone={slipNote.tone}>
              <span role="status">{slipNote.text}</span>
            </FormNotice>
          )}
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
        submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
        // Submit stays off until every required field is filled
        missingFields={missingFields}
        onCancel={onCancel}
        onReset={isEdit ? undefined : handleReset}
      />
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
    itemType: it.itemType,
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
    approvalState: item.status === ItemStatus.PENDING_STOCK_IN ? 'PENDING' : item.status === ItemStatus.REJECTED ? 'REJECTED' : undefined,
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
