import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePasswordPage } from './CreatePasswordPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

vi.mock('../api/client', () => ({
  api: {
    verifyInvitation: vi.fn(),
    createPasswordWithToken: vi.fn(),
  },
}));

describe('CreatePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error when no token is present in the URL', async () => {
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:3000/create-password');

    render(<CreatePasswordPage />);
    expect(await screen.findByText('Invitation Expired or Invalid')).toBeInTheDocument();
    expect(screen.getByText(/No invitation token found in link/)).toBeInTheDocument();
  });

  it('verifies a valid token and renders the password creation form', async () => {
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:3000/create-password?token=valid-token-123');

    vi.mocked(api.verifyInvitation).mockResolvedValue({
      valid: true,
      employee: {
        id: 'emp-1',
        fullNameEn: 'Abebe Kebede',
        email: 'abebe@moa.gov.et',
        role: UserRole.DATA_ENCODER,
      },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    render(<CreatePasswordPage />);

    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('Data Encoder')).toBeInTheDocument();
    expect(screen.getByLabelText(/^New Password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm Password/)).toBeInTheDocument();
  });

  it('validates password requirements and calls createPasswordWithToken on submit', async () => {
    const user = userEvent.setup();
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:3000/create-password?token=valid-token-123');

    vi.mocked(api.verifyInvitation).mockResolvedValue({
      valid: true,
      employee: {
        id: 'emp-1',
        fullNameEn: 'Abebe Kebede',
        email: 'abebe@moa.gov.et',
        role: UserRole.DATA_ENCODER,
      },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    vi.mocked(api.createPasswordWithToken).mockResolvedValue({
      success: true,
      message: 'Password created successfully',
      employee: { id: 'emp-1', fullNameEn: 'Abebe Kebede' } as any,
    });

    render(<CreatePasswordPage />);
    await screen.findByText('Abebe Kebede');

    const submitBtn = screen.getByRole('button', { name: /Activate Account & Set Password/ });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/^New Password/), 'SecurePass2026');
    await user.type(screen.getByLabelText(/^Confirm Password/), 'SecurePass2026');

    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    await user.click(submitBtn);

    expect(api.createPasswordWithToken).toHaveBeenCalledWith('valid-token-123', 'SecurePass2026');
    expect(await screen.findByText('Password Created!')).toBeInTheDocument();
  });

  it('handles expired or rejected tokens from the API', async () => {
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:3000/create-password?token=expired-token');

    vi.mocked(api.verifyInvitation).mockRejectedValue(new Error('This invitation link has expired.'));

    render(<CreatePasswordPage />);
    expect(await screen.findByText('This invitation link has expired.')).toBeInTheDocument();
  });
});

