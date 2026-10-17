import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { MoaLogo } from '../components/ui/MoaLogo';
import { Lock, Eye, EyeOff, KeyRound, CheckCircle2, RefreshCw, LogOut } from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
  const { user, refreshSession, logout } = useAuth();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
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
    if (currentPassword === newPassword) {
      setError('New password must be different from your current temporary password.');
      return;
    }

    setSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password Updated', 'Your permanent password has been set. Welcome to the portal.');
      await refreshSession();
    } catch (err: any) {
      setError(err.message || 'The password could not be changed. Please check your temporary password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="auth-dark-bg min-h-screen w-full overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center relative selection:bg-amber-400 selection:text-emerald-950 font-sans p-3 sm:p-4 py-4 sm:py-6"
      style={{
        background:
          'radial-gradient(ellipse at 50% 20%, #0d3d24 0%, #082618 45%, #03120a 100%)',
      }}
    >
      {/* Background Ambient Glows */}
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[540px] opacity-25 blur-[100px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, #10b981 0%, #065f46 50%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[260px] opacity-15 blur-[80px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, #FCDD09 0%, transparent 70%)',
        }}
      />

      {/* Geometric grid pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Main Container - Centered and scaled to fit compact screens */}
      <main className="w-full max-w-[420px] z-10 animate-fadeIn my-auto">
        {/* Authentic MoA Card matching Login Page */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl sm:rounded-3xl border border-emerald-500/30 backdrop-blur-2xl py-4 sm:py-5 px-5 sm:px-7 relative overflow-hidden ring-1 ring-white/10 text-white"
          style={{
            background:
              'linear-gradient(168deg, rgba(14, 46, 29, 0.95) 0%, rgba(9, 31, 20, 0.97) 50%, rgba(5, 18, 12, 0.98) 100%)',
            boxShadow:
              '0 24px 60px -12px rgba(0, 0, 0, 0.88), 0 12px 28px -10px rgba(0, 0, 0, 0.75), 0 0 45px -10px rgba(16, 185, 129, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15), inset 0 -1px 1px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Top gold-emerald accent strip with glow */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-[#FCDD09] to-emerald-600 shadow-[0_1px_10px_rgba(252,221,9,0.55)]" />

          {/* Subtle inner top specular highlight */}
          <div className="absolute top-1.5 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          {/* Brand Header */}
          <div className="text-center mb-3 sm:mb-3.5 pt-0.5">
            <div className="relative inline-block mb-1.5">
              <div className="absolute inset-0 rounded-full bg-emerald-500/25 blur-xl -z-10 scale-125" />
              <MoaLogo
                className="w-11 h-11 sm:w-13 sm:h-13 mx-auto drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)] transition-transform hover:scale-105"
                alt="Ministry of Agriculture"
              />
            </div>

            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight drop-shadow-sm">
              Choose a New Password
            </h1>
            <p className="text-[11px] sm:text-xs text-emerald-200/80 mt-0.5 leading-tight">
              {user?.fullNameEn ? user.fullNameEn + ', your' : 'Your'} password is temporary. Choose your own before continuing.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-2.5 p-2.5 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Inputs */}
          <div className="space-y-2 sm:space-y-2.5">
            {/* Temporary / Current Password */}
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold text-emerald-300/90 mb-0.5">
                Current Temporary Password
              </label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter temporary password"
                  autoFocus
                  className="w-full h-9 sm:h-10 pl-9 pr-9 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                  style={{
                    background: 'rgba(3, 15, 10, 0.88)',
                    borderColor: 'rgba(52, 211, 153, 0.25)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                >
                  {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold text-emerald-300/90 mb-0.5">
                New Password
              </label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full h-9 sm:h-10 pl-9 pr-9 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                  style={{
                    background: 'rgba(3, 15, 10, 0.88)',
                    borderColor: 'rgba(52, 211, 153, 0.25)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                >
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold text-emerald-300/90 mb-0.5">
                Confirm New Password
              </label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full h-9 sm:h-10 pl-9 pr-4 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                  style={{
                    background: 'rgba(3, 15, 10, 0.88)',
                    borderColor: 'rgba(52, 211, 153, 0.25)',
                  }}
                />
              </div>
            </div>

            <p className="text-[10.5px] sm:text-[11px] text-emerald-300/70 font-sans leading-tight pt-0.5">
              * Must be at least 8 characters with at least one letter and one number.
            </p>

            {/* Submit Button */}
            <div className="pt-1.5 sm:pt-2">
              <button
                type="submit"
                disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
                className="w-full h-9.5 sm:h-10.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-[0_8px_20px_-4px_rgba(0,0,0,0.6),0_2px_6px_rgba(18,99,60,0.5)] cursor-pointer border border-amber-400/35 transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed group relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #136a41 0%, #0c4228 100%)',
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-amber-300" />
                    <span>Set Permanent Password</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sign Out link */}
          <div className="mt-2.5 pt-2 border-t border-emerald-500/15 flex justify-center">
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
