import React, { useState } from 'react';
import { RotateCcw, AlertCircle, RefreshCw, FileText, Upload, CheckCircle2, X } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations, ItemCondition, Employee } from '../../types/asset-management';
import { Modal } from './Modal';
import { getSystemSettings } from '../../utils/system-settings';
import { useToast } from '../../context/ToastContext';

interface ReturnToStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithRelations | null;
  employees: Employee[];
  onSuccess: () => void;
}

export const ReturnToStoreModal: React.FC<ReturnToStoreModalProps> = ({
  isOpen,
  onClose,
  item,
  employees,
  onSuccess,
}) => {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState('');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [condition, setCondition] = useState<ItemCondition>(ItemCondition.GOOD);
  const [returnReason, setReturnReason] = useState('');
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!item) return null;

  const policy = getSystemSettings().historicalDataAttachmentPolicy;
  const isAttachmentReq = policy === 'REQUIRED';

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleReset = () => {
    setIfmisSlipNumber('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setCondition(ItemCondition.GOOD);
    setReturnReason('');
    setAttachmentFileName('');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!ifmisSlipNumber.trim()) {
      setFormError('IFMIS Return Voucher (Model 22) Slip Number is mandatory.');
      return;
    }
    if (!returnReason.trim()) {
      setFormError('Please state the official return reason or defect summary.');
      return;
    }
    if (isAttachmentReq && !attachmentFileName) {
      setFormError('System Policy configured in Settings requires a scanned Model 22 return slip attachment.');
      return;
    }

    setSubmitting(true);
    const encoder = employees.find((emp) => emp.role === 'DATA_ENCODER') || employees[0];

    try {
      await api.registerReturn({
        itemId: item.id,
        ifmisSlipNumber: ifmisSlipNumber.trim(),
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
        returnReason: returnReason.trim(),
        condition,
        returningEmployeeId: item.currentCustodianId || undefined,
        registeredById: encoder ? encoder.id : employees[0]?.id || '',
      });
      toast.success(
        'Model 22 Return Submitted',
        `Return request for ${item.itemCode} (${ifmisSlipNumber.trim()}) submitted for Team Leader verification.`
      );
      handleReset();
      onSuccess();
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
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Return Item to Central Store (የዕቃ መመለሻ — ሞዴል 22)"
      subtitle={`Process Model 22 Return for asset ${item.itemCode}`}
      accentColor="amber"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Workflow Banner */}
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-start gap-2">
          <RotateCcw className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
          <p className="text-purple-900 leading-relaxed">
            <strong>Model 22 Rule:</strong> Returned items stay{' '}
            <span className="bg-amber-100 text-amber-800 px-1 rounded font-bold font-mono">PENDING</span> until Department Head approves.
            If condition is marked as <span className="bg-purple-100 text-purple-800 px-1 rounded font-bold font-mono">NEEDS REPAIR</span>, item will be sent to technical maintenance.
          </p>
        </div>

        {/* Item Target Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <span className="text-slate-500 block text-[10px]">Item Code / Tag</span>
            <span className="font-mono font-bold text-slate-900">{item.itemCode}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500 block text-[10px]">Item Description</span>
            <span className="font-bold text-slate-900">{item.name}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Serial Number</span>
            <span className="font-mono text-slate-800">{item.serialNumber || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Current Custodian</span>
            <span className="font-semibold text-slate-800">
              {item.currentCustodian?.fullNameEn || 'Assigned Staff'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Original Issue Slip</span>
            <span className="font-mono font-bold text-emerald-700">{item.ifmisSlipNumber}</span>
          </div>
        </div>

        {/* Section 1 — Model 22 Details */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            1. Model 22 Store Return Reference & Condition Assessment
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Model 22 Return Slip No. *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. M22-IFMIS-RET-2024-0012"
                value={ifmisSlipNumber}
                onChange={(e) => setIfmisSlipNumber(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Return Slip Date *</label>
              <input
                type="date"
                required
                value={ifmisSlipDateGc}
                onChange={(e) => setIfmisSlipDateGc(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Physical Condition Upon Return *</label>
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
              <label className="block font-semibold text-slate-700 mb-1">
                Attach Scanned Slip {isAttachmentReq ? '*' : <span className="text-slate-400 font-normal">(Optional)</span>}
              </label>
              <div className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-slate-300 bg-white">
                <Upload className="w-4 h-4 text-purple-700 shrink-0" />
                <span className="text-[11px] text-slate-600 flex-1 truncate">
                  {attachmentFileName || 'No file chosen'}
                </span>
                <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[10px] font-semibold cursor-pointer">
                  Browse
                  <input type="file" onChange={handleSimulateUpload} className="hidden" accept="image/*,application/pdf" />
                </label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Official Reason for Return *</label>
              <input
                type="text"
                required
                placeholder="e.g. Project survey field work completed, returning laptop to central store"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className={inputClass}
              />
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
            Reset
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
              className="px-5 py-2 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Submit Model 22 Return for Approval
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
