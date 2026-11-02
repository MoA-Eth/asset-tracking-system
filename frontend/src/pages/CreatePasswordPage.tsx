import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MoaLogo } from '../components/ui/MoaLogo';
import { Lock, Eye, EyeOff, CheckCircle2, RefreshCw, AlertCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { ROLE_LABELS } from './settings/UserAccessModals';
import { UserRole } from '../types/asset-management';

export const CreatePasswordPage: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [verifyingError, setVerifyingError] = useState<string | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<{
    id?: string;
    fullNameEn?: string;
    email?: string | null;
    role?: UserRole | null;
  } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    setToken(t);

    if (!t) {
      setLoading(false);
      setVerifyingError('No invitation token found in link. Please use the link sent in your email.');
      return;
    }

    api.verifyInvitation(t)
      .then((res) => {
        setEmployeeInfo(res.employee);
        setVerifyingError(null);
      })
      .catch((err) => {
        setVerifyingError(err.message || 'This invitation link is invalid or has expired.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const hasMinLength = newPassword.length >= 8;
  const hasLetterAndNumber = /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasLetterAndNumber && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!isFormValid) {
      setSubmitError('Please ensure your password meets all requirements.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createPasswordWithToken(token, newPassword);
      // Clear any existing session from previous user/admin
      try {
        localStorage.removeItem('moa_token');
        localStorage.removeItem('moa_user');
      } catch {
        // ignore
      }
      setSubmitSuccess(true);
      setTimeout(() => {
        // Redirect cleanly to login screen
        window.location.href = '/';
      }, 1800);
    } catch (err: any) {
      setSubmitError(err.message || 'Could not set password. Please try again or request a new invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const toLogin = () => {
    window.location.href = '/';
  };

  return (
    <div
      className="min-h-screen w-full overflow-y-auto flex flex-col items-center justify-center p-4 selection:bg-amber-400 selection:text-emerald-950 font-sans"
      style={{
        background: 'linear-gradient(168deg, #0B6B3A 0%, #086034 50%, #06542D 100%)',
      }}
    >
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-white/20">
        <div className="flex flex-col items-center text-center">
          <MoaLogo className="w-16 h-16" />
          <h1 className="mt-4 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Account Activation
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Ministry of Agriculture · Fixed Asset Tracking System
          </p>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Verifying invitation link…</p>
          </div>
        ) : verifyingError ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Invitation Expired or Invalid</p>
                <p className="mt-0.5 leading-relaxed">{verifyingError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toLogin}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        ) : submitSuccess ? (
          <div className="mt-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Password Created!</h2>
              <p className="mt-1 text-xs text-slate-600">
                Your account is now activated. Redirecting you to sign in…
              </p>
            </div>
            <button
              type="button"
              onClick={toLogin}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
            >
              Proceed to Sign In <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {employeeInfo && (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-xs">
                <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Invited User</p>
                <p className="mt-0.5 font-bold text-slate-900 text-sm">{employeeInfo.fullNameEn}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                    {employeeInfo.role ? (ROLE_LABELS[employeeInfo.role] || employeeInfo.role) : 'User'}
                  </span>
                  {employeeInfo.email && (
                    <span className="text-[11px] text-slate-600">{employeeInfo.email}</span>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="create-new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="create-new-password"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter secure password"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-10 text-xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="create-confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm Password
              </label>
              <input
                id="create-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* Password requirements */}
            <div className="space-y-1.5 rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-[11px]">
              <p className="font-semibold text-slate-600 mb-1">Requirements:</p>
              <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className={`h-3.5 w-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-slate-300'}`} />
                <span>At least 8 characters long</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasLetterAndNumber ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className={`h-3.5 w-3.5 ${hasLetterAndNumber ? 'text-emerald-600' : 'text-slate-300'}`} />
                <span>At least one letter and one number</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className={`h-3.5 w-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-300'}`} />
                <span>Passwords match</span>
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Activate Account & Set Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
