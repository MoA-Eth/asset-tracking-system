import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMobileNavItems } from './navigation';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user } = useAuth();
  const visibleTabs = getMobileNavItems(user?.allowedTabs).slice(0, 5);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 mobile-nav-bar px-2 shadow-lg pb-[env(safe-area-inset-bottom)]"
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
              className={`relative flex-1 pt-2.5 pb-2 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[52px] cursor-pointer ${
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
      </div>
    </nav>
  );
};
