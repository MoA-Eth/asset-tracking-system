import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  department: { findUnique: vi.fn() },
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: 'Store-01', store: { name: 'Kality' } })) },
  item: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { applySystemSettings } from './settings.service';

/** Ten chairs in store, registered as one record */
const chairs = {
  id: 'item-1',
  itemCode: 'MOA-FUR-2026-0001',
  name: 'Office chair',
  category: 'OFFICE_FURNITURE',
  status: 'AVAILABLE',
  condition: 'GOOD',
  unitCostETB: 1500,
  storeLocationId: 'LOC-01',
  currentCustodianId: null,
  assignedDepartmentId: null,
  heldByOrganization: null,
  heldByContact: null,
  approvedById: 'EMP-HEAD-OLD',
  parentItemId: null,
  registeredById: 'EMP-ENC',
  ifmisSlipNumber: 'GRN-1',
  ifmisSlipDateGc: '2026-01-10',
  ifmisSlipDateEc: '2018-05-02',
  isHistoricalData: false,
  notes: JSON.stringify({ quantity: 10, uom: 'EA' }),
};

const base = {
  itemId: 'item-1',
  ifmisSlipNumber: 'M22-001',
  ifmisSlipDateGc: '2026-10-01',
  purpose: 'Loan for the school feeding programme',
  registeredById: 'EMP-ENC',
};
const external = { ...base, recipientType: 'EXTERNAL' as const, organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku' };
const internal = { ...base, recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' };

const pendingIssue = (over: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
  id: 'appr-1',
  transactionType: 'STOCK_OUT',
  itemId: 'item-1',
  itemCode: chairs.itemCode,
  itemName: chairs.name,
  ifmisSlipNumber: 'M22-001',
  ifmisSlipDateGc: '2026-10-01',
  requestedById: 'EMP-ENC',
  recipientEmployeeId: null,
  targetDepartmentId: null,
  purposeOrRemarks: base.purpose,
  requestDetails: { quantity: 10, uom: 'EA', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku', ...details },
  status: 'PENDING',
  currentStage: 1,
  ...over,
});

const store = () => StoreService.getInstance();
const roleOf = (id: string) => (id === 'EMP-HEAD' ? 'DEPARTMENT_HEAD' : id === 'EMP-TL' ? 'TEAM_LEADER' : 'DATA_ENCODER');

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({});
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, fullNameEn: `Employee ${where.id}`, role: roleOf(where.id), isActive: true }));
  db.department.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, nameEn: `Directorate ${where.id}` }));
  db.item.findUnique.mockResolvedValue({ ...chairs });
  db.item.update.mockResolvedValue({});
  db.item.create.mockResolvedValue({});
  db.item.count.mockResolvedValue(0);
  db.transactionApproval.findFirst.mockResolvedValue(null);
  db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'appr-1', currentStage: 1, ...data }));
  db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...pendingIssue(), ...data }));
  db.auditLog.create.mockResolvedValue({});
});

