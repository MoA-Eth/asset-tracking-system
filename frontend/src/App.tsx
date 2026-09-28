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
import { LoginPage } from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './types/asset-management';
import { api } from './api/client';

const DEFAULT_TAB_FOR_ROLE: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'dashboard',
  [UserRole.DATA_ENCODER]: 'stock-in',
  [UserRole.DEPARTMENT_HEAD]: 'approvals',
  [UserRole.TOP_MANAGEMENT]: 'dashboard',
};

const ALLOWED_TABS_FOR_ROLE: Record<UserRole, string[]> = {
  [UserRole.SYSTEM_ADMIN]: ['dashboard', 'stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset', 'approvals', 'reports', 'audit', 'settings', 'settings-users', 'settings-matrix', 'settings-config'],
  [UserRole.DATA_ENCODER]: ['stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset', 'audit', 'settings', 'settings-users', 'settings-matrix', 'settings-config'],
  [UserRole.DEPARTMENT_HEAD]: ['dashboard', 'approvals', 'reports', 'audit', 'settings', 'settings-users', 'settings-matrix', 'settings-config'],
  [UserRole.TOP_MANAGEMENT]: ['dashboard', 'reports', 'audit'],
};

const AuthenticatedPortal: React.FC = () => {
  const { user, role, isAuthenticated, isLoading } = useAuth();

  const getValidTabForRole = (currentRole: UserRole, candidateTab?: string | null): string => {
    const allowed = ALLOWED_TABS_FOR_ROLE[currentRole] || [];
    if (candidateTab && allowed.includes(candidateTab)) {
      return candidateTab;
    }
    return DEFAULT_TAB_FOR_ROLE[currentRole] || 'reports';
  };

  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = localStorage.getItem('moa_active_tab');
    return getValidTabForRole(role, saved);
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [selectedCenter, setSelectedCenter] = useState<string>('ALL');

  const handleTabChange = (tab: string) => {
    const valid = getValidTabForRole(role, tab);
    setActiveTab(valid);
    localStorage.setItem('moa_active_tab', valid);
  };

  // Strictly align activeTab whenever role or user changes
  useEffect(() => {
    const saved = localStorage.getItem('moa_active_tab');
    const valid = getValidTabForRole(role, saved || activeTab);
    if (valid !== activeTab) {
      setActiveTab(valid);
      localStorage.setItem('moa_active_tab', valid);
    }
  }, [role, user?.id]);

  const fetchPending = async () => {
    try {
      const data = await api.getApprovals();
      const count = data.filter((a) => a.status === 'PENDING').length;
      setPendingApprovalsCount(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPending();
    }
  }, [activeTab, isAuthenticated]);

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
              Verifying Civil Service Session Credentials...
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
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
          {activeTab === 'return-asset' && (
            <StockInPage currentRole={role} onNavigate={handleTabChange} mode="return" />
          )}
          {activeTab === 'stock-out' && (
            <StockOutPage currentRole={role} onNavigate={handleTabChange} mode="stock-out" />
          )}
          {activeTab === 'assign-asset' && (
            <StockOutPage currentRole={role} onNavigate={handleTabChange} mode="assign" />
          )}
          {activeTab === 'transfer-asset' && (
            <StockOutPage currentRole={role} onNavigate={handleTabChange} mode="transfer" />
          )}
          {activeTab === 'approvals' && (
            <ApprovalsPage currentRole={role} onNavigate={handleTabChange} />
          )}
          {activeTab === 'audit' && (
            <AuditLogsPage />
          )}
          {activeTab === 'reports' && (
            <ReportsPage />
          )}
          {activeTab.startsWith('settings') && (
            <SettingsPage
              currentRole={role}
              userEmail={user?.email}
            />
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
      <AuthenticatedPortal />
    </AuthProvider>
  );
};

export default App;
