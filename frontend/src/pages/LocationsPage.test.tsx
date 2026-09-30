import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationsPage } from './LocationsPage';
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
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    getMe: vi.fn(),
    getApprovals: vi.fn(),
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
  },
}));
const locations: Location[] = [
  {
    id: 'LOC-1',
    siteName: 'Ministry HQ',
    building: 'Block A',
    roomNumber: 'Store 1',
    isCentralStore: true,
  },
  {
    id: 'LOC-2',
    siteName: 'Field Station',
    building: 'Main Block',
    roomNumber: 'Room 2',
    isCentralStore: false,
  },
  {
    id: 'LOC-3',
    siteName: 'Archive Depot',
    building: 'Old Block',
    roomNumber: 'Room 3',
    isCentralStore: false,
  },
];
const items = [
  {
    id: '1',
    storeLocationId: 'LOC-1',
    itemCode: 'TAG-1',
    name: 'Laptop',
    unitCostETB: 200,
    status: ItemStatus.AVAILABLE,
    ifmisSlipNumber: 'M19-1',
  },
  {
    id: '2',
    storeLocationId: 'LOC-1',
    itemCode: 'TAG-2',
    name: 'Tractor',
    unitCostETB: 1000,
    status: ItemStatus.ISSUED,
    currentCustodian: { fullNameEn: 'Hana Bekele' },
  },
  {
    id: '3',
    storeLocationId: 'LOC-1',
    itemCode: 'TAG-3',
    name: 'Old chair',
    unitCostETB: 500,
    status: ItemStatus.DISPOSED,
  },
  {
    id: '4',
    storeLocationId: 'LOC-3',
    itemCode: 'TAG-4',
    name: 'Old printer',
    unitCostETB: 800,
    status: ItemStatus.DISPOSED,
  },
  {
    id: '5',
    storeLocationId: 'MISSING',
    itemCode: 'TAG-5',
    name: 'Unlinked asset',
    unitCostETB: 9000,
    status: ItemStatus.AVAILABLE,
  },
] as ItemWithRelations[];

beforeEach(() => {
  for (const mock of Object.values(api))
    if (vi.isMockFunction(mock)) mock.mockReset();
  vi.mocked(api.getLocations).mockResolvedValue(locations);
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getEmployees).mockResolvedValue([]);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getApprovals).mockResolvedValue([]);
});
const renderPage = (role = UserRole.SYSTEM_ADMIN) =>
  render(
    <ToastProvider>
      <LocationsPage currentRole={role} />
    </ToastProvider>
  );

