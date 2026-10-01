import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  item: { findMany: vi.fn() },
  department: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  transactionApproval: { count: vi.fn() },
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
