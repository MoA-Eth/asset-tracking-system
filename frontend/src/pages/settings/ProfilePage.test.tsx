import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePage } from './ProfilePage';
import { api } from '../../api/client';

const { mockLogout, mockUser, auth } = vi.hoisted(() => {
  const mockLogout = vi.fn();
  const mockUser = {
    id: 'usr-1',
    payrollId: '00123456',
    fullNameEn: 'Hana Tesfaye',
    fullNameAm: 'ሀና ተስፋዬ',
    email: 'hana@moa.gov.et',
    phone: '+251911000000',
    role: 'SYSTEM_ADMIN' as any,
    departmentId: 'dept-proc',
    permissions: ['roles.assign', 'references.manage'],
  };
  return {
    mockLogout,
    mockUser,
    auth: {
      user: mockUser,
      role: 'SYSTEM_ADMIN' as any,
      logout: mockLogout,
    },
  };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  api: {
    getDepartments: vi.fn(),
    changePassword: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getDepartments).mockResolvedValue([
    { id: 'dept-proc', nameEn: 'Procurement & Property Administration', code: 'PROP' },
  ] as any);
});

describe('ProfilePage', () => {
  it('renders user details, initials, and role banner', async () => {
    render(<ProfilePage />);

    const nameElements = await screen.findAllByText(/Hana Tesfaye/);
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ሀና ተስፋዬ/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System Administrator').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('hana@moa.gov.et').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('00123456')).toBeInTheDocument();
    expect(screen.getByText('+251911000000')).toBeInTheDocument();
    expect(screen.getByText('HT')).toBeInTheDocument();
  });

  it('resolves and displays the user department', async () => {
    render(<ProfilePage />);
    const deptElements = await screen.findAllByText(/Procurement & Property Administration/);
    expect(deptElements.length).toBeGreaterThanOrEqual(1);
  });

  it('triggers sign out when clicked', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    const signOutBtn = await screen.findByRole('button', { name: /Sign out/i });
    await user.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('shows copy button for email and payroll ID', async () => {
    render(<ProfilePage />);
    expect(await screen.findByTitle('Copy email')).toBeInTheDocument();
    expect(screen.getByTitle('Copy Payroll ID')).toBeInTheDocument();
  });
});
