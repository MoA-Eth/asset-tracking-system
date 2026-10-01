import {
  LayoutDashboard,
  FileCheck2,
  PackagePlus,
  PackageMinus,
  ArrowRightLeft,
  FileSpreadsheet,
  ShieldCheck,
  Settings,
  Users,
  Shield,
  UserCheck,
  Building2,
  MapPin,
  Warehouse,
  Sliders,
  LucideIcon,
} from 'lucide-react';
import { UserRole } from '../../types/asset-management';

// Single source for the sidebar and the mobile bottom bar.
// Role lists must match ALLOWED_TABS_FOR_ROLE in App.tsx.

const TOP_MANAGEMENT = 'TOP_MANAGEMENT' as UserRole;
const SETTINGS_ROLES = [UserRole.SYSTEM_ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.DATA_ENCODER];
const OVERSIGHT_ROLES = [UserRole.SYSTEM_ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.TEAM_LEADER];

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** Short statutory form tag shown beside the label, e.g. "M19" */
  formTag?: string;
  /** Hover text with the full form name */
  hint?: string;
  showsPendingCount?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.MANAGER, UserRole.SYSTEM_ADMIN, TOP_MANAGEMENT] },
    ],
  },
  {
    id: 'operations',
    label: 'Store Operations',
    items: [
      { id: 'stock-in', label: 'Stock-In', icon: PackagePlus, roles: [UserRole.DATA_ENCODER], formTag: 'M19', hint: 'Stock-In — Goods Received (Model 19 / የዕቃ መረከቢያ)' },
      { id: 'stock-out', label: 'Stock-Out', icon: PackageMinus, roles: [UserRole.DATA_ENCODER], formTag: 'M22', hint: 'Stock-Out — Property Issued (Model 22 / የዕቃ ወጪ)' },
      { id: 'transfer-asset', label: 'Transfers & Returns', icon: ArrowRightLeft, roles: [UserRole.DATA_ENCODER], formTag: 'M21', hint: 'Internal Transfers & Returns to Store (Model 21)' },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    items: [
      { id: 'approvals', label: 'Approvals', icon: FileCheck2, roles: [UserRole.DEPARTMENT_HEAD, UserRole.TEAM_LEADER], showsPendingCount: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: FileSpreadsheet, roles: [...OVERSIGHT_ROLES, UserRole.MANAGER, TOP_MANAGEMENT] },
      { id: 'audit', label: 'Audit Log', icon: ShieldCheck, roles: OVERSIGHT_ROLES },
    ],
  },
];

export interface SettingsNavGroup {
  label: string;
  items: { id: string; label: string; icon: LucideIcon }[];
}

export const SETTINGS_NAV: { label: string; icon: LucideIcon; roles: UserRole[]; groups: SettingsNavGroup[] } = {
  label: 'Settings',
  icon: Settings,
  roles: SETTINGS_ROLES,
  groups: [
    {
      label: 'People',
      items: [
        { id: 'settings-users', label: 'Users', icon: Users },
        { id: 'settings-roles', label: 'Roles', icon: Shield },
        { id: 'settings-employees', label: 'Employees', icon: UserCheck },
      ],
    },
    {
      label: 'Organization',
      items: [
        { id: 'settings-departments', label: 'Departments', icon: Building2 },
        { id: 'settings-locations', label: 'Locations', icon: MapPin },
        { id: 'settings-stores', label: 'Stores', icon: Warehouse },
      ],
    },
    {
      label: 'System',
      items: [{ id: 'settings-system', label: 'System Settings', icon: Sliders }],
    },
  ],
};

/** Sections that contain at least one item the role can open. */
export function getNavSectionsForRole(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export function canSeeSettings(role: UserRole): boolean {
  return SETTINGS_NAV.roles.includes(role);
}

/** Flat list for the mobile bottom bar: main items first, then Settings. */
export function getMobileNavItems(role: UserRole): { id: string; label: string; icon: LucideIcon; matches: (tab: string) => boolean }[] {
  const main = getNavSectionsForRole(role).flatMap((s) =>
    s.items.map((item) => ({
      id: item.id,
      label: item.id === 'transfer-asset' ? 'Transfers' : item.label,
      icon: item.icon,
      matches: (tab: string) => tab === item.id,
    }))
  );
  const settings = canSeeSettings(role)
    ? [{ id: 'settings-users', label: 'Settings', icon: SETTINGS_NAV.icon, matches: (tab: string) => tab.startsWith('settings') }]
    : [];
  return [...main, ...settings];
}
