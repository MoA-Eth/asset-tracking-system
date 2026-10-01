import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { api } from '../api/client';
import { getValidTab } from '../components/layout/navigation';

vi.mock('../api/client', () => ({
  api: { getMe: vi.fn() },
  getErrorStatus: (err: any) => (err as any)?.status,
}));
const admin = { id: 'admin', role: 'SYSTEM_ADMIN', allowedTabs: ['dashboard', 'settings-roles'], landingTab: 'dashboard', permissions: ['roles.assign'] };
function SessionProbe() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return <p>{isLoading ? 'loading' : isAuthenticated ? getValidTab(user, 'settings-roles') : 'signed out'}</p>;
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('moa_token', 'existing-session');
  localStorage.setItem('moa_user', JSON.stringify(admin));
});

describe('Session access refresh', () => {
  it('ignores an older access response arriving after a newer refresh', async () => {
    let finishOld: (user: any) => void = () => {};
    vi.mocked(api.getMe).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    render(<AuthProvider><SessionProbe /></AuthProvider>);
    vi.mocked(api.getMe).mockResolvedValueOnce({ ...admin, role: 'MANAGER', allowedTabs: ['dashboard'], permissions: [] } as any);
    act(() => window.dispatchEvent(new Event('moa_access_changed')));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    await act(async () => finishOld(admin));
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('moa_user')!).role).toBe('MANAGER');
  });
  it('closes a forbidden page when refreshed access changes', async () => {
    vi.mocked(api.getMe).mockResolvedValueOnce(admin as any);
    render(<AuthProvider><SessionProbe /></AuthProvider>);
    expect(await screen.findByText('settings-roles')).toBeInTheDocument();
    vi.mocked(api.getMe).mockResolvedValueOnce({ ...admin, role: 'MANAGER', allowedTabs: ['dashboard', 'reports'], permissions: [] } as any);
    act(() => window.dispatchEvent(new Event('moa_access_changed')));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('moa_user')!).role).toBe('MANAGER');
  });
  it('clears an expired session but preserves it during a database outage', async () => {
    vi.mocked(api.getMe).mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    render(<AuthProvider><SessionProbe /></AuthProvider>);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    expect(localStorage.getItem('moa_token')).toBe('existing-session');
    act(() => window.dispatchEvent(new Event('moa_session_expired')));
    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(localStorage.getItem('moa_token')).toBeNull();
  });
});
