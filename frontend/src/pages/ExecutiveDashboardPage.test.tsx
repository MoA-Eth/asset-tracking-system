import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('is off for now: no tile or banner, even when consumables are low', async () => {
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

    await screen.findByText('Total assets');
    expect(screen.queryByText('Low-stock consumables')).not.toBeInTheDocument();
    expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
    expect(screen.queryByText(/critically low/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show 2 items/ })).not.toBeInTheDocument();
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
  it('counts the assets one by one: total, assigned and available add up; consumables are store stock', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(599450),
      fixedAssets: { units: 893, registrations: 29, inStoreUnits: 800, issuedUnits: 93, valueETB: 1 },
      consumables: { lines: 408, inStoreLines: 150, issuedLines: 258, stockItems: 312, inStoreStockItems: 140, issuedStockItems: 200, valueETB: 1 },
      categoryBreakdown: [
        { category: 'VEHICLE', count: 14 },
        { category: 'MOTORCYCLE', count: 52 },
        { category: 'IT_EQUIPMENT', count: 30 },
      ],
    } as any);
    renderPage();

    const card = async (label: string) => (await screen.findByText(label, { selector: 'p' })).closest('div')!.parentElement!.parentElement!;
    // Fixed assets, each unit an asset: 93 assigned + 800 available = 893
    // Both types on Total assets, each in what it is counted in, never added together
    const total = await card('Total assets');
    expect(within(total).getByRole('row', { name: /Fixed assets/ })).toHaveTextContent('Fixed assets893units');
    expect(within(total).getByRole('row', { name: /Consumables/ })).toHaveTextContent('Consumables312items');
    // Assigned and available, each by type: fixed assets add up (93 + 800 = 893); a partly issued supply is in both
    const row = async (label: string, type: RegExp) => within(await card(label)).getByRole('row', { name: type });
    expect(await row('Assigned assets', /Fixed assets/)).toHaveTextContent('Fixed assets10% of all93units');
    expect(await row('Assigned assets', /Consumables/)).toHaveTextContent('Consumables200items');
    expect(await row('Available assets', /Fixed assets/)).toHaveTextContent('Fixed assets90% of all800units');
    expect(await row('Available assets', /Consumables/)).toHaveTextContent('Consumables140items');
    // Total valuation is one figure, not split by type
    expect(await card('Total valuation')).toHaveTextContent('All held, VAT included');
    // One short line under each card
    expect(await card('Total assets')).toHaveTextContent('In store and assigned');
    expect(await card('Assigned assets')).toHaveTextContent('Assigned');
    expect(await card('Available assets')).toHaveTextContent('In store, ready to assign');
    expect(within(await card('Total valuation')).queryByText(/of value/)).not.toBeInTheDocument();
    // Categories are in the chart further down, not a card
    expect(screen.queryByText('Asset categories', { selector: 'p' })).not.toBeInTheDocument();
    // Consumables are on Total assets, not a card of their own
    expect(screen.queryByText('Store stock')).not.toBeInTheDocument();
    // No receipt-line counts, no sum of assets and supplies, no units added across pieces, litres and kilograms
    for (const n of ['437', '1,205', '599,450']) expect(screen.queryByText(new RegExp(n))).not.toBeInTheDocument();
    // The approvals queue is not on the dashboard
    expect(screen.queryByText('Approvals in pipeline')).not.toBeInTheDocument();
    // Nor the idle-in-store card (the list of items in store too long is further down)
    expect(screen.queryByText('Idle in store (>30 days)')).not.toBeInTheDocument();
  });
});

describe('Needs attention', () => {
  it('is off for now, even with requests waiting and items in store too long', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(10),
      pendingApprovalsCount: 3,
      rejectedWaitingCount: 2,
      staleInStore: { thresholdDays: 30, itemCount: 1, units: 1, valueETB: 1, items: [] },
    } as any);
    renderPage();
    await screen.findByText('Total assets');
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });
});

describe('Assets by store location', () => {
  it('is off for now', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(10),
      locationUtilization: [{ id: 'L1', siteName: 'Saris', itemLines: 3, availableLines: 2, issuedLines: 1, categoryBreakdown: [] }],
    } as any);
    renderPage();
    await screen.findByText('Total assets');
    expect(screen.queryByText('Assets by store location')).not.toBeInTheDocument();
  });
});

describe('Executive governance & activity', () => {
  it('is off for now: the audit log page has the full activity', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(10),
      recentAuditLogs: [{ id: 'l1', action: 'APPROVE_STOCK_IN', userName: 'Getaneh', timestampGc: '2026-10-29' }],
    } as any);
    renderPage();
    await screen.findByText('Total assets');
    expect(screen.queryByText('Executive governance & activity')).not.toBeInTheDocument();
  });
});

describe('Asset categories', () => {
  it('counts motorcycles in Vehicles, listed under it, not as a category of their own', async () => {
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(10),
      categoryBreakdown: [
        { category: 'VEHICLE', count: 14 },
        { category: 'MOTORCYCLE', count: 52 },
        { category: 'AGRI_MACHINERY', count: 37 },
      ],
    } as any);
    renderPage();

    const chart = await screen.findByRole('img', { name: /^Units by category/ });
    expect(chart).toHaveAttribute('aria-label', 'Units by category: Vehicles 66, Agri. machinery 37');
    const legend = chart.parentElement!.querySelector('ul')!;
    expect(legend).toHaveTextContent('Vehicles66');
    expect(legend).toHaveTextContent('↳ Cars & other vehicles14');
    expect(legend).toHaveTextContent('↳ Motorcycles52');
  });
});

describe('Items in store too long', () => {
  it('counts as the cards do: fixed assets in units, consumables in items, nothing added across measures', async () => {
    const stale = (itemCode: string, itemType: string, unitsInStore: number, uom: string) => ({
      id: itemCode, itemCode, name: itemCode, itemType, unitsInStore, uom, inStoreSinceGc: '2026-08-01', daysInStore: 90, valueETB: 1,
    });
    vi.mocked(api.getExecutiveDashboard).mockResolvedValue({
      ...figures(10),
      staleInStore: {
        thresholdDays: 30, itemCount: 4, units: 1095.5, valueETB: 4, fixedUnits: 64, consumableItems: 3,
        items: [stale('EAR-TAGS', 'CONSUMABLE', 1000, 'EA'), stale('CHAIRS', 'FIXED', 64, 'EA'), stale('DELTAMETHRIN', 'CONSUMABLE', 20, 'LTR'), stale('FEED', 'CONSUMABLE', 11.5, 'KG')],
      },
    } as any);
    renderPage();

    const summary = (await screen.findByText('These items should have been distributed by now')).closest('div')!.parentElement!.parentElement!;
    const figure = (label: string) => [...summary.querySelectorAll('dt')].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;
    expect(figure('Fixed assets (units)')).toBe('64');
    expect(figure('Consumables (items)')).toBe('3');
    // Not one figure adding pieces, litres and kilograms
    expect(summary).not.toHaveTextContent('1,095.5');
    expect(summary).not.toHaveTextContent('Litres');
    // The list under the figures counts records, and says so
    expect(screen.getByRole('button', { name: /Show the list \(4 records\)/ })).toBeInTheDocument();
  });
});
