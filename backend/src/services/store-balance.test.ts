import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  item: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const meta = (quantity: number) => JSON.stringify({ quantity, uom: 'PKT' });

// A batch of 10 toner packs, registered as one record
const batch = {
  id: 'item-1',
  itemCode: 'MOA-IT-2026-0080',
  name: 'HP 26A Toner',
  category: 'IT_EQUIPMENT',
  unitCostETB: 3500,
  status: 'AVAILABLE',
  condition: 'NEW',
  storeLocationId: 'LOC-01',
  currentCustodianId: null,
  assignedDepartmentId: null,
  approvedById: 'EMP-HEAD',
  registeredById: 'EMP-ENC',
  ifmisSlipNumber: 'M19-080',
  ifmisSlipDateGc: '2026-10-01',
  ifmisSlipDateEc: '2019-01-21',
  isHistoricalData: false,
  parentItemId: null,
  notes: meta(10),
};

const employees: Record<string, any> = {
  'EMP-ENC': { id: 'EMP-ENC', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' },
  'EMP-HEAD': { id: 'EMP-HEAD', fullNameEn: 'Dept Head', role: 'DEPARTMENT_HEAD' },
  'EMP-A': { id: 'EMP-A', fullNameEn: 'Abebe Kebede', role: 'STAFF' },
};

const store = () => StoreService.getInstance();

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockImplementation(async ({ where }: any) => employees[where.id] ?? null);
  db.item.update.mockResolvedValue({});
  db.item.create.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

describe('item balance', () => {
  it('adds up a registration and the records split off it', async () => {
    db.item.findMany
      .mockResolvedValueOnce([{ ...batch, notes: meta(6) }]) // 6 packs left in store
      .mockResolvedValueOnce([
        { parentItemId: 'item-1', status: 'ISSUED', notes: meta(3) },
        { parentItemId: 'item-1', status: 'UNDER_TRANSFER', notes: meta(1) },
      ]);
    const [item] = await store().getItems();
    expect(item.balance).toEqual({ total: 10, issued: 4, available: 6, pending: 0 });
  });

  it('counts a pending registration in the total only, and leaves disposed units out', async () => {
    db.item.findMany
      .mockResolvedValueOnce([
        { ...batch, id: 'a', status: 'PENDING_STOCK_IN' },
        { ...batch, id: 'b', status: 'DISPOSED' },
      ])
      .mockResolvedValueOnce([]);
    const [pending, disposed] = await store().getItems();
    expect(pending.balance).toEqual({ total: 10, issued: 0, available: 0, pending: 10 });
    expect(disposed.balance).toEqual({ total: 0, issued: 0, available: 0, pending: 0 });
  });
});

describe('partial Stock-Out', () => {
  const request = {
    itemId: 'item-1',
    recipientEmployeeId: 'EMP-A',
    targetDepartmentId: 'DEP-1',
    ifmisSlipNumber: 'M22-500',
    ifmisSlipDateGc: '2026-10-01',
    purpose: 'Printer supplies',
    registeredById: 'EMP-ENC',
  };

  it('records how many units are requested, and refuses more than are in store', async () => {
    db.item.findUnique.mockResolvedValue({ ...batch });
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'so-1', ...data }));

    await store().registerStockOut({ ...request, quantity: 4 });
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toEqual({ quantity: 4, uom: 'PKT' });

    await expect(store().registerStockOut({ ...request, quantity: 11 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('issues the whole record when no quantity is given', async () => {
    db.item.findUnique.mockResolvedValue({ ...batch });
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'so-1', ...data }));
    await store().registerStockOut(request);
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toEqual({ quantity: 10, uom: 'PKT' });
  });

  const approvalAt = (quantity: number) => ({
    id: 'so-1',
    transactionType: 'STOCK_OUT',
    itemId: 'item-1',
    itemCode: batch.itemCode,
    ifmisSlipNumber: 'M22-500',
    recipientEmployeeId: 'EMP-A',
    targetDepartmentId: 'DEP-1',
    purposeOrRemarks: 'Printer supplies',
    requestDetails: { quantity, uom: 'PKT' },
    status: 'PENDING',
    currentStage: 2,
  });

  const approve = () =>
    store().handleApproval({ approvalId: 'so-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

  it('on approval, splits the issued units into their own record and keeps the rest in store', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(approvalAt(4));
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...approvalAt(4), ...data }));
    db.item.findUnique.mockImplementation(async ({ where }: any) => (where.id === 'item-1' ? { ...batch } : null));
    db.item.count.mockResolvedValue(0);

    const result = await approve();

    const rootUpdate = db.item.update.mock.calls[0][0].data;
    expect(rootUpdate.status).toBe('AVAILABLE');
    expect(rootUpdate.currentCustodianId).toBeNull();
    expect(JSON.parse(rootUpdate.notes)).toMatchObject({ quantity: 6, totalAmount: 21000 });
    expect(rootUpdate.history.create.notes).toMatch(/Issued 4 of 10 PKT as MOA-IT-2026-0080-1 to Abebe Kebede; 6 PKT remain in store/);

    const split = db.item.create.mock.calls[0][0].data;
    expect(split).toMatchObject({
      itemCode: 'MOA-IT-2026-0080-1',
      status: 'ISSUED',
      currentCustodianId: 'EMP-A',
      parentItemId: 'item-1',
    });
    expect(JSON.parse(split.notes)).toMatchObject({ quantity: 4, totalAmount: 14000 });
    expect(result.requestDetails?.issuedItemCode).toBe('MOA-IT-2026-0080-1');
  });

  it('numbers further splits after the existing ones, keyed to the original registration', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(approvalAt(2));
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...approvalAt(2), ...data }));
    db.item.findUnique.mockImplementation(async ({ where }: any) => (where.id === 'item-1' ? { ...batch, notes: meta(6) } : null));
    db.item.count.mockResolvedValue(1); // MOA-IT-2026-0080-1 already exists

    await approve();

    expect(db.item.create.mock.calls[0][0].data).toMatchObject({ itemCode: 'MOA-IT-2026-0080-2', parentItemId: 'item-1' });
    expect(JSON.parse(db.item.update.mock.calls[0][0].data.notes)).toMatchObject({ quantity: 4 });
  });

  it('issues the whole record as before when all units are requested', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(approvalAt(10));
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...approvalAt(10), ...data }));
    db.item.findUnique.mockResolvedValue({ ...batch });

    await approve();

    expect(db.item.update.mock.calls[0][0].data).toMatchObject({ status: 'ISSUED', currentCustodianId: 'EMP-A' });
    expect(db.item.create).not.toHaveBeenCalled();
  });
});
