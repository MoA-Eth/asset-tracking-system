import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, Car } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations, ItemStatus, ItemType, ItemCondition, Department, Employee, Location, Model21Voucher, TransactionApproval, ApprovalStatus } from '../../types/asset-management';
import { formatVoucherRemark } from '../../utils/voucher-remark';
import { FormSection, FieldGrid, Field, ReadOnlyValue, SummaryGrid, FormFooter, FileDropField, FormNotice, QuantityInput, MoneyInput, inputClass, textareaClass, submitOnCtrlEnter } from '../ui/FormKit';
import { readPdfRows, rowsToText, isModel19, isModel21, parseModel21, parseModel21Particulars, sameEmployeeId, Model21SlipFields, Model21SlipLine, Model21Particulars } from '../../utils/slip-reader';
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
import { departmentLabel } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { storeLocationLabel } from '../../utils/location';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { useSlipRegister, usedMessage } from '../../hooks/useSlipRegister';

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

// ─── Transfer form (inside the pop-up) ──────────────────────────────────────

export interface TransferFormProps {
  items: ItemWithRelations[];
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  /** Open request per item: those items can't be chosen until it is decided */
  pendingByItem: Map<string, TransactionApproval>;
  /** When set, the form corrects this pending transfer instead of creating a new one */
  editTransfer?: TransactionApproval;
  /** Asset chosen before the form opened, e.g. from its row in the register */
  initialItemId?: string;
  /** A Model 21 PDF chosen with the form's header button: it is read into the form */
  slip?: File;
  onCancel: () => void;
  onSaved: (voucher?: Model21Voucher) => void;
  /** An asset changed while the form was open, e.g. its IFMIS tag number was recorded */
  onItemUpdated?: (item: ItemWithRelations) => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({ items, employees, departments, locations, pendingByItem, editTransfer, initialItemId, slip, onCancel, onSaved, onItemUpdated }) => {
  const { user } = useAuth();
  const toast = useToast();
  const details = editTransfer?.requestDetails ?? {};
  // A new transfer starts from the last one this person made: the same book, and the number to continue from
  const memory = editTransfer ? {} : recallForm(user?.id, 'transfer');
  const slips = useSlipRegister();
  const editItem = editTransfer ? items.find((i) => i.id === editTransfer.itemId) : undefined;
  const qtyOf = (name: string) => details.accessories?.find((a) => a.name === name)?.quantity ?? 0;

  const [selectedItemId, setSelectedItemId] = useState(editTransfer?.itemId ?? '');
  const [model21No, setModel21No] = useState(editTransfer?.ifmisSlipNumber ?? '');
  const [book, setBook] = useState(details.book ?? memory.book ?? '');
  const [targetEmployeeId, setTargetEmployeeId] = useState(editTransfer?.recipientEmployeeId ?? '');
  const [targetDepartmentId, setTargetDepartmentId] = useState(editTransfer?.targetDepartmentId ?? '');
  const [targetLocationId, setTargetLocationId] = useState(editTransfer?.targetLocationId ?? '');
  const [chassisNumber, setChassisNumber] = useState(details.chassisNumber ?? editItem?.serialNumber ?? '');
  const [plateNo, setPlateNo] = useState(details.plateNo ?? '');
  const [engineNo, setEngineNo] = useState(details.engineNo ?? '');
  const [depreciation, setDepreciation] = useState<number>(details.depreciation ?? 0);
  const [bookValue, setBookValue] = useState<number>(details.bookValue ?? (editItem ? valueOf(editItem, Number(editItem.quantity) || 1) : 0));
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

  const selectedItemObj = items.find((i) => i.id === selectedItemId);
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
    setSelectedItemId(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item && item.status === ItemStatus.AVAILABLE) setReturnToId('');
    if (item) {
      setDepreciation(0);
      setBookValue(valueOf(item, Number(item.quantity) || 1));
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

  // Opened from an asset's row: start with that asset chosen
  useEffect(() => {
    if (!editTransfer && initialItemId) handleItemSelect(initialItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * Whether the asset a Model 21 line names can be transferred, in the order of its life: received and approved, a
   * fixed asset, issued to the employee the form transfers it from (or still in store), with no other request waiting.
   */
  const checkLine = (line: Model21SlipLine | undefined, slip: Model21SlipFields): { asset?: ItemWithRelations; problem?: string } => {
    if (!line?.tagNumber?.trim()) return { problem: 'The form names no asset tag number.' };
    const asset = findByTag(items, line.tagNumber, learnedTags.current);
    if (!asset) return { problem: `No asset here has the tag ${line.tagNumber}. If it was received under another code, record the tag on it below; otherwise it has to be received on a Model 19 and approved first.` };
    const problem =
      asset.itemType === ItemType.CONSUMABLE
        ? `${asset.itemCode} is a consumable item; consumables are issued, not transferred.`
        : asset.status !== ItemStatus.ISSUED && asset.status !== ItemStatus.AVAILABLE
          ? `${asset.itemCode} is ${STATUS_WORDS[asset.status] ?? asset.status.toLowerCase()}; only an issued asset, or a fixed asset in store, can be transferred.`
          : asset.status === ItemStatus.ISSUED && asset.heldByOrganization
            ? `${asset.itemCode} is held by ${asset.heldByOrganization}, outside the Ministry.`
            : pendingByItem.has(asset.id) && pendingByItem.get(asset.id)!.id !== editTransfer?.id
              ? `${asset.itemCode} already has a request waiting for approval.`
              : asset.status === ItemStatus.ISSUED && slip.fromEmployeeId && !sameEmployeeId(asset.currentCustodian?.payrollId, slip.fromEmployeeId)
                ? `${asset.itemCode} is held by ${asset.currentCustodian?.fullNameEn ?? 'someone else'}, not by the employee the form transfers it from (${slip.fromName ?? slip.fromEmployeeId}).`
                : undefined;
    return { asset, problem };
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
    if (first.problem) problems.push(first.problem);
    else if (first.asset) {
      const asset = first.asset;
      if (!editTransfer && asset.id !== selectedItemId) {
        handleItemSelect(asset.id);
        filled.push(`asset (${asset.itemCode})`);
      }
      setReturnToId('');
      if (line?.depreciation !== undefined) {
        setDepreciation(line.depreciation);
        filled.push('depreciation');
      }
      if (line?.bookValue !== undefined) {
        setBookValue(line.bookValue);
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

    // Who receives it: only once the asset itself fits
    if (usable && slip.toEmployeeId) {
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
          return { key: i, line: l, asset: checked.asset, problem: sameAsFirst ? `${checked.asset!.itemCode} is already the first asset on this form.` : checked.problem };
        });
    setExtraAssets(others);
    const ready = others.filter((o) => o.asset && !o.problem).length;

    const more =
      others.length > 0
        ? ` The form lists ${slip.lines.length} assets: the first is in the form and the others are listed under it${ready ? `; ${ready} of them will be transferred as their own requests when you submit` : ''}.`
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
        if (isModel21(text)) return fillFromModel21(parseModel21(text), parseModel21Particulars(rows));
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

  // A field shows what is wrong with it once the user has been in it
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (key: string) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const problems: Record<string, string | false> = {};
  const errorOf = (key: string) => (touched[key] && problems[key] ? (problems[key] as string) : undefined);

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !selectedItemId && 'asset',
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
          toast.success('Transfer updated', `The transfer of ${editTransfer.itemCode} to store was corrected. It is still waiting for Team Leader endorsement.`);
          onSaved();
          return;
        }
        const origCost = valueOf(item, Number(item?.quantity) || 1);
        await api.registerReturn({
          itemId: selectedItemId,
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
              unit: Number(item?.quantity) || 1,
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
          ],
          printedBy: user?.fullNameEn,
        };
        toast.success(
          'Return to store submitted for approval',
          `${item?.itemCode || 'The asset'} (${model21No.trim()}) is registered for Department Head approval and stays with its custodian until then.`,
        );
        rememberForm(user?.id, 'transfer', { book: book.trim() });
        onSaved(returnVoucher);
        return;
      }

      if (editTransfer) {
        await api.updateTransfer(editTransfer.id, {
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
        toast.success('Transfer updated', `The transfer of ${editTransfer.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSaved();
        return;
      }

      const selectedItem = selectedItemObj;
      const origCost = valueOf(selectedItem, Number(selectedItem?.quantity) || 1);
      await api.transferItem({
        itemId: selectedItemId,
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

      // The other assets on the Model 21, each its own request with the same number, book, date and recipient
      const sent: typeof extraReady = [];
      const notSent: string[] = [];
      for (const other of isReturn ? [] : extraReady) {
        try {
          const men = keepers.ofLocation(other.asset.storeLocationId);
          await api.transferItem({
            itemId: other.asset.id,
            ifmisSlipAttachmentUrl: slipUrl,
            toEmployeeId: targetEmployeeId,
            toDepartmentId: targetDepartmentId || undefined,
            performedById: user?.id || '',
            transferredByEmployeeId: men.some((k) => k.employeeId === transferrerId) ? transferrerId : undefined,
            ifmisSlipDateGc: transferDateGc,
            model21No: model21No.trim(),
            book: book.trim(),
            origCost: other.line.origCost ?? valueOf(other.asset, Number(other.asset.quantity) || 1),
            depreciation: other.line.depreciation,
            bookValue: other.line.bookValue,
          });
          sent.push(other);
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
            unit: Number(selectedItem?.quantity) || 1,
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
            unit: Number(o.asset.quantity) || 1,
            origCost: o.line.origCost ?? valueOf(o.asset, Number(o.asset.quantity) || 1),
            depreciation: o.line.depreciation ?? 0,
            bookValue: o.line.bookValue ?? valueOf(o.asset, Number(o.asset.quantity) || 1),
            dateGc: transferDateGc,
            dateEc: formatGcToEc(transferDateGc),
            fromLocation: storeLocationLabel(o.asset.storeLocation),
            toLocation: storeLocationLabel(o.asset.storeLocation),
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
      {extraAssets.length > 0 && !isReturn && (
        <OtherAssets
          label="Other assets on this form"
          note="each that fits is transferred as its own request, to the same recipient"
          okLabel="Will be transferred"
          notLabel="Not transferred"
          assets={extraAssets.map((o) => ({ key: o.key, code: o.asset?.itemCode ?? o.line.tagNumber ?? '—', name: o.asset?.name ?? o.line.description, problem: o.problem }))}
          onLeaveOut={(key) => setExtraAssets((list) => list.filter((x) => x.key !== key))}
        />
      )}

      <Part title="Voucher">
        <FieldGrid>
          <Field
            label="Model 21 No." optional
            error={errorOf('model21No')}
            warning={usedNo ? usedMessage(model21No, usedNo) : undefined}
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
      </Part>

      <Part title="Asset">
        <div className="space-y-3.5">
          {editTransfer ? (
            <Field label="Issued asset" hint="The asset can't be changed. To transfer a different asset, ask an approver to reject this request.">
              <ReadOnlyValue mono>
                {editTransfer.itemCode} — {editTransfer.itemName}
              </ReadOnlyValue>
            </Field>
          ) : (
            <Field label="Asset" optional htmlFor="transfer-item" hint="Fixed assets in store and assets issued to a custodian are listed. Consumables are issued, not transferred. Type a name, code or custodian to find one.">
              <SearchableSelect
                id="transfer-item"
                value={selectedItemId}
                onChange={handleItemSelect}
                placeholder="Select an asset…"
                searchPlaceholder="Search by name, code or custodian…"
                groups={[
                  {
                    label: 'Issued assets',
                    options: items
                      .filter((i) => i.status === ItemStatus.ISSUED && !i.heldByOrganization && i.itemType !== ItemType.CONSUMABLE)
                      .map((item) => {
                        const pending = pendingByItem.get(item.id);
                        return {
                          value: item.id,
                          label: `${item.itemCode} — ${item.name}`,
                          note: `${item.quantity || 1} ${item.uom || 'EA'} · ${item.currentCustodian?.fullNameEn || 'assigned'}${pending ? ` · ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}`,
                          disabled: !!pending,
                        };
                      }),
                  },
                  {
                    label: 'In store (fixed assets)',
                    options: items
                      .filter((i) => i.status === ItemStatus.AVAILABLE && i.itemType !== ItemType.CONSUMABLE)
                      .map((item) => {
                        const pending = pendingByItem.get(item.id);
                        return {
                          value: item.id,
                          label: `${item.itemCode} — ${item.name}`,
                          note: `${item.quantity || 1} ${item.uom || 'EA'} · in ${storeLocationLabel(item.storeLocation)}${pending ? ` · ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}`,
                          disabled: !!pending,
                        };
                      }),
                  },
                ]}
              />
            </Field>
          )}

          {selectedItemObj && (
            <SummaryGrid
              items={[
                { label: 'Tag number', value: selectedItemObj.itemCode, mono: true },
                { label: 'Description', value: selectedItemObj.name },
                { label: 'Current location', value: storeLocationLabel(selectedItemObj.storeLocation) },
                {
                  label: `Original cost (${selectedItemObj.quantity || 1} ${selectedItemObj.uom || 'EA'})`,
                  value: formatETB(valueOf(selectedItemObj, Number(selectedItemObj.quantity) || 1)),
                  mono: true,
                },
              ]}
            />
          )}

          <FieldGrid cols={2}>
            <Field label="Accumulated depreciation (ETB)" optional hint={`Net book value: ${formatETB(bookValue)}`}>
              <MoneyInput
                value={depreciation}
                onChange={(val) => {
                  setDepreciation(val);
                  setBookValue(Math.max(0, valueOf(selectedItemObj, Number(selectedItemObj?.quantity) || 1) - val));
                }}
              />
            </Field>
          </FieldGrid>
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
            <Field label="To directorate" optional hint="Filled in from the new custodian; change it if needed.">
              <select value={targetDepartmentId} onChange={(e) => setTargetDepartmentId(e.target.value)} className={input()}>
                <option value="">Select…</option>
                {departments.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {departmentLabel(dep)}
                  </option>
                ))}
              </select>
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
      {!(showVehicle || selectedIsVehicleLike || !!(chassisNumber.trim() || plateNo.trim() || engineNo.trim() || tireSerials.trim())) ? (
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
        submitLabel={editTransfer ? 'Save changes' : isReturn ? 'Submit return to store for approval' : 'Submit transfer for approval'}
        missingFields={missingFields}
        fieldTargets={{ recipient: '#transfer-recipient', 'store man': '#transfer-store-man', 'signed copy': '#transfer-signed-copy input[type=file]' }}
        onCancel={onCancel}
      />
    </form>
  );
};

/** Model 21 voucher for a transfer or return, rebuilt from what was recorded with the request */
export const buildModel21Voucher = async (
  r: TransactionApproval,
  context: { item?: ItemWithRelations; employees: Employee[]; locations: Location[]; printedBy?: string },
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
  const units = Number(item?.quantity) || 1;
  const origCost = d.origCost ?? valueOf(item, units);
  const fromLoc = storeLocationLabel(item?.storeLocation);
  const toLocation = locations.find((l) => l.id === r.targetLocationId);
  const storeName = toLocation ? storeLocationLabel(toLocation) : fromLoc || 'Store';
  const todayGc = new Date().toISOString().split('T')[0];
  const requestDateGc = r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10);
  return {
    // Returned for correction is still waiting for approval
    approvalState: r.status === ApprovalStatus.PENDING || r.status === ApprovalStatus.RETURNED ? 'PENDING' : r.status === ApprovalStatus.REJECTED ? 'REJECTED' : undefined,
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
    ],
    printedBy: context.printedBy,
    signatories: [
      { label: 'Transferor', name: fromName },
      ...(r.transactionType === 'TRANSFER' && !d.fromStore && d.transferredByName ? [{ label: 'Recorded By', name: d.transferredByName }] : []),
      { label: 'FAMU Accountant' },
      { label: 'Recipient', name: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? d.storeRecipientName || storeName : '—') },
      getEndorserSignatory(r, { isEndorsed: r.status === ApprovalStatus.APPROVED || r.currentStage >= 2 }),
      getAuthorizerSignatory(r, { isApproved: r.status === ApprovalStatus.APPROVED, totalAmount: origCost }),
    ],
  };
};
