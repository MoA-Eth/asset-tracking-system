import React, { useState } from 'react';
import {
  Home,
  PackagePlus,
  PackageMinus,
  Package,
  UserCheck,
  ArrowRightLeft,
  RotateCcw,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  LogOut,
  Users,
  Building,
  Warehouse,
  History,
  Boxes,
} from 'lucide-react';
import { UserRole } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';

interface DesktopSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  pendingApprovalsCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount = 0,
  collapsed,
  onToggleCollapse,
}) => {
  const { user, role, logout } = useAuth();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
    admin: activeTab.startsWith('settings'),
  }));

  React.useEffect(() => {
    if (activeTab.startsWith('settings')) {
      setOpenSections((prev) => ({ ...prev, admin: true }));
    }
  }, [activeTab]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getRoleTitle = (r: UserRole): string => {
    switch (r) {
      case UserRole.TOP_MANAGEMENT:
        return 'Executive Minister';
      case UserRole.DEPARTMENT_HEAD:
        return 'Directorate Head';
      case UserRole.TEAM_LEADER:
        return 'Team Leader';
      case UserRole.DATA_ENCODER:
        return 'Store Custodian';
      default:
        return 'Civil Officer';
    }
  };

  const getInitials = (name?: string): string => {
    if (!name) return 'MOA';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const roleTitle = getRoleTitle(role);

  return (
    <aside
      className={`no-print hidden lg:flex flex-col bg-[#071911] border-r border-[#04120C] text-white shadow-xl transition-all duration-300 select-none z-30 shrink-0 h-full overflow-hidden ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Official Ethiopian Ministry of Agriculture Brand Header */}
      <div
        className={`p-4 border-b border-emerald-900/40 flex items-center justify-between shrink-0 ${
          collapsed ? 'justify-center p-3' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={collapsed ? onToggleCollapse : undefined}
            className={`w-9 h-9 rounded-xl bg-gradient-to-br from-[#0F4A2B] to-[#062414] border border-amber-400/40 flex items-center justify-center p-1 shadow-md shrink-0 transition-transform ${
              collapsed ? 'hover:scale-105 cursor-pointer' : ''
            }`}
            title={collapsed ? 'Click to expand sidebar' : undefined}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
              <circle cx="50" cy="50" r="46" fill="#0A3F24" stroke="#FCDD09" strokeWidth="3" />
              <path d="M50 16 L50 82" stroke="#FCDD09" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M50 28 Q66 22 68 34 Q58 38 50 34" fill="#FCDD09" />
              <path d="M50 42 Q68 36 70 48 Q60 52 50 48" fill="#FCDD09" />
              <path d="M50 28 Q34 22 32 34 Q42 38 50 34" fill="#FCDD09" />
              <path d="M50 42 Q32 36 30 48 Q40 52 50 48" fill="#FCDD09" />
              <circle cx="50" cy="50" r="4" fill="#FCDD09" />
            </svg>
          </button>

          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm text-white tracking-tight">
                  MoA<span className="text-[#FCDD09]">-AMS</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/90 truncate font-semibold">
                Ministry of Agriculture
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Items (Exact Layout matching User Mockup) */}
      <nav className="p-3 space-y-1.5 overflow-y-auto flex-1 text-xs">
        {/* 1. Dashboard (Top Management & System Admin) */}
        {(role === UserRole.TOP_MANAGEMENT || role === UserRole.SYSTEM_ADMIN) && (
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
          >
            <Home className="w-4 h-4 shrink-0 text-[#FCDD09]" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Dashboard</span>}
          </button>
        )}

        {/* Approvals Badge (Department Head & Team Leader) */}
        {(role === UserRole.DEPARTMENT_HEAD || role === UserRole.TEAM_LEADER) && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer relative ${
              activeTab === 'approvals'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Approvals</span>}
            {pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 shadow-xs shrink-0 animate-pulse">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}

        {/* 2. Stock-In (Model 19) */}
        {(role === UserRole.DATA_ENCODER || role === UserRole.SYSTEM_ADMIN) && (
          <button
            onClick={() => setActiveTab('stock-in')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'stock-in'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
            title="Stock-In (Model 19 / የዕቃ መረከቢያ)"
          >
            <PackagePlus className="w-4 h-4 shrink-0 text-emerald-400" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Stock-In</span>}
          </button>
        )}

        {/* 3. Stock-Out (Model 20) */}
        {(role === UserRole.DATA_ENCODER || role === UserRole.SYSTEM_ADMIN) && (
          <button
            onClick={() => setActiveTab('stock-out')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'stock-out'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
            title="Stock-Out (Model 20 / የዕቃ ወጪ ማዘዣ)"
          >
            <PackageMinus className="w-4 h-4 shrink-0 text-amber-400" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Stock-Out</span>}
          </button>
        )}

        {/* 3. Transfer Asset (Includes Custody Transfers & Model 22 Returns) */}
        {(role === UserRole.DATA_ENCODER || role === UserRole.SYSTEM_ADMIN) && (
          <button
            onClick={() => setActiveTab('transfer-asset')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'transfer-asset'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0 text-amber-300" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Asset Transfer</span>}
          </button>
        )}

        {/* 4. Reports */}
        {(role === UserRole.SYSTEM_ADMIN || role === UserRole.DEPARTMENT_HEAD || role === UserRole.TEAM_LEADER) && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Reports</span>}
          </button>
        )}

        {/* 5. Audit Log */}
        {(role === UserRole.SYSTEM_ADMIN || role === UserRole.DEPARTMENT_HEAD || role === UserRole.TEAM_LEADER) && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-[#11442B] text-white shadow-xs font-bold border-l-4 border-[#FCDD09]'
                : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
            {!collapsed && <span className="flex-1 text-left font-semibold">Audit Log</span>}
          </button>
        )}

        {/* 6. Settings Dropdown (Users, Roles, Employees, Departments, Locations, Stores) */}
        {(role === UserRole.SYSTEM_ADMIN || role === UserRole.DEPARTMENT_HEAD || role === UserRole.DATA_ENCODER) && (
          <div>
            <button
              onClick={() => toggleSection('admin')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-emerald-100/75 hover:bg-[#0B2C1B]/80 hover:text-white transition cursor-pointer font-semibold"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-300" />
                {!collapsed && <span>Settings</span>}
              </div>
              {!collapsed && (
                openSections.admin ? <ChevronDown className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>
            {!collapsed && openSections.admin && (
              <div className="pl-9 pr-2 py-1 space-y-1 text-emerald-200/80">
                <button
                  onClick={() => setActiveTab('settings-users')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings-users' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Users
                </button>
                <button
                  onClick={() => setActiveTab('settings-matrix')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings-matrix' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Roles
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Employees
                </button>
                <button
                  onClick={() => setActiveTab('settings-config')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings-config' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Departments
                </button>
                <button
                  onClick={() => setActiveTab('settings-config')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings-config' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Locations
                </button>
                <button
                  onClick={() => setActiveTab('settings-config')}
                  className={`w-full text-left py-1 px-2 rounded-lg transition cursor-pointer font-medium ${
                    activeTab === 'settings-config' ? 'bg-[#11442B] text-white font-bold' : 'hover:bg-[#0B2C1B]/60 hover:text-white'
                  }`}
                >
                  Stores
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Official Pinned User Profile and Sign-Out at Bottom */}
      <div className="p-3 border-t border-emerald-900/50 bg-[#05160E] shrink-0">
        {!collapsed ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#125835] to-[#258957] border border-amber-400/40 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {getInitials(user?.fullNameEn)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate block">
                    {user?.fullNameEn || roleTitle}
                  </span>
                  <div
                    className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"
                    title="Active Authenticated Session"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/70 truncate">
                  <span className="font-mono text-amber-300/90 font-medium">{user?.payrollId || 'MOA-AUTH'}</span>
                  <span>•</span>
                  <span>{roleTitle}</span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 hover:text-white text-xs font-semibold transition cursor-pointer"
              title="Sign Out of AMS Portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#125835] to-[#258957] border border-amber-400/40 text-white flex items-center justify-center font-bold text-xs"
              title={`${user?.fullNameEn || roleTitle} (${roleTitle})`}
            >
              {getInitials(user?.fullNameEn)}
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-red-400 hover:text-red-200 hover:bg-red-950/50 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

