import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysPage } from './ApiKeysPage';
import { api } from '../../api/client';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({ api: { getApiKeys: vi.fn(), createApiKey: vi.fn(), revokeApiKey: vi.fn(), setApiKeyAddresses: vi.fn() } }));

const key = (extra: object = {}) => ({
  id: 'k1', name: 'Ministry KPI dashboard', hint: 'ats_live_8f3k2q9a1b2c…', scopes: ['dashboard.read'], allowedIps: [], expiresAt: null, revokedAt: null,
  lastUsedAt: null, createdByName: 'System Administrator', createdAt: '2026-10-20T10:00:00Z', status: 'ACTIVE', ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getApiKeys).mockResolvedValue([]);
});

describe('API keys', () => {
  it('creates a key for a service and shows it only once', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createApiKey).mockResolvedValue({ key: 'ats_live_8f3k2q9a1b2c_secretSecretSecretSecret', apiKey: key() } as any);
    render(<ApiKeysPage />);
    await screen.findByText(/No API keys yet/);

    await user.click(screen.getByRole('button', { name: 'New key' }));
    await user.type(screen.getByLabelText(/Service/), 'Ministry KPI dashboard');
    await user.type(screen.getByLabelText(/Allowed server addresses/), '10.10.30.25');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    expect(api.createApiKey).toHaveBeenCalledWith({ name: 'Ministry KPI dashboard', expiresAt: undefined, allowedIps: '10.10.30.25' });
    expect(await screen.findByLabelText('New API key')).toHaveValue('ats_live_8f3k2q9a1b2c_secretSecretSecretSecret');
    expect(screen.getByText(/It is shown only this once/)).toBeInTheDocument();

    vi.mocked(api.getApiKeys).mockResolvedValue([key()] as any);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // Afterwards only the start of the key is listed
    const list = await screen.findByRole('table', { name: 'API keys' });
    expect(within(list).getByText('ats_live_8f3k2q9a1b2c…')).toBeInTheDocument();
    expect(screen.queryByText(/secretSecret/)).toBeNull();
  });

  it('revokes a key after asking', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiKeys).mockResolvedValue([key({ lastUsedAt: '2026-10-21T09:14:00Z' })] as any);
    vi.mocked(api.revokeApiKey).mockResolvedValue(key({ status: 'REVOKED' }) as any);
    render(<ApiKeysPage />);
    const list = await screen.findByRole('table', { name: 'API keys' });
    expect(within(list).getByText('Active')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /Actions for Ministry KPI dashboard/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Revoke' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(api.revokeApiKey).toHaveBeenCalledWith('k1');
  });

  it('shows where each key may be used from, and changes it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApiKeys).mockResolvedValue([key({ allowedIps: ['10.10.30.25'] }), key({ id: 'k2', name: 'Planning tool', allowedIps: [] })] as any);
    vi.mocked(api.setApiKeyAddresses).mockResolvedValue(key({ allowedIps: ['10.10.50.0/24'] }) as any);
    render(<ApiKeysPage />);
    const list = await screen.findByRole('table', { name: 'API keys' });
    expect(within(list).getByText('10.10.30.25')).toBeInTheDocument();
    expect(within(list).getByText('Any address')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /Actions for Ministry KPI dashboard/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit addresses' }));
    const field = screen.getByLabelText(/Allowed server addresses/);
    expect(field).toHaveValue('10.10.30.25');
    await user.clear(field);
    await user.type(field, '10.10.50.0/24');
    await user.click(screen.getByRole('button', { name: 'Save addresses' }));
    expect(api.setApiKeyAddresses).toHaveBeenCalledWith('k1', '10.10.50.0/24');
  });
});
