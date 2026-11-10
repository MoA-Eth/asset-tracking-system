import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MoaLogo } from '../components/ui/MoaLogo';
import { Lock, Eye, EyeOff, CheckCircle2, RefreshCw, AlertCircle, ArrowRight, Check } from 'lucide-react';
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
    <main className="auth-shell">
      <section
        className="auth-card auth-card-flow"
        aria-labelledby="create-password-title"
      >
        <div className="flex justify-center">
          <MoaLogo size="md" />
        </div>

        <div className="mt-3 text-center">
          <h1
            id="create-password-title"
            className="auth-flow-title font-semibold tracking-tight text-[#00843D]"
          >
            Account Activation
          </h1>
          <p className="auth-flow-subtitle font-medium text-[#58709a]">
            Ministry of Agriculture · Fixed Asset Tracking System
          </p>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-7 w-7 text-[#00843D] animate-spin" />
            <p className="text-sm text-[#58709a] font-medium">Verifying invitation link…</p>
          </div>
        ) : verifyingError ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Invitation Expired or Invalid</p>
                <p className="mt-0.5 leading-relaxed">{verifyingError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toLogin}
              className="auth-primary-button"
            >
              Back to Sign In
            </button>
          </div>
        ) : submitSuccess ? (
          <div className="mt-6 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Password Created!</h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600">
                Your account is now activated. Redirecting you to sign in…
              </p>
            </div>
            <button
              type="button"
              onClick={toLogin}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#00843D] hover:underline cursor-pointer"
            >
              <span>Proceed to Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-flow-form space-y-4">
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

            <div className="auth-password-policy rounded-xl bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-900 border border-emerald-100">
              <p className="font-semibold text-emerald-950">Password Requirements:</p>
              <ul className="mt-2 space-y-1">
                <li className="flex items-center gap-2">
                  <Check size={16} className={`shrink-0 ${hasMinLength ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span className={hasMinLength ? 'text-emerald-900 font-medium' : 'text-slate-600'}>
                    At least 8 characters
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className={`shrink-0 ${hasLetterAndNumber ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span className={hasLetterAndNumber ? 'text-emerald-900 font-medium' : 'text-slate-600'}>
                    At least one letter and one number
                  </span>
                </li>
              </ul>
            </div>

            {submitError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs sm:text-sm font-medium text-rose-700"
              >
                {submitError}
              </div>
            )}

            <div>
              <label htmlFor="create-new-pw" className="auth-label">
                New Password
              </label>
              <div className="auth-input-wrap">
                <Lock aria-hidden="true" className="auth-input-icon" />
                <input
                  id="create-new-pw"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoFocus
                  className="auth-input auth-input-with-trailing-action"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((prev) => !prev)}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#8da3c4] hover:text-[#00843D] cursor-pointer"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="create-confirm-pw" className="auth-label">
                Confirm Password
              </label>
              <div className="auth-input-wrap">
                <Lock aria-hidden="true" className="auth-input-icon" />
                <input
                  id="create-confirm-pw"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="auth-input"
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1.5 text-xs text-rose-600">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="auth-primary-button"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Activating Account…</span>
                </>
              ) : (
                'Activate Account & Set Password'
              )}
            </button>

            <div className="auth-flow-actions flex items-center justify-center border-t border-slate-200">
              <button
                type="button"
                onClick={toLogin}
                className="font-medium text-[#58709a] hover:text-[#00843D] transition-colors cursor-pointer text-sm"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </section>

      <footer className="auth-footer">
        © 2026 Ministry of Agriculture (MoA) Asset Tracking System
      </footer>
    </main>
  );
};
