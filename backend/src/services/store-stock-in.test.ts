import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCategory, ItemStatus } from '../types/asset-management';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  // Any store or department that is picked exists and is active
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, siteName: 'Store', isActive: true })) },
  department: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, nameEn: 'Directorate', isActive: true })) },
  item: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  transactionApproval: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { applySystemSettings } from './settings.service';

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
    db.item.findFirst.mockResolvedValue(null);
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

  it('leaves Received by empty rather than naming the encoder who entered the receipt', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any);
    expect(JSON.parse(db.item.create.mock.calls[0][0].data.notes).receivedBy).toBeUndefined();

    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: 'LAP-002', isHistoricalData: true, receivedBy: ' Almaz Ayana ' } as any);
    expect(JSON.parse(db.item.create.mock.calls[1][0].data.notes).receivedBy).toBe('Almaz Ayana');
  });

  it('refuses a unit of measure sent blank, and keeps EA only when none is sent', async () => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, uom: '  ' } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Unit of measure is required') });
    expect(db.item.create).not.toHaveBeenCalled();

    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, uom: 'KG' } as any);
    expect(JSON.parse(db.item.create.mock.calls[0][0].data.notes).uom).toBe('KG');
    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: 'LAP-002', isHistoricalData: true } as any);
    expect(JSON.parse(db.item.create.mock.calls[1][0].data.notes).uom).toBe('EA');
  });

  it('never registers an item directly as AVAILABLE', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any);

    const created = db.item.create.mock.calls[0][0].data;
    expect(created.status).not.toBe(ItemStatus.AVAILABLE);
  });

  it('refuses a serial number that another item already has, and names that item', async () => {
    db.item.findFirst.mockResolvedValue({ itemCode: 'MOA-IT-2026-0007', name: 'Dell Latitude' });

    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: ' lap-001 ', isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Serial number lap-001 is already registered on MOA-IT-2026-0007 (Dell Latitude). Check the number, or leave it empty for items without one.',
    });
    // Compared without regard to case, and a rejected or disposed item frees its number
    expect(db.item.findFirst.mock.calls[0][0].where).toMatchObject({ serialNumber: { equals: 'lap-001', mode: 'insensitive' }, status: { not: 'DISPOSED' } });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('does not check items registered without a serial number', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: '', isHistoricalData: true } as any);

    expect(db.item.findFirst).not.toHaveBeenCalled();
    expect(db.item.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a slip whose lines repeat a serial number, before saving any line', async () => {
    const items = [
      { name: 'Laptop A', category: AssetCategory.IT_EQUIPMENT, serialNumber: 'SN-77', unitCostETB: 1 },
      { name: 'Laptop B', category: AssetCategory.IT_EQUIPMENT, serialNumber: 'sn-77', unitCostETB: 1 },
    ];
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, items, isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Two lines on this slip have the same serial number.',
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative price', { unitCostETB: -5 }],
    ['a quantity of zero', { quantity: 0 }],
    ['a slip date in the future', { ifmisSlipDateGc: '2999-01-01' }],
    ['a slip date that is not a real day', { ifmisSlipDateGc: '2026-13-45' }],
    ['an unknown category', { category: 'SPACESHIPS' }],
    ['an unknown condition', { condition: 'SPARKLING' }],
    ['a blank description', { name: '   ' }],
  ])('refuses %s with a 400', async (_label, extra) => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, ...extra } as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('accepts a registration without a scanned slip while the setting is optional', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: false } as any);
    expect(db.item.create).toHaveBeenCalledTimes(1);
  });

  it('requires a scanned slip once the setting is switched to required, historical or not', async () => {
    applySystemSettings({ slipAttachmentPolicy: 'REQUIRED' });
    try {
      for (const isHistoricalData of [false, true]) {
        await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData } as any)).rejects.toMatchObject({
          statusCode: 400,
          message: 'A scanned copy of the slip is required. Attach it and try again.',
        });
      }
      expect(db.item.create).not.toHaveBeenCalled();

      await StoreService.getInstance().registerStockIn({ ...basePayload, ifmisSlipAttachmentUrl: '/api/uploads/slips/x-slip.pdf' } as any);
      expect(db.item.create).toHaveBeenCalledTimes(1);
    } finally {
      applySystemSettings({});
    }
  });
});
