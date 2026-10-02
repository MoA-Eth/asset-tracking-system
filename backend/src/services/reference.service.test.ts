import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listDepartments,
  listStores, listLocations, createStore, updateStore, setStoreActive, deleteStore,
  createLocation, updateLocation, setLocationActive, deleteLocation, locationView,
} from './reference.service';
import { StoreService } from './store.service';
import { resetAllRolePermissions, getEffectiveRolePermissions } from '../security/role-policy';
import { AssetCategory, UserRole } from '../types/asset-management';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  department: { findMany: vi.fn(), findUnique: vi.fn() },
  store: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  location: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  item: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  transactionApproval: { count: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const people: Record<string, any> = {
  admin: { id: 'admin', fullNameEn: 'Admin', role: 'SYSTEM_ADMIN', isActive: true },
  encoder: { id: 'encoder', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true },
};
const location = (id: string, name: string, items = 0, isActive = true) => ({ id, storeId: 'STR-1', name, isActive, _count: { items } });
const KALITY = { id: 'STR-1', name: 'Kality', address: 'Kality Depot', isActive: true, locations: [location('LOC-1', 'Store-01', 4), location('LOC-2', 'Shelf A')] };

beforeEach(() => {
  vi.resetAllMocks();
  resetAllRolePermissions();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.employee.findUnique.mockImplementation(({ where }) => Promise.resolve(people[where.id] ?? null));
  db.item.count.mockResolvedValue(0);
  db.transactionApproval.count.mockResolvedValue(0);
  db.store.findFirst.mockResolvedValue(null);
  db.store.findUnique.mockResolvedValue({ ...KALITY });
  db.store.create.mockImplementation(({ data }) => Promise.resolve({ ...data, locations: data.locations.create.map((l: any) => ({ ...l, storeId: data.id, _count: { items: 0 } })) }));
  db.store.update.mockImplementation(({ data }) => Promise.resolve({ ...KALITY, ...data }));
  db.location.findFirst.mockResolvedValue(null);
  db.location.findUnique.mockResolvedValue({ ...location('LOC-2', 'Shelf A'), store: KALITY });
  db.location.count.mockResolvedValue(3);
  db.location.create.mockImplementation(({ data }) => Promise.resolve({ ...data }));
  db.location.update.mockImplementation(({ data }) => Promise.resolve({ ...location('LOC-2', 'Shelf A'), ...data, store: KALITY }));
});

describe('Departments', () => {
  it('are listed for the pickers; there is nothing to manage', async () => {
    db.department.findMany.mockResolvedValue([{ id: 'DEP-9', code: 'FIN', nameEn: 'Finance', nameAm: 'ፋይናንስ', headEmployeeId: null }]);
    expect(await listDepartments()).toEqual([{ id: 'DEP-9', code: 'FIN', nameEn: 'Finance', nameAm: 'ፋይናንስ', headEmployeeId: undefined }]);
  });
});

describe('Stores contain locations', () => {
  it('lists each store with its locations; item counts and deactivated ones only for administrators', async () => {
    db.store.findMany.mockResolvedValue([{ ...KALITY }]);
    const [forPicker] = await listStores(UserRole.DATA_ENCODER, { includeInactive: true });
    expect(db.store.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(forPicker.locations.map((l) => l.name)).toEqual(['Store-01', 'Shelf A']);
    expect(forPicker).not.toHaveProperty('itemCount');

    const [forAdmin] = await listStores(UserRole.SYSTEM_ADMIN, { includeInactive: true });
    expect(db.store.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    expect(forAdmin).toMatchObject({ name: 'Kality', address: 'Kality Depot', itemCount: 4 });
    expect(forAdmin.locations[0]).toMatchObject({ name: 'Store-01', storeName: 'Kality', itemCount: 4 });
  });

  it('gives the forms a flat list of active locations in active stores, shaped as "store · location"', async () => {
    db.location.findMany.mockResolvedValue([{ ...location('LOC-1', 'Store-01'), store: KALITY }]);
    const [loc] = await listLocations();
    expect(db.location.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, store: { isActive: true } } }));
    expect(loc).toMatchObject({ id: 'LOC-1', storeId: 'STR-1', name: 'Store-01', storeName: 'Kality', siteName: 'Kality', building: 'Kality Depot', roomNumber: 'Store-01' });
  });

  it('a location in a deactivated store is not usable', () => {
    expect(locationView({ ...location('LOC-1', 'Store-01'), store: { ...KALITY, isActive: false } }).isActive).toBe(false);
  });

  it('adds a store with its first location, and audits it', async () => {
    const created = await createStore({ name: '  Adama   Depot ', address: 'Adama' }, 'admin');
    expect(created).toMatchObject({ name: 'Adama Depot', address: 'Adama', isActive: true });
    expect(created.locations.map((l) => l.name)).toEqual(['Main store']);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CREATE_STORE', entityType: 'REFERENCE' }) });
    const named = await createStore({ name: 'Bahir Dar', locationName: 'Room 1' }, 'admin');
    expect(named.locations[0].name).toBe('Room 1');
  });

  it('checks the name and who may do it', async () => {
    await expect(createStore({ name: 'Adama' }, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    await expect(createStore({ name: ' ' }, 'admin')).rejects.toThrow('Store name is required.');
    db.store.findFirst.mockResolvedValue({ id: 'other', name: 'Kality' });
    await expect(createStore({ name: 'kality' }, 'admin')).rejects.toThrow('A store named "Kality" already exists.');
    await expect(updateStore('STR-1', { name: 'kality' }, 'admin')).rejects.toThrow('already exists');
  });

  it('keeps a store that holds items, is a transfer destination, or is the last place to receive stock', async () => {
    await expect(setStoreActive('STR-1', false, 'admin')).rejects.toThrow('Kality still holds 4 item records');

    const empty = { ...KALITY, locations: [location('LOC-1', 'Store-01')] };
    db.store.findUnique.mockResolvedValue(empty);
    db.transactionApproval.count.mockResolvedValue(2);
    await expect(setStoreActive('STR-1', false, 'admin')).rejects.toThrow('destination of 2 pending requests');
    db.transactionApproval.count.mockResolvedValue(0);
    db.location.count.mockResolvedValue(0);
    await expect(setStoreActive('STR-1', false, 'admin')).rejects.toThrow('only place left to receive stock');
    expect(db.store.update).not.toHaveBeenCalled();

    db.location.count.mockResolvedValue(2);
    db.store.update.mockResolvedValue({ ...empty, isActive: false });
    expect((await setStoreActive('STR-1', false, 'admin')).isActive).toBe(false);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DEACTIVATE_STORE' }) });
  });

  it('deletes a store and its locations only when nothing has used them', async () => {
    db.item.count.mockResolvedValue(5);
    await expect(deleteStore('STR-1', 'admin')).rejects.toThrow("can't be deleted because it is used by 5 item records. Deactivate it instead.");
    expect(db.store.delete).not.toHaveBeenCalled();
    db.item.count.mockResolvedValue(0);
    await deleteStore('STR-1', 'admin');
    expect(db.location.deleteMany).toHaveBeenCalledWith({ where: { storeId: 'STR-1' } });
    expect(db.store.delete).toHaveBeenCalledWith({ where: { id: 'STR-1' } });
  });
});

describe('Locations inside a store', () => {
  it('adds and renames a location; names are unique within the store', async () => {
    const created = await createLocation('STR-1', { name: ' Shelf  B ' }, 'admin');
    expect(created).toMatchObject({ storeId: 'STR-1', name: 'Shelf B', storeName: 'Kality', isActive: true });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CREATE_LOCATION' }) });

    expect((await updateLocation('LOC-2', { name: 'Shelf A1' }, 'admin')).name).toBe('Shelf A1');

    db.location.findFirst.mockResolvedValue({ id: 'LOC-1', name: 'Store-01' });
    await expect(createLocation('STR-1', { name: 'store-01' }, 'admin')).rejects.toThrow('already has a location named "Store-01"');
    db.store.findUnique.mockResolvedValue(null);
    await expect(createLocation('nope', { name: 'X' }, 'admin')).rejects.toMatchObject({ statusCode: 404 });
    await expect(createLocation('STR-1', { name: 'X' }, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps a location that holds items; otherwise deactivates it', async () => {
    db.location.findUnique.mockResolvedValue({ ...location('LOC-1', 'Store-01', 4), store: KALITY });
    await expect(setLocationActive('LOC-1', false, 'admin')).rejects.toThrow('Store-01 still holds 4 item records');
    db.location.findUnique.mockResolvedValue({ ...location('LOC-2', 'Shelf A'), store: KALITY });
    expect((await setLocationActive('LOC-2', false, 'admin')).isActive).toBe(false);
    db.location.count.mockResolvedValue(0);
    await expect(setLocationActive('LOC-2', false, 'admin')).rejects.toThrow('Kality · Shelf A is the only place left to receive stock');
  });

  it("deletes an unused location, but never a store's only one", async () => {
    db.location.count.mockResolvedValue(0);
    await expect(deleteLocation('LOC-2', 'admin')).rejects.toThrow('is the only location in Kality. Delete the store instead.');
    db.location.count.mockResolvedValue(2);
    db.item.count.mockResolvedValue(1);
    await expect(deleteLocation('LOC-2', 'admin')).rejects.toThrow('used by 1 item record. Deactivate it instead.');
    db.item.count.mockResolvedValue(0);
    await deleteLocation('LOC-2', 'admin');
    expect(db.location.delete).toHaveBeenCalledWith({ where: { id: 'LOC-2' } });
  });
});

describe('Using a location on forms', () => {
  const stockIn = () =>
    StoreService.getInstance().registerStockIn({
      name: 'Laptop', category: AssetCategory.IT_EQUIPMENT, unitCostETB: 1, storeLocationId: 'LOC-1',
      ifmisSlipNumber: 'M19-1', ifmisSlipDateGc: '2026-10-01', registeredById: 'encoder', isHistoricalData: true,
    } as any);

  it('refuses a Stock-In into a deactivated location or a deactivated store', async () => {
    db.location.findUnique.mockResolvedValue({ ...location('LOC-1', 'Store-01', 0, false), store: KALITY });
    await expect(stockIn()).rejects.toThrow("Kality · Store-01 has been deactivated and can't be chosen as the receiving store.");
    db.location.findUnique.mockResolvedValue({ ...location('LOC-1', 'Store-01'), store: { ...KALITY, isActive: false } });
    await expect(stockIn()).rejects.toThrow('has been deactivated');
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it('gives System Administrators the permission to manage stores', () => {
    expect(getEffectiveRolePermissions(UserRole.SYSTEM_ADMIN)).toContain('references.manage');
    expect(getEffectiveRolePermissions(UserRole.DATA_ENCODER)).not.toContain('references.manage');
  });
});
