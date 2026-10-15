import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => {
  const client: any = {
    employee: { findUnique: vi.fn() },
    item: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return client;
});

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const fixedAsset = { id: 'item-1', itemCode: 'MOA-VEH-2026-0001', name: 'Toyota Land Cruiser', itemType: 'FIXED', ifmisTagNumber: null };

const store = () => StoreService.getInstance();

describe("A fixed asset's IFMIS tag number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.item.findUnique.mockResolvedValue({ ...fixedAsset });
    db.item.findFirst.mockResolvedValue(null);
    db.item.update.mockResolvedValue({});
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' });
    db.auditLog.create.mockResolvedValue({});
    // The saved record is read back as usual; its shape is covered elsewhere
    vi.spyOn(store(), 'getItemById').mockImplementation(async () => ({ id: 'item-1' }) as any);
  });

  it('is saved in capitals without spaces, and audited', async () => {
    await store().setIfmisTag('item-1', ' moa-016341 ', 'EMP-ENC');
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { ifmisTagNumber: 'MOA-016341' } });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('SET_IFMIS_TAG');
    expect(audit.details).toContain('MOA-016341');
  });

  it('is refused when another record has it as its tag or its code, ignoring case', async () => {
    db.item.findFirst.mockResolvedValue({ itemCode: 'MOA-VEH-2026-0002', name: 'Hilux' });
    await expect(store().setIfmisTag('item-1', 'MOA-016341', 'EMP-ENC')).rejects.toThrow(/already on MOA-VEH-2026-0002/);
    const where = db.item.findFirst.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'item-1' });
    expect(where.OR).toEqual([
      { ifmisTagNumber: { equals: 'MOA-016341', mode: 'insensitive' } },
      { itemCode: { equals: 'MOA-016341', mode: 'insensitive' } },
    ]);
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it('is cleared by an empty value', async () => {
    db.item.findUnique.mockResolvedValue({ ...fixedAsset, ifmisTagNumber: 'MOA-016341' });
    await store().setIfmisTag('item-1', '', 'EMP-ENC');
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { ifmisTagNumber: null } });
    expect(db.auditLog.create.mock.calls[0][0].data.details).toContain('removed');
  });

  it('changes nothing when it is the same tag', async () => {
    db.item.findUnique.mockResolvedValue({ ...fixedAsset, ifmisTagNumber: 'MOA-016341' });
    await store().setIfmisTag('item-1', 'moa-016341', 'EMP-ENC');
    expect(db.item.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('is only for fixed assets, and only letters, digits, dashes and slashes', async () => {
    db.item.findUnique.mockResolvedValue({ ...fixedAsset, itemType: 'CONSUMABLE', itemCode: 'MOA-OS-2026-0001' });
    await expect(store().setIfmisTag('item-1', 'MOA-016341', 'EMP-ENC')).rejects.toThrow(/consumable/);
    db.item.findUnique.mockResolvedValue({ ...fixedAsset });
    await expect(store().setIfmisTag('item-1', 'MOA 01#6341', 'EMP-ENC')).rejects.toThrow(/letters, digits/);
    await expect(store().setIfmisTag('item-1', 42, 'EMP-ENC')).rejects.toThrow(/must be text/);
  });

  it('needs an existing item', async () => {
    db.item.findUnique.mockResolvedValue(null);
    await expect(store().setIfmisTag('missing', 'MOA-016341', 'EMP-ENC')).rejects.toThrow(/not found/i);
  });
});
