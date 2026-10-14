import React, { useState, useEffect, useRef } from 'react';
import { PackagePlus, FileText, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FormSection, FieldGrid, Field, TotalValue, ReadOnlyValue, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { AssetCategory, ProvisionType, ItemType, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, Model19Voucher, Model19LineItem } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { useSystemSettings } from '../../utils/system-settings';
import { ITEM_TYPE_OPTIONS } from './asset-state';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { readPdfPages, rowsToText, isModel21, isModel22, isModel19, isDisposalForm, parseModel19, PdfRow, Model19SlipFields } from '../../utils/slip-reader';
import { TRANSACTION_TYPES, CATEGORY_FROM_IFMIS, COMMON_UOMS, COMMON_CATEGORIES, itemTypeFromIfmisCode } from './receipt-options';
import { SlipLines, SlipLine, lineMissing, oneIfFixed } from './SlipLines';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

/** IFMIS slips are a page or two; a longer one is read this far and the rest flagged */
const MAX_SLIP_PAGES = 30;

const CONDITION_LABELS: Record<string, string> = { NEW: 'New', GOOD: 'Good', FAIR: 'Fair', NEEDS_REPAIR: 'Needs repair', DAMAGED: 'Damaged' };

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
  ifmisItemCode: item.itemType === ItemType.CONSUMABLE ? item.ifmisItemCode : undefined,
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
  // Bought or donated: a donation has no PO number, supplier, buyer or price, so those fields are hidden
  const [provisionType, setProvisionType] = useState<ProvisionType>(editItem?.provisionType ?? template?.provisionType ?? 'PURCHASE');
  const donation = provisionType === 'DONATION';
  const chooseProvision = (value: ProvisionType) => {
    setProvisionType(value);
    // A donation is received as a donation unless another type was chosen on purpose
    if (value === 'DONATION' && (!transactionType || transactionType === 'PO Receipt')) setTransactionType('Donation / Grant Receipt');
    if (value === 'PURCHASE' && transactionType === 'Donation / Grant Receipt') setTransactionType('');
  };
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState(editItem?.ifmisSlipNumber ?? '');
  const [poNumber, setPoNumber] = useState(editItem?.poNumber ?? '');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(editItem?.ifmisSlipDateGc || new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState(editItem?.transactionType || start?.transactionType || memory.transactionType || '');
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
  // A fixed asset is known by its tag number, which is its item code; a consumable by its IFMIS item code
  const [itemCode, setItemCode] = useState(editItem?.itemCode ?? '');
  const [ifmisItemCode, setIfmisItemCode] = useState(editItem?.ifmisItemCode ?? start?.ifmisItemCode ?? '');
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
  // Delivered by follows the buyer until someone types a different name; clearing it makes it follow again
  const [deliveredByOwn, setDeliveredByOwn] = useState(
    !!editItem?.deliveredBy && editItem.deliveredBy !== (editItem.buyer ?? '')
  );
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
  // In edit mode the current slip is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState(
    editItem?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editItem.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const policy = useSystemSettings().slipAttachmentPolicy;
  const isAttachmentRequired = policy === 'REQUIRED';

  // A fixed asset is one tagged item: its quantity is 1 and can't be changed. A record from before this rule keeps its own.
  const fixedOne = itemType === ItemType.FIXED && !(isEdit && Number(editItem?.quantity) > 1);
  useEffect(() => {
    if (fixedOne && quantity !== 1) setQuantity(1);
  }, [fixedOne, quantity]);
  // A serial number belongs to a fixed asset; a consumable shows the field only if it already has one
  const showSerial = itemType !== ItemType.CONSUMABLE || !!serialNumber.trim();
  // What the slip's first line said, to warn when it lists several of a fixed asset
  const [slipQuantity, setSlipQuantity] = useState(0);
  const totalAmount = donation ? 0 : (Number(quantity) || 0) * (Number(unitCostETB) || 0);
  // The other item lines of a Model 19 read from its PDF: each is registered as its own record on submit
  const [extraLines, setExtraLines] = useState<SlipLine[]>([]);
  const extraTotal = donation ? 0 : extraLines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);

  // Required fields still empty; the receipt can only be submitted once this is empty
  const missingFields = [
    !ifmisSlipNumber.trim() && 'Model 19 No.',
    !ifmisSlipDateGc && 'received date',
    !transactionType && 'transaction type',
    !donation && !source.trim() && 'source',
    !storeId && 'receiving store',
    !isEdit && storeMen.length > 1 && !receiverId && 'received by (store man)',
    !name.trim() && 'item description',
    !isEdit && itemType === ItemType.FIXED && !itemCode.trim() && 'tag number',
    itemType === ItemType.CONSUMABLE && !ifmisItemCode.trim() && 'item code',
    !category && 'category',
    !itemType && 'item type',
    !condition && 'physical condition',
    !(quantity >= 1) && 'quantity',
    !uom.trim() && 'unit of measure',
    !donation && !(unitCostETB > 0) && 'unit price',
    isAttachmentRequired && !attachmentFileName && 'scanned slip',
    // A line needing one thing says what; a line needing more is just named, its empty cells are marked in the table
    ...extraLines.map((l, i) => {
      const missing = lineMissing(l, donation);
      return missing.length === 1 ? `item ${i + 2} (${missing[0]})` : missing.length > 1 && `item ${i + 2}`;
    }),
  ].filter(Boolean) as string[];

  /** The fields that still need the person, by key: the same rules as missingFields above */
  const neededNow = (): Set<string> => {
    const keys: [string, boolean][] = [
      ['model19No', !ifmisSlipNumber.trim()],
      ['receivedDate', !ifmisSlipDateGc],
      ['transactionType', !transactionType],
      ['source', !donation && !source.trim()],
      ['store', !storeId],
      ['receivedBy', !isEdit && !receiverId],
      ['name', !name.trim()],
      ['itemType', !itemType],
      ['tag', !isEdit && itemType !== ItemType.CONSUMABLE && !itemCode.trim()],
      ['ifmisCode', itemType !== ItemType.FIXED && !ifmisItemCode.trim()],
      ['category', !category],
      ['condition', !condition],
      ['quantity', !(quantity >= 1)],
      ['uom', !uom.trim()],
      ['unitPrice', !donation && !(unitCostETB > 0)],
    ];
    return new Set(keys.filter(([, needed]) => needed).map(([key]) => key));
  };

  // After a Model 19 is read, the form shows what was read and asks only for what it still needs.
  // What it asks for is fixed when the slip is read, so a field doesn't vanish while it is being typed in.
  const [slipRead, setSlipRead] = useState(0);
  const [askFor, setAskFor] = useState<Set<string> | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (slipRead > 0) setAskFor(neededNow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slipRead]);
  const compact = !isEdit && askFor !== null && !showAll;
  const stillNeeded = neededNow();
  /** Whether a field shows: always in the full form; in the short one if it was asked for or still blocks submitting */
  const ask = (key: string) => !compact || !!askFor?.has(key) || stillNeeded.has(key);

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    model19No: !ifmisSlipNumber.trim() && 'Enter the number printed on the Model 19 slip.',
    transactionType: !transactionType && 'Choose the transaction type.',
    source: !donation && !source.trim() && 'Enter the supplier or vendor.',
    itemName: !name.trim() && 'Describe the item received.',
    category: !category && 'Choose the category.',
    itemType: !itemType && 'Choose fixed asset or consumable.',
    condition: !condition && 'Choose the physical condition.',
    uom: !uom.trim() && 'Enter the unit of measure, e.g. EA or KG.',
    unitCost: !donation && !(unitCostETB > 0) && 'Enter the unit price.',
  });

  const handleReset = () => {
    fromSlip.current = {};
    setAskFor(null);
    setShowAll(false);
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
    setIfmisItemCode('');
    setExtraLines([]);
    setProvisionType('PURCHASE');
    setDeliveredBy('');
    setDeliveredByOwn(false);
    setReceivedBy('');
    setReceivedById('');
    setAttachmentFileName('');
    setAttachmentFile(null);
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
    // The IFMIS item code is the inventory code a consumable is known by (a fixed asset is known by its tag instead)
    { key: 'ifmisItemCode', label: 'item code', current: ifmisItemCode, set: setIfmisItemCode, empty: '' },
    // After the buyer, so a deliverer named on the slip replaces the one copied from the buyer
    { key: 'deliveredBy', label: 'delivered by', current: deliveredBy, set: changeDeliveredBy, empty: '' },
    // The store man who signed for the goods, and with him the store they went to
    { key: 'storeId', label: 'receiving store', current: storeId, set: chooseStore, empty: '' },
    { key: 'receivedById', label: 'received by', current: receivedById, set: setReceivedById, empty: '' },
  ] as { key: string; label: string; current: string | number; set: (v: any) => void; empty: string | number; free?: boolean }[];

  /** Clears what an earlier slip filled in and the person hasn't changed, along with its other item lines */
  const forgetSlip = () => {
    setAskFor(null);
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
    const values: Record<string, string | number | undefined> = {
      model19No: slip.model19No,
      poNumber: slip.poNumber,
      receivedDate: slip.receivedDate,
      transactionType: TRANSACTION_TYPES.find((t) => t.toLowerCase() === slip.transactionType?.toLowerCase()),
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
          filled.push(f.label);
        }
      } else if (fromEarlierSlip) {
        // The earlier slip's value, which this slip doesn't give: cleared rather than mixed in
        f.set(f.empty);
      }
    }
    fromSlip.current = taken;
    // New receipts switch to the short form: what was read, and what is still needed
    if (!isEdit) {
      setSlipRead((n) => n + 1);
      setShowAll(false);
    }
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
        alreadyAs: receivedAs(l.description),
      })),
    );
    if (others.length > 0) filled.push(`${others.length} more ${others.length === 1 ? 'item' : 'items'} below`);
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
        ? ` This slip lists ${slip.lines.length} items: the first is in the form and the others are listed under it. Check their item type and condition; each is registered as its own record.`
        : '';
    filledNote(filled, more + unknownReceiver);
  };

  /** Only a Model 19 is read here; another IFMIS form is named, so it can be taken to its own form */
  /** Which other IFMIS form a PDF is, if it is one: the receive form takes only a Model 19 */
  const otherForm = (text: string) =>
    isModel19(text)
      ? undefined
      : isModel21(text)
        ? 'a Model 21 transfer form. Read it from the transfer form of the asset (Import transfer)'
        : isDisposalForm(text)
          ? 'a Fixed Asset Disposal Form (Model 22/B). Read it from the disposal form of the asset (Import disposal)'
          : isModel22(text)
            ? 'a Model 22 issue voucher (Receipt For Articles Or Property Issued). It belongs with the issue of the asset, not its receipt'
            : undefined;

  /** Only a Model 19 is read here; a scan, or a PDF that is no IFMIS form, is attached as the copy without being read */
  const fillFromSlip = (rows: PdfRow[]) => {
    const text = rowsToText(rows);
    if (isModel19(text)) return fillFromModel19(parseModel19(rows));
    // Another PDF replaces the slip: what an earlier slip filled in no longer has a document behind it
    const hadSlip = Object.keys(fromSlip.current).length > 0 || extraLines.length > 0;
    forgetSlip();
    const cleared = hadSlip ? ' What the previous slip filled in was cleared.' : '';
    setSlipNote({
      tone: 'warn',
      text: !text.trim()
        ? `This PDF has no text (it is a scanned image), so it could not be read. It is attached; fill in the fields as usual.${cleared}`
        : `Only an IFMIS Model 19 PDF can be read here. It is attached; fill in the fields as usual.${cleared}`,
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
    const attach = () => {
      setAttachmentFile(file);
      setAttachmentFileName(file.name);
    };
    // A picture is attached as it is; only a PDF saved from IFMIS carries text to read
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
      attach();
      const hadSlip = Object.keys(fromSlip.current).length > 0 || extraLines.length > 0;
      // A photo may well be the same slip, so what was read from a PDF stays, with a reminder to check it
      setSlipNote(hadSlip ? { tone: 'warn', text: 'The fields read from the earlier PDF are kept. Check they match this slip.' } : null);
      return;
    }
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
        attach();
        fillFromSlip(rows);
        if (pages > pagesRead) {
          toast.warning(
            'Slip only partly read',
            `This slip has ${pages} pages; only the first ${pagesRead} were read. Add the items from the other pages by hand.`
          );
        }
      })
      .catch(() => {
        if (latestSlip.current !== file) return;
        attach();
        setSlipNote({ tone: 'warn', text: "The slip couldn't be read. It is attached; fill in the fields as usual." });
      });
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
          unitCostETB: donation ? 0 : Number(unitCostETB) || 0,
          condition: condition as ItemCondition,
          storeLocationId,
          ifmisSlipNumber: slipNo,
          ifmisSlipDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          provisionType,
          ifmisItemCode: itemType === ItemType.CONSUMABLE ? ifmisItemCode.trim() : undefined,
          poNumber: donation ? undefined : poNumber.trim() || undefined,
          transactionType,
          source: donation ? undefined : source.trim() || undefined,
          buyer: donation ? undefined : buyer.trim() || undefined,
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
        itemCode: itemType === ItemType.FIXED ? itemCode.trim() || undefined : undefined,
        ifmisItemCode: itemType === ItemType.CONSUMABLE ? ifmisItemCode.trim() || undefined : undefined,
        name: name.trim(),
        category: category as AssetCategory,
        itemType: itemType as ItemType,
        serialNumber: serialNumber.trim() || undefined,
        unitCostETB: donation ? 0 : Number(unitCostETB) || 0,
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
      }, ...extraLines.map((l) => ({
        itemCode: l.itemType === ItemType.FIXED ? l.tag?.trim() || undefined : undefined,
        ifmisItemCode: l.itemType === ItemType.CONSUMABLE ? l.ifmisCode?.trim() || undefined : undefined,
        name: l.name.trim(),
        category: l.category as AssetCategory,
        itemType: l.itemType as ItemType,
        unitCostETB: donation ? 0 : l.unitPrice,
        condition: l.condition as ItemCondition,
        uom: l.uom.trim(),
        itemCategoryDisplay: COMMON_CATEGORIES.find((c) => c.value === l.category)?.label,
        quantity: l.quantity,
        totalAmount: donation ? 0 : l.quantity * l.unitPrice,
      }))];

      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      const res = await api.registerStockIn({
        name: name.trim(),
        category: category as AssetCategory,
        itemType: itemType as ItemType,
        serialNumber: serialNumber.trim() || '',
        unitCostETB: donation ? 0 : Number(unitCostETB) || 0,
        condition: condition as ItemCondition,
        storeLocationId,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
        isHistoricalData: false,
        registeredById,
        notes: remark.trim() || undefined,
        provisionType,
        poNumber: donation ? undefined : poNumber.trim() || undefined,
        transactionType,
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
        itemCode: (itemType === ItemType.CONSUMABLE ? ifmisItemCode.trim() : itemCode.trim()) || res.items?.[0]?.itemCode || res.item?.itemCode || '—',
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
        totalAmount,
        remark: remark.trim() || '',
      }, ...extraLines.map((l, i): Model19LineItem => ({
        sNo: i + 2,
        itemCode: (l.itemType === ItemType.CONSUMABLE ? l.ifmisCode : l.tag) || res.items?.[i + 1]?.itemCode || '—',
        itemDescription: l.name.trim(),
        uom: l.uom.trim(),
        subInventory: targetStore?.name || '',
        itemCategory: COMMON_CATEGORIES.find((c) => c.value === l.category)?.label || String(l.category).replace(/_/g, ' '),
        itemType: l.itemType as ItemType,
        lotBatchNo: '',
        serialNo: '',
        printedPadFrom: '',
        printedPadTo: '',
        quantity: l.quantity,
        unitPrice: donation ? 0 : l.unitPrice,
        totalAmount: donation ? 0 : l.quantity * l.unitPrice,
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

  // The short form's summary: what is filled in and not asked for again below. [label, field key ('' if never asked), value]
  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const slipSummary = (
    [
      ['Model 19 No.', 'model19No', ifmisSlipNumber],
      ['Received date', 'receivedDate', ifmisSlipDateGc ? `${ifmisSlipDateGc} (${formatGcToEc(ifmisSlipDateGc)} E.C.)` : ''],
      ['Transaction type', 'transactionType', transactionType],
      ['Program', '', programName],
      ['PO number', '', donation ? '' : poNumber],
      ['Source', 'source', donation ? '' : source],
      ['Buyer', '', donation ? '' : buyer],
      ['Item', 'name', name],
      ['Item type', 'itemType', ITEM_TYPE_OPTIONS.find((t) => t.value === itemType)?.label ?? ''],
      ['Item code', 'ifmisCode', itemType === ItemType.CONSUMABLE ? ifmisItemCode : ''],
      ['Category', 'category', COMMON_CATEGORIES.find((c) => c.value === category)?.label ?? ''],
      ['Condition', 'condition', CONDITION_LABELS[condition] ?? ''],
      ['Quantity', 'quantity', quantity ? `${quantity} ${uom}${donation ? '' : ` × ETB ${money(unitCostETB)} = ETB ${money(totalAmount)}`}` : ''],
      ['Other items', '', extraLines.length ? `${extraLines.length} more, listed below (all items ETB ${money(totalAmount + extraTotal)})` : ''],
      ['Store', 'store', storeId ? stores.find(([id]) => id === storeId)?.[1] ?? '' : ''],
      ['Received by', 'receivedBy', receiverId ? receiverName : ''],
      ['Delivered by', '', deliveredBy],
    ] as [string, string, string][]
  )
    .filter(([, key, value]) => value && !(key && ask(key)))
    .map(([label, , value]) => [label, value] as [string, string]);

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-4">
      <FormError message={formError} />

      {/* ── The IFMIS slip first: a Model 19 PDF fills in the form ── */}
      <div className="space-y-2">
        <FileDropField
          label="IFMIS Model 19 slip"
          accent="emerald"
          required={isAttachmentRequired}
          fileName={attachmentFileName}
          accept={SLIP_ACCEPT_ATTR}
          onChange={handleSlipSelected}
          file={attachmentFile}
          savedUrl={editItem?.ifmisSlipAttachmentUrl}
          hint={
            isEdit
              ? 'PDF, PNG, JPEG or WEBP · up to 10 MB'
              : 'Start here: a Model 19 PDF saved from IFMIS fills in the form. PDF, PNG, JPEG or WEBP · up to 10 MB.'
          }
        />
        {slipNote && (
          <FormNotice icon={FileText} tone={slipNote.tone}>
            <span role="status">{slipNote.text}</span>
          </FormNotice>
        )}
      </div>

      {/* ── What was read from the slip, in short ── */}
      {askFor !== null && !isEdit && (
        <section aria-label="Read from the slip" className="rounded-xl border border-emerald-200 bg-emerald-50/40">
          <div className="flex items-center gap-2 border-b border-emerald-100 px-4 py-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Read from the slip</h3>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="ml-auto text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              {showAll ? 'Show only what is needed' : 'Edit all fields'}
            </button>
          </div>
          {compact && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 px-4 py-3 text-xs sm:grid-cols-2">
              {slipSummary.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
                  <dd className="min-w-0 font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {/* ── Voucher & procurement ── */}
      {(['model19No', 'receivedDate', 'transactionType', 'source'].some(ask) || !compact) && (
        <FormSection
          plain
          step={1}
          title={compact ? 'Still needed: voucher' : 'Voucher & procurement'}
          icon={FileText}
          accent="emerald"
        >
          <FieldGrid>
            {!compact && (
              <Field label="Type of provision" required htmlFor="stock-in-provision" hint={donation ? 'Donated items have no PO number, supplier, buyer or price.' : undefined}>
                <select id="stock-in-provision" required value={provisionType} onChange={(e) => chooseProvision(e.target.value as ProvisionType)} className={input()}>
                  <option value="PURCHASE">Purchase</option>
                  <option value="DONATION">Donation</option>
                </select>
              </Field>
            )}

            {ask('transactionType') && (
              <Field label="Transaction type" required htmlFor="stock-in-transaction-type" error={fieldErrors.error('transactionType')}>
                <select id="stock-in-transaction-type" required value={transactionType} onChange={(e) => setTransactionType(e.target.value)} onBlur={fieldErrors.touch('transactionType')} className={input({ invalid: !!fieldErrors.error('transactionType') })}>
                  <option value="" disabled>Select…</option>
                  {TRANSACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {ask('receivedDate') && (
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
            )}

            {ask('model19No') && (
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
            )}

            {!compact && (
              <Field label="Program / project" optional span="sm:col-span-2">
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="Program or project the goods were bought for"
                  className={input()}
                />
              </Field>
            )}

            {/* What it was bought on: a donation has none of it */}
            {!donation && (
              <>
                {!compact && (
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
                )}

                {ask('source') && (
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
                )}

                {!compact && (
                  <Field label="Buyer / procurement officer" optional>
                    <input
                      type="text"
                      placeholder="Name of the buyer or procurement officer"
                      value={buyer}
                      onChange={(e) => changeBuyer(e.target.value)}
                      className={input()}
                    />
                  </Field>
                )}
              </>
            )}
          </FieldGrid>
        </FormSection>
      )}

      {/* ── Item received ── */}
      {(['itemType', 'tag', 'ifmisCode', 'name', 'category', 'condition', 'quantity', 'uom', 'unitPrice'].some(ask) || !compact || extraLines.length > 0) && (
        <FormSection plain step={2} title={compact ? 'Items' : 'Item received'} icon={PackagePlus} accent="emerald">
          <div className="space-y-3.5">
            <FieldGrid>
              {ask('itemType') && (
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
              )}

              {isEdit ? (
                <Field label={itemType === ItemType.CONSUMABLE ? 'Record code' : 'Tag number'} hint="It can't be changed after registration">
                  <ReadOnlyValue mono>{itemCode}</ReadOnlyValue>
                </Field>
              ) : itemType === ItemType.FIXED ? (
                ask('tag') && (
                  <Field label="Tag number" required hint="The tag on the asset; it becomes its item code" htmlFor="stock-in-item-code">
                    <input
                      id="stock-in-item-code"
                      type="text"
                      required
                      placeholder="e.g. MOA-072351"
                      value={itemCode}
                      onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                      className={input({ mono: true })}
                    />
                  </Field>
                )
              ) : itemType !== ItemType.CONSUMABLE ? (
                <Field label="Tag number / item code" hint="Choose the item type first: a fixed asset is known by its tag number, a consumable by its item code">
                  <input type="text" disabled aria-label="Tag number or item code" placeholder="Choose the item type first" className={input({ mono: true })} />
                </Field>
              ) : null}

              {itemType === ItemType.CONSUMABLE && ask('ifmisCode') && (
                <Field label="Item code" required hint="The inventory code from IFMIS, the same on every delivery of this item" htmlFor="stock-in-ifmis-code">
                  <input
                    id="stock-in-ifmis-code"
                    type="text"
                    required
                    placeholder="e.g. 108101101.0021"
                    value={ifmisItemCode}
                    onChange={(e) => setIfmisItemCode(e.target.value)}
                    className={input({ mono: true })}
                  />
                </Field>
              )}

              {/* A serial number belongs to a fixed asset; a consumable shows one only if it already has one */}
              {showSerial && !compact && (
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
              )}

              {ask('name') && (
                <Field label="Item description" required span={showSerial && !compact ? undefined : 'sm:col-span-2'} htmlFor="stock-in-item-name" error={fieldErrors.error('itemName')}>
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
              )}

              {ask('category') && (
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
              )}

              {ask('condition') && (
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
              )}
            </FieldGrid>

            {/* Quantity & valuation */}
            {(['quantity', 'uom', 'unitPrice'].some(ask) || !compact) && (
              <FieldGrid cols={4}>
                {ask('quantity') && (
                  <Field
                    label="Quantity"
                    required
                    htmlFor="receipt-quantity"
                    hint={fixedOne ? 'A fixed asset is one item. For several, register each as its own receipt (Duplicate as new receipt helps).' : undefined}
                    warning={fixedOne && slipQuantity > 1 ? `The slip lists ${slipQuantity} of this item: register each one as its own receipt.` : undefined}
                  >
                    <QuantityInput id="receipt-quantity" min={1} required value={quantity} onChange={setQuantity} disabled={fixedOne} />
                  </Field>
                )}

                {ask('uom') && (
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
                )}

                {!donation && (
                  <>
                    {ask('unitPrice') && (
                      <Field label="Unit price (ETB)" required htmlFor="stock-in-unit-cost" error={fieldErrors.error('unitCost')}>
                        <MoneyInput
                          id="stock-in-unit-cost"
                          value={unitCostETB}
                          onChange={setUnitCostETB}
                          onBlur={fieldErrors.touch('unitCost')}
                          invalid={!!fieldErrors.error('unitCost')}
                        />
                      </Field>
                    )}

                    {!compact && (
                      <Field label="Total (ETB)">
                        <TotalValue accent="emerald">
                          {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </TotalValue>
                      </Field>
                    )}
                  </>
                )}
              </FieldGrid>
            )}

            {!compact && (
              <Field label="Remark" optional>
                <input
                  type="text"
                  placeholder="Specification notes or remarks for the voucher"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className={input()}
                />
              </Field>
            )}

            {extraLines.length > 0 && (
              <SlipLines
                donation={donation}
                lines={extraLines}
                onChange={setExtraLines}
                onCopyFirst={
                  itemType || condition
                    ? () =>
                        setExtraLines((ls) =>
                          ls.map((l) => oneIfFixed({ ...l, itemType: l.itemType || (itemType as ItemType | ''), condition: l.condition || (condition as ItemCondition | '') })),
                        )
                    : undefined
                }
              />
            )}
          </div>
        </FormSection>
      )}

      {/* ── Store & delivery ── */}
      {(['store', 'receivedBy'].some(ask) || !compact) && (
        <FormSection plain step={3} title={compact ? 'Still needed: store' : 'Store & delivery'} icon={Upload} accent="emerald">
          <FieldGrid>
            {ask('store') && (
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
            )}

            {ask('receivedBy') && (
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
            )}

            {!compact && (
              <Field label="Delivered by" optional>
                <input
                  type="text"
                  placeholder="Filled from the buyer; change it if someone else delivered"
                  value={deliveredBy}
                  onChange={(e) => changeDeliveredBy(e.target.value)}
                  className={input()}
                />
              </Field>
            )}
          </FieldGrid>
        </FormSection>
      )}

      <datalist id="uom-options">
        {COMMON_UOMS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : extraLines.length > 0 ? `Submit ${extraLines.length + 1} items for approval` : 'Submit for approval'}
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
    quantity: it.balance?.total || Number(it.quantity) || 1,
    unitPrice: Number(it.unitCostETB) || 0,
    totalAmount: (Number(it.unitCostETB) || 0) * (it.balance?.total || Number(it.quantity) || 1),
    // Notes hold the saved form data for newer items: only plain-text notes belong on the slip
    remark: it.remark || (it.notes && !it.notes.trim().startsWith('{') ? it.notes : ''),
  }));

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
