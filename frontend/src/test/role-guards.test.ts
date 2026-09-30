import { describe, expect, it } from 'vitest';
import { UserRole } from '../types/asset-management';

import {
  ALLOWED_TABS_FOR_ROLE,
  DEFAULT_TAB_FOR_ROLE,
  getValidTabForRole,
} from '../utils/navigation';

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
    it.each([
      [UserRole.SYSTEM_ADMIN, 'settings-departments'],
      [UserRole.DEPARTMENT_HEAD, 'settings-departments'],
      [UserRole.DATA_ENCODER, 'settings-departments'],
      [UserRole.TEAM_LEADER, 'approvals'],
      [UserRole.MANAGER, 'settings-departments'],
    ])('resolves department access for %s to %s', (role, expected) => {
      expect(getValidTabForRole(role, 'settings-departments')).toBe(expected);
    });
    it('DATA_ENCODER is strictly forbidden from accessing approvals', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.DATA_ENCODER];
      expect(allowed).not.toContain('approvals');
      expect(getValidTabForRole(UserRole.DATA_ENCODER, 'approvals')).toBe(
        'stock-in'
      );
    });

    it('SYSTEM_ADMIN is strictly forbidden from executing stock operations or approvals', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.SYSTEM_ADMIN];
      expect(allowed).not.toContain('stock-in');
      expect(allowed).not.toContain('stock-out');
      expect(allowed).not.toContain('assign-asset');
      expect(allowed).not.toContain('transfer-asset');
      expect(allowed).not.toContain('approvals');

      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'stock-in')).toBe(
        'dashboard'
      );
      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'approvals')).toBe(
        'dashboard'
      );
    });

    it('TEAM_LEADER cannot execute stock operations directly', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.TEAM_LEADER];
      expect(allowed).not.toContain('stock-in');
      expect(allowed).not.toContain('stock-out');
      expect(allowed).not.toContain('transfer-asset');
      expect(allowed).toContain('approvals');
    });

    it('MANAGER has read-only oversight and department allocations', () => {
      const allowed = ALLOWED_TABS_FOR_ROLE[UserRole.MANAGER];
      expect(allowed).toEqual([
        'dashboard',
        'reports',
        'audit',
        'settings-departments',
      ]);
      expect(getValidTabForRole(UserRole.MANAGER, 'settings')).toBe(
        'dashboard'
      );
    });

    it('preserves valid requested tab when authorized for role', () => {
      expect(getValidTabForRole(UserRole.DEPARTMENT_HEAD, 'reports')).toBe(
        'reports'
      );
      expect(getValidTabForRole(UserRole.DATA_ENCODER, 'stock-out')).toBe(
        'stock-out'
      );
      expect(getValidTabForRole(UserRole.SYSTEM_ADMIN, 'audit')).toBe('audit');
    });
  });
});
