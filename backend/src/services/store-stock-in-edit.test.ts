import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCategory } from '../types/asset-management';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => {
  const client: any = {
    employee: { findUnique: vi.fn() },
    // Any store location that is looked up exists and is active
    location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: 'Store-01', isActive: true, store: { name: 'Kality', isActive: true } })) },
    item: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    transactionApproval: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return client;
});

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { applySystemSettings } from './settings.service';

const pendingItem = {
  id: 'item-1',
  itemCode: 'MOA-IT-2026-0001',
  name: 'Epson Scaner',
  category: 'IT_EQUIPMENT',
  serialNumber: 'SN-1',
  unitCostETB: 1000,
  condition: 'NEW',
  status: 'PENDING_STOCK_IN',
  storeLocationId: 'LOC-01',
  ifmisSlipNumber: 'M19-001',
  ifmisSlipDateGc: '2026-10-01',
  ifmisSlipAttachmentUrl: '/api/uploads/slips/a-slip.pdf',
  isHistoricalData: false,
  notes: JSON.stringify({ quantity: 1, uom: 'EA', programName: 'Resilience Program' }),
};

const stage1Approval = { id: 'appr-1', itemId: 'item-1', transactionType: 'STOCK_IN', status: 'PENDING', currentStage: 1 };

const edit = {
  name: 'Epson WorkForce DS-530 Scanner',
  category: AssetCategory.IT_EQUIPMENT,
  serialNumber: 'SN-1',
  unitCostETB: 1200,
  storeLocationId: 'LOC-01',
  ifmisSlipNumber: 'M19-001',
  ifmisSlipDateGc: '2026-10-01',
  quantity: 2,
};

const store = () => StoreService.getInstance();

describe('Stock-In correction before Stage 1 endorsement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.item.findUnique.mockResolvedValue({ ...pendingItem });
    db.item.findFirst.mockResolvedValue(null);
    db.transactionApproval.findFirst.mockResolvedValue({ ...stage1Approval });
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' });
    db.item.update.mockImplementation(async ({ data }: any) => ({ ...pendingItem, ...data, history: [] }));
    db.transactionApproval.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('updates the item, its approval request, history and audit log together', async () => {
    const item = await store().updateStockIn('item-1', edit as any, 'EMP-ENC');

    expect(item.name).toBe('Epson WorkForce DS-530 Scanner');
    expect(item.unitCostETB).toBe(1200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    const itemData = db.item.update.mock.calls[0][0].data;
    expect(itemData.ifmisSlipAttachmentUrl).toBe('/api/uploads/slips/a-slip.pdf'); // kept when no new upload
    expect(JSON.parse(itemData.notes)).toMatchObject({ quantity: 2, totalAmount: 2400, programName: 'Resilience Program' });
    expect(itemData.history.create.action).toBe('STOCK_IN_EDITED');
    expect(itemData.history.create.notes).toMatch(/name Epson Scaner → Epson WorkForce DS-530 Scanner/);

    expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ itemName: 'Epson WorkForce DS-530 Scanner', ifmisSlipNumber: 'M19-001' });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EDIT_STOCK_IN', entityId: 'item-1' });
  });

  it('is refused once the Team Leader has endorsed (Stage 2)', async () => {
    db.transactionApproval.findFirst.mockResolvedValue({ ...stage1Approval, currentStage: 2 });
    await expect(store().updateStockIn('item-1', edit as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it.each(['AVAILABLE', 'DISPOSED', 'ISSUED'])('is refused when the item is %s', async (status) => {
    db.item.findUnique.mockResolvedValue({ ...pendingItem, status });
    db.transactionApproval.findFirst.mockResolvedValue(null);
    await expect(store().updateStockIn('item-1', edit as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses changing the serial number to one another item has, but keeping its own is fine', async () => {
    db.item.findFirst.mockResolvedValue({ itemCode: 'MOA-IT-2026-0007', name: 'Dell Latitude' });

    await expect(store().updateStockIn('item-1', { ...edit, serialNumber: 'SN-2' } as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.item.findFirst.mock.calls[0][0].where).toMatchObject({ id: { not: 'item-1' } });
    expect(db.item.update).not.toHaveBeenCalled();

    db.item.findFirst.mockClear();
    await store().updateStockIn('item-1', { ...edit, serialNumber: 'SN-1' } as any, 'EMP-ENC');
    expect(db.item.findFirst).not.toHaveBeenCalled();
    expect(db.item.update).toHaveBeenCalled();
  });

  it('rejects invalid values with a 400', async () => {
    await expect(store().updateStockIn('item-1', { ...edit, ifmisSlipNumber: ' ' } as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockIn('item-1', { ...edit, unitCostETB: -1 } as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockIn('item-1', { ...edit, quantity: 0 } as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('requires a slip only while the system setting says so', async () => {
    db.item.findUnique.mockResolvedValue({ ...pendingItem, ifmisSlipAttachmentUrl: null });
    applySystemSettings({ slipAttachmentPolicy: 'REQUIRED' });
    try {
      await expect(store().updateStockIn('item-1', edit as any, 'EMP-ENC')).rejects.toMatchObject({
        statusCode: 400,
        message: 'A scanned copy of the slip is required. Attach it and try again.',
      });
    } finally {
      applySystemSettings({});
    }
    await store().updateStockIn('item-1', edit as any, 'EMP-ENC');
    expect(db.item.update).toHaveBeenCalled();
  });

  it('returns 404 for an unknown item', async () => {
    db.item.findUnique.mockResolvedValue(null);
    await expect(store().updateStockIn('missing', edit as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 404 });
  });
});
