import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
import { displaySerialNumber } from '../../utils/asset-tag';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FieldGrid, Field, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { AssetCategory, ProvisionType, ItemType, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, Model19Voucher, Model19LineItem, TransactionApproval } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { useSystemSettings } from '../../utils/system-settings';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { validateSlipFile, SLIP_PDF_ACCEPT_ATTR, SLIP_ACCEPT_ATTR, getSlipDisplayName, SCAN_HINT } from '../../utils/slip-upload';
import { readPdfPages, rowsToText, isModel21, isModel22, isModel19, isDisposalForm, parseModel19, PdfRow, Model19SlipFields } from '../../utils/slip-reader';
import { TRANSACTION_TYPES, CATEGORY_FROM_IFMIS, COMMON_UOMS, COMMON_CATEGORIES, ITEM_CODE_RULE, itemTypeFromIfmisCode, provisionFromSlip } from './receipt-options';
import { ReceiptItems, SlipLine, ItemTypeTag, lineMissing, blankLine, cellClass, money } from './SlipLines';
import { slipKey } from './slip-groups';
import { categoryLabel } from './asset-state';
import { UomSelect } from './UomSelect';
import { ProgramSelect } from './ProgramSelect';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Part, SlipPreview } from './FormParts';
import { approvalNoteOf } from '../../utils/approval-note';

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
  /** Correcting a receipt returned for correction: saving it resubmits it to the Team Leader */
  returned?: boolean;
  /** Receipts rejected for good: their Model 19 No. and PO can't be received again */
  rejectedReceipts?: { slipNumber: string; poNumber?: string; reason?: string; by?: string; on?: string }[];
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
  poNumber?: string;
  subInventory?: string;
  lotBatchNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  vatApplicable?: boolean;
  additionalCharges?: number;
  deliveredBy?: string;
  receivedBy?: string;
  /** Set when a whole Model 19 is duplicated: the first item's quantity, and the receipt's other items */
  quantity?: number;
  lines?: SlipLine[];
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
  poNumber: item.poNumber,
  subInventory: item.subInventory,
  lotBatchNo: item.lotBatchNo,
  printedPadFrom: item.printedPadFrom,
  printedPadTo: item.printedPadTo,
  vatApplicable: item.vatApplicable,
  additionalCharges: item.additionalCharges,
  deliveredBy: item.deliveredBy,
  receivedBy: item.receivedBy,
});

const receivedQuantity = (item: ItemWithRelations) => item.balance?.total || Number(item.quantity) || 1;

/**
 * A whole Model 19 of several items (e.g. a rejected one, to receive again): the first item as templateFromItem
 * keeps it, and every other item as a row of its own, with the quantities the receipt had. Never its number or slip.
 */
export const templateFromSlip = (items: ItemWithRelations[]): ReceiptTemplate => {
  const [first, ...rest] = items;
  return {
    ...templateFromItem(first),
    quantity: receivedQuantity(first),
    lines: rest.map((item, i) => ({
      key: Date.now() + i + Math.random(),
      name: item.name,
      category: item.category ?? '',
      itemType: item.itemType ?? '',
      condition: item.condition ?? '',
      uom: item.uom || 'EA',
      quantity: receivedQuantity(item),
      unitPrice: item.unitCostETB || 0,
      vatApplicable: item.vatApplicable,
      additionalCharges: item.additionalCharges,
      ifmisCode: item.ifmisItemCode,
      subInventory: item.subInventory,
    })),
  };
};

