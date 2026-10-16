import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';

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

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockImplementation(() => Promise.resolve()),
    },
    writable: true,
    configurable: true,
  });
});

describe('LoginPage', () => {
  it('renders login form with authentic MoA branding, inputs, and forgot password link', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('moa-logo')).toBeInTheDocument();
    expect(screen.getByText('MoA Asset Tracking System')).toBeInTheDocument();
    expect(screen.getByText('የቋሚ ንብረት ቁጥጥርና አስተዳደር ሥርዓት')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name@moa.gov.et/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to MoA Asset Tracking System/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forgot password\?/i })).toBeInTheDocument();
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

  it('opens Forgot Password modal and displays civil service assistance workflow', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const forgotBtn = screen.getByRole('button', { name: /Forgot password\?/i });
    await user.click(forgotBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Password Reset Assistance')).toBeInTheDocument();
    expect(screen.getByText('የይለፍ ቃል መልሶ ማግኛ እገዛ')).toBeInTheDocument();

    const requestInput = screen.getByPlaceholderText(/e\.g\. hana@moa\.gov\.et/i);
    const requestBtn = screen.getByRole('button', { name: /Request Reset Assistance/i });

    await user.type(requestInput, '00123456');
    await user.click(requestBtn);

    expect(await screen.findByText('Assistance Request Recorded')).toBeInTheDocument();
    expect(screen.getByText(/00123456/)).toBeInTheDocument();
    expect(screen.getByText('+251 11 646 0111')).toBeInTheDocument();
    expect(screen.getByText('it.support@moa.gov.et')).toBeInTheDocument();

    // Close and return to sign in
    const backBtn = screen.getByRole('button', { name: /Back to Sign In/i });
    await user.click(backBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
