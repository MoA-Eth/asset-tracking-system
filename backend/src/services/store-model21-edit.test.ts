import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemCondition } from '../types/asset-management';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => {
  const client: any = {
    employee: { findUnique: vi.fn() },
    department: { findUnique: vi.fn() },
    location: { findUnique: vi.fn() },
    item: { findUnique: vi.fn(), update: vi.fn() },
    transactionApproval: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return client;
});

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const employees: Record<string, any> = {
  'EMP-ENC': { id: 'EMP-ENC', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' },
  'EMP-A': { id: 'EMP-A', fullNameEn: 'Abebe Kebede', role: 'STAFF' },
  'EMP-B': { id: 'EMP-B', fullNameEn: 'Sara Tesfaye', role: 'STAFF' },
  'EMP-OWNER': { id: 'EMP-OWNER', fullNameEn: 'Tigist Haile', role: 'STAFF' },
};
const departments: Record<string, any> = { 'DEP-2': { id: 'DEP-2', nameEn: 'Extension Services' } };
const locations: Record<string, any> = { 'LOC-2': { id: 'LOC-2', siteName: 'Adama Branch' } };

const issuedItem = {
  id: 'item-1',
  itemCode: 'MOA-IT-2026-0074',
  name: 'Dell OptiPlex 7010 Desktop',
  status: 'ISSUED',
  condition: 'GOOD',
  unitCostETB: 42000,
  currentCustodianId: 'EMP-OWNER',
  assignedDepartmentId: null,
  storeLocationId: 'LOC-01',
};

const transferRequest = {
  id: 'tr-1',
  transactionType: 'TRANSFER',
  itemId: 'item-1',
  itemCode: 'MOA-IT-2026-0074',
  ifmisSlipNumber: '0004386',
  ifmisSlipDateGc: '2026-10-01',
  recipientEmployeeId: 'EMP-A',
  targetDepartmentId: null,
  targetLocationId: null,
  purposeOrRemarks: 'Transfer from Tigist Haile to Abebe Kebede. Custody reassignment | [Model/21 # 0004386] | Book: MOA MC BOOK',
  requestDetails: null, // made before requestDetails existed
  status: 'PENDING',
  currentStage: 1,
};

const returnRequest = {
  id: 'rt-1',
  transactionType: 'RETURN',
  itemId: 'item-1',
  itemCode: 'MOA-IT-2026-0074',
  ifmisSlipNumber: '0004390',
  ifmisSlipDateGc: '2026-10-01',
  ifmisSlipAttachmentUrl: '/api/uploads/slips/m21.pdf',
  purposeOrRemarks: 'Return Reason: Project ended | Condition: GOOD | [Model/21 # 0004390]',
  requestDetails: { reason: 'Project ended', condition: 'GOOD', book: 'MOA MC BOOK' },
  status: 'PENDING',
  currentStage: 1,
};

const store = () => StoreService.getInstance();

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockImplementation(async ({ where }: any) => employees[where.id] ?? null);
  db.department.findUnique.mockImplementation(async ({ where }: any) => departments[where.id] ?? null);
  db.location.findUnique.mockImplementation(async ({ where }: any) => locations[where.id] ?? null);
  db.item.findUnique.mockResolvedValue({ ...issuedItem });
  db.item.update.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

describe('Transfer correction before Stage 1 endorsement', () => {
  const edit = {
    model21No: '0004386',
    toEmployeeId: 'EMP-B',
    toDepartmentId: 'DEP-2',
    toLocationId: 'LOC-2',
    reason: 'Custody reassignment',
    book: 'MOA MC BOOK',
    remark: 'Charger included',
  };

  beforeEach(() => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...transferRequest });
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...transferRequest, ...data }));
  });

  it('updates the request with structured details, history and audit log', async () => {
    const approval = await store().updateTransfer('tr-1', edit, 'EMP-ENC');

    const data = db.transactionApproval.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ recipientEmployeeId: 'EMP-B', targetDepartmentId: 'DEP-2', targetLocationId: 'LOC-2' });
    expect(data.requestDetails).toMatchObject({ reason: 'Custody reassignment', remark: 'Charger included', book: 'MOA MC BOOK' });
    expect(data.purposeOrRemarks).toBe(
      'Transfer from Tigist Haile to Sara Tesfaye. Custody reassignment | [Model/21 # 0004386] | Book: MOA MC BOOK | Remark: Charger included'
    );
    expect(approval.requestDetails?.remark).toBe('Charger included');

    const history = db.item.update.mock.calls[0][0].data.history.create;
    expect(history.action).toBe('TRANSFER_EDITED');
    expect(history.notes).toMatch(/new custodian Abebe Kebede → Sara Tesfaye/);
    expect(history.notes).toMatch(/directorate current → Extension Services/);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EDIT_TRANSFER', entityType: 'TRANSFER' });
  });

  it('reads the details of older requests back from their summary text', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...transferRequest });
    await store().updateTransfer('tr-1', { ...edit, toEmployeeId: 'EMP-A', toDepartmentId: undefined, toLocationId: undefined, remark: undefined }, 'EMP-ENC');
    // Nothing changed compared with the parsed old request, so nothing is written
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('is refused once endorsed, and for unknown or other requests', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...transferRequest, currentStage: 2 });
    await expect(store().updateTransfer('tr-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
    db.transactionApproval.findUnique.mockResolvedValue({ ...returnRequest });
    await expect(store().updateTransfer('rt-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects missing or unknown values with a 400', async () => {
    await expect(store().updateTransfer('tr-1', { ...edit, model21No: ' ' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateTransfer('tr-1', { ...edit, reason: '' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateTransfer('tr-1', { ...edit, toEmployeeId: 'EMP-GONE' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateTransfer('tr-1', { ...edit, toLocationId: 'LOC-GONE' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('Return correction before Stage 1 endorsement', () => {
  const edit = {
    model21No: '0004390',
    ifmisSlipDateGc: '2026-10-01',
    returnReason: 'Project ended',
    condition: ItemCondition.NEEDS_REPAIR,
    defectRemark: 'Power button loose',
    book: 'MOA MC BOOK',
  };

  beforeEach(() => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...returnRequest });
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...returnRequest, ...data }));
  });

  it('updates condition and defects, keeps the slip, and records the change', async () => {
    await store().updateReturn('rt-1', edit, 'EMP-ENC');

    const data = db.transactionApproval.update.mock.calls[0][0].data;
    expect(data.requestDetails).toMatchObject({ condition: 'NEEDS_REPAIR', remark: 'Power button loose' });
    expect(data.ifmisSlipAttachmentUrl).toBe('/api/uploads/slips/m21.pdf');
    expect(data.purposeOrRemarks).toMatch(/Condition: NEEDS_REPAIR/);

    const history = db.item.update.mock.calls[0][0].data.history.create;
    expect(history.action).toBe('RETURN_EDITED');
    expect(history.notes).toMatch(/condition GOOD → NEEDS_REPAIR/);
    // Editing a pending return never changes the item's condition
    expect(db.item.update.mock.calls[0][0].data.condition).toBeUndefined();
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EDIT_RETURN', entityType: 'RETURN' });
  });

  it('is refused once endorsed (409) and rejects invalid values (400)', async () => {
    await expect(store().updateReturn('rt-1', { ...edit, condition: 'BROKEN' as any }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateReturn('rt-1', { ...edit, returnReason: ' ' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    db.transactionApproval.findUnique.mockResolvedValue({ ...returnRequest, status: 'APPROVED' });
    await expect(store().updateReturn('rt-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Return condition is applied only on approval', () => {
  it('does not change the item condition when the return is submitted', async () => {
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'rt-2', ...data }));
    await store().registerReturn({
      itemId: 'item-1',
      ifmisSlipNumber: '0004391',
      ifmisSlipDateGc: '2026-10-01',
      returnReason: 'Project ended',
      condition: ItemCondition.DAMAGED,
      registeredById: 'EMP-ENC',
      model21No: '0004391',
    });
    expect(db.item.update.mock.calls[0][0].data.condition).toBeUndefined();
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toMatchObject({ condition: 'DAMAGED' });
  });
});
