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
  X,
  CheckCircle2,
  KeyRound,
  RefreshCw,
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

  // Change Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

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
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    
    e.preventDefault();
    setResetError(null);

    const identifier = (resetIdentifier || usernameOrEmail).trim();
    if (!identifier) {
      setResetError("Enter your registered email or employee ID.");
      return;
    }
    if (!currentPassword) {
      setResetError("Enter your current or temporary password.");
      return;
    }
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
      const res = await api.resetOrChangePassword({
        usernameOrEmail: identifier,
        currentPassword,
        newPassword,
      });
      setResetSuccessMessage(res.message || "Password changed successfully.");
      if (res.username) setUsernameOrEmail(res.username);
      setPassword(newPassword);
      toast.success("Password Updated", "You can now sign in with your new password.");
    } catch (err: any) {
      setResetError(err.message || "Failed to update password. Please check your credentials.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center relative overflow-x-hidden selection:bg-amber-400 selection:text-emerald-950 font-sans p-4 sm:p-6"
      style={{
        background:
          "radial-gradient(ellipse at 50% 20%, #0d3d24 0%, #082618 45%, #03120a 100%)",
      }}
    >
      {/* Background Ambient Glows */}
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[540px] opacity-25 blur-[100px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, #10b981 0%, #065f46 50%, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[260px] opacity-15 blur-[80px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, #FCDD09 0%, transparent 70%)",
        }}
      />

      {/* Geometric grid pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Main Login Arena - Centered in Viewport */}
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
              <label className="block text-xs sm:text-[13px] font-semibold text-emerald-300/90 mb-2">
                Email or Employee ID
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
                <span>Password</span>

                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(usernameOrEmail);
                    setResetError(null);
                    setResetSuccessMessage(null);
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-medium text-emerald-400 hover:text-amber-300 transition-colors cursor-pointer inline-flex items-center gap-1.5 group"
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400 group-hover:text-amber-300 transition-colors" />
                  <span>Forgot password?</span>
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
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <span>Login</span>
                    <ArrowRight className="w-4.5 h-4.5 text-amber-300 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* ─── Change Password Dialog Modal: Matching Login Card Styling & Atmosphere ─── */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-pw-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          {/* Translucent backdrop - allows radiant green background to shine through without blacking out */}
          <div
            className="absolute inset-0 bg-[#072417]/45 backdrop-blur-[2px]"
            onClick={resetForgotDialog}
            aria-hidden="true"
          />

          <div
            className="w-full max-w-md rounded-3xl border border-emerald-500/30 backdrop-blur-2xl py-8 sm:py-9 px-7 sm:px-9 relative z-10 overflow-hidden ring-1 ring-white/10 text-white animate-scaleIn"
            style={{
              background:
                "linear-gradient(168deg, rgba(14, 46, 29, 0.96) 0%, rgba(9, 31, 20, 0.98) 50%, rgba(5, 18, 12, 0.99) 100%)",
              boxShadow:
                "0 32px 70px -12px rgba(0, 0, 0, 0.88), 0 16px 36px -10px rgba(0, 0, 0, 0.75), 0 0 55px -10px rgba(16, 185, 129, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15), inset 0 -1px 1px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Top gold-emerald accent strip with glow */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-[#FCDD09] to-emerald-600 shadow-[0_1px_10px_rgba(252,221,9,0.55)]" />

            {/* Subtle inner top specular highlight */}
            <div className="absolute top-1.5 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            {/* Header & Close */}
            <div className="flex items-start justify-between gap-3 mb-6 pt-1">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-amber-300 flex items-center justify-center shrink-0 shadow-inner">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="change-pw-title"
                    className="text-xl font-bold text-white tracking-tight"
                  >
                    Change Password
                  </h2>
                  <p className="text-xs text-emerald-200/75 mt-0.5">
                    Update your account credentials
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

            {/* Confirmation / Success State */}
            {resetSuccessMessage ? (
              <div className="space-y-6 py-2 animate-fadeIn">
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-start gap-3 shadow-inner">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Password Successfully Updated
                    </h3>
                    <p className="text-xs text-emerald-200/80 mt-1 leading-relaxed">
                      {resetSuccessMessage}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="w-full h-11 sm:h-12 rounded-xl text-white text-xs sm:text-sm font-bold shadow-[0_8px_20px_-4px_rgba(0,0,0,0.6),0_2px_6px_rgba(18,99,60,0.5)] cursor-pointer border border-amber-400/35 transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99]"
                    style={{
                      background:
                        "linear-gradient(135deg, #136a41 0%, #0c4228 100%)",
                    }}
                  >
                    <span>Proceed to Sign In</span>
                    <ArrowRight className="w-4.5 h-4.5 text-amber-300" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {/* Error Banner */}
                {resetError && (
                  <div className="p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                <p className="text-xs text-emerald-200/75 leading-relaxed">
                  Enter your employee credentials and current password to set your new password.
                </p>

                {/* Email or Payroll ID */}
                <div>
                  <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                    Email or Employee ID
                  </label>
                  <div className="relative group">
                    <Mail className="w-4.5 h-4.5 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                    <input
                      type="text"
                      required
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
              placeholder="e.g. name@moa.gov.et or payroll ID"
                      className="w-full h-11 pl-10 pr-4 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                      style={{
                        background: "rgba(3, 15, 10, 0.88)",
                        borderColor: "rgba(52, 211, 153, 0.25)",
                      }}
                    />
                  </div>
                </div>

                {/* Current / Temporary Password */}
                <div>
                  <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                    Current or Temporary Password
                  </label>
                  <div className="relative group">
                    <Lock className="w-4.5 h-4.5 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-amber-400" />
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="w-full h-11 pl-10 pr-10 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                      style={{
                        background: "rgba(3, 15, 10, 0.88)",
                        borderColor: "rgba(52, 211, 153, 0.25)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors cursor-pointer p-1"
                      title={showCurrentPassword ? "Hide" : "Show"}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password & Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                      New Password
                    </label>
                    <div className="relative group">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full h-11 pl-3.5 pr-9 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                        style={{
                          background: "rgba(3, 15, 10, 0.88)",
                          borderColor: "rgba(52, 211, 153, 0.25)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 transition-colors p-1 cursor-pointer"
                        title={showNewPassword ? "Hide" : "Show"}
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-300/90 mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      className="w-full h-11 px-3.5 rounded-xl text-xs sm:text-sm text-white placeholder-emerald-800/80 font-mono transition-all outline-none border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-2 focus:ring-amber-400/40"
                      style={{
                        background: "rgba(3, 15, 10, 0.88)",
                        borderColor: "rgba(52, 211, 153, 0.25)",
                      }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-emerald-300/60">
                  * Must be at least 8 characters and contain both letters and numbers.
                </p>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium text-emerald-200/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="h-11 px-5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-[0_8px_20px_-4px_rgba(0,0,0,0.6),0_2px_6px_rgba(18,99,60,0.5)] cursor-pointer border border-amber-400/35 transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
                    style={{
                      background:
                        "linear-gradient(135deg, #136a41 0%, #0c4228 100%)",
                    }}
                  >
                    {resetLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 text-amber-300" />
                        <span>Update Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
