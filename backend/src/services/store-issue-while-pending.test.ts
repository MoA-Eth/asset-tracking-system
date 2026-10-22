import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  department: { findUnique: vi.fn() },
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: 'Store-01', store: { name: 'Kality' } })) },
  item: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

vi.mock('./reference.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reference.service')>()),
  requireStoreKeeper: vi.fn(async () => ({ employeeId: 'EMP-STOREMAN', fullNameEn: 'Store Man', storeName: 'Kality' })),
}));

import { StoreService } from './store.service';
import { applySystemSettings } from './settings.service';

// 50 chairs, 30 of them already on an issue request waiting for approval
const chairs = {
  id: 'item-1',
  itemCode: 'MOA-FUR-2026-0001',
  name: 'Office chair',
  category: 'FURNITURE',
  status: 'PENDING_STOCK_OUT',
  condition: 'NEW',
  itemType: 'FIXED',
  unitCostETB: 1000,
  storeLocationId: 'LOC-1',
  storeLocation: { id: 'LOC-1', storeId: 'STORE-1' },
  currentCustodianId: null,
  assignedDepartmentId: null,
  parentItemId: null,
  ifmisSlipNumber: 'GRN-1',
  notes: JSON.stringify({ quantity: 50, uom: 'EA' }),
};
let item: any;
/** Issue requests still waiting on the record, by their quantities */
let pendingIssues: { id: string; quantity?: number }[];
/** Another kind of request waiting on the record, if any */
let otherPending: any;

const issue = {
  ifmisSlipNumber: '0000202/A',
  ifmisSlipDateGc: '2026-10-21',
  purpose: 'New staff',
  recipientEmployeeId: 'EMP-A',
  targetDepartmentId: 'DEP-1',
  registeredById: 'EMP-ENC',
};
const store = () => StoreService.getInstance();

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({});
  item = { ...chairs };
  pendingIssues = [{ id: 'first-issue', quantity: 30 }];
  otherPending = null;
  db.employee.findUnique.mockImplementation(async ({ where }: any) => ({
    id: where.id, fullNameEn: `Employee ${where.id}`, role: where.id === 'EMP-HEAD' ? 'DEPARTMENT_HEAD' : 'DATA_ENCODER', isActive: true,
  }));
  db.department.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, nameEn: `Directorate ${where.id}` }));
  db.item.findUnique.mockImplementation(async ({ where }: any) => (where.id === item.id ? item : null));
  db.item.findMany.mockImplementation(async () => [item]);
  db.item.update.mockResolvedValue({});
  db.item.create.mockResolvedValue({});
  db.item.count.mockResolvedValue(0);
  // A pending request other than an issue blocks; issues are asked for by the units they take
  db.transactionApproval.findFirst.mockImplementation(async ({ where }: any) =>
    where.transactionType?.not === 'STOCK_OUT' ? otherPending : otherPending ?? (pendingIssues.length ? { transactionType: 'STOCK_OUT', ifmisSlipNumber: '0000201/A' } : null));
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
    where.itemId === item.id && where.transactionType === 'STOCK_OUT'
      ? pendingIssues.filter((p) => p.id !== where.id?.not).map((p) => ({ requestDetails: p.quantity === undefined ? {} : { quantity: p.quantity } }))
      : []);
  db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'second-issue', currentStage: 1, ...data }));
  db.auditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('a second Model 22 while the first issue waits for approval', () => {
  it('can ask for units another pending issue asks for: they stay in store until the last approver approves', async () => {
    const approval = await store().registerStockOut({ ...issue, itemId: item.id, quantity: 40 } as any);
    expect(approval.requestDetails?.quantity).toBe(40);
    expect(db.item.update.mock.calls[0][0].data.status).toBe('PENDING_STOCK_OUT');
  });

  it('takes every unit in store when no quantity is given', async () => {
    const approval = await store().registerStockOut({ ...issue, itemId: item.id } as any);
    expect(approval.requestDetails?.quantity).toBe(50);
  });

  it('refuses only more than is in store', async () => {
    await expect(store().registerStockOut({ ...issue, itemId: item.id, quantity: 51 } as any)).rejects.toMatchObject({
      statusCode: 400,
      message: 'MOA-FUR-2026-0001: quantity must be greater than 0 and at most 50 (EA in store).',
    });
    // Even when the pending issues already ask for all of it, or a request from before quantities were kept
    pendingIssues = [{ id: 'first-issue', quantity: 30 }, { id: 'other', quantity: 20 }];
    expect((await store().registerStockOut({ ...issue, itemId: item.id, quantity: 50 } as any)).requestDetails?.quantity).toBe(50);
    pendingIssues = [{ id: 'old' }];
    expect((await store().registerStockOut({ ...issue, itemId: item.id, quantity: 1 } as any)).requestDetails?.quantity).toBe(1);
  });

  it('works on a multi-line Model 22 too', async () => {
    const { approvals } = await store().registerStockOuts({ ...issue, lines: [{ itemId: item.id, quantity: 45 }] } as any);
    expect(approvals[0].requestDetails?.quantity).toBe(45);
    await expect(store().registerStockOuts({ ...issue, lines: [{ itemId: item.id, quantity: 51 }] } as any)).rejects.toThrow('at most 50');
  });

  it('is still refused while a transfer or disposal waits on the record: they move the whole asset', async () => {
    otherPending = { transactionType: 'DISPOSAL', ifmisSlipNumber: 'D-1' };
    await expect(store().registerStockOut({ ...issue, itemId: item.id, quantity: 5 } as any)).rejects.toThrow('already has a pending DISPOSAL approval');
  });

  it('is refused for a record that is not in store', async () => {
    item = { ...chairs, status: 'ISSUED' };
    await expect(store().registerStockOut({ ...issue, itemId: item.id, quantity: 5 } as any)).rejects.toThrow('must be in store');
  });

  it('can be corrected up to everything in store', async () => {
    pendingIssues = [{ id: 'first-issue', quantity: 30 }, { id: 'second-issue', quantity: 10 }];
    db.transactionApproval.findUnique.mockResolvedValue({
      id: 'second-issue', transactionType: 'STOCK_OUT', status: 'PENDING', currentStage: 1, itemId: item.id, itemCode: item.itemCode,
      ifmisSlipNumber: '0000202/A', purposeOrRemarks: 'New staff', recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1', requestDetails: { quantity: 10, uom: 'EA' },
    });
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ id: 'second-issue', ...data }));
    const edit = { ifmisSlipNumber: '0000202/A', purpose: 'New staff', recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1' };
    await expect(store().updateStockOut('second-issue', { ...edit, quantity: 51 } as any, 'EMP-ENC')).rejects.toThrow('at most 50');
    const saved = await store().updateStockOut('second-issue', { ...edit, quantity: 50 } as any, 'EMP-ENC');
    expect(saved.requestDetails?.quantity).toBe(50);
  });
});

