import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolesPage } from './RolesPage';
import { api } from '../../api/client';
import { ROLE_POLICY, PERMISSION_GROUPS } from '../../../../backend/src/security/role-policy';

const auth = vi.hoisted(() => ({ user: { permissions: ['roles.read'] } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../api/client', () => ({
  api: {
    getRoles: vi.fn(),
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
    updateRolePermissions: vi.fn(),
    resetRolePermissions: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['roles.read'];
  vi.mocked(api.getRoles).mockResolvedValue({ permissionGroups: PERMISSION_GROUPS,
    roles: Object.entries(ROLE_POLICY).map(([code, role]) => ({ ...role, code, system: true, memberCount: code === 'MANAGER' ? 1 : 0 })),
  } as any);
  vi.mocked(api.getEmployees).mockResolvedValue([{ id: 'manager', role: 'MANAGER', fullNameEn: 'Example Manager', departmentId: 'dept', email: 'manager@example.test' }] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([{ id: 'dept', nameEn: 'Example Directorate' }] as any);
});

describe('Roles directory', () => {
  it('renders five roles, real counts, grouped allowed/denied permissions and assigned members', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(<RolesPage onViewUsers={navigate} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await user.click(await screen.findByRole('button', { name: 'View Manager details' }));
    const details = screen.getByRole('region', { name: 'Manager details' });
    expect(within(details).getByText('Example Manager')).toBeInTheDocument();
    expect(within(details).getByText('Example Directorate')).toBeInTheDocument();
    expect(within(details).getByText(/View executive dashboard/)).toHaveTextContent('Allowed');
    expect(within(details).getByText(/Authorize or reject Stage 2/)).toHaveTextContent('Not allowed');
    expect(screen.getAllByRole('button', { name: /View .* details/ })).toHaveLength(5);
    await user.click(within(details).getByRole('button', { name: 'Manage assignments' }));
    expect(navigate).toHaveBeenCalledWith('MANAGER');
  });
  it('shows all five roles as columns, and the details of a role nobody has', async () => {
    const user = userEvent.setup();
    render(<RolesPage onViewUsers={vi.fn()} />);
    expect(await screen.findAllByRole('button', { name: /View .* details/ })).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'View Team Leader details' }));
    expect(screen.getByText('No users are assigned to this role.')).toBeInTheDocument();
    // Opening another role replaces the panel; clicking the open one closes it
    await user.click(screen.getByRole('button', { name: 'View Manager details' }));
    expect(screen.queryByRole('region', { name: 'Team Leader details' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Manager details' }));
    expect(screen.queryByRole('region', { name: 'Manager details' })).not.toBeInTheDocument();
  });

  it('offers Reset to defaults in the details panel, for administrators only', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['roles.read', 'roles.assign'];
    render(<RolesPage onViewUsers={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'View Manager details' }));
    const details = screen.getByRole('region', { name: 'Manager details' });
    await user.click(within(details).getByRole('button', { name: 'Reset to defaults' }));
    expect(screen.getByText('Reset Role to Statutory Defaults')).toBeInTheDocument();
  });
  it('shows failures and retries loading', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getRoles).mockRejectedValueOnce(new Error('Database unavailable'));
    render(<RolesPage onViewUsers={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'View Manager details' })).toBeInTheDocument();
  });
  it('does not fetch administration data without access', () => {
    auth.user.permissions = [];
    render(<RolesPage onViewUsers={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Only System Administrators');
    expect(api.getRoles).not.toHaveBeenCalled();
  });

  it('allows system administrator to toggle permissions and save changes', async () => {
    auth.user.permissions = ['roles.read', 'roles.assign'];
    vi.mocked(api.updateRolePermissions).mockResolvedValue({
      permissionGroups: PERMISSION_GROUPS,
      roles: Object.entries(ROLE_POLICY).map(([code, role]) => ({
        ...role,
        code,
        system: true,
        memberCount: 0,
      })),
    } as any);

    const user = userEvent.setup();
    render(<RolesPage onViewUsers={vi.fn()} />);
    await screen.findByRole('button', { name: 'View Manager details' });

    // Find toggle for Manager role on 'Register and correct stock-in' (stock-in.write)
    const toggle = screen.getByRole('switch', { name: /Grant Register and correct stock-in for Manager/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Toggle permission ON
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 unsaved change in 1 role');

    // One place to save
    expect(screen.getAllByRole('button', { name: /^Save changes/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save changes (1)' }));

    // Confirmation modal should appear with diff
    expect(screen.getByText('Confirm Permission Changes')).toBeInTheDocument();
    expect(screen.getByText(/\+ Granted: Register and correct stock-in/)).toBeInTheDocument();

    // Confirm save
    await user.click(screen.getByRole('button', { name: 'Confirm & Apply' }));
    expect(api.updateRolePermissions).toHaveBeenCalledWith('MANAGER', expect.arrayContaining(['stock-in.write']));
  });

  it('protects core system administrator permissions against lockout', async () => {
    auth.user.permissions = ['roles.read', 'roles.assign'];
    render(<RolesPage onViewUsers={vi.fn()} />);
    await screen.findByRole('button', { name: 'View Manager details' });

    // System Administrator's roles.assign and roles.read should display "Core"
    const coreBadges = screen.getAllByText('Core');
    expect(coreBadges.length).toBeGreaterThanOrEqual(2);
  });
});