describe('Locations page', () => {
  it('shows accurate active totals and linked asset details, excluding disposed and unknown locations from valuation', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'View Store 1 assets' });
    const totals = within(screen.getByLabelText('Location totals'));
    expect(totals.getByText(/ETB\s+1,200/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 active asset\(s\) reference an unknown location/)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'View Store 1 assets' })
    );
    const detail = within(
      screen.getByRole('region', { name: 'Ministry HQ · Store 1' })
    );
    expect(detail.getByText('Laptop')).toBeInTheDocument();
    expect(detail.getByText('Old chair')).toBeInTheDocument();
    await userEvent.type(
      detail.getByRole('textbox', { name: 'Search linked assets' }),
      'hana'
    );
    expect(detail.getByText('Tractor')).toBeInTheDocument();
    expect(detail.queryByText('Laptop')).not.toBeInTheDocument();
  });

  it('filters by building and location type and sorts the registry', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'View Store 1 assets' });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Search locations' }),
      'main block'
    );
    expect(
      screen.getByRole('button', { name: 'View Room 2 assets' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Store 1 assets' })
    ).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search locations' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Location type' }),
      'central'
    );
    expect(
      screen.queryByRole('button', { name: 'View Room 2 assets' })
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Location type' }),
      'all'
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort locations' }),
      'value'
    );
    expect(
      within(
        screen.getByRole('table', { name: /Registered locations/ })
      ).getAllByRole('row')[1]
    ).toHaveTextContent('Ministry HQ');
  });

  it.each([UserRole.DATA_ENCODER, UserRole.DEPARTMENT_HEAD])(
    'keeps %s read-only',
    async (role) => {
      renderPage(role);
      await screen.findByRole('button', { name: 'View Store 1 assets' });
      expect(
        screen.queryByRole('button', { name: 'Add location' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Edit |Delete / })
      ).not.toBeInTheDocument();
    }
  );

  it.each([UserRole.MANAGER, UserRole.TEAM_LEADER])(
    'does not load the registry for %s',
    (role) => {
      renderPage(role);
      expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
      expect(api.getLocations).not.toHaveBeenCalled();
    }
  );

  it('adds a location through the API and includes it in the registry', async () => {
    vi.mocked(api.createLocation).mockResolvedValue({
      id: 'LOC-NEW',
      siteName: 'New Site',
      building: 'Workshop',
      roomNumber: 'Bay 5',
      isCentralStore: true,
    });
    renderPage();
    await screen.findByRole('button', { name: 'View Store 1 assets' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add location' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Site name *' }),
      ' New Site '
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Building *' }),
      'Workshop'
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Room / store *' }),
      'Bay 5'
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Designated central store' })
    );
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    expect(api.createLocation).toHaveBeenCalledWith({
      siteName: 'New Site',
      building: 'Workshop',
      roomNumber: 'Bay 5',
      isCentralStore: true,
    });
    expect(
      await screen.findByRole('button', { name: 'View Bay 5 assets' })
    ).toBeInTheDocument();
  });

  it('keeps entered edits after a server error and saves them on retry', async () => {
    vi.mocked(api.updateLocation)
      .mockRejectedValueOnce(new Error('This room already exists.'))
      .mockResolvedValueOnce({ ...locations[1], roomNumber: 'Room 9' });
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Edit Room 2' })
    );
    const room = screen.getByRole('textbox', { name: 'Room / store *' });
    await user.clear(room);
    await user.type(room, 'Room 9');
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This room already exists.'
    );
    expect(room).toHaveValue('Room 9');
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    expect(
      await screen.findByRole('button', { name: 'View Room 9 assets' })
    ).toBeInTheDocument();
    expect(api.updateLocation).toHaveBeenLastCalledWith('LOC-2', {
      siteName: 'Field Station',
      building: 'Main Block',
      roomNumber: 'Room 9',
      isCentralStore: false,
    });
  });

  it('protects linked locations, including disposed-only records, and confirms deletion of unused ones', async () => {
    vi.mocked(api.deleteLocation).mockResolvedValue(locations[1]);
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Delete Store 1' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete Room 3' })
    ).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Room 2' }));
    expect(api.deleteLocation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteLocation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Room 2' }));
    await user.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await screen.findByText('Location deleted');
    expect(api.deleteLocation).toHaveBeenCalledWith('LOC-2');
    expect(
      screen.queryByRole('button', { name: 'View Room 2 assets' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add location' })).toHaveFocus();
  });

  it('retries initial errors and preserves data after a failed refresh', async () => {
    vi.mocked(api.getLocations)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(locations)
      .mockRejectedValueOnce(new Error('Offline again'));
    renderPage();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: 'View Store 1 assets' });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Showing the last loaded data.'
    );
    expect(
      screen.getByRole('button', { name: 'View Store 1 assets' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add location' })).toBeDisabled();
  });

  it('shows an empty registry with an available create action', async () => {
    vi.mocked(api.getLocations).mockResolvedValue([]);
    vi.mocked(api.getItems).mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('No locations registered')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add location' })).toBeEnabled();
  });

  it.each(['Desktop navigation', 'Mobile navigation'])(
    'opens the real page through %s',
    async (nav) => {
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
      const navigation = within(screen.getByRole('navigation', { name: nav }));
      if (nav === 'Mobile navigation')
        await userEvent.click(navigation.getByRole('button', { name: 'More' }));
      await userEvent.click(
        navigation.getByRole('button', { name: 'Locations' })
      );
      expect(
        await screen.findByRole('heading', {
          name: 'Locations & asset placement',
        })
      ).toBeInTheDocument();
      expect(localStorage.getItem('moa_active_tab')).toBe('settings-locations');
    }
  );
});
