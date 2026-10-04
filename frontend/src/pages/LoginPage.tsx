import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getErrorStatus } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "../components/ui";
import { MoaLogo } from "../components/ui/MoaLogo";

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) {
      const msg = "Enter your email or employee ID.";
      setErrorMsg(msg);
      toast.warning("Credentials Required", msg);
      return;
    }
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await login(usernameOrEmail.trim(), password);
      toast.success("Welcome Back", "Your credentials are verified. Logging in...");
    } catch (err: any) {
      const msg = err.message || "Authentication failed. Please verify credentials.";
      setErrorMsg(msg);
      const status = getErrorStatus(err);
      const isCredentialProblem = status !== undefined && status < 500;
      toast.error(isCredentialProblem ? "Sign-in Failed" : "Can't Sign In Right Now", msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#071911] text-white flex flex-col justify-between selection:bg-emerald-600 selection:text-white">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full animate-fadeIn">

          {/* Error banner — outside card so it stacks above it */}
          {errorMsg && (
            <div className="mb-3 p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Card — logo + headings + form all inside */}
          <form
            onSubmit={handleFormSubmit}
            className="rounded-2xl bg-[#092218] border border-emerald-900/70 shadow-2xl overflow-hidden"
          >
            {/* Card header with logo */}
            <div className="flex flex-col items-center pt-8 pb-5 px-6 sm:px-7 border-b border-emerald-900/50 gap-3">
              <MoaLogo className="w-20 h-20 sm:w-24 sm:h-24" alt="Ministry of Agriculture logo" />
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  Welcome Back!
                </h1>
                <p className="text-[11px] text-emerald-300/60 font-medium mt-0.5 uppercase tracking-widest">
                  Login
                </p>
              </div>
            </div>

            {/* Form fields */}
            <div className="p-6 sm:p-7 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-emerald-200 mb-1.5">
                  Email or employee ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="e.g. name@moa.gov.et or 00123456"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#05160E] border border-emerald-900/80 rounded-xl text-xs text-white placeholder-emerald-700/60 focus:outline-none focus:border-amber-400 font-mono transition-colors"
                  />
                </div>
              </div>

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
                    className="w-full pl-9 pr-3 py-2.5 bg-[#05160E] border border-emerald-900/80 rounded-xl text-xs text-white placeholder-emerald-700/60 focus:outline-none focus:border-amber-400 font-mono transition-colors"
                  />
                </div>
              </div>

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
            </div>
          </form>

        </div>
      </div>

      <footer className="p-4 border-t border-emerald-900/40 text-center text-[11px] text-emerald-400/60 shrink-0">
        <p>Federal Democratic Republic of Ethiopia • Ministry of Agriculture</p>
        <p className="text-[10px] text-emerald-500/40 mt-0.5">
          Role-Gated Property Administration &amp; IFMIS Store Logistics Portal
        </p>
      </footer>
    </div>
  );
};

export default LoginPage;
