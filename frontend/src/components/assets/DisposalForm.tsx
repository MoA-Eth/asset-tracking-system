import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
import React, { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { FieldGrid, Field, ReadOnlyValue, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { Part, SlipPreview } from './FormParts';
import { readPdfRows, rowsToText, isModel19, isModel21, isDisposalForm, parseDisposalForm, DisposalSlipFields, DisposalSlipLine } from '../../utils/slip-reader';
import { OtherAssets } from './OtherAssets';
import { LearnTagPrompt, taggableAssets } from './LearnTagPrompt';
import { findByTag, printedTag, tagKey, displaySerialNumber } from '../../utils/asset-tag';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DisposalVoucher, Employee, ItemCondition, ItemStatus, ItemWithRelations, TransactionApproval } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { costOf } from '../../utils/item-cost';
import { getSystemSettings, useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName, SCAN_HINT } from '../../utils/slip-upload';

/** Disposal types as IFMIS prints them in the Disposal Type column; another can be typed as IFMIS names it */
export const DISPOSAL_TYPES = ['TRANSFER', 'DONATION', 'SALE', 'SCRAP'];

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
  /** An asset changed while the form was open, e.g. its IFMIS tag number was recorded */
  onItemUpdated?: (item: ItemWithRelations) => void;
}

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

