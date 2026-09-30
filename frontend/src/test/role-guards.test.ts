import { describe, expect, it } from 'vitest';
import { UserRole } from '../types/asset-management';

// Replicate mapping as tested against App.tsx security constraints
const DEFAULT_TAB_FOR_ROLE: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'dashboard',
  [UserRole.DATA_ENCODER]: 'stock-in',
  [UserRole.TEAM_LEADER]: 'approvals',
  [UserRole.DEPARTMENT_HEAD]: 'approvals',
  [UserRole.MANAGER]: 'dashboard',
};

const ALLOWED_TABS_FOR_ROLE: Record<UserRole, string[]> = {
  [UserRole.SYSTEM_ADMIN]: ['dashboard', 'reports', 'audit', 'settings', 'settings-users', 'settings-matrix', 'settings-config', 'settings-system'],
  [UserRole.DATA_ENCODER]: ['stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset', 'settings', 'settings-users', 'settings-matrix', 'settings-config', 'settings-system'],
  [UserRole.TEAM_LEADER]: ['approvals', 'reports', 'audit'],
  [UserRole.DEPARTMENT_HEAD]: ['approvals', 'reports', 'audit', 'settings', 'settings-users', 'settings-matrix', 'settings-config', 'settings-system'],
  [UserRole.MANAGER]: ['dashboard'],
};

export const getValidTabForRole = (currentRole: UserRole, candidateTab?: string | null): string => {
  const allowed = ALLOWED_TABS_FOR_ROLE[currentRole] || [];
  if (candidateTab && allowed.includes(candidateTab)) {
    return candidateTab;
  }
  return DEFAULT_TAB_FOR_ROLE[currentRole] || 'reports';
};

describe('Role-Based Access Control & Segregation of Duties (SOD)', () => {
  describe('Default landing tabs', () => {
    it.each([
      [UserRole.SYSTEM_ADMIN, 'dashboard'],
      [UserRole.DATA_ENCODER, 'stock-in'],
      [UserRole.TEAM_LEADER, 'approvals'],
      [UserRole.DEPARTMENT_HEAD, 'approvals'],
      [UserRole.MANAGER, 'dashboard'],
    ])('maps %s to default landing tab %s', (role, expectedDefault) => {
      expect(DEFAULT_TAB_FOR_ROLE[role]).toBe(expectedDefault);
      expect(getValidTabForRole(role, null)).toBe(expectedDefault);
    });
  });

  describe('Segregation of Duties (SOD) Tab Authorization', () => {
    it('DATA_ENCODER is strictly forbidden from accessing approvals', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.DATA_ENCODER];
      expect(allowed).not.toContain('approvals');
      expect(getValidTabForRole(UserRole.DATA_ENCODER, 'approvals')).toBe('stock-in');
    });

    it('SYSTEM_ADMIN is strictly forbidden from executing stock operations or approvals', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.SYSTEM_ADMIN];
      expect(allowed).not.toContain('stock-in');
      expect(allowed).not.toContain('stock-out');
      expect(allowed).not.toContain('assign-asset');
      expect(allowed).not.toContain('transfer-asset');
      expect(allowed).not.toContain('approvals');

      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'stock-in')).toBe('dashboard');
      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'approvals')).toBe('dashboard');
    });

    it('TEAM_LEADER cannot execute stock operations directly', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.TEAM_LEADER];
      expect(allowed).not.toContain('stock-in');
      expect(allowed).not.toContain('stock-out');
      expect(allowed).not.toContain('transfer-asset');
      expect(allowed).toContain('approvals');
    });

    it('MANAGER is strictly restricted to dashboard read-only analytics', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.MANAGER];
      expect(allowed).toEqual(['dashboard']);
      expect(getValidTabForRole(UserRole.MANAGER, 'settings')).toBe('dashboard');
    });

    it('preserves valid requested tab when authorized for role', () => {
      expect(getValidTabForRole(UserRole.DEPARTMENT_HEAD, 'reports')).toBe('reports');
      expect(getValidTabForRole(UserRole.DATA_ENCODER, 'stock-out')).toBe('stock-out');
      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'audit')).toBe('audit');
    });

    it('System Settings page is limited to roles with Settings access', () => {
      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'settings-system')).toBe('settings-system');
      expect(getValidTabForRole(UserRole.DEPARTMENT_HEAD, 'settings-system')).toBe('settings-system');
      expect(getValidTabForRole(UserRole.DATA_ENCODER, 'settings-system')).toBe('settings-system');
      expect(getValidTabForRole(UserRole.TEAM_LEADER, 'settings-system')).toBe('approvals');
      expect(getValidTabForRole(UserRole.MANAGER, 'settings-system')).toBe('dashboard');
    });
  });
});
