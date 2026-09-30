import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoresPage } from './StoresPage';
import { App } from '../App';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../api/client';
import {
  ItemStatus,
  ItemWithRelations,
  Location,
  UserRole,
} from '../types/asset-management';

vi.mock('../api/client', () => ({
  api: {
    getLocations: vi.fn(),
    getItems: vi.fn(),
    updateLocation: vi.fn(),
    createLocation: vi.fn(),
    deleteLocation: vi.fn(),
    getMe: vi.fn(),
    getApprovals: vi.fn(),
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
  },
}));
const locations: Location[] = [
  {
    id: 'STORE-1',
    siteName: 'Main Headquarters',
    building: 'Block B',
    roomNumber: 'Central 1',
    isCentralStore: true,
  },
  {
    id: 'STORE-2',
    siteName: 'Research Center',
    building: 'Depot',
    roomNumber: 'Hangar 2',
    isCentralStore: true,
  },
  {
    id: 'STORE-3',
    siteName: 'Archive Site',
    building: 'Old Block',
    roomNumber: 'Store 3',
    isCentralStore: true,
  },
  {
    id: 'OFFICE',
    siteName: 'Field Office',
    building: 'Block A',
    roomNumber: 'Room 4',
    isCentralStore: false,
  },
];
const item = (
  id: string,
  status: ItemStatus,
  unitCostETB: number,
  storeLocationId = 'STORE-1'
) =>
  ({
    id,
    name: `Asset ${id}`,
    itemCode: `TAG-${id}`,
    serialNumber: `SN-${id}`,
    ifmisSlipNumber: `M19-${id}`,
    storeLocationId,
    status,
    unitCostETB,
  }) as ItemWithRelations;
const items = [
  item('available', ItemStatus.AVAILABLE, 200),
  item('inbound', ItemStatus.PENDING_STOCK_IN, 1000),
  item('outbound', ItemStatus.PENDING_STOCK_OUT, 800),
  {
    ...item('issued', ItemStatus.ISSUED, 900),
    currentCustodian: { fullNameEn: 'Hana Bekele' },
  } as ItemWithRelations,
  item('repair', ItemStatus.IN_REPAIR, 700),
  item('transfer', ItemStatus.UNDER_TRANSFER, 600),
  item('disposed', ItemStatus.DISPOSED, 500),
  item('research', ItemStatus.AVAILABLE, 300, 'STORE-2'),
  item('office', ItemStatus.AVAILABLE, 9000, 'OFFICE'),
  item('unknown', ItemStatus.AVAILABLE, 8000, 'MISSING'),
];
beforeEach(() => {
  for (const mock of Object.values(api))
    if (vi.isMockFunction(mock)) mock.mockReset();
  vi.mocked(api.getLocations).mockResolvedValue(locations);
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getEmployees).mockResolvedValue([]);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getApprovals).mockResolvedValue([]);
});
const renderPage = (role = UserRole.SYSTEM_ADMIN, onNavigate = vi.fn()) =>
  render(
    <ToastProvider>
      <StoresPage currentRole={role} onNavigate={onNavigate} />
    </ToastProvider>
  );
const ready = () =>
  screen.findByRole('button', { name: 'View Central 1 inventory' });

