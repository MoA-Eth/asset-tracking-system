import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  department: { findUnique: vi.fn() },
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: 'Store-01', store: { name: 'Kality' } })) },
  item: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

vi.mock('./reference.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reference.service')>()),
  requireStoreKeeper: vi.fn(async (_db: unknown, _where: unknown, chosen?: string | null) => ({
    employeeId: chosen || 'EMP-STOREMAN',
    fullNameEn: 'Store Man',
    storeName: 'Kality',
  })),
}));

import { StoreService } from './store.service';
import { applySystemSettings } from './settings.service';

const record = (id: string, itemCode: string, name: string, quantity: number, storeId = 'STORE-KALITY') => ({
  id,
  itemCode,
  name,
  category: 'OTHER_SUPPLIES',
  status: 'AVAILABLE',
  condition: 'NEW',
  unitCostETB: 100,
  storeLocationId: `LOC-${storeId}`,
  storeLocation: { id: `LOC-${storeId}`, storeId },
  currentCustodianId: null,
  assignedDepartmentId: null,
  parentItemId: null,
  ifmisSlipNumber: 'GRN-1',
  notes: JSON.stringify({ quantity, uom: 'EA', ifmisItemCode: '111101102.0010' }),
});
const umbrellas = record('item-1', 'MOA-SUP-2026-0001', 'Umbrella', 10);
const gloves = record('item-2', 'MOA-SUP-2026-0002', 'Plastic glove', 20);
const elsewhere = record('item-3', 'MOA-SUP-2026-0003', 'Soap', 5, 'STORE-SARIS');
const all = [umbrellas, gloves, elsewhere];

const voucher = {
  ifmisSlipNumber: '0000001/A Inventory',
  ifmisSlipDateGc: '2026-10-01',
  transactionType: 'Miscellaneous issue',
  transportationCost: 250,
  purpose: 'Rainy season field work',
  recipientEmployeeId: 'EMP-A',
  targetDepartmentId: 'DEP-1',
  registeredById: 'EMP-ENC',
};
const store = () => StoreService.getInstance();

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({});
  db.employee.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, fullNameEn: `Employee ${where.id}`, role: 'DATA_ENCODER', isActive: true }));
  db.department.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, nameEn: `Directorate ${where.id}` }));
  db.item.findUnique.mockImplementation(async ({ where }: any) => all.find((i) => i.id === where.id) ?? null);
  db.item.findMany.mockImplementation(async ({ where }: any) => all.filter((i) => where.id.in.includes(i.id)));
  db.item.update.mockResolvedValue({});
  db.transactionApproval.findFirst.mockResolvedValue(null);
  db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: `appr-${data.itemId}`, currentStage: 1, ...data }));
  db.auditLog.create.mockResolvedValue({});
});

describe('issuing several lines of one Model 22', () => {
  it('registers each line as its own request with the voucher details; the transport cost goes on the first line', async () => {
    const result = await store().registerStockOuts({ ...voucher, lines: [{ itemId: 'item-1', quantity: 5 }, { itemId: 'item-2', quantity: 6 }] } as any);

    expect(result.approvals).toHaveLength(2);
    expect(result.approval.itemId).toBe('item-1');
    const [first, second] = db.transactionApproval.create.mock.calls.map((c) => c[0].data);
    expect(first).toMatchObject({ itemId: 'item-1', ifmisSlipNumber: '0000001/A Inventory', recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' });
    expect(first.requestDetails).toMatchObject({ quantity: 5, transactionType: 'Miscellaneous issue', transportationCost: 250 });
    expect(second).toMatchObject({ itemId: 'item-2', ifmisSlipNumber: '0000001/A Inventory' });
    expect(second.requestDetails).toMatchObject({ quantity: 6, transactionType: 'Miscellaneous issue' });
    expect(second.requestDetails.transportationCost).toBeUndefined();
  });

  it('checks every line before saving any: a bad line leaves nothing registered', async () => {
    // More than is in store on the second line
    await expect(store().registerStockOuts({ ...voucher, lines: [{ itemId: 'item-1', quantity: 5 }, { itemId: 'item-2', quantity: 21 }] } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('MOA-SUP-2026-0002: quantity must be a whole number from 1 to 20') });
    // The same item twice
    await expect(store().registerStockOuts({ ...voucher, lines: [{ itemId: 'item-1', quantity: 1 }, { itemId: 'item-1', quantity: 2 }] } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('same store item is on two lines') });
    // Items in two different stores
    await expect(store().registerStockOuts({ ...voucher, lines: [{ itemId: 'item-1', quantity: 1 }, { itemId: 'item-3', quantity: 1 }] } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('One Model 22 issues from one store') });
    // An item that already has a request waiting
    db.transactionApproval.findFirst.mockImplementation(async ({ where }: any) => (where.itemId === 'item-2' ? { transactionType: 'STOCK_OUT', ifmisSlipNumber: 'OLD-1' } : null));
    await expect(store().registerStockOuts({ ...voucher, lines: [{ itemId: 'item-1', quantity: 1 }, { itemId: 'item-2', quantity: 1 }] } as any))
      .rejects.toMatchObject({ statusCode: 409 });
    // No lines
    await expect(store().registerStockOuts({ ...voucher, lines: [] } as any)).rejects.toMatchObject({ statusCode: 400 });

    expect(db.transactionApproval.create).not.toHaveBeenCalled();
    expect(db.item.update).not.toHaveBeenCalled();
  });
});

describe('the purpose of an issue', () => {
  it('is optional, as it is not on the IFMIS Model 22; a disposal still needs its reason', async () => {
    await store().registerStockOut({ ...voucher, purpose: undefined, itemId: 'item-1', quantity: 2 } as any);
    expect(db.transactionApproval.create.mock.calls[0][0].data.purposeOrRemarks).toBe('');

    await expect(store().registerStockOut({ ...voucher, purpose: ' ', itemId: 'item-2', quantity: 1, disposal: true } as any))
      .rejects.toMatchObject({ statusCode: 400, message: 'Reason for disposal is required.' });
  });
});
