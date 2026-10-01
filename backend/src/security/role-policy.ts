import { UserRole } from '../types/asset-management';

export const PERMISSION_GROUPS = [
  { name: 'Store Operations', permissions: [
    { key: 'inventory.read', label: 'View inventory and asset details' },
    { key: 'stock-in.write', label: 'Register and correct stock-in' },
    { key: 'stock-out.write', label: 'Request and correct stock-out' },
    { key: 'transfers.write', label: 'Request transfers and returns' },
    { key: 'slips.upload', label: 'Upload IFMIS slips' },
  ] },
  { name: 'Approvals', permissions: [
    { key: 'approvals.read', label: 'View transaction requests' },
    { key: 'approvals.endorse', label: 'Endorse or reject Stage 1' },
    { key: 'approvals.authorize', label: 'Authorize or reject Stage 2' },
  ] },
  { name: 'Reports & Audit', permissions: [
    { key: 'dashboard.read', label: 'View executive dashboard' },
    { key: 'reports.read', label: 'View operational reports' },
    { key: 'audit.read', label: 'View audit log' },
  ] },
  { name: 'Administration', permissions: [
    { key: 'references.read', label: 'View employees, departments, and locations' },
    { key: 'roles.read', label: 'View role permissions and membership' },
    { key: 'roles.assign', label: 'Assign user roles' },
  ] },
] as const;

export type Permission = typeof PERMISSION_GROUPS[number]['permissions'][number]['key'];

const referenceTabs = ['settings-employees', 'settings-departments', 'settings-locations', 'settings-stores', 'settings-system'];
const readPermissions: Permission[] = ['inventory.read', 'references.read'];

// Authoritative policy for API guards, the role directory, and session navigation.
export const ROLE_POLICY: Record<UserRole, {
  name: string; description: string; approvalResponsibility: string;
  permissions: Permission[]; allowedTabs: string[]; landingTab: string;
}> = {
  SYSTEM_ADMIN: {
    name: 'System Administrator', description: 'Administers user access and platform governance.',
    approvalResponsibility: 'No approval authority',
    permissions: [...readPermissions, 'dashboard.read', 'reports.read', 'audit.read', 'roles.read', 'roles.assign'],
    allowedTabs: ['dashboard', 'reports', 'audit', 'settings-users', 'settings-roles', ...referenceTabs], landingTab: 'dashboard',
  },
  DATA_ENCODER: {
    name: 'Data Encoder', description: 'Records stock-in, requests stock-out, and initiates transfers and returns.',
    approvalResponsibility: 'Submits requests; cannot approve',
    permissions: [...readPermissions, 'stock-in.write', 'stock-out.write', 'transfers.write', 'slips.upload', 'approvals.read'],
    allowedTabs: ['stock-in', 'stock-out', 'assign-asset', 'transfer-asset', 'return-asset', ...referenceTabs], landingTab: 'stock-in',
  },
  TEAM_LEADER: {
    name: 'Team Leader', description: 'Reviews technical details before final authorization.',
    approvalResponsibility: 'Stage 1 — endorse or reject',
    permissions: [...readPermissions, 'approvals.read', 'approvals.endorse', 'reports.read', 'audit.read'],
    allowedTabs: ['approvals', 'reports', 'audit'], landingTab: 'approvals',
  },
  DEPARTMENT_HEAD: {
    name: 'Department Head', description: 'Authorizes endorsed requests and oversees directorate assets.',
    approvalResponsibility: 'Stage 2 — authorize or reject',
    permissions: [...readPermissions, 'approvals.read', 'approvals.authorize', 'reports.read', 'audit.read'],
    allowedTabs: ['approvals', 'reports', 'audit', ...referenceTabs], landingTab: 'approvals',
  },
  MANAGER: {
    name: 'Manager', description: 'Monitors the asset portfolio through the executive dashboard and reports.',
    approvalResponsibility: 'No approval authority',
    permissions: [...readPermissions, 'dashboard.read', 'reports.read'],
    allowedTabs: ['dashboard', 'reports'], landingTab: 'dashboard',
  },
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLE_POLICY, value);
}

// In-memory store for dynamic permission overrides with default fallback
const dynamicPermissions: Partial<Record<UserRole, Permission[]>> = {};

export const PROTECTED_ROLE_PERMISSIONS: Partial<Record<UserRole, Permission[]>> = {
  SYSTEM_ADMIN: ['roles.assign', 'roles.read'],
};

export function getEffectiveRolePermissions(role: UserRole): Permission[] {
  if (dynamicPermissions[role]) {
    return [...dynamicPermissions[role]!];
  }
  return [...(ROLE_POLICY[role]?.permissions ?? [])];
}

export function setRolePermissions(role: UserRole, permissions: Permission[]): void {
  dynamicPermissions[role] = [...permissions];
}

export function resetRolePermissions(role: UserRole): Permission[] {
  delete dynamicPermissions[role];
  return [...(ROLE_POLICY[role]?.permissions ?? [])];
}

export function resetAllRolePermissions(): void {
  for (const key of Object.keys(dynamicPermissions)) {
    delete dynamicPermissions[key as UserRole];
  }
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  return isUserRole(role) && getEffectiveRolePermissions(role).includes(permission);
}

export function computeAllowedTabs(role: UserRole, permissions: Permission[]): { allowedTabs: string[]; landingTab: string } {
  const policy = ROLE_POLICY[role];
  if (!policy) return { allowedTabs: [], landingTab: '' };

  const tabs = new Set<string>();

  if (permissions.includes('dashboard.read')) tabs.add('dashboard');
  if (permissions.includes('stock-in.write')) tabs.add('stock-in');
  if (permissions.includes('stock-out.write')) {
    tabs.add('stock-out');
    tabs.add('assign-asset');
  }
  if (permissions.includes('transfers.write')) {
    tabs.add('transfer-asset');
    tabs.add('return-asset');
  }
  if (permissions.includes('approvals.endorse') || permissions.includes('approvals.authorize')) {
    tabs.add('approvals');
  }
  if (permissions.includes('reports.read')) tabs.add('reports');
  if (permissions.includes('audit.read')) tabs.add('audit');
  if (permissions.includes('roles.assign')) tabs.add('settings-users');
  if (permissions.includes('roles.read')) tabs.add('settings-roles');
  if (permissions.includes('references.read')) {
    if (role === UserRole.SYSTEM_ADMIN || role === UserRole.DATA_ENCODER || role === UserRole.DEPARTMENT_HEAD) {
      referenceTabs.forEach((t) => tabs.add(t));
    }
  }

  const allowedTabs = Array.from(tabs);
  const landingTab = allowedTabs.includes(policy.landingTab)
    ? policy.landingTab
    : (allowedTabs[0] ?? '');

  return { allowedTabs, landingTab };
}

export function getRoleAccess(role: unknown) {
  if (!isUserRole(role)) {
    return {
      permissions: [],
      allowedTabs: [],
      landingTab: '',
    };
  }
  const permissions = getEffectiveRolePermissions(role);
  const { allowedTabs, landingTab } = computeAllowedTabs(role, permissions);
  return {
    permissions,
    allowedTabs,
    landingTab,
  };
}

