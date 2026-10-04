import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Building2,
  UserCheck2,
  LogOut,
  Boxes,
  PackagePlus,
  PackageMinus,
  LayoutDashboard,
  FileCheck2,
  ShieldCheck,
  FileSpreadsheet,
  Settings,
  Sliders,
  Shield,
  UserCheck,
  MapPin,
  Warehouse,
  ArrowRightLeft,
  X,
  CheckCircle2,
  CheckCheck,
  Clock,
  Users,
  User,
} from 'lucide-react';
import { getTodayGcAndEc } from '../../utils/eth-date';
import { UserRole, TransactionApproval, TransactionType, ApprovalStatus, Location } from '../../types/asset-management';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { GlobalSearch } from './GlobalSearch';

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

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  sidebarCollapsed,
  onToggleSidebar,
  onNavigate,
  selectedCenter,
  setSelectedCenter,
  pendingApprovalsCount = 0,
}) => {
  const { user, role, logout, canAccessTab } = useAuth();
  const [showAmDate, setShowAmDate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<TransactionApproval[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const key = `moa_read_notifs_${user?.id || 'default'}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Sync stored read IDs when user switches
  useEffect(() => {
    try {
      const key = `moa_read_notifs_${user?.id || 'default'}`;
      const stored = localStorage.getItem(key);
      setReadIds(stored ? JSON.parse(stored) : []);
    } catch {
      setReadIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    api.getLocations()
      .then((locs) => {
        if (locs && locs.length > 0) {
          setLocations(locs);
        }
      })
      .catch(() => {});
  }, []);

  const dateInfo = getTodayGcAndEc();

  const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
  const canAuthorize = user?.permissions?.includes('approvals.authorize') ?? (role === UserRole.DEPARTMENT_HEAD);
  const isApprover = canEndorse || canAuthorize;

  const fetchNotificationItems = async () => {
    try {
      setLoadingNotifications(true);
      const data = await api.getApprovals(ApprovalStatus.PENDING);
      let relevant = data;
      if (canEndorse && !canAuthorize) {
        relevant = data.filter((a) => (a.currentStage ?? 1) === 1);
      } else if (canAuthorize && !canEndorse) {
        relevant = data.filter((a) => a.currentStage === 2);
      } else if (!canEndorse && !canAuthorize) {
        relevant = [];
      }
      setNotifications(relevant);
    } catch {
      // ignore
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (isApprover) {
      fetchNotificationItems();
    }
  }, [isApprover, user?.id]);

  useEffect(() => {
    if (showNotifications && isApprover) {
      fetchNotificationItems();
    }
  }, [showNotifications, isApprover]);

  useEffect(() => {
    const handleUpdate = () => {
      if (isApprover) {
        fetchNotificationItems();
      }
    };
    window.addEventListener('moa_approvals_updated', handleUpdate);
    return () => window.removeEventListener('moa_approvals_updated', handleUpdate);
  }, [isApprover]);

  const markAsRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      try {
        localStorage.setItem(`moa_read_notifs_${user?.id || 'default'}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const markAllAsRead = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const allIds = notifications.map((n) => n.id);
    setReadIds((prev) => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem(`moa_read_notifs_${user?.id || 'default'}`, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;
  const displayBadgeCount = notifications.length > 0 ? unreadCount : pendingApprovalsCount;

  // Click outside and escape key listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };

    if (showNotifications || showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications, showUserMenu]);

  const getPageInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Dashboard', am: 'የንብረትና የመጋዘን ክምችት መከታተያ', icon: LayoutDashboard, iconColor: 'text-emerald-700' };
      case 'assets':
        return { title: 'Assets', am: 'ንብረቶች', icon: Boxes, iconColor: 'text-emerald-700' };
      case 'approvals':
        return { title: 'Approvals', am: 'የማረጋገጫና ፈቃድ መስጫ', icon: FileCheck2, iconColor: 'text-emerald-700' };
      case 'audit':
        return { title: 'Audit Log', am: 'የኦዲት መዝገብ', icon: ShieldCheck, iconColor: 'text-emerald-700' };
      case 'reports':
        return { title: 'Reports', am: 'የሪፖርት መዝገብ', icon: FileSpreadsheet, iconColor: 'text-emerald-700' };
      case 'settings-profile':
        return { title: 'Profile', am: 'የተጠቃሚ መገለጫ', icon: User, iconColor: 'text-emerald-700' };
      case 'settings-users':
        return { title: 'Users & Permissions', am: 'ተጠቃሚዎች እና ፈቃዶች', icon: Settings, iconColor: 'text-emerald-700' };
      case 'settings-roles':
        return { title: 'Roles', am: 'ሚናዎች', icon: Shield, iconColor: 'text-emerald-700' };
      case 'settings-employees':
        return { title: 'Employees', am: 'ሰራተኞች', icon: UserCheck, iconColor: 'text-emerald-700' };
      case 'settings-stores':
        return { title: 'Stores', am: 'መጋዘኖች', icon: Warehouse, iconColor: 'text-emerald-700' };
      case 'settings-system':
        return { title: 'System Settings', am: 'የስርዓት ቅንብሮች', icon: Sliders, iconColor: 'text-emerald-700' };
      default:
        return { title: 'AMS Portal', am: 'የግብርና ሚኒስቴር', icon: LayoutDashboard, iconColor: 'text-emerald-700' };
    }
  };

  const pageInfo = getPageInfo();
  const PageIcon = pageInfo.icon;

  return (
    <header className="no-print bg-white border-b border-slate-200/90 sticky top-0 z-20 px-3.5 sm:px-4 lg:px-3.5 py-2.5 flex items-center justify-between gap-3">
      {/* Left: Sidebar Toggle & Page Title */}
      <div className="flex items-center gap-3 min-w-0 md:shrink-0 flex-1 md:flex-none">
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
            - {pageInfo.am}
          </span>
        </div>
      </div>

      {/* Centre: search items and pages from anywhere */}
      <div className="hidden md:flex flex-1 justify-center min-w-0">
        <GlobalSearch onNavigate={onNavigate} />
      </div>

      {/* Right: today's date and notifications */}
      <div className="flex items-center gap-2.5 text-xs shrink-0">
        {/* Today in the Ethiopian calendar, as the vouchers use it; click to switch to Gregorian */}
        <button
          type="button"
          onClick={() => setShowAmDate((v) => !v)}
          title={showAmDate ? 'Showing the Gregorian date. Click for the Ethiopian calendar.' : 'Showing the Ethiopian calendar. Click for the Gregorian date.'}
          className="hidden xl:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 cursor-pointer"
        >
          <Calendar className="h-3.5 w-3.5 text-emerald-700" />
          <span className="tabular-nums">{showAmDate ? dateInfo.gc + ' G.C.' : dateInfo.ecFormattedEn || dateInfo.ec + ' E.C.'}</span>
        </button>

        {/* Store scope selector: hidden until pages filter by the selected store. Its options come from Settings → Stores. */}
        {/* <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
          <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <select
            value={selectedCenter}
            onChange={(e) => setSelectedCenter(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1"
          >
            <option value="ALL">All Stores</option>
            {[...new Map(locations.map((loc) => [loc.storeId, loc.storeName])).entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div> */}

        {/* Pending Approvals Bell & Interactive Notification Popover */}
        {isApprover && (
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
              {displayBadgeCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center animate-bounce shadow-xs">
                  {displayBadgeCount}
                </span>
              )}
            </button>

            {/* Floating Notification Popover (YouTube-style clean drawer) */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-50 overflow-hidden animate-fadeIn text-slate-800">
                {/* Header */}
                <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        {unreadCount} unread
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                        All read
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-800 hover:bg-slate-100 rounded-lg transition cursor-pointer flex items-center gap-1"
                        title="Mark all notifications as read"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Mark all read</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Notification Items List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {loadingNotifications ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-slate-400" />
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="py-12 px-6 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Bell className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <h4 className="text-sm font-medium text-slate-800">Your notifications live here</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        No notifications right now.
                      </p>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const isStockIn = item.transactionType === TransactionType.STOCK_IN;
                      const isStockOut = item.transactionType === TransactionType.STOCK_OUT;
                      const stage = item.currentStage ?? 1;
                      const typeLabel = isStockIn
                        ? 'Receipt'
                        : isStockOut
                        ? 'Issue'
                        : item.transactionType === TransactionType.RETURN
                        ? 'Return to Store'
                        : 'Asset Transfer';
                      const stageText = stage === 1 ? 'Endorsement' : 'Authorization';
                      const isRead = readIds.includes(item.id);

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            markAsRead(item.id);
                            setShowNotifications(false);
                            onNavigate('approvals');
                          }}
                          className={`px-4 py-3 transition cursor-pointer flex items-start gap-3 select-none ${
                            isRead
                              ? 'bg-white opacity-75 hover:bg-slate-50'
                              : 'bg-emerald-50/25 hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              isStockIn
                                ? 'bg-emerald-50 text-emerald-600'
                                : isStockOut
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-purple-50 text-purple-600'
                            }`}
                          >
                            {isStockIn && <PackagePlus className="w-4 h-4" />}
                            {isStockOut && <PackageMinus className="w-4 h-4" />}
                            {!isStockIn && !isStockOut && <ArrowRightLeft className="w-4 h-4" />}
                          </div>

                          <div className="flex-1 min-w-0 pr-1">
                            <p className={`text-xs leading-snug line-clamp-2 ${isRead ? 'text-slate-600 font-normal' : 'text-slate-900 font-semibold'}`}>
                              <span className="font-semibold text-slate-900">{typeLabel}</span>: {item.itemName} awaits {stageText.toLowerCase()}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                              <span>Slip #{item.ifmisSlipNumber}</span>
                              <span>•</span>
                              <span>{item.ifmisSlipDateEc} E.C.</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5 self-center">
                            {!isRead ? (
                              <button
                                onClick={(e) => markAsRead(item.id, e)}
                                title="Mark as read"
                                className="p-1 rounded-full text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              >
                                <span className="block w-2.5 h-2.5 rounded-full bg-blue-600" />
                              </button>
                            ) : (
                              <span title="Marked as read" className="text-slate-300">
                                <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User Profile Avatar & Dropdown Menu (LiveScreenMD style) */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={showUserMenu}
              aria-label={`Account menu for ${user.fullNameEn || ROLE_TITLES[role] || role}`}
              title={`Account menu (${user.fullNameEn || ROLE_TITLES[role] || role})`}
              className={`inline-flex size-8 items-center justify-center overflow-hidden rounded-full font-bold text-xs transition cursor-pointer select-none ${
                showUserMenu
                  ? 'ring-2 ring-emerald-600 bg-emerald-800 text-white shadow-xs'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white hover:ring-2 hover:ring-emerald-600/40 shadow-2xs'
              }`}
            >
              <span>{getInitials(user.fullNameEn || user.email)}</span>
            </button>

            {/* Floating Account Dropdown */}
            {showUserMenu && (
              <div
                role="menu"
                aria-label="User Account Menu"
                className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-slate-200/90 shadow-2xl z-50 overflow-hidden animate-fadeIn text-slate-800"
              >
                {/* Identity Header Card */}
                <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 flex items-start gap-2.5">
                  <div className="size-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-emerald-600/30">
                    {getInitials(user.fullNameEn || user.email)}
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="block font-bold text-xs text-slate-900 truncate">
                      {user.fullNameEn || ROLE_TITLES[role] || role}
                    </span>
                    {user.email && (
                      <span className="block text-[11px] text-slate-500 font-mono truncate mt-0.5">
                        {user.email}
                      </span>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Shield className="w-2.5 h-2.5 text-emerald-700" />
                        {ROLE_TITLES[role] || role}
                      </span>
                      {user.payrollId && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {user.payrollId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="p-1 space-y-0.5 text-xs">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      onNavigate('settings-profile');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-slate-700 hover:text-emerald-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                  >
                    <User className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Profile</span>
                  </button>

                  {Boolean(canAccessTab ? canAccessTab('settings-users') : user?.allowedTabs?.includes('settings-users')) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('settings-users');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium text-slate-700 hover:text-emerald-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Users</span>
                    </button>
                  )}
                </div>

                {/* Sign out */}
                <div className="p-1 border-t border-slate-100">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Sign out</span>
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

