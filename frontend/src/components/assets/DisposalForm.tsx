import React, { useEffect, useState } from 'react';
import { Trash2, FileText, ClipboardList } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FormSection, FieldGrid, Field, ReadOnlyValue, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, textareaClass, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { readPdfRows, rowsToText, isModel19, isModel21, isDisposalForm, parseDisposalForm, DisposalSlipFields, DisposalSlipLine } from '../../utils/slip-reader';
import { OtherAssets } from './OtherAssets';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DisposalVoucher, Employee, ItemCondition, ItemStatus, ItemWithRelations, TransactionApproval } from '../../types/asset-management';
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
  /** Every record, to find the other assets a disposal form lists */
  allItems?: ItemWithRelations[];
  /** Records that already have a request waiting for approval */
  pendingItemIds?: Set<string>;
  /** A disposal form PDF chosen with the form's header button: it is read into the form */
  slip?: File;
}

/** How IFMIS names the disposal, as the reason offered here */
const REASON_FROM_IFMIS: [RegExp, string][] = [
  [/donat|gift|transfer/i, 'Gift / donation'],
  [/sale|sold|auction/i, 'Sale / auction'],
  [/scrap|damage|write/i, 'Damaged beyond repair'],
  [/obsolete/i, 'Obsolete / no longer needed'],
  [/lost|stolen|theft/i, 'Lost or stolen'],
];

/** An asset's status in words, for what a disposal form can't be used for */
const STATUS_WORDS: Record<string, string> = {
  PENDING_STOCK_IN: 'still waiting for receipt approval',
  PENDING_STOCK_OUT: 'waiting for issue approval',
  ISSUED: 'issued to someone; take it back to store first',
  UNDER_TRANSFER: 'under transfer',
  PENDING_DISPOSAL: 'waiting for disposal approval',
  DISPOSED: 'already disposed',
  REJECTED: 'rejected at receipt',
};

const today = () => new Date().toISOString().split('T')[0];
const amountOrUndefined = (text: string) => (text.trim() === '' ? undefined : Math.max(0, Number(text) || 0));

