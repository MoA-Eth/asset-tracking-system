import React, { useState, useEffect } from 'react';
import { FileText, Car, Tag, UserCheck } from 'lucide-react';
import { api } from '../../api/client';
import { storeLocationLabel } from '../../utils/location';
import {
  ItemWithRelations,
  ItemCondition,
  Employee,
  Model21Voucher,
  Model21LineItem,
  TransactionApproval,
} from '../../types/asset-management';
import { Modal } from './Modal';
import {
  FormSection,
  FieldGrid,
  Field,
  ReadOnlyValue,
  SummaryGrid,
  FormError,
  FileDropField,
  FormFooter,
  inputClass,
  textareaClass,
} from './FormKit';
import { getSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatETB, formatGcToEc } from '../../utils/eth-date';

interface ReturnToStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithRelations | null;
  employees: Employee[];
  onSuccess: (voucher?: Model21Voucher) => void;
  /** When set, the modal corrects this pending return instead of creating a new one */
  editApproval?: TransactionApproval;
}

export const ReturnToStoreModal: React.FC<ReturnToStoreModalProps> = ({
  isOpen,
  onClose,
  item,
  employees,
  onSuccess,
  editApproval,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Model 21 Fields
  const [model21No, setModel21No] = useState('');
  const [book, setBook] = useState('');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [condition, setCondition] = useState<ItemCondition | ''>('');
  const [returnReason, setReturnReason] = useState('');
  const [storeReceiverId, setStoreReceiverId] = useState('');
  
  // Technical / Vehicle Details
  const [chassisNumber, setChassisNumber] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [engineNo, setEngineNo] = useState('');
  const [depreciation, setDepreciation] = useState<number>(0);
  const [bookValue, setBookValue] = useState<number>(0);
  const [jackQty, setJackQty] = useState(1);
  const [tireWrenchQty, setTireWrenchQty] = useState(1);
  const [keyQty, setKeyQty] = useState(2);
  const [tireSerials, setTireSerials] = useState('');
  const [defectRemark, setDefectRemark] = useState('');

  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isVehicleLike = item?.category === 'VEHICLE' || item?.category === 'AGRI_MACHINERY';

  // Start every return from the item's own data; nothing is pre-filled with sample values
  useEffect(() => {
    if (item) {
      setDepreciation(0);
      setBookValue((item.unitCostETB || 0) * (Number(item.quantity) || 1));
      setChassisNumber(item.serialNumber || '');
      setPlateNo('');
      setEngineNo('');
      setTireSerials('');
      setDefectRemark('');
      const vehicle = item.category === 'VEHICLE' || item.category === 'AGRI_MACHINERY';
      setJackQty(vehicle ? 1 : 0);
      setTireWrenchQty(vehicle ? 1 : 0);
      setKeyQty(vehicle ? 2 : 0);
    }
    if (item && editApproval) {
      const d = editApproval.requestDetails ?? {};
      setModel21No(editApproval.ifmisSlipNumber || '');
      setBook(d.book ?? '');
      setIfmisSlipDateGc(editApproval.ifmisSlipDateGc || new Date().toISOString().split('T')[0]);
      setCondition((d.condition as ItemCondition) ?? '');
      setReturnReason(d.reason ?? '');
      setDefectRemark(d.remark ?? '');
      setStoreReceiverId(d.storeRecipientId ?? '');
      if (d.chassisNumber !== undefined) setChassisNumber(d.chassisNumber);
      setPlateNo(d.plateNo ?? '');
      setEngineNo(d.engineNo ?? '');
      if (d.depreciation !== undefined) setDepreciation(d.depreciation);
      if (d.bookValue !== undefined) setBookValue(d.bookValue);
      if (d.accessories) {
        const qty = (name: string) => d.accessories?.find((a) => a.name === name)?.quantity ?? 0;
        setJackQty(qty('jack with handle'));
        setTireWrenchQty(qty('tire wrench'));
        setKeyQty(qty('key'));
      }
      setTireSerials(d.tireNos?.join(', ') ?? '');
      setAttachmentFile(null);
      setAttachmentFileName(editApproval.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : '');
      setFormError(null);
    }
  }, [item, editApproval]);

  if (!item) return null;

  const policy = getSystemSettings().historicalDataAttachmentPolicy;
  const isAttachmentReq = policy === 'REQUIRED';

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
    setModel21No('');
    setBook('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setCondition('');
    setReturnReason('');
    setAttachmentFileName('');
    setAttachmentFile(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!model21No.trim()) {
      setFormError('Return Voucher (Model 21) Slip Number is mandatory.');
      return;
    }
    if (!condition) {
      setFormError('Please select the condition on return.');
      return;
    }
    if (!returnReason.trim()) {
      setFormError('Please state the official return reason or defect summary.');
      return;
    }
    if (isAttachmentReq && !attachmentFileName) {
      setFormError('System Policy configured in Settings requires a scanned return slip attachment.');
      return;
    }

    setSubmitting(true);
    const registeredById = user?.id || '';
    const fromCustodian = item.currentCustodian;
    const receiver = employees.find((e) => e.id === storeReceiverId);
    const loc = storeLocationLabel(item.storeLocation);
    const todayGc = ifmisSlipDateGc || new Date().toISOString().split('T')[0];
    const todayEc = formatGcToEc(todayGc);

    const accessories = [
      { name: 'jack with handle', quantity: jackQty },
      { name: 'tire wrench', quantity: tireWrenchQty },
      { name: 'key', quantity: keyQty },
    ].filter((a) => a.quantity > 0);

    const tireList = tireSerials
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (editApproval) {
      try {
        const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;
        await api.updateReturn(editApproval.id, {
          model21No: model21No.trim(),
          ifmisSlipDateGc: todayGc,
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
          storeRecipientId: storeReceiverId || undefined,
        });
        toast.success('Return Updated', `The return of ${item.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess();
        onClose();
      } catch (err: any) {
        const errMsg = err.message || 'Server error';
        setFormError(`Update failed: ${errMsg}`);
        toast.error('Return Update Failed', errMsg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      await api.registerReturn({
        itemId: item.id,
        ifmisSlipNumber: model21No.trim(),
        ifmisSlipDateGc: todayGc,
        ifmisSlipAttachmentUrl: slipUrl,
        returnReason: returnReason.trim(),
        condition: condition as ItemCondition,
        returningEmployeeId: item.currentCustodianId || undefined,
        registeredById,
        model21No: model21No.trim(),
        book: book.trim(),
        chassisNumber: chassisNumber.trim() || undefined,
        plateNo: plateNo.trim() || undefined,
        engineNo: engineNo.trim() || undefined,
        accessories,
        tireNos: tireList,
        origCost: (item.unitCostETB || 0) * (Number(item.quantity) || 1),
        depreciation,
        bookValue,
        defectRemark: defectRemark.trim() || undefined,
        storeRecipientId: storeReceiverId || undefined,
      });

      const voucher: Model21Voucher = {
        model21No: model21No.trim(),
        fromEmployeeName: fromCustodian?.fullNameEn || '—',
        fromEmployeeId: fromCustodian?.payrollId || '—',
        book: book.trim() || '—',
        toEmployeeName: receiver?.fullNameEn || '—',
        toEmployeeId: receiver?.payrollId || '—',
        items: [
          {
            sNo: 1,
            description: item.name,
            tagNumber: item.itemCode,
            serialNumber: item.serialNumber || '',
            chassisNumber: chassisNumber.trim() || undefined,
            uom: item.uom || 'EA',
            unit: Number(item.quantity) || 1,
            origCost: (item.unitCostETB || 0) * (Number(item.quantity) || 1),
            depreciation,
            bookValue,
            dateGc: todayGc,
            dateEc: todayEc,
            fromLocation: loc,
            toLocation: loc,
            plateNo: plateNo.trim() || undefined,
            engineNo: engineNo.trim() || undefined,
            accessories: accessories.length > 0 ? accessories : undefined,
            tireNos: tireList.length > 0 ? tireList : undefined,
            remark: defectRemark.trim() || returnReason.trim(),
          },
        ],
        famuAccountantName: 'FAMU Reviewer',
        reportTakenBy: user?.payrollId || '—',
        reportTakenDate: `${todayGc} @ ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`,
      };

      toast.success(
        'Model 21 Store Return Submitted',
        `Return request for ${item.itemCode} (${model21No.trim()}) registered for Department Head approval.`
      );
      handleReset();
      onSuccess(voucher);
      onClose();
    } catch (err: any) {
      const errMsg = err.message || 'Server error';
      setFormError(`Return registration failed: ${errMsg}`);
      toast.error('Return Request Failed', errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editApproval ? `Edit return · ${item.itemCode}` : `Return to store · Model 21 · ${item.itemCode}`}
      subtitle={
        editApproval
          ? 'You can correct this return until the Team Leader endorses it. Each change is recorded in the item history.'
          : 'The item stays with its custodian until the Team Leader endorses and the Department Head approves the return.'
      }
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />

        {/* ── Section 1: Return voucher ── */}
        <FormSection step={1} title="Return voucher" subtitle="የመመለሻ ሰነድ · Model 21 register" icon={FileText} accent="emerald">
          <FieldGrid>
            <Field label="Model 21 No." required>
              <input
                type="text"
                required
                value={model21No}
                onChange={(e) => setModel21No(e.target.value)}
                placeholder="Number on the Model 21 form"
                className={`${input({ mono: true })} font-semibold`}
              />
            </Field>

            <Field label="Register book" required>
              <input
                type="text"
                required
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="Book the form comes from"
                className={input()}
              />
            </Field>

            <Field label="Return date (G.C.)" required hint={`${formatGcToEc(ifmisSlipDateGc)} E.C.`}>
              <input
                type="date"
                required
                value={ifmisSlipDateGc}
                onChange={(e) => setIfmisSlipDateGc(e.target.value)}
                className={input()}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        {/* ── Section 2: Asset & condition ── */}
        <FormSection step={2} title="Asset & condition" subtitle="የንብረቱ ሁኔታ" icon={Tag} accent="emerald">
          <div className="space-y-3.5">
            <SummaryGrid
              items={[
                { label: 'Tag number', value: item.itemCode, mono: true },
                { label: 'Description', value: item.name },
                { label: 'Current custodian', value: item.currentCustodian?.fullNameEn },
                {
                  label: `Original cost (${item.quantity || 1} ${item.uom || 'EA'})`,
                  value: formatETB((item.unitCostETB || 0) * (Number(item.quantity) || 1)),
                  mono: true,
                },
              ]}
            />

            <FieldGrid>
              <Field label="Condition on return" required>
                <select required value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} className={input()}>
                  <option value="" disabled>Select…</option>
                  <option value={ItemCondition.GOOD}>Good · fully functional</option>
                  <option value={ItemCondition.FAIR}>Fair · minor wear</option>
                  <option value={ItemCondition.NEEDS_REPAIR}>Needs repair</option>
                  <option value={ItemCondition.DAMAGED}>Damaged / defective</option>
                </select>
              </Field>

              <Field label="Chassis / serial number" optional>
                <input
                  type="text"
                  placeholder="e.g. JTEBB71JX07008920"
                  value={chassisNumber}
                  onChange={(e) => setChassisNumber(e.target.value)}
                  className={input({ mono: true })}
                />
              </Field>

              <Field
                label="Accumulated depreciation (ETB)"
                optional
                hint={`Net book value: ${formatETB(bookValue)}`}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depreciation}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setDepreciation(val);
                    setBookValue(Math.max(0, (item.unitCostETB || 0) * (Number(item.quantity) || 1) - val));
                  }}
                  className={input({ mono: true, align: 'right' })}
                />
              </Field>
            </FieldGrid>

            <Field label="Reason for return" required>
              <input
                type="text"
                required
                placeholder="e.g. Project field work completed, returning asset to store"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className={input()}
              />
            </Field>

            <Field label="Defects / missing parts" optional>
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

        {/* ── Section 3: Custody handover ── */}
        <FormSection
          step={3}
          title="Custody handover"
          subtitle="ርክክብ"
          icon={UserCheck}
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
            <FieldGrid>
              <Field label="Returned by">
                <ReadOnlyValue>
                  {item.currentCustodian
                    ? `${item.currentCustodian.fullNameEn} (${item.currentCustodian.payrollId})`
                    : 'No custodian on record'}
                </ReadOnlyValue>
              </Field>

              <Field label="Returns to store">
                <ReadOnlyValue>{storeLocationLabel(item.storeLocation)}</ReadOnlyValue>
              </Field>

              <Field label="Received by (store custodian)" optional hint="The store staff member taking the item back, if known.">
                <select value={storeReceiverId} onChange={(e) => setStoreReceiverId(e.target.value)} className={input()}>
                  <option value="">Select…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullNameEn} ({emp.payrollId})
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGrid>

            <FileDropField
              label="Scanned return slip"
              accent="emerald"
              required={isAttachmentReq}
              fileName={attachmentFileName}
              accept={SLIP_ACCEPT_ATTR}
              onChange={handleSlipSelected}
            />
          </div>
        </FormSection>

        {/* ── Section 4: Vehicle & machinery details (optional) ── */}
        <FormSection
          step={4}
          title="Vehicle & machinery details"
          subtitle="Plate, engine, accessories and tires · only for vehicles and machinery"
          icon={Car}
          accent="emerald"
          collapsible
          defaultOpen={isVehicleLike}
        >
          <div className="space-y-3.5">
            <FieldGrid cols={2}>
              <Field label="Plate number" optional>
                <input
                  type="text"
                  placeholder="e.g. 4-23794"
                  value={plateNo}
                  onChange={(e) => setPlateNo(e.target.value)}
                  className={input({ mono: true })}
                />
              </Field>

              <Field label="Engine number" optional>
                <input
                  type="text"
                  placeholder="e.g. 1HZ-0641864"
                  value={engineNo}
                  onChange={(e) => setEngineNo(e.target.value)}
                  className={input({ mono: true })}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Jack with handle (qty)">
                <input
                  type="number"
                  min="0"
                  value={jackQty}
                  onChange={(e) => setJackQty(parseInt(e.target.value) || 0)}
                  className={input({ mono: true, align: 'right' })}
                />
              </Field>

              <Field label="Tire wrench (qty)">
                <input
                  type="number"
                  min="0"
                  value={tireWrenchQty}
                  onChange={(e) => setTireWrenchQty(parseInt(e.target.value) || 0)}
                  className={input({ mono: true, align: 'right' })}
                />
              </Field>

              <Field label="Keys (qty)">
                <input
                  type="number"
                  min="0"
                  value={keyQty}
                  onChange={(e) => setKeyQty(parseInt(e.target.value) || 0)}
                  className={input({ mono: true, align: 'right' })}
                />
              </Field>
            </FieldGrid>

            <Field label="Tire serial numbers" optional hint="Separate with commas">
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
          submitLabel={editApproval ? 'Save changes' : 'Submit return for approval'}
          onCancel={onClose}
          onReset={editApproval ? undefined : handleReset}
        />
      </form>
    </Modal>
  );
};
