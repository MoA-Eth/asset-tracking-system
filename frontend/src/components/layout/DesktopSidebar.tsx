import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronsUpDown, User, LogOut, Shield, Users } from 'lucide-react';
import { UserRole } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';
import { SETTINGS_NAV, getSettingsGroups, getNavSections, NavItem } from './navigation';
import { MoaLogo } from '../ui/MoaLogo';

interface DesktopSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  pendingApprovalsCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

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

/** Gold bar marking the current page, echoing the emblem colour. */
const ActiveBar: React.FC = () => (
  <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#FCDD09]" />
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
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);
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
    `group relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'} py-1.5 rounded-lg text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
      isActive
        ? 'bg-white/[0.09] text-white font-semibold'
        : 'text-emerald-50/70 hover:bg-white/[0.05] hover:text-white font-medium'
    }`;

  const iconClass = (isActive: boolean) =>
    `w-[18px] h-[18px] shrink-0 transition-colors ${
      isActive ? 'text-[#FCDD09]' : 'text-emerald-200/55 group-hover:text-emerald-100'
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
        title={collapsed ? item.label : item.hint}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && <ActiveBar />}
        <Icon className={iconClass(isActive)} />
        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {!collapsed && item.formTag && !showCount && (
          <span className="text-[10px] font-mono font-medium text-emerald-200/35 group-hover:text-emerald-200/60">
            {item.formTag}
          </span>
        )}
        {showCount && (
          <span
            className={`${
              collapsed ? 'absolute top-0.5 right-1.5' : ''
            } min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-5 text-center bg-[#FCDD09] text-emerald-950`}
          >
            {pendingApprovalsCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`no-print hidden lg:flex flex-col bg-gradient-to-b from-[#0B3D25] via-[#08301D] to-[#062414] border-r border-black/20 text-white shadow-xl transition-all duration-300 select-none z-30 shrink-0 h-full overflow-hidden ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Brand */}
      <div className={`h-[61px] px-3 border-b border-white/[0.07] flex items-center shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={collapsed ? onToggleCollapse : undefined}
            className={`w-9 h-9 flex items-center justify-center shrink-0 transition-transform ${
              collapsed ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
            }`}
            title={collapsed ? 'Expand sidebar' : undefined}
            aria-label={collapsed ? 'Expand sidebar' : 'MoA-AMS'}
          >
            <MoaLogo className="w-8 h-8 drop-shadow-md" alt="MoA-AMS" />
          </button>

          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <span className="block font-extrabold text-sm text-white tracking-tight">
                MoA<span className="text-[#FCDD09]">-AMS</span>
              </span>
              <span className="block text-[10px] text-emerald-100/60 truncate">Asset Tracking System</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5" aria-label="Main navigation">
        {sections.map((section, idx) => (
          <div key={section.id} className={idx > 0 ? 'mt-4' : ''}>
            {collapsed ? (
              idx > 0 && <div aria-hidden="true" className="mx-3 mb-3 border-t border-white/[0.07]" />
            ) : (
              section.items.length > 1 && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/40">
                  {section.label}
                </p>
              )
            )}
            <div className="space-y-0.5">{section.items.map(renderItem)}</div>
          </div>
        ))}

        {settingsGroups.length > 0 && (
          <div className="mt-4">
            {collapsed && <div aria-hidden="true" className="mx-3 mb-3 border-t border-white/[0.07]" />}

            <button
              onClick={() => (collapsed ? setActiveTab(settingsGroups[0].items[0].id) : setSettingsOpen((o) => !o))}
              className={itemClass(isSettingsActive && (collapsed || !settingsOpen))}
              title={collapsed ? SETTINGS_NAV.label : undefined}
              aria-expanded={collapsed ? undefined : settingsOpen}
            >
              {isSettingsActive && (collapsed || !settingsOpen) && <ActiveBar />}
              <SETTINGS_NAV.icon className={iconClass(isSettingsActive)} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{SETTINGS_NAV.label}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-emerald-200/50 transition-transform ${settingsOpen ? '' : '-rotate-90'}`}
                  />
                </>
              )}
            </button>

            {!collapsed && settingsOpen && (
              <div className="mt-1 ml-[21px] pl-3 border-l border-white/[0.08] space-y-2.5 pb-1">
                {settingsGroups.map((group) => (
                  <div key={group.label}>
                    <p className="px-2 pt-1 pb-1 text-[10px] font-medium text-emerald-200/35">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map((sub) => {
                        const isActive = activeTab === sub.id;
                        const SubIcon = sub.icon;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => setActiveTab(sub.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
                              isActive
                                ? 'bg-white/[0.09] text-white font-semibold'
                                : 'text-emerald-50/65 hover:bg-white/[0.05] hover:text-white font-medium'
                            }`}
                          >
                            <SubIcon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-[#FCDD09]' : 'text-emerald-200/45 group-hover:text-emerald-100'
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
        <div className="p-2 border-t border-white/[0.08] relative shrink-0" ref={userMenuRef}>
          {/* Menu Trigger Button */}
          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-haspopup="true"
            aria-expanded={showUserMenu}
            aria-label={`Account menu for ${user.fullNameEn || ROLE_TITLES[role] || role}`}
            title={collapsed ? `${user.fullNameEn || 'Account'} (${ROLE_TITLES[role] || role})` : undefined}
            className={`w-full flex items-center ${
              collapsed ? 'justify-center p-1.5' : 'gap-2.5 p-2'
            } rounded-xl transition-all cursor-pointer select-none text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCDD09]/60 ${
              showUserMenu
                ? 'bg-black/40 border border-white/15 shadow-inner'
                : 'bg-black/25 border border-white/10 hover:bg-black/35 hover:border-white/20 shadow-2xs'
            }`}
          >
            {/* Avatar Circle */}
            <div className="size-9 rounded-full bg-emerald-600 border border-emerald-400/40 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {getInitials(user.fullNameEn || user.email)}
            </div>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <span className="block font-semibold text-xs text-white truncate">
                    {user.fullNameEn || ROLE_TITLES[role] || role}
                  </span>
                  <span className="block text-[10px] text-emerald-200/60 truncate mt-0.5">
                    {ROLE_TITLES[role] || role}
                  </span>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-emerald-200/40 group-hover:text-emerald-100 shrink-0 transition-colors" />
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
              } bg-[#0A2E1D] border border-emerald-500/30 rounded-2xl shadow-2xl z-50 overflow-hidden text-white backdrop-blur-xl animate-fadeIn`}
              style={{
                boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 20px rgba(16, 185, 129, 0.15)',
              }}
            >
              {/* Header Info */}
              <div className="p-3 bg-white/[0.04] border-b border-white/[0.08] flex items-start gap-2.5">
                <div className="size-9 rounded-full bg-emerald-600 border border-emerald-400/50 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {getInitials(user.fullNameEn || user.email)}
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
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-[#FCDD09] border border-[#FCDD09]/30">
                      <Shield className="w-2.5 h-2.5" />
                      {ROLE_TITLES[role] || role}
                    </span>
                    {user.payrollId && (
                      <span className="text-[9px] text-emerald-200/50 font-mono">
                        ID: {user.payrollId}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1 space-y-0.5 text-xs">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    setActiveTab('settings-profile');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-emerald-50 hover:text-white hover:bg-white/[0.08] rounded-xl transition cursor-pointer"
                >
                  <User className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Profile</span>
                </button>

                {Boolean(canAccessTab ? canAccessTab('settings-users') : user?.allowedTabs?.includes('settings-users')) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('settings-users');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-emerald-50 hover:text-white hover:bg-white/[0.08] rounded-xl transition cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Users & Permissions</span>
                  </button>
                )}
              </div>

              {/* Sign out */}
              <div className="p-1 border-t border-white/[0.08]">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded-xl transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
