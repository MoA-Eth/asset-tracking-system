import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listDepartments,
  createLocation, deleteLocation, listLocations, setLocationActive, updateLocation,
} from './reference.service';
import { StoreService } from './store.service';
import { resetAllRolePermissions, getEffectiveRolePermissions } from '../security/role-policy';
import { AssetCategory, UserRole } from '../types/asset-management';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), count: vi.fn() },
  department: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  location: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  item: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  transactionApproval: { count: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const people: Record<string, any> = {
  admin: { id: 'admin', fullNameEn: 'Admin', role: 'SYSTEM_ADMIN', isActive: true },
  encoder: { id: 'encoder', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true },
  left: { id: 'left', fullNameEn: 'Former Head', role: null, isActive: false },
};
const FINANCE = { id: 'DEP-9', code: 'FIN', nameEn: 'Finance', nameAm: 'ፋይናንስ', headEmployeeId: null };
const KALITY = { id: 'LOC-1', siteName: 'Kality', building: 'Depot', roomNumber: 'Store-01', isCentralStore: true, isActive: true, _count: { items: 0 } };

beforeEach(() => {
  vi.resetAllMocks();
  resetAllRolePermissions();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.employee.findUnique.mockImplementation(({ where }) => Promise.resolve(people[where.id] ?? null));
  db.employee.count.mockResolvedValue(0);
  db.item.count.mockResolvedValue(0);
  db.transactionApproval.count.mockResolvedValue(0);
  db.department.findFirst.mockResolvedValue(null);
  db.department.findUnique.mockResolvedValue({ ...FINANCE });
  db.department.create.mockImplementation(({ data }) => Promise.resolve({ ...data }));
  db.department.update.mockImplementation(({ data }) => Promise.resolve({ ...FINANCE, ...data }));
  db.location.findFirst.mockResolvedValue(null);
  db.location.findUnique.mockResolvedValue({ ...KALITY });
  db.location.count.mockResolvedValue(1);
  db.location.create.mockImplementation(({ data }) => Promise.resolve({ ...data }));
  db.location.update.mockImplementation(({ data }) => Promise.resolve({ ...KALITY, ...data }));
});

describe('Departments', () => {
  it('are listed for the pickers; there is nothing to manage', async () => {
    db.department.findMany.mockResolvedValue([{ ...FINANCE }]);
    expect(await listDepartments()).toEqual([{ id: 'DEP-9', code: 'FIN', nameEn: 'Finance', nameAm: 'ፋይናንስ', headEmployeeId: undefined }]);
  });
});

describe('Locations and stores', () => {
  it('gives pickers active locations only', async () => {
    db.location.findMany.mockResolvedValue([{ ...KALITY, _count: { items: 5 } }]);
    const [forPicker] = await listLocations(UserRole.DATA_ENCODER, { includeInactive: true });
    expect(db.location.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(forPicker).not.toHaveProperty('itemCount');
    expect((await listLocations(UserRole.SYSTEM_ADMIN))[0]).toMatchObject({ itemCount: 5, isCentralStore: true });
  });

  it('adds a store or a plain location, and refuses an exact duplicate', async () => {
    const store = await createLocation({ siteName: 'Saris', building: 'Storehouse', roomNumber: '', isCentralStore: true }, 'admin');
    expect(store).toMatchObject({ siteName: 'Saris', roomNumber: '', isCentralStore: true, isActive: true });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CREATE_STORE' }) });
    const room = await createLocation({ siteName: 'Head office', roomNumber: '204' }, 'admin');
    expect(room.isCentralStore).toBe(false);
    db.location.findFirst.mockResolvedValue({ ...KALITY });
    await expect(createLocation({ siteName: 'kality', building: 'depot', roomNumber: 'store-01' }, 'admin')).rejects.toThrow('"Kality · Depot · Store-01" already exists.');
    await expect(createLocation({ siteName: 'X' }, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps a store that holds stock, and always one active store', async () => {
    db.location.findUnique.mockResolvedValue({ ...KALITY, _count: { items: 7 } });
    await expect(setLocationActive('LOC-1', false, 'admin')).rejects.toThrow('still holds 7 item records');
    await expect(updateLocation('LOC-1', { siteName: 'Kality', building: 'Depot', roomNumber: 'Store-01', isCentralStore: false }, 'admin')).rejects.toThrow('must stay a store');

    db.location.findUnique.mockResolvedValue({ ...KALITY });
    db.location.count.mockResolvedValue(0);
    await expect(setLocationActive('LOC-1', false, 'admin')).rejects.toThrow('only active store');
    db.location.count.mockResolvedValue(2);
    expect((await setLocationActive('LOC-1', false, 'admin')).isActive).toBe(false);
  });

  it('deletes only a location nothing refers to', async () => {
    db.item.count.mockResolvedValue(3);
    await expect(deleteLocation('LOC-1', 'admin')).rejects.toThrow('used by 3 item records. Deactivate it instead.');
    db.item.count.mockResolvedValue(0);
    await deleteLocation('LOC-1', 'admin');
    expect(db.location.delete).toHaveBeenCalledWith({ where: { id: 'LOC-1' } });
  });
});

describe('Using reference data on forms', () => {
  it('refuses a Stock-In into a deactivated store', async () => {
    db.location.findUnique.mockResolvedValue({ ...KALITY, isActive: false });
    await expect(
      StoreService.getInstance().registerStockIn({
        name: 'Laptop', category: AssetCategory.IT_EQUIPMENT, unitCostETB: 1, storeLocationId: 'LOC-1',
        ifmisSlipNumber: 'M19-1', ifmisSlipDateGc: '2026-10-01', registeredById: 'encoder', isHistoricalData: true,
      } as any),
    ).rejects.toThrow("Kality has been deactivated and can't be chosen as the receiving store.");
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('gives System Administrators the permission to manage reference data', () => {
    expect(getEffectiveRolePermissions(UserRole.SYSTEM_ADMIN)).toContain('references.manage');
    expect(getEffectiveRolePermissions(UserRole.DATA_ENCODER)).not.toContain('references.manage');
  });
});
