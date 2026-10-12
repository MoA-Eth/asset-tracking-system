import React, { useState, useEffect } from 'react';
import { PackageMinus, FileText, Search, User } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { useSlipRegister, usedMessage } from '../../hooks/useSlipRegister';
import { FormSection, FieldGrid, Field, ReadOnlyValue, TotalValue, FormError, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ItemWithRelations, TransactionApproval, Department, Employee, Model22Voucher } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { departmentLabel } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getSystemSettings, useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';

// ─── Stock-Out Form (inside modal) ───────────────────────────────────────────

export interface StockOutFormProps {
  availableItems: ItemWithRelations[];
  departments: Department[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: TransactionApproval, voucher?: Model22Voucher) => void;
  /** When set, the form corrects this pending request instead of creating a new one */
  editApproval?: TransactionApproval;
  /** The item of the request being corrected (it is not in the available list while pending) */
  editItem?: ItemWithRelations;
  /** Item chosen before the form opened, e.g. from its row in the register */
  initialItemId?: string;
}

/** Splits the stored "purpose (Remark: remark)" text back into its two fields */
const splitPurposeAndRemark = (text: string): { purpose: string; remark: string } => {
  const match = /^([\s\S]*) \(Remark: ([\s\S]*)\)$/.exec(text || '');
  return match ? { purpose: match[1], remark: match[2] } : { purpose: text || '', remark: '' };
};

/** Most stock-outs are move orders, so that is the starting choice */
const DEFAULT_TRANSACTION_TYPE = 'Move Order Issue';
/** Writing the units off through Model 22 instead of handing them to a recipient */
const DISPOSAL_TRANSACTION_TYPE = 'Disposal';

/** "Mantegbosh Mirku, Oromia Bureau of Agriculture": the person who signs for an organization, or just the organization */
export const externalReceiverName = (organization: string, contact?: string): string =>
  [contact?.trim(), organization.trim()].filter(Boolean).join(', ');

