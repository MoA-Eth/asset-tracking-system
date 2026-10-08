import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: 'Store-01', store: { name: 'Kality' } })) },
  item: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { applySystemSettings, SLIP_REQUIRED_MESSAGE } from './settings.service';

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
  approvedById: 'EMP-HEAD-OLD',
  parentItemId: null,
  registeredById: 'EMP-ENC',
  ifmisSlipNumber: 'GRN-1',
  ifmisSlipDateGc: '2026-01-10',
  ifmisSlipDateEc: '2018-05-02',
  isHistoricalData: false,
  notes: JSON.stringify({ quantity: 10, uom: 'EA' }),
};

const request = {
  itemId: 'item-1',
  disposalNo: 'DSP-0001',
  disposalDateGc: '2026-10-01',
  reason: 'Damaged beyond repair',
  description: 'Broken frames after the office flood',
  condition: 'DAMAGED',
  registeredById: 'EMP-ENC',
};

const pendingDisposal = (details: Record<string, unknown>, stage = 2) => ({
  id: 'appr-1',
  transactionType: 'DISPOSAL',
  itemId: 'item-1',
  itemCode: chairs.itemCode,
  itemName: chairs.name,
  ifmisSlipNumber: 'DSP-0001',
  requestedById: 'EMP-ENC',
  purposeOrRemarks: 'Disposal: Damaged beyond repair',
  requestDetails: { uom: 'EA', reason: 'Damaged beyond repair', condition: 'DAMAGED', ...details },
  status: 'PENDING',
  currentStage: stage,
});

const store = () => StoreService.getInstance();
const roleOf = (id: string) => (id === 'EMP-HEAD' ? 'DEPARTMENT_HEAD' : id === 'EMP-TL' ? 'TEAM_LEADER' : 'DATA_ENCODER');

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({});
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, fullNameEn: `Employee ${where.id}`, role: roleOf(where.id) }));
  db.item.findUnique.mockResolvedValue({ ...chairs });
  db.item.update.mockResolvedValue({});
  db.item.create.mockResolvedValue({});
  db.item.count.mockResolvedValue(0);
  db.transactionApproval.findFirst.mockResolvedValue(null);
  db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'appr-1', currentStage: 1, ...data }));
  db.auditLog.create.mockResolvedValue({});
});

describe('requesting a disposal', () => {
  it('opens a DISPOSAL approval and holds the item PENDING_DISPOSAL, still in store', async () => {
    const approval = await store().registerDisposal({ ...request, quantity: 3 } as any);

    expect(approval.transactionType).toBe('DISPOSAL');
    expect(approval.status).toBe('PENDING');
    const created = db.transactionApproval.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ transactionType: 'DISPOSAL', ifmisSlipNumber: 'DSP-0001', ifmisSlipDateGc: '2026-10-01', requestedById: 'EMP-ENC' });
    // Book value defaults to unit price × units; details left blank aren't stored
    expect(created.requestDetails).toEqual({
      quantity: 3, uom: 'EA', reason: 'Damaged beyond repair', description: 'Broken frames after the office flood', condition: 'DAMAGED', bookValue: 4500,
    });
    const update = db.item.update.mock.calls[0][0].data;
    expect(update.status).toBe('PENDING_DISPOSAL');
    expect(update.history.create).toMatchObject({ action: 'DISPOSAL_REQUESTED' });
    expect(update.history.create.notes).toMatch(/^Partial disposal: 3 of 10 EA\./);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'REGISTER_DISPOSAL', entityType: 'DISPOSAL' });
  });

  it('disposes of every unit when no quantity is given, and keeps a typed book value', async () => {
    await store().registerDisposal({ ...request, bookValue: 2000, recipientName: 'Kality School', proceedsETB: 0 } as any);
    expect(db.transactionApproval.create.mock.calls[0][0].data.requestDetails).toMatchObject({
      quantity: 10, bookValue: 2000, recipientName: 'Kality School', proceedsETB: 0,
    });
  });

  it.each(['ISSUED', 'PENDING_STOCK_OUT', 'PENDING_DISPOSAL', 'DISPOSED', 'REJECTED', 'PENDING_STOCK_IN'])(
    'refuses an item that is %s',
    async (status) => {
      db.item.findUnique.mockResolvedValue({ ...chairs, status });
      await expect(store().registerDisposal(request as any)).rejects.toMatchObject({ statusCode: 409 });
      expect(db.transactionApproval.create).not.toHaveBeenCalled();
    }
  );

  it('asks for issued items to be returned first', async () => {
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'ISSUED' });
    await expect(store().registerDisposal(request as any)).rejects.toThrow(/return it to store first/);
  });

  it('refuses while another request is pending for the item', async () => {
    db.transactionApproval.findFirst.mockResolvedValue({ transactionType: 'STOCK_OUT', ifmisSlipNumber: 'M22-1' });
    await expect(store().registerDisposal(request as any)).rejects.toThrow(/already has a pending STOCK_OUT/);
  });

  it.each([
    [{ disposalNo: ' ' }, 'The disposal reference number is required.'],
    [{ reason: '' }, 'The reason for disposal is required.'],
    [{ quantity: 0 }, 'Quantity must be a whole number from 1 to 10 (EA in store).'],
    [{ quantity: 11 }, 'Quantity must be a whole number from 1 to 10 (EA in store).'],
    [{ quantity: 2.5 }, 'Quantity must be a whole number from 1 to 10 (EA in store).'],
    [{ condition: 'BROKEN' }, 'Choose a valid item condition.'],
    [{ bookValue: -1 }, 'Book value must be a number, zero or more.'],
    [{ proceedsETB: 'abc' }, 'Proceeds must be a number, zero or more.'],
    [{ disposalDateGc: '2999-01-01' }, "The disposal date can't be in the future."],
  ])('refuses %o', async (change, message) => {
    await expect(store().registerDisposal({ ...request, ...change } as any)).rejects.toMatchObject({ statusCode: 400, message });
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it('needs a supporting document when the slip policy requires one', async () => {
    applySystemSettings({ slipAttachmentPolicy: 'REQUIRED' } as any);
    await expect(store().registerDisposal(request as any)).rejects.toMatchObject({ statusCode: 400, message: SLIP_REQUIRED_MESSAGE });
    await expect(store().registerDisposal({ ...request, ifmisSlipAttachmentUrl: '/api/uploads/slips/a.pdf' } as any)).resolves.toBeDefined();
  });
});

