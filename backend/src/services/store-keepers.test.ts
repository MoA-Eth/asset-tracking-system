import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client: the real store-man rules run against it
const db = vi.hoisted(() => {
  const client: any = {
    store: { findUnique: vi.fn() },
    location: { findUnique: vi.fn() },
    storeKeeper: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findUnique: vi.fn(), update: vi.fn() },
    transactionApproval: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return client;
});

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { requireStoreKeeper, setStoreKeepers } from './reference.service';
import { applySystemSettings } from './settings.service';
import { StoreService } from './store.service';

const person = (id: string, name: string, isActive = true) => ({ id, fullNameEn: name, fullNameAm: '', payrollId: `0000${id}`, isActive });
const keeper = (id: string, name: string, isActive = true) => ({ storeId: 'STR-1', employeeId: id, employee: person(id, name, isActive), createdAt: new Date() });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.store.findUnique.mockResolvedValue({ id: 'STR-1', name: 'Kality store', isActive: true, address: '' });
  db.location.findUnique.mockResolvedValue({ id: 'LOC-1', storeId: 'STR-1', name: 'Shelf A', isActive: true, store: { id: 'STR-1', name: 'Kality store', isActive: true } });
  db.storeKeeper.findMany.mockResolvedValue([]);
  // The rule is switched on here; the cases with it off are at the end
  applySystemSettings({ storeManPolicy: 'REQUIRED' });
});

describe('which store man a request names', () => {
  it('refuses a store that has no store man, and says what to do', async () => {
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Kality store has no store man assigned. Ask the System Administrator to assign one in Settings → Stores.',
    });
  });

  it('uses the only store man by default', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede')]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).resolves.toEqual({
      employeeId: 'E1', fullNameEn: 'Abebe Kebede', storeName: 'Kality store',
    });
  });

  it('needs the choice to be made when there are several', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede'), keeper('E2', 'Sara Tesfaye')]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).rejects.toThrow(/Choose the store man for issuing the items at Kality store/);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, 'E2', 'issuing the items')).resolves.toMatchObject({ employeeId: 'E2', fullNameEn: 'Sara Tesfaye' });
  });

  it('refuses someone who is not a store man of this store', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede')]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, 'E-OTHER', 'issuing the items')).rejects.toThrow(/not a store man of Kality store/);
  });

  it('does not count a store man who has been deactivated', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede', false)]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).rejects.toThrow(/has no store man assigned/);
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede', false), keeper('E2', 'Sara Tesfaye')]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).resolves.toMatchObject({ employeeId: 'E2' });
  });

  it('finds the store from a location', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede')]);
    await requireStoreKeeper(db, { locationId: 'LOC-1' }, undefined, 'the disposal');
    expect(db.location.findUnique).toHaveBeenCalledWith({ where: { id: 'LOC-1' }, select: { storeId: true } });
    expect(db.storeKeeper.findMany.mock.calls[0][0].where).toEqual({ storeId: 'STR-1' });
  });
});

