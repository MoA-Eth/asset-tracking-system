import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  item: { findMany: vi.fn() },
  department: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  transactionApproval: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const store = (id: string, name: string) => ({ id, name, address: '', isActive: true });
const KALITY = store('S-KAL', 'Kality');
const SARIS = store('S-SAR', 'Saris');
const location = (id: string, s: ReturnType<typeof store>) => ({ id, storeId: s.id, name: 'Store-01', isActive: true, store: s });
const LOC_KALITY = location('L-KAL', KALITY);
const LOC_SARIS = location('L-SAR', SARIS);

const item = (id: string, extra: Record<string, unknown>) => ({
  id,
  itemCode: id,
  name: `Item ${id}`,
  category: 'IT_EQUIPMENT',
  itemType: 'FIXED',
  status: 'AVAILABLE',
  condition: 'NEW',
  unitCostETB: 1000,
  storeLocationId: LOC_KALITY.id,
  storeLocation: LOC_KALITY,
  ifmisSlipNumber: `M19-${id}`,
  ifmisSlipDateGc: '2026-10-01',
  createdAtGc: '2026-10-01',
  notes: JSON.stringify({ quantity: 1, uom: 'EA' }),
  history: [],
  ...extra,
});

const ITEMS = [
  item('LAPTOP-K', {}),
  item('LAPTOP-S', { storeLocationId: LOC_SARIS.id, storeLocation: LOC_SARIS, status: 'ISSUED' }),
  item('FUEL-K', { category: 'FUEL_LUBRICANTS', itemType: 'CONSUMABLE', unitCostETB: 100, notes: JSON.stringify({ quantity: 50, uom: 'EA' }) }),
  item('FUEL-S', { category: 'FUEL_LUBRICANTS', itemType: 'CONSUMABLE', unitCostETB: 100, storeLocationId: LOC_SARIS.id, storeLocation: LOC_SARIS, status: 'PENDING_STOCK_IN' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  db.item.findMany.mockResolvedValue(ITEMS);
  db.department.findMany.mockResolvedValue([]);
  db.location.findMany.mockResolvedValue([LOC_KALITY, LOC_SARIS]);
  db.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
  // Pending requests on two items, one of them in Saris
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
    where.status === 'RETURNED'
      ? [
          { id: 'r1', itemId: 'LAPTOP-K', transactionType: 'STOCK_IN', ifmisSlipNumber: '0000152', createdAtGc: '2026-10-01' },
          { id: 'r2', itemId: 'FUEL-K', transactionType: 'STOCK_IN', ifmisSlipNumber: '0000152', createdAtGc: '2026-10-01' },
          { id: 'r3', itemId: 'LAPTOP-S', transactionType: 'TRANSFER', ifmisSlipNumber: 'M21-9', createdAtGc: '2026-10-01' },
        ]
      : where.status === 'PENDING'
      ? [
          { itemId: 'FUEL-S', transactionType: 'STOCK_IN', status: 'PENDING', currentStage: 1, ifmisSlipNumber: 'M19-S' },
          { itemId: 'LAPTOP-K', transactionType: 'TRANSFER', status: 'PENDING', currentStage: 1, ifmisSlipNumber: 'M21-K' },
        ]
      : [],
  );
});

const dashboard = (filter?: Record<string, unknown>) => StoreService.getInstance().getExecutiveDashboard(filter);

describe('dashboard figures', () => {
  it('counts rejected requests back with their requesters, a voucher of several lines once, within the filters', async () => {
    expect((await dashboard()).rejectedWaitingCount).toBe(2);
    expect((await dashboard({ storeId: 'S-KAL' })).rejectedWaitingCount).toBe(1);
  });

  it('lists only fixed assets as the highest-value capital assets', async () => {
    const d = await dashboard();
    expect(d.topValuationAssets.length).toBeGreaterThan(0);
    expect(d.topValuationAssets.every((a: any) => a.itemType !== 'CONSUMABLE')).toBe(true);
  });
});

describe('dashboard filters', () => {
  it('counts everything without filters', async () => {
    const d = await dashboard();
    expect(d.totalItems).toBe(1 + 1 + 50);
    expect(d.pendingApprovalsCount).toBe(2);
    expect(d.pendingStockInCount).toBe(1);
    expect(d.locationUtilization).toHaveLength(2);
  });

  it('narrows every figure to one store, including its locations and pending requests', async () => {
    const d = await dashboard({ storeId: 'S-SAR' });
    expect(d.totalItems).toBe(1);
    expect(d.issuedCount).toBe(1);
    expect(d.availableCount).toBe(0);
    expect(d.pendingStockInCount).toBe(1);
    expect(d.pendingApprovalsCount).toBe(1);
    expect(d.locationUtilization.map((l: any) => l.id)).toEqual(['L-SAR']);
    // The system log is not narrowed
    expect(d.recentAuditLogs).toHaveLength(1);
  });

  it('narrows to a category and to an item type, and combines filters', async () => {
    expect((await dashboard({ category: 'FUEL_LUBRICANTS' })).totalItems).toBe(50);
    expect((await dashboard({ itemType: 'FIXED' })).totalItems).toBe(2);
    expect((await dashboard({ itemType: 'CONSUMABLE', storeId: 'S-KAL' })).totalValuationETB).toBe(50 * 100);
  });

  describe('a period', () => {
    // Received in January, still in store: outside an October period, but stale "as of today"
    const OLD = item('OLD-K', { ifmisSlipDateGc: '2026-01-10', createdAtGc: '2026-01-10' });
    beforeEach(() => {
      db.item.findMany.mockResolvedValue([...ITEMS, OLD]);
      db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
        where.status === 'PENDING'
          ? [{ itemId: 'LAPTOP-K', createdAtGc: '2026-10-05' }, { itemId: 'OLD-K', createdAtGc: '2026-02-01' }]
          : [{ itemId: 'OLD-K', reviewedAtGc: '2026-10-03', createdAtGc: '2026-10-02', requestDetails: { quantity: 1 } }],
      );
    });

    it('counts assets received in it, requests made in it, and movement across its months', async () => {
      const d = await dashboard({ from: '2026-10-01', to: '2026-12-31' });
      expect(d.totalItems).toBe(1 + 1 + 50);
      expect(d.pendingApprovalsCount).toBe(1);
      expect(d.stockMovement.map((m: any) => m.month)).toEqual(['2026-10', '2026-11', '2026-12']);
      // Received in October; the January laptop was issued in October, so it counts as issued then
      expect(d.stockMovement[0]).toMatchObject({ received: 1 + 1 + 50, issued: 1 });
    });

    it('keeps stock in store over 30 days "as of today", whatever the period', async () => {
      const d = await dashboard({ from: '2026-10-01', to: '2026-12-31' });
      expect(d.staleInStore.items.map((i: any) => i.itemCode)).toContain('OLD-K');
    });

    it('refuses dates that are not dates, or a period that ends before it starts', async () => {
      await expect(dashboard({ from: 'last month' })).rejects.toThrow(/YYYY-MM-DD/);
      await expect(dashboard({ from: '2026-12-01', to: '2026-10-01' })).rejects.toThrow(/starts after it ends/);
    });
  });

  it('refuses an unknown category or item type', async () => {
    await expect(dashboard({ category: 'SPACESHIPS' })).rejects.toThrow(/Unknown category/);
    await expect(dashboard({ itemType: 'BOTH' })).rejects.toThrow(/FIXED or CONSUMABLE/);
  });
});
