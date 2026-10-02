import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { getNavSections, getSettingsGroups } from './navigation';

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onNavigate: (tab: string) => void;
}

/** Full navigation stays available when the sidebar does not fit. */
export const MobileNavigation: React.FC<MobileNavigationProps> = ({ isOpen, onClose, activeTab, onNavigate }) => {
  const { user, logout } = useAuth();
  const groups = [...getNavSections(user?.allowedTabs), ...getSettingsGroups(user?.allowedTabs)];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Navigation" size="sm">
      <nav aria-label="All pages" className="space-y-4">
        {groups.map((group) => (
          <section key={group.label}>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</h3>
            {group.items.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { onNavigate(id); onClose(); }}
                aria-current={id === activeTab ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${id === activeTab ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                <Icon className="h-4 w-4 shrink-0" />{label}
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-sm font-semibold text-slate-900 wrap-anywhere">{user?.fullNameEn}</p>
        <p className="mt-1 text-xs text-slate-500 wrap-anywhere">{user?.email}</p>
        <button onClick={() => { onClose(); logout(); }} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          <LogOut className="h-4 w-4" />Sign out
        </button>
      </div>
    </Modal>
  );
};
