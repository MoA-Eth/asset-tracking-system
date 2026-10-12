import React, { useEffect, useState } from 'react';
import { Sliders, FileText, FileCheck, Lock, UserCheck } from 'lucide-react';
import { loadSystemSettings, saveSystemSettings, useSystemSettings, AttachmentPolicy } from '../utils/system-settings';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const POLICY_TEXT: Record<AttachmentPolicy, string> = {
  REQUIRED: 'A scanned slip must now be attached to every receipt, issue and return.',
  OPTIONAL: 'Attaching a scanned slip is now optional.',
};

const STORE_MAN_TEXT: Record<AttachmentPolicy, string> = {
  REQUIRED: 'A store with no store man now refuses receipts, issues, disposals and returns.',
  OPTIONAL: 'A store with no store man carries on without naming one.',
};

export const SystemSettingsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const { slipAttachmentPolicy, storeManPolicy } = useSystemSettings();
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

  const handleStoreManChange = async (policy: AttachmentPolicy) => {
    if (!canEdit || saving || policy === storeManPolicy) return;
    setSaving(true);
    try {
      await saveSystemSettings({ storeManPolicy: policy });
      toast.success('Setting saved', STORE_MAN_TEXT[policy]);
    } catch (err: any) {
      toast.error("Couldn't save the setting", err?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const storeManOption = (policy: AttachmentPolicy, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => handleStoreManChange(policy)}
      disabled={!canEdit || saving}
      aria-pressed={storeManPolicy === policy}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
        storeManPolicy === policy ? `${activeClass} text-white shadow-xs` : 'text-slate-600 enabled:hover:text-slate-900 enabled:hover:bg-slate-100'
      } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-80`}
    >
      {label}
    </button>
  );

  const option = (policy: AttachmentPolicy, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => handlePolicyChange(policy)}
      disabled={!canEdit || saving}
      aria-pressed={slipAttachmentPolicy === policy}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
        slipAttachmentPolicy === policy ? `${activeClass} text-white shadow-xs` : 'text-slate-600 enabled:hover:text-slate-900 enabled:hover:bg-slate-100'
      } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-80`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* Page Header */}
      <div className="border-b border-slate-200 pb-3.5">
        <p className="text-xs text-slate-500">Rules that apply to every user and every store across the platform.</p>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-700" />
            Scanned slip (የተቃኘ ሰነድ)
          </h3>
          {!canEdit && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              <Lock className="w-3 h-3" /> View only
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-xs font-bold text-slate-900">Scanned slip on receipts, issues and returns</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              When required, a request can't be submitted without a scanned copy of its Model 19, 22 or 21 slip.
              {!canEdit && ' Only the System Administrator can change this.'}
            </p>
          </div>

          <div role="group" aria-label="Scanned slip rule" className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-300">
            {option('OPTIONAL', 'Optional (ተመራጭ)', 'bg-emerald-800')}
            {option('REQUIRED', 'Required (ግዴታ)', 'bg-amber-700')}
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-700" />
            Store man
          </h3>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1 max-w-2xl">
            <p className="text-xs font-bold text-slate-900">A store man on receipts, issues, disposals and returns</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              A store that has store men always names one on its vouchers. This decides what a store with none does:
              <strong> Optional</strong> lets it carry on, <strong>Required</strong> refuses the request until a store man is assigned
              in Settings → Stores. Switch it to Required once every store has one.
              {!canEdit && ' Only the System Administrator can change this.'}
            </p>
          </div>

          <div role="group" aria-label="Store man rule" className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-300">
            {storeManOption('OPTIONAL', 'Optional', 'bg-emerald-800')}
            {storeManOption('REQUIRED', 'Required', 'bg-amber-700')}
          </div>
        </div>
      </div>
    </div>
  );
};
