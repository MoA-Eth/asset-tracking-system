import { describe, expect, it } from 'vitest';
import { UserRole } from '../../types/asset-management';
import { canSeeSettings, getMobileNavItems, getNavSectionsForRole } from './navigation';

const ALL_ROLES = [
  UserRole.SYSTEM_ADMIN,
  UserRole.DATA_ENCODER,
  UserRole.TEAM_LEADER,
  UserRole.DEPARTMENT_HEAD,
  UserRole.MANAGER,
];

// Mirrors ALLOWED_TABS_FOR_ROLE in App.tsx
const SETTINGS_TABS = [
  'settings-users',
  'settings-roles',
  'settings-employees',
  'settings-departments',
  'settings-locations',
  'settings-stores',
  'settings-system',
];
const ALLOWED_TABS_FOR_ROLE: Record<UserRole, string[]> = {
  [UserRole.SYSTEM_ADMIN]: ['dashboard', 'reports', 'audit', ...SETTINGS_TABS],
  [UserRole.DATA_ENCODER]: ['stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset', ...SETTINGS_TABS],
  [UserRole.TEAM_LEADER]: ['approvals', 'reports', 'audit'],
  [UserRole.DEPARTMENT_HEAD]: ['approvals', 'reports', 'audit', ...SETTINGS_TABS],
  [UserRole.MANAGER]: ['dashboard', 'reports'],
};

const sidebarTabs = (role: UserRole) => getNavSectionsForRole(role).flatMap((s) => s.items.map((i) => i.id));

describe('Navigation menu per role', () => {
  it.each(ALL_ROLES)('%s only sees menu items it is allowed to open', (role) => {
    const tabs = [...sidebarTabs(role), ...getMobileNavItems(role).map((i) => i.id)];
    for (const tab of tabs) {
      expect(ALLOWED_TABS_FOR_ROLE[role]).toContain(tab);
    }
  });

  it('gives the Data Encoder store operations and settings, not reports or audit', () => {
    expect(sidebarTabs(UserRole.DATA_ENCODER)).toEqual(['stock-in', 'stock-out', 'transfer-asset']);
    expect(canSeeSettings(UserRole.DATA_ENCODER)).toBe(true);
    expect(getMobileNavItems(UserRole.DATA_ENCODER).map((i) => i.label)).toEqual([
      'Stock-In',
      'Stock-Out',
      'Transfers',
      'Settings',
    ]);
  });

  it('gives approvers the approvals queue and oversight pages', () => {
    expect(sidebarTabs(UserRole.TEAM_LEADER)).toEqual(['approvals', 'reports', 'audit']);
    expect(canSeeSettings(UserRole.TEAM_LEADER)).toBe(false);
    expect(sidebarTabs(UserRole.DEPARTMENT_HEAD)).toEqual(['approvals', 'reports', 'audit']);
    expect(canSeeSettings(UserRole.DEPARTMENT_HEAD)).toBe(true);
  });

  it('gives the Manager the dashboard and reports only', () => {
    expect(sidebarTabs(UserRole.MANAGER)).toEqual(['dashboard', 'reports']);
    expect(canSeeSettings(UserRole.MANAGER)).toBe(false);
    expect(getMobileNavItems(UserRole.MANAGER).map((i) => i.id)).toEqual(['dashboard', 'reports']);
  });

  it('marks the mobile Settings tab active on every settings page', () => {
    const settings = getMobileNavItems(UserRole.SYSTEM_ADMIN).find((i) => i.label === 'Settings')!;
    expect(settings.matches('settings-system')).toBe(true);
    expect(settings.matches('settings-users')).toBe(true);
    expect(settings.matches('reports')).toBe(false);
  });
});