describe('deciding one issue while another waits on the same record', () => {
  // CANCEL: the first issue was rejected, and its requester withdraws it
  const decide = (action: 'APPROVE' | 'CANCEL', quantity: number) => {
    const approval = {
      id: 'first-issue', transactionType: 'STOCK_OUT', status: action === 'CANCEL' ? 'RETURNED' : 'PENDING', currentStage: action === 'CANCEL' ? 1 : 2, itemId: item.id, itemCode: item.itemCode, itemName: item.name,
      ifmisSlipNumber: '0000201/A', purposeOrRemarks: 'Field office', requestedById: 'EMP-ENC', recipientEmployeeId: 'EMP-B', targetDepartmentId: 'DEP-2',
      requestDetails: { quantity, uom: 'EA' },
    };
    db.transactionApproval.findUnique.mockResolvedValue(approval);
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...approval, ...data }));
    return action === 'CANCEL'
      ? (store() as any).applyDecision({ approvalId: 'first-issue', action: 'REJECT', reviewedById: 'EMP-ENC', reviewRemarks: 'Wrong directorate' }, db, undefined, true)
      : store().handleApproval({ approvalId: 'first-issue', action, reviewedById: 'EMP-HEAD' } as any);
  };
  const statusSet = () => db.item.update.mock.calls.at(-1)![0].data.status;

  beforeEach(() => {
    // The second Model 22 (20 chairs) is waiting too
    pendingIssues = [{ id: 'first-issue', quantity: 30 }, { id: 'second-issue', quantity: 20 }];
  });

  it('approving the first splits off its units and leaves the record waiting for the second', async () => {
    await decide('APPROVE', 30);
    expect(statusSet()).toBe('PENDING_STOCK_OUT');
    expect(JSON.parse(db.item.update.mock.calls.at(-1)![0].data.notes).quantity).toBe(20);
    expect(JSON.parse(db.item.create.mock.calls[0][0].data.notes).quantity).toBe(30);
  });

  it('cancelling the first leaves the record waiting for the second', async () => {
    await decide('CANCEL', 30);
    expect(statusSet()).toBe('PENDING_STOCK_OUT');
  });

  it('puts the record back in store once no other issue waits', async () => {
    pendingIssues = [{ id: 'first-issue', quantity: 30 }];
    await decide('CANCEL', 30);
    expect(statusSet()).toBe('AVAILABLE');
  });

  it('is refused once another issue took the whole record, so it is never issued twice', async () => {
    item = { ...chairs, status: 'ISSUED', currentCustodianId: 'EMP-C' };
    await expect(decide('APPROVE', 30)).rejects.toThrow('MOA-FUR-2026-0001 is no longer in store: another issue was approved first and took all of it. Reject this Model 22');
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it('cancelling it leaves a record another issue took as that issue left it', async () => {
    item = { ...chairs, status: 'ISSUED', currentCustodianId: 'EMP-C' };
    await decide('CANCEL', 30);
    expect(statusSet()).toBe('ISSUED');
    expect(db.item.update.mock.calls.at(-1)![0].data.currentCustodianId).toBe('EMP-C');
  });

  it('the Team Leader is told when endorsing, not only the approver later', async () => {
    item = { ...chairs, notes: JSON.stringify({ quantity: 20, uom: 'EA' }) };
    db.employee.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, fullNameEn: 'Team Leader', role: 'TEAM_LEADER', isActive: true }));
    db.transactionApproval.findUnique.mockResolvedValue({
      id: 'second-issue', transactionType: 'STOCK_OUT', status: 'PENDING', currentStage: 1, itemId: item.id, itemCode: item.itemCode,
      ifmisSlipNumber: '0000202/A', requestedById: 'EMP-ENC', requestDetails: { quantity: 30, uom: 'EA' },
    });
    await expect(store().handleApproval({ approvalId: 'second-issue', action: 'ENDORSE', reviewedById: 'EMP-LEAD' } as any))
      .rejects.toThrow('Only 20 EA of MOA-FUR-2026-0001 are left in store, fewer than the 30 on this Model 22: another issue was approved first. Reject it');
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });

  it('a rejected issue is resubmitted only if it still fits: the requester is asked to lower the quantity', async () => {
    db.transactionApproval.findMany.mockResolvedValueOnce([{
      id: 'second-issue', transactionType: 'STOCK_OUT', status: 'RETURNED', itemId: item.id, itemCode: item.itemCode, ifmisSlipNumber: '0000202/A',
      requestDetails: { quantity: 30 }, item: { itemCode: item.itemCode, status: 'PENDING_STOCK_OUT', notes: JSON.stringify({ quantity: 20, uom: 'EA' }) },
    }]);
    await expect(store().resubmitReturned({ approvalIds: ['second-issue'] }, 'EMP-ENC')).rejects.toThrow('fewer than the 30 on this Model 22: another issue was approved first. Lower the quantity, or cancel the request.');
  });

  it('a correction is refused once another issue took the whole record', async () => {
    item = { ...chairs, status: 'ISSUED' };
    db.transactionApproval.findUnique.mockResolvedValue({
      id: 'second-issue', transactionType: 'STOCK_OUT', status: 'RETURNED', currentStage: 1, itemId: item.id, itemCode: item.itemCode,
      ifmisSlipNumber: '0000202/A', purposeOrRemarks: 'New staff', recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1', requestDetails: { quantity: 10, uom: 'EA' },
    });
    await expect(store().updateStockOut('second-issue', { ifmisSlipNumber: '0000202/A', purpose: 'New staff', recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1', quantity: 10 } as any, 'EMP-ENC'))
      .rejects.toThrow('is no longer in store');
  });

  it('never issues more than is left in store: the first approved took the units, so this one goes back to its requester', async () => {
    item = { ...chairs, notes: JSON.stringify({ quantity: 20, uom: 'EA' }) };
    await expect(decide('APPROVE', 30)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Only 20 EA of MOA-FUR-2026-0001 are left in store, fewer than the 30 on this Model 22: another issue was approved first. Reject it, so the requester lowers the quantity and resubmits, or cancels it.',
    });
    expect(db.item.create).not.toHaveBeenCalled();
  });
});
