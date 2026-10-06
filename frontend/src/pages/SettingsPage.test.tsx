import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

const auth = vi.hoisted(() => ({ user: { permissions: ['roles.assign'] }, refreshSession: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({ api: { getEmployees: vi.fn(), getDepartments: vi.fn(), updateEmployeeRole: vi.fn() } }));
const encoder = { id: 'encoder', payrollId: '00275823', fullNameEn: 'Example Encoder', fullNameAm: '', role: UserRole.DATA_ENCODER, email: 'encoder@example.test', departmentId: 'dept', isActive: true };

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['roles.assign'];
  vi.mocked(api.getEmployees).mockResolvedValue([encoder, { ...encoder, id: 'manager', payrollId: '00012345', fullNameEn: 'Example Manager', role: UserRole.MANAGER }] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
});
describe('Role assignments in Users', () => {
  it('opens with the selected role filter and allows clearing it', async () => {
    const user = userEvent.setup();
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} initialRoleFilter={UserRole.MANAGER} />);
    expect(await screen.findByText('Example Manager')).toBeInTheDocument();
    expect(screen.queryByText('Example Encoder')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filter users/i }));
    await user.selectOptions(screen.getByLabelText('Filter users by role'), 'ALL');
    expect(screen.getByText('Example Encoder')).toBeInTheDocument();
  });
  it('shows each user\'s Employee ID, sortable like the other columns', async () => {
    const user = userEvent.setup();
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    expect(await screen.findByRole('columnheader', { name: /Employee ID/ })).toBeInTheDocument();
    expect(screen.getByText('00275823')).toBeInTheDocument();
    expect(screen.getByText('00012345')).toBeInTheDocument();

    const ids = () => screen.getAllByText(/^\d{8}$/).map((el) => el.textContent);
    await user.click(screen.getByRole('button', { name: /Employee ID/ }));
    expect(ids()).toEqual(['00012345', '00275823']);
    await user.click(screen.getByRole('button', { name: /Employee ID/ }));
    expect(ids()).toEqual(['00275823', '00012345']);
  });
  it('persists a change, refreshes the session, and leaves the saved role intact on failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateEmployeeRole).mockResolvedValueOnce({ ...encoder, role: UserRole.TEAM_LEADER } as any);
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    const field = await screen.findByLabelText('Role for Example Encoder');
    await user.selectOptions(field, UserRole.TEAM_LEADER);
    await waitFor(() => expect(auth.refreshSession).toHaveBeenCalled());
    expect(field).toHaveValue(UserRole.TEAM_LEADER);
    vi.mocked(api.updateEmployeeRole).mockRejectedValueOnce(new Error('Role change rejected'));
    await user.selectOptions(field, UserRole.SYSTEM_ADMIN);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Role Update Failed', 'Role change rejected'));
    expect(field).toHaveValue(UserRole.TEAM_LEADER);
  });
});