describe('requesting an issue to an outside organization', () => {
  it('records the organization and contact person, with no employee and no directorate', async () => {
    await store().registerStockOut({ ...external, quantity: 4 } as any);

    const created = db.transactionApproval.create.mock.calls[0][0].data;
    expect(created.recipientEmployeeId).toBeUndefined();
    expect(created.targetDepartmentId).toBeUndefined();
    expect(created.requestDetails).toEqual({
      quantity: 4, uom: 'EA', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku',
    });
    expect(db.employee.findUnique).not.toHaveBeenCalledWith({ where: { id: undefined } });
    const history = db.item.update.mock.calls[0][0].data.history.create;
    expect(history.toEntity).toBe('Oromia Bureau of Agriculture (Pending Approval)');
    expect(db.auditLog.create.mock.calls[0][0].data.details).toMatch(/to Oromia Bureau of Agriculture/);
  });

  it('needs only an organization name: the contact person is optional', async () => {
    await store().registerStockOut({ ...external, contactPerson: undefined } as any);
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toEqual({
      quantity: 10, uom: 'EA', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture',
    });
  });

  it.each(['', '   ', undefined])('refuses an organization named %j', async (organizationName) => {
    await expect(store().registerStockOut({ ...external, organizationName } as any)).rejects.toThrow(/organization/i);
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });

  it('still needs an employee for an internal issue', async () => {
    await expect(store().registerStockOut({ ...base } as any)).rejects.toThrow(/Recipient staff member is required/);
  });

  it('ignores an employee sent along with an external recipient', async () => {
    await store().registerStockOut({ ...external, recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' } as any);
    const created = db.transactionApproval.create.mock.calls[0][0].data;
    expect(created.recipientEmployeeId).toBeUndefined();
    expect(created.targetDepartmentId).toBeUndefined();
  });
});

describe('correcting an issue request between internal and external', () => {
  it('switches an employee request to an organization, clearing the employee and directorate', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue({ recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' }, { recipientType: undefined, organizationName: undefined, contactPerson: undefined }));

    await store().updateStockOut('appr-1', { ...external } as any, 'EMP-ENC');

    const saved = db.transactionApproval.update.mock.calls[0][0].data;
    expect(saved.recipientEmployeeId).toBeNull();
    expect(saved.targetDepartmentId).toBeNull();
    expect(saved.requestDetails).toMatchObject({ recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku', quantity: 10 });
    expect(db.item.update.mock.calls[0][0].data.history.create.toEntity).toBe('Oromia Bureau of Agriculture (Pending Approval)');
  });

  it('switches an organization request to an employee, dropping the organization details', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue());

    await store().updateStockOut('appr-1', { ...internal } as any, 'EMP-ENC');

    const saved = db.transactionApproval.update.mock.calls[0][0].data;
    expect(saved).toMatchObject({ recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' });
    expect(saved.requestDetails).not.toHaveProperty('organizationName');
    expect(saved.requestDetails).not.toHaveProperty('recipientType');
    expect(saved.requestDetails).toMatchObject({ quantity: 10, uom: 'EA' });
  });

  it('describes a changed organization in the history', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue());
    await store().updateStockOut('appr-1', { ...external, organizationName: 'Amhara Bureau of Agriculture' } as any, 'EMP-ENC');
    expect(db.item.update.mock.calls[0][0].data.history.create.notes).toMatch(/organization Oromia Bureau of Agriculture → Amhara Bureau of Agriculture/);
  });

  it('requires a name when the request stays external', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue());
    await expect(store().updateStockOut('appr-1', { ...external, organizationName: ' ' } as any, 'EMP-ENC')).rejects.toThrow(/organization/i);
  });
});

describe('approving an issue to an outside organization', () => {
  it('issues the record, held by the organization and by no employee', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue({ currentStage: 2 }));
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_STOCK_OUT' });

    await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

    const data = db.item.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'ISSUED', currentCustodianId: null, assignedDepartmentId: null,
      heldByOrganization: 'Oromia Bureau of Agriculture', heldByContact: 'Mantegbosh Mirku',
    });
    expect(data.history.create).toMatchObject({ action: 'STOCK_OUT_APPROVED', toEntity: 'Oromia Bureau of Agriculture' });
  });

  it('puts the issued units on their own record, and leaves the rest in store with no holder', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue({ currentStage: 2 }, { quantity: 4 }));
    db.item.findUnique.mockImplementation(async ({ where }: any) => (where.id === 'item-1' ? { ...chairs, status: 'PENDING_STOCK_OUT' } : null));

    await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

    const parent = db.item.update.mock.calls[0][0].data;
    expect(parent).toMatchObject({ status: 'AVAILABLE', currentCustodianId: null, heldByOrganization: null, heldByContact: null });
    const child = db.item.create.mock.calls[0][0].data;
    expect(child).toMatchObject({
      status: 'ISSUED', currentCustodianId: null, heldByOrganization: 'Oromia Bureau of Agriculture', heldByContact: 'Mantegbosh Mirku', parentItemId: 'item-1',
    });
    expect(JSON.parse(child.notes)).toMatchObject({ quantity: 4 });
  });

  it('leaves an employee issue as it was: an employee holds it, no organization', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue({ currentStage: 2, recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' }, { recipientType: undefined, organizationName: undefined, contactPerson: undefined }));
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_STOCK_OUT' });

    await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

    expect(db.item.update.mock.calls[0][0].data).toMatchObject({
      status: 'ISSUED', currentCustodianId: 'EMP-A', assignedDepartmentId: 'DEP-1', heldByOrganization: null, heldByContact: null,
    });
  });

  it('puts the item back in store, with no organization, when the issue is rejected', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingIssue({ currentStage: 2 }));
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_STOCK_OUT' });

    await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Not approved' } as any);

    expect(db.item.update.mock.calls[0][0].data).toMatchObject({ status: 'AVAILABLE', heldByOrganization: null });
  });
});

describe('an item issued to an outside organization', () => {
  const held = { ...chairs, status: 'ISSUED', heldByOrganization: 'Oromia Bureau of Agriculture', heldByContact: 'Mantegbosh Mirku' };

  it('cannot be returned yet', async () => {
    db.item.findUnique.mockResolvedValue(held);
    await expect(store().registerReturn({ itemId: 'item-1', ifmisSlipNumber: 'R-1', returnReason: 'Done', condition: 'GOOD', registeredById: 'EMP-ENC' } as any))
      .rejects.toThrow(/issued to Oromia Bureau of Agriculture.*Returning/);
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });

  it('cannot be transferred yet', async () => {
    db.item.findUnique.mockResolvedValue(held);
    await expect(store().transferItem({ itemId: 'item-1', model21No: 'T-1', reason: 'Move', toEmployeeId: 'EMP-A', registeredById: 'EMP-ENC' } as any))
      .rejects.toThrow(/issued to Oromia Bureau of Agriculture.*Transferring/);
    expect(db.transactionApproval.create).not.toHaveBeenCalled();
  });
});
