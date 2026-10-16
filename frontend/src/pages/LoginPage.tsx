import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getErrorStatus } from "../api/client";
import { useToast } from "../context/ToastContext";
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  HelpCircle,
  X,
  Phone,
  Building2,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
  RefreshCw,
  Clock,
  Send,
} from "lucide-react";
import { MoaLogo } from "../components/ui/MoaLogo";
import { APP_VERSION } from "../version";

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showForgotModal) {
        setShowForgotModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showForgotModal]);

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

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;
    setForgotSubmitted(true);
  };

  const handleCopySupportEmail = () => {
    navigator.clipboard.writeText("it.support@moa.gov.et");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const resetForgotDialog = () => {
    setShowForgotModal(false);
    setForgotSubmitted(false);
    setForgotIdentifier("");
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between selection:bg-emerald-600 selection:text-white relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 15%, #0e4529 0%, #092a1a 45%, #04140c 100%)",
      }}
    >
      {/* Ambient warm gold & emerald highlight behind emblem */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[720px] h-[360px] opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, #FCDD09 0%, #10b981 45%, transparent 70%)",
        }}
      />

      {/* Subtle geometric grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Top Ministry Accent Bar */}
      <header className="relative z-10 pt-4 px-6 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-emerald-300/80">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold tracking-wide">FDRE Ministry of Agriculture</span>
          <span className="text-emerald-500/60 font-sans">&bull;</span>
          <span className="font-sans text-emerald-300/60 hidden sm:inline">የኢ.ፌ.ዴ.ሪ ግብርና ሚኒስቴር</span>
        </div>
        <div className="text-[11px] font-mono text-emerald-400/60 hidden md:block">
          Official Government Portal
        </div>
      </header>

      {/* Main Centered Login Arena */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10">
        <div className="w-full max-w-[430px] animate-fadeIn">
          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake shadow-lg">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Authentic MoA Glass Card */}
          <form
            onSubmit={handleFormSubmit}
            className="rounded-2xl sm:rounded-3xl border border-emerald-500/25 backdrop-blur-xl p-7 sm:p-9 shadow-2xl relative overflow-hidden"
            style={{
              background:
                "linear-gradient(165deg, rgba(13, 48, 29, 0.94) 0%, rgba(8, 32, 20, 0.96) 60%, rgba(5, 20, 12, 0.98) 100%)",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 30px rgba(11, 61, 37, 0.35)",
            }}
          >
            {/* Top gold-emerald accent strip */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-[#FCDD09] to-emerald-600" />

            {/* Brand Header */}
            <div className="text-center mb-7 pt-1">
              <MoaLogo
                className="w-20 h-20 sm:w-22 sm:h-22 mx-auto mb-3.5 drop-shadow-xl"
                alt="Ministry of Agriculture"
              />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80 mb-1">
                FDRE Ministry of Agriculture
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                MoA Asset Tracking System
              </h1>
              <p className="text-xs text-emerald-300/80 font-sans mt-0.5">
                የቋሚ ንብረት ቁጥጥርና አስተዳደር ሥርዓት
              </p>
              <p className="text-[11px] text-emerald-200/50 mt-1.5">
                Sign in with your civil service credentials
              </p>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Email / Payroll ID */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-emerald-300/90 mb-1.5">
                  <span>Email or Employee ID</span>
                  <span className="text-[11px] text-emerald-400/60 font-sans font-normal">
                    ኢሜይል ወይም መለያ
                  </span>
                </label>
                <div className="relative group">
                  <Mail className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                  <input
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="name@moa.gov.et or payroll ID"
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border focus:ring-1 focus:ring-amber-400/50"
                    style={{
                      background: "rgba(4, 18, 12, 0.85)",
                      borderColor: "rgba(52, 211, 153, 0.22)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#FCDD09")}
                    onBlur={(e) =>
                      (e.target.style.borderColor = "rgba(52, 211, 153, 0.22)")
                    }
                  />
                </div>
              </div>

              {/* Password & Forgot Password Link */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-300/90 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span>Password</span>
                    <span className="text-[11px] text-emerald-400/60 font-sans font-normal">
                      የይለፍ ቃል
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotIdentifier(usernameOrEmail);
                      setShowForgotModal(true);
                    }}
                    className="text-[11px] font-medium text-emerald-400 hover:text-amber-300 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Forgot password?</span>
                    <span className="font-sans text-[10px] text-emerald-400/70">
                      (ረሱ?)
                    </span>
                  </button>
                </div>

                <div className="relative group">
                  <Lock className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-10 pr-10 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border focus:ring-1 focus:ring-amber-400/50"
                    style={{
                      background: "rgba(4, 18, 12, 0.85)",
                      borderColor: "rgba(52, 211, 153, 0.22)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#FCDD09")}
                    onBlur={(e) =>
                      (e.target.style.borderColor = "rgba(52, 211, 153, 0.22)")
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full h-11 rounded-[4px] text-white text-xs font-bold shadow-xl cursor-pointer border border-amber-400/30 transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
                  style={{
                    background:
                      "linear-gradient(135deg, #12633C 0%, #0B3D25 100%)",
                  }}
                >
                  {signingIn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to MoA Asset Tracking System</span>
                      <ArrowRight className="w-4 h-4 text-amber-300" />
                    </>
                  )}
                </button>
              </div>

              {/* Security Badges */}
              <div className="pt-2 flex items-center justify-center gap-1.5 text-[10px] text-emerald-400/60">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                <span>Protected Civil Service Network &bull; IFMIS Mirror &bull; TLS 1.3</span>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* ── Forgot Password Dialog Modal ── */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-pw-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetForgotDialog();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-emerald-500/30 text-white shadow-2xl relative overflow-hidden animate-scaleIn p-6 sm:p-7"
            style={{
              background:
                "linear-gradient(165deg, rgba(13, 48, 29, 0.98) 0%, rgba(7, 26, 16, 0.99) 100%)",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8)",
            }}
          >
            {/* Top gold accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-[#FCDD09] to-emerald-500" />

            {/* Header & Close */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-amber-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="forgot-pw-title"
                    className="text-base font-bold text-white tracking-tight"
                  >
                    Password Reset Assistance
                  </h2>
                  <p className="text-xs text-emerald-300/70 font-sans">
                    የይለፍ ቃል መልሶ ማግኛ እገዛ
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetForgotDialog}
                className="text-emerald-400/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content body */}
            {!forgotSubmitted ? (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-xs text-emerald-100/80 leading-relaxed">
                  For civil service security and IFMIS governance, passwords are
                  managed and issued through your Directorate System Administrator
                  or the IT Directorate Support Desk.
                </p>

                <div className="p-3 rounded-xl bg-black/30 border border-emerald-500/20 text-xs space-y-2">
                  <div className="text-amber-300 font-semibold flex items-center gap-1.5 text-[11px]">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>How to get your temporary password:</span>
                  </div>
                  <ul className="text-emerald-200/80 text-[11px] space-y-1 list-disc list-inside">
                    <li>Contact your Directorate Head or System Administrator</li>
                    <li>Or submit your registered email / ID below for helpdesk priority</li>
                    <li>Present your FDRE Employee ID card to verify identity</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                    Your Registered Email or Payroll ID
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="e.g. hana@moa.gov.et or 00123456"
                      className="w-full h-10 pl-10 pr-4 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border focus:ring-1 focus:ring-amber-400/50"
                      style={{
                        background: "rgba(4, 18, 12, 0.85)",
                        borderColor: "rgba(52, 211, 153, 0.3)",
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="px-4 py-2 rounded-[4px] text-xs font-medium text-emerald-200/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-[4px] text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Request Reset Assistance</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                <div className="p-4 rounded-xl bg-emerald-900/40 border border-emerald-400/40 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      Assistance Request Recorded
                    </h3>
                    <p className="text-[11px] text-emerald-200/90 mt-1 leading-relaxed">
                      Your reset request for{" "}
                      <span className="font-mono text-amber-300 font-semibold">
                        {forgotIdentifier}
                      </span>{" "}
                      has been logged. Please contact IT Help Desk or your Directorate Administrator to receive your one-time temporary password.
                    </p>
                  </div>
                </div>

                {/* Direct Contacts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/20">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                      <Phone className="w-3.5 h-3.5 text-amber-300" />
                      <span>IT Help Desk Phone</span>
                    </div>
                    <div className="mt-1 font-mono font-semibold text-xs text-white">
                      +251 11 646 0111
                    </div>
                    <div className="text-[10px] text-emerald-300/60 mt-0.5">
                      Ext: 4210 / 4212
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/20">
                    <div className="flex items-center justify-between text-emerald-400 text-[11px] font-medium">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-amber-300" />
                        <span>Support Email</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySupportEmail}
                        className="text-emerald-400 hover:text-amber-300 transition p-0.5 cursor-pointer"
                        title="Copy email"
                      >
                        {copiedEmail ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="mt-1 font-mono font-medium text-xs text-white truncate">
                      it.support@moa.gov.et
                    </div>
                    <div className="text-[10px] text-emerald-300/60 mt-0.5">
                      Direct IT ticket desk
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/20 border border-emerald-500/10 text-[11px] text-emerald-300/70 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    MoA Headquarters, Block B, Room 104 &bull; Mon–Fri 8:30 AM – 5:30 PM
                  </span>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="w-full sm:w-auto px-5 py-2 rounded-[4px] text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <span>Back to Sign In</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page Footer */}
      <footer className="py-4 px-4 text-center text-[11px] text-emerald-400/50 shrink-0 border-t border-white/[0.04]">
        Federal Democratic Republic of Ethiopia &bull; Ministry of Agriculture &bull; Version {APP_VERSION}
      </footer>
    </div>
  );
};

export default LoginPage;
