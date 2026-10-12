import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoresPage } from './StoresPage';
import { api } from '../../api/client';

const auth = vi.hoisted(() => ({ user: { id: 'admin', permissions: ['references.manage'] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: {
    getStores: vi.fn(), getEmployees: vi.fn(), setStoreKeepers: vi.fn(), createStore: vi.fn(), updateStore: vi.fn(), setStoreActive: vi.fn(), deleteStore: vi.fn(),
    createLocation: vi.fn(), updateLocation: vi.fn(), setLocationActive: vi.fn(), deleteLocation: vi.fn(),
  },
}));

const loc = (id: string, storeId: string, storeName: string, name: string, itemCount = 0, isActive = true) => ({
  id, storeId, storeName, name, itemCount, isActive, siteName: storeName, building: '', roomNumber: name,
});
const kality = {
  id: 'STR-1', name: 'Kality', address: 'Kality Depot', isActive: true, itemCount: 4,
  locations: [loc('LOC-1', 'STR-1', 'Kality', 'Store-01', 4), loc('LOC-2', 'STR-1', 'Kality', 'Shelf A')],
};
const saris = { id: 'STR-2', name: 'Saris', address: '', isActive: true, itemCount: 0, locations: [loc('LOC-3', 'STR-2', 'Saris', 'Main store')] };
const closed = { id: 'STR-3', name: 'Old Depot', address: '', isActive: false, itemCount: 0, locations: [loc('LOC-4', 'STR-3', 'Old Depot', 'Main store')] };

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['references.manage'];
  vi.mocked(api.getStores).mockResolvedValue([kality, saris, closed] as any);
  vi.mocked(api.getEmployees).mockResolvedValue([
    { id: 'E1', fullNameEn: 'Abebe Kebede', payrollId: '00000001', isActive: true },
    { id: 'E2', fullNameEn: 'Sara Tesfaye', payrollId: '00000002', isActive: true },
    { id: 'E3', fullNameEn: 'Old Staff', payrollId: '00000003', isActive: false },
  ] as any);
});