describe('the operations that name a store man', () => {
  const store = () => StoreService.getInstance();
  const stockItem = { id: 'item-1', itemCode: 'MOA-1', name: 'Chair', category: 'OFFICE_FURNITURE', status: 'AVAILABLE', condition: 'GOOD', unitCostETB: 1500, storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 10, uom: 'EA' }), currentCustodianId: null };

  beforeEach(() => {
    db.item.findUnique.mockResolvedValue({ ...stockItem });
    db.transactionApproval.findFirst.mockResolvedValue(null);
  });

  it('refuses a receipt into a store with no store man', async () => {
    await expect(
      store().registerStockIn({
        name: 'Chair', category: 'OFFICE_FURNITURE', unitCostETB: 1500, quantity: 1, uom: 'EA', ifmisSlipNumber: 'GRN-1', ifmisSlipDateGc: '2026-10-01',
        storeLocationId: 'LOC-1', condition: 'NEW', registeredById: 'EMP-ENC', isHistoricalData: true,
      } as any),
    ).rejects.toThrow(/Kality store has no store man assigned/);
  });

  it('refuses an issue from a store with no store man', async () => {
    await expect(
      store().registerStockOut({
        itemId: 'item-1', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau', ifmisSlipNumber: 'M22-1', ifmisSlipDateGc: '2026-10-01',
        purpose: 'Survey', registeredById: 'EMP-ENC',
      } as any),
    ).rejects.toThrow(/Kality store has no store man assigned/);
    expect(db.item.update).not.toHaveBeenCalled();
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });

  it('refuses a disposal from a store with no store man', async () => {
    await expect(
      store().registerDisposal({ itemId: 'item-1', disposalNo: 'DSP-1', reason: 'Damaged', registeredById: 'EMP-ENC' } as any),
    ).rejects.toThrow(/Kality store has no store man assigned/);
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });

  it('refuses a return to a store with no store man', async () => {
    db.item.findUnique.mockResolvedValue({ ...stockItem, status: 'ISSUED', currentCustodianId: 'EMP-A' });
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true });
    await expect(
      store().registerReturn({
        itemId: 'item-1', model21No: 'R-1', returnReason: 'Done', condition: 'GOOD', ifmisSlipDateGc: '2026-10-01', registeredById: 'EMP-ENC',
      } as any),
    ).rejects.toThrow(/Kality store has no store man assigned/);
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });

  it('names the store man on an issue, and on a disposal', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede')]);
    db.item.update.mockResolvedValue({});
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'a1', currentStage: 1, ...data }));
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true });

    await store().registerStockOut({
      itemId: 'item-1', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau', ifmisSlipNumber: 'M22-1', ifmisSlipDateGc: '2026-10-01',
      purpose: 'Survey', registeredById: 'EMP-ENC',
    } as any);
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toMatchObject({ issuedByEmployeeId: 'E1', issuedByName: 'Abebe Kebede' });

    await store().registerDisposal({ itemId: 'item-1', disposalNo: 'DSP-1', reason: 'Damaged', registeredById: 'EMP-ENC' } as any);
    expect(db.transactionApproval.create.mock.calls[1][0].data.requestDetails).toMatchObject({ storekeeperEmployeeId: 'E1', storekeeperName: 'Abebe Kebede' });
  });
});

describe('assigning the store men of a store', () => {
  const admin = { id: 'EMP-ADMIN', fullNameEn: 'System Administrator', role: 'SYSTEM_ADMIN', isActive: true };
  const storeWith = (keepers: any[]) => ({ id: 'STR-1', name: 'Kality store', isActive: true, address: '', locations: [], storeKeepers: keepers });

  beforeEach(() => {
    db.employee.findUnique.mockResolvedValue(admin);
    db.employee.findMany.mockResolvedValue([person('E1', 'Abebe Kebede'), person('E2', 'Sara Tesfaye'), person('E3', 'Old Staff', false)]);
    db.store.findUnique.mockResolvedValue(storeWith([keeper('E1', 'Abebe Kebede')]));
    db.auditLog.create.mockResolvedValue({});
  });

  it('replaces the list: adds the new, removes the dropped, and records it', async () => {
    await setStoreKeepers('STR-1', ['E2'], 'EMP-ADMIN');
    expect(db.storeKeeper.deleteMany).toHaveBeenCalledWith({ where: { storeId: 'STR-1', employeeId: { in: ['E1'] } } });
    expect(db.storeKeeper.create).toHaveBeenCalledWith({ data: { storeId: 'STR-1', employeeId: 'E2' } });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'UPDATE_STORE_KEEPERS', entityId: 'STR-1' });
    expect(audit.details).toMatch(/added Sara Tesfaye; removed Abebe Kebede/);
  });

  it('can leave a store with nobody (its forms then refuse)', async () => {
    await setStoreKeepers('STR-1', [], 'EMP-ADMIN');
    expect(db.storeKeeper.deleteMany).toHaveBeenCalled();
    expect(db.storeKeeper.create).not.toHaveBeenCalled();
  });

  it('writes nothing when the list is unchanged', async () => {
    await setStoreKeepers('STR-1', ['E1'], 'EMP-ADMIN');
    expect(db.storeKeeper.deleteMany).not.toHaveBeenCalled();
    expect(db.storeKeeper.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses to add a deactivated employee', async () => {
    await expect(setStoreKeepers('STR-1', ['E1', 'E3'], 'EMP-ADMIN')).rejects.toThrow(/Old Staff is deactivated/);
    expect(db.storeKeeper.create).not.toHaveBeenCalled();
  });

  it('refuses someone who is not a System Administrator', async () => {
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true });
    await expect(setStoreKeepers('STR-1', ['E2'], 'EMP-ENC')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a list that is not a list of ids, or too long', async () => {
    await expect(setStoreKeepers('STR-1', 'E2', 'EMP-ADMIN')).rejects.toMatchObject({ statusCode: 400 });
    await expect(setStoreKeepers('STR-1', Array.from({ length: 21 }, (_, i) => `E${i}`), 'EMP-ADMIN')).rejects.toThrow(/at most 20/);
  });
});

