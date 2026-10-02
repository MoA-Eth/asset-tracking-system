import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMobileNavItems } from './navigation';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenNavigation: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenNavigation,
}) => {
  const { user } = useAuth();
  const tabs = getMobileNavItems(user?.allowedTabs);
  const hasMore = tabs.length > 5;
  const visibleTabs = hasMore ? tabs.slice(0, 4) : tabs;
  const moreActive = hasMore && tabs.slice(4).some((tab) => tab.matches(activeTab));

  return (
    <nav
      className="lg:hidden shrink-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 mobile-nav-bar px-2 shadow-lg"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.matches(activeTab);

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-w-0 flex-1 pt-2.5 pb-2 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[52px] cursor-pointer ${
                isActive ? 'text-emerald-800 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {isActive && (
                <span aria-hidden="true" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-emerald-700" />
              )}
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
        {hasMore && (
          <button onClick={onOpenNavigation} aria-label="More pages" aria-haspopup="dialog"
            className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${moreActive ? 'font-semibold text-emerald-800' : 'text-slate-500'}`}>
            <MoreHorizontal className="h-5 w-5" />More
          </button>
        )}
      </div>
    </nav>
  );
};
