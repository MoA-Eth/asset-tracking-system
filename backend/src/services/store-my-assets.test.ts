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
};

beforeEach(() => {
  vi.clearAllMocks();
  db.item.findMany.mockResolvedValue([laptop]);
  db.transactionApproval.findMany.mockResolvedValue([]);
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
    });
    const text = JSON.stringify(asset);
    for (const leak of ['72000', 'Internal note', 'Someone Else', 'unitCostETB', 'history', 'notes', 'currentCustodianId']) {
      expect(text).not.toContain(leak);
    }
  });

  it('shows a waiting transfer or return', async () => {
    db.transactionApproval.findMany.mockResolvedValue([{ itemId: 'item-1', transactionType: 'RETURN', currentStage: 2 }]);
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset.pendingRequest).toEqual({ type: 'RETURN', stage: 2 });
    const lookup = db.transactionApproval.findMany.mock.calls[0][0];
    expect(lookup.where).toMatchObject({ itemId: { in: ['item-1'] }, status: 'PENDING', transactionType: { in: ['TRANSFER', 'RETURN'] } });
  });

  it('is empty, without a second lookup, for someone who holds nothing', async () => {
    db.item.findMany.mockResolvedValue([]);
    expect(await store().getMyAssets('EMP-NONE')).toEqual([]);
    expect(db.transactionApproval.findMany).not.toHaveBeenCalled();
  });

  it('counts a part of a batch by its own units', async () => {
    db.item.findMany.mockResolvedValue([{ ...laptop, notes: JSON.stringify({ quantity: 3, uom: 'BAG' }), history: [] }]);
    const [asset] = await store().getMyAssets('EMP-ME');
    expect(asset).toMatchObject({ quantity: 3, uom: 'BAG', assignedOnGc: undefined, voucherNo: undefined });
  });
});
