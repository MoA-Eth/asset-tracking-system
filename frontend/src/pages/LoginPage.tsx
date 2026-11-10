import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api, getErrorStatus } from "../api/client";
import { useToast } from "../context/ToastContext";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Headphones,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  X,
  Mail,
  ArrowRight,
} from "lucide-react";
import { MoaLogo } from "../components/ui/MoaLogo";
import { TechnicalSupportModal } from "../components/TechnicalSupportModal";

const REMEMBERED_IDENTIFIER_KEY = "moa_remembered_identifier";

export const LoginPage: React.FC = () => {
  const { login, sessionNotice } = useAuth();
  const toast = useToast();

  const [rememberedIdentifier] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [identifierInput, setIdentifierInput] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberChoice, setRememberChoice] = useState<boolean | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(sessionNotice);
  const [isTechSupportOpen, setIsTechSupportOpen] = useState(false);

  const usernameOrEmail = identifierInput ?? rememberedIdentifier;
  const rememberMe = rememberChoice ?? Boolean(rememberedIdentifier);

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
    const trimmedId = usernameOrEmail.trim();
    if (!trimmedId) {
      const msg = "Enter your username or email address.";
      setErrorMsg(msg);
      toast.warning("Credentials Required", msg);
      return;
    }
    if (!password) {
      const msg = "Enter your password.";
      setErrorMsg(msg);
      toast.warning("Credentials Required", msg);
      return;
    }
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await login(trimmedId, password);

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, trimmedId);
        } else {
          localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
        }
      } catch {
        // ignore localStorage errors
      }

      toast.success("Welcome Back", "Your credentials are verified. Signing in...");
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
      if (res.username) setIdentifierInput(res.username);
      setPassword(newPassword);
      toast.success("Password Updated", "You can now sign in with your new password.");
    } catch (err: any) {
      setResetError(err.message || "Failed to update password. Please check your credentials.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section
        className="auth-card auth-card-login"
        aria-labelledby="sign-in-title"
      >
        <div className="flex justify-center">
          <MoaLogo size="md" />
        </div>

        <div className="mt-3 text-center">
          <h1
            id="sign-in-title"
            className="auth-page-title font-semibold tracking-tight text-[#00843D]"
          >
            MoA Asset Tracking System
          </h1>
          <p className="auth-page-subtitle mt-1.5 font-medium text-[#58709a]">
            Internal Store-Level Tracking, Inventory and Audit
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {errorMsg}
          </div>
        )}

        <form className="auth-form space-y-4" onSubmit={handleFormSubmit}>
          <div>
            <label htmlFor="identifier" className="auth-label">
              Username or Email
            </label>
            <div className="auth-input-wrap">
              <User aria-hidden="true" className="auth-input-icon" />
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={usernameOrEmail}
                onChange={(e) => setIdentifierInput(e.target.value)}
                placeholder="Enter your username or email"
                className="auth-input pl-12"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <div className="auth-input-wrap">
              <Lock aria-hidden="true" className="auth-input-icon" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="auth-input auth-input-with-trailing-action"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#8da3c4] hover:text-[#00843D] cursor-pointer"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="h-5 w-5 accent-blue-600 rounded cursor-pointer"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => {
                setResetIdentifier(usernameOrEmail);
                setResetError(null);
                setResetSuccessMessage(null);
                setShowForgotModal(true);
              }}
              className="font-semibold text-[#00843D] hover:underline cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={signingIn || !usernameOrEmail.trim() || !password}
            className="auth-primary-button"
          >
            {signingIn ? "Signing In…" : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setIsTechSupportOpen(true)}
          className="auth-support-link mx-auto flex items-center gap-2 font-medium text-[#58709a] hover:text-[#00843D] cursor-pointer"
        >
          <Headphones size={20} className="text-emerald-700" />
          Technical Support
        </button>
      </section>

      <footer className="auth-footer">
        © 2026 Ministry of Agriculture (MoA) Asset Tracking System
      </footer>

      <TechnicalSupportModal
        isOpen={isTechSupportOpen}
        onClose={() => setIsTechSupportOpen(false)}
      />

      {/* ─── Change / Forgot Password Modal: Unified with MoA Institutional Design System ─── */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-pw-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) resetForgotDialog();
          }}
        >
          <div className="auth-card auth-card-flow w-full max-w-md relative animate-scaleIn">
            <button
              type="button"
              onClick={resetForgotDialog}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>

            <div className="flex items-start gap-3 mb-5">
              <span className="rounded-xl bg-emerald-50 p-2 text-[#00843D] shrink-0">
                <KeyRound size={22} />
              </span>
              <div>
                <h2
                  id="change-pw-title"
                  className="auth-flow-title font-semibold tracking-tight text-[#00843D]"
                >
                  Change Password
                </h2>
                <p className="auth-flow-subtitle mt-1 text-slate-500">
                  Update your account credentials to regain access
                </p>
              </div>
            </div>

            {resetSuccessMessage ? (
              <div className="space-y-5 py-2">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                  <CheckCircle2 size={22} className="shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-950">
                      Password Successfully Updated
                    </h3>
                    <p className="mt-1 text-xs text-emerald-800 leading-relaxed">
                      {resetSuccessMessage}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetForgotDialog}
                  className="auth-primary-button"
                >
                  <span>Proceed to Sign In</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {resetError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
                  >
                    {resetError}
                  </div>
                )}

                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter your credentials and current password to choose a new password.
                </p>

                <div>
                  <label htmlFor="reset-id" className="auth-label">
                    Email or Employee ID
                  </label>
                  <div className="auth-input-wrap">
                    <Mail aria-hidden="true" className="auth-input-icon" />
                    <input
                      id="reset-id"
                      type="text"
                      required
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="e.g. name@moa.gov.et or payroll ID"
                      className="auth-input pl-12"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reset-current" className="auth-label">
                    Current or Temporary Password
                  </label>
                  <div className="auth-input-wrap">
                    <Lock aria-hidden="true" className="auth-input-icon" />
                    <input
                      id="reset-current"
                      type={showCurrentPassword ? "text" : "password"}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="auth-input auth-input-with-trailing-action"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#8da3c4] hover:text-[#00843D] cursor-pointer"
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reset-new" className="auth-label">
                      New Password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="reset-new"
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="auth-input auth-input-with-trailing-action"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#8da3c4] hover:text-[#00843D] cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reset-confirm" className="auth-label">
                      Confirm Password
                    </label>
                    <input
                      id="reset-confirm"
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      className="auth-input"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500">
                  * Must be at least 8 characters and contain both letters and numbers.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForgotDialog}
                    className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="auth-primary-button w-auto px-5"
                  >
                    {resetLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Updating…</span>
                      </>
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
