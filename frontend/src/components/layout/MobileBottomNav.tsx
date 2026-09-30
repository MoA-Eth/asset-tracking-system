import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getNavigationGroups,
  getNavigationPages,
} from '../../utils/navigation';
import { navigationIcons } from './navigation-icons';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { role } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pages = getNavigationPages(role);
  const hasMore = pages.length > 4;
  const primaryPages = hasMore ? pages.slice(0, 3) : pages;

  useEffect(() => {
    setMoreOpen(false);
  }, [role, activeTab]);
  useEffect(() => {
    if (moreOpen) closeButton.current?.focus();
  }, [moreOpen]);

  const closeMore = () => {
    setMoreOpen(false);
    moreButton.current?.focus();
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 mobile-nav-bar px-2 shadow-lg"
    >
      {moreOpen && (
        <div
          id="mobile-pages"
          aria-label="All pages"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeMore();
          }}
          className="absolute bottom-full left-0 right-0 max-h-[70dvh] overflow-y-auto bg-white border-t border-slate-200 shadow-xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-900">All pages</span>
            <button
              ref={closeButton}
              onClick={closeMore}
              aria-label="Close navigation"
              className="p-2 text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {getNavigationGroups(role).map((group) => (
            <section
              key={group.label}
              aria-label={group.label}
              className="mb-4"
            >
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                {group.label}
              </h2>
              {group.pages.map((page) => {
                const Icon = navigationIcons[page.id];
                return (
                  <button
                    key={page.id}
                    aria-current={activeTab === page.id ? 'page' : undefined}
                    onClick={() => {
                      setActiveTab(page.id);
                      closeMore();
                    }}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 text-sm text-left ${activeTab === page.id ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{page.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <div className="flex items-center justify-around">
        {primaryPages.map((page) => {
          const Icon = navigationIcons[page.id];
          const isActive = activeTab === page.id;
          return (
            <button
              key={page.id}
              onClick={() => {
                setActiveTab(page.id);
                setMoreOpen(false);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 py-2 flex flex-col items-center justify-center min-h-[44px] ${isActive ? 'text-emerald-800 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight">{page.label}</span>
            </button>
          );
        })}
        {hasMore && (
          <button
            ref={moreButton}
            aria-expanded={moreOpen}
            aria-controls="mobile-pages"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex-1 py-2 flex flex-col items-center justify-center min-h-[44px] ${moreOpen || !primaryPages.some((page) => page.id === activeTab) ? 'text-emerald-800 font-bold' : 'text-slate-500'}`}
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">More</span>
          </button>
        )}
      </div>
    </nav>
  );
};
