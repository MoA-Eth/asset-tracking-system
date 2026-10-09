import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  item: { findMany: vi.fn() },
  transactionApproval: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const store = () => StoreService.getInstance();

const laptop = {
  id: 'item-1',
  itemCode: 'MOA-IT-2024-0002',
  name: 'HP ProBook 450 Laptop',
  category: 'IT_EQUIPMENT',
  serialNumber: 'SN-1',
  condition: 'GOOD',
  status: 'ISSUED',
  unitCostETB: 72000,
  currentCustodianId: 'EMP-ME',
  notes: JSON.stringify({ quantity: 1, uom: 'EA', remark: 'Internal note' }),
  history: [{ dateGc: '2026-09-01', ifmisSlipNumber: 'M22-77', toEntity: 'Almaz Ayana', performedBy: 'Someone Else' }],
  assignedDepartment: { id: 'DEP-1', nameEn: 'Agricultural Extension' },
  storeLocation: { id: 'LOC-1', name: 'Central Store', store: { name: 'Head office' } },
};
const issueApproval = { itemId: 'item-1', purposeOrRemarks: 'Crop surveys (Remark: Store note, keep private)', requestDetails: { quantity: 1 } };

beforeEach(() => {
  vi.clearAllMocks();
  db.item.findMany.mockResolvedValue([laptop]);
  // Waiting requests and approved issues are two lookups on the same table
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) => (where.status === 'APPROVED' ? [issueApproval] : []));
});

describe('My assets', () => {
  it('asks only for what is issued to the signed-in person', async () => {
    await store().getMyAssets('EMP-ME');
    const query = db.item.findMany.mock.calls[0][0];
    expect(query.where.currentCustodianId).toBe('EMP-ME');
    expect(query.where.status).toEqual({ in: ['ISSUED', 'UNDER_TRANSFER'] });
    // No way to widen it: nothing but the person's own id and the two statuses
    expect(Object.keys(query.where).sort()).toEqual(['currentCustodianId', 'status']);
  });

  it('returns the asset, when and on which slip it was given, and nothing about cost, notes or other people', async () => {
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset).toEqual({
      id: 'item-1', itemCode: 'MOA-IT-2024-0002', name: 'HP ProBook 450 Laptop', category: 'IT_EQUIPMENT', serialNumber: 'SN-1',
      condition: 'GOOD', quantity: 1, uom: 'EA', status: 'ISSUED', assignedOnGc: '2026-09-01', voucherNo: 'M22-77', pendingRequest: undefined,
      issuedFrom: 'Head office · Central Store', department: 'Agricultural Extension', purpose: 'Crop surveys',
    });
    const text = JSON.stringify(asset);
    for (const leak of ['72000', 'Internal note', 'Someone Else', 'unitCostETB', 'history', 'notes', 'currentCustodianId', 'Store note', 'private']) {
      expect(text).not.toContain(leak);
    }
  });

  it('shows a waiting transfer or return', async () => {
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) => (where.status === 'PENDING' ? [{ itemId: 'item-1', transactionType: 'RETURN', currentStage: 2 }] : []));
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset.pendingRequest).toEqual({ type: 'RETURN', stage: 2 });
    const waiting = db.transactionApproval.findMany.mock.calls.map((c: any) => c[0]).find((q: any) => q.where.status === 'PENDING');
    expect(waiting.where).toMatchObject({ itemId: { in: ['item-1'] }, transactionType: { in: ['TRANSFER', 'RETURN'] } });
    // The approved issues looked up are only those made to this person
    const issued = db.transactionApproval.findMany.mock.calls.map((c: any) => c[0]).find((q: any) => q.where.status === 'APPROVED');
    expect(issued.where.recipientEmployeeId).toBe('EMP-ME');
  });

  it('is empty, without a second lookup, for someone who holds nothing', async () => {
    db.item.findMany.mockResolvedValue([]);
    expect(await store().getMyAssets('EMP-NONE')).toEqual([]);
    expect(db.transactionApproval.findMany).not.toHaveBeenCalled();
  });

  it('finds the purpose of a part of a batch through the record split off for it', async () => {
    db.item.findMany.mockResolvedValue([{ ...laptop, id: 'item-1-1', itemCode: 'MOA-IT-2024-0002-1' }]);
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.status === 'APPROVED' ? [{ itemId: 'item-1', purposeOrRemarks: 'Crop surveys', requestDetails: { quantity: 1, issuedItemCode: 'MOA-IT-2024-0002-1' } }] : []);
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset.purpose).toBe('Crop surveys');
  });

  it('counts a part of a batch by its own units', async () => {
    db.item.findMany.mockResolvedValue([{ ...laptop, notes: JSON.stringify({ quantity: 3, uom: 'BAG' }), history: [] }]);
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset).toMatchObject({ quantity: 3, uom: 'BAG', assignedOnGc: undefined, voucherNo: undefined });
  });
});
