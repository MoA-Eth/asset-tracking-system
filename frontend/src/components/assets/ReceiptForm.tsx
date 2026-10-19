import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
import React, { useState, useEffect, useRef } from 'react';
import { FileText, Info } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FieldGrid, Field, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { AssetCategory, ProvisionType, ItemType, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, Model19Voucher, Model19LineItem, TransactionApproval } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { useSystemSettings } from '../../utils/system-settings';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { validateSlipFile, SLIP_PDF_ACCEPT_ATTR, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { readPdfPages, rowsToText, isModel21, isModel22, isModel19, isDisposalForm, parseModel19, PdfRow, Model19SlipFields } from '../../utils/slip-reader';
import { TRANSACTION_TYPES, CATEGORY_FROM_IFMIS, COMMON_UOMS, COMMON_CATEGORIES, ITEM_CODE_RULE, itemTypeFromIfmisCode, provisionFromSlip } from './receipt-options';
import { ReceiptItems, SlipLine, ItemTypeTag, lineMissing, blankLine, cellClass, money } from './SlipLines';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Part, SlipPreview } from './FormParts';

/** IFMIS slips are a page or two; a longer one is read this far and the rest flagged */
const MAX_SLIP_PAGES = 30;

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
  /** A slip chosen with the form's header button: it is attached and read as if picked in the form */
  initialSlip?: File;
  /** Receipt lines already registered, to warn when a Model 19 line is received a second time */
  registered?: { slipNumber?: string; name: string; itemCode: string }[];
}

