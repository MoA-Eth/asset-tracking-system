import { describe, expect, it } from 'vitest';
import { getValidTab } from '../components/layout/navigation';
import { getRoleAccess } from '../../../backend/src/security/role-policy';

// Exercise the actual session policy and navigation guard, not a copied matrix.
describe('Session navigation access', () => {
  it.each([
    ['SYSTEM_ADMIN', 'dashboard'], ['DATA_ENCODER', 'assets'],
    ['TEAM_LEADER', 'approvals'], ['DEPARTMENT_HEAD', 'approvals'], ['MANAGER', 'dashboard'],
  ])('%s has the expected landing page', (role, page) => {
    expect(getValidTab(getRoleAccess(role), null)).toBe(page);
  });
  it.each(['DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD', 'MANAGER'])('%s cannot open role administration', role => {
    expect(getValidTab(getRoleAccess(role), 'settings-roles')).not.toBe('settings-roles');
    expect(getValidTab(getRoleAccess(role), 'settings-users')).not.toBe('settings-users');
  });
  it('immediately invalidates the open tab when a refreshed session loses access', () => {
    expect(getValidTab(getRoleAccess('SYSTEM_ADMIN'), 'settings-roles')).toBe('settings-roles');
    expect(getValidTab(getRoleAccess('DATA_ENCODER'), 'settings-roles')).toBe('assets');
  });
  it('denies missing or unknown access and preserves a permitted tab', () => {
    expect(getValidTab(null, 'settings-roles')).toBe('');
    expect(getValidTab(getRoleAccess('UNKNOWN'), 'settings-roles')).toBe('');
    expect(getValidTab(getRoleAccess('MANAGER'), 'reports')).toBe('reports');
  });
});
