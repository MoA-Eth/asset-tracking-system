import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, Car, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations, ItemStatus, ItemType, ItemCondition, Department, Employee, Location, Model21Voucher, TransactionApproval, ApprovalStatus } from '../../types/asset-management';
import { formatVoucherRemark } from '../../utils/voucher-remark';
import { FormSection, FieldGrid, Field, ReadOnlyValue, SummaryGrid, FormFooter, FileDropField, FormNotice, QuantityInput, MoneyInput, inputClass, textareaClass, submitOnCtrlEnter } from '../ui/FormKit';
import { readPdfRows, rowsToText, isModel19, isModel21, parseModel21, parseModel21Particulars, sameEmployeeId, Model21SlipFields, Model21SlipLine, Model21Particulars, withoutAmounts } from '../../utils/slip-reader';
import { Part, SlipPreview } from './FormParts';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName, SCAN_HINT } from '../../utils/slip-upload';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSystemSettings } from '../../utils/system-settings';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { StoreManField } from './StoreManField';
import { OtherAssets } from './OtherAssets';
import { LearnTagPrompt, taggableAssets } from './LearnTagPrompt';
import { findByTag, printedTag } from '../../utils/asset-tag';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { valueOf } from '../../utils/item-cost';
import { departmentLabel, isUnassignedDepartment } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { storeLocationLabel } from '../../utils/location';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { useSlipRegister, usedMessage } from '../../hooks/useSlipRegister';
import { approvalNoteOf } from '../../utils/approval-note';
import { cellClass, money } from './SlipLines';

/** What an open request on an asset is called in the picker */
/** An asset's status in words, for what a Model 21 can't be used for */
const STATUS_WORDS: Record<string, string> = {
  PENDING_STOCK_IN: 'still waiting for receipt approval',
  PENDING_STOCK_OUT: 'waiting for issue approval',
  UNDER_TRANSFER: 'under transfer',
  PENDING_DISPOSAL: 'waiting for disposal approval',
  DISPOSED: 'disposed',
  REJECTED: 'rejected at receipt',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Receipt',
  STOCK_OUT: 'Issue',
  TRANSFER: 'Transfer',
  RETURN: 'Return',
};

const accessoriesOf = (jack: number, wrench: number, keys: number, reserveTyre: number) =>
  [
    { name: 'jack with handle', quantity: jack },
    { name: 'tire wrench', quantity: wrench },
    { name: 'key', quantity: keys },
    { name: 'reserve tyre', quantity: reserveTyre },
  ].filter((a) => a.quantity > 0);

/** One line on the Model 21 transfer voucher */
export interface TransferRow {
  key: number;
  itemId: string;
  quantity: number;
  depreciation: number;
  bookValue: number;
  slip?: Model21SlipLine;
}
let transferRowKey = 0;

// ─── Transfer form (inside the pop-up) ──────────────────────────────────────