describe('The existing Stores page entry', () => {
  it('uses designated stores and counts only available stock in available totals', async () => {
    renderPage();
    await ready();
    const totals = within(screen.getByLabelText('Store totals'));
    expect(totals.getByText(/ETB\s+500/)).toBeInTheDocument();
    expect(
      totals.getByText('Designated stores').parentElement
    ).toHaveTextContent('3');
    expect(
      totals.getByText('Available assets').parentElement
    ).toHaveTextContent('2');
    expect(totals.getByText('Pending review').parentElement).toHaveTextContent(
      '2'
    );
    expect(
      screen.queryByRole('button', { name: 'View Room 4 inventory' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /1 available asset\(s\) are linked to locations without a store designation/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 active asset\(s\) reference unknown locations/)
    ).toBeInTheDocument();
    const row = screen
      .getByRole('button', { name: 'View Central 1 inventory' })
      .closest('tr')!;
    expect(within(row).getByText('1 inbound')).toBeInTheDocument();
    expect(within(row).getByText('1 outbound')).toBeInTheDocument();
  });

  it('searches, filters pending and empty stores, and sorts by available value', async () => {
    renderPage();
    await ready();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Search stores' }),
      'depot'
    );
    expect(
      screen.getByRole('button', { name: 'View Hangar 2 inventory' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Central 1 inventory' })
    ).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search stores' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Stock availability' }),
      'pending'
    );
    expect(
      screen.getByRole('button', { name: 'View Central 1 inventory' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Hangar 2 inventory' })
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Stock availability' }),
      'empty'
    );
    expect(
      screen.getByRole('button', { name: 'View Store 3 inventory' })
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Stock availability' }),
      'all'
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort stores' }),
      'value'
    );
    const rows = within(
      screen.getByRole('table', {
        name: 'Designated stores and stock availability',
      })
    ).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Research Center');
  });

  it('shows linked inventory with status and custodian search, including disposed history on demand', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await ready());
    const details = within(
      screen.getByRole('region', { name: 'Main Headquarters · Central 1' })
    );
    expect(details.getByText('Asset issued')).toBeInTheDocument();
    expect(details.getByText('Asset repair')).toBeInTheDocument();
    expect(details.queryByText('Asset disposed')).not.toBeInTheDocument();
    await user.type(
      details.getByRole('textbox', { name: 'Search store inventory' }),
      'hana'
    );
    expect(details.getByText('Asset issued')).toBeInTheDocument();
    expect(details.queryByText('Asset available')).not.toBeInTheDocument();
    await user.clear(
      details.getByRole('textbox', { name: 'Search store inventory' })
    );
    await user.selectOptions(
      details.getByRole('combobox', { name: 'Inventory status' }),
      ItemStatus.AVAILABLE
    );
    expect(details.getByText('Asset available')).toBeInTheDocument();
    expect(details.queryByText('Asset issued')).not.toBeInTheDocument();
    await user.selectOptions(
      details.getByRole('combobox', { name: 'Inventory status' }),
      'all'
    );
    expect(details.getByText('Asset disposed')).toBeInTheDocument();
    await user.click(
      details.getByRole('button', { name: 'Close store inventory' })
    );
    expect(
      screen.getByRole('button', { name: 'View Central 1 inventory' })
    ).toHaveFocus();
  });

  it.each([UserRole.DATA_ENCODER, UserRole.DEPARTMENT_HEAD])(
    'allows read-only store access for %s',
    async (role) => {
      renderPage(role);
      await ready();
      expect(
        screen.queryByRole('button', { name: 'Designate store' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Edit .* store|Remove .* designation/,
        })
      ).not.toBeInTheDocument();
    }
  );

  it.each([UserRole.MANAGER, UserRole.TEAM_LEADER])(
    'blocks the Stores page for %s',
    (role) => {
      renderPage(role);
      expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
      expect(api.getLocations).not.toHaveBeenCalled();
    }
  );

  it('designates an existing location and preserves its identity and linked assets', async () => {
    vi.mocked(api.updateLocation).mockResolvedValue({
      ...locations[3],
      isCentralStore: true,
    });
    renderPage();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Designate store' }));
    const select = screen.getByRole('combobox', {
      name: 'Existing location *',
    });
    expect(
      within(select).queryByRole('option', { name: /Main Headquarters/ })
    ).not.toBeInTheDocument();
    await user.selectOptions(select, 'OFFICE');
    await user.click(screen.getByRole('button', { name: 'Save designation' }));
    expect(api.updateLocation).toHaveBeenCalledWith('OFFICE', {
      siteName: 'Field Office',
      building: 'Block A',
      roomNumber: 'Room 4',
      isCentralStore: true,
    });
    await user.click(
      await screen.findByRole('button', { name: 'View Room 4 inventory' })
    );
    expect(screen.getByText('Asset office')).toBeInTheDocument();
    expect(api.createLocation).not.toHaveBeenCalled();
    expect(api.deleteLocation).not.toHaveBeenCalled();
  });

  it('retains edited details on failure and saves through the existing location API', async () => {
    vi.mocked(api.updateLocation)
      .mockRejectedValueOnce(new Error('Duplicate room'))
      .mockResolvedValueOnce({ ...locations[0], roomNumber: 'Central 9' });
    renderPage();
    await ready();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Edit Central 1 store' })
    );
    const room = screen.getByRole('textbox', { name: 'Room / store *' });
    await user.clear(room);
    await user.type(room, 'Central 9');
    await user.click(
      screen.getByRole('button', { name: 'Save store details' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Duplicate room'
    );
    expect(room).toHaveValue('Central 9');
    await user.click(
      screen.getByRole('button', { name: 'Save store details' })
    );
    expect(
      await screen.findByRole('button', { name: 'View Central 9 inventory' })
    ).toBeInTheDocument();
    expect(api.updateLocation).toHaveBeenLastCalledWith('STORE-1', {
      siteName: 'Main Headquarters',
      building: 'Block B',
      roomNumber: 'Central 9',
      isCentralStore: true,
    });
  });

  it('confirms removing the designation without deleting the location or its assets', async () => {
    vi.mocked(api.updateLocation).mockResolvedValue({
      ...locations[0],
      isCentralStore: false,
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await ready());
    await user.click(
      screen.getByRole('button', { name: 'Remove Central 1 designation' })
    );
    expect(
      screen.getByText(/This location and all its linked assets will remain/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.updateLocation).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Remove Central 1 designation' })
    );
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await screen.findByText('Store designation removed');
    expect(api.updateLocation).toHaveBeenCalledWith('STORE-1', {
      siteName: 'Main Headquarters',
      building: 'Block B',
      roomNumber: 'Central 1',
      isCentralStore: false,
    });
    expect(api.deleteLocation).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'View Central 1 inventory' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Main Headquarters · Central 1' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Designate store' })
    ).toHaveFocus();
  });

  it('offers the existing Locations page when there is no eligible location', async () => {
    vi.mocked(api.getLocations).mockResolvedValue(locations.slice(0, 3));
    const navigate = vi.fn();
    renderPage(UserRole.SYSTEM_ADMIN, navigate);
    await ready();
    await userEvent.click(
      screen.getByRole('button', { name: 'Designate store' })
    );
    expect(
      screen.queryByRole('button', { name: 'Save designation' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open Locations' })
    );
    expect(navigate).toHaveBeenCalledWith('settings-locations');
  });

  it('retries a failed initial load and retains labeled stale data on failed refresh', async () => {
    vi.mocked(api.getLocations)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(locations)
      .mockRejectedValueOnce(new Error('Offline again'));
    renderPage();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Showing the last loaded data.'
    );
    expect(
      screen.getByRole('button', { name: 'View Central 1 inventory' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Designate store' })
    ).toBeDisabled();
  });

  it('handles an empty store register without adding made-up records', async () => {
    vi.mocked(api.getLocations).mockResolvedValue([]);
    vi.mocked(api.getItems).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No stores designated')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Store totals')).getByText(/ETB\s+0/)
    ).toBeInTheDocument();
  });

  it.each(['Desktop navigation', 'Mobile navigation'])(
    'opens the existing Stores destination through %s',
    async (name) => {
      const user = {
        id: 'ADMIN',
        role: UserRole.SYSTEM_ADMIN,
        fullNameEn: 'Admin',
      };
      localStorage.setItem('moa_token', 'test-token');
      localStorage.setItem('moa_user', JSON.stringify(user));
      localStorage.setItem('moa_active_tab', 'settings-employees');
      vi.mocked(api.getMe).mockResolvedValue(user as any);
      render(<App />);
      await screen.findByRole('heading', { name: 'Employees', level: 2 });
      const nav = within(screen.getByRole('navigation', { name }));
      if (name === 'Mobile navigation')
        await userEvent.click(nav.getByRole('button', { name: 'More' }));
      await userEvent.click(nav.getByRole('button', { name: 'Stores' }));
      expect(
        await screen.findByRole('heading', {
          name: 'Stores & stock availability',
        })
      ).toBeInTheDocument();
      expect(localStorage.getItem('moa_active_tab')).toBe('settings-stores');
      await ready();
    }
  );
});
