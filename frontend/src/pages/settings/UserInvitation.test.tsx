import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '../SettingsPage';
import { api } from '../../api/client';
import { UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'admin', permissions: ['roles.assign'] }, refreshSession: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: {
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
    inviteUser: vi.fn(),
    grantAccess: vi.fn(),
    removeAccess: vi.fn(),
    resetEmployeePassword: vi.fn(),
  },
}));

const person = (id: string, fullNameEn: string, role: UserRole | null, extra: object = {}) => ({
  id, fullNameEn, fullNameAm: '', payrollId: `ID-${id}`, departmentId: 'dept', email: `${id}@moa.gov.et`, role, isActive: true, ...extra,
});
const admin = person('admin', 'Admin Person', UserRole.SYSTEM_ADMIN);
const staff = person('staff', 'Getahun Bahiru', null, { email: 'getahun@moa.gov.et' });
const encoder = person('encoder', 'Example Encoder', UserRole.DATA_ENCODER, { email: 'encoder@moa.gov.et' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getEmployees).mockResolvedValue([admin, encoder, staff] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
});

describe('User Invitation in SettingsPage', () => {
  it('allows sending an email invitation from AddUserModal', async () => {
    const user = userEvent.setup();
    vi.mocked(api.inviteUser).mockResolvedValue({
      employee: { ...staff, role: UserRole.DATA_ENCODER, email: 'getahun@moa.gov.et' } as any,
      invitationLink: 'http://localhost:3000/create-password?token=sample-token',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');

    // Switch to Send Email Invite tab
    await user.click(within(dialog).getByRole('button', { name: /Send Email Invite/ }));

    // Select employee
    await user.click(within(dialog).getByRole('combobox', { name: /^Employee/ }));
    await user.click(within(dialog).getByRole('option', { name: /Getahun Bahiru/ }));

    // Select role
    await user.selectOptions(within(dialog).getByLabelText(/^Role/), UserRole.DATA_ENCODER);

    // Verify email field is pre-filled from employee record
    const emailInput = within(dialog).getByLabelText(/Email address/) as HTMLInputElement;
    expect(emailInput.value).toBe('getahun@moa.gov.et');

    // Submit invitation
    await user.click(within(dialog).getByRole('button', { name: 'Send Invitation' }));

    expect(api.inviteUser).toHaveBeenCalledWith('staff', UserRole.DATA_ENCODER, 'getahun@moa.gov.et');
    expect(toast.success).toHaveBeenCalledWith(
      'Invitation Sent',
      expect.stringContaining('getahun@moa.gov.et'),
    );
  });

  it('allows resending an invitation from row menu', async () => {
    const user = userEvent.setup();
    vi.mocked(api.inviteUser).mockResolvedValue({
      employee: { ...encoder } as any,
      invitationLink: 'http://localhost:3000/create-password?token=sample-token',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Example Encoder' }));
    await user.click(screen.getByRole('menuitem', { name: /Resend invitation/ }));

    expect(api.inviteUser).toHaveBeenCalledWith('encoder', UserRole.DATA_ENCODER, 'encoder@moa.gov.et');
    expect(toast.success).toHaveBeenCalledWith(
      'Invitation resent',
      expect.stringContaining('encoder@moa.gov.et'),
    );
  });
});

