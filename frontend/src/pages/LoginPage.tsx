import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getErrorStatus } from '../api/client';
import { useToast } from '../context/ToastContext';
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { Button } from '../components/ui';

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  // Starts with the reason the user was signed out, if any
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) {
      const msg = 'Please enter your MoA official email or civil service payroll ID.';
      setErrorMsg(msg);
      toast.warning('Credentials Required', msg);
      return;
    }
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await login(usernameOrEmail.trim(), password);
      toast.success('Welcome Back', 'Your credentials are verified. Logging in...');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed. Please verify credentials.';
      setErrorMsg(msg);
      // Wrong email or password is the user's to fix; anything else is the system's
      const status = getErrorStatus(err);
      const isCredentialProblem = status !== undefined && status < 500;
      toast.error(isCredentialProblem ? 'Sign-in Failed' : "Can't Sign In Right Now", msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="h-dvh w-full overflow-y-auto bg-[#071911] text-white flex flex-col selection:bg-emerald-600 selection:text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Main Single Centered Login Card */}
      <div className="flex-1 shrink-0 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full animate-fadeIn">
          {/* Brand Header */}
          <div className="text-center space-y-3 mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F4A2B] to-[#04180E] border-2 border-amber-400/50 shadow-xl p-2.5 mx-auto">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
                <circle cx="50" cy="50" r="46" fill="#0A3F24" stroke="#FCDD09" strokeWidth="3" />
                <path d="M50 16 L50 82" stroke="#FCDD09" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M50 28 Q66 22 68 34 Q58 38 50 34" fill="#FCDD09" />
                <path d="M50 42 Q68 36 70 48 Q60 52 50 48" fill="#FCDD09" />
                <path d="M50 28 Q34 22 32 34 Q42 38 50 34" fill="#FCDD09" />
                <path d="M50 42 Q32 36 30 48 Q40 52 50 48" fill="#FCDD09" />
                <circle cx="50" cy="50" r="4" fill="#FCDD09" />
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  MoA<span className="text-[#FCDD09]">-AMS</span>
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-400/20 text-[#FCDD09] border border-amber-400/40">
                  IFMIS Mirror
                </span>
              </div>
              <p className="text-xs text-emerald-200/90 font-medium mt-1">
                Ministry of Agriculture • FDRE
              </p>
              <p className="text-[11px] text-emerald-400/60 font-mono mt-0.5">
                Fixed Asset & Store Management Portal
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unified Login Form Card */}
          <form
            onSubmit={handleFormSubmit}
            className="p-6 sm:p-7 rounded-2xl bg-[#092218] border border-emerald-900/70 shadow-2xl space-y-4"
          >
            {/* Email / Payroll ID Field */}
            <div>
              <label className="block text-xs font-semibold text-emerald-200 mb-1.5">
                Official Email or Payroll ID
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="e.g. sysadmin@moa.gov.et or MOA/STORE-102"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#05160E] border border-emerald-900/80 rounded-xl text-xs text-white placeholder-emerald-700/60 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold text-emerald-200 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your civil service password"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#05160E] border border-emerald-900/80 rounded-xl text-xs text-white placeholder-emerald-700/60 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={signingIn}
              className="w-full bg-[#125835] hover:bg-[#186D42] text-white py-3 border border-amber-400/30 text-xs font-bold shadow-lg mt-2 cursor-pointer"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to AMS Portal
            </Button>
          </form>
        </div>
      </div>

      {/* Institutional Footer */}
      <footer className="p-4 border-t border-emerald-900/40 text-center text-[11px] text-emerald-400/60 shrink-0">
        <p>
          Federal Democratic Republic of Ethiopia • Ministry of Agriculture
        </p>
        <p className="text-[10px] text-emerald-500/40 mt-0.5">
          Role-Gated Property Administration & IFMIS Store Logistics Portal
        </p>
      </footer>
    </div>
  );
};
export default LoginPage;
