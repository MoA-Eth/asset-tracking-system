import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  item: { findUnique: vi.fn(), update: vi.fn() },
  transactionApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
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
    db.employee.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      fullNameEn: `Employee ${where.id}`,
      role: 'DATA_ENCODER',
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

    it('keeps the current custody and restores the status on rejection', async () => {
      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD' } as any);

      expect(itemUpdateData()).toMatchObject({
        status: 'ISSUED',
        currentCustodianId: 'EMP-A',
        assignedDepartmentId: 'DEP-01',
        storeLocationId: 'LOC-01',
      });
    });

    it('restores AVAILABLE when a store item without a custodian is rejected', async () => {
      db.item.findUnique.mockResolvedValue({ ...issuedItem, status: 'UNDER_TRANSFER', currentCustodianId: null });

      await store().handleApproval({ approvalId: 'appr-1', action: 'REJECT', reviewedById: 'EMP-HEAD' } as any);

      expect(itemUpdateData().status).toBe('AVAILABLE');
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
