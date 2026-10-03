import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole, AuthUser } from '../types/asset-management';
import {
  getValidTab,
  getNavSections,
  getSettingsGroups,
  getMobileNavItems,
} from '../components/layout/navigation';
import { getVisibleQueueTabs } from '../pages/ApprovalsPage';
import { StockInPage } from '../pages/StockInPage';
import { StockOutPage } from '../pages/StockOutPage';
import { TransferAssetPage } from '../pages/TransferAssetPage';
import { api } from '../api/client';

const mockAuth = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    role: 'DATA_ENCODER' as any,
    permissions: ['stock-in.write', 'stock-out.write', 'transfers.write'],
    allowedTabs: ['stock-in', 'stock-out', 'transfer-asset'],
    landingTab: 'stock-in',
  } as AuthUser | null,
  role: 'DATA_ENCODER' as any,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  refreshSession: vi.fn(),
  logout: vi.fn(),
  hasRole: vi.fn(),
  hasPermission: vi.fn((p: string) => mockAuth.user?.permissions?.includes(p) ?? false),
  canAccessTab: vi.fn((t: string) => mockAuth.user?.allowedTabs?.includes(t) ?? false),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn().mockResolvedValue([]),
    getDepartments: vi.fn().mockResolvedValue([]),
    getEmployees: vi.fn().mockResolvedValue([]),
    getLocations: vi.fn().mockResolvedValue([]),
    getApprovals: vi.fn().mockResolvedValue([]),
  },
}));