export const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess, editItem, template, initialSlip, registered, rejectedReceipts, returned }) => {
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
  const [poNumber, setPoNumber] = useState(editItem?.poNumber ?? start?.poNumber ?? '');
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
  const [subInventory, setSubInventory] = useState(editItem?.subInventory ?? start?.subInventory ?? '');
  const [lotBatchNo, setLotBatchNo] = useState(editItem?.lotBatchNo ?? start?.lotBatchNo ?? '');
  // Serial number is no longer asked on receipt; a correction keeps what an older record has
  const serialNumber = editItem?.serialNumber ?? '';
  const [printedPadFrom, setPrintedPadFrom] = useState(editItem?.printedPadFrom ?? start?.printedPadFrom ?? '');
  const [printedPadTo, setPrintedPadTo] = useState(editItem?.printedPadTo ?? start?.printedPadTo ?? '');
  // Qty always defaults to 1 and is always editable
  const [quantity, setQuantity] = useState<number>(editItem ? Number(editItem.quantity) || 1 : start?.quantity || 1);
  const [unitCostETB, setUnitCostETB] = useState<number>(editItem?.unitCostETB ?? start?.unitCostETB ?? 0);
  const [vatApplicable, setVatApplicable] = useState<boolean>(editItem?.vatApplicable ?? start?.vatApplicable ?? false);
  const [additionalCharges, setAdditionalCharges] = useState<number>(editItem?.additionalCharges ?? start?.additionalCharges ?? 0);
  const [condition, setCondition] = useState<ItemCondition | ''>(editItem?.condition ?? start?.condition ?? ItemCondition.NEW);
  // Remark is no longer asked; a correction keeps what an older record has
  const remark = editItem?.remark ?? '';

  // Section 3: Signatures & Document Scan
  const [deliveredBy, setDeliveredBy] = useState(editItem?.deliveredBy ?? start?.deliveredBy ?? '');
  // Delivered by follows the buyer until someone types a different name; clearing it makes it follow again
  const [deliveredByOwn, setDeliveredByOwn] = useState(
    (() => {
      const from = editItem ?? start;
      return !!from?.deliveredBy && from.deliveredBy !== (from.buyer ?? '');
    })()
  );
  // The IFMIS item code decides fixed asset or consumable (3… fixed; 0… and 1… consumable); nobody picks it by hand
  const changeIfmisCode = (value: string) => {
    setIfmisItemCode(value);
    const derived = itemTypeFromIfmisCode(value);
    setItemType(derived ?? '');
    // Always default to 1 if no quantity set; Qty is always editable regardless of code
    if (!quantity || quantity === 0) {
      setQuantity(1);
    }
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
  const [receivedBy, setReceivedBy] = useState(editItem?.receivedBy ?? start?.receivedBy ?? '');
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
  // A duplicated receipt keeps its store man, found by name among the store's store men
  useEffect(() => {
    if (isEdit || receivedById || !start?.receivedBy) return;
    const same = storeMen.find((k) => k.fullNameEn === start.receivedBy);
    if (same) {
      setReceivedById(same.employeeId);
      // Came with the duplicate, like the rest: a slip naming another store man replaces it
      if (fromStart.current) fromStart.current.receivedById = same.employeeId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMen]);
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

  // Qty is always editable; isFixed is kept only to show the slip-quantity warning, not to lock the field
  const isFixed = ifmisItemCode.trim() ? itemTypeFromIfmisCode(ifmisItemCode) === ItemType.FIXED : (isEdit && editItem?.itemType === ItemType.FIXED && !editItem?.ifmisItemCode);
  const fixedOne = false; // Qty is never locked; kept as a const so downstream JSX that reads it still compiles
  // What the slip's first line said, to warn when it lists several of a fixed asset
  const [slipQuantity, setSlipQuantity] = useState(0);
  const base1 = (Number(quantity) || 0) * (Number(unitCostETB) || 0);
  const vat1 = vatApplicable ? Math.round(base1 * 0.15 * 100) / 100 : 0;
  const totalAmount = donation ? 0 : base1 + (vatApplicable ? vat1 : (Number(additionalCharges) || 0));
  // The other item lines of a Model 19 read from its PDF: each is registered as its own record on submit
  const [extraLines, setExtraLines] = useState<SlipLine[]>(start?.lines ?? []);
  const extraTotal = donation ? 0 : extraLines.reduce((sum, l) => {
    const base = (l.quantity || 0) * (l.unitPrice || 0);
    const vat = vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
    return sum + base + (vatApplicable ? vat : (Number(l.additionalCharges) || 0));
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
    !itemType && 'item type',
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

  // A receipt comes first in an item's life: the same slip line received twice would count the goods twice
  const findDuplicateRegistered = (slipNo?: string, itemName?: string) => {
    const s = slipNo?.trim().toLowerCase();
    const n = itemName?.trim().toLowerCase();
    if (!s || !n) return undefined;
    return registered?.find(
      (r) =>
        r.slipNumber?.trim().toLowerCase() === s &&
        r.name.trim().toLowerCase() === n,
    )?.itemCode;
  };

  const primaryDuplicateAs = findDuplicateRegistered(ifmisSlipNumber, name);
  const linesWithDuplicates = useMemo(() => extraLines.map((l) => ({
    ...l,
    alreadyAs: l.alreadyAs || findDuplicateRegistered(ifmisSlipNumber, l.name),
  })), [extraLines, ifmisSlipNumber, registered]);

  const duplicateLines = linesWithDuplicates.filter((l) => Boolean(l.alreadyAs));
  // A Model 19 No. and PO an approver rejected for good can't be received again (a correction is returned instead)
  const rejectedAs = (() => {
    const slip = ifmisSlipNumber.trim().toLowerCase();
    const po = poNumber.trim().toLowerCase();
    if (!slip) return undefined;
    return rejectedReceipts?.find((r) => r.slipNumber.trim().toLowerCase() === slip && (r.poNumber ?? '').trim().toLowerCase() === po);
  })();
  const rejectedMessage = rejectedAs
    ? `Model 19 No. ${ifmisSlipNumber.trim()}${poNumber.trim() ? ` (PO ${poNumber.trim()})` : ''} was rejected${rejectedAs.by ? ` by ${rejectedAs.by}` : ''}${rejectedAs.reason ? `: "${rejectedAs.reason}"` : ''}. A rejected receipt can't be received again; one that only needs correcting is returned for correction instead.`
    : undefined;
  const hasDuplicates = Boolean(rejectedMessage || primaryDuplicateAs || duplicateLines.length > 0);
  const duplicateMessage = rejectedMessage ? rejectedMessage : primaryDuplicateAs
    ? `Item "${name.trim()}" was already received as ${primaryDuplicateAs} (Model 19 No. ${ifmisSlipNumber.trim()}). Duplicate entrance is not permitted.`
    : duplicateLines.length > 0
      ? `${duplicateLines.length === 1 ? `Item "${duplicateLines[0].name.trim()}" was` : `${duplicateLines.length} items were`} already received on Model 19 No. ${ifmisSlipNumber.trim()}. Duplicate entrance is not permitted.`
      : undefined;

  const handleToggleVat = (checked: boolean) => {
    setVatApplicable(checked);
    if (checked) {
      setAdditionalCharges(0);
      setExtraLines((lines) => lines.map((l) => ({ ...l, additionalCharges: 0 })));
    }
  };

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({});

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
    setQuantity(1);
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
  // What the form started with, from a duplicated receipt or the person's last receipt: not typed now, so a slip's
  // value replaces it (unlike fromSlip, a value the slip doesn't give is kept rather than cleared)
  const fromStart = useRef<Record<string, string | number> | null>(null);
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
    { key: 'quantity', label: 'quantity', current: quantity, set: setQuantity, empty: 1, free: quantity === 1 },
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
  // Taken once, from the first render: everything filled in then came from a duplicate or memory, none of it typed.
  // A correction starts from the saved receipt, which the person chose to correct: nothing of it is free.
  if (fromStart.current === null) {
    fromStart.current = isEdit
      ? {}
      : Object.fromEntries(
          slipFields()
            .filter((f) => f.current !== f.empty && !(typeof f.current === 'string' && !f.current.trim()))
            .map((f) => [f.key, f.current]),
        );
  }

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
    const storeIsFree = !storeId || fromSlip.current.storeId === storeId || fromStart.current?.storeId === storeId;
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
      quantity: line?.quantity || 1,
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
      const asStarted = !!fromStart.current && fromStart.current[f.key] !== undefined && fromStart.current[f.key] === f.current;
      const free = fromEarlierSlip || asStarted || !!f.free || f.current === f.empty || (typeof f.current === 'string' && !f.current.trim());
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
    const alreadyCode = findDuplicateRegistered(slip.model19No, line?.description);
    const already = alreadyCode ? { itemCode: alreadyCode } : undefined;
    // Every other line of the slip is listed under the first, to be registered as its own record
    const others = isEdit ? [] : slip.lines.slice(1);
    // Always replaced: lines of an earlier slip must not stay behind to be registered with this one
    setExtraLines(
      others.map((l, i) => {
        return {
          key: Date.now() + i,
          slipQuantity: l.quantity,
          name: l.description ?? '',
          category: CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(l.category ?? ''))?.[1] ?? '',
          itemType: itemTypeFromIfmisCode(l.itemCode) ?? '',
          condition: ItemCondition.NEW,
          uom: (l.uom ?? 'EA').toUpperCase(),
          quantity: l.quantity || 1,
          unitPrice: l.unitPrice ?? 0,
          ifmisCode: l.itemCode,
          subInventory: l.subInventory,
          alreadyAs: findDuplicateRegistered(slip.model19No, l.description),
        };
      }),
    );
    if (others.length > 0) filled.push(others.length === 1 ? '1 more item (row 2)' : `${others.length} more items (rows 2–${others.length + 1})`);
    if (already) {
      setSlipNote({
        tone: 'warn',
        text: `This slip's item was already received as ${already.itemCode} (Model 19 No. ${slip.model19No}). Duplicate entrance is not permitted.${filled.length ? ` Filled in: ${filled.join(', ')}.` : ''}`,
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
    setSlipNote({
      tone: 'info',
      text: `${what} It is attached ${showScannedSlipField ? 'below as the signed copy' : 'to the request as its copy'}. Nothing was read from it; what was filled in stays. ${SCAN_HINT}`,
    });
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

  // The lines added under the first one, as the server receives them
  const extraPayload = () => extraLines.map((l) => ({
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
      const vat = vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
      return base + (vatApplicable ? vat : Number(l.additionalCharges) || 0);
    })(),
    vatApplicable,
    additionalCharges: vatApplicable ? 0 : Number(l.additionalCharges) || 0,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Each item needs what makes it a true record; nothing is made up for it. The unit price and the voucher's own
    // details (Model 19 No., source, store…) may still be completed later, as before.
    const itemsMissing = [
      [
        !name.trim() && 'description',
        !ifmisItemCode.trim() && !(isEdit && itemType) && 'item code',
        !category && 'category',
        !itemType && 'item type',
        !(Number(quantity) > 0) && 'quantity',
      ].filter(Boolean) as string[],
      ...extraLines.map((l) => lineMissing(l, donation)),
    ];
    const stillNeeded = itemsMissing.map((m, i) => (m.length ? `item ${i + 1} (${m.join(', ')})` : '')).filter(Boolean);
    if (stillNeeded.length > 0) {
      const msg = `Still needed before submitting: ${stillNeeded.join('; ')}.`;
      setFormError(msg);
      toast.warning('Some item details are missing', msg);
      return;
    }

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
    const effectiveIfmisItemCode = ifmisItemCode.trim() || (effectiveType === ItemType.CONSUMABLE ? "108101101.0001" : "305101101.0001");
    if (hasDuplicates) {
      const msg = duplicateMessage || 'Duplicate entrance is not permitted.';
      setFormError(msg);
      toast.error(rejectedMessage ? 'Rejected receipt' : 'Duplicate entrance not permitted', msg);
      setSubmitting(false);
      return;
    }

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
        // Items added while correcting go on the same Model 19 slip, each as its own record waiting for approval
        if (extraLines.length > 0) {
          try {
            const added = extraPayload();
            await api.registerStockIn({
              ...added[0],
              serialNumber: '',
              storeLocationId: effectiveStoreLocId || editItem.storeLocationId,
              ifmisSlipNumber: slipNo,
              ifmisSlipDateGc,
              ifmisSlipAttachmentUrl: slipUrl ?? editItem.ifmisSlipAttachmentUrl ?? undefined,
              isHistoricalData: false,
              registeredById,
              provisionType,
              poNumber: donation ? undefined : poNumber.trim() || undefined,
              transactionType: effectiveTransactionType,
              source: donation ? undefined : source.trim() || undefined,
              buyer: donation ? undefined : buyer.trim() || undefined,
              programName: programName.trim() || undefined,
              deliveredBy: deliveredBy.trim() || undefined,
              receivedByEmployeeId: receivedById || undefined,
              items: added,
            });
          } catch (err: any) {
            // The correction is saved; the form stays open so the new items can be sent again
            const errMsg = err.message || 'Server error';
            setFormError(`${editItem.itemCode} was corrected, but the added items were not saved: ${errMsg}`);
            toast.error("Added items couldn't be saved", errMsg);
            return;
          }
        }
        toast.success(
          'Receipt updated',
          extraLines.length > 0
            ? `${editItem.itemCode} was corrected and ${extraLines.length} item${extraLines.length === 1 ? '' : 's'} added to Model 19 #${slipNo}. All wait for Team Leader endorsement.`
            : `${editItem.itemCode} was corrected. ${returned ? 'It went back to the Team Leader for approval.' : 'It is still waiting for Team Leader endorsement.'}`
        );
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
      }, ...extraPayload()];

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
          const vat = vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
          return base + (vatApplicable ? vat : Number(l.additionalCharges) || 0);
        })(),
        vatApplicable,
        additionalCharges: vatApplicable ? 0 : Number(l.additionalCharges) || 0,
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
      <td className="px-2 py-2.5 font-mono text-slate-400 text-center text-xs">1</td>
      <td className="px-3 py-2.5">
        <label htmlFor="stock-in-item-name" className="sr-only">Item description</label>
        <input
          id="stock-in-item-name"
          type="text"
          placeholder="Item description (e.g. Dell Latitude 5440 Laptop)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={fieldErrors.touch('itemName')}
          className={cellClass({ invalid: !!fieldErrors.error('itemName') || !!primaryDuplicateAs })}
        />
        {primaryDuplicateAs && (
          <p role="status" className="mt-0.5 text-[10px] font-semibold text-rose-600">
            Already received as {primaryDuplicateAs} (Model 19 No. {ifmisSlipNumber.trim()}). Duplicate entrance is not permitted.
          </p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="space-y-1">
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
          <ItemTypeTag
            type={itemType}
            code={ifmisItemCode}
            label="Item type"
            onToggle={() =>
              setItemType(itemType === ItemType.CONSUMABLE ? ItemType.FIXED : ItemType.CONSUMABLE)
            }
          />
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
      <td className="px-2 py-2.5">
        <label htmlFor="stock-in-uom" className="sr-only">Unit of measure</label>
        <UomSelect
          id="stock-in-uom"
          ariaLabel="Unit of measure"
          value={uom}
          onChange={setUom}
          onBlur={fieldErrors.touch('uom')}
          invalid={!!fieldErrors.error('uom')}
        />
      </td>
      <td className="px-2 py-2.5">
        <label htmlFor="receipt-quantity" className="sr-only">Quantity</label>
        <QuantityInput
          id="receipt-quantity"
          min={0.0001}
          value={quantity}
          onChange={setQuantity}
          disabled={fixedOne}
          title={fixedOne ? 'A fixed asset is one item' : undefined}
          className={cellClass({ align: 'center', mono: true })}
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
            inputClassName="!h-9 !px-2.5 !text-xs font-medium !rounded-md"
          />
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
            inputClassName={`!h-9 !px-2.5 !text-xs !rounded-md ${vatApplicable ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : ''}`}
          />
        </td>
      )}
      {!donation && (
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold text-xs whitespace-nowrap">
          {money(totalAmount)} <span className="text-[10px] text-slate-400 font-normal">ETB</span>
          {vatApplicable && vat1 > 0 && <span className="block text-[10px] font-normal text-emerald-700">incl. VAT {money(vat1)}</span>}
        </td>
      )}
      <td className="px-2 py-2.5 text-center" />
    </tr>
  );

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(!submitting)} className="space-y-6">
      <FormError message={formError} />

      {/* The Model 19 PDF first: it fills in most of what follows */}
      <div className="space-y-2">
        <FileDropField
          label="IFMIS Model 19 PDF"
          accent="emerald"
          required={false}
          fileName={ifmisFile?.name ?? ''}
          accept={SLIP_ACCEPT_ATTR}
          onChange={handleSlipSelected}
          file={ifmisFile}
          emptyText="Click to choose the Model 19 PDF saved from IFMIS, or a photo"
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
          <Field label="Model 19 No." optional htmlFor="stock-in-model19" error={fieldErrors.error('model19No') || (rejectedAs ? 'Rejected receipt: can\'t be received again' : undefined)}>
            <input
              id="stock-in-model19"
              type="text"
                            placeholder="e.g. 0000044"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              onBlur={fieldErrors.touch('model19No')}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model19No') || !!rejectedAs })} font-semibold`}
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
            <ProgramSelect id="stock-in-program" value={programName} onChange={setProgramName} className={input()} />
          </Field>
        </FieldGrid>
      </Part>

      <Part
        title={`Items (${extraLines.length + 1})`}
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {!donation && (
              <label
                htmlFor="stock-in-vat-master"
                className="inline-flex items-center gap-1.5 cursor-pointer select-none bg-emerald-50/80 hover:bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                title="15% VAT auto-calculated for all items (no additional charges allowed)"
              >
                <input
                  id="stock-in-vat-master"
                  aria-label="VAT applicable (15% for all items)"
                  type="checkbox"
                  checked={vatApplicable}
                  onChange={(e) => handleToggleVat(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span className="text-xs font-semibold text-emerald-800">15% VAT (all items)</span>
              </label>
            )}
          </div>
        }
      >
        <p className="-mt-1 mb-2 text-[11px] text-slate-500">{ITEM_CODE_RULE} Click the badge under a code to change the type.</p>
        <ReceiptItems
          first={firstRow}
          lines={linesWithDuplicates}
          donation={donation}
          vatApplicable={vatApplicable}
          onChange={setExtraLines}
          onAdd={() => setExtraLines((lines) => [...lines, blankLine()])}
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
              placeholder="Same as the buyer, unless typed here"
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


      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? (extraLines.length > 0 ? `Save changes and add ${extraLines.length} item${extraLines.length === 1 ? '' : 's'}` : returned ? 'Save and resubmit' : 'Save changes') : extraLines.length > 0 ? `Submit ${extraLines.length + 1} items for approval` : 'Submit for approval'}
        allowIncomplete={true}
        submitDisabled={hasDuplicates}
        note={
          hasDuplicates ? (
            <span className="font-semibold text-rose-600">
              {duplicateMessage}
            </span>
          ) : undefined
        }
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
  // The lines of this receipt: the same Model 19 No. and PO, in the order they were entered. A rejected attempt on
  // the same number is another receipt, so it prints only with other rejected lines (as on its own voucher).
  const key = slipKey(item.ifmisSlipNumber, item.poNumber);
  const rejectedItem = item.status === ItemStatus.REJECTED;
  const siblingItems = key
    ? registrations
        .filter((i) => slipKey(i.ifmisSlipNumber, i.poNumber) === key && (i.status === ItemStatus.REJECTED) === rejectedItem)
        .sort((a, b) => String(a.createdAt ?? a.createdAtGc ?? '').localeCompare(String(b.createdAt ?? b.createdAtGc ?? '')) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }))
    : [];
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
      // The IFMIS item code, as IFMIS prints it on the Model 19; the record code only for an older record without one
      itemCode: it.ifmisItemCode || it.itemCode,
      itemDescription: it.name,
      uom: it.uom || 'EA',
      subInventory: it.subInventory || item.storeLocation?.roomNumber || '—',
      itemCategory: categoryLabel(it),
      itemType: it.itemType,
      lotBatchNo: it.lotBatchNo || '',
      serialNo: displaySerialNumber(it.serialNumber) === '—' ? '' : it.serialNumber,
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

  const grandTotal = voucherItems.reduce((acc, curr) => acc + curr.totalAmount, 0);
  // The Team Leader's and the Department Head's (or CEO's) signature and stamp go on once they have signed off;
  // without the request at hand, a record that left "pending" was approved
  const pending = item.status === ItemStatus.PENDING_STOCK_IN;
  const rejected = item.status === ItemStatus.REJECTED || approval?.status === 'REJECTED';
  const approved = approval ? approval.status === 'APPROVED' : !pending && !rejected;
  const endorsed = approved || (!!approval && !rejected && approval.currentStage >= 2);

  return {
    approvalState: approval?.status === 'RETURNED' ? 'RETURNED' : pending ? 'PENDING' : rejected ? 'REJECTED' : undefined,
    approvalNote: approvalNoteOf(approval),
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
    grandTotal,
    signatories: [
      { label: 'Delivered By', name: item.deliveredBy },
      { label: 'Received By', name: item.receivedBy },
      getEndorserSignatory(approval, { isEndorsed: endorsed }),
      // The Chief Director signs when the receipt's grand total is above 10 million birr, as the approval goes
      getAuthorizerSignatory(approval, { isApproved: approved, totalAmount: grandTotal }),
    ],
  };
};
