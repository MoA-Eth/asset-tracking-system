import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  // Any store or department that is picked exists and is active
  location: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, siteName: 'Store', isActive: true })) },
  department: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, nameEn: 'Directorate', isActive: true })) },
  item: { findUnique: vi.fn(), update: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  // A decision runs in one transaction: the stand-in simply runs it against the same client
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const issuedItem = {
  id: 'item-1',
  itemCode: 'MOA-IT-2026-0001',
  name: 'Laptop',
  status: 'ISSUED',
  currentCustodianId: 'EMP-A',
  assignedDepartmentId: 'DEP-01',
  storeLocationId: 'LOC-01',
  approvedById: null,
};

const transferPayload = {
  itemId: 'item-1',
  toEmployeeId: 'EMP-B',
  toDepartmentId: 'DEP-02',
  toLocationId: 'LOC-02',
  reason: 'Custody reassignment',
  performedById: 'EMP-ENC',
  model21No: 'M21-0001',
};

const pendingTransfer = {
  id: 'appr-1',
  transactionType: 'TRANSFER',
  itemId: 'item-1',
  itemCode: 'MOA-IT-2026-0001',
  itemName: 'Laptop',
  ifmisSlipNumber: 'M21-0001',
  recipientEmployeeId: 'EMP-B',
  targetDepartmentId: 'DEP-02',
  targetLocationId: 'LOC-02',
  purposeOrRemarks: 'Transfer from A to B',
  status: 'PENDING',
  currentStage: 2,
};

const store = () => StoreService.getInstance();
const itemUpdateData = () => db.item.update.mock.calls[0][0].data;

describe('Asset Transfer approval workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.employee.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      fullNameEn: `Employee ${where.id}`,
      role: where.id === 'EMP-HEAD' ? 'DEPARTMENT_HEAD' : 'DATA_ENCODER',
    }));
    db.item.findUnique.mockResolvedValue({ ...issuedItem });
    db.item.update.mockResolvedValue({});
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.create.mockImplementation(async ({ data }: any) => ({ id: 'appr-1', currentStage: 1, ...data }));
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...pendingTransfer, ...data }));
    db.auditLog.create.mockResolvedValue({});
  });

  describe('submitting a transfer', () => {
    it('opens a Stage 1 TRANSFER approval and holds the item UNDER_TRANSFER without moving it', async () => {
      const approval = await store().transferItem(transferPayload as any);

      expect(approval.transactionType).toBe('TRANSFER');
      expect(approval.status).toBe('PENDING');
      expect(db.transactionApproval.create.mock.calls[0][0].data).toMatchObject({
        recipientEmployeeId: 'EMP-B',
        targetDepartmentId: 'DEP-02',
        targetLocationId: 'LOC-02',
        ifmisSlipNumber: 'M21-0001',
      });

      const data = itemUpdateData();
      expect(data.status).toBe('UNDER_TRANSFER');
      expect(data).not.toHaveProperty('currentCustodianId');
      expect(data).not.toHaveProperty('assignedDepartmentId');
      expect(data).not.toHaveProperty('storeLocationId');
    });

    it('refuses a transfer to the person who already holds the item', async () => {
      await expect(store().transferItem({ ...transferPayload, toEmployeeId: 'EMP-A', toLocationId: undefined } as any)).rejects.toMatchObject({
        statusCode: 400,
        message: 'This person already holds the item. Choose a different custodian.',
      });
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('refuses a transfer that names no new custodian and no new location', async () => {
      await expect(store().transferItem({ ...transferPayload, toEmployeeId: '', toLocationId: '' } as any)).rejects.toMatchObject({ statusCode: 400 });
      await expect(store().transferItem({ ...transferPayload, toEmployeeId: '', toLocationId: 'LOC-01' } as any)).rejects.toMatchObject({ statusCode: 400 });
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('refuses a transfer without a reason', async () => {
      await expect(store().transferItem({ ...transferPayload, reason: '   ' } as any)).rejects.toMatchObject({ statusCode: 400, message: 'Reason for transfer is required.' });
    });

    it('rejects a transfer while another request is pending for the item', async () => {
      db.transactionApproval.findFirst.mockResolvedValue({ transactionType: 'RETURN', ifmisSlipNumber: 'M21-9' });

      await expect(store().transferItem(transferPayload as any)).rejects.toThrow(/already has a pending RETURN/);
      expect(db.transactionApproval.create).not.toHaveBeenCalled();
    });

    it.each(['UNDER_TRANSFER', 'PENDING_STOCK_IN', 'PENDING_STOCK_OUT', 'DISPOSED'])(
      'rejects a transfer when the item is %s',
      async (status) => {
        db.item.findUnique.mockResolvedValue({ ...issuedItem, status });
        await expect(store().transferItem(transferPayload as any)).rejects.toThrow(/cannot be transferred/);
      }
    );

    it('requires the Model 21 voucher number', async () => {
      await expect(store().transferItem({ ...transferPayload, model21No: '  ' } as any)).rejects.toThrow(/Model 21/);
    });
  });

  describe('Stage 2 decision on a transfer', () => {
    beforeEach(() => {
      db.transactionApproval.findUnique.mockResolvedValue({ ...pendingTransfer });
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'UNDER_TRANSFER' });
    });

    it('applies the new custodian, department and location on approval', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'APPROVE', reviewedById: 'EMP-HEAD' } as any);

      expect(itemUpdateData()).toMatchObject({
        status: 'ISSUED',
        currentCustodianId: 'EMP-B',
        assignedDepartmentId: 'DEP-02',
        storeLocationId: 'LOC-02',
      });
    });

    it.each(['DATA_ENCODER', 'TEAM_LEADER', 'MANAGER', 'SYSTEM_ADMIN'])('blocks %s from approving or rejecting Stage 2', async (role) => {
      db.employee.findUnique.mockResolvedValue({ id: 'wrong-officer', role });
      for (const action of ['APPROVE', 'REJECT']) {
        await expect(store().handleApproval({ approvalId: 'appr-1', action, reviewedById: 'wrong-officer' } as any)).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(db.transactionApproval.update).not.toHaveBeenCalled();
    });

    it('blocks a Department Head from endorsing or rejecting Stage 1', async () => {
      db.transactionApproval.findUnique.mockResolvedValue({ ...pendingTransfer, currentStage: 1 });
      for (const action of ['ENDORSE', 'REJECT']) {
        await expect(store().handleApproval({ approvalId: 'appr-1', action, reviewedById: 'EMP-HEAD' } as any)).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(db.transactionApproval.update).not.toHaveBeenCalled();
    });

    it('keeps the current custody and restores the status on rejection', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any);

      expect(itemUpdateData()).toMatchObject({
        status: 'ISSUED',
        currentCustodianId: 'EMP-A',
        assignedDepartmentId: 'DEP-01',
        storeLocationId: 'LOC-01',
      });
    });

    it.each([undefined, '', '   '])('refuses a rejection without a reason (%j)', async (reviewRemarks) => {
      await expect(store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks } as any)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Give a reason for rejecting, so the requester knows what to correct.',
      });
      expect(db.transactionApproval.update).not.toHaveBeenCalled();
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('saves the reason, and the history names the stage and the person who rejected', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: '  Wrong recipient  ' } as any);

      expect(db.transactionApproval.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', reviewRemarks: 'Wrong recipient', reviewedById: 'EMP-HEAD' });
      expect(JSON.stringify(db.item.update.mock.calls[0][0])).toContain('Rejected at Stage 2 (Department Head) by Employee EMP-HEAD: Wrong recipient');
    });

    it('names the Team Leader when the rejection happens at Stage 1', async () => {
      db.transactionApproval.findUnique.mockResolvedValue({ ...pendingTransfer, currentStage: 1 });
      db.employee.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, fullNameEn: 'Employee ' + where.id, role: where.id === 'EMP-TL' ? 'TEAM_LEADER' : 'DATA_ENCODER' }));

      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-TL', reviewRemarks: 'Slip number is missing' } as any);

      expect(JSON.stringify(db.item.update.mock.calls[0][0])).toContain('Rejected at Stage 1 (Team Leader) by Employee EMP-TL: Slip number is missing');
    });

    it.each([123, { text: 'x' }, ['x'], true])('refuses remarks that are not text (%j)', async (reviewRemarks) => {
      await expect(store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks } as any)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Remarks must be text.',
      });
      expect(db.transactionApproval.update).not.toHaveBeenCalled();
    });

    it('refuses remarks longer than 500 characters', async () => {
      await expect(
        store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'x'.repeat(501) } as any),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it.each(['APPROVED', 'REJECTED'])('refuses to decide a request that is already %s (409)', async (status) => {
      db.transactionApproval.findUnique.mockResolvedValue({ ...pendingTransfer, status });
      await expect(store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Late' } as any)).rejects.toMatchObject({ statusCode: 409 });
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('answers 404 when the request does not exist', async () => {
      db.transactionApproval.findUnique.mockResolvedValue(null);
      await expect(store().handleApproval({ approvalId: 'gone', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'x' } as any)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('only decides a request that is still pending at the stage the reviewer saw', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any);
      expect(db.transactionApproval.update.mock.calls[0][0].where).toEqual({ id: 'appr-1', status: 'PENDING', currentStage: 2 });
    });

    it('refuses the second of two decisions made at the same moment, and leaves the item alone', async () => {
      db.transactionApproval.update.mockRejectedValue(Object.assign(new Error('Record to update not found.'), { code: 'P2025' }));
      await expect(store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Someone else has just acted on this request. Refresh the list.',
      });
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('saves the request, the item and the audit entry in one transaction', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.transactionApproval.update).toHaveBeenCalledTimes(1);
      expect(db.item.update).toHaveBeenCalledTimes(1);
      expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('fails as a whole when the item cannot be saved, so the request is not left decided on its own', async () => {
      db.item.update.mockRejectedValue(new Error('connection lost'));
      await expect(store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any)).rejects.toThrow('connection lost');
      // The error leaves the transaction, which is what makes the database undo the request update
      await expect(db.$transaction.mock.results[0].value).rejects.toThrow('connection lost');
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it('restores AVAILABLE when a store item without a custodian is rejected', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'UNDER_TRANSFER', currentCustodianId: null });

      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD', reviewRemarks: 'Wrong recipient' } as any);

      expect(itemUpdateData().status).toBe('AVAILABLE');
    });
  });

  describe('the order of an asset: received, issued, then transferred or returned', () => {
    it('refuses to transfer an item that is still in store: it must be issued first', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'AVAILABLE', currentCustodianId: null });
      await expect(store().transferItem(transferPayload as any)).rejects.toMatchObject({
        statusCode: 409,
        message: 'MOA-IT-2026-0001 is in store. Issue it first (Model 22); a transfer moves an issued item from one holder to another.',
      });
      expect(db.transactionApproval.create).not.toHaveBeenCalled();
      expect(db.item.update).not.toHaveBeenCalled();
    });

    it('refuses to return an item that is already in store', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'AVAILABLE', currentCustodianId: null });
      await expect(
        store().registerReturn({ itemId: 'item-1', ifmisSlipNumber: 'M21-3', ifmisSlipDateGc: '2026-10-01', returnReason: 'Done', condition: 'GOOD' } as any),
      ).rejects.toMatchObject({ statusCode: 409, message: 'MOA-IT-2026-0001 is already in store. Only an issued item can be returned.' });
      expect(db.transactionApproval.create).not.toHaveBeenCalled();
    });

    it('still transfers and returns an issued item', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem });
      await expect(store().transferItem(transferPayload as any)).resolves.toBeTruthy();
    });
  });

  describe('other requests respect a pending transfer', () => {
    it('blocks Stock-Out while another request is pending', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'AVAILABLE', currentCustodianId: null });
      db.transactionApproval.findFirst.mockResolvedValue({ transactionType: 'RETURN', ifmisSlipNumber: 'M21-9' });

      await expect(
        store().registerStockOut({ itemId: 'item-1', ifmisSlipNumber: 'M22-1', purpose: 'Issue' } as any)
      ).rejects.toThrow(/already has a pending/);
    });

    it('blocks Return while the item is UNDER_TRANSFER', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'UNDER_TRANSFER' });

      await expect(
        store().registerReturn({ itemId: 'item-1', ifmisSlipNumber: 'M21-2', returnReason: 'Done', condition: 'GOOD' } as any)
      ).rejects.toThrow(/cannot be returned/);
    });
  });
});
