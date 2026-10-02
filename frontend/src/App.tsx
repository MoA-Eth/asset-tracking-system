import React, { useState, useEffect } from 'react';
import { TopHeader } from './components/layout/TopHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { DesktopSidebar } from './components/layout/DesktopSidebar';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { ExecutiveDashboardPage } from './pages/ExecutiveDashboardPage';
import { StockInPage } from './pages/StockInPage';
import { StockOutPage } from './pages/StockOutPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { RolesPage } from './pages/settings/RolesPage';
import { EmployeesPage } from './pages/settings/EmployeesPage';
import { StoresPage } from './pages/settings/StoresPage';
import { TransferAssetPage } from './pages/TransferAssetPage';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UserRole } from './types/asset-management';
import { api } from './api/client';

import { getValidTab, getSettingsGroups } from './components/layout/navigation';

const AuthenticatedPortal: React.FC = () => {
  const { user, role, isAuthenticated, isLoading } = useAuth();

  const [requestedTab, setRequestedTab] = useState<string>(() => localStorage.getItem('moa_active_tab') || '');
  const activeTab = getValidTab(user, requestedTab);
  const [usersRoleFilter, setUsersRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [selectedCenter, setSelectedCenter] = useState<string>('ALL');

  useEffect(() => {
    setRequestedTab(localStorage.getItem('moa_active_tab') || '');
    setUsersRoleFilter('ALL');
  }, [user?.id]);

  const handleTabChange = (tab: string) => {
    const valid = getValidTab(user, tab);
    if (tab === 'settings-users') setUsersRoleFilter('ALL');
    setRequestedTab(valid);
    localStorage.setItem('moa_active_tab', valid);
  };
  const viewRoleUsers = (code: UserRole) => {
    setUsersRoleFilter(code);
    setRequestedTab('settings-users');
    localStorage.setItem('moa_active_tab', 'settings-users');
  };

  const fetchPending = async () => {
    if (!user?.permissions?.includes('approvals.read')) { setPendingApprovalsCount(0); return; }
    try {
      const data = await api.getApprovals();
      const pending = data.filter((a) => a.status === 'PENDING');
      let count = 0;
      const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
      const canAuthorize = user?.permissions?.includes('approvals.authorize') ?? (role === UserRole.DEPARTMENT_HEAD);
      if (canEndorse && !canAuthorize) {
        count = pending.filter((a) => (a.currentStage ?? 1) === 1).length;
      } else if (canAuthorize && !canEndorse) {
        count = pending.filter((a) => a.currentStage === 2).length;
      } else if (canEndorse && canAuthorize) {
        count = pending.length;
      } else {
        count = 0;
      }
      setPendingApprovalsCount(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPending();
    }
  }, [activeTab, isAuthenticated, role]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchPending();
    };
    window.addEventListener('moa_approvals_updated', handleUpdate);
    return () => window.removeEventListener('moa_approvals_updated', handleUpdate);
  }, [role, isAuthenticated]);

  // Loading state with MoA branding
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#071911] text-white flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm animate-pulse">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F4A2B] to-[#04180E] border border-amber-400/50 flex items-center justify-center p-2.5 shadow-xl">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
              <circle cx="50" cy="50" r="46" fill="#0A3F24" stroke="#FCDD09" strokeWidth="3" />
              <path d="M50 16 L50 82" stroke="#FCDD09" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M50 28 Q66 22 68 34 Q58 38 50 34" fill="#FCDD09" />
              <path d="M50 42 Q68 36 70 48 Q60 52 50 48" fill="#FCDD09" />
              <path d="M50 28 Q34 22 32 34 Q42 38 50 34" fill="#FCDD09" />
              <path d="M50 42 Q32 36 30 48 Q40 52 50 48" fill="#FCDD09" />
              <circle cx="50" cy="50" r="4" fill="#FCDD09" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              MoA<span className="text-[#FCDD09]">-AMS</span>
            </h2>
            <p className="text-xs text-emerald-200/80">
              Verifying your Session Credentials...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated view: Render institutional login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // A temporary password must be replaced before anything else
  if (user?.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F8FAFC] text-slate-800 flex flex-row font-sans selection:bg-emerald-600 selection:text-white antialiased">
      {/* Desktop Sidebar (lg screens) */}
      <DesktopSidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        currentRole={role}
        pendingApprovalsCount={pendingApprovalsCount}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Offline Banner & PWA Install Alert */}
        <OfflineBanner />

        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNavigate={handleTabChange}
          selectedCenter={selectedCenter}
          setSelectedCenter={setSelectedCenter}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        {/* Page Content with Generous Whitespace */}
        {/* Page Content - Strictly Gated to Authorized Role */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:px-5 lg:py-6 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
          {!activeTab && <p className="text-sm text-slate-600">No pages are available for this account. Contact your System Administrator.</p>}
          {activeTab.startsWith('settings-') && (
            <nav aria-label="Settings pages" className="lg:hidden flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-slate-200">
              {getSettingsGroups(user?.allowedTabs).flatMap(group => group.items).map(item => (
                <button key={item.id} onClick={() => handleTabChange(item.id)} aria-current={activeTab === item.id ? 'page' : undefined}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === item.id ? 'bg-emerald-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  {item.label}
                </button>
              ))}
            </nav>
          )}
          {activeTab === 'dashboard' && (
            <ExecutiveDashboardPage
              onNavigate={handleTabChange}
              currentRole={role}
              selectedCenter={selectedCenter}
              setSelectedCenter={setSelectedCenter}
            />
          )}
          {activeTab === 'stock-in' && (
            <StockInPage currentRole={role} onNavigate={handleTabChange} mode="stock-in" />
          )}
          {(activeTab === 'stock-out' || activeTab === 'assign-asset') && (
            <StockOutPage currentRole={role} onNavigate={handleTabChange} mode="stock-out" />
          )}
          {(activeTab === 'transfer-asset' || activeTab === 'return-asset') && (
            <TransferAssetPage currentRole={role} onNavigate={handleTabChange} />
          )}
          {activeTab === 'approvals' && (
            <ApprovalsPage
              currentRole={role}
              onNavigate={handleTabChange}
              onRefreshPendingCount={fetchPending}
            />
          )}
          {activeTab === 'audit' && (
            <AuditLogsPage />
          )}
          {activeTab === 'reports' && (
            <ReportsPage />
          )}
          {activeTab === 'settings-users' && (
            <SettingsPage
              currentRole={role}
              userEmail={user?.email}
              initialRoleFilter={usersRoleFilter}
            />
          )}
          {activeTab === 'settings-roles' && <RolesPage onViewUsers={viewRoleUsers} />}
          {activeTab === 'settings-employees' && <EmployeesPage />}
          {activeTab === 'settings-stores' && <StoresPage />}
          {activeTab === 'settings-system' && (
            <SystemSettingsPage />
          )}
        </main>

        {/* Mobile Bottom Navigation (Visible on mobile/tablet, hidden on lg) */}
        <MobileBottomNav
          activeTab={activeTab}
          setActiveTab={handleTabChange}
        />
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthenticatedPortal />
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
