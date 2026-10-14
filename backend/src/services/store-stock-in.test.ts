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

// Stores have a store man in these tests; the rules about stores without one are in store-keepers.test.ts
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

const basePayload = {
  name: 'Legacy Laptop',
  // A fixed asset is known by its tag; a consumable by its IFMIS item code
  itemCode: 'MOA-TEST-0001',
  ifmisItemCode: '008101101.0001',
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

  it('names a store man of the receiving store as who received the goods, not whoever typed the receipt, and not a typed name', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any);
    expect(JSON.parse(db.item.create.mock.calls[0][0].data.notes).receivedBy).toBe('Store Man');

    // A name typed into the request is replaced by the store man's
    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: 'LAP-002', isHistoricalData: true, receivedBy: ' Almaz Ayana ' } as any);
    expect(JSON.parse(db.item.create.mock.calls[1][0].data.notes).receivedBy).toBe('Store Man');
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

  it('records a donation without PO number, supplier, buyer or price, whatever is sent', async () => {
    await StoreService.getInstance().registerStockIn({
      ...basePayload,
      isHistoricalData: true,
      provisionType: 'DONATION',
      poNumber: '186',
      source: 'Some Supplier',
      buyer: 'Some Buyer',
      items: [
        { name: 'Donated tablet', itemType: 'FIXED', itemCode: 'MOA-TEST-0002', unitCostETB: 9000, quantity: 1, totalAmount: 9000 },
        { name: 'Donated charger', itemType: 'CONSUMABLE', ifmisItemCode: '108101101.0021', unitCostETB: 300, quantity: 2 },
      ],
    } as any);
    expect(db.item.create).toHaveBeenCalledTimes(2);
    for (const [call] of db.item.create.mock.calls) {
      expect(call.data.unitCostETB).toBe(0);
      const meta = JSON.parse(call.data.notes);
      expect(meta).toMatchObject({ provisionType: 'DONATION', totalAmount: 0 });
      expect(meta.poNumber).toBeUndefined();
      expect(meta.source).toBeUndefined();
      expect(meta.buyer).toBeUndefined();
    }
  });

  it('records a purchase by default, and refuses an unknown type of provision', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, poNumber: '186' } as any);
    expect(JSON.parse(db.item.create.mock.calls[0][0].data.notes)).toMatchObject({ provisionType: 'PURCHASE', poNumber: '186' });
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, provisionType: 'GIFT' } as any))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('saves the item type, and treats an item sent without one as a fixed asset', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'CONSUMABLE', ifmisItemCode: '108101101.0021' } as any);
    expect(db.item.create.mock.calls[0][0].data.itemType).toBe('CONSUMABLE');

    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: 'LAP-002', isHistoricalData: true } as any);
    expect(db.item.create.mock.calls[1][0].data.itemType).toBe('FIXED');
  });

  it('refuses an item type that is neither fixed nor consumable', async () => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'SERVICE' } as any))
      .rejects.toMatchObject({ statusCode: 400, message: 'Choose whether this is a fixed asset or a consumable item.' });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('refuses an item type that the IFMIS item code contradicts (1… consumable, 0… fixed asset)', async () => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'FIXED', ifmisItemCode: '108101101.0021' } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Item code 108101101\.0021 is a consumable/) });
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'CONSUMABLE', quantity: 3, ifmisItemCode: '008101101.0001' } as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Item code 008101101\.0001 is a fixed asset/) });
    expect(db.item.create).not.toHaveBeenCalled();
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
    expect(db.item.findFirst.mock.calls[0][0].where).toMatchObject({ serialNumber: { equals: 'lap-001', mode: 'insensitive' }, status: { notIn: ['DISPOSED', 'REJECTED'] } });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('does not check items registered without a serial number', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: '', isHistoricalData: true } as any);

    // The only lookup is the tag number's; no serial number is looked up
    expect(db.item.findFirst).toHaveBeenCalledTimes(1);
    expect(db.item.findFirst.mock.calls[0][0].where).toHaveProperty('itemCode');
    expect(db.item.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a slip whose lines repeat a serial number, before saving any line', async () => {
    const items = [
      { name: 'Laptop A', itemCode: 'MOA-TEST-0011', category: AssetCategory.IT_EQUIPMENT, serialNumber: 'SN-77', unitCostETB: 1 },
      { name: 'Laptop B', itemCode: 'MOA-TEST-0012', category: AssetCategory.IT_EQUIPMENT, serialNumber: 'sn-77', unitCostETB: 1 },
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

  it('registers a fixed asset as one item: quantity 1, while a consumable can be several', async () => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'FIXED', quantity: 10 } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('A fixed asset is one item'),
    });
    // No type sent is a fixed asset
    await expect(
      StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, items: [{ name: 'Laptop', unitCostETB: 1, quantity: 2 }] } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.item.create).not.toHaveBeenCalled();

    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'CONSUMABLE', ifmisItemCode: '108101101.0021', quantity: 10 } as any);
    expect(db.item.create).toHaveBeenCalledTimes(1);
  });

  it('knows every item by its IFMIS item code; a fixed asset needs no tag and gets a system code', async () => {
    const { itemCode: _tag, ifmisItemCode: _code, ...noCodes } = basePayload;
    await expect(StoreService.getInstance().registerStockIn({ ...noCodes, isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Enter the item code'),
    });
    await expect(StoreService.getInstance().registerStockIn({ ...noCodes, isHistoricalData: true, itemType: 'CONSUMABLE', quantity: 5 } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Enter the item code'),
    });
    expect(db.item.create).not.toHaveBeenCalled();

    // The tag becomes the item code; the IFMIS code is kept with a consumable
    await StoreService.getInstance().registerStockIn({ ...noCodes, isHistoricalData: true, itemCode: 'MOA-072351' } as any);
    expect(db.item.create.mock.calls[0][0].data.itemCode).toBe('MOA-072351');
    await StoreService.getInstance().registerStockIn({ ...noCodes, serialNumber: '', isHistoricalData: true, itemType: 'CONSUMABLE', quantity: 5, ifmisItemCode: '108101101.0021' } as any);
    expect(JSON.parse(db.item.create.mock.calls[1][0].data.notes).ifmisItemCode).toBe('108101101.0021');
    // A fixed asset with no tag: the system gives it a code
    await StoreService.getInstance().registerStockIn({ ...noCodes, serialNumber: '', isHistoricalData: true, ifmisItemCode: '008101101.0001' } as any);
    expect(db.item.create.mock.calls[2][0].data.itemCode).toMatch(/^MOA-[A-Z]+-\d{4}-\d{4}$/);
  });

  it('refuses a tag number already in the register, or twice on one slip', async () => {
    db.item.findFirst.mockImplementation(async ({ where }: any) => (where.itemCode ? { itemCode: 'MOA-072351', name: 'Handheld GPS' } : null));
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemCode: 'moa-072351' } as any)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Tag number moa-072351 is already registered (Handheld GPS)'),
    });
    db.item.findFirst.mockResolvedValue(null);
    const items = [
      { name: 'GPS A', itemCode: 'MOA-1001', unitCostETB: 1 },
      { name: 'GPS B', itemCode: 'moa-1001', unitCostETB: 1 },
    ];
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, serialNumber: '', items, isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Two lines on this slip have tag number moa-1001.',
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });
});
