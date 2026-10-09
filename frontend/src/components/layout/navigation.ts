import {
  LayoutDashboard,
  FileCheck2,
  Boxes,
  BookOpen,
  PackageCheck,
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
  User,
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
  /** Open to everyone who is signed in, whatever the role allows (the user manual) */
  always?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'mine',
    label: 'My assets',
    items: [
      { id: 'my-assets', label: 'My assets', icon: PackageCheck, hint: 'The assets assigned to you' },
    ],
  },
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'operations',
    label: 'Inventory',
    items: [
      { id: 'assets', label: 'Assets', icon: Boxes, hint: 'Assets — receive (Model 19), issue (Model 22), transfer or return (Model 21)' },
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
    label: 'Reports',
    items: [
      { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
      { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { id: 'docs', label: 'Documentation', icon: BookOpen, hint: 'The user manual', always: true },
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
      label: 'Account',
      items: [
        { id: 'settings-profile', label: 'Profile', icon: User },
      ],
    },
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
        { id: 'settings-stores', label: 'Stores', icon: Warehouse },
      ],
    },
    {
      label: 'System',
      items: [{ id: 'settings-system', label: 'System Settings', icon: Sliders }],
    },
  ],
};

/** Pages merged into Assets; saved tabs and old links still land there */
const RETIRED_TABS: Record<string, string> = {
  'stock-in': 'assets',
  'stock-out': 'assets',
  'assign-asset': 'assets',
  'transfer-asset': 'assets',
  'return-asset': 'assets',
};

/** UI consumes the session policy returned by the API; no second role matrix. */
export function getValidTab(user: Pick<AuthUser, 'allowedTabs' | 'landingTab'> | null, requested?: string | null): string {
  const allowed = user?.allowedTabs ?? [];
  const candidate = requested ? RETIRED_TABS[requested] ?? requested : requested;
  // Profile and the user manual are for everyone
  if (candidate === 'settings-profile' || candidate === 'docs') return candidate;
  if (candidate && allowed.includes(candidate)) return candidate;
  return user?.landingTab && allowed.includes(user.landingTab) ? user.landingTab : (allowed[0] ?? '');
}

export function getNavSections(allowedTabs: readonly string[] = []): NavSection[] {
  return NAV_SECTIONS.map((section) => ({ ...section,
    items: section.items.filter((item) => item.always || allowedTabs.includes(item.id)),
  })).filter((section) => section.items.length > 0);
}

export function getSettingsGroups(allowedTabs: readonly string[] = []): SettingsNavGroup[] {
  return SETTINGS_NAV.groups.map((group) => ({ ...group,
    items: group.items.filter((item) => allowedTabs.includes(item.id)),
  })).filter((group) => group.items.length > 0);
}

export function getMobileNavItems(allowedTabs: readonly string[] = []): { id: string; label: string; icon: LucideIcon; matches: (tab: string) => boolean }[] {
  const main = getNavSections(allowedTabs).flatMap((section) => section.items.filter((item) => !item.always).map((item) => ({
    id: item.id, label: item.label, icon: item.icon,
    matches: (tab: string) => tab === item.id,
  })));
  const firstSettings = getSettingsGroups(allowedTabs)[0]?.items[0];
  return firstSettings ? [...main, { id: firstSettings.id, label: 'Settings', icon: SETTINGS_NAV.icon,
    matches: (tab: string) => tab.startsWith('settings-'),
  }] : main;
}
