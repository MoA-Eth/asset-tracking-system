import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCategory, ItemStatus } from '../types/asset-management';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  // Any store or department that is picked exists and is active
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, siteName: 'Store', isActive: true })) },
  department: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, nameEn: 'Directorate', isActive: true })) },
  item: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  transactionApproval: { create: vi.fn(), findMany: vi.fn() },
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
  ifmisItemCode: '308101101.0001',
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

  it('records a donation without PO number, supplier, or buyer, preserving prices when provided', async () => {
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
    const calls = db.item.create.mock.calls;
    expect(calls[0][0].data.unitCostETB).toBe(9000);
    const meta0 = JSON.parse(calls[0][0].data.notes);
    expect(meta0).toMatchObject({ provisionType: 'DONATION', totalAmount: 9000 });
    expect(meta0.poNumber).toBeUndefined();
    expect(meta0.source).toBeUndefined();
    expect(meta0.buyer).toBeUndefined();

    expect(calls[1][0].data.unitCostETB).toBe(300);
    const meta1 = JSON.parse(calls[1][0].data.notes);
    expect(meta1).toMatchObject({ provisionType: 'DONATION', totalAmount: 600 });
  });

  it('allows registering a donation without an IFMIS item code', async () => {
    const { itemCode: _tag, ifmisItemCode: _code, ...noCodes } = basePayload;
    await StoreService.getInstance().registerStockIn({
      ...noCodes,
      name: 'mule',
      serialNumber: '',
      provisionType: 'DONATION',
      isHistoricalData: true,
      itemType: 'FIXED',
    } as any);
    expect(db.item.create).toHaveBeenCalledTimes(1);
    const created = db.item.create.mock.calls[0][0].data;
    expect(created.name).toBe('mule');
    expect(created.itemType).toBe('FIXED');
    const meta = JSON.parse(created.notes);
    expect(meta.provisionType).toBe('DONATION');
    expect(meta.ifmisItemCode).toBeUndefined();
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

  it('takes the type from the IFMIS code when none is sent: 3… fixed asset, 0… and 1… consumable', async () => {
    const typeFor = async (ifmisItemCode: string, n: number) => {
      await StoreService.getInstance().registerStockIn({ ...basePayload, itemCode: undefined, serialNumber: `S-${n}`, name: `Item ${n}`, isHistoricalData: true, ifmisItemCode } as any);
      return db.item.create.mock.calls[n][0].data.itemType;
    };
    expect(await typeFor('308101101.0001', 0)).toBe('FIXED');
    expect(await typeFor('008101101.0001', 1)).toBe('CONSUMABLE');
    expect(await typeFor('108101101.0021', 2)).toBe('CONSUMABLE');
    // A type sent with the line wins over the code
    await StoreService.getInstance().registerStockIn({ ...basePayload, itemCode: undefined, serialNumber: 'S-3', name: 'Item 3', isHistoricalData: true, ifmisItemCode: '008101101.0001', itemType: 'FIXED' } as any);
    expect(db.item.create.mock.calls[3][0].data.itemType).toBe('FIXED');
  });

  it('refuses an item type that is neither fixed nor consumable', async () => {
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'SERVICE' } as any))
      .rejects.toMatchObject({ statusCode: 400, message: 'Choose whether this is a fixed asset or a consumable item.' });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('accepts item codes with non-default prefixes for fixed assets and consumables', async () => {
    // Non-default fixed asset code (e.g. starting with 2... or letters)
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'FIXED', ifmisItemCode: '208101101.0001' } as any);
    expect(db.item.create).toHaveBeenCalled();
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

    // No serial number is looked up
    expect(db.item.findFirst.mock.calls.some((c: any) => c[0]?.where?.serialNumber)).toBe(false);
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
    // A typo or a misread slip: 0026 for 2026
    ['a slip date with an impossible year', { ifmisSlipDateGc: '0026-05-12' }],
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

  it('receives any quantity, of a fixed asset as well as a consumable', async () => {
    await StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true, itemType: 'FIXED', quantity: 13 } as any);
    expect(db.item.create).toHaveBeenCalledTimes(1);
    db.item.create.mockClear();

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

  it('codes vehicle parts and accessories as VPA', async () => {
    const { itemCode: _tag, ...noTag } = basePayload;
    await StoreService.getInstance().registerStockIn({ ...noTag, serialNumber: '', isHistoricalData: true, category: 'VEHICLE_PARTS', name: 'Oil Filter', itemType: 'CONSUMABLE' } as any);
    expect(db.item.create.mock.calls[0][0].data).toMatchObject({ category: 'VEHICLE_PARTS', itemCode: expect.stringMatching(/^MOA-VPA-\d{4}-\d{4}$/) });
  });

  it('codes tools and equipment as TLS', async () => {
    const { itemCode: _tag, ...noTag } = basePayload;
    await StoreService.getInstance().registerStockIn({ ...noTag, serialNumber: '', isHistoricalData: true, category: 'TOOLS_EQUIPMENT', name: 'Wheelbarrow' } as any);
    expect(db.item.create.mock.calls[0][0].data).toMatchObject({ category: 'TOOLS_EQUIPMENT', itemCode: expect.stringMatching(/^MOA-TLS-\d{4}-\d{4}$/) });
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

  it('refuses duplicate entrance when an item is already received on the same Model 19 slip', async () => {
    db.item.findMany.mockImplementation(async ({ where }: any) =>
      where?.ifmisSlipNumber ? [{ id: 'item-1', itemCode: 'MOA-0001', name: 'Legacy Laptop', ifmisSlipNumber: 'M19-001', status: 'AVAILABLE', notes: null, unitCostETB: 1 }] : []);
    await expect(
      StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Duplicate entrance is not permitted'),
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });
  it('refuses a line already received under another description: same IFMIS item code at the same price', async () => {
    db.item.findMany.mockImplementation(async ({ where }: any) =>
      where?.ifmisSlipNumber
        ? [{ id: 'item-2', itemCode: 'MOA-0002', name: 'Laptop (legacy)', ifmisSlipNumber: 'M19-001', status: 'AVAILABLE', notes: JSON.stringify({ ifmisItemCode: '308101101.0001' }), unitCostETB: 55000 }]
        : []);
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item "Laptop (legacy)" was already received as MOA-0002 on Model 19 No. M19-001. Duplicate entrance is not permitted.',
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('accepts a line that shares an IFMIS item code at a different price: another line of the slip', async () => {
    db.item.findMany.mockImplementation(async ({ where }: any) =>
      where?.ifmisSlipNumber
        ? [{ id: 'item-2', itemCode: 'MOA-0002', name: 'Laptop 14 inch', ifmisSlipNumber: 'M19-001', status: 'AVAILABLE', notes: JSON.stringify({ ifmisItemCode: '308101101.0001' }), unitCostETB: 48000 }]
        : []);
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any)).resolves.toBeTruthy();
  });

  it('sends a line already on a rejected receipt to that receipt, to correct it there or cancel it', async () => {
    db.item.findMany.mockImplementation(async ({ where }: any) =>
      where?.ifmisSlipNumber ? [{ id: 'item-9', itemCode: 'MOA-0009', name: 'Legacy Laptop', ifmisSlipNumber: 'M19-001', status: 'PENDING_STOCK_IN', notes: null, unitCostETB: 1 }] : []);
    (db.transactionApproval as any).findFirst = vi.fn(async () => ({ id: 'appr-9' }));
    await expect(StoreService.getInstance().registerStockIn({ ...basePayload, isHistoricalData: true } as any)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item "Legacy Laptop" is on Model 19 No. M19-001, which was rejected and is waiting for correction. Correct it there and save, or cancel it first.',
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('calculates totalAmount correctly for VAT applicable vs additional charges', async () => {
    // 1. VAT applicable: additional charges must be locked to 0 and totalAmount = unitCost * quantity
    await StoreService.getInstance().registerStockIn({
      ...basePayload,
      isHistoricalData: true,
      unitCostETB: 5000,
      quantity: 2,
      vatApplicable: true,
      additionalCharges: 300, // Should be ignored / locked to 0
      itemType: 'CONSUMABLE',
      ifmisItemCode: '108101101.0021',
    } as any);

    const call1Meta = JSON.parse(db.item.create.mock.calls[0][0].data.notes);
    expect(call1Meta.vatApplicable).toBe(true);
    expect(call1Meta.additionalCharges).toBe(0);
    expect(call1Meta.totalAmount).toBe(11500); // 5000 * 2 * 1.15 = 11,500

    db.item.create.mockClear();

    // 2. VAT not applicable: additional charges must be included: totalAmount = (unitCost * quantity) + additionalCharges
    await StoreService.getInstance().registerStockIn({
      ...basePayload,
      isHistoricalData: true,
      unitCostETB: 5000,
      quantity: 2,
      vatApplicable: false,
      additionalCharges: 350,
      itemType: 'CONSUMABLE',
      ifmisItemCode: '108101101.0022',
    } as any);

    const call2Meta = JSON.parse(db.item.create.mock.calls[0][0].data.notes);
    expect(call2Meta.vatApplicable).toBe(false);
    expect(call2Meta.additionalCharges).toBe(350);
    expect(call2Meta.totalAmount).toBe(10350); // (5000 * 2) + 350
  });
});
