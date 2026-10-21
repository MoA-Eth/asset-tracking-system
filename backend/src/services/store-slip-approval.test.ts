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
  ceo: { id: 'ceo', fullNameEn: 'Chief Director', role: 'CHIEF_DIRECTOR', isActive: true },
};
let lines: any[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  lines = [line('A'), line('B'), line('C')];
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.transactionApproval.findMany.mockImplementation(async ({ where }: any) =>
    where.id
      ? lines.filter((l) => where.id.in.includes(l.id))
      // The other lines of a voucher, waiting together
      : lines.filter((l) => l.transactionType === where.transactionType && l.status === where.status && l.currentStage === where.currentStage
          && l.ifmisSlipNumber.toLowerCase() === where.ifmisSlipNumber.equals.toLowerCase()));
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
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('Only the lines of one receipt (Model 19), one issue (Model 22) or one disposal form');
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

describe('The CEO threshold goes by the grand total of a voucher', () => {
  // Two lines of 6 million birr: each under 10 million, together above it
  const sixMillion = (id: string, extra: object = {}) => line(id, { currentStage: 2, item: { notes: meta('PO-14'), unitCostETB: 6_000_000 }, ...extra });
  beforeEach(() => {
    lines = [sixMillion('A'), sixMillion('B')];
    db.item.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, notes: meta('PO-14'), unitCostETB: 6_000_000 }));
  });

  it('sends a voucher whose lines add up to more than 10 million to the CEO', async () => {
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'APPROVE', reviewedById: 'head' })).rejects.toThrow('Chief Director');
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'APPROVE', reviewedById: 'ceo' });
    expect(result.map((a) => a.status)).toEqual(['APPROVED', 'APPROVED']);
  });

  it('still counts the whole voucher when one of its lines is decided on its own', async () => {
    await expect(store().handleApproval({ approvalId: 'A', action: 'APPROVE', reviewedById: 'head' })).rejects.toThrow('12,000,000 ETB for the whole voucher');
  });

  it('leaves a voucher at or under 10 million with the Department Head, even with a large line among small ones', async () => {
    lines = [sixMillion('A'), line('B', { currentStage: 2 })];
    db.item.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, notes: meta('PO-14'), unitCostETB: where.id === 'item-A' ? 6_000_000 : 1000 }));
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'APPROVE', reviewedById: 'head' });
    expect(result.map((a) => a.status)).toEqual(['APPROVED', 'APPROVED']);
  });
});

describe('Reviewing a whole disposal form at once', () => {
  const disposalLine = (id: string, extra: object = {}) =>
    line(id, { transactionType: 'DISPOSAL', ifmisSlipNumber: '0001765/2018', requestDetails: { quantity: 1, bookValue: 0 }, ...extra });

  it('endorses every asset on the form in one transaction', async () => {
    lines = [disposalLine('A'), disposalLine('B', { requestDetails: { quantity: 1, bookValue: 2_500 } })];
    const result = await store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'ENDORSE', reviewedById: 'leader' });
    expect(result.map((a) => a.currentStage)).toEqual([2, 2]);
  });

  it('refuses assets of another disposal form, or a disposal mixed with an issue', async () => {
    lines = [disposalLine('A'), disposalLine('B', { ifmisSlipNumber: '0001766/2018' }), line('C', { transactionType: 'STOCK_OUT', ifmisSlipNumber: '0001765/2018' })];
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'B'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('not on the same disposal form');
    await expect(store().handleSlipApproval({ approvalIds: ['A', 'C'], action: 'ENDORSE', reviewedById: 'leader' })).rejects.toThrow('Only the lines of one receipt');
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });
});
