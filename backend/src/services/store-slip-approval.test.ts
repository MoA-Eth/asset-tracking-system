import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreService } from './store.service';

// In-memory stand-in for the Prisma client: the real transaction rolls every line back when one fails
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  item: { findUnique: vi.fn(), update: vi.fn() },
  transactionApproval: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const meta = (po?: string, extra: object = {}) => JSON.stringify({ quantity: 1, uom: 'EA', ...(po ? { poNumber: po } : {}), ...extra });
const line = (id: string, extra: object = {}) => ({
  id, transactionType: 'STOCK_IN', itemId: `item-${id}`, itemCode: `MOA-${id}`, itemName: `Item ${id}`, ifmisSlipNumber: '0000051',
  requestedById: 'encoder', status: 'PENDING', currentStage: 1, createdAtGc: '2026-10-20', createdAtEc: '2019-02-10',
  purposeOrRemarks: '', item: { notes: meta('PO-14'), unitCostETB: 1000 }, ...extra,
});
const people: Record<string, any> = {
  leader: { id: 'leader', fullNameEn: 'Getnet Taye', role: 'TEAM_LEADER', isActive: true },
  head: { id: 'head', fullNameEn: 'Getaneh G/mariam', role: 'DEPARTMENT_HEAD', isActive: true },
};
let lines: any[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  lines = [line('A'), line('B'), line('C')];
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) => lines.filter((l) => where.id.in.includes(l.id)));
  db.transactionApproval.findUnique.mockImplementation(async ({ where }: any) => lines.find((l) => l.id === where.id) ?? null);
  db.transactionApproval.update.mockImplementation(async ({ where, data }: any) => ({ ...lines.find((l) => l.id === where.id), ...data }));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
  db.item.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, notes: meta('PO-14'), unitCostETB: 1000 }));
  db.item.update.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

const store = () => StoreService.getInstance();

describe('Reviewing a whole Model 19 at once', () => {
  it('endorses every line of the receipt in one transaction', async () => {
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B', 'C'], action: 'ENDORSE', reviewedById: 'leader' });
    expect(result.map((a) => a.currentStage)).toEqual([2, 2, 2]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.transactionApproval.update).toHaveBeenCalledTimes(3);
    expect(db.auditLog.create).toHaveBeenCalledTimes(3);
  });

  it('gives the PO number with each receipt line, so the queue can group them', async () => {
    const result = await store().handleSlipApproval({ approvalIds: ['A'], action: 'ENDORSE', reviewedById: 'leader' });
    expect(result[0].poNumber).toBe('PO-14');
  });

  it('refuses lines that are not one receipt: another slip or PO, another kind of request, or mixed stages', async () => {
    lines[2] = line('C', { item: { notes: meta('PO-15'), unitCostETB: 1000 } });
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('not on the same Model 19 and PO');
    lines[2] = line('C', { ifmisSlipNumber: '0000052' });
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('not on the same Model 19 and PO');
    lines[2] = line('C', { transactionType: 'STOCK_OUT' });
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('Only the lines of one receipt (Model 19) or one issue (Model 22)');
    lines[2] = line('C', { currentStage: 2 });
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('different stages');
    lines[2] = line('C', { status: 'APPROVED' });
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('already been decided');
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'gone'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('no longer exists');
    await expect(store().handleSlipApproval({ approvalIds: [], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('Choose the voucher');
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });

  it('sends the whole receipt to the CEO when one line is above 10 million birr', async () => {
    lines = [line('A', { currentStage: 2 }), line('B', { currentStage: 2, item: { notes: meta('PO-14'), unitCostETB: 12_000_000 } })];
    db.item.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, notes: meta('PO-14'), unitCostETB: where.id === 'item-B' ? 12_000_000 : 1000 }));
    // The Department Head's decision fails on line B, so the transaction (and line A with it) is rolled back
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'APPROVE', reviewedById: 'head' })).rejects.toThrow('Chief Director');
  });

  it('needs a reason to reject, like a single request', async () => {
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'REJECT', reviewedById: 'leader' })).rejects.toThrow('Give a reason');
  });
});

describe('Reviewing a whole Model 22 at once', () => {
  const issueLine = (id: string, extra: object = {}) => line(id, { transactionType: 'STOCK_OUT', ifmisSlipNumber: '0000201/A', requestDetails: { quantity: 1 }, ...extra });

  it('endorses every line of the issue in one transaction, whatever receipt or PO each item came from', async () => {
    lines = [issueLine('A'), issueLine('B', { item: { notes: meta('PO-99'), unitCostETB: 1000 } })];
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'ENDORSE', reviewedById: 'leader' });
    expect(result.map((a) => a.currentStage)).toEqual([2, 2]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses lines of another Model 22, or an issue mixed with a receipt', async () => {
    lines = [issueLine('A'), issueLine('B', { ifmisSlipNumber: '0000202/A' }), line('C')];
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('not on the same Model 22');
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('Only the lines of one receipt');
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });
});
