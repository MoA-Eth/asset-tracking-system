import React, { useState, useEffect } from 'react';
import { FileText, Car, Tag, UserCheck } from 'lucide-react';
import { api } from '../../api/client';
import {
  ItemWithRelations,
  ItemCondition,
  Employee,
  Model21Voucher,
  Model21LineItem,
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
import { validateSlipFile, SLIP_ACCEPT_ATTR } from '../../utils/slip-upload';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatETB, formatGcToEc } from '../../utils/eth-date';

interface ReturnToStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithRelations | null;
  employees: Employee[];
  onSuccess: (voucher?: Model21Voucher) => void;
}

export const ReturnToStoreModal: React.FC<ReturnToStoreModalProps> = ({
  isOpen,
  onClose,
  item,
  employees,
  onSuccess,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Model 21 Fields
  const [model21No, setModel21No] = useState('0004386');
  const [book, setBook] = useState('MOA MC BOOK');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [condition, setCondition] = useState<ItemCondition>(ItemCondition.GOOD);
  const [returnReason, setReturnReason] = useState('Official project assignment completed, returning to central store');
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
      setBookValue(item.unitCostETB || 0);
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
  }, [item]);

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
    setModel21No('0004386');
    setBook('MOA MC BOOK');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setCondition(ItemCondition.GOOD);
    setReturnReason('Official project assignment completed, returning to central store');
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
    if (!returnReason.trim()) {
      setFormError('Please state the official return reason or defect summary.');
      return;
    }
    if (isAttachmentReq && !attachmentFileName) {
      setFormError('System Policy configured in Settings requires a scanned return slip attachment.');
      return;
    }

    setSubmitting(true);
    const registeredById = user?.id || employees[0]?.id || '';
    const fromCustodian = item.currentCustodian;
    const receiver = employees.find((e) => e.id === storeReceiverId) || employees[0];
    const loc = item.storeLocation?.siteName || 'MoA Gurd Sholla (Central Store)';
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

    try {
      const slipUrl = attachmentFile ? (await api.uploadSlip(attachmentFile)).url : undefined;

      await api.registerReturn({
        itemId: item.id,
        ifmisSlipNumber: model21No.trim(),
        ifmisSlipDateGc: todayGc,
        ifmisSlipAttachmentUrl: slipUrl,
        returnReason: returnReason.trim(),
        condition,
        returningEmployeeId: item.currentCustodianId || undefined,
        registeredById,
        model21No: model21No.trim(),
        book: book.trim(),
        chassisNumber: chassisNumber.trim() || undefined,
        plateNo: plateNo.trim() || undefined,
        engineNo: engineNo.trim() || undefined,
        accessories,
        tireNos: tireList,
        origCost: item.unitCostETB,
        depreciation,
        bookValue,
        defectRemark: defectRemark.trim() || undefined,
        storeRecipientId: storeReceiverId || undefined,
      });

      const voucher: Model21Voucher = {
        model21No: model21No.trim(),
        fromEmployeeName: fromCustodian?.fullNameEn || 'Assigned Staff Custodian',
        fromEmployeeId: fromCustodian?.payrollId || '110895',
        book: book.trim() || 'MOA MC BOOK',
        toEmployeeName: receiver?.fullNameEn || 'Central Store Custodian',
        toEmployeeId: receiver?.payrollId || '109856',
        items: [
          {
            sNo: 1,
            description: item.name,
            tagNumber: item.itemCode,
            serialNumber: item.serialNumber || '',
            chassisNumber: chassisNumber.trim() || undefined,
            uom: 'EA',
            unit: 1,
            origCost: item.unitCostETB || 0,
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
        reportTakenBy: user?.payrollId || 'lidlyats',
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

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('teal', opts);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Return to store · Model 21 · ${item.itemCode}`}
      subtitle="The item stays with its custodian until the Team Leader endorses and the Department Head approves the return."
      accentColor="teal"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />

        {/* ── Section 1: Return voucher ── */}
        <FormSection step={1} title="Return voucher" subtitle="የመመለሻ ሰነድ · Model 21 register" icon={FileText} accent="teal">
          <FieldGrid>
            <Field label="Model 21 No." required>
              <input
                type="text"
                required
                value={model21No}
                onChange={(e) => setModel21No(e.target.value)}
                placeholder="e.g. 0004386"
                className={`${input({ mono: true })} font-semibold`}
              />
            </Field>

            <Field label="Register book" required>
              <input
                type="text"
                required
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="e.g. MOA MC BOOK"
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
        <FormSection step={2} title="Asset & condition" subtitle="የንብረቱ ሁኔታ" icon={Tag} accent="teal">
          <div className="space-y-3.5">
            <SummaryGrid
              items={[
                { label: 'Tag number', value: item.itemCode, mono: true },
                { label: 'Description', value: item.name },
                { label: 'Current custodian', value: item.currentCustodian?.fullNameEn },
                { label: 'Original cost', value: formatETB(item.unitCostETB), mono: true },
              ]}
            />

            <FieldGrid>
              <Field label="Condition on return" required>
                <select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)} className={input()}>
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
                    setBookValue(Math.max(0, (item.unitCostETB || 0) - val));
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
                className={textareaClass('teal')}
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
          accent="teal"
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
                <ReadOnlyValue>{item.storeLocation?.siteName || 'Central store'}</ReadOnlyValue>
              </Field>

              <Field label="Received by (store custodian)" optional hint="Defaults to the central store custodian.">
                <select value={storeReceiverId} onChange={(e) => setStoreReceiverId(e.target.value)} className={input()}>
                  <option value="">Central store custodian (default)</option>
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
              accent="teal"
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
          accent="teal"
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
          accent="teal"
          submitting={submitting}
          submitLabel="Submit return for approval"
          onCancel={onClose}
          onReset={handleReset}
        />
      </form>
    </Modal>
  );
};
