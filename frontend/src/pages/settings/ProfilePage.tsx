import React, { useEffect } from 'react';
import {
  User,
  Shield,
  KeyRound,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';
import { UserRole } from '../../types/asset-management';

const ROLE_TITLES: Partial<Record<UserRole, string>> = {
  [UserRole.MANAGER]: 'Manager',
  [UserRole.DEPARTMENT_HEAD]: 'Directorate Head',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.DATA_ENCODER]: 'Data Encoder',
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
};

const getInitials = (name?: string): string => {
  if (!name) return 'MOA';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const ProfilePage: React.FC = () => {
  const { user, role, logout } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  const roleTitle = ROLE_TITLES[role] || role;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-6">
      {/* Compact Page Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>Account</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Profile</span>
            <span className="text-xs font-normal text-slate-400 font-serif">የተጠቃሚ መገለጫ</span>
          </h1>
        </div>
      </div>

      {/* Card 1: Profile Details */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs border-l-4 border-l-emerald-600">
        <header className="flex items-center gap-2 mb-1">
          <User className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
        </header>
        <p className="text-xs text-slate-500 mb-4">
          Your account identity across the MoA Asset Management System.
        </p>

        {/* User Identity Header */}
        <div className="flex items-center gap-3 pb-3 mb-3.5 border-b border-slate-100">
          <div className="size-11 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0 ring-2 ring-emerald-600/30">
            {getInitials(user?.fullNameEn || user?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 truncate">
                {user?.fullNameEn || 'Ministry Employee'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Shield className="w-2.5 h-2.5 text-emerald-700" />
                {roleTitle}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              {user?.email || 'N/A'}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-200/70">
            <span className="text-slate-400 block text-[11px] font-medium">Full Name (EN / AM)</span>
            <span className="text-slate-800 font-semibold mt-0.5 block truncate">
              {user?.fullNameEn || '—'} {user?.fullNameAm ? `(${user.fullNameAm})` : ''}
            </span>
          </div>

          <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-200/70">
            <span className="text-slate-400 block text-[11px] font-medium">Sign-in Email</span>
            <span className="text-slate-800 font-mono font-medium mt-0.5 block truncate">
              {user?.email || '—'}
            </span>
          </div>

          <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-200/70">
            <span className="text-slate-400 block text-[11px] font-medium">Payroll / Employee ID</span>
            <span className="text-slate-800 font-mono font-medium mt-0.5 block">
              {user?.payrollId || '—'}
            </span>
          </div>

          <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-200/70">
            <span className="text-slate-400 block text-[11px] font-medium">Organization</span>
            <span className="text-slate-800 font-medium mt-0.5 block">
              Ministry of Agriculture (FDRE)
            </span>
          </div>
        </div>
      </section>

      {/* Card 2: Change Password */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs border-l-4 border-l-emerald-600">
        <header className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        </header>
        <p className="text-xs text-slate-500 mb-4">
          Use at least 8 characters with uppercase, lowercase, and a number.
        </p>

        <div className="max-w-md">
          <ChangePasswordForm
            onDone={() => {
              toast.success('Password updated', 'Use your new password next time you sign in.');
            }}
          />
        </div>
      </section>

      {/* Card 3: Active Session */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs border-l-4 border-l-slate-400">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-800">
                Signed in as <span className="font-mono text-emerald-800">{user?.email}</span>
              </span>
              <span className="block text-[11px] text-slate-400">
                Authenticated session active &bull; Token valid
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 transition cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-600" />
            <span>Sign out</span>
          </button>
        </div>
      </section>
    </div>
  );
};
