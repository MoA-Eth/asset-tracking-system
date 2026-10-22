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

const people: Record<string, any> = {
  encoder: { id: 'encoder', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER', isActive: true },
  leader: { id: 'leader', fullNameEn: 'Getnet Taye', role: 'TEAM_LEADER', isActive: true },
  head: { id: 'head', fullNameEn: 'Getaneh G/mariam', role: 'DEPARTMENT_HEAD', isActive: true },
};
const record = { id: 'item-1', itemCode: 'MOA-OFS-2026-0001', name: 'Toner', status: 'PENDING_STOCK_IN', storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 2, uom: 'EA', poNumber: 'PO-7' }), unitCostETB: 3000 };
/** A line of Model 19 0000152, as the approvals table keeps it */
const line = (id: string, extra: object = {}) => ({
  id, transactionType: 'STOCK_IN', itemId: `item-${id}`, itemCode: `MOA-${id}`, itemName: `Item ${id}`, ifmisSlipNumber: '0000152',
  requestedById: 'encoder', status: 'PENDING', currentStage: 1, createdAtGc: '2026-10-21', createdAtEc: '2019-02-11', purposeOrRemarks: '',
  endorsedById: null, item: { notes: JSON.stringify({ quantity: 2, poNumber: 'PO-7' }), unitCostETB: 3000 }, ...extra,
});
let lines: any[];
const store = () => StoreService.getInstance();
const decide = (approvalId: string, action: string, by: string, reviewRemarks?: string) =>
  store().handleApproval({ approvalId, action, reviewedById: by, reviewRemarks } as any);

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({});
  lines = [line('A'), line('B')];
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
  db.item.findUnique.mockImplementation(async ({ where }: any) => ({ ...record, id: where.id }));
  db.item.update.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  db.transactionApproval.findUnique.mockImplementation(async ({ where }: any) => lines.find((l) => l.id === where.id) ?? null);
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) => (where.id?.in ? lines.filter((l) => where.id.in.includes(l.id)) : []));
  // The update only goes through while the request is as the reviewer saw it
  db.transactionApproval.update.mockImplementation(async ({ where, data }: any) => {
    const l = lines.find((x) => x.id === where.id);
    if (!l || (where.status && where.status !== l.status) || (where.currentStage && where.currentStage !== l.currentStage)) throw Object.assign(new Error('gone'), { code: 'P2025' });
    const next = { ...l, ...data, returnCount: data.returnCount?.increment ? (l.returnCount ?? 0) + data.returnCount.increment : data.returnCount ?? l.returnCount };
    Object.assign(l, next);
    return next;
  });
});