export const DisposalForm: React.FC<DisposalFormProps> = ({ item, editApproval, onCancel, onSuccess, allItems = [], pendingItemIds, slip }) => {
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
  // The storekeeper named on the form: a store man of the store the item is in
  const keepers = useStoreKeepers();
  const [keeperId, setKeeperId] = useState('');
  const storeMen = keepers.ofLocation(item.storeLocationId);

  const bookValue = bookValueEdited ? amountOrUndefined(bookValueText) ?? 0 : unitPrice * quantity;
  const ethDate = formatGcToEc(dateGc);
  const isAttachmentReq = useSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !(Number.isInteger(quantity) && quantity >= 1 && quantity <= inStore) && 'quantity',
    !isEdit && storeMen.length > 1 && !keeperId && 'storekeeper (store man)',
    !disposalNo.trim() && 'disposal reference no.',
    !dateGc && 'disposal date',
    !reason.trim() && 'reason',
    isAttachmentReq && !attachmentFileName && 'supporting document',
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    disposalNo: !disposalNo.trim() && 'Enter the disposal reference number.',
    date: !dateGc && 'Enter the date of the disposal.',
    reason: !reason.trim() && 'Say why the item is being disposed of.',
  });

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

  // ── Reading a disposal form PDF from IFMIS ──
  const [slipNote, setSlipNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  // The other assets the form lists: each that fits is disposed of as its own request on submit
  const [extraAssets, setExtraAssets] = useState<{ key: number; line: DisposalSlipLine; asset?: ItemWithRelations; problem?: string }[]>([]);
  const extraReady = extraAssets.filter((o) => o.asset && !o.problem) as { key: number; line: DisposalSlipLine; asset: ItemWithRelations }[];

  /** Whether an asset the form lists can be disposed of, in the order of its life: received, approved and in store, with nothing pending */
  const checkLine = (line: DisposalSlipLine): { asset?: ItemWithRelations; problem?: string } => {
    const tag = line.tagNumber?.trim().toLowerCase();
    if (!tag) return { problem: 'The line names no tag number.' };
    const asset = allItems.find((i) => i.itemCode.toLowerCase() === tag || i.serialNumber?.trim().toLowerCase() === tag);
    if (!asset) return { problem: `No asset with tag ${line.tagNumber} is registered here. It has to be received on a Model 19 and approved first.` };
    if (asset.status !== ItemStatus.AVAILABLE) return { asset, problem: `${asset.itemCode} is ${STATUS_WORDS[asset.status] ?? asset.status.toLowerCase()}; only an item in store can be disposed of.` };
    if (pendingItemIds?.has(asset.id)) return { asset, problem: `${asset.itemCode} already has a request waiting for approval.` };
    return { asset };
  };

  const fillFromDisposalForm = (form: DisposalSlipFields) => {
    const filled: string[] = [];
    const problems: string[] = [];
    if (form.disposalNo && !disposalNo.trim()) {
      setDisposalNo(form.disposalNo);
      filled.push('reference no.');
    }
    if (form.date && (!dateGc || dateGc === today())) {
      setDateGc(form.date);
      filled.push('date');
    }
    if (form.recipient && !recipientName.trim()) {
      setRecipientName(form.recipient);
      filled.push('disposed to');
    }
    const type = form.lines.find((l) => l.disposalType)?.disposalType;
    if (type && !reason.trim()) {
      setReason(REASON_FROM_IFMIS.find(([pattern]) => pattern.test(type))?.[1] ?? type.charAt(0) + type.slice(1).toLowerCase());
      filled.push('reason');
    }
    // This record's own line
    const tagOf = (l: DisposalSlipLine) => l.tagNumber?.trim().toLowerCase();
    const own = form.lines.find((l) => tagOf(l) === item.itemCode.toLowerCase() || (!!item.serialNumber && tagOf(l) === item.serialNumber.trim().toLowerCase()));
    if (!own) problems.push(`${item.itemCode} isn't on this disposal form.`);
    else if (own.bookValue !== undefined && !bookValueEdited) {
      setBookValueText(String(own.bookValue));
      setBookValueEdited(true);
      filled.push('book value');
    }
    // The others, each checked the same way; a correction keeps to its one record
    const others = isEdit ? [] : form.lines.filter((l) => l !== own).map((l, i) => ({ key: i, line: l, ...checkLine(l) }));
    setExtraAssets(others);
    const ready = others.filter((o) => o.asset && !o.problem).length;
    const more = others.length
      ? ` The form lists ${form.lines.length} assets: the others are listed below${ready ? `; ${ready} of them will be disposed of as their own requests when you submit` : ''}.`
      : '';
    if (problems.length) setSlipNote({ tone: 'warn', text: `${problems.join(' ')}${filled.length ? ` Filled in: ${filled.join(', ')}.` : ''}${more}` });
    else if (filled.length) setSlipNote({ tone: 'info', text: `Filled in from the disposal form: ${filled.join(', ')}. Check them against the paper before submitting.${more}` });
    else setSlipNote({ tone: 'info', text: `The form was read, but every field it covers is already filled in.${more}` });
  };

  /** Only a disposal form is read here; another IFMIS form is named, so it can be taken to its own form */
  const readSlip = (file: File) => {
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return void setSlipNote({ tone: 'warn', text: 'Choose the disposal form as a PDF saved from IFMIS.' });
    setSlipNote({ tone: 'info', text: 'Reading the disposal form…' });
    readPdfRows(file)
      .then((rows) => {
        const text = rowsToText(rows);
        if (!text.trim()) return setSlipNote({ tone: 'warn', text: 'This PDF has no text (it is a scanned image), so it could not be read. Fill in the fields as usual.' });
        if (isDisposalForm(text)) return fillFromDisposalForm(parseDisposalForm(rows));
        setSlipNote({
          tone: 'warn',
          text: isModel19(text)
            ? 'This is a Model 19 receipt, not a disposal form. Read it from Receive items (Import receipt).'
            : isModel21(text)
              ? 'This is a Model 21 transfer form, not a disposal form. Read it from the transfer form of the asset (Import transfer).'
              : 'Only an IFMIS Fixed Asset Disposal Form (Model 22/B) PDF can be read here.',
        });
      })
      .catch(() => setSlipNote({ tone: 'warn', text: "The PDF couldn't be read. Fill in the fields as usual." }));
  };

  // A PDF chosen with the form's header button
  useEffect(() => {
    if (slip) readSlip(slip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slip]);

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
      storekeeperEmployeeId: keeperId || (storeMen.length === 1 ? storeMen[0].employeeId : undefined),
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
      // The other assets on the form, each its own request with the same reference, date, reason and recipient
      const sent: string[] = [];
      const notSent: string[] = [];
      for (const other of extraReady) {
        try {
          const men = keepers.ofLocation(other.asset.storeLocationId);
          await api.registerDisposal({
            itemId: other.asset.id,
            quantity: Number(other.asset.quantity) || 1,
            disposalNo: payload.disposalNo,
            disposalDateGc: payload.disposalDateGc,
            reason: payload.reason,
            recipientName: payload.recipientName,
            committeeRef: payload.committeeRef,
            bookValue: other.line.bookValue,
            ifmisSlipAttachmentUrl: fileUrl,
            storekeeperEmployeeId: men.some((k) => k.employeeId === payload.storekeeperEmployeeId) ? payload.storekeeperEmployeeId : undefined,
          } as any);
          sent.push(other.asset.itemCode);
        } catch (err: any) {
          notSent.push(`${other.asset.itemCode}: ${err?.message || 'refused'}`);
        }
      }
      if (notSent.length) toast.warning('Some assets on the form were not submitted', notSent.join(' · '));
      toast.success(
        'Disposal request submitted',
        sent.length
          ? `${[item.itemCode, ...sent].join(', ')} sent for approval (${payload.disposalNo}), each as its own request.`
          : `${quantity} ${uom} of ${item.itemCode} sent for approval (${payload.disposalNo}).`,
      );
      onSuccess(result, buildDisposalVoucher(result, { item, employees: [], printedBy: user?.fullNameEn, requestedByName: user?.fullNameEn }));
    } catch (err: any) {
      setFormError(`The disposal request could not be saved: ${err?.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  return (
    <form id="disposal-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-4">
      <FormError message={formError} />
      {slipNote && (
        <FormNotice icon={FileText} tone={slipNote.tone}>
          <span role="status">{slipNote.text}</span>
        </FormNotice>
      )}
      {extraAssets.length > 0 && (
        <OtherAssets
          label="Other assets on this form"
          note="each that fits is disposed of as its own request, with the same reference"
          okLabel="Will be disposed of"
          notLabel="Not disposed of"
          assets={extraAssets.map((o) => ({ key: o.key, code: o.asset?.itemCode ?? o.line.tagNumber ?? '—', name: o.asset?.name ?? o.line.description, problem: o.problem }))}
          onLeaveOut={(key) => setExtraAssets((list) => list.filter((x) => x.key !== key))}
        />
      )}

      <FormSection step={1} title="Item to dispose of" subtitle="የሚወገደው ንብረት" icon={Trash2} accent="emerald">
        <FieldGrid>
          <Field label="Item code" hint={isEdit ? "The item can't be changed. To dispose of a different item, ask an approver to reject this request." : undefined}>
            <ReadOnlyValue mono>{item.itemCode}</ReadOnlyValue>
          </Field>
          <Field label="Item description" span="sm:col-span-2">
            <ReadOnlyValue>{item.name}</ReadOnlyValue>
          </Field>
          <Field label="Quantity to dispose of" required htmlFor="disposal-quantity" hint={quantity > inStore ? `Only ${inStore} ${uom} in store` : `${inStore} ${uom} in store`}>
            <QuantityInput id="disposal-quantity" min={1} max={inStore} required value={quantity} onChange={setQuantity} />
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
            <Field label="Disposal reference no." required error={fieldErrors.error('disposalNo')}>
              <input
                type="text"
                required
                placeholder="e.g. DSP-2026-001"
                value={disposalNo}
                onChange={(e) => setDisposalNo(e.target.value)}
                onBlur={fieldErrors.touch('disposalNo')}
                autoFocus={!isEdit}
                className={`${input({ mono: true, invalid: !!fieldErrors.error('disposalNo') })} font-semibold`}
              />
            </Field>
            <Field label="Disposal date (G.C.)" required hint={`${ethDate} E.C.`} error={fieldErrors.error('date')}>
              <input type="date" required value={dateGc} onChange={(e) => setDateGc(e.target.value)} onBlur={fieldErrors.touch('date')} className={input({ invalid: !!fieldErrors.error('date') })} />
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
            <Field label="Reason for disposal" required htmlFor="disposal-reason" error={fieldErrors.error('reason')} hint="Pick a suggestion or write your own">
              <input
                id="disposal-reason"
                type="text"
                required
                list="disposal-reasons"
                placeholder="e.g. Damaged beyond repair"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={fieldErrors.touch('reason')}
                className={input({ invalid: !!fieldErrors.error('reason') })}
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
          <StoreManField
            id="disposal-storekeeper"
            label="Storekeeper (store man)"
            keepers={storeMen}
            ready={keepers.ready}
            storeName={keepers.storeName(item.storeLocation?.storeId)}
            value={keeperId}
            onChange={setKeeperId}
            current={isEdit ? editApproval?.requestDetails?.storekeeperName : undefined}
            required={!isEdit}
          />
          <FileDropField
            label="Committee decision or other document"
            accent="emerald"
            required={isAttachmentReq}
            fileName={attachmentFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={handleFile}
            file={attachmentFile}
            savedUrl={editApproval?.ifmisSlipAttachmentUrl}
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
    storekeeperName: d.storekeeperName,
    endorsedByName: nameOf(approval.endorsedById, approval.endorsedBy),
    approvedByName: approval.status === 'APPROVED' ? nameOf(approval.reviewedById, approval.reviewedBy) : undefined,
    printedBy: context.printedBy,
  };
};
