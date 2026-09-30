import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesktopSidebar } from '../components/layout/DesktopSidebar';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { UserRole } from '../types/asset-management';
import { getValidTabForRole, NAVIGATION_PAGES } from '../utils/navigation';

const auth = vi.hoisted(() => ({
  role: 'DATA_ENCODER',
  user: null,
  logout: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
afterEach(cleanup);

const expectedPages: Record<UserRole, string[]> = {
  DATA_ENCODER: [
    'Stock-In',
    'Stock-Out',
    'Asset Transfer',
    'Employees',
    'Departments',
    'Locations',
    'Stores',
  ],
  TEAM_LEADER: ['Approvals', 'Reports', 'Audit Log'],
  DEPARTMENT_HEAD: [
    'Dashboard',
    'Approvals',
    'Reports',
    'Audit Log',
    'Employees',
    'Departments',
    'Locations',
    'Stores',
  ],
  MANAGER: ['Dashboard', 'Reports', 'Audit Log', 'Departments'],
  SYSTEM_ADMIN: [
    'Dashboard',
    'Reports',
    'Audit Log',
    'Employees',
    'Departments',
    'Locations',
    'Stores',
    'User Accounts',
    'System Settings',
  ],
};

describe('Approved desktop and mobile navigation', () => {
  it.each(Object.values(UserRole))(
    'makes exactly the permitted built pages reachable for %s',
    async (role) => {
      auth.role = role;
      const user = userEvent.setup();
      const navigate = vi.fn();
      render(
        <>
          <DesktopSidebar
            currentRole={role}
            activeTab={getValidTabForRole(role)}
            setActiveTab={navigate}
            collapsed={false}
            onToggleCollapse={vi.fn()}
          />
          <MobileBottomNav
            activeTab={getValidTabForRole(role)}
            setActiveTab={navigate}
          />
        </>
      );
      const desktop = within(
        screen.getByRole('navigation', { name: 'Desktop navigation' })
      );
      const mobile = within(
        screen.getByRole('navigation', { name: 'Mobile navigation' })
      );
      expect(
        desktop
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label'))
      ).toEqual(expectedPages[role]);
      for (const label of expectedPages[role]) {
        if (!mobile.queryByRole('button', { name: label })) {
          await user.click(
            mobile.getByRole('button', { name: 'More' })
          );
        }
        await user.click(
          mobile.getAllByRole('button', { name: label })[0]
        );
        const page = NAVIGATION_PAGES.find((page) => page.label === label)!;
        expect(navigate).toHaveBeenLastCalledWith(page.id);
        expect(getValidTabForRole(role, page.id)).toBe(page.id);
      }
      if (mobile.queryByRole('button', { name: 'More' })) {
        await user.click(
          mobile.getByRole('button', { name: 'More' })
        );
      }
      for (const page of NAVIGATION_PAGES.filter(
        (page) => !expectedPages[role].includes(page.label)
      )) {
        expect(
          mobile.queryByRole('button', { name: page.label })
        ).not.toBeInTheDocument();
        expect(getValidTabForRole(role, page.id)).toBe(
          getValidTabForRole(role)
        );
      }
      const groupLabels = desktop
        .getAllByRole('region')
        .map((group) => group.getAttribute('aria-label'));
      if (role === UserRole.DATA_ENCODER)
        expect(groupLabels).toEqual(['Operations', 'Reference Data']);
      if (role === UserRole.TEAM_LEADER || role === UserRole.MANAGER)
        expect(groupLabels).not.toContain('Administration');
    }
  );

  it('keeps collapsed reference and administration links accessible', async () => {
    auth.role = UserRole.SYSTEM_ADMIN;
    const navigate = vi.fn();
    render(
      <DesktopSidebar
        currentRole={UserRole.SYSTEM_ADMIN}
        activeTab="dashboard"
        setActiveTab={navigate}
        collapsed
        onToggleCollapse={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'User Accounts' })
    );
    expect(navigate).toHaveBeenCalledWith('settings-users');
  });

  it('migrates old employee routes without granting access to admin controls', () => {
    expect(getValidTabForRole(UserRole.DATA_ENCODER, 'settings')).toBe(
      'settings-employees'
    );
    expect(getValidTabForRole(UserRole.DEPARTMENT_HEAD, 'settings-users')).toBe(
      'approvals'
    );
    expect(getValidTabForRole(UserRole.DATA_ENCODER, 'settings-config')).toBe(
      'stock-in'
    );
  });
});
