import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { MoaLogo } from '../components/ui/MoaLogo';
import { Lock, Eye, EyeOff, Check, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
  const { user, refreshSession, logout } = useAuth();
  const toast = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // The temporary password isn't asked again: signing in with it is enough
      await api.changePassword(undefined, newPassword);
      toast.success('Password Updated', 'Your permanent password has been set. Welcome to the portal.');
      await refreshSession();
    } catch (err: any) {
      setError(err.message || 'The password could not be changed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section
        className="auth-card auth-card-flow"
        aria-labelledby="change-password-title"
      >
        <div className="flex justify-center">
          <MoaLogo size="md" />
        </div>

        <div className="mt-3 text-center">
          <h1
            id="change-password-title"
            className="auth-flow-title font-semibold tracking-tight text-[#00843D]"
          >
            Choose a New Password
          </h1>
          <p className="auth-flow-subtitle font-medium text-[#58709a]">
            {user?.fullNameEn ? user.fullNameEn + ', your' : 'Your'} password is temporary. Choose your own before continuing.
          </p>
        </div>

        <div className="auth-password-policy rounded-xl bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-900 border border-emerald-100">
          <p className="font-semibold text-emerald-950">Your new password must include:</p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <Check size={16} className="text-emerald-700 shrink-0" />
              <span>At least 8 characters</span>
            </li>
            <li className="flex items-center gap-2">
              <Check size={16} className="text-emerald-700 shrink-0" />
              <span>At least one letter and one number</span>
            </li>
          </ul>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs sm:text-sm font-medium text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-flow-form space-y-4">
          <div>
            <label htmlFor="change-new-pw" className="auth-label">
              New Password
            </label>
            <div className="auth-input-wrap">
              <Lock aria-hidden="true" className="auth-input-icon" />
              <input
                id="change-new-pw"
                name="newPassword"
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
            <label htmlFor="change-confirm-pw" className="auth-label">
              Confirm New Password
            </label>
            <div className="auth-input-wrap">
              <Lock aria-hidden="true" className="auth-input-icon" />
              <input
                id="change-confirm-pw"
                name="confirmPassword"
                type={showNew ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="auth-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !newPassword || !confirmPassword}
            className="auth-primary-button"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Updating Password…</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Set Permanent Password</span>
              </>
            )}
          </button>

          <div className="auth-flow-actions flex items-center justify-center border-t border-slate-200">
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 font-medium text-[#58709a] hover:text-rose-600 transition-colors cursor-pointer text-sm"
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </form>
      </section>

      <footer className="auth-footer">
        © 2026 Ministry of Agriculture (MoA) Asset Tracking System
      </footer>
    </main>
  );
};
