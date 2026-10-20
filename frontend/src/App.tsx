import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { TopHeader } from './components/layout/TopHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { DesktopSidebar } from './components/layout/DesktopSidebar';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { Skeleton, SkeletonCard } from './components/ui/Skeleton';
import { loadSystemSettings } from './utils/system-settings';

// Route-level code-splitting with dynamic imports
const ExecutiveDashboardPage = lazy(() => import('./pages/ExecutiveDashboardPage').then(m => ({ default: m.ExecutiveDashboardPage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then(m => ({ default: m.AssetsPage })));
const MyAssetsPage = lazy(() => import('./pages/MyAssetsPage').then(m => ({ default: m.MyAssetsPage })));
const DocsPage = lazy(() => import('./pages/DocsPage').then(m => ({ default: m.DocsPage })));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage').then(m => ({ default: m.SystemSettingsPage })));
const RolesPage = lazy(() => import('./pages/settings/RolesPage').then(m => ({ default: m.RolesPage })));
const EmployeesPage = lazy(() => import('./pages/settings/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const StoresPage = lazy(() => import('./pages/settings/StoresPage').then(m => ({ default: m.StoresPage })));
const OrganizationsPage = lazy(() => import('./pages/settings/OrganizationsPage').then(m => ({ default: m.OrganizationsPage })));
const ApiKeysPage = lazy(() => import('./pages/settings/ApiKeysPage').then(m => ({ default: m.ApiKeysPage })));
const ProfilePage = lazy(() => import('./pages/settings/ProfilePage').then(m => ({ default: m.ProfilePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage').then(m => ({ default: m.ChangePasswordPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="p-4 space-y-4 animate-fadeIn" role="status" aria-busy="true">
    <span className="sr-only">Loading content…</span>
    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <Skeleton className="h-8 w-28 rounded-[4px]" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-28" />
    </div>
    <SkeletonCard className="h-72 mt-4" />
  </div>
);

const AuthLoadingFallback: React.FC = () => (
  <div className="h-screen w-screen bg-[#071911] text-white flex flex-col items-center justify-center p-4">
    <div className="flex flex-col items-center gap-4 text-center max-w-sm animate-pulse">
      <div className="w-18 h-18 flex items-center justify-center">
        <MoaLogo className="w-full h-full drop-shadow-xl" alt="Ministry of Agriculture" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">
          MoA<span className="text-[#FCDD09]">-ATS</span>
        </h2>
        <p className="text-xs text-emerald-200/80">
          Loading portal…
        </p>
      </div>
    </div>
  </div>
);
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UserRole } from './types/asset-management';
import { api } from './api/client';
import { MoaLogo } from './components/ui/MoaLogo';

import { getValidTab, getSettingsGroups } from './components/layout/navigation';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { countApprovalRows } from './components/assets/slip-groups';

const AuthenticatedPortal: React.FC = () => {
  const { user, role, isAuthenticated, isLoading } = useAuth();

  const [requestedTab, setRequestedTab] = useState<string>(() => localStorage.getItem('moa_active_tab') || '');
  const activeTab = getValidTab(user, requestedTab);
  const [usersRoleFilter, setUsersRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  // Remembered between visits; storage can be unavailable, and then the rail simply starts open
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('moa_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem('moa_sidebar_collapsed', collapsed ? '1' : '0');
    } catch {
      // The choice just isn't remembered
    }
  };
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [selectedCenter, setSelectedCenter] = useState<string>('ALL');

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setRequestedTab(localStorage.getItem('moa_active_tab') || '');
    setUsersRoleFilter('ALL');
    // The forms need the system-wide rules (e.g. whether a scanned slip is required)
    if (user?.id) loadSystemSettings().catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

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
      // A receipt of several lines is one row of the queue, so it counts once
      const pending = data.filter((a) => a.status === 'PENDING');
      let count = 0;
      const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
      const canAuthorize = user?.permissions?.includes('approvals.authorize') ?? (role === UserRole.DEPARTMENT_HEAD || role === UserRole.CHIEF_DIRECTOR);
      if (canEndorse && !canAuthorize) {
        count = countApprovalRows(pending.filter((a) => (a.currentStage ?? 1) === 1));
      } else if (canAuthorize && !canEndorse) {
        count = countApprovalRows(pending.filter((a) => a.currentStage === 2));
      } else if (canEndorse && canAuthorize) {
        count = countApprovalRows(pending);
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
          <div className="w-18 h-18 flex items-center justify-center">
            <MoaLogo className="w-full h-full drop-shadow-xl" alt="Ministry of Agriculture" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              MoA<span className="text-[#FCDD09]">-ATS</span>
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
    return (
      <Suspense fallback={<AuthLoadingFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  // A temporary password must be replaced before anything else
  if (user?.mustChangePassword) {
    return (
      <Suspense fallback={<AuthLoadingFallback />}>
        <ChangePasswordPage />
      </Suspense>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#EEF1F5] text-slate-800 flex flex-row font-sans selection:bg-emerald-600 selection:text-white antialiased">
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

        {/* Page Content - Strictly Gated to Authorized Role */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-3 sm:p-3.5 lg:px-3.5 lg:pt-3 lg:pb-3 w-full pb-20 sm:pb-24 lg:pb-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <ErrorBoundary fallbackTitle="Page Content Notice">
            <Suspense fallback={<PageLoadingFallback />}>
            {!activeTab && <p className="text-sm text-slate-600">No pages are available for this account. Contact your System Administrator.</p>}
            {activeTab.startsWith('settings-') && activeTab !== 'settings-profile' && (
              <nav aria-label="Settings pages" className="lg:hidden flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-slate-200">
                {getSettingsGroups(user?.allowedTabs).flatMap(group => group.items).map(item => (
                  <button key={item.id} onClick={() => handleTabChange(item.id)} aria-current={activeTab === item.id ? 'page' : undefined}
                    className={`shrink-0 rounded-[4px] px-3 py-2 text-xs font-semibold ${activeTab === item.id ? 'bg-emerald-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
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
            {activeTab === 'assets' && <AssetsPage currentRole={role} onNavigate={handleTabChange} />}
            {activeTab === 'my-assets' && <MyAssetsPage />}
            {activeTab === 'docs' && <DocsPage />}
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
            {activeTab === 'settings-profile' && (
              <ProfilePage />
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
            {activeTab === 'settings-organizations' && <OrganizationsPage />}
            {activeTab === 'settings-api-keys' && <ApiKeysPage />}
            {activeTab === 'settings-system' && (
              <SystemSettingsPage />
            )}
                      </Suspense>
          </ErrorBoundary>
        </main>

        {/* Mobile Bottom Navigation (Visible on mobile/tablet, hidden on lg) */}
        <MobileBottomNav
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          pendingApprovalsCount={pendingApprovalsCount}
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
