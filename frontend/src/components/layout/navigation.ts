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
import { AuthUser } from '../../types/asset-management';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
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
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'operations',
    label: 'Store Operations',
    items: [
      { id: 'stock-in', label: 'Stock-In', icon: PackagePlus, formTag: 'M19', hint: 'Stock-In — Goods Received (Model 19 / የዕቃ መረከቢያ)' },
      { id: 'stock-out', label: 'Stock-Out', icon: PackageMinus, formTag: 'M22', hint: 'Stock-Out — Property Issued (Model 22 / የዕቃ ወጪ)' },
      { id: 'transfer-asset', label: 'Transfers & Returns', icon: ArrowRightLeft, formTag: 'M21', hint: 'Internal Transfers & Returns to Store (Model 21)' },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    items: [
      { id: 'approvals', label: 'Approvals', icon: FileCheck2, showsPendingCount: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
      { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
    ],
  },
];

export interface SettingsNavGroup {
  label: string;
  items: { id: string; label: string; icon: LucideIcon }[];
}

export const SETTINGS_NAV: { label: string; icon: LucideIcon; groups: SettingsNavGroup[] } = {
  label: 'Settings',
  icon: Settings,
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
        { id: 'settings-stores', label: 'Stores', icon: Warehouse },
      ],
    },
    {
      label: 'System',
      items: [{ id: 'settings-system', label: 'System Settings', icon: Sliders }],
    },
  ],
};

/** UI consumes the session policy returned by the API; no second role matrix. */
export function getValidTab(user: Pick<AuthUser, 'allowedTabs' | 'landingTab'> | null, candidate?: string | null): string {
  const allowed = user?.allowedTabs ?? [];
  if (candidate && allowed.includes(candidate)) return candidate;
  return user?.landingTab && allowed.includes(user.landingTab) ? user.landingTab : (allowed[0] ?? '');
}

export function getNavSections(allowedTabs: readonly string[] = []): NavSection[] {
  return NAV_SECTIONS.map((section) => ({ ...section,
    items: section.items.filter((item) => allowedTabs.includes(item.id)),
  })).filter((section) => section.items.length > 0);
}

export function getSettingsGroups(allowedTabs: readonly string[] = []): SettingsNavGroup[] {
  return SETTINGS_NAV.groups.map((group) => ({ ...group,
    items: group.items.filter((item) => allowedTabs.includes(item.id)),
  })).filter((group) => group.items.length > 0);
}

export function getMobileNavItems(allowedTabs: readonly string[] = []): { id: string; label: string; icon: LucideIcon; matches: (tab: string) => boolean }[] {
  const main = getNavSections(allowedTabs).flatMap((section) => section.items.map((item) => ({
    id: item.id, label: item.id === 'transfer-asset' ? 'Transfers' : item.label, icon: item.icon,
    matches: (tab: string) => tab === item.id,
  })));
  const firstSettings = getSettingsGroups(allowedTabs)[0]?.items[0];
  return firstSettings ? [...main, { id: firstSettings.id, label: 'Settings', icon: SETTINGS_NAV.icon,
    matches: (tab: string) => tab.startsWith('settings-'),
  }] : main;
}
