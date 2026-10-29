import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  item: { findMany: vi.fn() },
  department: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  transactionApproval: { count: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { getTodayGcAndEc } from '../utils/eth-date';

const daysAgo = (n: number) => new Date(Date.parse(getTodayGcAndEc().gc) - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const record = (code: string, status: string, receivedDaysAgo: number, extra: Record<string, unknown> = {}) => ({
  id: code,
  itemCode: code,
  name: `Item ${code}`,
  category: 'IT_EQUIPMENT',
  status,
  condition: 'NEW',
  unitCostETB: 1000,
  storeLocationId: 'LOC-01',
  ifmisSlipNumber: `M19-${code}`,
  ifmisSlipDateGc: daysAgo(receivedDaysAgo),
  createdAtGc: daysAgo(receivedDaysAgo),
  notes: JSON.stringify({ quantity: 4, uom: 'PKT' }),
  history: [],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.department.findMany.mockResolvedValue([]);
  db.location.findMany.mockResolvedValue([]);
  db.transactionApproval.count.mockResolvedValue(0);
  db.transactionApproval.findMany.mockResolvedValue([]);
  db.auditLog.findMany.mockResolvedValue([]);
});

describe('dashboard: items in store longer than 30 days', () => {
  it('lists units still in store after 30 days, oldest first', async () => {
    db.item.findMany.mockResolvedValue([
      record('OLD', 'AVAILABLE', 40),
      record('OLDER-PENDING', 'PENDING_STOCK_OUT', 55),
      record('NEW', 'AVAILABLE', 10),
      record('EXACTLY-30', 'AVAILABLE', 30),
      record('ISSUED', 'ISSUED', 100),
      // received long ago, but came back to store 5 days ago
      record('RETURNED', 'AVAILABLE', 200, { history: [{ action: 'RETURN_APPROVED', dateGc: daysAgo(5) }] }),
    ]);

    const { staleInStore } = await StoreService.getInstance().getExecutiveDashboard();

    expect(staleInStore.thresholdDays).toBe(30);
    expect(staleInStore.items.map((i: any) => i.itemCode)).toEqual(['OLDER-PENDING', 'OLD']);
    expect(staleInStore.items[0]).toMatchObject({ daysInStore: 55, unitsInStore: 4, uom: 'PKT', issuePending: true, valueETB: 4000 });
    expect(staleInStore.items[1]).toMatchObject({ daysInStore: 40, issuePending: false, inStoreSinceGc: daysAgo(40) });
    expect(staleInStore).toMatchObject({ itemCount: 2, units: 8, valueETB: 8000 });
  });

  it('is empty when everything was distributed or arrived recently', async () => {
    db.item.findMany.mockResolvedValue([record('NEW', 'AVAILABLE', 3), record('ISSUED', 'ISSUED', 300)]);
    const { staleInStore } = await StoreService.getInstance().getExecutiveDashboard();
    expect(staleInStore).toMatchObject({ itemCount: 0, units: 0, items: [] });
  });
});

describe('dashboard: stock movement', () => {
  it('adds up units received and issued per month over the last 6 months', async () => {
    const thisMonth = getTodayGcAndEc().gc.slice(0, 7);
    db.item.findMany.mockResolvedValue([
      // a registration of 4 packs received this month, 1 of which was split off when issued
      record('BATCH', 'AVAILABLE', 0, { notes: JSON.stringify({ quantity: 3, uom: 'PKT' }) }),
      record('BATCH-1', 'ISSUED', 0, { parentItemId: 'BATCH', notes: JSON.stringify({ quantity: 1, uom: 'PKT' }) }),
      // still waiting for approval: not received yet
      record('PENDING', 'PENDING_STOCK_IN', 0),
      // received long before the window
      record('ANCIENT', 'AVAILABLE', 400),
    ]);
    db.transactionApproval.findMany.mockResolvedValue([
      { itemId: 'BATCH', reviewedAtGc: getTodayGcAndEc().gc, createdAtGc: getTodayGcAndEc().gc, requestDetails: { quantity: 1 } },
    ]);

    const { stockMovement } = await StoreService.getInstance().getExecutiveDashboard();

    expect(stockMovement).toHaveLength(6);
    expect(stockMovement[5]).toEqual({ month: thisMonth, received: 4, issued: 1 });
    expect(stockMovement.slice(0, 5).every((m: any) => m.received === 0 && m.issued === 0)).toBe(true);
  });
});

describe('dashboard: totals count approved assets only', () => {
  it('leaves receipts awaiting endorsement or approval, and rejected ones, out of every total', async () => {
    db.location.findMany.mockResolvedValue([{ id: 'LOC-01', name: 'Store-01', store: { name: 'Kality' } }]);
    db.item.findMany.mockResolvedValue([
      record('IN-STORE', 'AVAILABLE', 3),
      record('WITH-STAFF', 'ISSUED', 3, { condition: 'GOOD' }),
      record('AWAITING-ENDORSEMENT', 'PENDING_STOCK_IN', 1, { unitCostETB: 900000 }),
      record('REJECTED', 'REJECTED', 1, { unitCostETB: 500000 }),
      record('DISPOSED-OF', 'DISPOSED', 1, { unitCostETB: 700000 }),
    ]);

    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.status === 'PENDING' ? [{ itemId: 'AWAITING-ENDORSEMENT', transactionType: 'STOCK_IN', status: 'PENDING', currentStage: 1, ifmisSlipNumber: 'M19-P' }] : [],
    );
    const d = await StoreService.getInstance().getExecutiveDashboard();

    // 4 units each for the two approved records; the pending receipt is reported on its own
    expect(d).toMatchObject({ totalItems: 8, totalValuationETB: 8000, availableCount: 4, issuedCount: 4, pendingStockInCount: 1 });
    expect(d.availableCount + d.issuedCount).toBe(d.totalItems);
    expect(d.unassignedItemsCount).toBe(8);
    expect(d.topValuationAssets.map((i: any) => i.itemCode).sort()).toEqual(['IN-STORE', 'WITH-STAFF']);
    expect(d.categoryBreakdown.find((c: any) => c.category === 'IT_EQUIPMENT')).toMatchObject({ count: 8, totalValueETB: 8000 });
    expect(d.conditionDistribution.find((c: any) => c.condition === 'NEW')).toMatchObject({ count: 4 });
    expect(d.locationUtilization[0]).toMatchObject({ itemCount: 8, totalValueETB: 8000, pendingCount: 4 });
  });
});

describe('dashboard: low-stock consumables', () => {
  it('flags consumables in store that are at or below reorder threshold', async () => {
    db.item.findMany.mockResolvedValue([
      record('TONER-LOW', 'AVAILABLE', 5, {
        itemType: 'CONSUMABLE',
        category: 'OFFICE_SUPPLIES',
        notes: JSON.stringify({ quantity: 2, uom: 'EA' }),
      }),
      record('PEN-CRITICAL', 'AVAILABLE', 2, {
        itemType: 'CONSUMABLE',
        category: 'OFFICE_SUPPLIES',
        notes: JSON.stringify({ quantity: 1, uom: 'PCS' }),
      }),
      record('PAPER-HEALTHY', 'AVAILABLE', 10, {
        itemType: 'CONSUMABLE',
        category: 'OFFICE_SUPPLIES',
        notes: JSON.stringify({ quantity: 50, uom: 'REAM' }),
      }),
      record('LAPTOP-FIXED', 'AVAILABLE', 10, {
        itemType: 'FIXED',
        category: 'IT_EQUIPMENT',
        notes: JSON.stringify({ quantity: 1, uom: 'EA' }),
      }),
    ]);

    const { lowStockConsumables } = await StoreService.getInstance().getExecutiveDashboard();

    expect(lowStockConsumables.thresholdDefault).toBe(5);
    expect(lowStockConsumables.itemCount).toBe(2);
    expect(lowStockConsumables.criticalCount).toBe(1);
    expect(lowStockConsumables.units).toBe(3);
    expect(lowStockConsumables.items[0]).toMatchObject({ itemCode: 'PEN-CRITICAL', unitsInStore: 1, isCritical: true, isLow: true });
    expect(lowStockConsumables.items[1]).toMatchObject({ itemCode: 'TONER-LOW', unitsInStore: 2, isCritical: false, isLow: true });
  });
});


describe('dashboard: asset categories count fixed assets only', () => {
  it('counts a bus as a vehicle, but not batteries, filters or thinner filed under Vehicles', async () => {
    db.item.findMany.mockResolvedValue([
      record('BUS', 'ISSUED', 3, { category: 'VEHICLE', itemType: 'FIXED', unitCostETB: 5_000_000, notes: JSON.stringify({ quantity: 4, uom: 'EA' }) }),
      record('MINIBUS', 'AVAILABLE', 3, { category: 'VEHICLE', itemType: 'FIXED', unitCostETB: 3_000_000, notes: JSON.stringify({ quantity: 5, uom: 'EA' }) }),
      record('BATTERY', 'AVAILABLE', 3, { category: 'VEHICLE', itemType: 'CONSUMABLE', unitCostETB: 9000, notes: JSON.stringify({ quantity: 90, uom: 'EA' }) }),
      record('THINNER', 'ISSUED', 3, { category: 'VEHICLE', itemType: 'CONSUMABLE', unitCostETB: 400, notes: JSON.stringify({ quantity: 50, uom: 'LTR' }) }),
      record('TRACTOR-PART', 'AVAILABLE', 3, { category: 'AGRI_MACHINERY', itemType: 'CONSUMABLE', notes: JSON.stringify({ quantity: 20, uom: 'EA' }) }),
    ]);

    const d = await StoreService.getInstance().getExecutiveDashboard();

    expect(d.categoryBreakdown.find((c: any) => c.category === 'VEHICLE')).toMatchObject({ count: 9, totalValueETB: 35_000_000 });
    expect(d.categoryBreakdown.find((c: any) => c.category === 'AGRI_MACHINERY')).toMatchObject({ count: 0 });
    expect(d.fleetStats).toMatchObject({ totalVehicles: 9, activeVehicles: 4, inStoreVehicles: 5, totalMachinery: 0 });
    // The spare parts and supplies are still counted, as consumables
    expect(d.consumableCount).toBe(160);
  });
});

describe('dashboard: motorcycles', () => {
  it('are a category of their own, and a tile of their own in the fleet figures', async () => {
    db.item.findMany.mockResolvedValue([
      record('BUS', 'AVAILABLE', 3, { name: 'Electric Bus', category: 'VEHICLE', itemType: 'FIXED', unitCostETB: 5_000_000, notes: JSON.stringify({ quantity: 4, uom: 'EA' }) }),
      record('MOTO', 'AVAILABLE', 3, { name: 'motor cycle', category: 'VEHICLE', itemType: 'FIXED', unitCostETB: 761_739.13, notes: JSON.stringify({ quantity: 50, uom: 'EA' }) }),
      record('MOTO-OUT', 'ISSUED', 3, { name: 'Motorbike Yamaha', category: 'VEHICLE', itemType: 'FIXED', unitCostETB: 700_000, notes: JSON.stringify({ quantity: 2, uom: 'EA' }) }),
      // A motorcycle part is a consumable: not a motorcycle
      record('MOTO-PART', 'AVAILABLE', 3, { name: 'motor cycle chain', category: 'VEHICLE', itemType: 'CONSUMABLE', notes: JSON.stringify({ quantity: 30, uom: 'EA' }) }),
    ]);

    const d = await StoreService.getInstance().getExecutiveDashboard();

    // A slice of their own: Vehicles are the bus, Motorcycles the 52
    expect(d.categoryBreakdown.find((c: any) => c.category === 'VEHICLE')).toMatchObject({ count: 4 });
    expect(d.categoryBreakdown.find((c: any) => c.category === 'MOTORCYCLE')).toMatchObject({ count: 52 });
    expect(d.fleetStats).toMatchObject({
      totalVehicles: 4, inStoreVehicles: 4,
      totalMotorcycles: 52, activeMotorcycles: 2, inStoreMotorcycles: 50,
    });
  });
});

describe('dashboard: total assets', () => {
  it('counts fixed assets by units and registrations (a batch issued in parts is one), and consumables by lines', async () => {
    db.item.findMany.mockResolvedValue([
      record('LAPTOPS', 'AVAILABLE', 3, { itemType: 'FIXED', notes: JSON.stringify({ quantity: 6, uom: 'EA' }) }),
      // Two laptops of that batch issued: a piece of the same registration
      record('LAPTOPS-1', 'ISSUED', 3, { itemType: 'FIXED', parentItemId: 'LAPTOPS', notes: JSON.stringify({ quantity: 2, uom: 'EA' }) }),
      record('BUS', 'ISSUED', 3, { category: 'VEHICLE', itemType: 'FIXED', notes: JSON.stringify({ quantity: 1, uom: 'EA' }) }),
      record('EAR-TAGS', 'AVAILABLE', 3, { itemType: 'CONSUMABLE', notes: JSON.stringify({ quantity: 200000, uom: 'EA' }) }),
      record('THINNER', 'ISSUED', 3, { itemType: 'CONSUMABLE', notes: JSON.stringify({ quantity: 50, uom: 'LTR' }) }),
    ]);

    const d = await StoreService.getInstance().getExecutiveDashboard();

    expect(d.fixedAssets).toMatchObject({ units: 9, registrations: 2, inStoreUnits: 6, issuedUnits: 3 });
    expect(d.consumables).toMatchObject({ lines: 2, inStoreLines: 1, issuedLines: 1 });
    // The old sum of everything stays available, for the API
    expect(d.totalItems).toBe(200059);
  });
});
