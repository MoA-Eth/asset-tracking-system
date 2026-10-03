import { describe, expect, it } from 'vitest';
import { getSettingsGroups, getMobileNavItems, getNavSections } from './navigation';
import { getRoleAccess } from '../../../../backend/src/security/role-policy';

const allowed = (role: string) => getRoleAccess(role).allowedTabs;
const settings = (role: string) => getSettingsGroups(allowed(role)).flatMap(group => group.items.map(item => item.id));

describe('Navigation consumes the server policy', () => {
  it.each(['SYSTEM_ADMIN', 'DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD', 'MANAGER'])('%s only sees permitted tabs on desktop and mobile', role => {
    const tabs = [...getNavSections(allowed(role)).flatMap(section => section.items), ...getMobileNavItems(allowed(role))];
    for (const tab of tabs) expect(allowed(role)).toContain(tab.id);
  });
  it('restricts Users and Roles to administrators while preserving other Settings access', () => {
    expect(settings('SYSTEM_ADMIN')).toContain('settings-roles');
    expect(settings('SYSTEM_ADMIN')).toContain('settings-users');
    for (const role of ['DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD']) {
      expect(settings(role)).not.toContain('settings-roles');
      expect(settings(role)).not.toContain('settings-users');
      expect(settings(role)).toContain('settings-employees');
      expect(getMobileNavItems(allowed(role)).find(item => item.label === 'Settings')?.id).toBe('settings-employees');
    }
  });
  it('keeps System Settings away from Data Encoders', () => {
    expect(settings('DATA_ENCODER')).not.toContain('settings-system');
    expect(settings('TEAM_LEADER')).toContain('settings-system');
  });
  it('has no settings for Managers and no navigation without access', () => {
    expect(settings('MANAGER')).toEqual([]);
    expect(getMobileNavItems()).toEqual([]);
  });
  it('marks Settings active on its child pages', () => {
    expect(getMobileNavItems(allowed('SYSTEM_ADMIN')).find(item => item.label === 'Settings')?.matches('settings-roles')).toBe(true);
  });
});
