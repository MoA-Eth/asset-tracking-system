import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROLE_POLICY,
  PERMISSION_GROUPS,
  Permission,
  hasPermission,
  getEffectiveRolePermissions,
  setRolePermissions,
  resetRolePermissions,
  resetAllRolePermissions,
  computeAllowedTabs,
  getRoleAccess,
  PROTECTED_ROLE_PERMISSIONS,
  segregationViolations,
} from './role-policy';
import { requirePermission } from '../middleware/auth.middleware';
import { UserRole, AuthUser } from '../types/asset-management';
import { Request, Response } from 'express';

describe('RBAC Permission Matrix Enforcement', () => {
  beforeEach(() => {
    resetAllRolePermissions();
  });

  const allPermissions = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
  const allRoles: UserRole[] = [
    UserRole.SYSTEM_ADMIN,
    UserRole.DATA_ENCODER,
    UserRole.TEAM_LEADER,
    UserRole.DEPARTMENT_HEAD,
    UserRole.MANAGER,
    UserRole.EMPLOYEE,
  ];

  describe('Statutory baseline verification across all roles and permissions', () => {
    it('defines explicit baseline permissions for every role', () => {
      for (const role of allRoles) {
        const policy = ROLE_POLICY[role];
        expect(policy).toBeDefined();
        expect(policy.permissions.length).toBeGreaterThan(0);
        // Ensure every permission in the policy exists in PERMISSION_GROUPS
        for (const perm of policy.permissions) {
          expect(allPermissions).toContain(perm);
        }
      }
    });

    it('enforces segregation of duties (SoD) in baseline policy', () => {
      // DATA_ENCODER can request stock-out and register stock-in, but cannot endorse or authorize
      expect(hasPermission(UserRole.DATA_ENCODER, 'stock-in.write')).toBe(true);
      expect(hasPermission(UserRole.DATA_ENCODER, 'stock-out.write')).toBe(true);
      expect(hasPermission(UserRole.DATA_ENCODER, 'transfers.write')).toBe(true);
      expect(hasPermission(UserRole.DATA_ENCODER, 'approvals.endorse')).toBe(false);
      expect(hasPermission(UserRole.DATA_ENCODER, 'approvals.authorize')).toBe(false);

      // TEAM_LEADER can endorse (Stage 1), but cannot authorize (Stage 2) or write store items
      expect(hasPermission(UserRole.TEAM_LEADER, 'approvals.endorse')).toBe(true);
      expect(hasPermission(UserRole.TEAM_LEADER, 'approvals.authorize')).toBe(false);
      expect(hasPermission(UserRole.TEAM_LEADER, 'stock-in.write')).toBe(false);
      expect(hasPermission(UserRole.TEAM_LEADER, 'stock-out.write')).toBe(false);

      // DEPARTMENT_HEAD can authorize (Stage 2), but cannot endorse (Stage 1) or write store items
      expect(hasPermission(UserRole.DEPARTMENT_HEAD, 'approvals.authorize')).toBe(true);
      expect(hasPermission(UserRole.DEPARTMENT_HEAD, 'approvals.endorse')).toBe(false);
      expect(hasPermission(UserRole.DEPARTMENT_HEAD, 'stock-in.write')).toBe(false);

      // SYSTEM_ADMIN administers roles, cannot perform approvals or stock writes
      expect(hasPermission(UserRole.SYSTEM_ADMIN, 'roles.assign')).toBe(true);
      expect(hasPermission(UserRole.SYSTEM_ADMIN, 'roles.read')).toBe(true);
      expect(hasPermission(UserRole.SYSTEM_ADMIN, 'approvals.endorse')).toBe(false);
      expect(hasPermission(UserRole.SYSTEM_ADMIN, 'approvals.authorize')).toBe(false);
      expect(hasPermission(UserRole.SYSTEM_ADMIN, 'stock-in.write')).toBe(false);

      // MANAGER has oversight (dashboard, reports), no approval or store write authority
      expect(hasPermission(UserRole.MANAGER, 'dashboard.read')).toBe(true);
      expect(hasPermission(UserRole.MANAGER, 'reports.read')).toBe(true);
      expect(hasPermission(UserRole.MANAGER, 'approvals.endorse')).toBe(false);
      expect(hasPermission(UserRole.MANAGER, 'approvals.authorize')).toBe(false);
      expect(hasPermission(UserRole.MANAGER, 'stock-in.write')).toBe(false);
    });

    it('lets only the Data Encoder request disposals, and treats it as store work', () => {
      expect(hasPermission(UserRole.DATA_ENCODER, 'disposals.write')).toBe(true);
      for (const role of [UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD, UserRole.MANAGER, UserRole.SYSTEM_ADMIN]) {
        expect(hasPermission(role, 'disposals.write')).toBe(false);
      }
      // A role that requests disposals can't also endorse them, and the administrator can't request them
      expect(segregationViolations(UserRole.TEAM_LEADER, ['disposals.write', 'approvals.endorse'])).toHaveLength(1);
      expect(segregationViolations(UserRole.SYSTEM_ADMIN, ['disposals.write'])).toHaveLength(1);
      // Requesting disposals alone is enough to work in the asset register
      expect(computeAllowedTabs(UserRole.DATA_ENCODER, ['disposals.write'] as Permission[]).allowedTabs).toContain('assets');
    });
  });

  describe('Employees see only their own assets', () => {
    it('gives the Employee role one permission, one page, and nothing about anyone else', () => {
      expect(getEffectiveRolePermissions(UserRole.EMPLOYEE)).toEqual(['assets.own']);
      const access = getRoleAccess(UserRole.EMPLOYEE);
      expect(access.allowedTabs).toEqual(['my-assets']);
      expect(access.landingTab).toBe('my-assets');
      // None of the staff-wide permissions: the asset register, requests, approvals, reports, people
      for (const p of allPermissions.filter((p) => p !== 'assets.own')) {
        expect(hasPermission(UserRole.EMPLOYEE, p as Permission)).toBe(false);
      }
    });

    it('keeps "My assets" with the Employee role: no other role gets the page by default', () => {
      for (const role of allRoles.filter((r) => r !== UserRole.EMPLOYEE)) {
        expect(hasPermission(role, 'assets.own')).toBe(false);
        expect(getRoleAccess(role).allowedTabs).not.toContain('my-assets');
      }
    });

    it('opens the page for whoever is granted the permission', () => {
      expect(computeAllowedTabs(UserRole.EMPLOYEE, ['assets.own'] as Permission[]).allowedTabs).toEqual(['my-assets']);
    });
  });

  describe('API Middleware Enforcement (requirePermission)', () => {
    const createReq = (role?: UserRole): Request =>
      ({
        user: role
          ? ({
              id: 'test-user',
              role,
              permissions: getEffectiveRolePermissions(role),
            } as AuthUser)
          : undefined,
      } as unknown as Request);

    const res = {} as Response;

    it('rejects unauthenticated requests with 401 Unauthorized', () => {
      const middleware = requirePermission('inventory.read');
      const req = createReq();
      const next = vi.fn();

      expect(() => middleware(req, res, next)).toThrowError(/Authentication is required/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects unauthorized roles with 403 Forbidden', () => {
      const middleware = requirePermission('roles.assign');
      const req = createReq(UserRole.DATA_ENCODER);
      const next = vi.fn();

      expect(() => middleware(req, res, next)).toThrowError(/Your role does not permit this action/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows authorized roles through with next()', () => {
      const middleware = requirePermission('roles.assign');
      const req = createReq(UserRole.SYSTEM_ADMIN);
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('supports multiple required permissions with OR semantics', () => {
      const middleware = requirePermission('approvals.endorse', 'approvals.authorize');

      const tlReq = createReq(UserRole.TEAM_LEADER);
      const tlNext = vi.fn();
      middleware(tlReq, res, tlNext);
      expect(tlNext).toHaveBeenCalledTimes(1);

      const dhReq = createReq(UserRole.DEPARTMENT_HEAD);
      const dhNext = vi.fn();
      middleware(dhReq, res, dhNext);
      expect(dhNext).toHaveBeenCalledTimes(1);

      const mgrReq = createReq(UserRole.MANAGER);
      const mgrNext = vi.fn();
      expect(() => middleware(mgrReq, res, mgrNext)).toThrowError(/Your role does not permit this action/i);
      expect(mgrNext).not.toHaveBeenCalled();
    });
  });

  describe('Dynamic Permission Matrix Updates & Automatic Propagation', () => {
    it('immediately reflects granted permissions in hasPermission and requirePermission without server restarts', () => {
      // Baseline: MANAGER cannot stock-in
      expect(hasPermission(UserRole.MANAGER, 'stock-in.write')).toBe(false);

      // Dynamically grant stock-in.write to MANAGER in matrix
      const original = getEffectiveRolePermissions(UserRole.MANAGER);
      setRolePermissions(UserRole.MANAGER, [...original, 'stock-in.write']);

      // Now hasPermission evaluates true immediately
      expect(hasPermission(UserRole.MANAGER, 'stock-in.write')).toBe(true);

      // Middleware allows MANAGER immediately
      const middleware = requirePermission('stock-in.write');
      const req = {
        user: { id: 'mgr-1', role: UserRole.MANAGER },
      } as unknown as Request;
      const next = vi.fn();

      middleware(req, {} as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('immediately reflects revoked permissions in hasPermission and requirePermission', () => {
      // Baseline: DATA_ENCODER can stock-in
      expect(hasPermission(UserRole.DATA_ENCODER, 'stock-in.write')).toBe(true);

      // Revoke stock-in.write from DATA_ENCODER in matrix
      const updated = getEffectiveRolePermissions(UserRole.DATA_ENCODER).filter(
        (p) => p !== 'stock-in.write'
      );
      setRolePermissions(UserRole.DATA_ENCODER, updated);

      // Now hasPermission evaluates false immediately
      expect(hasPermission(UserRole.DATA_ENCODER, 'stock-in.write')).toBe(false);

      // Middleware blocks DATA_ENCODER immediately
      const middleware = requirePermission('stock-in.write');
      const req = {
        user: { id: 'enc-1', role: UserRole.DATA_ENCODER },
      } as unknown as Request;
      const next = vi.fn();

      expect(() => middleware(req, {} as Response, next)).toThrowError(/Your role does not permit this action/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('dynamically computes allowedTabs and landingTab based on matrix permissions', () => {
      // Baseline MANAGER tabs: ['dashboard', 'reports']
      const baselineAccess = getRoleAccess(UserRole.MANAGER);
      expect(baselineAccess.allowedTabs).toContain('dashboard');
      expect(baselineAccess.allowedTabs).toContain('reports');
      expect(baselineAccess.allowedTabs).not.toContain('assets');

      // Grant stock-in.write to MANAGER in matrix
      setRolePermissions(UserRole.MANAGER, [
        ...baselineAccess.permissions,
        'stock-in.write',
      ]);

      const updatedAccess = getRoleAccess(UserRole.MANAGER);
      expect(updatedAccess.allowedTabs).toContain('assets');
      expect(updatedAccess.allowedTabs).toContain('dashboard');

      // Revoke dashboard.read and grant approvals.endorse
      setRolePermissions(UserRole.MANAGER, ['approvals.endorse', 'reports.read']);
      const recomputed = getRoleAccess(UserRole.MANAGER);
      expect(recomputed.allowedTabs).not.toContain('dashboard');
      expect(recomputed.allowedTabs).toContain('approvals');
      expect(recomputed.allowedTabs).toContain('reports');
      expect(recomputed.landingTab).toBe('approvals');
    });

    it('protects core governance permissions from lockout', () => {
      const protectedPerms = PROTECTED_ROLE_PERMISSIONS[UserRole.SYSTEM_ADMIN] ?? [];
      expect(protectedPerms).toContain('roles.assign');
      expect(protectedPerms).toContain('roles.read');
    });

    it('resets modified role permissions cleanly back to baseline', () => {
      setRolePermissions(UserRole.TEAM_LEADER, ['inventory.read']);
      expect(hasPermission(UserRole.TEAM_LEADER, 'approvals.endorse')).toBe(false);

      resetRolePermissions(UserRole.TEAM_LEADER);
      expect(hasPermission(UserRole.TEAM_LEADER, 'approvals.endorse')).toBe(true);
    });
  });

  describe('Pages each role opens with the built-in permissions', () => {
    const tabsOf = (role: UserRole) => computeAllowedTabs(role, ROLE_POLICY[role].permissions).allowedTabs;

    it('Data Encoders see Reports alongside the Assets register', () => {
      expect(tabsOf(UserRole.DATA_ENCODER)).toEqual(expect.arrayContaining(['assets', 'reports']));
      expect(tabsOf(UserRole.DATA_ENCODER)).not.toContain('approvals');
    });

    it('opens one Assets page in place of Receiving, Issuing and Transfers', () => {
      for (const role of Object.values(UserRole)) {
        for (const retired of ['stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset']) {
          expect(tabsOf(role)).not.toContain(retired);
        }
      }
      expect(computeAllowedTabs(UserRole.DATA_ENCODER, ROLE_POLICY[UserRole.DATA_ENCODER].permissions).landingTab).toBe('assets');
    });

    it('lets approvers follow the Assets register, but not the Manager or System Administrator', () => {
      expect(tabsOf(UserRole.TEAM_LEADER)).toContain('assets');
      expect(tabsOf(UserRole.DEPARTMENT_HEAD)).toContain('assets');
      expect(tabsOf(UserRole.MANAGER)).not.toContain('assets');
      expect(tabsOf(UserRole.SYSTEM_ADMIN)).not.toContain('assets');
    });

    it('Data Encoders do not open System Settings, but still see Employees and Stores', () => {
      expect(tabsOf(UserRole.DATA_ENCODER)).not.toContain('settings-system');
      expect(tabsOf(UserRole.DATA_ENCODER)).toEqual(expect.arrayContaining(['settings-employees', 'settings-stores']));
    });

    it('Team Leaders can look up Employees and Stores, view only', () => {
      expect(tabsOf(UserRole.TEAM_LEADER)).toEqual(expect.arrayContaining(['approvals', 'settings-employees', 'settings-stores']));
      expect(hasPermission(UserRole.TEAM_LEADER, 'employees.manage')).toBe(false);
      expect(hasPermission(UserRole.TEAM_LEADER, 'references.manage')).toBe(false);
    });

    it('Managers keep the dashboard and reports only', () => {
      expect(tabsOf(UserRole.MANAGER).sort()).toEqual(['dashboard', 'reports']);
    });
  });
});