describe('Frontend RBAC Permission Matrix Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('URL & Tab Navigation Guard (getValidTab)', () => {
    it('prevents direct URL bypass to unauthorized tabs', () => {
      const encoderUser = {
        allowedTabs: ['stock-in', 'stock-out', 'transfer-asset'],
        landingTab: 'stock-in',
      };

      // Attempting to directly navigate to unauthorized administrative tabs
      expect(getValidTab(encoderUser, 'settings-roles')).toBe('stock-in');
      expect(getValidTab(encoderUser, 'settings-users')).toBe('stock-in');
      expect(getValidTab(encoderUser, 'dashboard')).toBe('stock-in');
      expect(getValidTab(encoderUser, 'approvals')).toBe('stock-in');

      // Valid authorized tab is accepted
      expect(getValidTab(encoderUser, 'stock-out')).toBe('stock-out');
      expect(getValidTab(encoderUser, 'transfer-asset')).toBe('transfer-asset');
    });

    it('falls back to first allowed tab if landingTab is not allowed', () => {
      const customUser = {
        allowedTabs: ['reports'],
        landingTab: 'dashboard', // dashboard not in allowedTabs
      };
      expect(getValidTab(customUser, 'settings-roles')).toBe('reports');
    });
  });

  describe('Dynamic Sidebar & Menu Visibility', () => {
    it('only renders navigation items included in allowedTabs', () => {
      const allowed = ['dashboard', 'reports'];
      const sections = getNavSections(allowed);

      const allRenderedIds = sections.flatMap((s) => s.items.map((i) => i.id));
      expect(allRenderedIds).toContain('dashboard');
      expect(allRenderedIds).toContain('reports');
      expect(allRenderedIds).not.toContain('stock-in');
      expect(allRenderedIds).not.toContain('stock-out');
      expect(allRenderedIds).not.toContain('approvals');
    });

    it('filters settings groups according to allowedTabs', () => {
      const allowed = ['settings-roles'];
      const groups = getSettingsGroups(allowed);

      const allSettingsIds = groups.flatMap((g) => g.items.map((i) => i.id));
      expect(allSettingsIds).toEqual(['settings-roles']);
      expect(allSettingsIds).not.toContain('settings-users');
      expect(allSettingsIds).not.toContain('settings-departments');
    });

    it('filters mobile nav items matching allowedTabs', () => {
      const allowed = ['stock-in', 'stock-out'];
      const mobileItems = getMobileNavItems(allowed);

      const ids = mobileItems.map((m) => m.id);
      expect(ids).toContain('stock-in');
      expect(ids).toContain('stock-out');
      expect(ids).not.toContain('approvals');
      expect(ids).not.toContain('dashboard');
    });
  });

  describe('Approvals Queue Tabs Dynamic Resolution (getVisibleQueueTabs)', () => {
    it('shows single-stage tabs for Stage 1 endorsers', () => {
      const tabs = getVisibleQueueTabs(UserRole.TEAM_LEADER, ['approvals.endorse']);
      expect(tabs).toEqual(['MY_QUEUE', 'APPROVED', 'REJECTED', 'ALL']);
      expect(tabs).not.toContain('STAGE_2');
    });

    it('shows single-stage tabs for Stage 2 authorizers', () => {
      const tabs = getVisibleQueueTabs(UserRole.DEPARTMENT_HEAD, ['approvals.authorize']);
      expect(tabs).toEqual(['MY_QUEUE', 'APPROVED', 'REJECTED', 'ALL']);
      expect(tabs).not.toContain('STAGE_1');
    });

    it('shows full multi-stage queue tabs for oversight roles or users with dual permissions', () => {
      const managerTabs = getVisibleQueueTabs(UserRole.MANAGER, ['approvals.read']);
      expect(managerTabs).toContain('STAGE_1');
      expect(managerTabs).toContain('STAGE_2');
      expect(managerTabs).toContain('MY_QUEUE');

      const dualTabs = getVisibleQueueTabs(UserRole.TEAM_LEADER, ['approvals.endorse', 'approvals.authorize']);
      expect(dualTabs).toContain('STAGE_1');
      expect(dualTabs).toContain('STAGE_2');
    });
  });

  describe('Page Action Gating via Matrix Permissions', () => {
    it('renders Stock-In registration button only when stock-in.write is granted', async () => {
      // 1. With permission granted
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['stock-in.write'],
        allowedTabs: ['stock-in'],
        landingTab: 'stock-in',
      } as any;
      mockAuth.role = UserRole.DATA_ENCODER;

      const { rerender } = render(<StockInPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(await screen.findByRole('button', { name: /New receipt \(Model 19\)/i })).toBeInTheDocument();

      // 2. With permission revoked
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['inventory.read'], // stock-in.write revoked
        allowedTabs: ['stock-in'],
        landingTab: 'stock-in',
      } as any;
      rerender(<StockInPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /New receipt \(Model 19\)/i })).not.toBeInTheDocument();
    });

    it('renders Stock-Out issue button only when stock-out.write is granted', async () => {
      // 1. With permission granted
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['stock-out.write'],
        allowedTabs: ['stock-out'],
        landingTab: 'stock-out',
      } as any;
      mockAuth.role = UserRole.DATA_ENCODER;

      const { rerender } = render(<StockOutPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(await screen.findByRole('button', { name: /New issue \(Model 22\)/i })).toBeInTheDocument();

      // 2. With permission revoked
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['inventory.read'], // stock-out.write revoked
        allowedTabs: ['stock-out'],
        landingTab: 'stock-out',
      } as any;
      rerender(<StockOutPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /New issue \(Model 22\)/i })).not.toBeInTheDocument();
    });

    it('gates transfer and return action controls in TransferAssetPage by transfers.write', async () => {
      // 1. With permission granted
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['transfers.write'],
        allowedTabs: ['transfer-asset'],
        landingTab: 'transfer-asset',
      } as any;
      mockAuth.role = UserRole.DATA_ENCODER;

      const { rerender } = render(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(await screen.findByRole('button', { name: /Transfer Form \(Model 21\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to Store \(Model 21\)/i })).toBeInTheDocument();

      // 2. With permission revoked
      mockAuth.user = {
        id: 'u1',
        role: UserRole.DATA_ENCODER,
        permissions: ['inventory.read'], // transfers.write revoked
        allowedTabs: ['transfer-asset'],
        landingTab: 'transfer-asset',
      } as any;
      rerender(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /Transfer Form \(Model 21\)/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Return to Store \(Model 21\)/i })).not.toBeInTheDocument();
    });
  });
});
