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

describe('Return for correction', () => {
  it('needs a reason', async () => {
    await expect(decide('A', 'RETURN', 'leader')).rejects.toMatchObject({ statusCode: 400, message: 'Give a reason for returning, so the requester knows what to correct.' });
  });

  it('sends the request back to its requester, still open, with who, why, when and from which stage', async () => {
    const result = await decide('A', 'RETURN', 'leader', 'Price is entered as USD.');
    expect(result).toMatchObject({ status: 'RETURNED', currentStage: 1, returnRemarks: 'Price is entered as USD.', returnedFromStage: 1, returnCount: 1 });
    const data = db.transactionApproval.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ returnedById: 'leader', returnedAtGc: expect.any(String) });
    // The record doesn't move: still waiting for its receipt to be approved
    const itemData = db.item.update.mock.calls[0][0].data;
    expect(itemData.status).toBeUndefined();
    expect(itemData.history.create).toMatchObject({ action: 'RETURNED_STOCK_IN', toEntity: 'Requester (Correction)' });
    expect(itemData.history.create.notes).toContain('Price is entered as USD.');
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('RETURN_STOCK_IN');
  });

  it('from the Department Head too: it goes back to the start and the endorsement is cleared', async () => {
    lines[0] = line('A', { currentStage: 2, endorsedById: 'leader', endorsementRemarks: 'ok', endorsedAtGc: '2026-10-21' });
    const result = await decide('A', 'RETURN', 'head', 'Wrong buyer name');
    expect(result).toMatchObject({ status: 'RETURNED', currentStage: 1, returnedFromStage: 2 });
    expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ endorsedById: null, endorsementRemarks: null, endorsedAtGc: null });
  });

  it('returns a whole Model 19 at once', async () => {
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'RETURN', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
    expect(result.map((a) => a.status)).toEqual(['RETURNED', 'RETURNED']);
  });

  it('is not reviewed while returned, except to reject it for good', async () => {
    await decide('A', 'RETURN', 'leader', 'Price in USD');
    await expect(decide('A', 'ENDORSE', 'leader')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('returned for correction') });
    await expect(decide('A', 'RETURN', 'leader', 'again')).rejects.toMatchObject({ statusCode: 409 });
    // The Department Head can reject it too, though it waits at stage 1 with its requester
    const rejected = await decide('A', 'REJECT', 'head', 'Not our delivery');
    expect(rejected.status).toBe('REJECTED');
    expect(db.transactionApproval.update.mock.calls.at(-1)![0].data.rejectionFinal).toBe(true);
  });
});

describe('Rejecting', () => {
  it('is final', async () => {
    await decide('A', 'REJECT', 'leader', 'Not our delivery');
    expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', rejectionFinal: true });
  });
});

describe('Resubmitting a corrected voucher', () => {
  beforeEach(async () => {
    await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'RETURN', reviewedById: 'leader', reviewRemarks: 'Price in USD' });
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
  it('keeps its units: another issue can only take what is left', async () => {
    const chairs = { id: 'item-9', itemCode: 'MOA-FUR-1', name: 'Chair', status: 'PENDING_STOCK_OUT', storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 10, uom: 'EA' }) };
    db.item.findUnique.mockResolvedValue(chairs);
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.transactionType === 'STOCK_OUT' && where.status?.in?.includes('RETURNED') ? [{ requestDetails: { quantity: 8 } }] : []);
    await expect(store().registerStockOut({ itemId: 'item-9', quantity: 3, ifmisSlipNumber: '0000300', recipientEmployeeId: 'leader', registeredById: 'encoder' } as any))
      .rejects.toThrow('at most 2');
  });

  it('a Model 22 No. rejected for good is refused', async () => {
    db.item.findUnique.mockResolvedValue({ id: 'item-9', itemCode: 'MOA-FUR-1', status: 'AVAILABLE', storeLocationId: 'LOC-1', notes: JSON.stringify({ quantity: 10 }) });
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
      where.rejectionFinal ? [{ reviewRemarks: 'Wrong store', reviewedAtGc: '2026-10-20', reviewedBy: { fullNameEn: 'Getnet Taye' } }] : []);
    await expect(store().registerStockOut({ itemId: 'item-9', quantity: 1, ifmisSlipNumber: '0000300', recipientEmployeeId: 'leader', registeredById: 'encoder' } as any))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Model 22 No. 0000300 was rejected by Getnet Taye on 2026-10-20: "Wrong store"') });
  });
});
