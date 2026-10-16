import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api, getErrorStatus } from "../api/client";
import { useToast } from "../context/ToastContext";
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  HelpCircle,
  X,
  Phone,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
  RefreshCw,
  Send,
  UserCheck,
} from "lucide-react";
import { MoaLogo } from "../components/ui/MoaLogo";

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);

  // Forgot / Change Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [modalTab, setModalTab] = useState<"change" | "reset" | "help">("change");

  // Change / Reset form fields
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [resetPayrollId, setResetPayrollId] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // IT Assistance Tab fields
  const [helpIdentifier, setHelpIdentifier] = useState("");
  const [helpSubmitted, setHelpSubmitted] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showForgotModal) {
        resetForgotDialog();
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

  const resetForgotDialog = () => {
    setShowForgotModal(false);
    setResetError(null);
    setResetSuccessMessage(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setHelpSubmitted(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 8) {
      setResetError("New password must be at least 8 characters with a letter and a number.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setResetError("New password must contain both letters and numbers.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("New passwords do not match. Please verify.");
      return;
    }

    setResetLoading(true);
    try {
      if (modalTab === "change") {
        if (!currentPassword) {
          setResetError("Enter your current or temporary password.");
          setResetLoading(false);
          return;
        }
        const res = await api.resetOrChangePassword({
          usernameOrEmail: resetIdentifier || usernameOrEmail,
          currentPassword,
          newPassword,
        });
        setResetSuccessMessage(res.message || "Password changed successfully.");
        if (res.username) setUsernameOrEmail(res.username);
        setPassword(newPassword);
        toast.success("Password Updated", "You can now sign in with your new password.");
      } else if (modalTab === "reset") {
        if (!resetPayrollId.trim() || !resetEmail.trim()) {
          setResetError("Enter both your Employee ID and registered official Email.");
          setResetLoading(false);
          return;
        }
        const res = await api.resetOrChangePassword({
          payrollId: resetPayrollId.trim(),
          email: resetEmail.trim(),
          newPassword,
        });
        setResetSuccessMessage(res.message || "Password reset successfully.");
        if (res.username) setUsernameOrEmail(res.username);
        setPassword(newPassword);
        toast.success("Password Reset", "Your password has been reset. You can now sign in.");
      }
    } catch (err: any) {
      setResetError(err.message || "Failed to update password. Please check your information.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleHelpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpIdentifier.trim()) return;
    setHelpSubmitted(true);
    toast.success(
      "Request Logged",
      "Your password reset request has been routed to the MoA IT Support Desk."
    );
  };

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center relative overflow-x-hidden selection:bg-amber-400 selection:text-emerald-950 font-sans p-4 sm:p-6"
      style={{
        background:
          "radial-gradient(ellipse 90% 80% at 50% -10%, #0c331f 0%, #061910 50%, #030d08 100%)",
      }}
    >
      {/* Background Decorative Rings */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none opacity-[0.06]"
        style={{
          background:
            "radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(5, 150, 105, 0.1) 40%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Main Login Arena - Perfectly Centered in Viewport */}
      <main className="w-full max-w-[440px] z-10 animate-fadeIn">
        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake shadow-lg">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Authentic MoA Card with Rich Height and Balanced Depth */}
        <form
          onSubmit={handleFormSubmit}
          className="rounded-3xl border border-emerald-500/30 backdrop-blur-2xl py-9 sm:py-11 px-8 sm:px-10 relative overflow-hidden ring-1 ring-white/10"
          style={{
            background:
              "linear-gradient(168deg, rgba(14, 46, 29, 0.95) 0%, rgba(9, 31, 20, 0.97) 50%, rgba(5, 18, 12, 0.98) 100%)",
            boxShadow:
              "0 32px 70px -12px rgba(0, 0, 0, 0.88), 0 16px 36px -10px rgba(0, 0, 0, 0.75), 0 0 55px -10px rgba(16, 185, 129, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15), inset 0 -1px 1px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Top gold-emerald accent strip with glow */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-[#FCDD09] to-emerald-600 shadow-[0_1px_10px_rgba(252,221,9,0.55)]" />

          {/* Subtle inner top specular highlight */}
          <div className="absolute top-1.5 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          {/* Brand Header with Majestic Logo and Spacing */}
          <div className="text-center mb-7 sm:mb-8 pt-1">
            <div className="relative inline-block mb-3.5 sm:mb-4">
              <div className="absolute inset-0 rounded-full bg-emerald-500/25 blur-2xl -z-10 scale-125" />
              <MoaLogo
                className="w-20 h-20 sm:w-22 sm:h-22 mx-auto drop-shadow-[0_12px_20px_rgba(0,0,0,0.55)] transition-transform hover:scale-105"
                alt="Ministry of Agriculture"
              />
            </div>

            <h1 className="text-2xl sm:text-[25px] font-bold text-white tracking-tight drop-shadow-sm">
              MoA Asset Tracking System
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200/80 mt-1.5 font-medium">
              Sign in with your credentials
            </p>
          </div>

          {/* Form Inputs with Generous Height & Touch Targets */}
          <div className="space-y-5 sm:space-y-6">
            {/* Email / Payroll ID */}
            <div>
              <label className="flex items-center justify-between text-xs sm:text-[13px] font-semibold text-emerald-300/90 mb-2">
                <span>Email or Employee ID</span>
                <span className="text-[11px] text-emerald-400/60 font-sans font-normal">
                  ኢሜይል ወይም መለያ
                </span>
              </label>
              <div className="relative group">
                <Mail className="w-4.5 h-4.5 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="name@moa.gov.et or payroll ID"
                  className="w-full h-11 sm:h-12 pl-10 sm:pl-11 pr-4 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                  style={{
                    background: "rgba(3, 15, 10, 0.88)",
                    borderColor: "rgba(52, 211, 153, 0.25)",
                  }}
                />
              </div>
            </div>

            {/* Password & Forgot Password Link */}
            <div>
              <div className="flex items-center justify-between text-xs sm:text-[13px] font-semibold text-emerald-300/90 mb-2">
                <span className="flex items-center gap-1.5">
                  <span>Password</span>
                  <span className="text-[11px] text-emerald-400/60 font-sans font-normal">
                    ይለፍ ቃል
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(usernameOrEmail);
                    setHelpIdentifier(usernameOrEmail);
                    setResetError(null);
                    setResetSuccessMessage(null);
                    setModalTab("change");
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-medium text-emerald-400 hover:text-amber-300 transition-colors cursor-pointer inline-flex items-center gap-1 group"
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400 group-hover:text-amber-300 transition-colors" />
                  <span>Forgot password?</span>
                  <span className="font-sans text-[11px] text-emerald-400/70">
                    (ረሱ / ቀይር)
                  </span>
                </button>
              </div>

              <div className="relative group">
                <Lock className="w-4.5 h-4.5 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-11 sm:h-12 pl-10 sm:pl-11 pr-11 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                  style={{
                    background: "rgba(3, 15, 10, 0.88)",
                    borderColor: "rgba(52, 211, 153, 0.25)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={signingIn}
                className="w-full h-11 sm:h-12 rounded-xl text-white text-xs sm:text-sm font-bold shadow-[0_8px_20px_-4px_rgba(0,0,0,0.6),0_2px_6px_rgba(18,99,60,0.5)] cursor-pointer border border-amber-400/35 transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed group relative overflow-hidden"
                style={{
                  background:
                    "linear-gradient(135deg, #136a41 0%, #0c4228 100%)",
                }}
              >
                <div className="absolute inset-0 bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity" />
                {signingIn ? (
                  <>
                    <RefreshCw className="w-4.5 h-4.5 animate-spin text-amber-300" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to MoA Asset Tracking System</span>
                    <ArrowRight className="w-4.5 h-4.5 text-amber-300 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* ─── Change / Reset Password Dialog Modal ─── */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-pw-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetForgotDialog();
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-emerald-500/30 text-white shadow-2xl relative overflow-hidden animate-scaleIn p-6 sm:p-7 ring-1 ring-white/10"
            style={{
              background:
                "linear-gradient(165deg, rgba(13, 48, 29, 0.98) 0%, rgba(7, 26, 16, 0.99) 100%)",
              boxShadow:
                "0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 40px rgba(16, 185, 129, 0.2)",
            }}
          >
            {/* Top gold accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-[#FCDD09] to-emerald-500 shadow-[0_1px_6px_rgba(252,221,9,0.4)]" />

            {/* Header & Close */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-amber-300 flex items-center justify-center shrink-0 shadow-inner">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="forgot-pw-title"
                    className="text-base font-bold text-white tracking-tight"
                  >
                    Change or Reset Password
                  </h2>
                  <p className="text-xs text-emerald-300/70 font-sans">
                    የይለፍ ቃል መቀየር እና ማደስ
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

            {/* Success State */}
            {resetSuccessMessage ? (
              <div className="space-y-5 py-2 animate-fadeIn">
                <div className="p-4 rounded-xl bg-emerald-900/40 border border-emerald-400/40 flex items-start gap-3 shadow-inner">
                  <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Password Successfully Updated!
                    </h3>
                    <p className="text-xs text-emerald-200/90 mt-1 leading-relaxed">
                      {resetSuccessMessage}
                    </p>
                    <p className="text-xs text-emerald-300/70 font-sans mt-0.5">
                      የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል። አሁን በአዲሱ ይለፍ ቃል መግባት ይችላሉ።
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Sign In (ወደ መግቢያ ቀጥል)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Navigation Tabs */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-emerald-500/20 mb-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab("change");
                      setResetError(null);
                    }}
                    className={`py-2 px-2.5 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      modalTab === "change"
                        ? "bg-emerald-700/80 text-white shadow-md border border-emerald-400/30"
                        : "text-emerald-300/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Change Password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalTab("reset");
                      setResetError(null);
                    }}
                    className={`py-2 px-2.5 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      modalTab === "reset"
                        ? "bg-emerald-700/80 text-white shadow-md border border-emerald-400/30"
                        : "text-emerald-300/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Reset by ID</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalTab("help");
                      setResetError(null);
                    }}
                    className={`py-2 px-2.5 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      modalTab === "help"
                        ? "bg-emerald-700/80 text-white shadow-md border border-emerald-400/30"
                        : "text-emerald-300/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>IT Assistance</span>
                  </button>
                </div>

                {/* Error Banner inside modal */}
                {resetError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                {/* TAB 1: Change Password with Current/Temporary Password */}
                {modalTab === "change" && (
                  <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                    <p className="text-xs text-emerald-200/80">
                      Enter your current or temporary password to set your permanent password.
                    </p>

                    <div>
                      <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                        Email or Payroll ID
                      </label>
                      <input
                        type="text"
                        required
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        placeholder="e.g. name@moa.gov.et or payroll ID"
                        className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                        Current or Temporary Password
                      </label>
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            className="w-full h-10 pl-3.5 pr-8 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 hover:text-emerald-300 p-1 cursor-pointer"
                          >
                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-emerald-300/60 font-sans">
                      * Must be at least 8 characters and contain both letters and numbers.
                    </p>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={resetForgotDialog}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-emerald-200/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-75"
                      >
                        {resetLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Update Password (ይለፍ ቃል ቀይር)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* TAB 2: Reset by Employee ID & Email */}
                {modalTab === "reset" && (
                  <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                    <p className="text-xs text-emerald-200/80">
                      Forgot your password? Verify your registered civil service credentials to set a new password.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          Employee / Payroll ID
                        </label>
                        <input
                          type="text"
                          required
                          value={resetPayrollId}
                          onChange={(e) => setResetPayrollId(e.target.value)}
                          placeholder="e.g. 00123456"
                          className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          Registered MoA Email
                        </label>
                        <input
                          type="email"
                          required
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="e.g. name@moa.gov.et"
                          className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            className="w-full h-10 pl-3.5 pr-8 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 hover:text-emerald-300 p-1 cursor-pointer"
                          >
                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={resetForgotDialog}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-emerald-200/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-75"
                      >
                        {resetLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Verify & Reset (አረጋግጥና አድስ)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* TAB 3: IT Assistance */}
                {modalTab === "help" && (
                  <div>
                    {!helpSubmitted ? (
                      <form onSubmit={handleHelpSubmit} className="space-y-3.5">
                        <div className="p-3.5 rounded-xl bg-black/40 border border-emerald-500/20 text-xs space-y-2 shadow-inner">
                          <div className="text-amber-300 font-semibold flex items-center gap-1.5 text-[11px]">
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Password Reset Assistance:</span>
                          </div>
                          <ul className="text-emerald-200/80 text-[11px] space-y-1 list-disc list-inside">
                            <li>Contact your Directorate System Administrator</li>
                            <li>Or submit your registered email / ID below for helpdesk priority</li>
                            <li>Present your FDRE Employee ID card to verify identity</li>
                          </ul>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-emerald-300/90 mb-1">
                            Your Registered Email or Payroll ID
                          </label>
                          <input
                            type="text"
                            required
                            value={helpIdentifier}
                            onChange={(e) => setHelpIdentifier(e.target.value)}
                            placeholder="e.g. hana@moa.gov.et or 00123456"
                            className="w-full h-10 px-3.5 rounded-xl text-xs text-white placeholder-emerald-800/80 font-mono transition-all outline-none border border-emerald-500/30 bg-black/40 focus:ring-2 focus:ring-amber-400/40"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={resetForgotDialog}
                            className="px-4 py-2 rounded-lg text-xs font-medium text-emerald-200/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Request Reset Assistance</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-xl bg-emerald-900/40 border border-emerald-400/40 flex items-start gap-3 shadow-inner">
                          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">
                              Assistance Request Recorded
                            </h3>
                            <p className="text-[11px] text-emerald-200/90 mt-1 leading-relaxed">
                              Your reset request for{" "}
                              <span className="font-mono text-amber-300 font-semibold">
                                {helpIdentifier}
                              </span>{" "}
                              has been logged. Please contact IT Help Desk or your Directorate Administrator to receive your one-time temporary password.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/20 shadow-inner">
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

                          <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/20 shadow-inner">
                            <div className="flex items-center justify-between text-emerald-400 text-[11px] font-medium">
                              <span className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-amber-300" />
                                <span>Support Email</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText("it.support@moa.gov.et");
                                  setCopiedEmail(true);
                                  setTimeout(() => setCopiedEmail(false), 2000);
                                }}
                                className="text-emerald-400 hover:text-white p-1 transition cursor-pointer"
                                title="Copy email"
                              >
                                {copiedEmail ? (
                                  <Check className="w-3 h-3 text-emerald-300" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <div className="mt-1 font-mono text-xs text-white">
                              it.support@moa.gov.et
                            </div>
                            <div className="text-[10px] text-emerald-300/60 mt-0.5">
                              MoA ICT Directorate
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={resetForgotDialog}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer"
                          >
                            Back to Sign In
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
