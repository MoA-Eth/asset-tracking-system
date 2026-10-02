import React from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { ChangePasswordForm } from '../components/auth/ChangePasswordForm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * Shown instead of the app while the signed-in person still has a temporary password
 * (one set by an administrator, or by whoever installed the system).
 */
export const ChangePasswordPage: React.FC = () => {
  const { user, refreshSession, logout } = useAuth();
  const toast = useToast();

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#071911] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-900">Choose a new password</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              {user?.fullNameEn ? `${user.fullNameEn}, your` : 'Your'} password is temporary. Choose your own before you continue. Nobody else will know it.
            </p>
          </div>
        </div>
        <ChangePasswordForm
          temporary
          onDone={async () => {
            toast.success('Password changed', 'You can now use the system.');
            await refreshSession();
          }}
        />
        <button
          type="button"
          onClick={logout}
          className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-800 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
};