describe('Store men', () => {
  const keeper = (id: string, name: string) => ({ employeeId: id, fullNameEn: name, fullNameAm: '', payrollId: `0000000${id.slice(1)}`, isActive: true });

  it('shows who keeps each store, and says plainly when nobody does', async () => {
    vi.mocked(api.getStores).mockResolvedValue([{ ...kality, storeKeepers: [keeper('E1', 'Abebe Kebede')] }, { ...saris, storeKeepers: [] }] as any);
    render(<StoresPage />);
    const kalityCard = await screen.findByRole('region', { name: 'Kality' });
    expect(within(kalityCard).getByText('Abebe Kebede')).toBeInTheDocument();
    const sarisCard = screen.getByRole('region', { name: 'Saris' });
    expect(within(sarisCard).getByText(/None assigned: this store can't receive, issue, dispose or take returns/)).toBeInTheDocument();
  });

  it('adds a store man from the staff register, offering only active employees not already on the list', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStores).mockResolvedValue([{ ...kality, storeKeepers: [keeper('E1', 'Abebe Kebede')] }] as any);
    vi.mocked(api.setStoreKeepers).mockResolvedValue({ ...kality, storeKeepers: [keeper('E1', 'Abebe Kebede'), keeper('E2', 'Sara Tesfaye')] } as any);
    render(<StoresPage />);
    const card = await screen.findByRole('region', { name: 'Kality' });
    await user.click(within(card).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Old Staff/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Abebe Kebede/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Sara Tesfaye/ }));

    expect(api.setStoreKeepers).toHaveBeenCalledWith('STR-1', ['E1', 'E2']);
    expect(await within(card).findByText('Sara Tesfaye')).toBeInTheDocument();
  });

  it('removes a store man', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStores).mockResolvedValue([{ ...kality, storeKeepers: [keeper('E1', 'Abebe Kebede'), keeper('E2', 'Sara Tesfaye')] }] as any);
    vi.mocked(api.setStoreKeepers).mockResolvedValue({ ...kality, storeKeepers: [keeper('E2', 'Sara Tesfaye')] } as any);
    render(<StoresPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove Abebe Kebede as a store man of Kality' }));
    expect(api.setStoreKeepers).toHaveBeenCalledWith('STR-1', ['E2']);
  });

  it('cannot be changed by someone who may only look', async () => {
    auth.user.permissions = ['references.read'];
    vi.mocked(api.getStores).mockResolvedValue([{ ...kality, storeKeepers: [keeper('E1', 'Abebe Kebede')] }] as any);
    render(<StoresPage />);
    const card = await screen.findByRole('region', { name: 'Kality' });
    expect(within(card).getByText('Abebe Kebede')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Remove Abebe Kebede/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('Stores page', () => {
  it('shows each active store with the locations inside it', async () => {
    const user = userEvent.setup();
    render(<StoresPage />);
    const kalityCard = await screen.findByRole('region', { name: 'Kality' });
    expect(within(kalityCard).getByText('Store-01')).toBeInTheDocument();
    expect(within(kalityCard).getByText('Shelf A')).toBeInTheDocument();
    expect(within(kalityCard).getByText(/Kality Depot · 2 locations · 4 item records in store/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Saris' })).getByText('Main store')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Old Depot' })).not.toBeInTheDocument();
    expect(api.getStores).toHaveBeenCalledWith({ includeInactive: true });

    await user.click(screen.getByRole('button', { name: /^Filter stores/i }));
    await user.click(screen.getByRole('button', { name: /Deactivated/ }));
    expect(screen.getByRole('region', { name: 'Old Depot' })).toBeInTheDocument();
  });

  it("won't offer to deactivate a store or a location that still holds items, or a store's only location to delete", async () => {
    const user = userEvent.setup();
    render(<StoresPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Kality' }));
    const deactivateStore = screen.getByRole('menuitem', { name: /Deactivate store/ }) as HTMLButtonElement;
    expect(deactivateStore.disabled).toBe(true);
    expect(deactivateStore.textContent).toContain('Holds 4 item records in store');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Kality Store-01' }));
    expect((screen.getByRole('menuitem', { name: /Deactivate/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Saris Main store' }));
    const del = screen.getByRole('menuitem', { name: /Delete/ }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.textContent).toContain('A store keeps at least one location');
  });

  it('adds a store with its first location', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStore).mockResolvedValue({ id: 'STR-9', name: 'Adama', address: '', isActive: true, locations: [] } as any);
    render(<StoresPage />);
    await user.click(await screen.findByRole('button', { name: 'Add store' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Store name/), 'Adama');
    expect((within(dialog).getByLabelText(/First location/) as HTMLInputElement).value).toBe('Main store');
    await user.click(within(dialog).getByRole('button', { name: 'Add store' }));
    expect(api.createStore).toHaveBeenCalledWith({ name: 'Adama', address: '', locationName: 'Main store' });
    expect(api.getStores).toHaveBeenCalledTimes(2);
  });

  it('adds a location inside a store, and deactivates an empty one after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createLocation).mockResolvedValue(loc('LOC-9', 'STR-1', 'Kality', 'Shelf B') as any);
    vi.mocked(api.setLocationActive).mockResolvedValue({ ...loc('LOC-2', 'STR-1', 'Kality', 'Shelf A'), isActive: false } as any);
    render(<StoresPage />);
    const kalityCard = await screen.findByRole('region', { name: 'Kality' });
    await user.click(within(kalityCard).getByRole('button', { name: 'Add location' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Location name/), 'Shelf B');
    await user.click(within(dialog).getByRole('button', { name: 'Add location' }));
    expect(api.createLocation).toHaveBeenCalledWith('STR-1', { name: 'Shelf B' });

    await user.click(await screen.findByRole('button', { name: 'Actions for Kality Shelf A' }));
    await user.click(screen.getByRole('menuitem', { name: /Deactivate/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(api.setLocationActive).toHaveBeenCalledWith('LOC-2', false);
  });

  it('is read-only without permission to manage stores', async () => {
    auth.user.permissions = ['references.read'];
    vi.mocked(api.getStores).mockResolvedValue([{ ...saris, itemCount: undefined }] as any);
    render(<StoresPage />);
    expect(await screen.findByRole('region', { name: 'Saris' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add store' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(api.getStores).toHaveBeenCalledWith({ includeInactive: false });
  });
});
