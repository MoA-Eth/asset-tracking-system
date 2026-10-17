import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordPage } from './ChangePasswordPage';
import { api } from '../api/client';

const mockRefreshSession = vi.fn();
const mockLogout = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { fullNameEn: 'Abebe Bikila', requiresPasswordChange: true },
    refreshSession: mockRefreshSession,
    logout: mockLogout,
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

vi.mock('../components/ui/MoaLogo', () => ({
  MoaLogo: (props: any) => <div data-testid="moa-logo" {...props}>MOA LOGO</div>,
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return {
    ...actual,
    api: {
      ...actual.api,
      changePassword: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ChangePasswordPage', () => {
  it('renders Choose a New Password heading, inputs, and submit button clearly visible', () => {
    render(<ChangePasswordPage />);

    expect(screen.getByTestId('moa-logo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Choose a New Password/i })).toBeInTheDocument();
    expect(screen.getByText(/Abebe Bikila, your password is temporary/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter temporary password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Min. 8 characters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-type new password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set Permanent Password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();
  });

  it('submits changed password and refreshes session on success', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockResolvedValue({ message: 'Success' } as any);

    render(<ChangePasswordPage />);

    await user.type(screen.getByPlaceholderText('Enter temporary password'), 'TempPass123');
    await user.type(screen.getByPlaceholderText('Min. 8 characters'), 'NewPermPassword1');
    await user.type(screen.getByPlaceholderText('Re-type new password'), 'NewPermPassword1');

    const submitBtn = screen.getByRole('button', { name: /Set Permanent Password/i });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    expect(api.changePassword).toHaveBeenCalledWith('TempPass123', 'NewPermPassword1');
    expect(mockToast.success).toHaveBeenCalledWith('Password Updated', expect.any(String));
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('shows error if new passwords do not match', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByPlaceholderText('Enter temporary password'), 'TempPass123');
    await user.type(screen.getByPlaceholderText('Min. 8 characters'), 'NewPermPassword1');
    await user.type(screen.getByPlaceholderText('Re-type new password'), 'DifferentPassword2');

    await user.click(screen.getByRole('button', { name: /Set Permanent Password/i }));

    expect(await screen.findByText(/New passwords do not match/i)).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('triggers logout when Sign out is clicked', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.click(screen.getByRole('button', { name: /Sign out/i }));
    expect(mockLogout).toHaveBeenCalled();
  });
});
