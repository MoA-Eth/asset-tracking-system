import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { periodRange } from '../utils/periods';
import { getTodayGcAndEc } from '../utils/eth-date';
import userEvent from '@testing-library/user-event';
import { ExecutiveDashboardPage } from './ExecutiveDashboardPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', permissions: [] } }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.mock('../api/client', () => ({ api: { getExecutiveDashboard: vi.fn(), getStores: vi.fn() } }));

const figures = (totalItems: number) => ({ totalItems, availableCount: totalItems, totalValuationETB: totalItems * 100, stockMovement: [], recentAuditLogs: [] });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getStores).mockResolvedValue([
    { id: 'S-KAL', name: 'Kality', address: '', isActive: true },
    { id: 'S-SAR', name: 'Saris', address: '', isActive: true },
  ] as any);
  vi.mocked(api.getExecutiveDashboard).mockImplementation(async (f: any = {}) => figures(f.storeId === 'S-SAR' ? 7 : 40));
});

const renderPage = () => render(<ExecutiveDashboardPage onNavigate={vi.fn()} currentRole={UserRole.MANAGER} />);

describe('Dashboard filters', () => {
  it('loads everything at first, then only the store chosen, with a chip to remove it', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: /Filter the dashboard/ })).toBeInTheDocument();
    expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith({ storeId: '', category: '', itemType: '', from: '', to: '' });

    await user.click(screen.getByRole('button', { name: /Filter the dashboard/ }));
    await user.selectOptions(await screen.findByLabelText('All stores'), 'S-SAR');

    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith({ storeId: 'S-SAR', category: '', itemType: '', from: '', to: '' }));
    expect(await screen.findByRole('button', { name: 'Remove filter Saris' })).toBeInTheDocument();
    // Remembered in this browser
    expect(JSON.parse(localStorage.getItem('moa_dashboard_filters')!)).toMatchObject({ storeId: 'S-SAR' });

    await user.click(screen.getByRole('button', { name: 'Remove filter Saris' }));
    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith({ storeId: '', category: '', itemType: '', from: '', to: '' }));
  });

  it('"All" in a list means no filter, not a store called ALL', async () => {
    const user = userEvent.setup();
    localStorage.setItem('moa_dashboard_filters', JSON.stringify({ storeId: 'S-SAR' }));
    renderPage();
    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ storeId: 'S-SAR' })));
    // The remembered store, shown once the figures are in
    expect(await screen.findByRole('button', { name: 'Remove filter Saris' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Filter the dashboard/ }));
    await user.selectOptions(await screen.findByLabelText('All stores'), 'ALL');
    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ storeId: '' })));
    expect(screen.queryByRole('button', { name: /Remove filter/ })).toBeNull();
  });

  it('narrows to a fiscal period, sent as G.C. dates, with the period as a chip', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /Filter the dashboard/ });
    await user.click(screen.getByRole('button', { name: /Filter the dashboard/ }));
    await user.selectOptions(await screen.findByLabelText('All time'), 'this-quarter');

    const quarter = periodRange('this-quarter', getTodayGcAndEc().gc);
    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ from: quarter.from, to: quarter.to })));
    expect(await screen.findByRole('button', { name: `Remove filter ${quarter.label}` })).toBeInTheDocument();
    expect(quarter.label).toMatch(/^Q[1-4] EFY \d{4}$/);
  });

  it('narrows to a custom range, open at either end', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /Filter the dashboard/ });
    await user.click(screen.getByRole('button', { name: /Filter the dashboard/ }));
    await user.selectOptions(await screen.findByLabelText('All time'), 'custom');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-08' } });

    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-07-08', to: '' })));
    expect(await screen.findByRole('button', { name: 'Remove filter 2026-07-08 – …' })).toBeInTheDocument();
    // Its E.C. date shows under it
    expect(screen.getByText('2018-11-01 E.C.')).toBeInTheDocument();
  });

  it('filters by category and item type together', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /Filter the dashboard/ });
    await user.click(screen.getByRole('button', { name: /Filter the dashboard/ }));
    await user.selectOptions(await screen.findByLabelText('All categories'), 'FUEL_LUBRICANTS');
    await user.selectOptions(screen.getByLabelText('Fixed assets and consumables'), 'CONSUMABLE');
    await vi.waitFor(() => expect(api.getExecutiveDashboard).toHaveBeenLastCalledWith({ storeId: '', category: 'FUEL_LUBRICANTS', itemType: 'CONSUMABLE', from: '', to: '' }));
    const chips = screen.getAllByRole.bind(screen)('button', { name: /Remove filter/ }).map((b) => b.getAttribute('aria-label'));
    expect(chips).toEqual(['Remove filter Fuel & Lubricants', 'Remove filter Consumables']);
  });
});

