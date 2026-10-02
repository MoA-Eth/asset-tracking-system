import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCategory, ItemStatus } from '../types/asset-management';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  // Any store or department that is picked exists and is active
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, siteName: 'Store', isActive: true })) },
  department: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, nameEn: 'Directorate', isActive: true })) },
  item: { findMany: vi.fn(), create: vi.fn() },
  transactionApproval: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const basePayload = {
  name: 'Legacy Laptop',
  category: AssetCategory.IT_EQUIPMENT,
  serialNumber: 'LAP-001',
  unitCostETB: 55000,
  storeLocationId: 'LOC-01',
  ifmisSlipNumber: 'M19-001',
  ifmisSlipDateGc: '2026-09-30',
  registeredById: 'EMP-ENC-00',
};

describe('StoreService.registerStockIn approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC-00', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' });
    db.item.findMany.mockResolvedValue([]);
    db.item.create.mockImplementation(async ({ data }: any) => ({ id: 'item-1', ...data, history: [] }));
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'appr-1', currentStage: 1, ...data }));
    db.auditLog.create.mockResolvedValue({});
  });

  it.each([
    ['historical (slip waived)', { isHistoricalData: true }],
    ['regular with slip', { isHistoricalData: false, ifmisSlipAttachmentUrl: '/api/uploads/slips/x-slip.pdf' }],
  ])('%s stock-in starts PENDING_STOCK_IN and opens a Stage 1 approval', async (_label, extra) => {
    const result = await StoreService.getInstance().registerStockIn({ ...basePayload, ...extra } as any);

    expect(db.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ItemStatus.PENDING_STOCK_IN }) })
    );
    expect(result.item.status).toBe(ItemStatus.PENDING_STOCK_IN);
    expect(db.transactionApproval.create).toHaveBeenCalledTimes(1);
    expect(db.transactionApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ transactionType: 'STOCK_IN', status: 'PENDING' }) })
    );
    expect(result.approval).toBeDefined();
  });

  it('never registers an item directly as AVAILABLE', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any);

    const created = db.item.create.mock.calls[0][0].data;
    expect(created.status).not.toBe(ItemStatus.AVAILABLE);
  });

  it('still requires a slip attachment for non-historical registrations', async () => {
    await expect(
      StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: false } as any)
    ).rejects.toThrow(/attachment is required/i);
    expect(db.item.create).not.toHaveBeenCalled();
  });
});
