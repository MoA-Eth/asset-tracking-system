import React from 'react';
import {
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  FileCheck2,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/asset-management';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { role } = useAuth();

  const allTabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: [UserRole.TOP_MANAGEMENT, UserRole.SYSTEM_ADMIN],
    },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: FileCheck2,
      roles: [UserRole.DEPARTMENT_HEAD, UserRole.TEAM_LEADER],
    },
    {
      id: 'stock-in',
      label: 'Stock-In',
      icon: PackagePlus,
      roles: [UserRole.DATA_ENCODER],
    },
    {
      id: 'stock-out',
      label: 'Stock-Out',
      icon: PackageMinus,
      roles: [UserRole.DATA_ENCODER],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileSpreadsheet,
      roles: [UserRole.SYSTEM_ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.DATA_ENCODER, UserRole.TEAM_LEADER],
    },
    {
      id: 'audit',
      label: 'Audit',
      icon: ShieldCheck,
      roles: [UserRole.SYSTEM_ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.TEAM_LEADER],
    },
  ];

  const visibleTabs = allTabs.filter((t) => t.roles.includes(role)).slice(0, 4);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 mobile-nav-bar px-2 shadow-lg">
      <div className="flex items-center justify-around">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 flex flex-col items-center justify-center transition-colors min-h-[44px] cursor-pointer ${
                isActive ? 'text-emerald-800 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5] text-emerald-800' : 'stroke-[1.75]'}`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
