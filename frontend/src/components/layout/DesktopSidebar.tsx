import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
  const { user } = useAuth();
  const isSettingsActive = activeTab.startsWith('settings');
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  React.useEffect(() => {
    if (isSettingsActive) setSettingsOpen(true);
  }, [isSettingsActive]);

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
    </aside>
  );
};
