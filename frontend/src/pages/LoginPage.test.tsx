import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { api } from '../api/client';

const mockLogin = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    sessionNotice: null,
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
      resetOrChangePassword: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LoginPage', () => {
  it('renders login form with authentic MoA branding, inputs, and forgot password link', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('moa-logo')).toBeInTheDocument();
    expect(screen.getByText('MoA Asset Tracking System')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name@moa.gov.et/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to MoA Asset Tracking System/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forgot password?/i })).toBeInTheDocument();
  });

  it('submits login credentials successfully', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<LoginPage />);

    const idInput = screen.getByPlaceholderText(/name@moa.gov.et/i);
    const pwInput = screen.getByPlaceholderText('••••••••••••');
    const submitBtn = screen.getByRole('button', { name: /Sign In to MoA Asset Tracking System/i });

    await user.type(idInput, 'admin@moa.gov.et');
    await user.type(pwInput, 'Secret1234');
    await user.click(submitBtn);

    expect(mockLogin).toHaveBeenCalledWith('admin@moa.gov.et', 'Secret1234');
  });

  it('allows users to directly change password when clicking forgot/change password', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetOrChangePassword).mockResolvedValue({
      message: 'Password successfully updated.',
      username: 'abebe@moa.gov.et',
    });

    render(<LoginPage />);

    const forgotBtn = screen.getByRole('button', { name: /Forgot password?/i });
    await user.click(forgotBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();

    // Fill in Change Password fields
    const idInput = screen.getByPlaceholderText(/e.g. name@moa.gov.et/i);
    const currPwInput = screen.getByPlaceholderText('Current password');
    const newPwInput = screen.getByPlaceholderText('Min. 8 characters');
    const confirmPwInput = screen.getByPlaceholderText('Re-type new password');
    const updateBtn = screen.getByRole('button', { name: /Update Password/i });

    await user.type(idInput, 'abebe@moa.gov.et');
    await user.type(currPwInput, 'OldPass123');
    await user.type(newPwInput, 'NewPass123');
    await user.type(confirmPwInput, 'NewPass123');
    await user.click(updateBtn);

    expect(api.resetOrChangePassword).toHaveBeenCalledWith({
      usernameOrEmail: 'abebe@moa.gov.et',
      currentPassword: 'OldPass123',
      newPassword: 'NewPass123',
    });

    expect(await screen.findByText(/Password Successfully Updated!/i)).toBeInTheDocument();
    const proceedBtn = screen.getByRole('button', { name: /Proceed to Sign In/i });
    await user.click(proceedBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
