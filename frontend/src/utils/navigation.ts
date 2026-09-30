import { UserRole } from '../types/asset-management';

const {
  SYSTEM_ADMIN: admin,
  DATA_ENCODER: encoder,
  TEAM_LEADER: leader,
  DEPARTMENT_HEAD: head,
  MANAGER: manager,
} = UserRole;

export const DEFAULT_TAB_FOR_ROLE: Record<string, string> = {
  [admin]: 'dashboard',
  [encoder]: 'stock-in',
  [leader]: 'approvals',
  [head]: 'approvals',
  [manager]: 'dashboard',
};

export const NAVIGATION_GROUPS = [
  'Operations',
  'Oversight',
  'Reference Data',
  'Administration',
] as const;
export interface NavigationPage {
  id: string;
  label: string;
  group: (typeof NAVIGATION_GROUPS)[number];
  roles: UserRole[];
  available: boolean;
}

// The approved page access map. Planned pages cannot be opened until built.
export const NAVIGATION_PAGES: NavigationPage[] = [
  {
    id: 'stock-in',
    label: 'Stock-In',
    group: 'Operations',
    roles: [encoder],
    available: true,
  },
  {
    id: 'stock-out',
    label: 'Stock-Out',
    group: 'Operations',
    roles: [encoder],
    available: true,
  },
  {
    id: 'transfer-asset',
    label: 'Asset Transfer',
    group: 'Operations',
    roles: [encoder],
    available: true,
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'Oversight',
    roles: [head, manager, admin],
    available: true,
  },
  {
    id: 'approvals',
    label: 'Approvals',
    group: 'Oversight',
    roles: [leader, head],
    available: true,
  },
  {
    id: 'reports',
    label: 'Reports',
    group: 'Oversight',
    roles: [leader, head, manager, admin],
    available: true,
  },
  {
    id: 'audit',
    label: 'Audit Log',
    group: 'Oversight',
    roles: [leader, head, manager, admin],
    available: true,
  },
  {
    id: 'settings-employees',
    label: 'Employees',
    group: 'Reference Data',
    roles: [encoder, head, admin],
    available: true,
  },
  {
    id: 'settings-departments',
    label: 'Departments',
    group: 'Reference Data',
    roles: [encoder, head, manager, admin],
    available: true,
  },
  {
    id: 'settings-locations',
    label: 'Locations',
    group: 'Reference Data',
    roles: [encoder, head, admin],
    available: true,
  },
  {
    id: 'settings-stores',
    label: 'Stores',
    group: 'Reference Data',
    roles: [encoder, head, admin],
    available: true,
  },
  {
    id: 'settings-users',
    label: 'User Accounts',
    group: 'Administration',
    roles: [admin],
    available: true,
  },
  {
    id: 'settings-matrix',
    label: 'Roles & Approval Matrix',
    group: 'Administration',
    roles: [admin],
    available: false,
  },
  {
    id: 'settings-system',
    label: 'System Settings',
    group: 'Administration',
    roles: [admin],
    available: true,
  },
  {
    id: 'settings-department-options',
    label: 'Department Settings',
    group: 'Administration',
    roles: [head, admin],
    available: false,
  },
];

export function getNavigationPages(role: UserRole): NavigationPage[] {
  return NAVIGATION_PAGES.filter(
    (page) => page.available && page.roles.includes(role)
  );
}

export function getNavigationGroups(role: UserRole) {
  const pages = getNavigationPages(role);
  return NAVIGATION_GROUPS.map((label) => ({
    label,
    pages: pages.filter((page) => page.group === label),
  })).filter((group) => group.pages.length > 0);
}

export const ALLOWED_TABS_FOR_ROLE: Record<string, string[]> =
  Object.fromEntries(
    Object.values(UserRole).map((role) => [
      role,
      getNavigationPages(role).map((page) => page.id),
    ])
  );

const LEGACY_TABS: Record<string, string> = {
  settings: 'settings-employees',
  'assign-asset': 'stock-out',
  'return-asset': 'transfer-asset',
};

export function getValidTabForRole(
  role: UserRole,
  candidateTab?: string | null
): string {
  const tab = candidateTab
    ? (LEGACY_TABS[candidateTab] ?? candidateTab)
    : undefined;
  if (tab && ALLOWED_TABS_FOR_ROLE[role]?.includes(tab)) return tab;
  return DEFAULT_TAB_FOR_ROLE[role] || '';
}
