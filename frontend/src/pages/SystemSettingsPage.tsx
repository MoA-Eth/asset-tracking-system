import React, { useEffect, useState } from 'react';
import { FileText, FileCheck, Lock, SlidersHorizontal } from 'lucide-react';
import { loadSystemSettings, saveSystemSettings, useSystemSettings, AttachmentPolicy } from '../utils/system-settings';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const POLICY_TEXT: Record<AttachmentPolicy, string> = {
  REQUIRED: 'A slip must now be attached to every receipt, issue, transfer and disposal.',
  OPTIONAL: 'Attaching a slip is now optional.',
};

export const SystemSettingsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const { slipAttachmentPolicy, showScannedSlipField } = useSystemSettings();
  const [saving, setSaving] = useState(false);
  // The rule applies to everyone, so only the System Administrator changes it
  const canEdit = user?.permissions?.includes('references.manage') ?? false;

  useEffect(() => {
    loadSystemSettings().catch((err) => toast.error("Couldn't load the settings", err?.message || 'Try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePolicyChange = async (policy: AttachmentPolicy) => {
    if (!canEdit || saving || policy === slipAttachmentPolicy) return;
    setSaving(true);
    try {
      await saveSystemSettings({ slipAttachmentPolicy: policy });
      toast.success('Setting saved', POLICY_TEXT[policy]);
    } catch (err: any) {
      toast.error("Couldn't save the setting", err?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleScannedFieldChange = async (showField: boolean) => {
    if (!canEdit || saving || showField === showScannedSlipField) return;
    setSaving(true);
    try {
      await saveSystemSettings({ showScannedSlipField: showField });
      toast.success(
        'Setting saved',
        showField
          ? 'Scanned slip field is now enabled: forms will display a separate scanned copy uploader.'
          : 'Scanned slip field is now turned off: all forms will use a single file uploader for PDF.'
      );
    } catch (err: any) {
      toast.error("Couldn't save the setting", err?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const policyOption = (policy: AttachmentPolicy, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => handlePolicyChange(policy)}
      disabled={!canEdit || saving}
      aria-pressed={slipAttachmentPolicy === policy}
      className={`px-3.5 py-1.5 rounded-[4px] text-xs font-bold transition ${
        slipAttachmentPolicy === policy ? `${activeClass} text-white shadow-xs` : 'text-slate-600 enabled:hover:text-slate-900 enabled:hover:bg-slate-100'
      } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-80`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 animate-fadeIn pb-16">
      <div className="rounded-md p-4 bg-white space-y-4 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-700" />
            Slip & Attachment Settings (የሰነድ እና አባሪ ቅንብሮች)
          </h3>
          {!canEdit && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              <Lock className="w-3 h-3" /> View only
            </span>
          )}
        </div>

        {/* 1. Scanned Slip Field Toggle (Single Uploader vs Separate Field) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-md border border-slate-200">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-xs font-bold text-slate-900">Scanned slip field in forms (የተቃኘ ሰነድ መስክ)</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              When <strong>Off</strong>, all asset forms use <strong>only one file uploader</strong> for the IFMIS PDF to both autofill the form and attach the slip. When <strong>On</strong>, a separate scanned copy field is displayed for paper scans.
              {!canEdit && ' Only System Administrators can change this.'}
            </p>
          </div>

          <div role="group" aria-label="Scanned slip field setting" className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-md border border-slate-300">
            <button
              type="button"
              onClick={() => handleScannedFieldChange(false)}
              disabled={!canEdit || saving}
              aria-pressed={!showScannedSlipField}
              className={`px-3.5 py-1.5 rounded-[4px] text-xs font-bold transition ${
                !showScannedSlipField ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 enabled:hover:text-slate-900 enabled:hover:bg-slate-100'
              } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-80`}
            >
              Off (Single Uploader)
            </button>
            <button
              type="button"
              onClick={() => handleScannedFieldChange(true)}
              disabled={!canEdit || saving}
              aria-pressed={showScannedSlipField}
              className={`px-3.5 py-1.5 rounded-[4px] text-xs font-bold transition ${
                showScannedSlipField ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 enabled:hover:text-slate-900 enabled:hover:bg-slate-100'
              } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-80`}
            >
              On (Separate Field)
            </button>
          </div>
        </div>

        {/* 2. Slip Attachment Requirement Policy */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-md border border-slate-200">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-xs font-bold text-slate-900">Slip attachment policy (የሰነድ አባሪ ግዴታ)</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              When required, a request can't be submitted without its slip attached.
              {!canEdit && ' Only System Administrators can change this.'}
            </p>
          </div>

          <div role="group" aria-label="Scanned slip rule" className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-md border border-slate-300">
            {policyOption('OPTIONAL', 'Optional (ተመራጭ)', 'bg-emerald-800')}
            {policyOption('REQUIRED', 'Required (ግዴታ)', 'bg-amber-700')}
          </div>
        </div>
      </div>
    </div>
  );
};
