import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreService } from './store.service';
import { UserRole } from '../types/asset-management';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  item: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  transactionApproval: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  location: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const meta = (qty = 10, uom = 'EA') => JSON.stringify({ quantity: qty, uom });

describe('Voiding Approved Requests with Inventory Reversal', () => {
  const admin = { id: 'admin-1', fullNameEn: 'Abebe Admin', role: UserRole.SYSTEM_ADMIN, isActive: true };
  const deptHead = { id: 'head-1', fullNameEn: 'Getaneh Head', role: UserRole.DEPARTMENT_HEAD, isActive: true };
  const encoder = { id: 'enc-1', fullNameEn: 'Chala Encoder', role: UserRole.DATA_ENCODER, isActive: true };
  let currentTargetApprovals: any[] = [];

  beforeEach(() => {
    vi.resetAllMocks();
    currentTargetApprovals = [];
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.location.findUnique.mockResolvedValue({ id: 'loc-1', siteName: 'Main Store', roomNumber: 'Room 101' });
    db.item.findFirst.mockResolvedValue(null);
    db.item.findMany.mockResolvedValue([]);
    db.transactionApproval.findFirst.mockResolvedValue(null);
    db.transactionApproval.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.id?.in) return currentTargetApprovals;
      return [];
    });
    db.item.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  const store = () => StoreService.getInstance();

  it('refuses to void if reason is shorter than 10 characters', async () => {
    db.employee.findUnique.mockResolvedValue(admin);
    await expect(
      store().voidApprovedRequests({ approvalIds: ['appr-1'], reason: 'typo' }, admin.id)
    ).rejects.toThrow(/at least 10 characters/);
  });

  it('refuses to void if user has no void permission (e.g. Data Encoder)', async () => {
    db.employee.findUnique.mockResolvedValue(encoder);
    await expect(
      store().voidApprovedRequests({ approvalIds: ['appr-1'], reason: 'Voucher was entered with wrong quantity' }, encoder.id)
    ).rejects.toThrow(/Your role does not permit voiding/);
  });

  it('refuses to void a request that is not APPROVED', async () => {
    db.employee.findUnique.mockResolvedValue(admin);
    db.transactionApproval.findMany.mockResolvedValue([
      { id: 'appr-1', status: 'PENDING', transactionType: 'STOCK_OUT', itemId: 'item-1', ifmisSlipNumber: 'M22-101' },
    ]);
    await expect(
      store().voidApprovedRequests({ approvalIds: ['appr-1'], reason: 'Voucher was entered with wrong quantity' }, admin.id)
    ).rejects.toThrow(/Only approved requests can be voided/);
  });

  it('voids an approved single-item Model 22 issue and restores asset to AVAILABLE', async () => {
    db.employee.findUnique.mockResolvedValue(deptHead);
    const item = {
      id: 'item-1',
      itemCode: 'MOA-IT-001',
      status: 'ISSUED',
      storeLocationId: 'loc-1',
      notes: meta(1),
      unitCostETB: 5000,
      currentCustodianId: 'emp-2',
      assignedDepartmentId: 'dept-1',
    };
    const approval = {
      id: 'appr-1',
      status: 'APPROVED',
      transactionType: 'STOCK_OUT',
      itemId: 'item-1',
      itemCode: 'MOA-IT-001',
      ifmisSlipNumber: 'M22-101',
      requestDetails: {},
      item,
    };
    currentTargetApprovals = [approval];
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({
      ...approval,
      ...data,
      status: data.status,
      requestDetails: data.requestDetails,
    }));

    const result = await store().voidApprovedRequests(
      { approvalIds: ['appr-1'], reason: 'Duplicate voucher entered by mistake' },
      deptHead.id
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('VOIDED');
    expect(result[0].voidDetails?.voided).toBe(true);
    expect(result[0].voidDetails?.voidReason).toBe('Duplicate voucher entered by mistake');

    // Item restored to AVAILABLE in store with custodian cleared
    expect(db.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          status: 'AVAILABLE',
          currentCustodianId: null,
          assignedDepartmentId: null,
        }),
      })
    );

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'VOID_STOCK_OUT',
          ifmisSlipNumber: 'M22-101',
        }),
      })
    );
  });

  it('voids an approved partial Model 22 issue and merges split units back into parent batch', async () => {
    db.employee.findUnique.mockResolvedValue(admin);
    const parentItem = {
      id: 'parent-1',
      itemCode: 'MOA-CONS-100',
      status: 'AVAILABLE',
      storeLocationId: 'loc-1',
      notes: meta(60, 'KG'), // 60 remaining in store
      unitCostETB: 50,
    };
    const splitItem = {
      id: 'split-1',
      itemCode: 'MOA-CONS-100-1',
      status: 'ISSUED',
      storeLocationId: 'loc-1',
      notes: meta(40, 'KG'), // 40 issued
      unitCostETB: 50,
    };
    const approval = {
      id: 'appr-split',
      status: 'APPROVED',
      transactionType: 'STOCK_OUT',
      itemId: 'parent-1',
      itemCode: 'MOA-CONS-100',
      ifmisSlipNumber: 'M22-202',
      requestDetails: { issuedItemCode: 'MOA-CONS-100-1', quantity: 40 },
      item: parentItem,
    };

    currentTargetApprovals = [approval];
    db.item.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.itemCode === 'MOA-CONS-100-1') return splitItem;
      return null;
    });
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({
      ...approval,
      ...data,
      status: data.status,
      requestDetails: data.requestDetails,
    }));

    const result = await store().voidApprovedRequests(
      { approvalIds: ['appr-split'], reason: 'Warehouse handover cancelled before dispatch' },
      admin.id
    );

    expect(result[0].status).toBe('VOIDED');

    // Check parent batch updated to restored 100 KG (60 + 40)
    expect(db.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'parent-1' },
        data: expect.objectContaining({
          status: 'AVAILABLE',
          notes: expect.stringContaining('"quantity":100'),
        }),
      })
    );

    // Split item cancelled/retired
    expect(db.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'split-1' },
        data: expect.objectContaining({ status: 'REJECTED' }),
      })
    );
  });

  it('refuses to void Model 19 receipt if downstream issues have already occurred', async () => {
    db.employee.findUnique.mockResolvedValue(admin);
    const item = {
      id: 'item-rec',
      itemCode: 'MOA-REC-01',
      status: 'AVAILABLE',
      storeLocationId: 'loc-1',
      notes: meta(100),
      unitCostETB: 200,
    };
    const approval = {
      id: 'appr-rec',
      status: 'APPROVED',
      transactionType: 'STOCK_IN',
      itemId: 'item-rec',
      itemCode: 'MOA-REC-01',
      ifmisSlipNumber: 'M19-555',
      requestDetails: {},
      item,
    };

    currentTargetApprovals = [approval];
    db.transactionApproval.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.id?.in) return [approval];
      return [{ id: 'appr-issue-later', transactionType: 'STOCK_OUT', status: 'APPROVED', ifmisSlipNumber: 'M22-101' }];
    });

    await expect(
      store().voidApprovedRequests(
        { approvalIds: ['appr-rec'], reason: 'Supplier delivery cancelled after signing' },
        admin.id
      )
    ).rejects.toThrow(/active subsequent transactions must be reversed first: Model 22 #M22-101/);
  });

  it('voids clean Model 19 receipt and marks item as CANCELLED', async () => {
    db.employee.findUnique.mockResolvedValue(admin);
    const item = {
      id: 'item-rec-clean',
      itemCode: 'MOA-REC-02',
      status: 'AVAILABLE',
      storeLocationId: 'loc-1',
      notes: meta(50),
      unitCostETB: 200,
    };
    const approval = {
      id: 'appr-rec-clean',
      status: 'APPROVED',
      transactionType: 'STOCK_IN',
      itemId: 'item-rec-clean',
      itemCode: 'MOA-REC-02',
      ifmisSlipNumber: 'M19-777',
      requestDetails: {},
      item,
    };

    currentTargetApprovals = [approval];
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({
      ...approval,
      ...data,
      status: data.status,
      requestDetails: data.requestDetails,
    }));

    const result = await store().voidApprovedRequests(
      { approvalIds: ['appr-rec-clean'], reason: 'Incorrect vendor shipment rejected at store' },
      admin.id
    );

    expect(result[0].status).toBe('VOIDED');
    expect(db.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-rec-clean' },
        data: expect.objectContaining({ status: 'REJECTED' }),
      })
    );
  });
});
