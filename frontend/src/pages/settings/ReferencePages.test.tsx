import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationsPage } from './LocationsPage';
import { StoresPage } from './StoresPage';
import { api } from '../../api/client';

const auth = vi.hoisted(() => ({ user: { id: 'admin', permissions: ['references.manage'] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: {
    getLocations: vi.fn(), createLocation: vi.fn(), updateLocation: vi.fn(), setLocationActive: vi.fn(), deleteLocation: vi.fn(),
    getEmployees: vi.fn(),
  },
}));

const kality = { id: 'LOC-1', siteName: 'Kality', building: 'Depot', roomNumber: 'Store-01', isCentralStore: true, isActive: true, itemCount: 4 };
const saris = { id: 'LOC-2', siteName: 'Saris', building: '', roomNumber: '', isCentralStore: true, isActive: true, itemCount: 0 };
const room = { id: 'LOC-3', siteName: 'Head office', building: 'Block A', roomNumber: '204', isCentralStore: false, isActive: true, itemCount: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['references.manage'];
  vi.mocked(api.getLocations).mockResolvedValue([kality, saris, room] as any);
  vi.mocked(api.getEmployees).mockResolvedValue([]);
});

describe('Locations and Stores pages', () => {
  it('Locations shows every place; Stores shows only the stores', async () => {
    const { unmount } = render(<LocationsPage />);
    expect(await screen.findByText('Head office')).toBeInTheDocument();
    expect(screen.getByText('Kality')).toBeInTheDocument();
    unmount();
    render(<StoresPage />);
    expect(await screen.findByText('Kality')).toBeInTheDocument();
    expect(screen.getByText('Saris')).toBeInTheDocument();
    expect(screen.queryByText('Head office')).not.toBeInTheDocument();
  });

  it("won't offer to deactivate a store that still holds items", async () => {
    const user = userEvent.setup();
    render(<StoresPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Kality' }));
    const deactivate = screen.getByRole('menuitem', { name: /Deactivate/ }) as HTMLButtonElement;
    expect(deactivate.disabled).toBe(true);
    expect(deactivate.textContent).toContain('Holds 4 item records in store');
  });

  it('adds a store from the Stores page, already marked as a store', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createLocation).mockResolvedValue({ id: 'LOC-9', siteName: 'Adama', building: '', roomNumber: '', isCentralStore: true, isActive: true, itemCount: 0 } as any);
    render(<StoresPage />);
    await user.click(await screen.findByRole('button', { name: 'Add store' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText(/This is a store/) as HTMLInputElement).checked).toBe(true);
    await user.type(within(dialog).getByLabelText(/Site name/), 'Adama');
    await user.click(within(dialog).getByRole('button', { name: 'Add store' }));
    expect(api.createLocation).toHaveBeenCalledWith({ siteName: 'Adama', building: '', roomNumber: '', isCentralStore: true });
    expect(await screen.findByText('Adama')).toBeInTheDocument();
  });
});
