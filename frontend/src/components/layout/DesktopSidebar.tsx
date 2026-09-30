import React from 'react';
import { LogOut } from 'lucide-react';
import { getNavigationGroups } from '../../utils/navigation';
import { navigationIcons } from './navigation-icons';
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
  const getRoleTitle = (r: UserRole): string => {
    switch (r) {
      case UserRole.SYSTEM_ADMIN:
        return 'System Administrator';
      case UserRole.MANAGER:
        return 'Manager';
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
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="#0A3F24"
                stroke="#FCDD09"
                strokeWidth="3"
              />
              <path
                d="M50 16 L50 82"
                stroke="#FCDD09"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
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

      <nav
        aria-label="Desktop navigation"
        className="p-3 space-y-5 overflow-y-auto flex-1 text-xs"
      >
        {getNavigationGroups(role).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2
              className={
                collapsed
                  ? 'sr-only'
                  : 'px-3 mb-2 text-[10px] uppercase tracking-wider font-bold text-emerald-200/50'
              }
            >
              {group.label}
            </h2>
            <div className="space-y-1">
              {group.pages.map((page) => {
                const Icon = navigationIcons[page.id];
                return (
                  <button
                    key={page.id}
                    onClick={() => setActiveTab(page.id)}
                    aria-label={page.label}
                    title={page.label}
                    aria-current={activeTab === page.id ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
                      activeTab === page.id
                        ? 'bg-[#11442B] text-white border-l-4 border-[#FCDD09]'
                        : 'text-emerald-100/75 hover:text-white hover:bg-[#0B2C1B]/80'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-amber-300" />
                    {!collapsed && (
                      <span className="flex-1 text-left">{page.label}</span>
                    )}
                    {page.id === 'approvals' &&
                      pendingApprovalsCount > 0 &&
                      !collapsed && (
                        <span className="px-1.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                          {pendingApprovalsCount}
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
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
                  <span className="font-mono text-amber-300/90 font-medium">
                    {user?.payrollId || 'MOA-AUTH'}
                  </span>
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
