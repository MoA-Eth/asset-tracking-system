import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '../SettingsPage';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';
import { makeTemporaryPassword } from './UserAccessModals';
import { api } from '../../api/client';
import { UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'admin', permissions: ['roles.assign'] }, refreshSession: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: {
    getEmployees: vi.fn(), getDepartments: vi.fn(), updateEmployeeRole: vi.fn(),
    grantAccess: vi.fn(), removeAccess: vi.fn(), resetEmployeePassword: vi.fn(), changePassword: vi.fn(),
  },
}));

const person = (id: string, fullNameEn: string, role: UserRole | null, extra: object = {}) => ({
  id, fullNameEn, fullNameAm: '', payrollId: `ID-${id}`, departmentId: 'dept', email: null, role, isActive: true, ...extra,
});
const admin = person('admin', 'Admin Person', UserRole.SYSTEM_ADMIN);
const encoder = person('encoder', 'Example Encoder', UserRole.DATA_ENCODER, { mustChangePassword: true });
const staff = person('staff', 'Getahun Bahiru', null);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getEmployees).mockResolvedValue([admin, encoder, staff] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
});

describe('Users page: sign-in access', () => {
  it('lists only people who sign in, and flags a temporary password', async () => {
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    expect(await screen.findByText('Example Encoder')).toBeInTheDocument();
    expect(screen.getByText('Temporary password')).toBeInTheDocument();
    expect(screen.queryByText('Getahun Bahiru')).not.toBeInTheDocument();
  });

  it('gives an employee sign-in with a role and a temporary password', async () => {
    const user = userEvent.setup();
    vi.mocked(api.grantAccess).mockResolvedValue({ ...staff, role: UserRole.TEAM_LEADER, mustChangePassword: true } as any);
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');
    // A searchable dropdown listing every registered employee
    expect(within(dialog).getByText('3 registered employees: 1 can be added, 2 already sign in.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: /^Employee/ }));
    const options = within(within(dialog).getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Getahun Bahiru (ID-staff)', 'Admin Person (ID-admin)System Administrator', 'Example Encoder (ID-encoder)Data Encoder']);
    // People who already sign in are shown, but can't be picked
    await user.click(within(dialog).getByRole('option', { name: /Example Encoder/ }));
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent('Select an employee…');
    await user.click(within(dialog).getByRole('option', { name: /Getahun Bahiru/ }));
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent('Getahun Bahiru (ID-staff)');
    await user.selectOptions(within(dialog).getByLabelText(/^Role/), UserRole.TEAM_LEADER);

    await user.type(within(dialog).getByLabelText(/Temporary password/), 'weak');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(api.grantAccess).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    const generated = (within(dialog).getByLabelText(/Temporary password/) as HTMLInputElement).value;
    expect(generated).toMatch(/^(?=.*[A-Za-z])(?=.*[0-9]).{10}$/);
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(api.grantAccess).toHaveBeenCalledWith('staff', UserRole.TEAM_LEADER, generated);
    expect(await screen.findByText('Getahun Bahiru')).toBeInTheDocument();
  });

  it('resets a password and removes sign-in from the row menu, but not for yourself', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetEmployeePassword).mockResolvedValue({ ...encoder } as any);
    vi.mocked(api.removeAccess).mockResolvedValue({ ...encoder, role: null } as any);
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Admin Person' }));
    expect((screen.getByRole('menuitem', { name: /Remove sign-in/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: /Reset password/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Example Encoder' }));
    await user.click(screen.getByRole('menuitem', { name: /Reset password/ }));
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'fresh-temp-7');
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(api.resetEmployeePassword).toHaveBeenCalledWith('encoder', 'fresh-temp-7');

    await user.click(screen.getByRole('button', { name: 'Actions for Example Encoder' }));
    await user.click(screen.getByRole('menuitem', { name: /Remove sign-in/ }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove sign-in' }));
    expect(api.removeAccess).toHaveBeenCalledWith('encoder');
    expect(screen.queryByText('Example Encoder')).not.toBeInTheDocument();
  });
});

describe('Changing your own password', () => {
  it('checks the new password before sending it', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    vi.mocked(api.changePassword).mockResolvedValue(null);
    render(<ChangePasswordForm onDone={onDone} temporary />);
    await user.type(screen.getByLabelText(/Temporary password/), 'temp-pass-1');
    await user.type(screen.getByLabelText(/^New password\*/), 'short');
    await user.type(screen.getByLabelText(/New password again/), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');

    await user.clear(screen.getByLabelText(/^New password\*/));
    await user.type(screen.getByLabelText(/^New password\*/), 'my-own-pass-9');
    await user.clear(screen.getByLabelText(/New password again/));
    await user.type(screen.getByLabelText(/New password again/), 'different-9');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not the same');
    expect(api.changePassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/New password again/));
    await user.type(screen.getByLabelText(/New password again/), 'my-own-pass-9');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(api.changePassword).toHaveBeenCalledWith('temp-pass-1', 'my-own-pass-9');
    expect(onDone).toHaveBeenCalled();
  });

  it('generates temporary passwords that meet the rule and differ each time', () => {
    const a = makeTemporaryPassword();
    const b = makeTemporaryPassword();
    expect(a).toMatch(/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{10}$/);
    expect(a).not.toBe(b);
  });
});

describe('Add user: the searchable employee dropdown', () => {
  it('lists every registered employee and narrows as you type a name or an employee ID', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 20 }, (_, i) => person(`s${i}`, `Staff Member ${String(i).padStart(2, '0')}`, null));
    vi.mocked(api.getEmployees).mockResolvedValue([admin, encoder, ...many] as any);
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /^Employee/ }));
    // All 22: the 20 who can be added and the 2 who already sign in
    expect(within(within(dialog).getByRole('listbox')).getAllByRole('option')).toHaveLength(22);
    expect(within(dialog).getByText('Can be added (20)')).toBeInTheDocument();
    expect(within(dialog).getByText('Already users (2)')).toBeInTheDocument();

    const search = within(dialog).getByLabelText('Search the list');
    await user.type(search, 'member 07');
    expect(within(within(dialog).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Staff Member 07 (ID-s7)']);
    await user.clear(search);
    await user.type(search, 'id-s12');
    expect(within(within(dialog).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Staff Member 12 (ID-s12)']);

    // Enter picks the highlighted match and closes the list
    await user.keyboard('{Enter}');
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent('Staff Member 12 (ID-s12)');
    expect(within(dialog).queryByRole('listbox')).toBeNull();

    await user.click(within(dialog).getByRole('combobox', { name: /^Employee/ }));
    await user.type(within(dialog).getByLabelText('Search the list'), 'zzz');
    expect(within(dialog).getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('explains what to do when every employee already signs in', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getEmployees).mockResolvedValue([admin, encoder] as any);
    render(<SettingsPage currentRole={UserRole.SYSTEM_ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/All 2 registered employees already sign in/)).toBeInTheDocument();
    expect((within(dialog).getByRole('button', { name: 'Add user' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