describe('while the store man rule is off (the default)', () => {
  const store = () => StoreService.getInstance();
  const stockItem = { id: 'item-1', itemCode: 'MOA-1', name: 'Chair', category: 'OFFICE_FURNITURE', status: 'AVAILABLE', condition: 'GOOD', unitCostETB: 1500, storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 10, uom: 'EA' }), currentCustodianId: null };

  beforeEach(() => {
    applySystemSettings({});
    db.item.findUnique.mockResolvedValue({ ...stockItem });
    db.item.update.mockResolvedValue({});
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'a1', currentStage: 1, ...data }));
    db.employee.findUnique.mockResolvedValue({ id: 'EMP-ENC', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true });
  });

  it('lets a store with no store man carry on, naming nobody', async () => {
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).resolves.toBeNull();
  });

  it('still refuses a name that is not a store man of the store', async () => {
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, 'E-OTHER', 'issuing the items')).rejects.toThrow(/has no store man assigned/);
  });

  it('still uses the store men when the store has them', async () => {
    db.storeKeeper.findMany.mockResolvedValue([keeper('E1', 'Abebe Kebede')]);
    await expect(requireStoreKeeper(db, { storeId: 'STR-1' }, undefined, 'issuing the items')).resolves.toMatchObject({ employeeId: 'E1' });
  });

  it('issues and disposes without a store man, as before, and records none', async () => {
    await store().registerStockOut({
      itemId: 'item-1', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau', ifmisSlipNumber: 'M22-1', ifmisSlipDateGc: '2026-10-01',
      purpose: 'Survey', registeredById: 'EMP-ENC',
    } as any);
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).not.toHaveProperty('issuedByEmployeeId');

    await store().registerDisposal({ itemId: 'item-1', disposalNo: 'DSP-1', reason: 'Damaged', registeredById: 'EMP-ENC' } as any);
    expect(db.transactionApproval.create.mock.calls[1][0].data.requestDetails).not.toHaveProperty('storekeeperEmployeeId');
  });

  it('takes a return back with no store man named, as before', async () => {
    db.item.findUnique.mockResolvedValue({ ...stockItem, status: 'ISSUED', currentCustodianId: 'EMP-A' });
    await store().registerReturn({
      itemId: 'item-1', model21No: 'R-1', returnReason: 'Done', condition: 'GOOD', ifmisSlipDateGc: '2026-10-01', registeredById: 'EMP-ENC',
    } as any);
    expect(db.transactionApproval.create).toHaveBeenCalled();
  });
});