describe('correcting a disposal request', () => {
  it('saves the corrections while it waits for Stage 1 and records what changed', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...pendingDisposal({ quantity: 3, bookValue: 4500 }, 1), ifmisSlipDateGc: '2026-10-01' });
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...pendingDisposal({}, 1), ...data }));

    await store().updateDisposal('appr-1', { ...request, quantity: 4, bookValue: 6000 } as any, 'EMP-ENC');

    expect(db.transactionApproval.update.mock.calls[0][0].data.requestDetails).toMatchObject({ quantity: 4, bookValue: 6000 });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'EDIT_DISPOSAL', entityType: 'DISPOSAL' });
    expect(audit.details).toMatch(/quantity 3 → 4/);
  });

  it('is locked once a Team Leader has endorsed it', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingDisposal({ quantity: 3 }, 2));
    await expect(store().updateDisposal('appr-1', request as any, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('deciding on a disposal', () => {
  beforeEach(() => {
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...pendingDisposal({}), ...data }));
  });

  it('lets a Team Leader endorse it to Stage 2', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingDisposal({ quantity: 10 }, 1));
    await store().handleApproval({ approvalId: 'appr-1', action: 'ENDORSE', reviewedById: 'EMP-TL' } as any);
    expect(db.transactionApproval.update.mock.calls[0][0].data.currentStage).toBe(2);
    expect(db.item.update.mock.calls[0][0].data.history.create.action).toBe('STAGE_1_ENDORSED_DISPOSAL');
  });

  it('disposes of the whole record on approval', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingDisposal({ quantity: 10, recipientName: 'Kality School' }));
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_DISPOSAL' });

    await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

    const data = db.item.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'DISPOSED', condition: 'DAMAGED', currentCustodianId: null, assignedDepartmentId: null, approvedById: 'EMP-HEAD' });
    expect(data.history.create).toMatchObject({ action: 'DISPOSAL_APPROVED', toEntity: 'Disposed: to Kality School' });
    expect(db.item.create).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('APPROVE_DISPOSAL');
  });

  it('splits off the disposed units when only part of the record is disposed of', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingDisposal({ quantity: 3 }));
    db.item.findUnique.mockImplementation(async ({ where }: any) => (where.id === 'item-1' ? { ...chairs, status: 'PENDING_DISPOSAL' } : null));

    const approval = await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

    // The rest stays in store on the original record
    const parent = db.item.update.mock.calls[0][0].data;
    expect(parent.status).toBe('AVAILABLE');
    expect(JSON.parse(parent.notes)).toMatchObject({ quantity: 7, totalAmount: 10500 });
    expect(parent).not.toHaveProperty('condition');
    expect(parent.history.create.notes).toMatch(/Disposed of 3 of 10 EA as MOA-FUR-2026-0001-1; 7 EA remain in store/);
    // The disposed units get their own record
    const child = db.item.create.mock.calls[0][0].data;
    expect(child).toMatchObject({ itemCode: 'MOA-FUR-2026-0001-1', status: 'DISPOSED', condition: 'DAMAGED', parentItemId: 'item-1', currentCustodianId: null });
    expect(JSON.parse(child.notes)).toMatchObject({ quantity: 3 });
    expect(child.history.create.action).toBe('DISPOSAL_APPROVED');
    expect(approval.requestDetails?.disposedItemCode).toBe('MOA-FUR-2026-0001-1');
  });

  it('puts the item back in store when the disposal is rejected', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(pendingDisposal({ quantity: 3 }));
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_DISPOSAL' });

    await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Repair it instead' } as any);

    const data = db.item.update.mock.calls[0][0].data;
    expect(data.status).toBe('AVAILABLE');
    expect(data.history.create).toMatchObject({ action: 'DISPOSAL_REJECTED' });
    expect(data.history.create.notes).toMatch(/Repair it instead/);
    expect(db.item.create).not.toHaveBeenCalled();
  });

  it("doesn't let the requester decide their own disposal", async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...pendingDisposal({ quantity: 3 }), requestedById: 'EMP-HEAD' });
    await expect(store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('marks a rejected receipt REJECTED, not DISPOSED', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...pendingDisposal({}), transactionType: 'STOCK_IN' });
    db.item.findUnique.mockResolvedValue({ ...chairs, status: 'PENDING_STOCK_IN' });
    await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong supplier' } as any);
    expect(db.item.update.mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('refuses a request of an unknown type instead of treating it as an issue', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...pendingDisposal({}), transactionType: 'SOMETHING_ELSE' });
    db.item.findUnique.mockResolvedValue({ ...chairs });
    await expect(store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(db.item.update).not.toHaveBeenCalled();
  });
});
