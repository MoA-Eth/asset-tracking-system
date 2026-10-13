import React, { useState, useEffect } from 'react';
import { Search, UserCheck, FileText, Car, Tag } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations, ItemStatus, ItemType, ItemCondition, Department, Employee, Location, Model21Voucher, TransactionApproval, ApprovalStatus } from '../../types/asset-management';
import { FormSection, FieldGrid, Field, ReadOnlyValue, SummaryGrid, FormFooter, FileDropField, FormNotice, QuantityInput, MoneyInput, inputClass, textareaClass, submitOnCtrlEnter } from '../ui/FormKit';
import { readPdfRows, rowsToText, isModel19, isModel21, parseModel21, sameEmployeeId, Model21SlipFields } from '../../utils/slip-reader';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSystemSettings } from '../../utils/system-settings';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { StoreManField } from './StoreManField';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
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
}

export const TransferForm: React.FC<TransferFormProps> = ({ items, employees, departments, locations, pendingByItem, editTransfer, initialItemId, slip, onCancel, onSaved }) => {
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
  const [bookValue, setBookValue] = useState<number>(details.bookValue ?? (editItem ? (editItem.unitCostETB || 0) * (Number(editItem.quantity) || 1) : 0));
  // Accessories start at zero: the encoder enters what was actually handed over
  const [jackQty, setJackQty] = useState(qtyOf('jack with handle'));
  const [tireWrenchQty, setTireWrenchQty] = useState(qtyOf('tire wrench'));
  const [keyQty, setKeyQty] = useState(qtyOf('key'));
  const [reserveTyreQty, setReserveTyreQty] = useState(qtyOf('reserve tyre'));
  const [tireSerials, setTireSerials] = useState(details.tireNos?.join(', ') ?? '');
  const [defectRemark, setDefectRemark] = useState(details.remark ?? '');
  const [submitting, setSubmitting] = useState(false);

  // "Return to store": the store the asset goes back to. Empty means an ordinary transfer to an employee.
  const isReturnEdit = editTransfer?.transactionType === 'RETURN';
  const [returnToId, setReturnToId] = useState(isReturnEdit ? editTransfer?.targetLocationId ?? editItem?.storeLocationId ?? '' : '');
  const isReturn = isReturnEdit || (!editTransfer && !!returnToId);
  const [condition, setCondition] = useState<ItemCondition | ''>(isReturnEdit ? ((details.condition as ItemCondition) ?? '') : '');
  const [returnReason, setReturnReason] = useState(isReturnEdit ? details.reason ?? '' : '');
  const [storeReceiverId, setStoreReceiverId] = useState(isReturnEdit ? details.storeRecipientId ?? '' : '');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState(isReturnEdit && editTransfer?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editTransfer.ifmisSlipAttachmentUrl) : '');
  const isAttachmentReq = useSystemSettings().slipAttachmentPolicy === 'REQUIRED';
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
  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  // A newly chosen asset brings its own details
  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item && item.status === ItemStatus.AVAILABLE) setReturnToId('');
    if (item) {
      setDepreciation(0);
      setBookValue((item.unitCostETB || 0) * (Number(item.quantity) || 1));
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

  /**
   * A Model 21 fills in the voucher, the asset and who receives it. The asset has to have come before it in its
   * life: received and approved, a fixed asset, issued to the employee the form names (or still in store), with no
   * other request waiting. Anything that doesn't fit is said, and the asset or person is not filled in.
   */
  const fillFromModel21 = (slip: Model21SlipFields) => {
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

    const tag = line?.tagNumber?.trim().toLowerCase();
    const asset = tag ? items.find((i) => i.itemCode.toLowerCase() === tag || i.serialNumber?.trim().toLowerCase() === tag) : undefined;
    let usable = false;
    if (!tag) problems.push('The form names no asset tag number.');
    else if (!asset) problems.push(`No asset with tag ${line!.tagNumber} is registered here. It has to be received on a Model 19 and approved first.`);
    else if (asset.itemType === ItemType.CONSUMABLE) problems.push(`${asset.itemCode} is a consumable item; consumables are issued, not transferred.`);
    else if (asset.status !== ItemStatus.ISSUED && asset.status !== ItemStatus.AVAILABLE) {
      problems.push(`${asset.itemCode} is ${STATUS_WORDS[asset.status] ?? asset.status.toLowerCase()}; only an issued asset, or a fixed asset in store, can be transferred.`);
    } else if (asset.status === ItemStatus.ISSUED && asset.heldByOrganization) {
      problems.push(`${asset.itemCode} is held by ${asset.heldByOrganization}, outside the Ministry.`);
    } else if (pendingByItem.has(asset.id) && pendingByItem.get(asset.id)!.id !== editTransfer?.id) {
      problems.push(`${asset.itemCode} already has a request waiting for approval.`);
    } else if (asset.status === ItemStatus.ISSUED && slip.fromEmployeeId && !sameEmployeeId(asset.currentCustodian?.payrollId, slip.fromEmployeeId)) {
      problems.push(`${asset.itemCode} is held by ${asset.currentCustodian?.fullNameEn ?? 'someone else'}, not by the employee the form transfers it from (${slip.fromName ?? slip.fromEmployeeId}).`);
    } else {
      usable = true;
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

    // Who receives it: only once the asset itself fits
    if (usable && slip.toEmployeeId) {
      const to = employees.find((e) => e.isActive !== false && sameEmployeeId(e.payrollId, slip.toEmployeeId));
      if (!to) problems.push(`No active employee has ID ${slip.toEmployeeId}${slip.toName ? ` (${slip.toName})` : ''}.`);
      else if (asset?.status === ItemStatus.ISSUED && to.id === asset.currentCustodianId) problems.push(`${asset.itemCode} is already with ${to.fullNameEn}.`);
      else if (!targetEmployeeId) {
        handleRecipientChange(to.id);
        filled.push(`recipient (${to.fullNameEn})`);
      }
    }

    const more = slip.lines.length > 1 ? ` The form lists ${slip.lines.length} assets; the first one was read. Transfer each of the others from its own record.` : '';
    if (problems.length) {
      setSlipNote({ tone: 'warn', text: `${problems.join(' ')}${filled.length ? ` Filled in: ${filled.join(', ')}.` : ''}${more}` });
    } else if (filled.length) {
      setSlipNote({ tone: 'info', text: `Filled in from the Model 21: ${filled.join(', ')}. Check them against the paper before submitting.${more}` });
    } else {
      setSlipNote({ tone: 'info', text: 'The form was read, but every field it covers is already filled in.' });
    }
  };

  /** Only a Model 21 is read here; another IFMIS form is named, so it can be taken to its own form */
  const readSlip = (file: File) => {
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
      return void setSlipNote({ tone: 'warn', text: 'Choose the Model 21 as a PDF saved from IFMIS.' });
    }
    setSlipNote({ tone: 'info', text: 'Reading the Model 21…' });
    readPdfRows(file)
      .then((rows) => {
        const text = rowsToText(rows);
        if (!text.trim()) return setSlipNote({ tone: 'warn', text: 'This PDF has no text (it is a scanned image), so it could not be read. Fill in the fields as usual.' });
        if (isModel21(text)) return fillFromModel21(parseModel21(text));
        setSlipNote({
          tone: 'warn',
          text: isModel19(text)
            ? 'This is a Model 19 receipt, not a Model 21. Read it from Receive items (Import receipt).'
            : 'Only an IFMIS Model 21 (Fixed Asset Internal Transfer Form) PDF can be read here.',
        });
      })
      .catch(() => setSlipNote({ tone: 'warn', text: "The PDF couldn't be read. Fill in the fields as usual." }));
  };

  // A PDF chosen with the form's header button
  useEffect(() => {
    if (slip) readSlip(slip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slip]);

  const usedNo = slips.findUsed(model21No, ['TRANSFER', 'RETURN'], editTransfer?.id);

  // A field shows what is wrong with it once the user has been in it
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (key: string) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const problems: Record<string, string | false> = {
    model21No: !model21No.trim() && 'Enter the number printed on the Model 21 form.',
    book: !book.trim() && 'Enter the book this form comes from.',
    date: !transferDateGc && 'Enter the date of the transfer.',
    condition: isReturn && !condition && 'Select the condition the asset is returned in.',
    reason: isReturn && !returnReason.trim() && 'Say why the asset is coming back to store.',
  };
  const errorOf = (key: string) => (touched[key] && problems[key] ? (problems[key] as string) : undefined);

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !selectedItemId && 'asset',
    !model21No.trim() && 'Model 21 No.',
    !transferDateGc && 'transfer date',
    !book.trim() && 'book',
    !isReturn && !targetEmployeeId && 'recipient',
    !isReturn && !editTransfer && storeMen.length > 1 && !transferrerId && 'store man',
    isReturn && !condition && 'condition on return',
    isReturn && !returnReason.trim() && 'reason for return',
    isReturn && !editTransfer && returnStoreMen.length > 1 && !receiverId && 'received by (store man)',
    isReturn && isAttachmentReq && !attachmentFileName && 'scanned slip',
  ].filter(Boolean) as string[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return void toast.warning('Asset required', 'Choose the asset to transfer.');
    if (!isReturn && !targetEmployeeId) return void toast.warning('Recipient required', 'Choose the employee who receives the asset.');
    if (!model21No.trim()) return void toast.warning('Model 21 number required', 'Enter the number on the Model 21 form.');
    if (isReturn && !condition) return void toast.warning('Condition required', 'Select the condition on return.');
    if (isReturn && !returnReason.trim()) return void toast.warning('Reason required', 'Enter the reason for returning the asset to store.');
    if (isReturn && isAttachmentReq && !attachmentFileName) return void toast.warning('Slip required', 'A scanned slip is required by the system setting.');

    const accessories = accessoriesOf(jackQty, tireWrenchQty, keyQty, reserveTyreQty);
    const tireList = tireSerials.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      // ── Return to store: the asset goes back to a store instead of to an employee
      if (isReturn) {
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        const item = selectedItemObj;
        if (editTransfer) {
          await api.updateReturn(editTransfer.id, {
            model21No: model21No.trim(),
            ifmisSlipDateGc: transferDateGc,
            ifmisSlipAttachmentUrl: slipUrl,
            returnReason: returnReason.trim(),
            condition: condition as ItemCondition,
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
        const origCost = (item?.unitCostETB || 0) * (Number(item?.quantity) || 1);
        await api.registerReturn({
          itemId: selectedItemId,
          ifmisSlipNumber: model21No.trim(),
          ifmisSlipDateGc: transferDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          returnReason: returnReason.trim(),
          condition: condition as ItemCondition,
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
          items: [
            {
              sNo: 1,
              description: item?.name || '—',
              tagNumber: item?.itemCode || '—',
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
              remark: defectRemark.trim() || returnReason.trim(),
            },
          ],
          printedBy: user?.fullNameEn,
        };
        toast.success(
          'Transfer to store submitted for approval',
          `${item?.itemCode || 'The asset'} (${model21No.trim()}) is registered for Department Head approval and stays with its custodian until then.`,
        );
        rememberForm(user?.id, 'transfer', { book: book.trim() });
        onSaved(returnVoucher);
        return;
      }

      if (editTransfer) {
        await api.updateTransfer(editTransfer.id, {
          model21No: model21No.trim(),
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
      const origCost = (selectedItem?.unitCostETB || 0) * (Number(selectedItem?.quantity) || 1);
      await api.transferItem({
        itemId: selectedItemId,
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
            tagNumber: selectedItem?.itemCode || '—',
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
        ],
        printedBy: user?.fullNameEn,
      };
      toast.success(
        'Transfer submitted for approval',
        `${selectedItem?.itemCode || 'The asset'} to ${targetEmp?.fullNameEn || 'the new custodian'}. Custody changes after the Department Head approves it.`,
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
    <form id="transfer-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-4">
      {slipNote && (
        <FormNotice icon={FileText} tone={slipNote.tone}>
          <span role="status">{slipNote.text}</span>
        </FormNotice>
      )}

      {/* ── Section 1: Transfer voucher ── */}
      <FormSection step={1} title="Transfer voucher" subtitle="የዝውውር ሰነድ · Model 21 register" icon={FileText} accent="emerald">
        <FieldGrid>
          <Field
            label="Model 21 No."
            required
            error={errorOf('model21No')}
            warning={usedNo ? usedMessage(model21No, usedNo) : undefined}
          >
            <input
              type="text"
              required
              value={model21No}
              onChange={(e) => setModel21No(e.target.value)}
              onBlur={touch('model21No')}
              autoFocus={!editTransfer && !!initialItemId}
              placeholder="Number on the Model 21 form"
              className={`${input({ mono: true, invalid: !!errorOf('model21No') })} font-semibold`}
            />
          </Field>

          <Field label="Book" required error={errorOf('book')}>
            <input
              type="text"
              required
              value={book}
              onChange={(e) => setBook(e.target.value)}
              onBlur={touch('book')}
              placeholder="Book the form comes from"
              className={input({ invalid: !!errorOf('book') })}
            />
          </Field>

          <Field
            label="Transfer date (G.C.)"
            required
            htmlFor="transfer-date"
            error={errorOf('date')}
            hint={transferDateGc ? `${formatGcToEc(transferDateGc)} E.C. · today unless you change it` : undefined}
          >
            <input
              id="transfer-date"
              type="date"
              required
              max={todayGc}
              value={transferDateGc}
              onChange={(e) => setTransferDateGc(e.target.value)}
              onBlur={touch('date')}
              className={input({ mono: true, invalid: !!errorOf('date') })}
            />
          </Field>
        </FieldGrid>
      </FormSection>

      {/* ── Section 2: Asset ── */}
      <FormSection step={2} title="Asset" subtitle="የሚዛወረው ንብረት" icon={Tag} accent="emerald">
        <div className="space-y-3.5">
          {editTransfer ? (
            <Field label="Issued asset" hint="The asset can't be changed. To transfer a different asset, ask an approver to reject this request.">
              <ReadOnlyValue mono>
                {editTransfer.itemCode} — {editTransfer.itemName}
              </ReadOnlyValue>
            </Field>
          ) : (
            <Field label="Asset" required htmlFor="transfer-item" hint="Fixed assets in store and assets issued to a custodian are listed. Consumables are issued, not transferred. Type a name, code or custodian to find one.">
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
                  value: formatETB((selectedItemObj.unitCostETB || 0) * (Number(selectedItemObj.quantity) || 1)),
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
                  setBookValue(Math.max(0, (selectedItemObj?.unitCostETB || 0) * (Number(selectedItemObj?.quantity) || 1) - val));
                }}
              />
            </Field>
          </FieldGrid>
        </div>
      </FormSection>

      {/* ── Section 3: Transfer to ── */}
      <FormSection step={3} title={isReturn ? 'Transfer to store' : 'Transfer to'} subtitle="ተረካቢ" icon={UserCheck} accent="emerald">
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
                optional={!isReturnEdit}
                required={isReturnEdit}
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
            <Field label="To employee" required htmlFor="transfer-recipient" hint="Type a name or employee ID.">
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
                  required={!editTransfer}
                />

                <Field label="Condition on return" required htmlFor="transfer-condition" error={errorOf('condition')}>
                  <select id="transfer-condition" required value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} onBlur={touch('condition')} className={input({ invalid: !!errorOf('condition') })}>
                    <option value="" disabled>Select…</option>
                    <option value={ItemCondition.GOOD}>Good · fully functional</option>
                    <option value={ItemCondition.FAIR}>Fair · minor wear</option>
                    <option value={ItemCondition.NEEDS_REPAIR}>Needs repair</option>
                    <option value={ItemCondition.DAMAGED}>Damaged / defective</option>
                  </select>
                </Field>
              </FieldGrid>

              <Field label="Reason for return" required htmlFor="transfer-return-reason" error={errorOf('reason')}>
                <input
                  id="transfer-return-reason"
                  type="text"
                  required
                  placeholder="e.g. Project field work completed, returning asset to store"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  onBlur={touch('reason')}
                  className={input({ invalid: !!errorOf('reason') })}
                />
              </Field>

              <FileDropField
                label="Scanned return slip"
                accent="emerald"
                required={isAttachmentReq}
                fileName={attachmentFileName}
                accept={SLIP_ACCEPT_ATTR}
                onChange={handleSlipSelected}
              />
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
            required={!editTransfer}
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
      </FormSection>

      {/* ── Section 4: Vehicle & machinery details (optional) ── */}
      <FormSection
        key={selectedIsVehicleLike ? 'vehicle' : 'other'}
        step={4}
        title="Vehicle & machinery details"
        subtitle="Chassis, plate, engine, accessories, reserve tyre and tires · only for vehicles and machinery"
        icon={Car}
        accent="emerald"
        collapsible
        defaultOpen={selectedIsVehicleLike}
      >
        <div className="space-y-3.5">
          <FieldGrid>
            <Field label="Chassis number" optional>
              <input type="text" placeholder="e.g. JTEBB71JX07008920" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} className={input({ mono: true })} />
            </Field>
            <Field label="Plate number" optional>
              <input type="text" placeholder="e.g. 4-23794" value={plateNo} onChange={(e) => setPlateNo(e.target.value)} className={input({ mono: true })} />
            </Field>
            <Field label="Engine number" optional>
              <input type="text" placeholder="e.g. 1HZ-0641864" value={engineNo} onChange={(e) => setEngineNo(e.target.value)} className={input({ mono: true })} />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
            <Field label="Jack with handle (qty)">
              <QuantityInput value={jackQty} onChange={setJackQty} />
            </Field>
            <Field label="Tire wrench (qty)">
              <QuantityInput value={tireWrenchQty} onChange={setTireWrenchQty} />
            </Field>
            <Field label="Keys (qty)">
              <QuantityInput value={keyQty} onChange={setKeyQty} />
            </Field>
            <Field label="Reserve tyre (qty)">
              <QuantityInput value={reserveTyreQty} onChange={setReserveTyreQty} />
            </Field>
          </FieldGrid>

          <Field label="Tire serial numbers" optional hint="Separate with commas or new lines">
            <input
              type="text"
              placeholder="e.g. R240514711, R240504703, YY0219"
              value={tireSerials}
              onChange={(e) => setTireSerials(e.target.value)}
              className={input({ mono: true })}
            />
          </Field>
        </div>
      </FormSection>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={editTransfer ? 'Save changes' : isReturn ? 'Submit transfer to store for approval' : 'Submit transfer for approval'}
        missingFields={missingFields}
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
  const origCost = d.origCost ?? (item?.unitCostETB || 0) * units;
  const fromLoc = storeLocationLabel(item?.storeLocation);
  const toLocation = locations.find((l) => l.id === r.targetLocationId);
  const storeName = toLocation ? storeLocationLabel(toLocation) : fromLoc || 'Store';
  const todayGc = new Date().toISOString().split('T')[0];
  const requestDateGc = r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10);
  return {
    approvalState: r.status === ApprovalStatus.PENDING ? 'PENDING' : r.status === ApprovalStatus.REJECTED ? 'REJECTED' : undefined,
    model21No: r.ifmisSlipNumber || '—',
    fromEmployeeName: fromName,
    fromEmployeeId: fromEmp?.payrollId || '—',
    book: d.book || '—',
    toEmployeeName: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? d.storeRecipientName || storeName : '—'),
    toEmployeeId: toEmp?.payrollId || '—',
    storeManName: r.transactionType === 'TRANSFER' && !d.fromStore ? d.transferredByName : undefined,
    items: [
      {
        sNo: 1,
        description: r.itemName,
        tagNumber: r.itemCode,
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
        remark: d.remark || undefined,
      },
    ],
    printedBy: context.printedBy,
  };
};
