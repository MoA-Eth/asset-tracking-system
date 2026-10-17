import React, { useEffect, useState } from 'react';
import {
  User,
  Shield,
  KeyRound,
  LogOut,
  CheckCircle2,
  Mail,
  Phone,
  IdCard,
  Building2,
  BadgeCheck,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';
import { Department, UserRole } from '../../types/asset-management';
import { APP_COMMIT, APP_VERSION } from '../../version';
import { api } from '../../api/client';
import { departmentLabel } from '../../utils/department';

const ROLE_TITLES: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Administrator',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.EMPLOYEE]: 'Employee',
  [UserRole.DEPARTMENT_HEAD]: 'Directorate Head',
  [UserRole.CHIEF_DIRECTOR]: 'Chief Director',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.DATA_ENCODER]: 'Data Encoder',
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
};

const ROLE_TITLES_AM: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'ዋና አስተዳዳሪ',
  [UserRole.MANAGER]: 'ሥራ አስኪያጅ',
  [UserRole.EMPLOYEE]: 'ሠራተኛ',
  [UserRole.DEPARTMENT_HEAD]: 'የዳይሬክቶሬት ኃላፊ',
  [UserRole.CHIEF_DIRECTOR]: 'ዋና ዳይሬክተር',
  [UserRole.TEAM_LEADER]: 'የቡድን መሪ',
  [UserRole.DATA_ENCODER]: 'መረጃ መጋቢ',
  [UserRole.SYSTEM_ADMIN]: 'የስርዓት አስተዳዳሪ',
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Master administrator with full access to all store operations, approvals, reports, and settings.',
  [UserRole.SYSTEM_ADMIN]: 'Full administrative control over users, roles, stores, references, and system settings.',
  [UserRole.CHIEF_DIRECTOR]: 'Final executive approval authority for property clearance and major asset write-offs.',
  [UserRole.DEPARTMENT_HEAD]: 'Department-level approval authority for issue, transfer, and disposal requests.',
  [UserRole.TEAM_LEADER]: 'First-line verification and endorsement of asset requests and inventory receipts.',
  [UserRole.DATA_ENCODER]: 'Data entry, stock receipt (Model 19), issue (Model 22), transfer, and return (Model 21).',
  [UserRole.MANAGER]: 'Operational oversight and management across allocated directorates and assets.',
  [UserRole.EMPLOYEE]: 'Standard employee account for viewing assigned assets and personal clearance status.',
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo(0, 0);

    api.getDepartments().then(setDepartments).catch(() => {});
  }, []);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const roleTitle = ROLE_TITLES[role] || role;
  const roleTitleAm = ROLE_TITLES_AM[role] || '';
  const userDept = departments.find((d) => d.id === user?.departmentId);
  const deptDisplay = userDept ? departmentLabel(userDept) : (user?.departmentId || 'General Ministry Staff');

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fadeIn pb-12">
      {/* ── Executive Profile Hero Card ── */}
      <section className="rounded-md bg-white border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)] overflow-hidden">
        {/* Banner with MoA accents */}
        <div className="relative bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 px-6 py-6 text-white">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                <Shield className="w-3.5 h-3.5 text-emerald-300" />
                <span className="uppercase tracking-wider">Account Profile</span>
                <span className="text-emerald-300/70 font-normal">&bull;</span>
                <span className="text-emerald-100 font-sans">የተጠቃሚ መገለጫ</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1.5 flex items-baseline gap-2.5 flex-wrap">
                <span>{user?.fullNameEn || 'Ministry Employee'}</span>
                {user?.fullNameAm && (
                  <span className="text-sm font-medium text-emerald-100 font-sans">
                    ({user.fullNameAm})
                  </span>
                )}
              </h1>
              <p className="text-xs text-emerald-100/90 mt-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>FDRE Ministry of Agriculture &bull; {deptDisplay}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-white/15 backdrop-blur-xs text-white text-xs font-semibold border border-white/20 shadow-xs">
                <BadgeCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>{roleTitle}</span>
                {roleTitleAm && (
                  <span className="text-[11px] text-emerald-200/90 font-normal">({roleTitleAm})</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Identity & Details Card Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Avatar and Quick Summary */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="size-16 rounded-full bg-gradient-to-tr from-emerald-800 to-emerald-600 text-white flex items-center justify-center font-bold text-xl ring-4 ring-white shadow-md">
                {getInitials(user?.fullNameEn || user?.email)}
              </div>
              <span
                className="absolute bottom-0 right-0 size-4 bg-emerald-500 border-2 border-white rounded-full"
                title="Active account / ተግባራዊ መለያ"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-slate-900">
                  {user?.fullNameEn || 'Ministry Employee'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Shield className="w-3 h-3 text-emerald-700" />
                  {roleTitle}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <Building2 className="w-3 h-3 text-slate-500" />
                  FDRE MoA
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {ROLE_DESCRIPTIONS[role] || 'Authorized user of the MoA Asset Tracking System.'}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Full Name &bull; ሙሉ ስም</span>
                </span>
              </div>
              <div className="mt-1.5 font-semibold text-xs text-slate-900 truncate">
                {user?.fullNameEn || '—'}
              </div>
              {user?.fullNameAm && (
                <div className="text-[11px] text-slate-600 font-sans mt-0.5 truncate">
                  {user.fullNameAm}
                </div>
              )}
            </div>

            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sign-in Email &bull; ኢሜይል</span>
                </span>
                {user?.email && (
                  <button
                    type="button"
                    onClick={() => handleCopy(user.email, 'email')}
                    className="text-slate-400 hover:text-emerald-700 transition cursor-pointer p-0.5"
                    title="Copy email"
                  >
                    {copiedField === 'email' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <div className="mt-1.5 font-mono font-medium text-xs text-slate-900 truncate">
                {user?.email || '—'}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Primary authentication ID
              </div>
            </div>

            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium">
                <span className="flex items-center gap-1.5">
                  <IdCard className="w-3.5 h-3.5 text-slate-500" />
                  <span>Payroll ID &bull; የደመወዝ መለያ</span>
                </span>
                {user?.payrollId && (
                  <button
                    type="button"
                    onClick={() => handleCopy(user.payrollId, 'payrollId')}
                    className="text-slate-400 hover:text-emerald-700 transition cursor-pointer p-0.5"
                    title="Copy Payroll ID"
                  >
                    {copiedField === 'payrollId' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <div className="mt-1.5 font-mono font-semibold text-xs text-slate-900 truncate">
                {user?.payrollId || 'Not assigned'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                FDRE Civil Service identifier
              </div>
            </div>

            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Directorate &bull; የስራ ክፍል</span>
              </div>
              <div className="mt-1.5 font-semibold text-xs text-slate-900 truncate">
                {deptDisplay}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Assigned organizational unit
              </div>
            </div>

            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>Contact Phone &bull; ስልክ ቁጥር</span>
              </div>
              <div className="mt-1.5 font-mono text-xs text-slate-900 truncate">
                {user?.phone || 'Not recorded'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Official contact telephone
              </div>
            </div>

            <div className="rounded-md p-3.5 bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                <span>System Role &bull; የስርዓት ሚና</span>
              </div>
              <div className="mt-1.5 font-semibold text-xs text-emerald-800 truncate">
                {roleTitle}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>{user?.permissions?.length ? `${user.permissions.length} active permissions` : 'Standard role access'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Card 2: Security & Change Password ── */}
      <section className="rounded-md bg-white border border-slate-200 p-5 sm:p-6 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex items-start gap-3 pb-4 mb-4 border-b border-slate-100">
          <div className="size-9 rounded-[4px] bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Change Password &bull; የይለፍ ቃል መቀየሪያ</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your account sign-in password. Requires at least 8 characters, with letters and numbers.
            </p>
          </div>
        </div>

        <div className="max-w-md">
          <ChangePasswordForm
            onDone={() => {
              toast.success('Password updated', 'Use your new password next time you sign in.');
            }}
          />
        </div>
      </section>

      {/* ── Card 3: Active Session ── */}
      <section className="rounded-md bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-[4px] bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-900">
                Active Authenticated Session
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Signed in as <span className="font-mono text-emerald-800 font-semibold">{user?.email}</span> &bull; Security token valid
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-[4px] text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/90 border border-rose-200 transition cursor-pointer shrink-0 self-start sm:self-center shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-600" />
            <span>Sign out</span>
          </button>
        </div>
      </section>

      <p
        className="text-center text-[11px] font-mono text-slate-400 pt-2"
        title={APP_COMMIT ? `Commit ${APP_COMMIT}` : undefined}
      >
        FDRE Ministry of Agriculture &bull; Asset Tracking System &bull; Version {APP_VERSION}
      </p>
    </div>
  );
};
