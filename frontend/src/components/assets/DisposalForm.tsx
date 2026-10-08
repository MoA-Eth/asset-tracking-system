import React, { useEffect, useState } from 'react';
import { Trash2, FileText, ClipboardList } from 'lucide-react';
import { api } from '../../api/client';
import { FormSection, FieldGrid, Field, ReadOnlyValue, FormError, FileDropField, FormFooter, QuantityInput, inputClass, textareaClass } from '../ui/FormKit';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DisposalVoucher, Employee, ItemCondition, ItemWithRelations, TransactionApproval } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { getSystemSettings, useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';

/** Common reasons offered while typing; any other reason can be written in */
export const DISPOSAL_REASON_SUGGESTIONS = [
  'Damaged beyond repair',
  'Gift / donation',
  'Obsolete / no longer needed',
  'Sale / auction',
  'Lost or stolen',
];

export interface DisposalFormProps {
  /** The record being disposed of (in store), or the record of the request being corrected */
  item: ItemWithRelations;
  /** When set, the form corrects this pending request instead of creating a new one */
  editApproval?: TransactionApproval;
  onCancel: () => void;
  onSuccess: (result: TransactionApproval, voucher?: DisposalVoucher) => void;
}

const today = () => new Date().toISOString().split('T')[0];
const amountOrUndefined = (text: string) => (text.trim() === '' ? undefined : Math.max(0, Number(text) || 0));

export const DisposalForm: React.FC<DisposalFormProps> = ({ item, editApproval, onCancel, onSuccess }) => {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!editApproval;
  const details = editApproval?.requestDetails;

  const inStore = Number(item.quantity) || 1;
  const uom = item.uom || 'EA';
  const unitPrice = item.unitCostETB || 0;

  const [submitting, setSubmitting] = useState(false);

  const [quantity, setQuantity] = useState<number>(Number(details?.quantity) || inStore);
  const [disposalNo, setDisposalNo] = useState(editApproval?.ifmisSlipNumber ?? '');
  const [dateGc, setDateGc] = useState(editApproval?.ifmisSlipDateGc || today());
  const [reason, setReason] = useState(details?.reason ?? '');
  const [description, setDescription] = useState(details?.description ?? '');
  const [condition, setCondition] = useState<string>(details?.condition ?? item.condition ?? '');
  // Book value follows the quantity until someone types their own figure
  const [bookValueText, setBookValueText] = useState(details?.bookValue !== undefined ? String(details.bookValue) : '');
  const [bookValueEdited, setBookValueEdited] = useState(details?.bookValue !== undefined);
  const [recipientName, setRecipientName] = useState(details?.recipientName ?? '');
  const [proceedsText, setProceedsText] = useState(details?.proceedsETB !== undefined ? String(details.proceedsETB) : '');
  const [committeeRef, setCommitteeRef] = useState(details?.committeeRef ?? '');
  // In edit mode the current document is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState(
    editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const bookValue = bookValueEdited ? amountOrUndefined(bookValueText) ?? 0 : unitPrice * quantity;
  const ethDate = formatGcToEc(dateGc);
  const isAttachmentReq = useSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !(Number.isInteger(quantity) && quantity >= 1 && quantity <= inStore) && 'quantity',
    !disposalNo.trim() && 'disposal reference no.',
    !dateGc && 'disposal date',
    !reason.trim() && 'reason',
    isAttachmentReq && !attachmentFileName && 'supporting document',
  ].filter(Boolean) as string[];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid file', error);
      return;
    }
    setFormError(null);
    setAttachmentFile(file);
    setAttachmentFileName(file.name);
  };

  const fail = (title: string, message: string) => {
    setFormError(message);
    toast.warning(title, message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!disposalNo.trim()) return fail('Reference required', 'The disposal reference number is required.');
    if (!reason.trim()) return fail('Reason required', 'Write the reason for disposal, e.g. damaged beyond repair or gift.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      return fail('Check quantity', `Quantity must be a whole number from 1 to ${inStore} (${uom} in store).`);
    }
    if (getSystemSettings().slipAttachmentPolicy === 'REQUIRED' && !attachmentFileName) {
      return fail('Document required', 'System policy requires a supporting document (e.g. the committee decision).');
    }

    const payload = {
      quantity,
      disposalNo: disposalNo.trim(),
      disposalDateGc: dateGc,
      reason: reason.trim(),
      description: description.trim() || undefined,
      condition: (condition || undefined) as ItemCondition | undefined,
      bookValue,
      recipientName: recipientName.trim() || undefined,
      proceedsETB: amountOrUndefined(proceedsText),
      committeeRef: committeeRef.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const fileUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
      if (editApproval) {
        const res = await api.updateDisposal(editApproval.id, { ...payload, ifmisSlipAttachmentUrl: fileUrl });
        toast.success('Disposal request updated', `The request for ${editApproval.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res.approval);
        return;
      }
      const result = await api.registerDisposal({ ...payload, itemId: item.id, ifmisSlipAttachmentUrl: fileUrl });
      toast.success('Disposal request submitted', `${quantity} ${uom} of ${item.itemCode} sent for approval (${payload.disposalNo}).`);
      onSuccess(result, buildDisposalVoucher(result, { item, employees: [], printedBy: user?.fullNameEn, requestedByName: user?.fullNameEn }));
    } catch (err: any) {
      setFormError(`The disposal request could not be saved: ${err?.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);

  return (
    <form id="disposal-form" onSubmit={handleSubmit} className="space-y-4">
      <FormError message={formError} />

      <FormSection step={1} title="Item to dispose of" subtitle="የሚወገደው ንብረት" icon={Trash2} accent="emerald">
        <FieldGrid>
          <Field label="Item code" hint={isEdit ? "The item can't be changed. To dispose of a different item, ask an approver to reject this request." : undefined}>
            <ReadOnlyValue mono>{item.itemCode}</ReadOnlyValue>
          </Field>
          <Field label="Item description" span="sm:col-span-2">
            <ReadOnlyValue>{item.name}</ReadOnlyValue>
          </Field>
          <Field label="Quantity to dispose of" required hint={`${inStore} ${uom} in store`}>
            <QuantityInput min={1} max={inStore} required value={quantity} onChange={setQuantity} />
          </Field>
          <Field label="Unit price (ETB)">
            <ReadOnlyValue mono align="right">{formatETB(unitPrice)}</ReadOnlyValue>
          </Field>
          <Field label="Book value (ETB)" hint={bookValueEdited ? 'Entered value' : 'Unit price × quantity; change it if the value is known'}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={bookValueEdited ? bookValueText : String(unitPrice * quantity)}
              onChange={(e) => {
                setBookValueEdited(true);
                setBookValueText(e.target.value);
              }}
              className={input({ mono: true, align: 'right' })}
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection step={2} title="Disposal details" subtitle="የማስወገጃ ምክንያት እና ዝርዝር" icon={FileText} accent="emerald">
        <div className="space-y-3.5">
          <FieldGrid>
            <Field label="Disposal reference no." required>
              <input
                type="text"
                required
                placeholder="e.g. DSP-2026-001"
                value={disposalNo}
                onChange={(e) => setDisposalNo(e.target.value)}
                className={`${input({ mono: true })} font-semibold`}
              />
            </Field>
            <Field label="Disposal date (G.C.)" required hint={`${ethDate} E.C.`}>
              <input type="date" required value={dateGc} onChange={(e) => setDateGc(e.target.value)} className={input()} />
            </Field>
            <Field label="Condition" optional>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className={input()}>
                <option value="">Not stated</option>
                <option value={ItemCondition.NEW}>New</option>
                <option value={ItemCondition.GOOD}>Good</option>
                <option value={ItemCondition.FAIR}>Fair</option>
                <option value={ItemCondition.NEEDS_REPAIR}>Needs repair</option>
                <option value={ItemCondition.DAMAGED}>Damaged</option>
              </select>
            </Field>
          </FieldGrid>

          <FieldGrid cols={2}>
            <Field label="Reason for disposal" required htmlFor="disposal-reason" hint="Pick a suggestion or write your own">
              <input
                id="disposal-reason"
                type="text"
                required
                list="disposal-reasons"
                placeholder="e.g. Damaged beyond repair"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={input()}
              />
              <datalist id="disposal-reasons">
                {DISPOSAL_REASON_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Disposed to (recipient / buyer)" optional hint="For a gift, sale or transfer to another body">
              <input
                type="text"
                placeholder="e.g. Kality Primary School"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className={input()}
              />
            </Field>
            <Field label="Proceeds (ETB)" optional hint="Money received, e.g. from a sale">
              <input
                type="number"
                min="0"
                step="0.01"
                value={proceedsText}
                onChange={(e) => setProceedsText(e.target.value)}
                className={input({ mono: true, align: 'right' })}
              />
            </Field>
            <Field label="Committee decision ref." optional>
              <input
                type="text"
                placeholder="e.g. DC/12/2026"
                value={committeeRef}
                onChange={(e) => setCommitteeRef(e.target.value)}
                className={input({ mono: true })}
              />
            </Field>
          </FieldGrid>

          <Field label="Justification" optional>
            <textarea
              rows={2}
              placeholder="e.g. Frames broken after the office flood; repair costs more than replacement."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={textareaClass('emerald')}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection step={3} title="Supporting document" subtitle="ደጋፊ ሰነድ" icon={ClipboardList} accent="emerald">
        <div className="space-y-3.5">
          <Field label="Requested by (store)">
            <ReadOnlyValue>{editApproval?.requestedBy?.fullNameEn || user?.fullNameEn || '—'}</ReadOnlyValue>
          </Field>
          <FileDropField
            label="Committee decision or other document"
            accent="emerald"
            required={isAttachmentReq}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleFile}
          />
        </div>
      </FormSection>

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
        missingFields={missingFields}
        onCancel={onCancel}
      />
    </form>
  );
};

/** Disposal voucher for a disposal request, from the request and its item */
export const buildDisposalVoucher = (
  approval: TransactionApproval,
  context: { item?: ItemWithRelations; employees: Employee[]; printedBy?: string; requestedByName?: string },
): DisposalVoucher => {
  const { item, employees } = context;
  const d = approval.requestDetails ?? {};
  const nameOf = (id?: string, fallback?: { fullNameEn?: string }) => employees.find((e) => e.id === id)?.fullNameEn || fallback?.fullNameEn;
  const unitPrice = item?.unitCostETB || 0;
  const quantity = Number(d.quantity) || Number(item?.quantity) || 1;
  const dateGc = approval.ifmisSlipDateGc || (approval.createdAtGc || '').split('T')[0];
  return {
    approvalState: approval.status === 'PENDING' ? 'PENDING' : approval.status === 'REJECTED' ? 'REJECTED' : undefined,
    disposalNo: approval.ifmisSlipNumber || '',
    dateGc,
    dateEc: approval.ifmisSlipDateEc || (dateGc ? formatGcToEc(dateGc) : undefined),
    reason: d.reason || '—',
    description: d.description,
    condition: d.condition,
    recipientName: d.recipientName,
    proceedsETB: d.proceedsETB,
    committeeRef: d.committeeRef,
    items: [
      {
        sNo: 1,
        // A partial disposal is filed under the record split off for the disposed units
        itemCode: d.disposedItemCode || approval.itemCode,
        description: approval.itemName,
        serialNo: item?.serialNumber || undefined,
        uom: d.uom || item?.uom || 'EA',
        quantity,
        unitPrice,
        bookValue: d.bookValue ?? unitPrice * quantity,
      },
    ],
    requestedByName: context.requestedByName || nameOf(approval.requestedById, approval.requestedBy),
    endorsedByName: nameOf(approval.endorsedById, approval.endorsedBy),
    approvedByName: approval.status === 'APPROVED' ? nameOf(approval.reviewedById, approval.reviewedBy) : undefined,
    printedBy: context.printedBy,
  };
};