export const DisposalForm: React.FC<DisposalFormProps> = ({ item, editApproval, onCancel, onSuccess, allItems = [], pendingItemIds, slip, onItemUpdated }) => {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!editApproval;
  const details = editApproval?.requestDetails;

  const inStore = Number(item.quantity) || 1;
  const uom = item.uom || 'EA';
  // What a unit cost, VAT and charges in: the original cost IFMIS prints
  const unitPrice = costOf(item);

  const [submitting, setSubmitting] = useState(false);

  const [quantity, setQuantity] = useState<number>(Number(details?.quantity) || inStore);
  const [disposalNo, setDisposalNo] = useState(editApproval?.ifmisSlipNumber ?? '');
  const [dateGc, setDateGc] = useState(editApproval?.ifmisSlipDateGc || today());
  const [reason, setReason] = useState(details?.reason ?? '');
  const [description, setDescription] = useState(details?.description ?? '');
  // Condition is no longer asked on disposal; a correction keeps what an older request recorded
  const condition = details?.condition || undefined;
  // Book value follows the quantity until someone types their own figure
  const [bookValueText, setBookValueText] = useState(details?.bookValue !== undefined ? String(details.bookValue) : '');
  const [bookValueEdited, setBookValueEdited] = useState(details?.bookValue !== undefined);
  const [recipientName, setRecipientName] = useState(details?.recipientName ?? '');
  // Not on the IFMIS form, so no longer asked; a correction keeps what an older request recorded
  const keptProceeds = details?.proceedsETB;
  const keptCommitteeRef = details?.committeeRef;
  // Organizations, offered for "Sold / transferred / donated to"
  const [organizations, setOrganizations] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.getOrganizations())
      .then((list) => live && setOrganizations((list ?? []).filter((o) => o.isActive !== false).map((o) => o.name)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  // In edit mode the current document is kept unless a new file is chosen
  const [attachmentFileName, setAttachmentFileName] = useState(
    editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : ''
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [readFile, setReadFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The storekeeper named on the form: a store man of the store the item is in
  const keepers = useStoreKeepers();
  const [keeperId, setKeeperId] = useState('');
  const storeMen = keepers.ofLocation(item.storeLocationId);

  const bookValue = bookValueEdited ? amountOrUndefined(bookValueText) ?? 0 : unitPrice * quantity;
  const ethDate = formatGcToEc(dateGc);
  const { slipAttachmentPolicy, showScannedSlipField } = useSystemSettings();
  const isAttachmentReq = slipAttachmentPolicy === 'REQUIRED';

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !(Number.isFinite(quantity) && quantity > 0 && quantity <= inStore) && 'quantity',
    !isEdit && storeMen.length > 1 && !keeperId && 'storekeeper (store man)',
    !disposalNo.trim() && 'disposal form no.',
    !dateGc && 'date',
    !reason.trim() && 'disposal type',
    isAttachmentReq && (showScannedSlipField ? !attachmentFileName : !(readFile || attachmentFileName || editApproval?.ifmisSlipAttachmentUrl)) && (showScannedSlipField ? 'signed copy' : 'IFMIS disposal form PDF'),
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({});

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
  // IFMIS tags the form names that no asset has; each can be recorded on the asset it is, and the form read again
  const [unknownTags, setUnknownTags] = useState<string[]>([]);
  // Assets the form already names: not offered for another line's tag
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const learnedTags = useRef(new Map<string, string>());
  const lastRead = useRef<DisposalSlipFields | null>(null);
  // This record is always one of the assets, also when correcting a request (which has no list)
  const knownItems = allItems.some((i) => i.id === item.id) ? allItems : [item, ...allItems];

  /** The asset a line names: by its tag, or else by the serial number it was received with (its IFMIS tag not recorded yet) */
  const assetOf = (line: DisposalSlipLine) =>
    findByTag(knownItems, line.tagNumber, learnedTags.current) ??
    (line.serialNumber?.trim() ? knownItems.find((i) => !!i.serialNumber?.trim() && tagKey(i.serialNumber) === tagKey(line.serialNumber)) : undefined);

  /** Whether an asset the form lists can be disposed of, in the order of its life: received, approved and in store, with nothing pending */
  const checkLine = (line: DisposalSlipLine): { asset?: ItemWithRelations; problem?: string } => {
    if (!line.tagNumber?.trim()) return { problem: 'The line names no tag number.' };
    const asset = assetOf(line);
    if (!asset) return { problem: `No asset here has the tag ${line.tagNumber}. If it was received under another code, record the tag on it above; otherwise it has to be received on a Model 19 and approved first.` };
    if (asset.status !== ItemStatus.AVAILABLE) return { asset, problem: `${asset.itemCode} is ${STATUS_WORDS[asset.status] ?? asset.status.toLowerCase()}; only an item in store can be disposed of.` };
    if (pendingItemIds?.has(asset.id)) return { asset, problem: `${asset.itemCode} already has a request waiting for approval.` };
    return { asset };
  };

  const fillFromDisposalForm = (form: DisposalSlipFields) => {
    lastRead.current = form;
    setUnknownTags([...new Set(form.lines.filter((l) => !assetOf(l)).map((l) => l.tagNumber?.trim() ?? '').filter(Boolean))]);
    setMatchedIds(new Set(form.lines.map((l) => assetOf(l)?.id).filter((id): id is string => !!id)));
    const filled: string[] = [];
    const problems: string[] = [];
    if (form.disposalNo && !disposalNo.trim()) {
      setDisposalNo(form.disposalNo);
      filled.push('No.');
    }
    if (form.date && (!dateGc || dateGc === today())) {
      setDateGc(form.date);
      filled.push('date');
    }
    if (form.recipient && !recipientName.trim()) {
      setRecipientName(form.recipient);
      filled.push('sold / transferred / donated to');
    }
    const type = form.lines.find((l) => l.disposalType)?.disposalType;
    if (type && !reason.trim()) {
      setReason(type.trim().toUpperCase());
      filled.push('disposal type');
    }
    // This record's own line
    const own = form.lines.find((l) => assetOf(l)?.id === item.id);
    if (!own) problems.push(`${item.itemCode} isn't on this disposal form${item.ifmisTagNumber ? ` (its IFMIS tag is ${item.ifmisTagNumber})` : ''}.`);
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

  // The IFMIS PDF the form was read from
  /** Only a disposal form is read here; another IFMIS form is named, so it can be taken to its own form */
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
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return void setSlipNote({ tone: 'warn', text: 'Choose the disposal form as a PDF saved from IFMIS.' });
    setReadFile(file);
    setSlipNote({ tone: 'info', text: 'Reading the disposal form…' });
    readPdfRows(file)
      .then((rows) => {
        const text = rowsToText(rows);
        if (!text.trim()) return setSlipNote({ tone: 'warn', text: `This PDF is a scan, so nothing could be read from it. Fill in the fields as usual. ${SCAN_HINT}` });
        if (isDisposalForm(text)) return fillFromDisposalForm(parseDisposalForm(rows));
        setSlipNote({
          tone: 'warn',
          text: isModel19(text)
            ? 'This is a Model 19 receipt, not a disposal form. Read it on Receive items (Model 19).'
            : isModel21(text)
              ? 'This is a Model 21 transfer form, not a disposal form. Read it on the transfer form of the asset.'
              : 'Only an IFMIS Fixed Asset Disposal Form (Model 22/B) PDF can be read here.',
        });
      })
      .catch(() => setSlipNote({ tone: 'warn', text: "The PDF couldn't be read. Fill in the fields as usual." }));
  };

  /** A tag was recorded on an asset: the form is read again, so that asset is found */
  const tagLearned = (tag: string, asset: ItemWithRelations) => {
    learnedTags.current.set(asset.id, asset.ifmisTagNumber ?? tag);
    onItemUpdated?.(asset);
    if (lastRead.current) fillFromDisposalForm(lastRead.current);
  };

  // A PDF handed to the form when it opens
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
    if (!item && !editApproval) return fail('Asset required', 'Choose the asset to dispose of.');
    const effectiveDisposalNo = disposalNo.trim() || `PENDING-DISP-${Date.now()}`;
    const effectiveReason = (reason.trim() || 'Disposal').toUpperCase();
    const effectiveQty = Number.isInteger(quantity) && quantity >= 1
      ? (inStore && quantity > inStore ? inStore : quantity)
      : 1;

    const payload = {
      quantity: effectiveQty,
      disposalNo: effectiveDisposalNo,
      disposalDateGc: dateGc,
      reason: effectiveReason,
      description: description.trim() || undefined,
      condition: condition as ItemCondition | undefined,
      bookValue,
      recipientName: recipientName.trim() || undefined,
      proceedsETB: keptProceeds,
      committeeRef: keptCommitteeRef,
      storekeeperEmployeeId: keeperId || (storeMen.length === 1 ? storeMen[0].employeeId : undefined),
    };

    setSubmitting(true);
    try {
      // The signed copy, or else the IFMIS PDF the form was read from
      const copy = attachmentFile ?? readFile;
      const fileUrl = copy ? (await api.uploadSlip(copy)).url : undefined;
      if (editApproval) {
        const res = await api.updateDisposal(editApproval.id, { ...payload, ifmisSlipAttachmentUrl: fileUrl });
        toast.success('Disposal request updated', `The request for ${editApproval.itemCode} was corrected. ${editApproval.status === 'RETURNED' ? 'It stays returned for correction until it is resubmitted.' : 'It is still waiting for Team Leader endorsement.'}`);
        onSuccess(res.approval);
        return;
      }
      const result = await api.registerDisposal({ ...payload, itemId: item.id, ifmisSlipAttachmentUrl: fileUrl });
      // The other assets on the form, each its own request with the same reference, date, reason and recipient
      const sent: string[] = [];
      const notSent: string[] = [];
      // What was filed on this form, for the voucher to list every asset
      const filed: TransactionApproval[] = [result];
      const filedItems: ItemWithRelations[] = [];
      for (const other of extraReady) {
        try {
          const men = keepers.ofLocation(other.asset.storeLocationId);
          const otherResult = await api.registerDisposal({
            itemId: other.asset.id,
            quantity: Number(other.asset.quantity) || 1,
            disposalNo: payload.disposalNo,
            disposalDateGc: payload.disposalDateGc,
            reason: payload.reason,
            recipientName: payload.recipientName,
            bookValue: other.line.bookValue,
            ifmisSlipAttachmentUrl: fileUrl,
            storekeeperEmployeeId: men.some((k) => k.employeeId === payload.storekeeperEmployeeId) ? payload.storekeeperEmployeeId : undefined,
          } as any);
          sent.push(other.asset.itemCode);
          filed.push(otherResult);
          filedItems.push(other.asset);
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
      // Newest first, as the server lists requests
      onSuccess(result, buildDisposalVoucher(result, { item, employees: [], printedBy: user?.fullNameEn, requestedByName: user?.fullNameEn, requests: [...filed].reverse(), items: filedItems }));
    } catch (err: any) {
      setFormError(`The disposal request could not be saved: ${err?.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);

  return (
    <form id="disposal-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(!submitting)} className="space-y-4">

      <FormError message={formError} />
      {/* The IFMIS PDF: it fills in the form and acts as the attached slip */}
      {(!isEdit || !showScannedSlipField) && (
        <FileDropField
          label="IFMIS disposal form PDF (Model 22/B)"
          accent="emerald"
          required={false}
          fileName={readFile?.name ?? (!showScannedSlipField && editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : '')}
          accept={SLIP_ACCEPT_ATTR}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) readSlip(file);
          }}
          file={readFile}
          savedUrl={!showScannedSlipField ? editApproval?.ifmisSlipAttachmentUrl : undefined}
          emptyText="Click to choose the disposal form PDF saved from IFMIS, or a photo"
          hint={
            showScannedSlipField
              ? "The form fills itself in from it; a scanned PDF can't be read."
              : "Autofills form fields and attaches this PDF directly to the disposal request."
          }
        />
      )}
      {slipNote && (
        <FormNotice icon={FileText} tone={slipNote.tone}>
          <span role="status">{slipNote.text}</span>
        </FormNotice>
      )}
      {unknownTags.length > 0 && (
        <LearnTagPrompt tags={unknownTags} candidates={taggableAssets(isEdit ? [item] : knownItems, learnedTags.current).filter((a) => !matchedIds.has(a.id))} suggestedId={item.id} onLearned={tagLearned} />
      )}
      {extraAssets.length > 0 && (
        <OtherAssets
          label="Other assets on this form"
          note="each that fits is disposed of as its own request, with the same No."
          okLabel="Will be disposed of"
          notLabel="Not disposed of"
          assets={extraAssets.map((o) => ({ key: o.key, code: o.asset?.itemCode ?? o.line.tagNumber ?? '—', name: o.asset?.name ?? o.line.description, problem: o.problem }))}
          onLeaveOut={(key) => setExtraAssets((list) => list.filter((x) => x.key !== key))}
        />
      )}

      <Part title="Voucher">
        <FieldGrid>
          <Field label="No." optional htmlFor="disposal-no" error={fieldErrors.error('disposalNo')} hint="As printed at the top right of the IFMIS form">
            <input
              id="disposal-no"
            type="text"
              placeholder="e.g. 0001765/2018"
              value={disposalNo}
              onChange={(e) => setDisposalNo(e.target.value)}
              onBlur={fieldErrors.touch('disposalNo')}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('disposalNo') })} font-semibold`}
            />
          </Field>
          <Field label="Date (G.C.)" optional hint={`${ethDate} E.C.`} error={fieldErrors.error('date')}>
            <input type="date" value={dateGc} onChange={(e) => setDateGc(e.target.value)} onBlur={fieldErrors.touch('date')} className={input({ invalid: !!fieldErrors.error('date') })} />
          </Field>
          <Field label="Disposal type" optional htmlFor="disposal-reason" error={fieldErrors.error('reason')} hint="As IFMIS prints it; pick one or type another">
            <input
              id="disposal-reason"
              type="text"
              required
              list="disposal-types"
              placeholder="e.g. TRANSFER"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={fieldErrors.touch('reason')}
              className={`${input({ invalid: !!fieldErrors.error('reason') })} uppercase`}
            />
            <datalist id="disposal-types">
              {DISPOSAL_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </FieldGrid>
        <Field label="Sold / transferred / donated to" optional htmlFor="disposal-recipient" hint="The body or person it goes to, as on the form">
          <input
            id="disposal-recipient"
            type="text"
            list="disposal-organizations"
            placeholder="e.g. East Shawa Zone Agriculture Office/Umer Ahmed"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className={input()}
          />
          <datalist id="disposal-organizations">
            {organizations.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      </Part>

      <Part title="Asset">
        <FieldGrid>
          <Field label={item.ifmisTagNumber ? 'Tag number (IFMIS)' : 'Tag number'} hint={isEdit ? "The asset can't be changed. To dispose of a different one, ask an approver to reject this request." : item.ifmisTagNumber ? `Record code ${item.itemCode}` : undefined}>
            <ReadOnlyValue mono>{printedTag(item)}</ReadOnlyValue>
          </Field>
          <Field label="Asset description" span="sm:col-span-2">
            <ReadOnlyValue>{item.name}</ReadOnlyValue>
          </Field>
          <Field label="Serial number">
            <ReadOnlyValue mono>{displaySerialNumber(item.serialNumber)}</ReadOnlyValue>
          </Field>
          {/* A batch in store can be disposed of in part; a fixed asset is always one */}
          {inStore > 1 && (
            <Field label="Quantity to dispose of" optional htmlFor="disposal-quantity" hint={quantity > inStore ? `Only ${inStore} ${uom} in store` : `${inStore} ${uom} in store`}>
              <QuantityInput id="disposal-quantity" min={1} max={inStore} value={quantity} onChange={setQuantity} />
            </Field>
          )}
          <Field label="Original cost (ETB)">
            <ReadOnlyValue mono align="right">{formatETB(unitPrice * quantity)}</ReadOnlyValue>
          </Field>
          <Field label="Book value (ETB)" hint={bookValueEdited ? `Accumulated depreciation ${formatETB(Math.max(unitPrice * quantity - bookValue, 0))}` : 'The original cost until the book value is entered'}>
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label="Book value (ETB)"
              value={bookValueEdited ? bookValueText : String(unitPrice * quantity)}
              onChange={(e) => {
                setBookValueEdited(true);
                setBookValueText(e.target.value);
              }}
              className={input({ mono: true, align: 'right' })}
            />
          </Field>
          <Field label="Remark" optional span="sm:col-span-2">
            <input
              type="text"
              aria-label="Remark"
              placeholder="Printed in the Remark column"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={input()}
            />
          </Field>
        </FieldGrid>
      </Part>

      <Part title="Store and signatures">
        <StoreManField
          id="disposal-storekeeper"
          label="Storekeeper (store man)"
          keepers={storeMen}
          ready={keepers.ready}
          storeName={keepers.storeName(item.storeLocation?.storeId)}
          value={keeperId}
          onChange={setKeeperId}
          current={isEdit ? editApproval?.requestDetails?.storekeeperName : undefined}
          required={false}
        />
        {/* The signed disposal form, scanned: kept as the request's copy (the IFMIS PDF until it is added) */}
        {showScannedSlipField && (
          <div id="disposal-signed-copy">
            <FileDropField
              label="Signed copy"
              accent="emerald"
              required={false}
              fileName={attachmentFileName}
              accept={SLIP_ACCEPT_ATTR}
              onChange={handleFile}
              file={attachmentFile}
              savedUrl={editApproval?.ifmisSlipAttachmentUrl}
              emptyText="Click to attach the signed disposal form, scanned"
              hint="The IFMIS printout with its signatures, as a scan or photo. Until it is added, the IFMIS PDF is kept as the copy."
            />
          </div>
        )}
      </Part>

      {/* The slip itself, open under the form, to check what was filled in against it */}
      <SlipPreview ifmisFile={readFile} signedFile={attachmentFile} savedUrl={editApproval?.ifmisSlipAttachmentUrl} />

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Submit for approval'}
        missingFields={missingFields}
        fieldTargets={{
          'disposal form no.': '#disposal-no',
          'disposal type': '#disposal-reason',
          'storekeeper (store man)': '#disposal-storekeeper',
          'signed copy': '#disposal-signed-copy input[type=file]',
          quantity: '#disposal-quantity',
        }}
        onCancel={onCancel}
      />
    </form>
  );
};

/**
 * The requests filed on the same disposal form (the same No.): each asset on it is its own request. A rejected one
 * prints on its own. In the order they were saved.
 */
export const sameDisposalForm = (approval: TransactionApproval, requests: TransactionApproval[] = []): TransactionApproval[] => {
  const no = approval.ifmisSlipNumber?.trim().toLowerCase();
  if (!no || no.startsWith('pending-') || approval.status === 'REJECTED') return [approval];
  const lines = requests.filter(
    (r) => r.id === approval.id || (r.transactionType === 'DISPOSAL' && r.status !== 'REJECTED' && r.ifmisSlipNumber?.trim().toLowerCase() === no),
  );
  if (!lines.some((r) => r.id === approval.id)) lines.push(approval);
  // The list comes newest first: the later in the list was saved first
  const at = (r: TransactionApproval) => requests.findIndex((x) => x.id === r.id);
  return lines.sort((a, b) => String(a.createdAtGc ?? '').slice(0, 10).localeCompare(String(b.createdAtGc ?? '').slice(0, 10)) || at(b) - at(a));
};

/**
 * Disposal voucher for a disposal request, from the request and its item. Given the other requests (and their items),
 * it lists every asset filed on the same disposal form, as the paper does.
 */
export const buildDisposalVoucher = (
  approval: TransactionApproval,
  context: { item?: ItemWithRelations; employees: Employee[]; printedBy?: string; requestedByName?: string; requests?: TransactionApproval[]; items?: ItemWithRelations[] },
): DisposalVoucher => {
  const { item, employees } = context;
  const d = approval.requestDetails ?? {};
  const nameOf = (id?: string, fallback?: { fullNameEn?: string }) => employees.find((e) => e.id === id)?.fullNameEn || fallback?.fullNameEn;
  const lineOf = (r: TransactionApproval, sNo: number) => {
    const rd = r.requestDetails ?? {};
    const it = r.id === approval.id ? item : context.items?.find((x) => x.id === r.itemId);
    const unitPrice = costOf(it);
    const quantity = Number(rd.quantity) || Number(it?.quantity) || 1;
    return {
      sNo,
      // A partial disposal is filed under the record split off for the disposed units
      // IFMIS prints a fixed asset's own tag number when it has one
      itemCode: it?.ifmisTagNumber || rd.disposedItemCode || r.itemCode,
      description: r.itemName,
      serialNo: it?.serialNumber || undefined,
      uom: rd.uom || it?.uom || 'EA',
      quantity,
      unitPrice,
      bookValue: rd.bookValue ?? unitPrice * quantity,
    };
  };
  const lines = sameDisposalForm(approval, context.requests).map((r, i) => lineOf(r, i + 1));
  // The form is signed as a whole: its total original cost decides whether the Chief Director authorizes it, as the
  // approval goes (not the book value typed on the form)
  const formTotal = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 1), 0);
  const dateGc = approval.ifmisSlipDateGc || (approval.createdAtGc || '').split('T')[0];
  return {
    // Returned for correction is still waiting for approval
    approvalState: approval.status === 'PENDING' || approval.status === 'RETURNED' ? 'PENDING' : approval.status === 'REJECTED' ? 'REJECTED' : undefined,
    disposalNo: approval.ifmisSlipNumber || '',
    dateGc,
    dateEc: approval.ifmisSlipDateEc || (dateGc ? formatGcToEc(dateGc) : undefined),
    reason: d.reason || '—',
    description: d.description,
    condition: d.condition,
    recipientName: d.recipientName,
    proceedsETB: d.proceedsETB,
    committeeRef: d.committeeRef,
    items: lines,
    requestedByName: context.requestedByName || nameOf(approval.requestedById, approval.requestedBy),
    storekeeperName: d.storekeeperName,
    endorsedByName: nameOf(approval.endorsedById, approval.endorsedBy),
    approvedByName: approval.status === 'APPROVED' ? nameOf(approval.reviewedById, approval.reviewedBy) : undefined,
    printedBy: context.printedBy,
    signatories: [
      { label: 'Storekeeper', name: d.storekeeperName || context.requestedByName || nameOf(approval.requestedById, approval.requestedBy) },
      { label: 'FAMU Accountant' },
      { label: 'Recipient', name: d.recipientName },
      getEndorserSignatory(approval, { isEndorsed: approval.status === 'APPROVED' || approval.currentStage >= 2 }),
      getAuthorizerSignatory(approval, { isApproved: approval.status === 'APPROVED', totalAmount: formTotal }),
    ],
  };
};
