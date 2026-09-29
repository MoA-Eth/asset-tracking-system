import React, { useState } from 'react';
import {
  Calendar,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Building2,
  UserCheck2,
  LogOut,
  PackagePlus,
  PackageMinus,
  LayoutDashboard,
  FileCheck2,
  ShieldCheck,
  FileSpreadsheet,
  Settings,
  ArrowRightLeft,
} from 'lucide-react';
import { getTodayGcAndEc } from '../../utils/eth-date';
import { UserRole } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';

interface TopHeaderProps {
  activeTab: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentRole?: UserRole;
  setCurrentRole?: (role: UserRole) => void;
  onNavigate: (tab: string) => void;
  selectedCenter: string;
  setSelectedCenter: (center: string) => void;
  pendingApprovalsCount?: number;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  sidebarCollapsed,
  onToggleSidebar,
  onNavigate,
  selectedCenter,
  setSelectedCenter,
  pendingApprovalsCount = 0,
}) => {
  const { user, role, logout } = useAuth();
  const [showAmDate, setShowAmDate] = useState(false);
  const dateInfo = getTodayGcAndEc();

  const getPageInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Dashboard', am: 'የንብረትና የመጋዘን ክምችት መከታተያ', icon: LayoutDashboard, iconColor: 'text-emerald-700' };
      case 'stock-in':
        return { title: 'Stock-In', am: 'የዕቃ መረከቢያ (ሞዴል 19)', icon: PackagePlus, iconColor: 'text-emerald-700' };
      case 'stock-out':
        return { title: 'Stock-Out', am: 'የዕቃ ወጪ ማዘዣ እና መረከቢያ (ሞዴል 20)', icon: PackageMinus, iconColor: 'text-blue-700' };
      case 'approvals':
        return { title: 'Approvals', am: 'የማረጋገጫና ፈቃድ መስጫ', icon: FileCheck2, iconColor: 'text-amber-600' };
      case 'audit':
        return { title: 'Audit Logs', am: 'የኦዲት መዝገብ', icon: ShieldCheck, iconColor: 'text-purple-700' };
      case 'reports':
        return { title: 'Reports', am: 'የሪፖርት መዝገብ', icon: FileSpreadsheet, iconColor: 'text-emerald-700' };
      case 'transfer-asset':
        return { title: 'Transfer Asset', am: 'የንብረት ዝውውር እና መመለሻ (ሞዴል 22)', icon: ArrowRightLeft, iconColor: 'text-amber-600' };
      case 'settings':
        return { title: 'Settings & Permissions', am: 'ቅንብሮች እና የስርዓት መቆጣጠሪያ', icon: Settings, iconColor: 'text-emerald-700' };
      default:
        return { title: 'AMS Portal', am: 'የግብርና ሚኒስቴር', icon: LayoutDashboard, iconColor: 'text-emerald-700' };
    }
  };

  const pageInfo = getPageInfo();
  const PageIcon = pageInfo.icon;

  return (
    <header className="no-print bg-white border-b border-slate-200/90 sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Left: Sidebar Toggle & Page Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex items-center justify-center p-2 shrink-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-5 h-5 text-emerald-800 shrink-0" />
          ) : (
            <PanelLeftClose className="w-5 h-5 shrink-0" />
          )}
        </button>

        {/* Vertical Separator line between minimizer and page title */}
        <div className="hidden lg:block w-px h-5 bg-slate-200 shrink-0" />

        {/* Mobile Mini Emblem */}
        <div className="lg:hidden flex items-center shrink-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-900 border border-amber-400/40 flex items-center justify-center p-0.5">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="46" fill="#0A3F24" stroke="#FCDD09" strokeWidth="4" />
              <path d="M50 16 L50 82" stroke="#FCDD09" strokeWidth="4" />
              <path d="M50 28 Q66 22 68 34 Q58 38 50 34" fill="#FCDD09" />
              <path d="M50 42 Q68 36 70 48 Q60 52 50 48" fill="#FCDD09" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <PageIcon className={`w-5 h-5 ${pageInfo.iconColor} shrink-0`} />
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight whitespace-nowrap truncate">
            {pageInfo.title}
          </h1>
          <span className="text-xs text-slate-400 font-amharic hidden md:inline whitespace-nowrap truncate">
            • {pageInfo.am}
          </span>
        </div>
      </div>

      {/* Right: Clean, Uncluttered Controls */}
      <div className="flex items-center gap-2.5 text-xs shrink-0">
        {/* Quick Stock Action Shortcuts for Store Custodians */}
        {role === UserRole.DATA_ENCODER && (
          <div className="hidden xl:flex items-center gap-1.5">
            <button
              onClick={() => onNavigate('stock-in')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                activeTab === 'stock-in'
                  ? 'bg-emerald-700 text-white border-emerald-800'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300/80'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>+ Stock-In</span>
            </button>
            <button
              onClick={() => onNavigate('stock-out')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                activeTab === 'stock-out'
                  ? 'bg-blue-700 text-white border-blue-800'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300/80'
              }`}
            >
              <PackageMinus className="w-3.5 h-3.5" />
              <span>- Stock-Out</span>
            </button>
          </div>
        )}

        {/* Store Center Scope Selector */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
          <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <select
            value={selectedCenter}
            onChange={(e) => setSelectedCenter(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1"
          >
            <option value="ALL">All Centers / Stores</option>
            <option value="HQ_MEGENAGNA">Central HQ Store (Megenagna)</option>
            <option value="CMC_DEPOT">CMC Machinery Depot</option>
            <option value="MELKASSA_ARC">Melkassa ARC</option>
            <option value="KULUMSA_ARC">Kulumsa ARC</option>
            <option value="HOLETA_ARC">Holeta ARC</option>
          </select>
        </div>

        {/* Pending Approvals Bell (For Authorizing Role - Department Head) */}
        {role === UserRole.DEPARTMENT_HEAD && (
          <button
            onClick={() => onNavigate('approvals')}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="Pending Approvals"
          >
            <Bell className="w-4 h-4" />
            {pendingApprovalsCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center animate-bounce shadow-xs">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