export interface TransferFormProps {
  items: ItemWithRelations[];
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  /** Open request per item: those items can't be chosen until it is decided */
  pendingByItem: Map<string, TransactionApproval>;
  /** All open pending requests per item: allows parallel Model 21 requests for remaining balance */
  openByItem?: Map<string, TransactionApproval[]>;
  /** When set, the form corrects this pending transfer instead of creating a new one */
  editTransfer?: TransactionApproval;
  /** Asset chosen before the form opened, e.g. from its row in the register */
  initialItemId?: string;
  /** Assets chosen before the form opened, e.g. from multiple selections */
  initialItemIds?: string[];
  /** A Model 21 PDF chosen with the form's header button: it is read into the form */
  slip?: File;
  onCancel: () => void;
  onSaved: (voucher?: Model21Voucher) => void;
  /** An asset changed while the form was open, e.g. its IFMIS tag number was recorded */
  onItemUpdated?: (item: ItemWithRelations) => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({ items, employees, departments, locations, pendingByItem, openByItem, editTransfer, initialItemId, initialItemIds, slip, onCancel, onSaved, onItemUpdated }) => {
  const { user } = useAuth();
  const toast = useToast();
  const details = editTransfer?.requestDetails ?? {};
  // A new transfer starts from the last one this person made: the same book, and the number to continue from
  const memory = editTransfer ? {} : recallForm(user?.id, 'transfer');
  const slips = useSlipRegister();
  const editItem = editTransfer ? items.find((i) => i.id === editTransfer.itemId) : undefined;
  const qtyOf = (name: string) => details.accessories?.find((a) => a.name === name)?.quantity ?? 0;

  const pendingUnitsOf = (assetId: string, excludeApprovalId?: string) => {
    const list = openByItem?.get(assetId) ?? (pendingByItem.get(assetId) ? [pendingByItem.get(assetId)!] : []);
    return list
      .filter((a) => (!excludeApprovalId || a.id !== excludeApprovalId) && (a.transactionType === 'TRANSFER' || a.transactionType === 'RETURN'))
      .reduce((sum, a) => sum + (Number(a.requestDetails?.quantity) || 1), 0);
  };

  const remainingBalanceOf = (item?: ItemWithRelations, excludeApprovalId?: string) => {
    if (!item) return 1;
    const total = Number(item.quantity) || 1;
    const pending = pendingUnitsOf(item.id, excludeApprovalId);
    return Math.max(0, Math.round((total - pending) * 10000) / 10000);
  };

  const startItem = items.find((i) => i.id === initialItemId);
  const startItems = (initialItemIds ?? []).map((id) => items.find((i) => i.id === id)).filter(Boolean) as ItemWithRelations[];

  const newTransferRow = (itemId = '', quantity = 0, depreciation = 0, bookVal = 0, slip?: Model21SlipLine): TransferRow => {
    const item = items.find((i) => i.id === itemId);
    const rem = remainingBalanceOf(item, editTransfer?.id);
    const qty = quantity || rem || (item ? Number(item.quantity) || 1 : 1);
    const dep = depreciation || 0;
    const bv = bookVal || (item ? Math.max(0, valueOf(item, qty) - dep) : 0);
    return {
      key: ++transferRowKey,
      itemId,
      quantity: qty,
      depreciation: dep,
      bookValue: bv,
      slip,
    };
  };

  const [rows, setRows] = useState<TransferRow[]>(() =>
    editTransfer
      ? [
          newTransferRow(
            editTransfer.itemId,
            Number(details.quantity) || (editItem ? Number(editItem.quantity) || 1 : 1),
            details.depreciation ?? 0,
            details.bookValue ?? (editItem ? valueOf(editItem, Number(editItem.quantity) || 1) : 0),
          ),
        ]
      : startItems.length > 0
        ? startItems.map((item) => newTransferRow(item.id, Number(item.quantity) || 1))
        : [newTransferRow(startItem?.id ?? '', startItem ? Number(startItem.quantity) || 1 : 1)],
  );

  const rowItemOf = (row?: TransferRow) => {
    if (!row) return undefined;
    if (editTransfer && row.itemId === editTransfer.itemId) return editItem;
    return items.find((i) => i.id === row.itemId);
  };

  const setRow = (key: number, patch: Partial<TransferRow>) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, ...patch };
        const item = rowItemOf(updated);
        if (item && ('quantity' in patch || 'depreciation' in patch)) {
          const origCost = valueOf(item, updated.quantity);
          updated.bookValue = Math.max(0, origCost - (updated.depreciation || 0));
        }
        return updated;
      }),
    );
  };

  const chooseRowItem = (key: number, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    const rem = remainingBalanceOf(item, editTransfer?.id);
    const qty = rem || (item ? Number(item.quantity) || 1 : 1);
    const origCost = item ? valueOf(item, qty) : 0;
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              itemId,
              quantity: qty,
              depreciation: 0,
              bookValue: origCost,
            }
          : r,
      ),
    );
    if (item && item.status === ItemStatus.AVAILABLE) setReturnToId('');
    if (key === rows[0]?.key && item) {
      setChassisNumber(item.serialNumber || '');
      setPlateNo('');
      setEngineNo('');
      setTireSerials('');
      setDefectRemark('');
      setJackQty(0);
      setTireWrenchQty(0);
      setKeyQty(0);
      setReserveTyreQty(0);
    }
  };

  const addRow = () => setRows((rs) => [...rs, newTransferRow()]);
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const firstRow = rows[0];
  const selectedItemId = firstRow?.itemId ?? '';
  const transferQuantity = firstRow?.quantity ?? 1;
  const depreciation = firstRow?.depreciation ?? 0;
  const bookValue = firstRow?.bookValue ?? 0;
  const selectedItemObj = rowItemOf(firstRow);

  const [model21No, setModel21No] = useState(editTransfer?.ifmisSlipNumber ?? '');
  const [book, setBook] = useState(details.book ?? memory.book ?? '');
  const [targetEmployeeId, setTargetEmployeeId] = useState(editTransfer?.recipientEmployeeId ?? '');
  const [targetDepartmentId, setTargetDepartmentId] = useState(editTransfer?.targetDepartmentId ?? '');
  const [targetLocationId, setTargetLocationId] = useState(editTransfer?.targetLocationId ?? '');
  const [chassisNumber, setChassisNumber] = useState(details.chassisNumber ?? editItem?.serialNumber ?? '');
  const [plateNo, setPlateNo] = useState(details.plateNo ?? '');
  const [engineNo, setEngineNo] = useState(details.engineNo ?? '');

  // Accessories start at zero: the encoder enters what was actually handed over
  const [jackQty, setJackQty] = useState(qtyOf('jack with handle'));
  const [tireWrenchQty, setTireWrenchQty] = useState(qtyOf('tire wrench'));
  const [keyQty, setKeyQty] = useState(qtyOf('key'));
  const [reserveTyreQty, setReserveTyreQty] = useState(qtyOf('reserve tyre'));
  const [tireSerials, setTireSerials] = useState(details.tireNos?.join(', ') ?? '');
  const [defectRemark, setDefectRemark] = useState(formatVoucherRemark(details.remark) ?? '');
  const [submitting, setSubmitting] = useState(false);

  // "Return to store": the store the asset goes back to. Empty means an ordinary transfer to an employee.
  const isReturnEdit = editTransfer?.transactionType === 'RETURN';
  const [returnToId, setReturnToId] = useState(isReturnEdit ? editTransfer?.targetLocationId ?? editItem?.storeLocationId ?? '' : '');
  const isReturn = isReturnEdit || (!editTransfer && !!returnToId);
  // Condition is no longer asked on return; a correction keeps what an older return recorded
  const condition = isReturnEdit ? (details.condition as ItemCondition | undefined) || undefined : undefined;
  const [returnReason, setReturnReason] = useState(isReturnEdit ? details.reason ?? '' : '');
  const [storeReceiverId, setStoreReceiverId] = useState(isReturnEdit ? details.storeRecipientId ?? '' : '');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState(editTransfer?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editTransfer.ifmisSlipAttachmentUrl) : '');
  const { slipAttachmentPolicy, showScannedSlipField } = useSystemSettings();
  const isAttachmentReq = slipAttachmentPolicy === 'REQUIRED';
  const todayGc = new Date().toISOString().split('T')[0];
  // Today unless changed; a correction keeps the date it was requested with
  const [transferDateGc, setTransferDateGc] = useState(editTransfer?.ifmisSlipDateGc || todayGc);

  // The store man named on the voucher: one of the store men of the store the asset came from
  const keepers = useStoreKeepers();
  // An asset still in store is handed over by its store man, who is then the transferor
  const fromStore = selectedItemObj?.status === ItemStatus.AVAILABLE || !!details.fromStore;
  const storeMen = keepers.ofLocation(selectedItemObj?.storeLocationId);
  // Who takes it back: a store man of the store it returns to
  const returnLocation = keepers.locations.find((l) => l.id === returnToId);
  const returnStoreMen = keepers.ofLocation(returnToId);
  const receiverId = storeReceiverId || (returnStoreMen.length === 1 ? returnStoreMen[0].employeeId : '');
  const [transferredById, setTransferredById] = useState('');
  const transferrerId = transferredById || (storeMen.length === 1 ? storeMen[0].employeeId : '');
  const transferrerName = storeMen.find((k) => k.employeeId === transferrerId)?.fullNameEn;
  const selectedIsVehicleLike = selectedItemObj?.category === 'VEHICLE' || selectedItemObj?.category === 'AGRI_MACHINERY';
  const [showVehicle, setShowVehicle] = useState(false);
  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  // A newly chosen asset brings its own details
  const handleItemSelect = (itemId: string) => {
    if (rows[0]) {
      chooseRowItem(rows[0].key, itemId);
    } else {
      setRows([newTransferRow(itemId)]);
    }
  };

  // Opened from an asset's row: start with that asset chosen
  useEffect(() => {
    if (!editTransfer && initialItemId && (!rows[0]?.itemId || rows[0].itemId !== initialItemId)) {
      handleItemSelect(initialItemId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemId]);

  const handleSlipSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const error = validateSlipFile(file);
    if (error) return void toast.warning('Invalid slip file', error);
    setAttachmentFile(file);
    setAttachmentFileName(file.name);
  };

  // Choosing the new custodian fills in their directorate, which can still be changed
  const handleRecipientChange = (employeeId: string) => {
    setTargetEmployeeId(employeeId);
    const emp = employees.find((e) => e.id === employeeId);
    if (emp?.departmentId) setTargetDepartmentId(emp.departmentId);
  };

// ── Reading a Model 21 PDF from IFMIS ──
  const [slipNote, setSlipNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  // The other assets a Model 21 lists: each that fits is transferred as its own request on submit
  const [extraAssets, setExtraAssets] = useState<{ key: number; line: Model21SlipLine; asset?: ItemWithRelations; problem?: string }[]>([]);
  // IFMIS tags the form names that no asset has; each can be recorded on the asset it is, and the form read again
  const [unknownTags, setUnknownTags] = useState<string[]>([]);
  // Assets the form already names: not offered for another line's tag
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const learnedTags = useRef(new Map<string, string>());
  const lastRead = useRef<{ slip: Model21SlipFields; vehicle?: Model21Particulars } | null>(null);
  const extraReady = extraAssets.filter((o) => o.asset && !o.problem) as { key: number; line: Model21SlipLine; asset: ItemWithRelations }[];

  /** Whether an asset has a blocking pending request (Model 21 allows parallel requests up to total quantity) */
  const hasBlockingPending = (asset: ItemWithRelations) => {
    const list = openByItem?.get(asset.id) ?? (pendingByItem.get(asset.id) ? [pendingByItem.get(asset.id)!] : []);
    if (!list.length) return false;
    if (editTransfer && list.length === 1 && list[0].id === editTransfer.id) return false;
    // Any non-Model 21 request (STOCK_IN, STOCK_OUT, DISPOSAL) blocks transfers
    if (list.some((a) => a.transactionType !== 'TRANSFER' && a.transactionType !== 'RETURN')) {
      return true;
    }
    // For Model 21 requests, blocked only if remaining balance is 0
    return remainingBalanceOf(asset, editTransfer?.id) <= 0;
  };

  /**
   * Whether the asset a Model 21 line names can be transferred, in the order of its life: received and approved, a
   * fixed asset, issued to the employee the form transfers it from (or still in store), with no other request waiting.
   */
  const checkLine = (line: Model21SlipLine | undefined, slip: Model21SlipFields): { asset?: ItemWithRelations; problem?: string } => {
    if (!line?.tagNumber?.trim()) return { problem: 'The form names no asset tag number.' };
    const asset = findByTag(items, line.tagNumber, learnedTags.current);
    if (!asset) return { problem: `No asset here has the tag ${line.tagNumber}. If it was received under another code, record the tag on it below; otherwise it has to be received on a Model 19 and approved first.` };
    const problem =
      asset.itemType === ItemType.CONSUMABLE && asset.status !== ItemStatus.AVAILABLE
        ? `${asset.itemCode} is an issued consumable item; consumables are used up once issued and can't be transferred.`
        : asset.status !== ItemStatus.ISSUED && asset.status !== ItemStatus.AVAILABLE
          ? `${asset.itemCode} is ${STATUS_WORDS[asset.status] ?? asset.status.toLowerCase()}; only an issued asset, or an item in store, can be transferred.`
          : asset.status === ItemStatus.ISSUED && asset.heldByOrganization
            ? `${asset.itemCode} is held by ${asset.heldByOrganization}, outside the Ministry.`
            : hasBlockingPending(asset)
              ? `${asset.itemCode} already has a request waiting for approval.`
              : asset.status === ItemStatus.ISSUED && slip.fromEmployeeId && !sameEmployeeId(asset.currentCustodian?.payrollId, slip.fromEmployeeId)
                ? `${asset.itemCode} is held by ${asset.currentCustodian?.fullNameEn ?? 'someone else'}, not by the employee the form transfers it from (${slip.fromName ?? slip.fromEmployeeId}).`
                : undefined;
    return { asset, problem };
  };

  /**
   * Where a Model 21 returns an issued asset to store: the store whose store man it names as the recipient. A store
   * man of several stores: the one its "To" location names, else the asset's own store, else his first. A location
   * name alone doesn't make a return: offices and stores share names ("MoA Head office").
   */
  const returnOf = (slip: Model21SlipFields, asset?: ItemWithRelations) => {
    if (!asset || asset.status !== ItemStatus.ISSUED || !slip.toEmployeeId) return undefined;
    const hits = keepers.locations
      .map((l) => ({ location: l, keeper: keepers.ofLocation(l.id).find((k) => sameEmployeeId(k.payrollId, slip.toEmployeeId)) }))
      .filter((h): h is { location: typeof h.location; keeper: NonNullable<typeof h.keeper> } => !!h.keeper);
    if (hits.length === 0) return undefined;
    const to = (slip.toLocation ?? '').toLowerCase();
    const named = (label: string) => label.split('·').map((p) => p.trim().toLowerCase()).some((p) => p.length > 3 && to.includes(p));
    return hits.find((h) => to && named(h.location.label)) ?? hits.find((h) => h.location.id === asset.storeLocationId) ?? hits[0];
  };

  /**
   * A Model 21 fills in the voucher, the asset and who receives it. Anything that doesn't fit the order of operations
   * is said, and that asset (or the recipient) is not filled in. The form's other assets are listed under it, each to
   * be transferred as its own request.
   */
  const fillFromModel21 = (slip: Model21SlipFields, vehicle?: Model21Particulars) => {
    lastRead.current = { slip, vehicle };
    setUnknownTags([...new Set(slip.lines.map((l) => l.tagNumber?.trim() ?? '').filter((t) => t && !findByTag(items, t, learnedTags.current)))]);
    setMatchedIds(new Set(slip.lines.map((l) => findByTag(items, l.tagNumber, learnedTags.current)?.id).filter((id): id is string => !!id)));
    const filled: string[] = [];
    const problems: string[] = [];
    const line = slip.lines[0];
    if (slip.model21No && !model21No.trim()) {
      setModel21No(slip.model21No);
      filled.push('Model 21 No.');
    }
    if (slip.book && !book.trim()) {
      setBook(slip.book);
      filled.push('book');
    }
    if (line?.date && (!transferDateGc || transferDateGc === todayGc)) {
      setTransferDateGc(line.date);
      filled.push('transfer date');
    }

    const first = checkLine(line, slip);
    const usable = !!first.asset && !first.problem;
    // Its recipient a store man: a return to his store, not a transfer to him in person
    const back = usable && !editTransfer ? returnOf(slip, first.asset) : undefined;
    if (first.problem) problems.push(first.problem);
    else if (first.asset) {
      const asset = first.asset;
      if (!editTransfer && asset.id !== selectedItemId) {
        handleItemSelect(asset.id);
        filled.push(`asset (${asset.itemCode})`);
      }
      if (back) {
        setReturnToId(back.location.id);
        setStoreReceiverId(back.keeper.employeeId);
        filled.push(`return to store (${back.location.label})`, `received by (${back.keeper.fullNameEn})`);
      } else if (!editTransfer) {
        setReturnToId('');
      }
      if (line?.unit !== undefined && line.unit > 0) {
        if (rows[0]) setRow(rows[0].key, { quantity: line.unit });
        filled.push('quantity');
      }
      if (line?.depreciation !== undefined) {
        if (rows[0]) setRow(rows[0].key, { depreciation: line.depreciation });
        filled.push('depreciation');
      }
      if (line?.bookValue !== undefined) {
        if (rows[0]) setRow(rows[0].key, { bookValue: line.bookValue });
        filled.push('book value');
      }
    }

    // The vehicle details printed under the table, for the asset the form fills in
    if (vehicle && (usable || editTransfer)) {
      const qty = (name: string) => vehicle.accessories.find((a) => a.name === name)?.quantity;
      const got = [
        vehicle.chassisNumber && (setChassisNumber(vehicle.chassisNumber), 'chassis'),
        vehicle.plateNo && (setPlateNo(vehicle.plateNo), 'plate'),
        vehicle.engineNo && (setEngineNo(vehicle.engineNo), 'engine'),
        vehicle.accessories.length > 0 && (setJackQty(qty('jack with handle') ?? 0), setTireWrenchQty(qty('tire wrench') ?? 0), setKeyQty(qty('key') ?? 0), setReserveTyreQty(qty('reserve tyre') ?? 0), 'accessories'),
        vehicle.tireNos.length > 0 && (setTireSerials(vehicle.tireNos.join(', ')), `${vehicle.tireNos.length} tire numbers`),
        vehicle.remark && (setDefectRemark(formatVoucherRemark(vehicle.remark) ?? ''), 'remark'),
      ].filter(Boolean) as string[];
      if (got.length) {
        setShowVehicle(true);
        filled.push(`vehicle details (${got.join(', ')})`);
      }
    }

    // Who receives it: only once the asset itself fits, and on a transfer (a return goes to the store)
    if (usable && slip.toEmployeeId && !back) {
      const to = employees.find((e) => e.isActive !== false && sameEmployeeId(e.payrollId, slip.toEmployeeId));
      if (!to) problems.push(`No active employee has ID ${slip.toEmployeeId}${slip.toName ? ` (${slip.toName})` : ''}.`);
      else if (first.asset?.status === ItemStatus.ISSUED && to.id === first.asset.currentCustodianId) problems.push(`${first.asset.itemCode} is already with ${to.fullNameEn}.`);
      else if (!targetEmployeeId) {
        handleRecipientChange(to.id);
        filled.push(`recipient (${to.fullNameEn})`);
      }
    }

    // The other assets on the form, each checked the same way; a correction keeps to its one asset
    const others = editTransfer
      ? []
      : slip.lines.slice(1).map((l, i) => {
          const checked = checkLine(l, slip);
          const sameAsFirst = checked.asset && first.asset && checked.asset.id === first.asset.id;
          // Only what someone holds can go back to store
          const inStore = back && checked.asset && !checked.problem && checked.asset.status !== ItemStatus.ISSUED;
          return {
            key: i,
            line: l,
            asset: checked.asset,
            problem: sameAsFirst ? `${checked.asset!.itemCode} is already the first asset on this form.` : inStore ? `${checked.asset!.itemCode} is already in store.` : checked.problem,
          };
        });
    setExtraAssets(others);
    const ready = others.filter((o) => o.asset && !o.problem).length;

    const more =
      others.length > 0
        ? ` The form lists ${slip.lines.length} assets: the first is in the form and the others are listed under it${ready ? `; ${ready} of them will be ${back ? 'returned to store' : 'transferred'} as their own requests when you submit` : ''}.`
        : '';
    if (problems.length) {
      setSlipNote({ tone: 'warn', text: `${problems.join(' ')}${filled.length ? ` Filled in: ${filled.join(', ')}.` : ''}${more}` });
    } else if (filled.length) {
      setSlipNote({ tone: 'info', text: `Filled in from the Model 21: ${filled.join(', ')}. Check them against the paper before submitting.${more}` });
    } else {
      setSlipNote({ tone: 'info', text: `The form was read, but every field it covers is already filled in.${more}` });
    }
  };

  // The IFMIS PDF the form was read from, shown in the box at the top
  const [readFile, setReadFile] = useState<File | null>(null);
  /** Only a Model 21 is read here; another IFMIS form is named, so it can be taken to its own form */
  const readSlip = (file: File) => {
    // A photo can't be read: it is kept as the request's copy, and what was filled in stays
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      const error = validateSlipFile(file);
      if (error) return void setSlipNote({ tone: 'warn', text: error });
      setAttachmentFile(file);
      setAttachmentFileName(file.name);
      return void setSlipNote({
        tone: 'info',
        text: `This is a photo. It is attached ${showScannedSlipField ? 'below as the signed copy' : 'to the request as its copy'}. Nothing was read from it; what was filled in stays. ${SCAN_HINT}`,
      });
    }
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
      return void setSlipNote({ tone: 'warn', text: 'Choose the Model 21 as a PDF saved from IFMIS.' });
    }
    setReadFile(file);
    setSlipNote({ tone: 'info', text: 'Reading the Model 21…' });
    readPdfRows(file)
      .then((rows) => {
        const text = rowsToText(rows);
        if (!text.trim()) return setSlipNote({ tone: 'warn', text: `This PDF is a scan, so nothing could be read from it. Fill in the fields as usual. ${SCAN_HINT}` });
        if (isModel21(text)) return fillFromModel21(withoutAmounts.model21(parseModel21(text)), parseModel21Particulars(rows));
        setSlipNote({
          tone: 'warn',
          text: isModel19(text)
            ? 'This is a Model 19 receipt, not a Model 21. Read it on Receive items (Model 19).'
            : 'Only an IFMIS Model 21 (Fixed Asset Internal Transfer Form) PDF can be read here.',
        });
      })
      .catch(() => setSlipNote({ tone: 'warn', text: "The PDF couldn't be read. Fill in the fields as usual." }));
  };

  /** A tag was recorded on an asset: the form is read again, so that asset is found */
  const tagLearned = (_tag: string, asset: ItemWithRelations) => {
    learnedTags.current.set(asset.id, asset.ifmisTagNumber ?? _tag);
    onItemUpdated?.(asset);
    if (lastRead.current) fillFromModel21(lastRead.current.slip, lastRead.current.vehicle);
  };

  // A PDF handed to the form when it opens
  useEffect(() => {
    if (slip) readSlip(slip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slip]);

  const usedNo = slips.findUsed(model21No, ['TRANSFER', 'RETURN'], editTransfer?.id);
  const isPendingModel21 = usedNo?.status === 'PENDING';

  // A field shows what is wrong with it once the user has been in it
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (key: string) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const problems: Record<string, string | false> = {};
  const errorOf = (key: string) => (touched[key] && problems[key] ? (problems[key] as string) : undefined);

  const invalidRow = rows.find((r) => {
    const it = rowItemOf(r);
    const avail = remainingBalanceOf(it, editTransfer?.id);
    return !r.itemId || !r.quantity || r.quantity <= 0 || (it && r.quantity > avail);
  });

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !selectedItemId && 'asset',
    (!transferQuantity || transferQuantity <= 0) && 'quantity',
    selectedItemObj && transferQuantity > remainingBalanceOf(selectedItemObj, editTransfer?.id) && 'quantity exceeds available',
    invalidRow && 'valid items and quantities',
    !model21No.trim() && 'Model 21 No.',
    !transferDateGc && 'transfer date',
    !book.trim() && 'book',
    !isReturn && !targetEmployeeId && 'recipient',
    !isReturn && !editTransfer && storeMen.length > 1 && !transferrerId && 'store man',
    isReturn && !returnReason.trim() && 'reason for return',
    isReturn && !editTransfer && returnStoreMen.length > 1 && !receiverId && 'received by (store man)',
    isReturn && isAttachmentReq && (showScannedSlipField ? !attachmentFileName : !(readFile || attachmentFileName || editTransfer?.ifmisSlipAttachmentUrl)) && (showScannedSlipField ? 'signed copy' : 'IFMIS Model 21 PDF'),
  ].filter(Boolean) as string[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return void toast.warning('Asset required', 'Choose the asset to transfer.');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const it = rowItemOf(r);
      if (!it) return void toast.warning('Asset required', `Choose an asset for row ${i + 1}.`);
      const rem = remainingBalanceOf(it, editTransfer?.id);
      if (!r.quantity || r.quantity <= 0) {
        return void toast.warning('Invalid quantity', `Enter a valid quantity for ${it.itemCode}.`);
      }
      if (r.quantity > rem) {
        return void toast.warning(
          'Quantity exceeds available balance',
          `${it.itemCode} only has ${rem} ${it.uom || 'EA'} remaining (${it.quantity || 1} total).`,
        );
      }
    }
    const effectiveModel21No = model21No.trim() || `PENDING-TRF-${Date.now()}`;
    const effectiveReason = isReturn ? (returnReason.trim() || 'Return to store') : undefined;
    const effectiveTargetEmployeeId = targetEmployeeId || (isReturn ? undefined : employees[0]?.id);

    const accessories = accessoriesOf(jackQty, tireWrenchQty, keyQty, reserveTyreQty);
    const tireList = tireSerials.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      // The signed copy, or else the IFMIS PDF the form was read from
      const copy = attachmentFile ?? readFile;
      const slipUrl = copy ? (await api.uploadSlip(copy)).url : undefined;
      // ── Return to store: the asset goes back to a store instead of to an employee
      if (isReturn) {
        const item = selectedItemObj;
        if (editTransfer) {
          await api.updateReturn(editTransfer.id, {
            quantity: transferQuantity,
            model21No: effectiveModel21No,
            ifmisSlipDateGc: transferDateGc,
            ifmisSlipAttachmentUrl: slipUrl,
            returnReason: effectiveReason,
            condition,
            book: book.trim() || undefined,
            chassisNumber: chassisNumber.trim() || undefined,
            plateNo: plateNo.trim() || undefined,
            engineNo: engineNo.trim() || undefined,
            accessories,
            tireNos: tireList,
            depreciation,
            bookValue,
            defectRemark: defectRemark.trim() || undefined,
            storeRecipientId: receiverId || undefined,
            targetStoreLocationId: returnToId,
          });
          toast.success('Transfer updated', `The transfer of ${editTransfer.itemCode} to store was corrected. ${editTransfer.status === 'REJECTED' ? 'It went back to the Team Leader for approval.' : 'It is still waiting for Team Leader endorsement.'}`);
          onSaved();
          return;
        }
        const origCost = valueOf(item, transferQuantity);
        await api.registerReturn({
          itemId: selectedItemId,
          quantity: transferQuantity,
          ifmisSlipNumber: effectiveModel21No,
          ifmisSlipDateGc: transferDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          returnReason: effectiveReason,
          condition,
          returningEmployeeId: item?.currentCustodianId || undefined,
          registeredById: user?.id || '',
          model21No: model21No.trim(),
          book: book.trim(),
          chassisNumber: chassisNumber.trim() || undefined,
          plateNo: plateNo.trim() || undefined,
          engineNo: engineNo.trim() || undefined,
          accessories,
          tireNos: tireList,
          origCost,
          depreciation,
          bookValue,
          defectRemark: defectRemark.trim() || undefined,
          storeRecipientId: storeReceiverId || undefined,
          targetStoreLocationId: returnToId && returnToId !== item?.storeLocationId ? returnToId : undefined,
        });

        // The other assets on the Model 21: extra rows from the table, plus any extraReady from PDF
        const returned: { asset: ItemWithRelations; origCost: number; depreciation: number; bookValue: number; unit: number }[] = [];
        const notReturned: string[] = [];

        const extraRows = editTransfer ? [] : rows.slice(1).filter((r) => r.itemId);
        for (const extra of extraRows) {
          const extraItem = rowItemOf(extra);
          if (!extraItem) continue;
          const extraOrigCost = valueOf(extraItem, extra.quantity);
          try {
            await api.registerReturn({
              itemId: extra.itemId,
              quantity: extra.quantity,
              ifmisSlipNumber: effectiveModel21No,
              ifmisSlipDateGc: transferDateGc,
              ifmisSlipAttachmentUrl: slipUrl,
              returnReason: effectiveReason,
              condition,
              returningEmployeeId: extraItem.currentCustodianId || undefined,
              registeredById: user?.id || '',
              model21No: model21No.trim(),
              book: book.trim(),
              origCost: extraOrigCost,
              depreciation: extra.depreciation,
              bookValue: extra.bookValue,
              storeRecipientId: receiverId || undefined,
              targetStoreLocationId: returnToId && returnToId !== extraItem.storeLocationId ? returnToId : undefined,
            });
            returned.push({
              asset: extraItem,
              origCost: extraOrigCost,
              depreciation: extra.depreciation,
              bookValue: extra.bookValue,
              unit: extra.quantity,
            });
          } catch (err: any) {
            notReturned.push(`${extraItem.itemCode}: ${err.message || 'refused'}`);
          }
        }

        for (const other of editTransfer ? [] : extraReady) {
          if (rows.some((r) => r.itemId === other.asset.id)) continue;
          const otherQty = Number(other.asset.quantity) || 1;
          const otherCost = other.line.origCost ?? valueOf(other.asset, otherQty);
          try {
            await api.registerReturn({
              itemId: other.asset.id,
              quantity: otherQty,
              ifmisSlipNumber: effectiveModel21No,
              ifmisSlipDateGc: transferDateGc,
              ifmisSlipAttachmentUrl: slipUrl,
              returnReason: effectiveReason,
              condition,
              returningEmployeeId: other.asset.currentCustodianId || undefined,
              registeredById: user?.id || '',
              model21No: model21No.trim(),
              book: book.trim(),
              origCost: otherCost,
              depreciation: other.line.depreciation,
              bookValue: other.line.bookValue,
              storeRecipientId: receiverId || undefined,
              targetStoreLocationId: returnToId && returnToId !== other.asset.storeLocationId ? returnToId : undefined,
            });
            returned.push({
              asset: other.asset,
              origCost: otherCost,
              depreciation: other.line.depreciation ?? 0,
              bookValue: other.line.bookValue ?? otherCost,
              unit: otherQty,
            });
          } catch (err: any) {
            notReturned.push(`${other.asset.itemCode}: ${err.message || 'refused'}`);
          }
        }

        if (notReturned.length) toast.warning('Some assets on the form were not returned', notReturned.join(' · '));
        const receiver = returnStoreMen.find((k) => k.employeeId === receiverId);
        const loc = storeLocationLabel(item?.storeLocation);
        const returnVoucher: Model21Voucher = {
          approvalState: 'PENDING',
          model21No: model21No.trim(),
          fromEmployeeName: item?.currentCustodian?.fullNameEn || '—',
          fromEmployeeId: item?.currentCustodian?.payrollId || '—',
          book: book.trim() || '—',
          toEmployeeName: receiver?.fullNameEn || '—',
          toEmployeeId: receiver?.payrollId || '—',
          isReturn: true,
          returnReason: returnReason.trim(),
          items: [
            {
              sNo: 1,
              description: item?.name || '—',
              tagNumber: printedTag(item) || '—',
              serialNumber: item?.serialNumber || '',
              chassisNumber: chassisNumber.trim() || undefined,
              uom: item?.uom || 'EA',
              unit: transferQuantity,
              origCost,
              depreciation,
              bookValue,
              dateGc: transferDateGc,
              dateEc: formatGcToEc(transferDateGc),
              fromLocation: loc,
              toLocation: returnLocation ? returnLocation.label : loc,
              plateNo: plateNo.trim() || undefined,
              engineNo: engineNo.trim() || undefined,
              accessories: accessories.length > 0 ? accessories : undefined,
              tireNos: tireList.length > 0 ? tireList : undefined,
              remark: defectRemark.trim() || undefined,
            },
            ...returned.map((other, i) => ({
              sNo: i + 2,
              description: other.asset.name || '—',
              tagNumber: printedTag(other.asset) || '—',
              serialNumber: other.asset.serialNumber || '',
              uom: other.asset.uom || 'EA',
              unit: other.unit,
              origCost: other.origCost,
              depreciation: other.depreciation,
              bookValue: other.bookValue,
              dateGc: transferDateGc,
              dateEc: formatGcToEc(transferDateGc),
              fromLocation: storeLocationLabel(other.asset.storeLocation),
              toLocation: returnLocation ? returnLocation.label : storeLocationLabel(other.asset.storeLocation),
            })),
          ],
          printedBy: user?.fullNameEn,
        };
        toast.success(
          'Return to store submitted for approval',
          returned.length
            ? `${returned.length + 1} assets (${model21No.trim()}) are registered for Department Head approval and stay with their custodians until then.`
            : `${item?.itemCode || 'The asset'} (${model21No.trim()}) is registered for Department Head approval and stays with its custodian until then.`,
        );
        rememberForm(user?.id, 'transfer', { book: book.trim() });
        onSaved(returnVoucher);
        return;
      }

      if (editTransfer) {
        await api.updateTransfer(editTransfer.id, {
          quantity: transferQuantity,
          model21No: model21No.trim(),
          ifmisSlipAttachmentUrl: slipUrl,
          toEmployeeId: targetEmployeeId,
          toDepartmentId: targetDepartmentId || undefined,
          toLocationId: targetLocationId || undefined,
          reason: details.reason,
          book: book.trim() || undefined,
          chassisNumber: chassisNumber.trim() || undefined,
          plateNo: plateNo.trim() || undefined,
          engineNo: engineNo.trim() || undefined,
          accessories,
          tireNos: tireList,
          depreciation,
          bookValue,
          remark: defectRemark.trim() || undefined,
          transferredByEmployeeId: transferredById || undefined,
          ifmisSlipDateGc: transferDateGc,
        });
        toast.success('Transfer updated', `The transfer of ${editTransfer.itemCode} was corrected. ${editTransfer.status === 'REJECTED' ? 'It went back to the Team Leader for approval.' : 'It is still waiting for Team Leader endorsement.'}`);
        onSaved();
        return;
      }

      const selectedItem = selectedItemObj;
      const origCost = valueOf(selectedItem, transferQuantity);
      await api.transferItem({
        itemId: selectedItemId,
        quantity: transferQuantity,
        ifmisSlipAttachmentUrl: slipUrl,
        toEmployeeId: targetEmployeeId,
        toDepartmentId: targetDepartmentId || undefined,
        toLocationId: targetLocationId || undefined,
        performedById: user?.id || '',
        transferredByEmployeeId: transferrerId || undefined,
        ifmisSlipDateGc: transferDateGc,
        model21No: model21No.trim(),
        book: book.trim(),
        chassisNumber: chassisNumber.trim() || undefined,
        plateNo: plateNo.trim() || undefined,
        engineNo: engineNo.trim() || undefined,
        accessories,
        tireNos: tireList,
        origCost,
        depreciation,
        bookValue,
        remark: defectRemark.trim() || undefined,
      });

      // The other assets on the Model 21: extra rows from table, plus any extraReady from PDF
      const sent: { asset: ItemWithRelations; origCost: number; depreciation: number; bookValue: number; unit: number }[] = [];
      const notSent: string[] = [];

      const extraRows = editTransfer ? [] : rows.slice(1).filter((r) => r.itemId);
      for (const extra of extraRows) {
        const extraItem = rowItemOf(extra);
        if (!extraItem) continue;
        const extraOrigCost = valueOf(extraItem, extra.quantity);
        try {
          const men = keepers.ofLocation(extraItem.storeLocationId);
          await api.transferItem({
            itemId: extra.itemId,
            quantity: extra.quantity,
            ifmisSlipAttachmentUrl: slipUrl,
            toEmployeeId: targetEmployeeId,
            toDepartmentId: targetDepartmentId || undefined,
            toLocationId: targetLocationId || undefined,
            performedById: user?.id || '',
            transferredByEmployeeId: men.some((k) => k.employeeId === transferrerId) ? transferrerId : undefined,
            ifmisSlipDateGc: transferDateGc,
            model21No: model21No.trim(),
            book: book.trim(),
            origCost: extraOrigCost,
            depreciation: extra.depreciation,
            bookValue: extra.bookValue,
          });
          sent.push({
            asset: extraItem,
            origCost: extraOrigCost,
            depreciation: extra.depreciation,
            bookValue: extra.bookValue,
            unit: extra.quantity,
          });
        } catch (err: any) {
          notSent.push(`${extraItem.itemCode}: ${err.message || 'refused'}`);
        }
      }

      for (const other of isReturn ? [] : extraReady) {
        if (rows.some((r) => r.itemId === other.asset.id)) continue;
        const otherQty = Number(other.asset.quantity) || 1;
        const otherCost = other.line.origCost ?? valueOf(other.asset, otherQty);
        try {
          const men = keepers.ofLocation(other.asset.storeLocationId);
          await api.transferItem({
            itemId: other.asset.id,
            quantity: otherQty,
            ifmisSlipAttachmentUrl: slipUrl,
            toEmployeeId: targetEmployeeId,
            toDepartmentId: targetDepartmentId || undefined,
            performedById: user?.id || '',
            transferredByEmployeeId: men.some((k) => k.employeeId === transferrerId) ? transferrerId : undefined,
            ifmisSlipDateGc: transferDateGc,
            model21No: model21No.trim(),
            book: book.trim(),
            origCost: otherCost,
            depreciation: other.line.depreciation,
            bookValue: other.line.bookValue,
          });
          sent.push({
            asset: other.asset,
            origCost: otherCost,
            depreciation: other.line.depreciation ?? 0,
            bookValue: other.line.bookValue ?? otherCost,
            unit: otherQty,
          });
        } catch (err: any) {
          notSent.push(`${other.asset.itemCode}: ${err.message || 'refused'}`);
        }
      }
      if (notSent.length) toast.warning('Some assets on the form were not transferred', notSent.join(' · '));

      const fromCustodian = selectedItem?.currentCustodian;
      const targetEmp = employees.find((emp) => emp.id === targetEmployeeId);
      const fromLoc = storeLocationLabel(selectedItem?.storeLocation);
      const toLocObj = locations.find((l) => l.id === targetLocationId);
      const voucher: Model21Voucher = {
        approvalState: 'PENDING',
        model21No: model21No.trim(),
        fromEmployeeName: fromStore ? transferrerName || '—' : fromCustodian?.fullNameEn || '—',
        fromEmployeeId: fromStore ? storeMen.find((k) => k.employeeId === transferrerId)?.payrollId || '—' : fromCustodian?.payrollId || '—',
        book: book.trim() || '—',
        toEmployeeName: targetEmp?.fullNameEn || '—',
        toEmployeeId: targetEmp?.payrollId || '—',
        storeManName: fromStore ? undefined : transferrerName,
        items: [
          {
            sNo: 1,
            description: selectedItem?.name || '—',
            tagNumber: printedTag(selectedItem) || '—',
            serialNumber: selectedItem?.serialNumber || '',
            chassisNumber: chassisNumber.trim() || undefined,
            uom: selectedItem?.uom || 'EA',
            unit: transferQuantity,
            origCost,
            depreciation,
            bookValue,
            dateGc: transferDateGc,
            dateEc: formatGcToEc(transferDateGc),
            fromLocation: fromLoc,
            // No new location chosen: the item stays in the same store
            toLocation: toLocObj ? storeLocationLabel(toLocObj) : fromLoc,
            plateNo: plateNo.trim() || undefined,
            engineNo: engineNo.trim() || undefined,
            accessories: accessories.length > 0 ? accessories : undefined,
            tireNos: tireList.length > 0 ? tireList : undefined,
            remark: defectRemark.trim() || undefined,
          },
          ...sent.map((o, i) => ({
            sNo: i + 2,
            description: o.asset.name,
            tagNumber: printedTag(o.asset),
            serialNumber: o.asset.serialNumber || '',
            uom: o.asset.uom || 'EA',
            unit: o.unit,
            origCost: o.origCost,
            depreciation: o.depreciation,
            bookValue: o.bookValue,
            dateGc: transferDateGc,
            dateEc: formatGcToEc(transferDateGc),
            fromLocation: storeLocationLabel(o.asset.storeLocation),
            toLocation: toLocObj ? storeLocationLabel(toLocObj) : storeLocationLabel(o.asset.storeLocation),
          })),
        ],
        printedBy: user?.fullNameEn,
      };
      toast.success(
        'Transfer submitted for approval',
        `${[selectedItem?.itemCode || 'The asset', ...sent.map((o) => o.asset.itemCode)].join(', ')} to ${targetEmp?.fullNameEn || 'the new custodian'}${sent.length ? ', each as its own request' : ''}. Custody changes after the Department Head approves it.`,
      );
      rememberForm(user?.id, 'transfer', { book: book.trim() });
      onSaved(voucher);
    } catch (err: any) {
      toast.error(editTransfer ? "The transfer couldn't be updated" : 'Transfer failed', err.message || 'Try again.');
      // a failed return leaves the form as it is, so the slip and the other fields are kept
    } finally {
      setSubmitting(false);
    }
  };

  const optionsFor = (row: TransferRow) => [
    {
      label: 'Issued assets',
      options: items
        .filter(
          (i) =>
            i.status === ItemStatus.ISSUED &&
            !i.heldByOrganization &&
            i.itemType !== ItemType.CONSUMABLE &&
            (i.id === row.itemId || !rows.some((r) => r.itemId === i.id))
        )
        .map((item) => {
          const pending = pendingByItem.get(item.id);
          const blocking = hasBlockingPending(item);
          const total = Number(item.quantity) || 1;
          const rem = remainingBalanceOf(item, editTransfer?.id);
          const pendingUnits = pendingUnitsOf(item.id, editTransfer?.id);
          const pendingText = pendingUnits > 0
            ? `${rem} of ${total} ${item.uom || 'EA'} available (${pendingUnits} pending on Model 21)`
            : `${total} ${item.uom || 'EA'}`;
          return {
            value: item.id,
            label: `${item.itemCode} — ${item.name}`,
            note: `${pendingText} · ${item.currentCustodian?.fullNameEn || 'assigned'}${pending && pendingUnits === 0 ? ` · ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}`,
            disabled: blocking,
          };
        }),
    },
    {
      label: 'In store',
      options: items
        .filter(
          (i) =>
            (i.status === ItemStatus.AVAILABLE || i.status === ItemStatus.UNDER_TRANSFER) &&
            (i.id === row.itemId || !rows.some((r) => r.itemId === i.id))
        )
        .map((item) => {
          const pending = pendingByItem.get(item.id);
          const blocking = hasBlockingPending(item);
          const total = Number(item.quantity) || 1;
          const rem = remainingBalanceOf(item, editTransfer?.id);
          const pendingUnits = pendingUnitsOf(item.id, editTransfer?.id);
          const pendingText = pendingUnits > 0
            ? `${rem} of ${total} ${item.uom || 'EA'} available (${pendingUnits} pending on Model 21)`
            : `${total} ${item.uom || 'EA'}`;
          return {
            value: item.id,
            label: `${item.itemCode} — ${item.name}`,
            note: `${pendingText} · in ${storeLocationLabel(item.storeLocation)}${pending && pendingUnits === 0 ? ` · ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}`,
            disabled: blocking,
          };
        }),
    },
  ];

  const totalOrigCost = rows.reduce((sum, r) => {
    const it = rowItemOf(r);
    return sum + (it ? valueOf(it, r.quantity) : 0);
  }, 0);
  const totalDepreciation = rows.reduce((sum, r) => sum + (r.depreciation || 0), 0);
  const totalBookValue = rows.reduce((sum, r) => sum + (r.bookValue || 0), 0);
  const hasVehicleLike = rows.some((r) => {
    const it = rowItemOf(r);
    return it?.category === 'VEHICLE' || it?.category === 'AGRI_MACHINERY';
  });

  return (
    <form id="transfer-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(!submitting)} className="space-y-4">

      {/* The IFMIS PDF first: it fills in the form */}
      {(!editTransfer || !showScannedSlipField) && (
        <FileDropField
          label="IFMIS Model 21 PDF"
          accent="emerald"
          required={false}
          fileName={readFile?.name ?? (!showScannedSlipField && editTransfer?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editTransfer.ifmisSlipAttachmentUrl) : '')}
          accept={SLIP_ACCEPT_ATTR}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) readSlip(file);
          }}
          file={readFile}
          savedUrl={!showScannedSlipField ? editTransfer?.ifmisSlipAttachmentUrl : undefined}
          emptyText="Click to choose the Model 21 PDF saved from IFMIS, or a photo"
          hint={
            showScannedSlipField
              ? "The form fills itself in from it; a scanned PDF can't be read."
              : "Autofills form fields and attaches this PDF directly to the transfer request."
          }
        />
      )}
      {slipNote && (
        <FormNotice icon={FileText} tone={slipNote.tone}>
          <span role="status">{slipNote.text}</span>
        </FormNotice>
      )}
      {unknownTags.length > 0 && (
        <LearnTagPrompt
          tags={unknownTags}
          candidates={taggableAssets(editItem ? [editItem] : items, learnedTags.current).filter((a) => !matchedIds.has(a.id))}
          suggestedId={editTransfer?.itemId ?? selectedItemId}
          onLearned={tagLearned}
        />
      )}
      {extraAssets.length > 0 && (
        <OtherAssets
          label="Other assets on this form"
          note={isReturn ? 'each that fits is returned to the same store as its own request' : 'each that fits is transferred as its own request, to the same recipient'}
          okLabel={isReturn ? 'Will be returned' : 'Will be transferred'}
          notLabel={isReturn ? 'Not returned' : 'Not transferred'}
          assets={extraAssets.map((o) => ({ key: o.key, code: o.asset?.itemCode ?? o.line.tagNumber ?? '—', name: o.asset?.name ?? o.line.description, problem: o.problem }))}
          onLeaveOut={(key) => {
            const target = extraAssets.find((x) => x.key === key);
            if (target?.asset?.id) {
              setMatchedIds((ids) => {
                const next = new Set(ids);
                next.delete(target.asset!.id);
                return next;
              });
            }
            setExtraAssets((list) => list.filter((x) => x.key !== key));
          }}
        />
      )}

      <Part title="Voucher">
        <FieldGrid>
          <Field
            label="Model 21 No." optional
            error={errorOf('model21No')}
            warning={usedNo && !isPendingModel21 ? usedMessage(model21No, usedNo) : undefined}
            hint={isPendingModel21 ? `Appending to pending Model 21 voucher #${model21No.trim()} (${usedNo.itemCode})` : undefined}
          >
            <input
              type="text"
              value={model21No}
              onChange={(e) => setModel21No(e.target.value)}
              onBlur={touch('model21No')}
              autoFocus={!editTransfer && !!initialItemId}
              placeholder="Number on the Model 21 form"
              className={`${input({ mono: true, invalid: !!errorOf('model21No') })} font-semibold`}
            />
          </Field>

          <Field label="Book" optional error={errorOf('book')}>
            <input
              type="text"
              value={book}
              onChange={(e) => setBook(e.target.value)}
              onBlur={touch('book')}
              placeholder="Book the form comes from"
              className={input({ invalid: !!errorOf('book') })}
            />
          </Field>

          <Field
            label="Transfer date (G.C.)" optional
            htmlFor="transfer-date"
            error={errorOf('date')}
            hint={transferDateGc ? `${formatGcToEc(transferDateGc)} E.C. · today unless you change it` : undefined}
          >
            <input
              id="transfer-date"
              type="date"
              max={todayGc}
              value={transferDateGc}
              onChange={(e) => setTransferDateGc(e.target.value)}
              onBlur={touch('date')}
              className={input({ mono: true, invalid: !!errorOf('date') })}
            />
          </Field>
        </FieldGrid>
        {isPendingModel21 && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-sky-50 border border-sky-200 p-2.5 text-xs text-sky-800">
            <FileText className="h-4 w-4 shrink-0 text-sky-600" />
            <span>
              <strong>Model 21 #{model21No.trim()}</strong> currently has pending request(s) for <strong>{usedNo.itemCode}</strong>. Submitting this form will append this asset to that voucher.
            </span>
          </div>
        )}
      </Part>

      <Part
        title={rows.length > 1 ? `Assets (${rows.length})` : 'Asset'}
        aside={
          <span className="text-[11px] text-slate-500">
            Fixed assets in store and assets issued to a custodian are listed. Consumables are issued, not transferred.
          </span>
        }
      >
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr className="text-xs font-medium text-slate-600">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2 min-w-[260px]">Asset</th>
                  <th className="px-2 py-2 w-16">Unit</th>
                  <th className="px-2 py-2 min-w-[140px]">Current holder / location</th>
                  <th className="px-2 py-2 w-20 text-right">Available</th>
                  <th className="px-2 py-2 w-24 text-right">Qty</th>
                  <th className="px-2 py-2 w-28 text-right">Orig. cost</th>
                  <th className="px-2 py-2 w-28 text-right">Book value</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const n = i + 1;
                  const item = rowItemOf(row);
                  const total = Number(item?.quantity) || 1;
                  const remaining = remainingBalanceOf(item, editTransfer?.id);
                  const overStock = !!item && row.quantity > remaining;
                  const itemId = n === 1 ? 'transfer-item' : `transfer-item-${n}`;
                  const qtyId = n === 1 ? 'transfer-quantity' : `transfer-quantity-${n}`;
                  const rowOrigCost = item ? valueOf(item, row.quantity) : 0;
                  return (
                    <tr key={row.key} className="align-top">
                      <td className="px-2 py-1.5 pt-3.5 font-mono text-slate-500">{n}</td>
                      <td className="px-2 py-1.5">
                        {editTransfer ? (
                          <p className="pt-2 text-slate-800">
                            <span className="font-mono font-semibold">{editTransfer.itemCode}</span> — {editTransfer.itemName}
                            <span className="block text-[10px] text-slate-500">
                              The asset can't be changed. To transfer a different asset, ask an approver to reject this request.
                            </span>
                          </p>
                        ) : (
                          <>
                            <label htmlFor={itemId} className="sr-only">
                              {n === 1 ? 'Asset' : `Item ${n} asset`}
                            </label>
                            <SearchableSelect
                              id={itemId}
                              value={row.itemId}
                              onChange={(id) => chooseRowItem(row.key, id)}
                              placeholder={items.length === 0 ? 'No assets available' : 'Select an asset…'}
                              searchPlaceholder="Search by name, code or custodian…"
                              groups={optionsFor(row)}
                            />
                            {item && (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Tag: <span className="font-mono">{item.itemCode}</span>
                                {item.serialNumber ? ` · S/N: ${item.serialNumber}` : ''}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 font-mono text-slate-700">{item ? (item.uom || 'EA') : '—'}</td>
                      <td className="px-2 py-1.5 pt-3.5 text-slate-700">
                        {item
                          ? item.status === ItemStatus.AVAILABLE
                            ? `Store: ${storeLocationLabel(item.storeLocation)}`
                            : item.currentCustodian?.fullNameEn || 'Assigned'
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">
                        {item
                          ? remaining < total
                            ? `${remaining} of ${total} ${item.uom || 'EA'}`
                            : `${total} ${item.uom || 'EA'}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <label htmlFor={qtyId} className="sr-only">
                          {n === 1 ? 'Quantity to transfer' : `Item ${n} quantity`}
                        </label>
                        <QuantityInput
                          id={qtyId}
                          min={1}
                          max={item ? remaining : undefined}
                          value={row.quantity}
                          onChange={(q) => setRow(row.key, { quantity: q })}
                          disabled={!item}
                          className={cellClass({ align: 'right', mono: true, invalid: overStock })}
                        />
                        {overStock && (
                          <p className="mt-0.5 text-right text-[10px] text-rose-700">
                            Only {remaining} remaining
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">
                        {item ? formatETB(rowOrigCost) : '—'}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700 font-semibold">
                        {item ? formatETB(row.bookValue) : '—'}
                      </td>
                      <td className="px-1 py-1.5 pt-3">
                        {!editTransfer && rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            aria-label={`Remove item ${n}`}
                            title="Remove this asset from voucher"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600">
                <tr className="align-middle">
                  <td colSpan={editTransfer ? 4 : 5} className="px-2 py-1.5">
                    {!editTransfer && (
                      <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add item
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">
                    Total
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono tabular-nums text-slate-700">
                    {formatETB(totalOrigCost)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="block font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {formatETB(totalBookValue)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Field
            label="Accumulated depreciation (ETB)"
            optional
            hint={
              rows.length > 1
                ? `Total original cost: ${formatETB(totalOrigCost)} · Net book value: ${formatETB(totalBookValue)}`
                : `Net book value: ${formatETB(rows[0]?.bookValue || 0)}`
            }
          >
            <MoneyInput
              value={rows[0]?.depreciation || 0}
              onChange={(val) => {
                if (rows[0]) {
                  setRow(rows[0].key, { depreciation: val });
                }
              }}
            />
          </Field>
        </div>
      </Part>

      <Part title={isReturn ? 'From and back to store' : 'From and to'}>
        <div className="space-y-3.5">
          <FieldGrid cols={2}>
            <Field label={fromStore ? 'From (store)' : 'From (current custodian)'}>
              <ReadOnlyValue>
                {fromStore
                  ? `${storeLocationLabel(selectedItemObj?.storeLocation)} (in store)`
                  : selectedItemObj?.currentCustodian
                    ? `${selectedItemObj.currentCustodian.fullNameEn} (${selectedItemObj.currentCustodian.payrollId})`
                    : 'Select an asset first'}
              </ReadOnlyValue>
            </Field>

            {/* Offered for an asset that is issued: choosing a store makes this a transfer back to that store */}
            {!fromStore && (!editTransfer || isReturnEdit) && (
              <Field
                label="Return to store"
                
                htmlFor="transfer-return-to-store"
                hint={isReturn ? undefined : 'Leave empty to transfer to an employee. Choose a store to take the asset back to it.'}
              >
                <select
                  id="transfer-return-to-store"
                  value={returnToId}
                  onChange={(e) => setReturnToId(e.target.value)}
                  className={input()}
                >
                  {!isReturnEdit && <option value="">— Transfer to an employee —</option>}
                  {keepers.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {!isReturn && (
            <Field label="To employee" optional htmlFor="transfer-recipient" hint="Type a name or employee ID.">
              <SearchableSelect
                id="transfer-recipient"
                value={targetEmployeeId}
                onChange={handleRecipientChange}
                placeholder="Select an employee…"
                searchPlaceholder="Search by name or employee ID…"
                groups={[
                  {
                    label: 'Employees',
                    options: employees.map((emp) => ({
                      value: emp.id,
                      label: `${emp.fullNameEn} (${emp.payrollId})`,
                      // The person who holds it can't also receive it
                      disabled: emp.id === selectedItemObj?.currentCustodianId,
                      note: emp.id === selectedItemObj?.currentCustodianId ? 'holds this asset now' : undefined,
                    })),
                  },
                ]}
              />
            </Field>

            )}

            {!isReturn && (
            <Field
              label="To directorate"
              optional
              hint={isUnassignedDepartment(departments.find((d) => d.id === targetDepartmentId)) ? undefined : "Filled in from the new custodian; change it if needed."}
              warning={
                isUnassignedDepartment(departments.find((d) => d.id === targetDepartmentId))
                  ? 'Directorate is unassigned. Go to Settings → Employees to assign their directorate.'
                  : undefined
              }
            >
              <SearchableSelect
                id="transfer-directorate"
                value={targetDepartmentId}
                onChange={(val) => setTargetDepartmentId(val)}
                placeholder="Select…"
                searchPlaceholder="Type to search directorates…"
                groups={[{
                  label: 'Directorates',
                  options: departments.map((dep) => ({
                    value: dep.id,
                    label: departmentLabel(dep),
                  })),
                }]}
              />
            </Field>
            )}
          </FieldGrid>

          {isReturn ? (
            <>
              <FieldGrid cols={2}>
                <StoreManField
                  id="transfer-receiver"
                  label="Received by (store man)"
                  keepers={returnStoreMen}
                  ready={keepers.ready}
                  storeName={keepers.storeName(returnLocation?.storeId ?? selectedItemObj?.storeLocation?.storeId)}
                  value={storeReceiverId}
                  onChange={setStoreReceiverId}
                  current={editTransfer ? editTransfer.requestDetails?.storeRecipientName : undefined}
                  
                />
              </FieldGrid>

              <Field label="Reason for return" optional htmlFor="transfer-return-reason" error={errorOf('reason')}>
                <input
                  id="transfer-return-reason"
                  type="text"
                  placeholder="e.g. Project field work completed, returning asset to store"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  onBlur={touch('reason')}
                  className={input({ invalid: !!errorOf('reason') })}
                />
              </Field>
            </>
          ) : (
          <StoreManField
            id="transfer-store-man"
            label={fromStore ? 'Transferred by (store man)' : 'Recorded by (store man)'}
            keepers={storeMen}
            ready={keepers.ready}
            storeName={keepers.storeName(selectedItemObj?.storeLocation?.storeId)}
            hasStore={!!selectedItemObj}
            value={transferredById}
            onChange={setTransferredById}
            current={editTransfer ? editTransfer.requestDetails?.transferredByName : undefined}
            
          />
          )}

          <Field label="Defects / remarks" optional>
            <textarea
              rows={2}
              value={defectRemark}
              onChange={(e) => setDefectRemark(e.target.value)}
              placeholder="e.g. The right side mirror is missing. Both rear lights are broken."
              className={textareaClass('emerald')}
            />
          </Field>
        </div>
      </Part>

      {/* ── Vehicle and machinery details: for vehicles and machinery, when the PDF gave some, or when asked for ── */}
      {!(showVehicle || hasVehicleLike || selectedIsVehicleLike || !!(chassisNumber.trim() || plateNo.trim() || engineNo.trim() || tireSerials.trim())) ? (
        <button
          type="button"
          onClick={() => setShowVehicle(true)}
          className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
        >
          <Car className="h-3.5 w-3.5" />
          Add vehicle details (chassis, plate, engine, accessories, tires)
        </button>
      ) : (
      <Part title="Vehicle details">
        <div className="space-y-3.5">
          <FieldGrid>
            <Field label="Chassis number" optional htmlFor="transfer-chassis">
              <input id="transfer-chassis" type="text" placeholder="e.g. JTEBB71JX07008920" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} className={input({ mono: true })} />
            </Field>
            <Field label="Plate number" optional htmlFor="transfer-plate">
              <input id="transfer-plate" type="text" placeholder="e.g. 4-23794" value={plateNo} onChange={(e) => setPlateNo(e.target.value)} className={input({ mono: true })} />
            </Field>
            <Field label="Engine number" optional htmlFor="transfer-engine">
              <input id="transfer-engine" type="text" placeholder="e.g. 1HZ-0641864" value={engineNo} onChange={(e) => setEngineNo(e.target.value)} className={input({ mono: true })} />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
            <Field label="Jack with handle (qty)" htmlFor="transfer-jack">
              <QuantityInput id="transfer-jack" value={jackQty} onChange={setJackQty} />
            </Field>
            <Field label="Tire wrench (qty)" htmlFor="transfer-wrench">
              <QuantityInput id="transfer-wrench" value={tireWrenchQty} onChange={setTireWrenchQty} />
            </Field>
            <Field label="Keys (qty)" htmlFor="transfer-keys">
              <QuantityInput id="transfer-keys" value={keyQty} onChange={setKeyQty} />
            </Field>
            <Field label="Reserve tyre (qty)" htmlFor="transfer-reserve">
              <QuantityInput id="transfer-reserve" value={reserveTyreQty} onChange={setReserveTyreQty} />
            </Field>
          </FieldGrid>

          <Field label="Tire serial numbers" optional htmlFor="transfer-tires" hint="Separate with commas or new lines">
            <input
              id="transfer-tires"
              type="text"
              placeholder="e.g. R240514711, R240504703, YY0219"
              value={tireSerials}
              onChange={(e) => setTireSerials(e.target.value)}
              className={input({ mono: true })}
            />
          </Field>
        </div>
      </Part>
      )}

      {/* The signed Model 21, scanned: kept as the request's copy (the IFMIS PDF until it is added) */}
      {showScannedSlipField && (
        <div id="transfer-signed-copy">
          <FileDropField
            label="Signed copy"
            accent="emerald"
            required={false}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSlipSelected}
            file={attachmentFile}
            savedUrl={editTransfer?.ifmisSlipAttachmentUrl}
            emptyText="Click to attach the signed Model 21, scanned"
            hint="The IFMIS printout with its signatures, as a scan or photo. Until it is added, the IFMIS PDF is kept as the copy."
          />
        </div>
      )}

      {/* The slip itself, open under the form, to check what was filled in against it */}
      <SlipPreview ifmisFile={readFile} signedFile={attachmentFile} savedUrl={editTransfer?.ifmisSlipAttachmentUrl} />


      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={editTransfer ? (editTransfer.status === 'REJECTED' ? 'Save and resubmit' : 'Save changes') : isReturn ? 'Submit return to store for approval' : 'Submit transfer for approval'}
        missingFields={missingFields}
        fieldTargets={{ quantity: '#transfer-quantity', recipient: '#transfer-recipient', 'store man': '#transfer-store-man', 'signed copy': '#transfer-signed-copy input[type=file]' }}
        onCancel={onCancel}
      />
    </form>
  );
};

/** Model 21 voucher for a transfer or return, rebuilt from what was recorded with the request */
export const buildModel21Voucher = async (
  r: TransactionApproval,
  context: { item?: ItemWithRelations; employees: Employee[]; locations: Location[]; printedBy?: string; requests?: TransactionApproval[]; items?: ItemWithRelations[] },
): Promise<Model21Voucher> => {
  const { employees, locations } = context;
  const d = r.requestDetails ?? {};
  let item = context.item;
  let fromName = '—';
  try {
    // The full history says who held the asset when the request was made
    item = (await api.getItemById(r.itemId)) ?? item;
    const requested = item?.history?.find((h) => /_REQUESTED$/.test(h.action) && h.ifmisSlipNumber === r.ifmisSlipNumber);
    fromName = requested?.fromEntity || item?.currentCustodian?.fullNameEn || '—';
  } catch {
    fromName = item?.currentCustodian?.fullNameEn || '—';
  }
  // Handed over from the store: its store man is the transferor
  if (d.fromStore && d.transferredByName) fromName = d.transferredByName;
  const fromEmp = employees.find((e) => e.fullNameEn === fromName);
  const toEmp =
    r.transactionType === 'TRANSFER'
      ? employees.find((e) => e.id === r.recipientEmployeeId) || r.recipientEmployee
      : employees.find((e) => e.id === d.storeRecipientId);
  const units = Number(d.quantity) || Number(item?.quantity) || 1;
  const origCost = d.origCost ?? valueOf(item, units);
  const fromLoc = storeLocationLabel(item?.storeLocation);
  const toLocation = locations.find((l) => l.id === r.targetLocationId);
  const storeName = toLocation ? storeLocationLabel(toLocation) : fromLoc || 'Store';
  const todayGc = new Date().toISOString().split('T')[0];
  const requestDateGc = r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10);

  const siblings = (context.requests ?? []).filter(
    (other) =>
      other.id !== r.id &&
      other.ifmisSlipNumber &&
      other.ifmisSlipNumber === r.ifmisSlipNumber &&
      (other.transactionType === 'TRANSFER' || other.transactionType === 'RETURN')
  );

  const extraItems = siblings.map((sib, i) => {
    const sibDetails = sib.requestDetails ?? {};
    const sibItem = (context.items ?? []).find((it) => it.id === sib.itemId);
    const sibUnits = Number(sibDetails.quantity) || Number(sibItem?.quantity) || 1;
    const sibOrigCost = sibDetails.origCost ?? valueOf(sibItem, sibUnits);
    const sibFromLoc = storeLocationLabel(sibItem?.storeLocation);
    const sibToLocation = locations.find((l) => l.id === sib.targetLocationId);
    return {
      sNo: i + 2,
      description: sib.itemName,
      tagNumber: sibItem?.ifmisTagNumber || sib.itemCode,
      serialNumber: sibItem?.serialNumber || '',
      chassisNumber: sibDetails.chassisNumber || undefined,
      uom: sibItem?.uom || 'EA',
      unit: sibUnits,
      origCost: sibOrigCost,
      depreciation: sibDetails.depreciation ?? 0,
      bookValue: sibDetails.bookValue ?? sibOrigCost,
      dateGc: requestDateGc,
      dateEc: r.ifmisSlipDateEc || formatGcToEc(requestDateGc),
      fromLocation: sibFromLoc,
      toLocation: sibToLocation ? storeLocationLabel(sibToLocation) : sibFromLoc,
      plateNo: sibDetails.plateNo || undefined,
      engineNo: sibDetails.engineNo || undefined,
      accessories: sibDetails.accessories && sibDetails.accessories.length > 0 ? sibDetails.accessories : undefined,
      tireNos: sibDetails.tireNos && sibDetails.tireNos.length > 0 ? sibDetails.tireNos : undefined,
      remark: formatVoucherRemark(sibDetails.remark) || undefined,
    };
  });

  return {
    approvalState: r.status === ApprovalStatus.PENDING ? 'PENDING' : r.status === ApprovalStatus.REJECTED ? 'REJECTED' : r.status === ApprovalStatus.CANCELLED ? 'CANCELLED' : undefined,
    approvalNote: approvalNoteOf(r),
    model21No: r.ifmisSlipNumber || '—',
    fromEmployeeName: fromName,
    fromEmployeeId: fromEmp?.payrollId || '—',
    book: d.book || '—',
    toEmployeeName: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? d.storeRecipientName || storeName : '—'),
    toEmployeeId: toEmp?.payrollId || '—',
    storeManName: r.transactionType === 'TRANSFER' && !d.fromStore ? d.transferredByName : undefined,
    isReturn: r.transactionType === 'RETURN',
    returnReason: r.transactionType === 'RETURN' ? d.reason || undefined : undefined,
    items: [
      {
        sNo: 1,
        description: r.itemName,
        tagNumber: item?.ifmisTagNumber || r.itemCode,
        serialNumber: item?.serialNumber || '',
        chassisNumber: d.chassisNumber || undefined,
        uom: item?.uom || 'EA',
        unit: units,
        origCost,
        depreciation: d.depreciation ?? 0,
        bookValue: d.bookValue ?? origCost,
        dateGc: requestDateGc,
        dateEc: r.ifmisSlipDateEc || formatGcToEc(requestDateGc),
        fromLocation: fromLoc,
        toLocation: toLocation ? storeLocationLabel(toLocation) : fromLoc,
        plateNo: d.plateNo || undefined,
        engineNo: d.engineNo || undefined,
        accessories: d.accessories && d.accessories.length > 0 ? d.accessories : undefined,
        tireNos: d.tireNos && d.tireNos.length > 0 ? d.tireNos : undefined,
        remark: formatVoucherRemark(d.remark) || undefined,
      },
      ...extraItems,
    ],
    printedBy: context.printedBy,
    signatories: [
      { label: 'Transferor', name: fromName },
      ...(r.transactionType === 'TRANSFER' && !d.fromStore && d.transferredByName ? [{ label: 'Recorded By', name: d.transferredByName }] : []),
      { label: 'FAMU Accountant' },
      { label: 'Recipient', name: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? d.storeRecipientName || storeName : '—') },
      getEndorserSignatory(r, { isEndorsed: r.status === ApprovalStatus.APPROVED || r.currentStage >= 2 }),
      getAuthorizerSignatory(r, { isApproved: r.status === ApprovalStatus.APPROVED, totalAmount: origCost + extraItems.reduce((s, it) => s + it.origCost, 0) }),
    ],
  };
};