/** What a new receipt can start from instead of empty: an earlier item ("Duplicate as new receipt") */
export interface ReceiptTemplate {
  provisionType?: ProvisionType;
  ifmisItemCode?: string;
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
  provisionType: item.provisionType,
  ifmisItemCode: item.ifmisItemCode,
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

export const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess, editItem, template, initialSlip, registered }) => {
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
  // PO number is optional: purchases and receipts display pricing and item columns without requiring a PO number.
  // A receipt is recorded as a donation only if explicitly selected as 'Donation / Grant Receipt' or existing donation.
  const isDonationTransaction = transactionType === 'Donation / Grant Receipt';
  const provisionType: ProvisionType = editItem?.provisionType === 'DONATION' || isDonationTransaction ? 'DONATION' : 'PURCHASE';
  const donation = provisionType === 'DONATION';
  const [source, setSource] = useState(editItem?.source ?? start?.source ?? '');
  const [buyer, setBuyer] = useState(editItem?.buyer ?? start?.buyer ?? '');
  const [programName, setProgramName] = useState(editItem?.programName ?? start?.programName ?? '');
  const [storeLocationId, setStoreLocationId] = useState(editItem?.storeLocationId ?? rememberedLocation?.id ?? '');
  // Only the store is chosen; the goods are recorded at its first location (a correction keeps the one it has)
  const [storeId, setStoreId] = useState(() => locations.find((l) => l.id === editItem?.storeLocationId)?.storeId ?? rememberedLocation?.storeId ?? '');
  const stores = [...new Map(locations.map((l) => [l.storeId, l.storeName])).entries()];
  const chooseStore = (id: string) => {
    setStoreId(id);
    const kept = locations.find((l) => l.id === editItem?.storeLocationId && l.storeId === id);
    setStoreLocationId((kept ?? locations.find((l) => l.storeId === id))?.id ?? '');
  };

  // Section 2: Single-Item Particulars
  const [name, setName] = useState(editItem?.name ?? start?.name ?? '');
  const [category, setCategory] = useState<AssetCategory | ''>(editItem?.category ?? start?.category ?? '');
  // Fixed asset or consumable: chosen on every receipt and kept with the item
  const [itemType, setItemType] = useState<ItemType | ''>(editItem?.itemType ?? (editItem ? ItemType.FIXED : start?.itemType ?? ''));
  // The record code the system gave the item, shown when correcting it; every item is known by its IFMIS item code
  const itemCode = editItem?.itemCode ?? '';
  const [ifmisItemCode, setIfmisItemCode] = useState(editItem?.ifmisItemCode ?? start?.ifmisItemCode ?? '');
  const [uom, setUom] = useState(editItem?.uom || start?.uom || 'EA');
  const [subInventory, setSubInventory] = useState(editItem?.subInventory ?? '');
  const [lotBatchNo, setLotBatchNo] = useState(editItem?.lotBatchNo ?? '');
  // Serial number is no longer asked on receipt; a correction keeps what an older record has
  const serialNumber = editItem?.serialNumber ?? '';
  const [printedPadFrom, setPrintedPadFrom] = useState(editItem?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState(editItem?.printedPadTo ?? '');
  // A new receipt starts empty (the field shows 0), so the number is always typed on purpose
  const [quantity, setQuantity] = useState<number>(editItem ? Number(editItem.quantity) || 1 : 0);
  const [unitCostETB, setUnitCostETB] = useState<number>(editItem?.unitCostETB ?? start?.unitCostETB ?? 0);
  const [vatApplicable, setVatApplicable] = useState<boolean>(editItem?.vatApplicable ?? false);
  const [additionalCharges, setAdditionalCharges] = useState<number>(editItem?.additionalCharges ?? 0);
  const [condition, setCondition] = useState<ItemCondition | ''>(editItem?.condition ?? start?.condition ?? ItemCondition.NEW);
  // Remark is no longer asked; a correction keeps what an older record has
  const remark = editItem?.remark ?? '';

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState(editItem?.deliveredBy ?? '');
  // Delivered by follows the buyer until someone types a different name; clearing it makes it follow again
  const [deliveredByOwn, setDeliveredByOwn] = useState(
    !!editItem?.deliveredBy && editItem.deliveredBy !== (editItem.buyer ?? '')
  );
  // The IFMIS item code decides fixed asset or consumable (1… consumable, 0… fixed); nobody picks it by hand
  const changeIfmisCode = (value: string) => {
    setIfmisItemCode(value);
    setItemType(itemTypeFromIfmisCode(value) ?? '');
  };
  const changeBuyer = (value: string) => {
    setBuyer(value);
    if (!deliveredByOwn) setDeliveredBy(value);
  };
  const changeDeliveredBy = (value: string) => {
    setDeliveredBy(value);
    setDeliveredByOwn(value.trim() !== '' && value !== buyer);
  };
  // Left empty: the person who signs for the delivery isn't necessarily the one entering it
  const [receivedBy, setReceivedBy] = useState(editItem?.receivedBy ?? '');
  // Who received the goods: a store man of the receiving store (a correction keeps the name it has until another is chosen)
  const [receivedById, setReceivedById] = useState('');
  const keepers = useStoreKeepers();
  // A new receipt with no store yet goes to the store this person keeps, when they are store man of exactly one
  const ownStore = keepers.storeOfKeeper(user?.id);
  useEffect(() => {
    if (!isEdit && !storeId && ownStore) chooseStore(ownStore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownStore]);
  const storeMen = keepers.ofStore(storeId);
  const receiverId = receivedById || (storeMen.length === 1 ? storeMen[0].employeeId : '');
  const receiverName = storeMen.find((k) => k.employeeId === receiverId)?.fullNameEn ?? receivedBy;
  // Two files. The IFMIS Model 19 PDF is read to fill in the form. The signed copy is that printout signed and
  // scanned: it is never read, and it is kept as the receipt's copy (the IFMIS PDF is kept until one is added).
  const [ifmisFile, setIfmisFile] = useState<File | null>(null);
  // In edit mode the copy already saved counts as the signed copy, unless a new file is chosen
  const [signedFileName, setSignedFileName] = useState(
    editItem?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editItem.ifmisSlipAttachmentUrl) : ''
  );
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const copyFile = signedFile ?? ifmisFile;
  const [formError, setFormError] = useState<string | null>(null);

  const { slipAttachmentPolicy, showScannedSlipField } = useSystemSettings();
  const isAttachmentRequired = slipAttachmentPolicy === 'REQUIRED';

  // A fixed asset is one item: its quantity is 1 and can't be changed. A record from before this rule keeps its own.
  const fixedOne = itemType === ItemType.FIXED && !(isEdit && Number(editItem?.quantity) > 1);
  useEffect(() => {
    if (fixedOne && quantity !== 1) setQuantity(1);
  }, [fixedOne, quantity]);
  // What the slip's first line said, to warn when it lists several of a fixed asset
  const [slipQuantity, setSlipQuantity] = useState(0);
  const base1 = (Number(quantity) || 0) * (Number(unitCostETB) || 0);
  const vat1 = vatApplicable ? Math.round(base1 * 0.15 * 100) / 100 : 0;
  const totalAmount = donation ? 0 : base1 + (vatApplicable ? vat1 : (Number(additionalCharges) || 0));
  // The other item lines of a Model 19 read from its PDF: each is registered as its own record on submit
  const [extraLines, setExtraLines] = useState<SlipLine[]>([]);
  const extraTotal = donation ? 0 : extraLines.reduce((sum, l) => {
    const base = (l.quantity || 0) * (l.unitPrice || 0);
    const vat = l.vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
    return sum + base + (l.vatApplicable ? vat : (Number(l.additionalCharges) || 0));
  }, 0);

  // Required fields still empty; the receipt can only be submitted once this is empty
  const missingFields = [
    !ifmisSlipNumber.trim() && 'Model 19 No.',
    !ifmisSlipDateGc && 'received date',
    !transactionType && 'transaction type',
    !donation && !source.trim() && 'source',
    !storeId && 'receiving store',
    !isEdit && storeMen.length > 1 && !receiverId && 'received by (store man)',
    !name.trim() && 'item description',
    !ifmisItemCode.trim() && !(isEdit && itemType) && 'IFMIS item code',
    !category && 'category',
    !!ifmisItemCode.trim() && !itemType && 'item code starting with 0 or 1',
    !(quantity > 0) && 'quantity',
    !uom.trim() && 'unit of measure',
    !donation && !(unitCostETB > 0) && 'unit price',
    isAttachmentRequired && (showScannedSlipField ? !signedFileName : !(ifmisFile || signedFileName || editItem?.ifmisSlipAttachmentUrl)) && (showScannedSlipField ? 'signed copy' : 'IFMIS Model 19 PDF'),
    // A line needing one thing says what; a line needing more is just named, its empty cells are marked in the table
    ...extraLines.map((l, i) => {
      const missing = lineMissing(l, donation);
      return missing.length === 1 ? `item ${i + 2} (${missing[0]})` : missing.length > 1 && `item ${i + 2}`;
    }),
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    model19No: !ifmisSlipNumber.trim() && 'Enter the number printed on the Model 19 slip.',
    transactionType: !transactionType && 'Choose the transaction type.',
    source: !donation && !source.trim() && 'Enter the supplier or vendor.',
    itemName: !name.trim() && 'Describe the item received.',
    category: !category && 'Choose the category.',
    itemType: !itemType && (ifmisItemCode.trim() ? ITEM_CODE_RULE : 'Enter the IFMIS item code from the Model 19.'),
    uom: !uom.trim() && 'Enter the unit of measure, e.g. EA or KG.',
    unitCost: !donation && !(unitCostETB > 0) && 'Enter the unit price.',
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
    setUom('EA');
    setSubInventory('');
    setLotBatchNo('');
    setPrintedPadFrom('');
    setPrintedPadTo('');
    setQuantity(0);
    setUnitCostETB(0);
    setVatApplicable(false);
    setAdditionalCharges(0);
    setCondition(ItemCondition.NEW);
    setIfmisItemCode('');
    setExtraLines([]);
    setDeliveredBy('');
    setDeliveredByOwn(false);
    setReceivedBy('');
    setReceivedById('');
    setIfmisFile(null);
    setSignedFileName('');
    setSignedFile(null);
    setFormError(null);
  };

  // What reading the attached slip found, shown under it
  const [slipNote, setSlipNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const filledNote = (filled: string[], more: string) =>
    setSlipNote({ tone: 'info', text: `Filled in from the slip: ${filled.join(', ')}. Check them against the paper before submitting.${more}` });

  /**
   * A Model 19 PDF from IFMIS fills in what is still empty: the header and the first item line. Only what the person
   * has not typed is filled, and they check it against the paper before submitting.
   */
  /**
   * The fields a slip can fill. `free` also counts a starting value as empty (today's date, the EA unit).
   * `fromSlip` remembers the value each one last took from a slip: a field still holding it belongs to that slip,
   * not to the person, so another slip may replace or clear it.
   */
  const fromSlip = useRef<Record<string, string | number>>({});
  // The slip file chosen last, so an earlier, slower read can't overwrite it
  const latestSlip = useRef<File | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const slipFields = () => [
    { key: 'model19No', label: 'Model 19 No.', current: ifmisSlipNumber, set: setIfmisSlipNumber, empty: '' },
    { key: 'poNumber', label: 'PO number', current: poNumber, set: setPoNumber, empty: '' },
    { key: 'receivedDate', label: 'received date', current: ifmisSlipDateGc, set: setIfmisSlipDateGc, empty: today, free: ifmisSlipDateGc === today },
    { key: 'transactionType', label: 'transaction type', current: transactionType, set: setTransactionType, empty: '' },
    { key: 'source', label: 'source', current: source, set: setSource, empty: '' },
    { key: 'buyer', label: 'buyer', current: buyer, set: changeBuyer, empty: '' },
    { key: 'programName', label: 'program', current: programName, set: setProgramName, empty: '' },
    { key: 'name', label: 'item description', current: name, set: setName, empty: '' },
    { key: 'category', label: 'category', current: category, set: setCategory, empty: '' },
    { key: 'itemType', label: 'item type', current: itemType, set: setItemType, empty: '' },
    { key: 'condition', label: 'condition', current: condition, set: setCondition, empty: '' },
    { key: 'uom', label: 'unit of measure', current: uom, set: setUom, empty: 'EA', free: uom === 'EA' },
    { key: 'quantity', label: 'quantity', current: quantity, set: setQuantity, empty: 0 },
    { key: 'unitPrice', label: 'unit price', current: unitCostETB, set: setUnitCostETB, empty: 0 },
    // The IFMIS item code every item is known by; its first digit says fixed asset or consumable
    { key: 'subInventory', label: 'sub inventory', current: subInventory, set: setSubInventory, empty: '' },
    { key: 'ifmisItemCode', label: 'item code', current: ifmisItemCode, set: setIfmisItemCode, empty: '' },
    // After the buyer, so a deliverer named on the slip replaces the one copied from the buyer
    { key: 'deliveredBy', label: 'delivered by', current: deliveredBy, set: changeDeliveredBy, empty: '' },
    // The store man who signed for the goods, and with him the store they went to
    { key: 'storeId', label: 'receiving store', current: storeId, set: chooseStore, empty: '' },
    { key: 'receivedById', label: 'received by', current: receivedById, set: setReceivedById, empty: '' },
  ] as { key: string; label: string; current: string | number; set: (v: any) => void; empty: string | number; free?: boolean }[];

  /** Clears what an earlier slip filled in and the person hasn't changed, along with its other item lines */
  const forgetSlip = () => {
    for (const f of slipFields()) if (fromSlip.current[f.key] !== undefined && fromSlip.current[f.key] === f.current) f.set(f.empty);
    fromSlip.current = {};
    setExtraLines([]);
    setSlipQuantity(0);
  };

  const fillFromModel19 = (slip: Model19SlipFields) => {
    const filled: string[] = [];
    const line = slip.lines[0];
    // The store man only goes with his own store: not when the person already picked another store
    const found = keepers.findByName(slip.receivedBy);
    const storeIsFree = !storeId || fromSlip.current.storeId === storeId;
    const receiver = found && (storeIsFree || storeId === found.storeId) ? found : undefined;
    const unknownReceiver =
      slip.receivedBy && !found ? ` The slip says received by ${slip.receivedBy}, who is not a store man of any store; pick the store man.` : '';
    const slipType = TRANSACTION_TYPES.find((t) => t.toLowerCase() === slip.transactionType?.toLowerCase());
    const values: Record<string, string | number | undefined> = {
      model19No: slip.model19No,
      poNumber: slip.poNumber,
      receivedDate: slip.receivedDate,
      // A donation slip with no transaction type of its own is received as a donation
      transactionType: slipType ?? (provisionFromSlip(slip.poNumber) === 'DONATION' ? 'Donation / Grant Receipt' : undefined),
      source: slip.source,
      buyer: slip.buyer,
      programName: slip.programName,
      name: line?.description,
      category: CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(line?.category ?? ''))?.[1],
      itemType: itemTypeFromIfmisCode(line?.itemCode),
      // Goods on a receipt have just arrived from the supplier; the person changes it if something came damaged
      condition: line ? ItemCondition.NEW : undefined,
      uom: line?.uom?.toUpperCase(),
      quantity: line?.quantity || undefined,
      unitPrice: line?.unitPrice || undefined,
      ifmisItemCode: line?.itemCode,
      subInventory: line?.subInventory,
      deliveredBy: slip.deliveredBy,
      storeId: receiver?.storeId,
      receivedById: receiver?.keeper.employeeId,
    };
    const taken: Record<string, string | number> = {};
    for (const f of slipFields()) {
      const value = values[f.key];
      const fromEarlierSlip = fromSlip.current[f.key] !== undefined && fromSlip.current[f.key] === f.current;
      const free = fromEarlierSlip || !!f.free || f.current === f.empty || (typeof f.current === 'string' && !f.current.trim());
      if (value !== undefined && value !== '' && free) {
        taken[f.key] = value;
        if (value !== f.current) {
          f.set(value);
          // The sub inventory has no field of its own; it goes on the printed voucher
          if (f.key !== 'subInventory') filled.push(f.label);
        }
      } else if (fromEarlierSlip) {
        // The earlier slip's value, which this slip doesn't give: cleared rather than mixed in
        f.set(f.empty);
      }
    }
    fromSlip.current = taken;
    setSlipQuantity(line?.quantity ?? 0);
    // A receipt comes first in an item's life: the same slip line received twice would count the goods twice
    const receivedAs = (description?: string) =>
      slip.model19No && description
        ? registered?.find(
            (r) =>
              r.slipNumber?.trim().toLowerCase() === slip.model19No!.trim().toLowerCase() &&
              r.name.trim().toLowerCase() === description.trim().toLowerCase(),
          )?.itemCode
        : undefined;
    const alreadyCode = receivedAs(line?.description);
    const already = alreadyCode ? { itemCode: alreadyCode } : undefined;
    // Every other line of the slip is listed under the first, to be registered as its own record
    const others = isEdit ? [] : slip.lines.slice(1);
    // Always replaced: lines of an earlier slip must not stay behind to be registered with this one
    setExtraLines(
      others.map((l, i) => ({
        key: Date.now() + i,
        slipQuantity: l.quantity,
        name: l.description ?? '',
        category: CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(l.category ?? ''))?.[1] ?? '',
        itemType: itemTypeFromIfmisCode(l.itemCode) ?? '',
        condition: ItemCondition.NEW,
        uom: (l.uom ?? 'EA').toUpperCase(),
        quantity: l.quantity ?? 0,
        unitPrice: l.unitPrice ?? 0,
        ifmisCode: l.itemCode,
        subInventory: l.subInventory,
        alreadyAs: receivedAs(l.description),
      })),
    );
    if (others.length > 0) filled.push(`${others.length} more ${others.length === 1 ? 'item' : 'items'} (rows 2–${others.length + 1})`);
    if (already) {
      setSlipNote({
        tone: 'warn',
        text: `This slip's item was already received as ${already.itemCode} (Model 19 No. ${slip.model19No}). Check before registering it again.${filled.length ? ` Filled in: ${filled.join(', ')}.` : ''}`,
      });
      return;
    }
    if (filled.length === 0) {
      setSlipNote({ tone: 'info', text: 'The slip was read, but every field it covers is already filled in.' });
      return;
    }
    const more =
      others.length > 0
        ? ` This slip lists ${slip.lines.length} items, one row each. Check every row; each is registered as its own record.`
        : '';
    filledNote(filled, more + unknownReceiver);
  };

  /** Only a Model 19 is read here; another IFMIS form is named, so it can be taken to its own form */
  /** Which other IFMIS form a PDF is, if it is one: the receive form takes only a Model 19 */
  const otherForm = (text: string) =>
    isModel19(text)
      ? undefined
      : isModel21(text)
        ? 'a Model 21 transfer form. Read it on the transfer form of the asset'
        : isDisposalForm(text)
          ? 'a Fixed Asset Disposal Form (Model 22/B). Read it on the disposal form of the asset'
          : isModel22(text)
            ? 'a Model 22 issue voucher (Receipt For Articles Or Property Issued). It belongs with the issue of the asset, not its receipt'
            : undefined;

  /** The signed copy: attached as the receipt's copy, never read */
  const takeSigned = (file: File) => {
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid Slip File', error);
      return;
    }
    setFormError(null);
    setSignedFile(file);
    setSignedFileName(file.name);
  };
  const handleSignedSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) takeSigned(file);
  };
  /** A scan given where the IFMIS PDF goes: it cannot be read, so it becomes the signed copy, and what was read stays */
  const scanGiven = (file: File, what: string) => {
    takeSigned(file);
    setSlipNote({ tone: 'info', text: `${what} It is attached below as the signed copy. Nothing was read from it; what was filled in stays.` });
  };

  // A slip chosen with the header button is read like one picked in the form; fields already filled are kept
  useEffect(() => {
    if (initialSlip) takeSlip(initialSlip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlip]);

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
    // Reading takes a moment: if another file is chosen meanwhile, only the last one counts
    latestSlip.current = file;
    // A picture is a scan: only a PDF saved from IFMIS carries text to read
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return scanGiven(file, 'This is a photo or scan.');
    // The PDF is read before it is attached: another IFMIS form is refused, not kept as this receipt's copy
    setSlipNote({ tone: 'info', text: 'Reading the slip…' });
    readPdfPages(file, MAX_SLIP_PAGES)
      .then(({ rows, pages, pagesRead }) => {
        if (latestSlip.current !== file) return;
        const other = otherForm(rowsToText(rows));
        if (other) {
          const message = `This is ${other}. The receive form takes only a Model 19, so it was not attached and nothing was filled in.`;
          setSlipNote({ tone: 'warn', text: message });
          toast.warning('Not a Model 19', message);
          return;
        }
        const text = rowsToText(rows);
        // A scanned PDF has no text: it is the signed copy, not the IFMIS PDF
        if (!text.trim()) return scanGiven(file, 'This PDF is a scan (it has no text).');
        if (!isModel19(text)) {
          setSlipNote({ tone: 'warn', text: 'Only an IFMIS Model 19 PDF can be read here. It was not attached and nothing was filled in.' });
          return;
        }
        setIfmisFile(file);
        fillFromModel19(parseModel19(rows));
        if (pages > pagesRead) {
          toast.warning(
            'Slip only partly read',
            `This slip has ${pages} pages; only the first ${pagesRead} were read. Add the items from the other pages by hand.`
          );
        }
      })
      .catch(() => {
        if (latestSlip.current !== file) return;
        setSlipNote({ tone: 'warn', text: "The PDF couldn't be read, so nothing was filled in. If it is the signed scan, attach it under Signed copy." });
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Provide sensible fallbacks for unfulfilled / optional fields
    const effectiveCategory = (category || AssetCategory.IT_EQUIPMENT) as AssetCategory;
    const effectiveType = (itemType || ItemType.FIXED) as ItemType;
    const effectiveTransactionType = transactionType || "PO Receipt";
    const effectiveStoreLocId = storeLocationId || locations[0]?.id || "";
    const slipNo = ifmisSlipNumber.trim() || `PENDING-${Date.now()}`;
    const effectiveName = name.trim() || "Unspecified Item";
    const effectiveQty = Number(quantity) > 0 ? Number(quantity) : 1;
    const effectiveUom = uom.trim() || "EA";
    const effectiveUnitCost = donation ? 0 : (Number(unitCostETB) >= 0 ? Number(unitCostETB) : 0);
    const effectiveIfmisItemCode = ifmisItemCode.trim() || (effectiveType === ItemType.CONSUMABLE ? "108101101.0001" : "005101101.0001");
    setSubmitting(true);
    const registeredById = user?.id || '';

    if (editItem) {
      if (editItem.status === ItemStatus.REJECTED) {
        toast.error('Rejected batch cannot be edited', 'This record was rejected and is archived. It cannot be modified.');
        setSubmitting(false);
        return;
      }
      try {
        const selectedCat = COMMON_CATEGORIES.find((c) => c.value === category);
        const slipUrl = copyFile ? (await api.uploadSlip(copyFile)).url : undefined;
        const res = await api.updateStockIn(editItem.id, {
          name: effectiveName,
          category: effectiveCategory,
          itemType: effectiveType,
          serialNumber: serialNumber.trim() || undefined,
          unitCostETB: effectiveUnitCost,
          condition: (condition as ItemCondition) || editItem.condition || ItemCondition.NEW,
          storeLocationId: effectiveStoreLocId || editItem.storeLocationId,
          ifmisSlipNumber: slipNo,
          ifmisSlipDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          provisionType,
          ifmisItemCode: ifmisItemCode.trim() || undefined,
          poNumber: donation ? undefined : poNumber.trim() || undefined,
          transactionType: effectiveTransactionType,
          source: donation ? undefined : source.trim() || undefined,
          buyer: donation ? undefined : buyer.trim() || undefined,
          programName: programName.trim() || undefined,
          uom: effectiveUom,
          subInventory: subInventory.trim() || undefined,
          itemCategoryDisplay: selectedCat?.label,
          lotBatchNo: lotBatchNo.trim() || undefined,
          printedPadFrom: printedPadFrom.trim() || undefined,
          printedPadTo: printedPadTo.trim() || undefined,
          quantity: effectiveQty,
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
        ifmisItemCode: ifmisItemCode.trim() || undefined,
        name: effectiveName,
        category: effectiveCategory,
        itemType: effectiveType,
        serialNumber: serialNumber.trim() || undefined,
        unitCostETB: donation ? 0 : Number(unitCostETB) || 0,
        condition: (condition as ItemCondition) || ItemCondition.NEW,
        uom: effectiveUom,
        subInventory: subInventory.trim() || undefined,
        itemCategoryDisplay: selectedCat?.label,
        lotBatchNo: lotBatchNo.trim() || undefined,
        printedPadFrom: printedPadFrom.trim() || undefined,
        printedPadTo: printedPadTo.trim() || undefined,
        quantity: effectiveQty,
        totalAmount: donation ? 0 : (() => {
          const base = effectiveQty * effectiveUnitCost;
          const vat = vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
          return base + (vatApplicable ? vat : Number(additionalCharges) || 0);
        })(),
        vatApplicable,
        additionalCharges: vatApplicable ? 0 : Number(additionalCharges) || 0,
        remark: remark.trim() || undefined,
      }, ...extraLines.map((l) => ({
        ifmisItemCode: l.ifmisCode?.trim() || undefined,
        name: l.name.trim(),
        category: l.category as AssetCategory,
        itemType: l.itemType as ItemType,
        unitCostETB: donation ? 0 : l.unitPrice,
        condition: (l.condition as ItemCondition) || ItemCondition.NEW,
        uom: l.uom.trim(),
        itemCategoryDisplay: COMMON_CATEGORIES.find((c) => c.value === l.category)?.label,
        subInventory: l.subInventory?.trim() || undefined,
        quantity: l.quantity,
        totalAmount: donation ? 0 : (() => {
          const base = l.quantity * l.unitPrice;
          const vat = l.vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
          return base + (l.vatApplicable ? vat : Number(l.additionalCharges) || 0);
        })(),
        vatApplicable: Boolean(l.vatApplicable),
        additionalCharges: l.vatApplicable ? 0 : Number(l.additionalCharges) || 0,
      }))];

      const slipUrl = copyFile ? (await api.uploadSlip(copyFile)).url : undefined;

      const res = await api.registerStockIn({
        name: name.trim(),
        category: category as AssetCategory,
        itemType: itemType as ItemType,
        serialNumber: serialNumber.trim() || '',
        unitCostETB: donation ? 0 : Number(unitCostETB) || 0,
        condition: (condition as ItemCondition) || ItemCondition.NEW,
        storeLocationId: effectiveStoreLocId,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
        isHistoricalData: false,
        registeredById,
        notes: remark.trim() || undefined,
        provisionType,
        poNumber: donation ? undefined : poNumber.trim() || undefined,
        transactionType: effectiveTransactionType,
        source: donation ? undefined : source.trim() || undefined,
        buyer: donation ? undefined : buyer.trim() || undefined,
        programName: programName.trim() || undefined,
        deliveredBy: deliveredBy.trim() || undefined,
        receivedByEmployeeId: receiverId || undefined,
        items: itemsPayload,
      });

      // Construct printable Model 19 voucher
      const targetStore = locations.find((l) => l.id === storeLocationId);
      const voucherItems: Model19LineItem[] = [{
        sNo: 1,
        itemCode: (itemType === ItemType.CONSUMABLE ? ifmisItemCode.trim() : '') || res.items?.[0]?.itemCode || res.item?.itemCode || '—',
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
        unitPrice: donation ? 0 : Number(unitCostETB) || 0,
        vatApplicable,
        additionalCharges: vatApplicable ? 0 : Number(additionalCharges) || 0,
        totalAmount,
        remark: remark.trim() || '',
      }, ...extraLines.map((l, i): Model19LineItem => ({
        sNo: i + 2,
        itemCode: (l.itemType === ItemType.CONSUMABLE ? l.ifmisCode : '') || res.items?.[i + 1]?.itemCode || '—',
        itemDescription: l.name.trim(),
        uom: l.uom.trim(),
        subInventory: l.subInventory?.trim() || targetStore?.name || '',
        itemCategory: COMMON_CATEGORIES.find((c) => c.value === l.category)?.label || String(l.category).replace(/_/g, ' '),
        itemType: l.itemType as ItemType,
        lotBatchNo: '',
        serialNo: '',
        printedPadFrom: '',
        printedPadTo: '',
        quantity: l.quantity,
        unitPrice: donation ? 0 : l.unitPrice,
        totalAmount: donation ? 0 : (() => {
          const base = l.quantity * l.unitPrice;
          const vat = l.vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
          return base + (l.vatApplicable ? vat : Number(l.additionalCharges) || 0);
        })(),
        vatApplicable: Boolean(l.vatApplicable),
        additionalCharges: l.vatApplicable ? 0 : Number(l.additionalCharges) || 0,
        remark: '',
      }))];

      const generatedVoucher: Model19Voucher = {
        approvalState: 'PENDING',
        invModel19No: slipNo,
        provisionType,
        poNumber: donation ? '—' : poNumber.trim() || '—',
        receivedDateGc: ifmisSlipDateGc,
        receivedDateEc: formatGcToEc(ifmisSlipDateGc),
        transactionType: transactionType || '—',
        source: donation ? '—' : source.trim() || '—',
        buyer: donation ? '—' : buyer.trim() || '—',
        programName: programName.trim(),
        storeLocationId,
        storeLocationName: targetStore?.siteName,
        deliveredByName: deliveredBy.trim(),
        receivedByName: receiverName,
        printedBy: user?.fullNameEn,
        items: voucherItems,
        grandTotal: totalAmount + extraTotal,
      };

      toast.success(
        'Receipt registered',
        extraLines.length > 0
          ? `${extraLines.length + 1} items (Model 19 #${slipNo}, Total ${formatETB(totalAmount + extraTotal)}) registered, each as its own record, and submitted for Team Leader verification.`
          : `Item "${name.trim()}" (Model 19 #${slipNo}, Total ${formatETB(totalAmount)}) registered and submitted for Team Leader verification.`
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

  // Item 1 is a row of the items table like every other line
  const firstRow = (
    <tr className="align-middle hover:bg-slate-50/50 transition-colors">
      <td className="px-3 py-2.5 font-mono text-slate-400 text-center text-xs">1</td>
      <td className="px-3 py-2.5">
        <label htmlFor="stock-in-item-name" className="sr-only">Item description</label>
        <input
          id="stock-in-item-name"
          type="text"
          placeholder="e.g. Dell Latitude 5440 Laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={fieldErrors.touch('itemName')}
          className={cellClass({ invalid: !!fieldErrors.error('itemName') })}
        />
        {fixedOne && slipQuantity > 1 && (
          <p role="status" className="mt-0.5 text-[10px] text-amber-700">The slip lists {slipQuantity}: a fixed asset is one item, so register the others as their own receipts.</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="stock-in-ifmis-code" className="sr-only">IFMIS item code</label>
          <input
            id="stock-in-ifmis-code"
            type="text"
            required={false}
            placeholder="e.g. 108101101.0021"
            value={ifmisItemCode}
            onChange={(e) => changeIfmisCode(e.target.value)}
            onBlur={fieldErrors.touch('itemType')}
            className={cellClass({ mono: true, invalid: !!fieldErrors.error('itemType') })}
          />
          <ItemTypeTag type={itemType} code={ifmisItemCode} label="Item type" />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <label htmlFor="stock-in-category" className="sr-only">Category</label>
        <select
          id="stock-in-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as AssetCategory)}
          onBlur={fieldErrors.touch('category')}
          className={cellClass({ invalid: !!fieldErrors.error('category') })}
        >
          <option value="" disabled>Select…</option>
          {COMMON_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <label htmlFor="stock-in-uom" className="sr-only">Unit of measure</label>
        <input
          id="stock-in-uom"
          type="text"
          list="uom-options"
          placeholder="EA"
          value={uom}
          onChange={(e) => setUom(e.target.value.toUpperCase())}
          onBlur={fieldErrors.touch('uom')}
          className={`${cellClass({ mono: true, invalid: !!fieldErrors.error('uom') })} uppercase`}
        />
      </td>
      <td className="px-3 py-2.5">
        <label htmlFor="receipt-quantity" className="sr-only">Quantity</label>
        <QuantityInput
          id="receipt-quantity"
          min={0.0001}
          value={quantity}
          onChange={setQuantity}
          disabled={fixedOne}
          title={fixedOne ? 'A fixed asset is one item' : undefined}
          className={cellClass({ align: 'right', mono: true })}
        />
      </td>
      {!donation && (
        <td className="px-3 py-2.5">
          <label htmlFor="stock-in-unit-cost" className="sr-only">Unit price (ETB)</label>
          <MoneyInput
            id="stock-in-unit-cost"
            suffix=""
            value={unitCostETB}
            onChange={setUnitCostETB}
            onBlur={fieldErrors.touch('unitCost')}
            invalid={!!fieldErrors.error('unitCost')}
            placeholder="0.00"
            inputClassName="!h-9 !px-2.5 !text-xs font-medium"
          />
        </td>
      )}
      {!donation && (
        <td className="px-3 py-2.5 text-center">
          <div className="flex flex-col items-center justify-center gap-1">
            <label
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer select-none"
              title="15% VAT auto-calculated (no additional charges allowed)"
            >
              <input
                id="stock-in-vat"
                aria-label="Item 1 VAT applicable"
                type="checkbox"
                checked={vatApplicable}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setVatApplicable(checked);
                  if (checked) setAdditionalCharges(0);
                }}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-slate-700">15%</span>
            </label>
            {vatApplicable && vat1 > 0 && (
              <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap" title="15% VAT auto-calculated">
                +{money(vat1)}
              </span>
            )}
          </div>
        </td>
      )}
      {!donation && (
        <td className="px-3 py-2.5">
          <label htmlFor="stock-in-addl-charges" className="sr-only">Additional charges (ETB)</label>
          <MoneyInput
            id="stock-in-addl-charges"
            aria-label="Item 1 additional charges"
            suffix=""
            disabled={vatApplicable}
            value={vatApplicable ? 0 : additionalCharges}
            onChange={setAdditionalCharges}
            placeholder="0.00"
            title={vatApplicable ? 'Additional charges not allowed when price includes VAT' : undefined}
            inputClassName={`!h-9 !px-2.5 !text-xs ${vatApplicable ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : ''}`}
          />
        </td>
      )}
      {!donation && (
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold text-xs whitespace-nowrap">
          {money(totalAmount)} <span className="text-[10px] text-slate-400 font-normal">ETB</span>
        </td>
      )}
      <td />
    </tr>
  );

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(!submitting)} className="space-y-6">
      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-[12px] text-sky-800 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-sky-600 shrink-0" />
          <span><strong>Flexible Onboarding Active:</strong> All fields are optional. Register with available details now and update full data later.</span>
        </div>
        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 whitespace-nowrap">Partial Data Allowed</span>
      </div>

      <FormError message={formError} />

      {/* The Model 19 PDF first: it fills in most of what follows */}
      <div className="space-y-2">
        <FileDropField
          label="IFMIS Model 19 PDF"
          accent="emerald"
          required={false}
          fileName={ifmisFile?.name ?? ''}
          accept={SLIP_PDF_ACCEPT_ATTR}
          onChange={handleSlipSelected}
          file={ifmisFile}
          emptyText="Click to choose the Model 19 PDF saved from IFMIS"
          hint="The form fills itself in from it. The signed, scanned copy goes under Store and signatures."
        />
        {slipNote && (
          <FormNotice icon={FileText} tone={slipNote.tone}>
            <span role="status">{slipNote.text}</span>
          </FormNotice>
        )}
      </div>

      <Part title="Voucher">
        <FieldGrid cols={4}>
          <Field label="Model 19 No." optional htmlFor="stock-in-model19" error={fieldErrors.error('model19No')}>
            <input
              id="stock-in-model19"
              type="text"
                            placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              onBlur={fieldErrors.touch('model19No')}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model19No') })} font-semibold`}
            />
          </Field>

          <Field label="PO number" optional htmlFor="stock-in-po" hint="Optional IFMIS purchase order number.">
            <input id="stock-in-po" type="text" placeholder="e.g. PO-2024-001" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={input({ mono: true })} />
          </Field>

          <Field label="Received date (G.C.)" optional hint={`${formatGcToEc(ifmisSlipDateGc)} E.C.`} htmlFor="stock-in-slip-date">
            <input id="stock-in-slip-date" type="date" value={ifmisSlipDateGc} onChange={(e) => setIfmisSlipDateGc(e.target.value)} className={input()} />
          </Field>

          <Field label="Transaction type" optional htmlFor="stock-in-transaction-type" error={fieldErrors.error('transactionType')}>
            <select id="stock-in-transaction-type" value={transactionType} onChange={(e) => setTransactionType(e.target.value)} onBlur={fieldErrors.touch('transactionType')} className={input({ invalid: !!fieldErrors.error('transactionType') })}>
              <option value="" disabled>Select…</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          {/* What it was bought from: a donation (no PO number) has none of it */}
          {!donation && (
            <>
              <Field label="Source (supplier / vendor)" optional htmlFor="stock-in-source" error={fieldErrors.error('source')}>
                <input
                  id="stock-in-source"
                  type="text"
                                    placeholder="Supplier or vendor name"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  onBlur={fieldErrors.touch('source')}
                  className={input({ invalid: !!fieldErrors.error('source') })}
                />
              </Field>

              <Field label="Buyer" optional htmlFor="stock-in-buyer">
                <input id="stock-in-buyer" type="text" placeholder="Procurement officer" value={buyer} onChange={(e) => changeBuyer(e.target.value)} className={input()} />
              </Field>
            </>
          )}

          <Field label="Program / project" optional htmlFor="stock-in-program">
            <input id="stock-in-program" type="text" placeholder="What the goods were bought for" value={programName} onChange={(e) => setProgramName(e.target.value)} className={input()} />
          </Field>
        </FieldGrid>
      </Part>

      <Part
        title={`Items (${extraLines.length + 1})`}
        aside={<span className="text-[11px] text-slate-500">{ITEM_CODE_RULE} A fixed asset is one item.</span>}
      >
        <ReceiptItems
          first={firstRow}
          lines={extraLines}
          donation={donation}
          onChange={setExtraLines}
          onAdd={isEdit ? undefined : () => setExtraLines((lines) => [...lines, blankLine()])}
          total={totalAmount + extraTotal}
        />
      </Part>

      <Part title="Store and signatures">
        <FieldGrid>
          <Field label="Receiving store" optional htmlFor="stock-in-store">
            <select id="stock-in-store" value={storeId} onChange={(e) => chooseStore(e.target.value)} className={input()}>
              <option value="" disabled>Select…</option>
              {stores.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
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
            required={false}
          />

          <Field label="Delivered by" optional htmlFor="stock-in-delivered-by">
            <input
              id="stock-in-delivered-by"
              type="text"
              placeholder="Filled from the buyer"
              value={deliveredBy}
              onChange={(e) => changeDeliveredBy(e.target.value)}
              className={input()}
            />
          </Field>
        </FieldGrid>
        {showScannedSlipField && (

          <FileDropField
            label="Signed copy"
            accent="emerald"
            required={false}
            fileName={signedFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSignedSelected}
            file={signedFile}
            savedUrl={editItem?.ifmisSlipAttachmentUrl}
            emptyText="Click to attach the signed Model 19, scanned"
            hint={`The IFMIS printout with its signatures, as a scan or photo (PDF, PNG, JPEG or WEBP, up to 10 MB).${isAttachmentRequired ? '' : ' Until it is added, the IFMIS PDF is kept as the copy.'}`}
          />

        )}
      </Part>

      {/* The slip itself, open under the form, to check what was filled in against it */}
      <SlipPreview ifmisFile={ifmisFile} signedFile={signedFile} savedUrl={editItem?.ifmisSlipAttachmentUrl} />

      <datalist id="uom-options">
        {COMMON_UOMS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : extraLines.length > 0 ? `Submit ${extraLines.length + 1} items for approval` : 'Submit for approval'}
        allowIncomplete={true}
        missingFields={missingFields}
        // Names with no field label of their own
        fieldTargets={{ 'item code starting with 0 or 1': '#stock-in-ifmis-code', 'signed copy': 'section[aria-label="Store and signatures"] input[type="file"]' }}
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
export const buildModel19Voucher = (record: ItemWithRelations, allItems: ItemWithRelations[], printedBy?: string, approval?: TransactionApproval): Model19Voucher => {
  const item = (record.parentItemId && allItems.find((i) => i.id === record.parentItemId)) || record;
  const registrations = allItems.filter((i) => !i.parentItemId);
  const siblingItems = registrations.filter((i) => i.ifmisSlipNumber && i.ifmisSlipNumber === item.ifmisSlipNumber);
  const targetItems = siblingItems.length > 0 ? siblingItems : [item];

  const isDonation = item.provisionType === 'DONATION';
  const voucherItems: Model19LineItem[] = targetItems.map((it, idx) => {
    const lineDonation = isDonation || it.provisionType === 'DONATION';
    const qty = it.balance?.total || Number(it.quantity) || 1;
    const base = (Number(it.unitCostETB) || 0) * qty;
    const lineTotal = lineDonation ? 0 : (it.totalAmount !== undefined && it.totalAmount !== null && Number(it.totalAmount) > 0
      ? Number(it.totalAmount)
      : (() => {
          const vat = it.vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
          return base + (it.vatApplicable ? vat : Number(it.additionalCharges) || 0);
        })());

    return {
      id: it.id,
      sNo: idx + 1,
      itemCode: it.itemType === ItemType.CONSUMABLE && it.ifmisItemCode ? it.ifmisItemCode : it.itemCode,
      itemDescription: it.name,
      uom: it.uom || 'EA',
      subInventory: it.subInventory || item.storeLocation?.roomNumber || '—',
      itemCategory: it.itemCategoryDisplay || it.category.replace(/_/g, ' '),
      itemType: it.itemType,
      lotBatchNo: it.lotBatchNo || '',
      serialNo: it.serialNumber || '',
      printedPadFrom: it.printedPadFrom || '',
      printedPadTo: it.printedPadTo || '',
      quantity: qty,
      unitPrice: lineDonation ? 0 : Number(it.unitCostETB) || 0,
      vatApplicable: it.vatApplicable,
      additionalCharges: it.additionalCharges,
      totalAmount: lineTotal,
      // Notes hold the saved form data for newer items: only plain-text notes belong on the slip
      remark: it.remark || (it.notes && !it.notes.trim().startsWith('{') ? it.notes : ''),
    };
  });

  return {
    approvalState: item.status === ItemStatus.PENDING_STOCK_IN ? 'PENDING' : item.status === ItemStatus.REJECTED ? 'REJECTED' : undefined,
    invModel19No: item.ifmisSlipNumber,
    provisionType: item.provisionType,
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