describe('Dashboard low-stock consumables banner', () => {
  it('displays low-stock alert banner and items table when consumables are low', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValueOnce({
      ...figures(10),
      lowStockConsumables: {
        thresholdDefault: 5,
        itemCount: 2,
        criticalCount: 1,
        units: 3,
        valueETB: 450,
        items: [
          {
            id: 'item-1',
            itemCode: 'MOA-OFS-2026-0038',
            name: 'Demo toner',
            category: 'OFFICE_SUPPLIES',
            unitsInStore: 1,
            uom: 'EA',
            unitCostETB: 60,
            threshold: 5,
            storeName: 'Head office',
            locationName: 'Central Store',
            isCritical: true,
            isLow: true,
          },
          {
            id: 'item-2',
            itemCode: 'MOA-OFS-2026-0037',
            name: 'Demo stapler',
            category: 'OFFICE_SUPPLIES',
            unitsInStore: 2,
            uom: 'EA',
            unitCostETB: 25,
            threshold: 5,
            storeName: 'Head office',
            locationName: 'Central Store',
            isCritical: false,
            isLow: true,
          },
        ],
      },
    } as any);

    renderPage();

    expect(await screen.findByText('Low-stock consumables')).toBeInTheDocument();
    expect(screen.getByText(/1 consumable item is critically low/)).toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /Show 2 items/ });
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Demo toner')).toBeInTheDocument();
    expect(screen.getByText('Demo stapler')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('auto-refreshes when a realtime update event is dispatched anywhere in the app', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Filter the dashboard/ })).toBeInTheDocument();
    expect(api.getExecutiveDashboard).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent('moa_approvals_updated'));

    await vi.waitFor(() => {
      expect(api.getExecutiveDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it('refreshes metrics when clicking the manual refresh button', async () => {
    renderPage();
    const refreshBtn = await screen.findByRole('button', { name: 'Refresh dashboard' });
    expect(refreshBtn).toBeInTheDocument();
    expect(api.getExecutiveDashboard).toHaveBeenCalledTimes(1);

    fireEvent.click(refreshBtn);

    await vi.waitFor(() => {
      expect(api.getExecutiveDashboard).toHaveBeenCalledTimes(2);
    });
  });
});



describe('Total assets', () => {
  it('counts fixed assets by units and registrations, and supplies by their lines, not by adding up pieces', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(599450),
      fixedAssets: { units: 893, registrations: 29, inStoreUnits: 800, issuedUnits: 93, valueETB: 1 },
      consumables: { lines: 408, inStoreLines: 150, issuedLines: 258, valueETB: 1 },
    } as any);
    renderPage();

    const tile = (await screen.findByText('Total assets')).closest('div')!.parentElement!.parentElement!;
    expect(tile).toHaveTextContent('893units');
    expect(tile).toHaveTextContent('29 items');
    expect(tile).toHaveTextContent('In Store:800 units');
    expect(tile).toHaveTextContent('With Staff:93 units');
    expect(tile).toHaveTextContent('Supplies & consumables:408 lines · 150 in store');
    // The sum of everything, supplies included, is not the asset total
    expect(tile).not.toHaveTextContent('599,450');
  });
});
