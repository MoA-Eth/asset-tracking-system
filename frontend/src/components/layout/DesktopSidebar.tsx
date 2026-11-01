import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, ChevronDown, ChevronRight, User, LogOut, Shield, Users } from 'lucide-react';
import { UserRole } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';
import { SETTINGS_NAV, getSettingsGroups, getNavSections, NavItem } from './navigation';
import { MoaLogo } from '../ui/MoaLogo';
import { APP_COMMIT, APP_VERSION } from '../../version';
import sidebarBgUrl from '../../assets/sidebar-bg.png';

interface DesktopSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  pendingApprovalsCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ROLE_TITLES: Partial<Record<UserRole, string>> = {
  [UserRole.SUPER_ADMIN]: 'Super Administrator',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.EMPLOYEE]: 'Employee',
  [UserRole.DEPARTMENT_HEAD]: 'Directorate Head',
  [UserRole.CHIEF_DIRECTOR]: 'Chief Director',
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

/** Gold vertical indicator marking the current page */
const ActiveBar: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <span
    aria-hidden="true"
    className={`absolute ${
      collapsed ? 'left-1' : 'left-1.5'
    } top-1/2 -translate-y-1/2 h-6 w-1.5 rounded-full bg-[#FCDD09] shadow-[0_0_8px_rgba(252,221,9,0.5)]`}
  />
);

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount = 0,
  collapsed,
  onToggleCollapse,
}) => {
  const { user, role, logout, canAccessTab } = useAuth();
  const isSettingsActive = activeTab.startsWith('settings');
  // The Settings group stays as it was left between visits; storage can be unavailable
  const [settingsOpen, setSettingsOpenState] = useState<boolean>(() => {
    if (isSettingsActive) return true;
    try {
      return localStorage.getItem('moa_settings_open') === '1';
    } catch {
      return false;
    }
  });
  const setSettingsOpen = (next: boolean | ((open: boolean) => boolean)) => {
    setSettingsOpenState((open) => {
      const value = typeof next === 'function' ? next(open) : next;
      try {
        localStorage.setItem('moa_settings_open', value ? '1' : '0');
      } catch {
        // The choice just isn't remembered
      }
      return value;
    });
  };
  // A fast label beside the rail when it is collapsed (the browser's own tooltip is slow)
  const [tip, setTip] = useState<{ label: string; hint?: string; top: number; left: number } | null>(null);
  const showTip = (el: HTMLElement, label: string, hint?: string) => {
    if (!collapsed) return;
    const r = el.getBoundingClientRect();
    setTip({ label, hint, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isSettingsActive) setSettingsOpen(true);
  }, [isSettingsActive]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showUserMenu]);

  const sections = getNavSections(user?.allowedTabs);
  const settingsGroups = getSettingsGroups(user?.allowedTabs);

  const itemClass = (isActive: boolean) =>
    `group relative w-full flex items-center ${
      collapsed ? 'justify-center px-0 h-10' : 'gap-3 px-3 py-2.5'
    } rounded-2xl text-[13px] transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
      isActive
        ? 'bg-white/[0.13] border border-white/20 text-white font-semibold shadow-sm backdrop-blur-xs'
        : 'text-white/90 hover:bg-white/[0.08] hover:text-white font-medium border border-transparent'
    }`;

  const iconClass = (isActive: boolean) =>
    `w-5 h-5 shrink-0 transition-colors ${
      isActive ? 'text-[#FCDD09]' : 'text-white/85 group-hover:text-white'
    }`;

  const renderItem = (item: NavItem) => {
    const isActive = activeTab === item.id;
    const Icon = item.icon;
    const showCount = item.showsPendingCount && pendingApprovalsCount > 0;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={itemClass(isActive)}
        title={collapsed ? undefined : item.hint}
        aria-label={collapsed ? item.label : undefined}
        onMouseEnter={(e) => showTip(e.currentTarget, item.label, item.hint)}
        onMouseLeave={hideTip}
        onFocus={(e) => showTip(e.currentTarget, item.label, item.hint)}
        onBlur={hideTip}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && <ActiveBar collapsed={collapsed} />}
        <Icon className={iconClass(isActive)} />
        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {!collapsed && item.formTag && !showCount && (
          <span className="text-[10px] font-mono font-medium text-emerald-50/55 group-hover:text-emerald-200/60">
            {item.formTag}
          </span>
        )}
        {showCount && (
          <span
            className={`${
              collapsed ? 'absolute top-1 right-1' : ''
            } size-5 min-w-[20px] h-5 rounded-full bg-[#FCDD09] text-slate-900 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs leading-none`}
          >
            {pendingApprovalsCount}
          </span>
        )}
        {!collapsed && isActive && (
          <ChevronRight className="w-4 h-4 text-white/80 shrink-0" />
        )}
      </button>
    );
  };

  return (
    <aside
      className={`no-print hidden lg:flex flex-col border-r border-black/20 text-white shadow-xl transition-all duration-300 select-none z-30 shrink-0 h-full overflow-hidden relative bg-cover bg-no-repeat bg-bottom ${
        collapsed ? 'w-14' : 'w-56'
      }`}
      style={{
        backgroundImage: `url(${sidebarBgUrl})`,
        backgroundColor: '#086034',
      }}
    >
      {/* Brand Header */}
      <div className={`h-[61px] px-3 border-b border-white/[0.08] flex items-center shrink-0 relative z-10 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={collapsed ? onToggleCollapse : undefined}
            className={`w-9 h-9 flex items-center justify-center shrink-0 transition-transform ${
              collapsed ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
            }`}
            title={collapsed ? 'Expand sidebar' : undefined}
            aria-label={collapsed ? 'Expand sidebar' : 'MoA ATS'}
          >
            <MoaLogo className="w-8 h-8 drop-shadow-md" alt="MoA ATS" />
          </button>

          {!collapsed && (
            <div className="min-w-0" title={APP_COMMIT ? `v${APP_VERSION} (${APP_COMMIT})` : `v${APP_VERSION}`}>
              <span className="block font-bold text-sm text-white tracking-tight">
                MoA ATS
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5 relative z-10" aria-label="Main navigation">
        <div className="space-y-1">
          {sections.map((section) => (
            <div key={section.id} className="space-y-1">
              {!collapsed && section.id === 'insights' && (
                <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                  <span className="text-[11px] font-medium text-emerald-100/70">{section.label}</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
              )}
              {section.items.map(renderItem)}
            </div>
          ))}
        </div>

        {settingsGroups.length > 0 && (
          <div className="mt-2">
            <div aria-hidden="true" className="mx-2 mb-2 border-t border-white/[0.08]" />

            <button
              onClick={() => (collapsed ? setActiveTab(settingsGroups[0].items[0].id) : setSettingsOpen((o) => !o))}
              className={itemClass(isSettingsActive && (collapsed || !settingsOpen))}
              aria-label={collapsed ? SETTINGS_NAV.label : undefined}
              onMouseEnter={(e) => showTip(e.currentTarget, SETTINGS_NAV.label)}
              onMouseLeave={hideTip}
              onFocus={(e) => showTip(e.currentTarget, SETTINGS_NAV.label)}
              onBlur={hideTip}
              aria-expanded={collapsed ? undefined : settingsOpen}
            >
              {isSettingsActive && (collapsed || !settingsOpen) && <ActiveBar collapsed={collapsed} />}
              <SETTINGS_NAV.icon className={iconClass(isSettingsActive)} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{SETTINGS_NAV.label}</span>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 text-emerald-50/70 transition-transform ${settingsOpen ? 'rotate-90 text-white' : ''}`}
                  />
                </>
              )}
            </button>

            {!collapsed && settingsOpen && (
              <div className="mt-1 ml-4 pl-2.5 border-l border-white/[0.08] space-y-1.5 pb-1">
                {settingsGroups.map((group) => (
                  <div key={group.label}>
                    <p className="px-2 pt-1 pb-1 text-[11px] font-medium text-emerald-50/70">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map((sub) => {
                        const isActive = activeTab === sub.id;
                        const SubIcon = sub.icon;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => setActiveTab(sub.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
                              isActive
                                ? 'bg-white/[0.13] text-white font-semibold'
                                : 'text-emerald-50/85 hover:bg-white/[0.07] hover:text-white font-medium'
                            }`}
                          >
                            <SubIcon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-[#FCDD09]' : 'text-emerald-50/70 group-hover:text-emerald-100'
                              }`}
                            />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Pinned Bottom User Profile Card */}
      {user && (
        <div className="px-2.5 pb-2.5 pt-1 relative shrink-0 z-10" ref={userMenuRef}>
          {/* Menu Trigger Button */}
          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-haspopup="true"
            aria-expanded={showUserMenu}
            aria-label={`Account menu for ${user.fullNameEn || ROLE_TITLES[role] || role}`}
            title={collapsed ? `${user.fullNameEn || 'Account'} (${ROLE_TITLES[role] || role})` : undefined}
            className={`group w-full flex items-center ${
              collapsed ? 'justify-center p-2' : 'gap-3 p-2.5'
            } rounded-2xl transition-all duration-200 cursor-pointer select-none text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
              showUserMenu
                ? 'bg-white/[0.18] border border-emerald-300/40 shadow-xl backdrop-blur-md'
                : 'bg-white/[0.10] hover:bg-white/[0.16] border border-white/20 hover:border-white/30 shadow-lg backdrop-blur-md'
            }`}
          >
            {/* Avatar Circle with Status Indicator */}
            <div className="relative shrink-0">
              <div className="size-9 rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 border border-white/30 text-white flex items-center justify-center font-bold text-xs shadow-md tracking-wider">
                {getInitials(user.fullNameEn || user.email)}
              </div>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-[#00FF87] ring-2 ring-emerald-950/60" />
            </div>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <span className="block font-semibold text-xs text-white truncate tracking-tight drop-shadow-xs">
                    {user.fullNameEn || ROLE_TITLES[role] || role}
                  </span>
                  <span className="block text-[11px] font-medium text-emerald-100/90 truncate mt-0.5">
                    {ROLE_TITLES[role] || role}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-white/90 group-hover:text-white shrink-0 transition-colors" />
              </>
            )}
          </button>

          {/* Upward-popping Account Dropdown Menu */}
          {showUserMenu && (
            <div
              role="menu"
              aria-label="User Account Menu"
              className={`absolute bottom-full mb-2 ${
                collapsed ? 'left-1 w-64' : 'left-2 right-2'
              } bg-moa-green-deep/95 border border-emerald-500/25 rounded-xl shadow-2xl z-50 overflow-hidden text-white backdrop-blur-2xl animate-fadeIn`}
              style={{
                boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(16, 185, 129, 0.12)',
              }}
            >
              {/* Header Info */}
              <div className="p-3.5 bg-gradient-to-b from-white/[0.07] to-transparent border-b border-white/[0.08] flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="size-10 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-800 border border-emerald-300/40 text-white flex items-center justify-center font-bold text-xs shadow-md">
                    {getInitials(user.fullNameEn || user.email)}
                  </div>
                  <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-moa-green-deep" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <span className="block font-bold text-xs text-white truncate">
                    {user.fullNameEn || ROLE_TITLES[role] || role}
                  </span>
                  {user.email && (
                    <span className="block text-[10px] text-emerald-200/70 font-mono truncate mt-0.5">
                      {user.email}
                    </span>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-[#FCDD09] border border-[#FCDD09]/30">
                      <Shield className="w-2.5 h-2.5" />
                      {ROLE_TITLES[role] || role}
                    </span>
                    {user.payrollId && (
                      <span className="text-[10px] text-emerald-50/70 font-mono">
                        ID: {user.payrollId}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1.5 space-y-0.5 text-xs">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    setActiveTab('settings-profile');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-emerald-50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
                >
                  <User className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Profile</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    setActiveTab('docs');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-emerald-50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
                >
                  <CircleHelp className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Help</span>
                </button>

                {Boolean(canAccessTab ? canAccessTab('settings-users') : user?.allowedTabs?.includes('settings-users')) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('settings-users');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-emerald-50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Users & Permissions</span>
                  </button>
                )}
              </div>

              {/* Sign out */}
              <div className="p-1.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="pointer-events-none fixed z-[70] -translate-y-1/2 rounded-[4px] bg-slate-900 px-2.5 py-1.5 text-white shadow-lg animate-fadeIn"
          >
            <span className="block text-xs font-semibold">{tip.label}</span>
            {tip.hint && <span className="block text-[10px] text-slate-300">{tip.hint}</span>}
          </div>,
          document.body,
        )}
    </aside>
  );
};
