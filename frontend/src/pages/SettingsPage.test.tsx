import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { ToastProvider } from '../context/ToastContext';
import { UserRole, type Employee } from '../types/asset-management';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
    updateEmployeeRole: vi.fn(),
  },
}));
const employee = {
  id: 'EMP-1',
  fullNameEn: 'Registry Staff',
  fullNameAm: 'Staff',
  email: 'staff@example.test',
  departmentId: 'DEP-1',
  role: UserRole.DATA_ENCODER,
} as Employee;
beforeEach(() => {
  vi.mocked(api.getEmployees).mockResolvedValue([employee]);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.updateEmployeeRole).mockReset();
});

describe('Existing settings views honor page permissions', () => {
  it.each([UserRole.DATA_ENCODER, UserRole.DEPARTMENT_HEAD])(
    'shows a read-only directory for %s',
    async (role) => {
      render(
        <ToastProvider>
          <SettingsPage currentRole={role} section="employees" />
        </ToastProvider>
      );
      await screen.findByText('Registry Staff');
      expect(
        screen.queryByRole('combobox', { name: /Role for/ })
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Update Role')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Mandatory|Optional/ })
      ).not.toBeInTheDocument();
    }
  );

  it.each(['users', 'policies'] as const)(
    'blocks non-admin access to the %s view',
    (section) => {
      render(
        <ToastProvider>
          <SettingsPage
            currentRole={UserRole.DEPARTMENT_HEAD}
            section={section}
          />
        </ToastProvider>
      );
      expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    }
  );

  it('lets the administrator change a role from User Accounts', async () => {
    vi.mocked(api.updateEmployeeRole).mockResolvedValue({
      ...employee,
      role: UserRole.TEAM_LEADER,
    });
    render(
      <ToastProvider>
        <SettingsPage currentRole={UserRole.SYSTEM_ADMIN} section="users" />
      </ToastProvider>
    );
    const control = await screen.findByRole('combobox', {
      name: 'Role for Registry Staff',
    });
    await userEvent.selectOptions(control, UserRole.TEAM_LEADER);
    expect(api.updateEmployeeRole).toHaveBeenCalledWith(
      'EMP-1',
      UserRole.TEAM_LEADER
    );
    expect(
      await screen.findByText(/Role updated to TEAM LEADER/)
    ).toBeInTheDocument();
  });
});