export const StockOutForm: React.FC<StockOutFormProps> = ({
  availableItems,
  departments,
  employees,
  onCancel,
  onSuccess,
  editApproval,
  editItem,
  initialItemId,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editApproval;
  const editNotes = splitPurposeAndRemark(editApproval?.purposeOrRemarks ?? '');

  // Selected store item
  // Nothing is pre-selected; choosing a store item fills in its details
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  // Header fields matching photo
  const [model22No, setModel22No] = useState<string>(editApproval?.ifmisSlipNumber ?? '');
  const [issuedDateGc, setIssuedDateGc] = useState<string>(
    editApproval?.ifmisSlipDateGc || editApproval?.createdAtGc?.split('T')[0] || new Date().toISOString().split('T')[0]
  );
  // A new issue starts from the last one this person made; a disposal is never carried over
  const memory = editApproval ? {} : recallForm(user?.id, 'issue');
  const slips = useSlipRegister();
  const [transactionType, setTransactionType] = useState<string>(
    memory.transactionType && memory.transactionType !== DISPOSAL_TRANSACTION_TYPE ? memory.transactionType : DEFAULT_TRANSACTION_TYPE,
  );
  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>(
    editApproval?.targetDepartmentId ?? ''
  );
  const [recipientEmployeeId, setRecipientEmployeeId] = useState<string>(
    editApproval?.recipientEmployeeId ?? ''
  );
  // An employee receives it (internal), or an outside organization typed as text (external)
  const [recipientType, setRecipientType] = useState<'INTERNAL' | 'EXTERNAL'>(
    editApproval?.requestDetails?.recipientType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL'
  );
  const [organizationName, setOrganizationName] = useState<string>(editApproval?.requestDetails?.organizationName ?? '');
  const [contactPerson, setContactPerson] = useState<string>(editApproval?.requestDetails?.contactPerson ?? '');
  // A disposal has no recipient: the purpose is the reason; a request being corrected keeps what it was
  const isDisposal = isEdit ? editApproval?.requestDetails?.disposal === true : transactionType === DISPOSAL_TRANSACTION_TYPE;
  const isExternal = !isDisposal && recipientType === 'EXTERNAL';

  // Line item particulars matching photo columns
  const [itemCode, setItemCode] = useState<string>('');
  const [itemDescription, setItemDescription] = useState<string>('');
  const [subInventory, setSubInventory] = useState<string>(
    ''
  );
  const [itemCategory, setItemCategory] = useState<string>(
    ''
  );
  const [lotBatchNo, setLotBatchNo] = useState<string>('');
  const [serialNo, setSerialNo] = useState<string>('');
  const [printedPadFrom, setPrintedPadFrom] = useState<string>('');
  const [printedPadTo, setPrintedPadTo] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(
    Number(editApproval?.requestDetails?.quantity) || Number(editItem?.quantity) || 1
  );
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [transportationCost, setTransportationCost] = useState<number>(0);
  const [remark, setRemark] = useState<string>(editNotes.remark);
  const [purpose, setPurpose] = useState<string>(isEdit ? editNotes.purpose : '');
  // In edit mode the current slip is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState<string>(
    editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-populate when an item is selected from store
  const handleItemSelect = (id: string) => {
    setSelectedItemId(id);
    const item = availableItems.find((i) => i.id === id);
    if (item) {
      // Default to issuing everything in store; lower it to issue part of the batch
      setQuantity(Number(item.quantity) || 1);
      setItemCode(item.itemCode || '');
      setItemDescription(item.name || '');
      setSubInventory(item.subInventory || item.storeLocation?.roomNumber || '');
      setItemCategory(item.itemCategoryDisplay || item.category?.replace(/_/g, ' ') || '');
      setLotBatchNo(item.lotBatchNo || '');
      setSerialNo(item.serialNumber || '');
      setPrintedPadFrom(item.printedPadFrom || '');
      setPrintedPadTo(item.printedPadTo || '');
      setUnitPrice(item.unitCostETB || 0);
    }
  };

  // Opened from an item's row: start with that item chosen
  useEffect(() => {
    if (!isEdit && initialItemId) handleItemSelect(initialItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmployeeChange = (empId: string) => {
    setRecipientEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp && emp.departmentId) {
      setDestinationDepartmentId(emp.departmentId);
    }
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

  const handleReset = () => {
    setSelectedItemId('');
    setModel22No('');
    setIssuedDateGc(new Date().toISOString().split('T')[0]);
    setTransactionType(DEFAULT_TRANSACTION_TYPE);
    setDestinationDepartmentId('');
    setRecipientEmployeeId('');
    setIssuedById('');
    setRecipientType('INTERNAL');
    setOrganizationName('');
    setContactPerson('');
    setItemCode('');
    setItemDescription('');
    setSubInventory('');
    setItemCategory('');
    setLotBatchNo('');
    setSerialNo('');
    setPrintedPadFrom('');
    setPrintedPadTo('');
    setQuantity(1);
    setUnitPrice(0);
    setTransportationCost(0);
    setRemark('');
    setPurpose('');
    setAttachmentFileName('');
    setAttachmentFile(null);
    setFormError(null);
  };

  const quantityItem = editItem ?? availableItems.find((i) => i.id === selectedItemId);
  // Who issues it: a store man of the store the item is in
  const keepers = useStoreKeepers();
  const { storeManPolicy } = useSystemSettings();
  const storeManRequired = storeManPolicy === 'REQUIRED';
  const [issuedById, setIssuedById] = useState('');
  const storeMen = keepers.ofLocation(quantityItem?.storeLocationId);
  const issuerId = issuedById || (storeMen.length === 1 ? storeMen[0].employeeId : '');
  const issuerName = storeMen.find((k) => k.employeeId === issuerId)?.fullNameEn;
  const inStore = Number(quantityItem?.quantity) || 1;
  // Items registered before units were recorded count in EA, as on the server
  const inStoreUom = quantityItem?.uom || 'EA';
  const totalAmount = quantity * unitPrice;
  const grandTotal = totalAmount + transportationCost;
  const ethDate = formatGcToEc(issuedDateGc);
  const isAttachmentReq = useSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  const usedNo = slips.findUsed(model22No, ['STOCK_OUT'], editApproval?.id);

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !isEdit && !selectedItemId && 'store item',
    !isEdit && storeManRequired && !!selectedItemId && keepers.ready && storeMen.length === 0 && 'a store man for this store',
    !isEdit && storeMen.length > 1 && !issuerId && 'issued by (store man)',
    !model22No.trim() && 'Model 22 No.',
    !issuedDateGc && 'issued date',
    !isEdit && !transactionType && 'transaction type',
    !(Number.isInteger(quantity) && quantity >= 1 && quantity <= inStore) && 'quantity',
    !purpose.trim() && (isDisposal ? 'reason for disposal' : 'purpose of issue'),
    !isDisposal && !isExternal && !destinationDepartmentId && 'destination directorate',
    !isDisposal && !isExternal && !recipientEmployeeId && 'recipient',
    isExternal && !organizationName.trim() && 'organization',
    isAttachmentReq && !attachmentFileName && 'scanned slip',
  ].filter(Boolean) as string[];

  // Who receives it: an employee and directorate, or an organization and its contact person
  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    model22No: !model22No.trim() && 'Enter the number printed on the Model 22 slip.',
    purpose: !purpose.trim() && (isDisposal ? 'Say why the units are being written off.' : 'Say what the items are issued for.'),
  });

  const recipientFields = isDisposal
    ? { disposal: true as const }
    : isExternal
    ? { recipientType: 'EXTERNAL' as const, organizationName: organizationName.trim(), contactPerson: contactPerson.trim() || undefined }
    : { recipientType: 'INTERNAL' as const, recipientEmployeeId, targetDepartmentId: destinationDepartmentId };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isEdit && !selectedItemId) {
      const msg = 'Please select an available store item to issue.';
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }
    if (!model22No.trim()) {
      const msg = 'Model 22 Voucher Number is mandatory.';
      setFormError(msg);
      toast.warning('Voucher Required', msg);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      const msg = `Quantity must be a whole number from 1 to ${inStore} (${inStoreUom} in store).`;
      setFormError(msg);
      toast.warning('Check Quantity', msg);
      return;
    }
    if (!isEdit && !transactionType) {
      const msg = 'Please select the transaction type.';
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }
    if (!purpose.trim()) {
      const msg = 'Please enter the purpose of issue.';
      setFormError(msg);
      toast.warning('Purpose Required', msg);
      return;
    }
    if (isExternal && !organizationName.trim()) {
      const msg = 'Please enter the organization that receives the item.';
      setFormError(msg);
      toast.warning('Organization Required', msg);
      return;
    }
    if (!isDisposal && !isExternal && !destinationDepartmentId) {
      const msg = 'Please select the destination directorate.';
      setFormError(msg);
      toast.warning('Selection Required', msg);
      return;
    }
    if (!isDisposal && !isExternal && !recipientEmployeeId) {
      const msg = 'Please select the recipient staff member.';
      setFormError(msg);
      toast.warning('Recipient Required', msg);
      return;
    }

    const policy = getSystemSettings().slipAttachmentPolicy;
    const isAttachmentRequired = policy === 'REQUIRED';
    if (isAttachmentRequired && !attachmentFileName) {
      const msg = 'System Policy requires a scanned IFMIS issue voucher attachment.';
      setFormError(msg);
      toast.warning('Attachment Required', msg);
      return;
    }

    if (!purpose.trim()) {
      const msg = 'Purpose of issue is required.';
      setFormError(msg);
      toast.warning('Purpose Required', msg);
      return;
    }

    setSubmitting(true);

    if (editApproval) {
      try {
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        const res = await api.updateStockOut(editApproval.id, {
          quantity,
          issuedByEmployeeId: issuedById || undefined,
          ...recipientFields,
          ifmisSlipNumber: model22No.trim(),
          ifmisSlipDateGc: issuedDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          purpose: purpose.trim(),
          remark: remark.trim() || undefined,
        });
        toast.success('Issue request updated', `The request for ${editApproval.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res.approval);
      } catch (err: any) {
        const errMsg = err.message || 'Server error';
        setFormError(`Update failed: ${errMsg}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const registeredById = user?.id || '';
    const selectedItem = availableItems.find((i) => i.id === selectedItemId);
    const recipient = employees.find((e) => e.id === recipientEmployeeId);
    const dept = departments.find((d) => d.id === destinationDepartmentId);

    try {
      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      const result = await api.registerStockOut({
        itemId: selectedItemId,
        issuedByEmployeeId: issuerId || undefined,
        ...recipientFields,
        ifmisSlipNumber: model22No.trim(),
        ifmisSlipDateGc: issuedDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
        purpose: purpose.trim(),
        registeredById,
        transactionType,
        destination: isDisposal ? "Disposal (write-off)" : isExternal ? organizationName.trim() : dept ? departmentLabel(dept) : destinationDepartmentId,
        subInventory,
        lotBatchNo,
        printedPadFrom,
        printedPadTo,
        quantity,
        unitPrice,
        totalAmount,
        transportationCost,
        remark: remark.trim() || undefined,
      });

      const voucher: Model22Voucher = {
        approvalState: 'PENDING',
        model22No: model22No.trim(),
        issuedDateGc,
        issuedDateEc: ethDate,
        transactionType,
        destination: isDisposal ? "Disposal (write-off)" : isExternal ? organizationName.trim() : dept ? departmentLabel(dept) : destinationDepartmentId,
        destinationDepartmentId: isDisposal || isExternal ? undefined : destinationDepartmentId,
        subInventory,
        issuedByName: issuerName || user?.fullNameEn || '—',
        receivedByName: isDisposal ? '—' : isExternal ? externalReceiverName(organizationName, contactPerson) : recipient?.fullNameEn || '—',
        receivedByEmployeeId: isDisposal || isExternal ? undefined : recipientEmployeeId,
        items: [
          {
            sNo: 1,
            itemCode: itemCode || selectedItem?.itemCode || '—',
            itemDescription: itemDescription || selectedItem?.name || '—',
            uom: inStoreUom,
            subInventory,
            itemCategory,
            lotBatchNo,
            serialNo,
            printedPadFrom,
            printedPadTo,
            quantity,
            unitPrice,
            totalAmount,
            remark,
          },
        ],
        total: totalAmount,
        transportationCost,
        grandTotal,
        printedBy: user?.fullNameEn,
      };

      toast.success(
        isDisposal ? 'Model 22 Disposal Submitted' : 'Model 22 Issue Voucher Submitted',
        isDisposal
          ? `Disposal (${model22No.trim()}) registered for approval. The units leave the register once it is approved.`
          : `Receipt for Articles Or Property Issued (${model22No.trim()}) to ${isExternal ? organizationName.trim() : recipient?.fullNameEn || 'staff'} registered for approval.`
      );
      // A disposal is never carried over to the next issue
      rememberForm(user?.id, 'issue', transactionType !== DISPOSAL_TRANSACTION_TYPE ? { transactionType } : {});
      onSuccess(result, voucher);
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`The issue request could not be saved: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  return (
    <form id="stock-out-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-4">
      <FormError message={formError} />

      {/* ── Section 1: Voucher details ── */}
      <FormSection step={1} title="Voucher details" subtitle="የወጪ ማዘዣ መረጃ · Model 22 header" icon={FileText} accent="emerald">
        <FieldGrid>
          <Field
            label="Model 22 No."
            required
            error={fieldErrors.error('model22No')}
            warning={usedNo ? usedMessage(model22No, usedNo) : undefined}
          >
            <input
              type="text"
              required
              placeholder="e.g. 0004653/A Inventory"
              value={model22No}
              onChange={(e) => setModel22No(e.target.value)}
              onBlur={fieldErrors.touch('model22No')}
              autoFocus={!isEdit}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model22No') })} font-semibold`}
            />
          </Field>

          <Field label="Issued date (G.C.)" required hint={`${ethDate} E.C.`}>
            <input
              type="date"
              required
              value={issuedDateGc}
              onChange={(e) => setIssuedDateGc(e.target.value)}
              className={input()}
            />
          </Field>

          {!isEdit && (
            <Field label="Transaction type" required htmlFor="stock-out-transaction-type">
              <select id="stock-out-transaction-type" required value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
                <option value="" disabled>Select…</option>
                <option value="Move Order Issue">Move Order Issue</option>
                <option value="Direct Store Issue">Direct Store Issue</option>
                <option value="Department Assignment">Department Assignment</option>
                <option value="Project Allocation">Project Allocation</option>
                <option value={DISPOSAL_TRANSACTION_TYPE}>Disposal (write-off)</option>
              </select>
            </Field>
          )}
        </FieldGrid>
      </FormSection>

      {/* ── Section 2: Item issued ── */}
      <FormSection step={2} title="Item issued" subtitle="የሚወጣው ዕቃ ዝርዝር መረጃ" icon={PackageMinus} accent="emerald">
        {editApproval ? (
          <FieldGrid>
            <Field label="Item code" hint="The item can't be changed. To issue a different item, ask an approver to reject this request.">
              <ReadOnlyValue mono>{editApproval.itemCode}</ReadOnlyValue>
            </Field>
            <Field label="Item description" span="sm:col-span-2">
              <ReadOnlyValue>{editApproval.itemName}</ReadOnlyValue>
            </Field>
            <Field label="Quantity to issue" required htmlFor="issue-quantity" hint={quantity > inStore ? `Only ${inStore} ${inStoreUom} in store` : `${inStore} ${inStoreUom} in store`}>
              <QuantityInput id="issue-quantity" min={1} max={inStore} required value={quantity} onChange={setQuantity} />
            </Field>
          </FieldGrid>
        ) : (
        <div className="space-y-3.5">
          <Field label="Store item" required htmlFor="stock-out-item" hint="Only items currently available in store are listed. Type a name, code or serial number to find one.">
            <SearchableSelect
              id="stock-out-item"
              value={selectedItemId}
              onChange={handleItemSelect}
              placeholder={availableItems.length === 0 ? 'No items available in store' : 'Select an item…'}
              searchPlaceholder="Search by name, code or serial number…"
              groups={[
                {
                  label: 'In store',
                  options: availableItems.map((item) => ({
                    value: item.id,
                    label: `${item.itemCode} — ${item.name}`,
                    note: `${item.quantity || 1} ${item.uom || 'EA'} in store · ${formatETB(item.unitCostETB)} each${item.serialNumber ? ` · ${item.serialNumber}` : ''}`,
                  })),
                },
              ]}
            />
          </Field>

          <FieldGrid>
            <Field label="Item description" required span="sm:col-span-2">
              <input
                type="text"
                required
                placeholder="e.g. Battery 12v - 70 Amp"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Item code" required>
              <input
                type="text"
                required
                placeholder="e.g. 103108101.0004"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                className={`${input({ mono: true })} font-semibold`}
              />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
            <Field label="Category" required>
              <input
                type="text"
                placeholder="e.g. IT Equipment"
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Sub inventory" required>
              <input
                type="text"
                placeholder="Filled in from the item's location"
                value={subInventory}
                onChange={(e) => setSubInventory(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Serial number" optional>
              <input
                type="text"
                placeholder="e.g. SN-49202"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>

            <Field label="Lot / batch no." optional>
              <input
                type="text"
                placeholder="e.g. LOT-2026"
                value={lotBatchNo}
                onChange={(e) => setLotBatchNo(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>
          </FieldGrid>

          {/* Quantity & cost */}
          <FieldGrid cols={4}>
            <Field label="Quantity to issue" required htmlFor="issue-quantity" hint={quantity > inStore ? `Only ${inStore} ${inStoreUom} in store` : `${inStore} ${inStoreUom} in store`}>
              <QuantityInput id="issue-quantity" min={1} max={inStore} required value={quantity} onChange={setQuantity} />
            </Field>

            {/* Stock is counted in the unit it was received in, so the issue uses the item's unit */}
            <Field label="Unit of measure" hint={selectedItemId ? 'As received on Model 19' : undefined}>
              <ReadOnlyValue mono>{selectedItemId ? inStoreUom : '—'}</ReadOnlyValue>
            </Field>

            <Field label="Unit price (ETB)" required htmlFor="stock-out-unit-price">
              <MoneyInput id="stock-out-unit-price" value={unitPrice} onChange={setUnitPrice} />
            </Field>

            <Field label="Transport cost (ETB)" optional htmlFor="stock-out-transport">
              <MoneyInput id="stock-out-transport" value={transportationCost} onChange={setTransportationCost} />
            </Field>
          </FieldGrid>

          <FieldGrid cols={4}>
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

            <Field label="Item total (ETB)">
              <ReadOnlyValue mono align="right">{formatETB(totalAmount)}</ReadOnlyValue>
            </Field>

            <Field label="Grand total (ETB)" hint="Item total + transport">
              <TotalValue accent="emerald">{formatETB(grandTotal)}</TotalValue>
            </Field>
          </FieldGrid>
        </div>
        )}
      </FormSection>

      {/* ── Section 3: Recipient & custody ── */}
      <FormSection
        step={3}
        title="Recipient & custody"
        subtitle="ማረጋገጫ እና ፊርማዎች"
        icon={User}
        accent="emerald"
        aside={
          <span
            className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isAttachmentReq ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Slip {isAttachmentReq ? 'required' : 'optional'}
          </span>
        }
      >
        <div className="space-y-3.5">
          <FieldGrid cols={2}>
            {!isDisposal && (
            <Field label="Recipient type" required span="sm:col-span-2" hint="Internal: a staff member of the Ministry. External: an outside organization.">
              <div role="radiogroup" aria-label="Recipient type" className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs font-semibold">
                {(['INTERNAL', 'EXTERNAL'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={recipientType === type}
                    onClick={() => setRecipientType(type)}
                    className={`rounded-md px-3 py-1.5 transition cursor-pointer ${
                      recipientType === type ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    {type === 'INTERNAL' ? 'Internal (employee)' : 'External (organization)'}
                  </button>
                ))}
              </div>
            </Field>
            )}

            {isDisposal ? null : isExternal ? (
              <>
                <Field label="Organization" required htmlFor="stock-out-organization" hint="The organization that receives the item.">
                  <input
                    id="stock-out-organization"
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    maxLength={150}
                    placeholder="e.g. Oromia Bureau of Agriculture"
                    className={input()}
                  />
                </Field>
                <Field label="Contact person" optional htmlFor="stock-out-contact" hint="The person who signs for the organization.">
                  <input
                    id="stock-out-contact"
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Mantegbosh Mirku"
                    className={input()}
                  />
                </Field>
              </>
            ) : (
              <>
            <Field label="Received by (recipient)" required htmlFor="stock-out-recipient" hint="Type a name or employee ID. Selecting a recipient fills in their directorate.">
              <SearchableSelect
                id="stock-out-recipient"
                value={recipientEmployeeId}
                onChange={handleEmployeeChange}
                placeholder="Select an employee…"
                searchPlaceholder="Search by name or employee ID…"
                groups={[{ label: 'Employees', options: employees.map((emp) => ({ value: emp.id, label: `${emp.fullNameEn} (${emp.payrollId})` })) }]}
              />
            </Field>

            <Field label="Destination directorate" required>
              <select
                value={destinationDepartmentId}
                onChange={(e) => setDestinationDepartmentId(e.target.value)}
                className={input()}
                required
              >
                <option value="" disabled>Select…</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {departmentLabel(dept)}
                  </option>
                ))}
              </select>
            </Field>
              </>
            )}

            <Field label={isDisposal ? "Reason for disposal" : "Purpose of issue"} required error={fieldErrors.error('purpose')}>
              <input
                type="text"
                required
                placeholder={isDisposal ? "e.g. Expired, damaged beyond repair, used up" : "e.g. Move Order Issue for Agricultural Operations"}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                onBlur={fieldErrors.touch('purpose')}
                className={input({ invalid: !!fieldErrors.error('purpose') })}
              />
            </Field>

            <Field label="Remark" optional>
              <input
                type="text"
                placeholder="e.g. Routine maintenance issue for central pool"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className={input()}
              />
            </Field>

            <StoreManField
              id="stock-out-issued-by"
              label="Issued by (store man)"
              keepers={storeMen}
              ready={keepers.ready}
              storeName={keepers.storeName(quantityItem?.storeLocation?.storeId)}
              hasStore={!!quantityItem}
              value={issuedById}
              onChange={setIssuedById}
              current={isEdit ? editApproval?.requestDetails?.issuedByName : undefined}
              required={!isEdit}
              refuse={storeManRequired}
            />
          </FieldGrid>

          <FileDropField
            label="Scanned issue voucher"
            accent="emerald"
            required={isAttachmentReq}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleSlipSelected}
          />
        </div>
      </FormSection>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
        missingFields={missingFields}
        onCancel={onCancel}
        onReset={isEdit ? undefined : handleReset}
      />
    </form>
  );
};

/** Model 22 voucher for an issue request, from the request and its item */
export const buildModel22Voucher = (
  approval: TransactionApproval,
  context: { item?: ItemWithRelations; departments: Department[]; employees: Employee[]; printedBy?: string },
): Model22Voucher => {
  const { item: itemDetails, departments, employees } = context;
  const targetDept = departments.find((d) => d.id === approval.targetDepartmentId);
  const recipient = employees.find((e) => e.id === approval.recipientEmployeeId) || approval.recipientEmployee;
  // Issued to an outside organization: it, and the person who signs for it, take the place of the directorate and employee
  const outside = approval.requestDetails?.recipientType === 'EXTERNAL' ? approval.requestDetails.organizationName : undefined;
  const requester = employees.find((e) => e.id === approval.requestedById) || approval.requestedBy;
  const issuedDateGc = approval.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0];
  const unitPrice = itemDetails?.unitCostETB || 0;
  const qty = Number(approval.requestDetails?.quantity) || Number(itemDetails?.quantity) || 1;
  const totalAmount = unitPrice * qty;
  const subInventory = itemDetails?.subInventory || itemDetails?.storeLocation?.roomNumber || '—';

  return {
    approvalState: approval.status === 'PENDING' ? 'PENDING' : approval.status === 'REJECTED' ? 'REJECTED' : undefined,
    model22No: approval.ifmisSlipNumber || '',
    issuedDateGc,
    issuedDateEc: approval.createdAtEc || formatGcToEc(issuedDateGc),
    transactionType: approval.requestDetails?.disposal ? 'Disposal' : 'Move Order Issue',
    destination: approval.requestDetails?.disposal ? 'Disposal (write-off)' : outside || (targetDept ? departmentLabel(targetDept) : '—'),
    destinationDepartmentId: approval.targetDepartmentId,
    subInventory,
    issuedByName: approval.requestDetails?.issuedByName || requester?.fullNameEn || '—',
    receivedByName: outside ? externalReceiverName(outside, approval.requestDetails?.contactPerson) : recipient?.fullNameEn || '—',
    receivedByEmployeeId: approval.recipientEmployeeId,
    items: [
      {
        sNo: 1,
        itemCode: approval.itemCode,
        itemDescription: approval.itemName,
        uom: itemDetails?.uom || 'EA',
        subInventory,
        itemCategory: itemDetails?.itemCategoryDisplay || (itemDetails?.category as string) || '—',
        lotBatchNo: itemDetails?.lotBatchNo || undefined,
        serialNo: itemDetails?.serialNumber || undefined,
        quantity: qty,
        unitPrice,
        totalAmount,
        remark: approval.purposeOrRemarks || '',
      },
    ],
    total: totalAmount,
    transportationCost: 0,
    grandTotal: totalAmount,
    printedBy: context.printedBy,
  };
};
