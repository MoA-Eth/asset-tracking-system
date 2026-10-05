import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getErrorStatus } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui";
import { MoaLogo } from "../components/ui/MoaLogo";

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      className="min-h-screen w-full flex flex-col justify-between selection:bg-emerald-600 selection:text-white relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 15%, #0e4529 0%, #092a1a 45%, #04140c 100%)",
      }}
    >

      {/* Ambient warm gold highlight behind emblem */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[650px] h-[320px] opacity-15 blur-3xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, #FCDD09 0%, #10b981 45%, transparent 70%)",
        }}
      />

      {/* Subtle geometric pattern overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Main Centered Arena */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10">
        <div className="w-full max-w-[420px] animate-fadeIn">
          
          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake shadow-lg">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Authentic MoA Card */}
          <form
            onSubmit={handleFormSubmit}
            className="rounded-[32px] border border-emerald-500/20 backdrop-blur-xl p-8 sm:p-9 shadow-2xl relative overflow-hidden"
            style={{
              background: "linear-gradient(165deg, rgba(13, 48, 29, 0.94) 0%, rgba(8, 32, 20, 0.96) 60%, rgba(5, 20, 12, 0.98) 100%)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 30px rgba(11, 61, 37, 0.3)",
            }}
          >
            {/* Top gold accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-[#FCDD09] to-emerald-600" />

            {/* Brand Header */}
            <div className="text-center mb-8 pt-1">
              <MoaLogo className="w-20 h-20 sm:w-22 sm:h-22 mx-auto mb-3.5 drop-shadow-xl" alt="Ministry of Agriculture" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80 mb-1">
                Ministry of Agriculture
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Asset Tracking Portal
              </h1>
              <p className="text-xs text-emerald-200/60 mt-1">
                Sign in with your civil service credentials
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              {/* Email / ID */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                  Email or Employee ID
                </label>
                <div className="relative group">
                  <Mail className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                  <input
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="name@moa.gov.et"
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border"
                    style={{
                      background: "rgba(4, 18, 12, 0.85)",
                      borderColor: "rgba(52, 211, 153, 0.22)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#FCDD09")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(52, 211, 153, 0.22)")}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-10 pr-10 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border"
                    style={{
                      background: "rgba(4, 18, 12, 0.85)",
                      borderColor: "rgba(52, 211, 153, 0.22)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#FCDD09")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(52, 211, 153, 0.22)")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={signingIn}
                  className="w-full h-11 text-white py-3 text-xs font-bold shadow-xl cursor-pointer border border-amber-400/30 rounded-[3px] transition-all flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #12633C 0%, #0B3D25 100%)" }}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Sign In to Asset Tracking Portal
                </Button>
              </div>

              {/* Security Badge */}
              <div className="pt-2 flex items-center justify-center gap-1.5 text-[10px] text-emerald-400/50">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                <span>Protected Civil Service Network • IFMIS Mirror</span>
              </div>
            </div>
          </form>

        </div>
      </main>

      {/* Page Footer */}
      <footer className="py-4 px-4 text-center text-[11px] text-emerald-400/40 shrink-0 border-t border-white/[0.04]">
        Federal Democratic Republic of Ethiopia • Ministry of Agriculture
      </footer>
    </div>
  );
};

export default LoginPage;