describe('Rejecting', () => {
  it('needs a reason', async () => {
    await expect(decide('A', 'REJECT', 'leader')).rejects.toMatchObject({ statusCode: 400, message: 'Give a reason for rejecting, so the requester knows what to correct.' });
  });

  it('sends the request back to its requester, still open, with who, why, when and from which stage', async () => {
    const result = await decide('A', 'REJECT', 'leader', 'Price is entered as USD.');
    expect(result).toMatchObject({ status: 'RETURNED', currentStage: 1, returnRemarks: 'Price is entered as USD.', returnedFromStage: 1, returnCount: 1 });
    const data = db.transactionApproval.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ returnedById: 'leader', returnedAtGc: expect.any(String) });
    // The record doesn't move: still waiting for its receipt to be approved
    const itemData = db.item.update.mock.calls[0][0].data;
    expect(itemData.status).toBeUndefined();
    expect(itemData.history.create).toMatchObject({ action: 'STOCK_IN_REJECTED', toEntity: 'Requester (Correction)' });
    expect(itemData.history.create.notes).toContain('Price is entered as USD.');
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('REJECT_STOCK_IN');
  });

  it('from the Department Head too: it goes back to the start and the endorsement is cleared', async () => {
    lines[0] = line('A', { currentStage: 2, endorsedById: 'leader', endorsementRemarks: 'ok', endorsedAtGc: '2026-10-21' });
    const result = await decide('A', 'REJECT', 'head', 'Wrong buyer name');
    expect(result).toMatchObject({ status: 'RETURNED', currentStage: 1, returnedFromStage: 2 });
    expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ endorsedById: null, endorsementRemarks: null, endorsedAtGc: null });
  });

  it('rejects a whole Model 19 at once; RETURN, its older name, does the same', async () => {
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
    expect(result.map((a) => a.status)).toEqual(['RETURNED', 'RETURNED']);
    lines = [line('A'), line('B')];
    expect((await decide('A', 'RETURN', 'leader', 'Price in USD')).status).toBe('RETURNED');
  });

  it('a whole Model 19, all lines together', async () => {
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
    expect(result.map((a) => a.status)).toEqual(['RETURNED', 'RETURNED']);
  });

  it('is not reviewed while it is with its requester', async () => {
    await decide('A', 'REJECT', 'leader', 'Price in USD');
    await expect(decide('A', 'ENDORSE', 'leader')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('with its requester to correct or cancel') });
    await expect(decide('A', 'REJECT', 'head', 'again')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Cancelling a rejected voucher', () => {
  beforeEach(async () => {
    await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader', reviewRemarks: 'Double entrance' });
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
    db.item.findUnique.mockImplementation(async ({ where }: any) => ({ ...record, id: where.id }));
    db.item.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('closes every line and puts the records back, with the history and audit of it', async () => {
    const result = await store().cancelRejected({ approvalIds: ['A', 'B'], reason: 'Entered twice' }, 'encoder');
    expect(result.map((a) => a.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', reviewRemarks: 'Entered twice', reviewedById: 'encoder' });
    // A receipt cancelled: its record is rejected, so its Model 19 No. can be received again
    expect(db.item.update.mock.calls[0][0].data.status).toBe('REJECTED');
    expect(db.item.update.mock.calls[0][0].data.history.create).toMatchObject({ action: 'STOCK_IN_CANCELLED' });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('CANCEL_STOCK_IN');
  });

  it('needs no reason', async () => {
    const result = await store().cancelRejected({ approvalIds: ['A', 'B'] }, 'encoder');
    expect(result[0].reviewRemarks).toBe('Cancelled by the requester');
  });

  it('refuses what is not rejected, another voucher, or a role that cannot make such a request', async () => {
    await expect(store().cancelRejected({ approvalIds: [] }, 'encoder')).rejects.toMatchObject({ statusCode: 400 });
    lines.push(line('C'));
    await expect(store().cancelRejected({ approvalIds: ['A', 'C'] }, 'encoder')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Only a rejected request') });
    lines.push(line('D', { status: 'RETURNED', ifmisSlipNumber: '0000153' }));
    await expect(store().cancelRejected({ approvalIds: ['A', 'D'] }, 'encoder')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().cancelRejected({ approvalIds: ['A', 'B'] }, 'leader')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });
});

describe('Resubmitting a corrected voucher', () => {
  beforeEach(async () => {
    await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
    db.item.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('sends every line back to the Team Leader, with the history and audit of it', async () => {
    const result = await store().resubmitReturned({ approvalIds: ['A', 'B'] }, 'encoder');
    expect(result.map((a) => [a.status, a.currentStage])).toEqual([['PENDING', 1], ['PENDING', 1]]);
    // The reason it was returned stays with the request
    expect(result[0].returnRemarks).toBe('Price in USD');
    expect(db.item.update.mock.calls[0][0].data.history.create).toMatchObject({ action: 'RESUBMITTED_STOCK_IN', toEntity: 'Team Leader Review (Stage 1)' });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('RESUBMIT_STOCK_IN');
  });

  it('refuses what is not returned, another voucher, or a role that cannot make such a request', async () => {
    await expect(store().resubmitReturned({ approvalIds: [] }, 'encoder')).rejects.toMatchObject({ statusCode: 400 });
    lines.push(line('C'));
    await expect(store().resubmitReturned({ approvalIds: ['A', 'C'] }, 'encoder')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Only a request returned for correction') });
    lines.push(line('D', { status: 'RETURNED', ifmisSlipNumber: '0000153' }));
    await expect(store().resubmitReturned({ approvalIds: ['A', 'D'] }, 'encoder')).rejects.toMatchObject({ statusCode: 400, message: 'These requests are not on the same Model 19.' });
    await expect(store().resubmitReturned({ approvalIds: ['A', 'B'] }, 'leader')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });

  it('is then reviewed as any request: endorsed by the Team Leader', async () => {
    await store().resubmitReturned({ approvalIds: ['A', 'B'] }, 'encoder');
    const endorsed = await decide('A', 'ENDORSE', 'leader');
    expect(endorsed.currentStage).toBe(2);
  });
});

describe('An issue returned for correction', () => {
  it('holds none of its units: another issue can ask for any in store, but no more', async () => {
    const chairs = { id: 'item-9', itemCode: 'MOA-FUR-1', name: 'Chair', status: 'PENDING_STOCK_OUT', storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 10, uom: 'EA' }) };
    db.item.findUnique.mockResolvedValue(chairs);
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.transactionType === 'STOCK_OUT' && where.status?.in?.includes('RETURNED') ? [{ requestDetails: { quantity: 8 } }] : []);
    await expect(store().registerStockOut({ itemId: 'item-9', quantity: 11, ifmisSlipNumber: '0000300', recipientEmployeeId: 'leader', registeredById: 'encoder' } as any))
      .rejects.toThrow('at most 10');
  });

});

describe('Saving a correction of a returned request', () => {
  beforeEach(async () => {
    await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
    db.item.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
    db.transactionApproval.findFirst.mockImplementation(async ({ where }: any) => lines.find((l) => l.itemId === where.itemId && l.status === where.status) ?? null);
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.id?.in ? lines.filter((l) => where.id.in.includes(l.id))
      : lines.filter((l) => l.status === where.status && l.transactionType === where.transactionType && l.ifmisSlipNumber.toLowerCase() === where.ifmisSlipNumber.equals.toLowerCase()));
  });

  it('resubmits it, with the rest of its Model 19, to the Team Leader', async () => {
    const result = await store().resubmitAfterCorrection({ itemId: 'item-A', transactionType: 'STOCK_IN' }, 'encoder');
    expect(result.map((a) => a.id)).toEqual(['A', 'B']);
    expect(lines.map((l) => [l.status, l.currentStage])).toEqual([['PENDING', 1], ['PENDING', 1]]);
  });

  it('leaves another receipt on the same number but another PO alone', async () => {
    lines.push(line('C', { status: 'RETURNED', item: { notes: JSON.stringify({ quantity: 1, poNumber: 'PO-8' }) } }));
    await store().resubmitAfterCorrection({ approvalId: 'A' }, 'encoder');
    expect(lines.find((l) => l.id === 'C')!.status).toBe('RETURNED');
  });

  it('does nothing to a request that was not returned', async () => {
    lines.push(line('D'));
    expect(await store().resubmitAfterCorrection({ approvalId: 'D' }, 'encoder')).toEqual([]);
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });
});
