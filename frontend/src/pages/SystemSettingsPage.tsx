import React, { useState } from 'react';
import { Sliders, CheckCircle2, FileText, FileCheck } from 'lucide-react';
import { getSystemSettings, saveSystemSettings, AttachmentPolicy } from '../utils/system-settings';
import { useToast } from '../context/ToastContext';

export const SystemSettingsPage: React.FC = () => {
  const toast = useToast();
  const [attachmentPolicy, setAttachmentPolicy] = useState<AttachmentPolicy>(
    getSystemSettings().historicalDataAttachmentPolicy
  );
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handlePolicyChange = (policy: AttachmentPolicy) => {
    setAttachmentPolicy(policy);
    saveSystemSettings({ historicalDataAttachmentPolicy: policy });
    const isReq = policy === 'REQUIRED';
    const policyDesc = isReq
      ? 'Scanned IFMIS slip attachment is now MANDATORY for historical legacy stock-in data.'
      : 'Scanned IFMIS slip attachment is now OPTIONAL for historical legacy stock-in data.';
    setSuccessMsg(`Policy updated: ${policyDesc}`);
    toast.info('Store Policy Updated', policyDesc);
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* Page Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-700" />
          System Settings (የስርዓት ቅንብሮች)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure store data policies that apply across all registration workflows.
        </p>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Historical Legacy Data Attachment Policy */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-700" />
            Historical Legacy Data Attachment Policy (የቀድሞ መረጃዎች ፋይል መስፈርት)
          </h3>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
            Store Registration Rule
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-xs font-bold text-slate-900">
                IFMIS Scanned Slip Attachment for Historical Stock-In
              </p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Define whether Store Custodians must upload a scanned IFMIS delivery slip when checking the{' '}
              <strong className="text-slate-800">"Historical Legacy Data"</strong> checkbox during Stock-In registration.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-300">
            <button
              onClick={() => handlePolicyChange('OPTIONAL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                attachmentPolicy === 'OPTIONAL'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Optional (ተመራጭ)
            </button>
            <button
              onClick={() => handlePolicyChange('REQUIRED')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                attachmentPolicy === 'REQUIRED'
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Mandatory / Required (ግዴታ)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
