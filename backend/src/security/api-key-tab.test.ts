import { describe, expect, it } from 'vitest';
import { computeAllowedTabs, getEffectiveRolePermissions } from './role-policy';
import { UserRole } from '../types/asset-management';

describe('The API keys page in Settings', () => {
  it.each([UserRole.SUPER_ADMIN, UserRole.SYSTEM_ADMIN])('is shown to %s, who manage access', (role) => {
    expect(computeAllowedTabs(role, getEffectiveRolePermissions(role)).allowedTabs).toContain('settings-api-keys');
  });
  it.each([UserRole.DATA_ENCODER, UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD, UserRole.MANAGER])('is not shown to %s', (role) => {
    expect(computeAllowedTabs(role, getEffectiveRolePermissions(role)).allowedTabs).not.toContain('settings-api-keys');
  });
});
