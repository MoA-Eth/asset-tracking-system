import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertCircle,
  RefreshCw,
  FileText,
  Upload,
  CheckCircle2,
  X,
  Car,
  Tag,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  ItemWithRelations,
  ItemCondition,
  Employee,
  Model21Voucher,
  Model21LineItem,
} from '../../types/asset-management';
import { Modal } from './Modal';
import { getSystemSettings } from '../../utils/system-settings';
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
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      const cost = item.unitCostETB || 0;
      setDepreciation(cost);
      setBookValue(0);
      setChassisNumber(item.serialNumber ? `CH-${item.serialNumber}` : '');
      if (item.category === 'VEHICLE') {
        setPlateNo('4-23794');
        setEngineNo('1HZ-0641864');
        setTireSerials('R240514711, R240504703, R240504594, R240504595, YY0219');
        setDefectRemark('The right side mirror is missing.\nBoth rear lights are broken.');
      } else {
        setPlateNo('');
        setEngineNo('');
        setTireSerials('');
        setDefectRemark(item.notes || '');
      }
    }
  }, [item]);

  if (!item) return null;

  const policy = getSystemSettings().historicalDataAttachmentPolicy;
  const isAttachmentReq = policy === 'REQUIRED';

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleReset = () => {
    setModel21No('0004386');
    setBook('MOA MC BOOK');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setCondition(ItemCondition.GOOD);
    setReturnReason('Official project assignment completed, returning to central store');
    setAttachmentFileName('');
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
      await api.registerReturn({
        itemId: item.id,
        ifmisSlipNumber: model21No.trim(),
        ifmisSlipDateGc: todayGc,
        ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
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

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-500';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Return Item to Central Store — Fixed Asset Internal Return (Model/21)"
      subtitle={`The Federal Democratic Republic of Ethiopia • Ministry of Agriculture • Asset ${item.itemCode}`}
      accentColor="amber"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {formError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Workflow Info Banner */}
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
          <RotateCcw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-amber-950 leading-relaxed text-[11px]">
            <strong>Model 21 Return Procedure:</strong> When returning an asset to the central store, custody is discharged from the current custodian and held as{' '}
            <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold font-mono">PENDING_RETURN</span> until approved by the Directorate Head.
            Upon sign-off, the asset transitions back to <span className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-bold font-mono">AVAILABLE</span> store inventory.
          </div>
        </div>

        {/* ── Section 1: Document Reference & Register Book ── */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-teal-700" />
            1. Document Reference & Register Book (Model 21)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Model/21 Number (Slip #) *
              </label>
              <input
                type="text"
                required
                value={model21No}
                onChange={(e) => setModel21No(e.target.value)}
                placeholder="e.g. 0004386"
                className={`${inputClass} font-mono font-bold text-amber-950`}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Book (Register Category) *
              </label>
              <input
                type="text"
                required
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="e.g. MOA MC BOOK / Fixed Asset Book"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Return Date (G.C.) *
              </label>
              <input
                type="date"
                required
                value={ifmisSlipDateGc}
                onChange={(e) => setIfmisSlipDateGc(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
        </div>

        {/* ── Section 2: From / To Custody (Returning Custodian → Store Custodian) ── */}
        <div className="p-4 rounded-xl bg-white border border-slate-300 space-y-3 shadow-2xs">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-teal-700" />
            2. From / To Custody (Returning Staff → Store Receiver)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* From: Returning Custodian */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 space-y-2">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block border-b pb-1">
                From: Returning Employee (Transferor)
              </span>
              <div>
                <span className="text-[10px] text-slate-500 block">From Employee Name</span>
                <span className="font-bold text-slate-900 block text-xs">
                  {item.currentCustodian?.fullNameEn || 'Current Staff Custodian'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">From Employee ID</span>
                <span className="font-mono font-semibold text-slate-800 block text-xs">
                  {item.currentCustodian?.payrollId || '110895'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">From Location</span>
                <span className="text-slate-800 font-medium block text-xs">
                  {item.storeLocation?.siteName || 'Head Office (MoA Central)'}
                </span>
              </div>
            </div>

            {/* To: Store Receiver */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 space-y-2">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block border-b pb-1">
                To: Central Store Receiver (Recipient)
              </span>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                  Receiving Store Custodian / FAMU Accountant *
                </label>
                <select
                  value={storeReceiverId}
                  onChange={(e) => setStoreReceiverId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Central Store Custodian (Default) --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullNameEn} ({emp.payrollId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Destination Store</span>
                <span className="font-semibold text-emerald-900 block text-xs">
                  Central Store Depot — Gurd Sholla
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Asset Details & Valuation ── */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-teal-700" />
            3. Returned Asset Details & Condition
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-white rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block">Tag Number</span>
              <span className="font-mono font-bold text-slate-900">{item.itemCode}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-[10px] text-slate-500 block">Description</span>
              <span className="font-bold text-slate-900 truncate block">{item.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Original Cost</span>
              <span className="font-mono font-bold text-slate-900">{formatETB(item.unitCostETB)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Physical Condition Upon Return *
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ItemCondition)}
                className={inputClass}
              >
                <option value={ItemCondition.GOOD}>Good / Fully Functional</option>
                <option value={ItemCondition.FAIR}>Fair / Minor Wear</option>
                <option value={ItemCondition.NEEDS_REPAIR}>Needs Technical Repair / Workshop Service</option>
                <option value={ItemCondition.DAMAGED}>Damaged / Defective</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Chassis / Serial Number</label>
              <input
                type="text"
                placeholder="e.g. JTEBB71JX07008920"
                value={chassisNumber}
                onChange={(e) => setChassisNumber(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Accumulated Depreciation (ETB)
              </label>
              <input
                type="number"
                step="0.01"
                value={depreciation}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setDepreciation(val);
                  setBookValue(Math.max(0, (item.unitCostETB || 0) - val));
                }}
                className={`${inputClass} font-mono text-right`}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Official Reason for Return *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Project survey field work completed, returning asset to central store"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* ── Section 4: Vehicle / Machinery Accessories & Defect Breakdown ── */}
        <div className="p-4 rounded-xl bg-white border border-slate-300 space-y-3 shadow-2xs">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-teal-700" />
            4. Accessories Checklist & Defect Inspection (Model 21 Photo Breakdown)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Plate Number</label>
              <input
                type="text"
                placeholder="e.g. 4-23794"
                value={plateNo}
                onChange={(e) => setPlateNo(e.target.value)}
                className={`${inputClass} font-mono font-bold`}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Engine Number</label>
              <input
                type="text"
                placeholder="e.g. 1HZ-0641864"
                value={engineNo}
                onChange={(e) => setEngineNo(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jack with Handle (Qty)</label>
              <input
                type="number"
                min="0"
                value={jackQty}
                onChange={(e) => setJackQty(parseInt(e.target.value) || 0)}
                className={`${inputClass} font-mono text-center`}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tire Wrench (Qty)</label>
              <input
                type="number"
                min="0"
                value={tireWrenchQty}
                onChange={(e) => setTireWrenchQty(parseInt(e.target.value) || 0)}
                className={`${inputClass} font-mono text-center`}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Key (Qty)</label>
              <input
                type="number"
                min="0"
                value={keyQty}
                onChange={(e) => setKeyQty(parseInt(e.target.value) || 0)}
                className={`${inputClass} font-mono text-center`}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tire Serials (comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. R240514711, R240504703, R240504594, R240504595, YY0219"
              value={tireSerials}
              onChange={(e) => setTireSerials(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Defects / Missing Parts Inspection Remark *
            </label>
            <textarea
              rows={2}
              value={defectRemark}
              onChange={(e) => setDefectRemark(e.target.value)}
              placeholder="e.g. The right side mirror is missing. Both rear lights are broken."
              className={inputClass}
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Attach Scanned Slip {isAttachmentReq ? '*' : <span className="text-slate-400 font-normal">(Optional)</span>}
            </label>
            <div className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-slate-300 bg-white">
              <Upload className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="text-[11px] text-slate-600 flex-1 truncate">
                {attachmentFileName || 'No file chosen (Optional)'}
              </span>
              <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[10px] font-semibold cursor-pointer">
                Browse
                <input type="file" onChange={handleSimulateUpload} className="hidden" accept="image/*,application/pdf" />
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset Form
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-slate-500" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Submit Model 21 Store Return
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
