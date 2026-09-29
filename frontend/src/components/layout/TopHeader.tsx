import React, { useState, useEffect, useRef } from 'react';
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
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { getTodayGcAndEc } from '../../utils/eth-date';
import { UserRole, TransactionApproval, TransactionType, ApprovalStatus } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<TransactionApproval[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const dateInfo = getTodayGcAndEc();

  const fetchNotificationItems = async () => {
    try {
      setLoadingNotifications(true);
      const data = await api.getApprovals(ApprovalStatus.PENDING);
      let relevant = data;
      if (role === UserRole.TEAM_LEADER) {
        relevant = data.filter((a) => (a.currentStage ?? 1) === 1);
      } else if (role === UserRole.DEPARTMENT_HEAD) {
        relevant = data.filter((a) => a.currentStage === 2);
      }
      setNotifications(relevant);
    } catch {
      // ignore
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (showNotifications) {
      fetchNotificationItems();
    }
  }, [showNotifications, role]);

  useEffect(() => {
    const handleUpdate = () => {
      if (showNotifications) {
        fetchNotificationItems();
      }
    };
    window.addEventListener('moa_approvals_updated', handleUpdate);
    return () => window.removeEventListener('moa_approvals_updated', handleUpdate);
  }, [showNotifications, role]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

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
        return { title: 'Asset Transfer', am: 'የንብረት ዝውውር እና መመለሻ (ሞዴል 22)', icon: ArrowRightLeft, iconColor: 'text-amber-600' };
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

        {/* Pending Approvals Bell & Interactive Notification Popover */}
        {(role === UserRole.DEPARTMENT_HEAD || role === UserRole.TEAM_LEADER || role === UserRole.SYSTEM_ADMIN) && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                setShowNotifications((prev) => !prev);
              }}
              className={`relative p-2 rounded-lg transition cursor-pointer ${
                showNotifications
                  ? 'bg-amber-100/70 text-slate-900 border border-amber-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Pending Approvals & Notifications"
            >
              <Bell className="w-4 h-4" />
              {pendingApprovalsCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center animate-bounce shadow-xs">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>

            {/* Floating Notification Popover */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-fadeIn text-slate-800">
                {/* Header */}
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-xs text-slate-900">Notifications</span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                      {notifications.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Notification Items List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {loadingNotifications ? (
                    <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-amber-500" />
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="py-8 px-4 text-center space-y-2">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">All Caught Up!</h4>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        No new notifications at this time.
                      </p>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const isStockIn = item.transactionType === TransactionType.STOCK_IN;
                      const isStockOut = item.transactionType === TransactionType.STOCK_OUT;
                      const isTransfer = item.transactionType === TransactionType.TRANSFER;
                      const stage = item.currentStage ?? 1;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setShowNotifications(false);
                            onNavigate('approvals');
                          }}
                          className="p-3 hover:bg-slate-50 transition cursor-pointer flex items-start gap-3 select-none"
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                              isStockIn
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isStockOut
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            {isStockIn && <PackagePlus className="w-3.5 h-3.5" />}
                            {isStockOut && <PackageMinus className="w-3.5 h-3.5" />}
                            {isTransfer && <ArrowRightLeft className="w-3.5 h-3.5" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase border ${
                                  stage === 1
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-purple-100 text-purple-900 border-purple-300'
                                }`}
                              >
                                {stage === 1 ? 'Stage 1: Team Leader' : 'Stage 2: Dept Head'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {item.ifmisSlipDateEc} E.C.
                              </span>
                            </div>

                            <p className="text-xs font-bold text-slate-900 truncate">
                              {item.itemName}
                            </p>
                            <p className="text-[10px] text-emerald-700 font-mono font-semibold">
                              {item.itemCode} • Slip: {item.ifmisSlipNumber}
                            </p>
                            {item.purposeOrRemarks && (
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                {item.purposeOrRemarks}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      onNavigate('approvals');
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>View All Notifications</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

