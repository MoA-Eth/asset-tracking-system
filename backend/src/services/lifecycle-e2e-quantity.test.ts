import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for Prisma client
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  location: { findMany: vi.fn(async () => []), findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, siteName: 'Central Warehouse', isActive: true, roomNumber: 'ROOM-101', store: { name: 'Central Store' } })) },
  department: { findMany: vi.fn(), findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, nameEn: 'Irrigation Directorate', code: 'IRR', isActive: true })) },
  item: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  transactionApproval: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  auditLog: { create: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';
import { ItemStatus, AssetCategory } from '../types/asset-management';

const meta = (quantity: number, uom = 'SET', unitPrice = 2500) =>
  JSON.stringify({ quantity, uom, unitPrice, totalAmount: quantity * unitPrice });

const employees: Record<string, any> = {
  'EMP-ENC': { id: 'EMP-ENC', fullNameEn: 'Data Encoder', role: 'DATA_ENCODER' },
  'EMP-TL': { id: 'EMP-TL', fullNameEn: 'Team Leader', role: 'TEAM_LEADER' },
  'EMP-HEAD': { id: 'EMP-HEAD', fullNameEn: 'Dept Head', role: 'DEPARTMENT_HEAD' },
  'EMP-A': { id: 'EMP-A', fullNameEn: 'Bikila Desta', role: 'STAFF', departmentId: 'DEP-IRR' },
  'EMP-B': { id: 'EMP-B', fullNameEn: 'Almaz Ayana', role: 'STAFF', departmentId: 'DEP-AGR' },
  'EMP-C': { id: 'EMP-C', fullNameEn: 'Derartu Tulu', role: 'STAFF', departmentId: 'DEP-OPS' },
};

const store = () => StoreService.getInstance();

describe('Lifecycle E2E: Single batch item with quantity tracking across all states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.employee.findUnique.mockImplementation(async ({ where }: any) => employees[where.id] ?? null);
    db.department.findMany.mockResolvedValue([
      { id: 'DEP-IRR', code: 'IRR', nameEn: 'Irrigation', nameAm: 'መስኖ' },
      { id: 'DEP-AGR', code: 'AGR', nameEn: 'Agriculture', nameAm: 'ግብርና' },
      { id: 'DEP-OPS', code: 'OPS', nameEn: 'Operations', nameAm: 'ኦፕሬሽን' },
    ]);
    db.auditLog.create.mockResolvedValue({});
    db.auditLog.findMany.mockResolvedValue([]);
    db.transactionApproval.findMany.mockResolvedValue([]);
    db.transactionApproval.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id || 'appr-1',
      transactionType: 'STOCK_IN',
      itemId: 'item-batch-001',
      itemCode: 'MOA-2026-PUMP-01',
      status: 'APPROVED',
      ...data,
    }));
    db.item.update.mockResolvedValue({});
    db.item.create.mockResolvedValue({});
  });

  it('validates quantities, balances, and reports across registration, 2-stage approval, partial stock-outs, transfer, and return', async () => {
    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Registration of 10 units (Model 19 Stock-In)
    // ══════════════════════════════════════════════════════════════════════════
    const batchRegistration = {
      id: 'item-batch-001',
      itemCode: 'MOA-2026-PUMP-01',
      name: 'Solar Irrigation Pump Set',
      category: 'AGRI_MACHINERY',
      unitCostETB: 2500,
      status: ItemStatus.PENDING_STOCK_IN,
      condition: 'NEW',
      storeLocationId: 'LOC-CW',
      currentCustodianId: null,
      assignedDepartmentId: null,
      approvedById: null,
      registeredById: 'EMP-ENC',
      ifmisSlipNumber: 'M19-PUMP-2026',
      ifmisSlipDateGc: '2026-10-01',
      ifmisSlipDateEc: '2019-01-21',
      isHistoricalData: false,
      parentItemId: null,
      notes: meta(10),
    };

    // When queried while pending stock-in:
    db.item.findMany
      .mockResolvedValueOnce([batchRegistration]) // getItems
      .mockResolvedValueOnce([]); // no split children yet

    const [pendingItem] = await store().getItems();
    expect(pendingItem.balance).toEqual({
      total: 10,
      available: 0,
      issued: 0,
      pending: 10,
    });
    expect(pendingItem.status).toBe(ItemStatus.PENDING_STOCK_IN);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Two-Stage Approval (Stage 1 Endorse -> Stage 2 Authorize)
    // ══════════════════════════════════════════════════════════════════════════
    const stage1Approval = {
      id: 'appr-in-01',
      transactionType: 'STOCK_IN',
      itemId: 'item-batch-001',
      itemCode: 'MOA-2026-PUMP-01',
      ifmisSlipNumber: 'M19-PUMP-2026',
      status: 'PENDING',
      currentStage: 1,
      requestedById: 'EMP-ENC',
    };

    db.transactionApproval.findUnique.mockResolvedValueOnce(stage1Approval);
    db.transactionApproval.update.mockResolvedValueOnce({ ...stage1Approval, currentStage: 2 });
    db.item.update.mockResolvedValueOnce({});

    // Team Leader endorses
    const endorsed = await store().handleApproval({
      approvalId: 'appr-in-01',
      action: 'ENDORSE',
      reviewedById: 'EMP-TL',
      reviewRemarks: 'Verified physical pumps and specifications',
    });
    expect(endorsed.currentStage).toBe(2);

    // Department Head approves
    const stage2Approval = { ...stage1Approval, currentStage: 2 };
    db.transactionApproval.findUnique.mockResolvedValueOnce(stage2Approval);
    db.transactionApproval.update.mockResolvedValueOnce({ ...stage2Approval, status: 'APPROVED' });
    db.item.findUnique.mockResolvedValueOnce(batchRegistration);
    db.item.update.mockResolvedValueOnce({});

    await store().handleApproval({
      approvalId: 'appr-in-01',
      action: 'APPROVE',
      reviewedById: 'EMP-HEAD',
      reviewRemarks: 'Approved for store stock entry',
    });

    const inStoreItem = { ...batchRegistration, status: 'AVAILABLE', approvedById: 'EMP-HEAD' };

    // Verify balance after stock-in approval
    db.item.findMany
      .mockResolvedValueOnce([inStoreItem])
      .mockResolvedValueOnce([]); // no splits

    const [approvedItem] = await store().getItems();
    expect(approvedItem.balance).toEqual({
      total: 10,
      available: 10,
      issued: 0,
      pending: 0,
    });

    // Verify Executive Dashboard metrics at Phase 2:
    db.item.findMany.mockResolvedValueOnce([inStoreItem]);
    db.transactionApproval.count.mockResolvedValueOnce(0); // 0 pending
    const dashboardPhase2 = await store().getExecutiveDashboard();
    expect(dashboardPhase2.totalItems).toBe(10);
    expect(dashboardPhase2.availableCount).toBe(10);
    expect(dashboardPhase2.issuedCount).toBe(0);
    expect(dashboardPhase2.totalValuationETB).toBe(10 * 2500); // 25,000 ETB

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3: Partial Stock-Out (Issue 4 units to Bikila Desta on Model 22)
    // ══════════════════════════════════════════════════════════════════════════
    const stockOutApproval1 = {
      id: 'appr-so-01',
      transactionType: 'STOCK_OUT',
      itemId: 'item-batch-001',
      itemCode: 'MOA-2026-PUMP-01',
      ifmisSlipNumber: 'M22-001',
      recipientEmployeeId: 'EMP-A',
      targetDepartmentId: 'DEP-IRR',
      purposeOrRemarks: 'Oromia irrigation project',
      requestDetails: { quantity: 4, uom: 'SET' },
      status: 'PENDING',
      currentStage: 2,
    };

    db.transactionApproval.findUnique.mockResolvedValueOnce(stockOutApproval1);
    db.transactionApproval.update.mockResolvedValueOnce({ ...stockOutApproval1, status: 'APPROVED' });
    db.item.findUnique.mockResolvedValueOnce(inStoreItem);
    db.item.count.mockResolvedValueOnce(0); // first split

    await store().handleApproval({
      approvalId: 'appr-so-01',
      action: 'APPROVE',
      reviewedById: 'EMP-HEAD',
    });

    // Parent item updated: 6 units remaining in store
    const parentAfterIssue4 = {
      ...inStoreItem,
      notes: meta(6),
    };
    // Child item created: 4 units issued to Bikila Desta
    const childSplit1 = {
      id: 'item-batch-001-1',
      itemCode: 'MOA-2026-PUMP-01-1',
      name: 'Solar Irrigation Pump Set',
      category: 'AGRI_MACHINERY',
      unitCostETB: 2500,
      status: 'ISSUED',
      parentItemId: 'item-batch-001',
      currentCustodianId: 'EMP-A',
      assignedDepartmentId: 'DEP-IRR',
      notes: meta(4),
    };

    // Verify balance calculation after issuing 4 units
    db.item.findMany
      .mockResolvedValueOnce([parentAfterIssue4])
      .mockResolvedValueOnce([childSplit1]);

    const [itemAfterIssue4] = await store().getItems();
    expect(itemAfterIssue4.balance).toEqual({
      total: 10,
      available: 6,
      issued: 4,
      pending: 0,
    });

    // Verify Executive Dashboard metrics at Phase 3:
    db.item.findMany.mockResolvedValueOnce([parentAfterIssue4, childSplit1]);
    db.transactionApproval.count.mockResolvedValueOnce(0);
    const dashboardPhase3 = await store().getExecutiveDashboard();
    expect(dashboardPhase3.totalItems).toBe(10);
    expect(dashboardPhase3.availableCount).toBe(6);
    expect(dashboardPhase3.issuedCount).toBe(4);
    expect(dashboardPhase3.totalValuationETB).toBe(10 * 2500); // 25,000 ETB total preserved

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 4: Second Partial Stock-Out (Issue 2 more units to Almaz Ayana)
    // ══════════════════════════════════════════════════════════════════════════
    const stockOutApproval2 = {
      id: 'appr-so-02',
      transactionType: 'STOCK_OUT',
      itemId: 'item-batch-001',
      itemCode: 'MOA-2026-PUMP-01',
      ifmisSlipNumber: 'M22-002',
      recipientEmployeeId: 'EMP-B',
      targetDepartmentId: 'DEP-AGR',
      purposeOrRemarks: 'Field demo',
      requestDetails: { quantity: 2, uom: 'SET' },
      status: 'PENDING',
      currentStage: 2,
    };

    db.transactionApproval.findUnique.mockResolvedValueOnce(stockOutApproval2);
    db.transactionApproval.update.mockResolvedValueOnce({ ...stockOutApproval2, status: 'APPROVED' });
    db.item.findUnique.mockResolvedValueOnce(parentAfterIssue4);
    db.item.count.mockResolvedValueOnce(1); // 1 split already exists

    await store().handleApproval({
      approvalId: 'appr-so-02',
      action: 'APPROVE',
      reviewedById: 'EMP-HEAD',
    });

    // Parent item updated: 4 units remaining in store
    const parentAfterIssue2 = {
      ...inStoreItem,
      notes: meta(4),
    };
    // Second child item created: 2 units issued to Almaz Ayana
    const childSplit2 = {
      id: 'item-batch-001-2',
      itemCode: 'MOA-2026-PUMP-01-2',
      name: 'Solar Irrigation Pump Set',
      category: 'AGRI_MACHINERY',
      unitCostETB: 2500,
      status: 'ISSUED',
      parentItemId: 'item-batch-001',
      currentCustodianId: 'EMP-B',
      assignedDepartmentId: 'DEP-AGR',
      notes: meta(2),
    };

    // Verify balance calculation after issuing 4 + 2 = 6 units
    db.item.findMany
      .mockResolvedValueOnce([parentAfterIssue2])
      .mockResolvedValueOnce([childSplit1, childSplit2]);

    const [itemAfterIssue2] = await store().getItems();
    expect(itemAfterIssue2.balance).toEqual({
      total: 10,
      available: 4,
      issued: 6,
      pending: 0,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5: Internal Transfer (Model 20: 2 units from Almaz to Derartu)
    // ══════════════════════════════════════════════════════════════════════════
    const transferApproval = {
      id: 'appr-tr-01',
      transactionType: 'TRANSFER',
      itemId: 'item-batch-001-2',
      itemCode: 'MOA-2026-PUMP-01-2',
      ifmisSlipNumber: 'M20-001',
      recipientEmployeeId: 'EMP-C',
      targetDepartmentId: 'DEP-OPS',
      purposeOrRemarks: 'Reallocated to Operations Directorate',
      status: 'PENDING',
      currentStage: 2,
    };

    db.transactionApproval.findUnique.mockResolvedValueOnce(transferApproval);
    db.transactionApproval.update.mockResolvedValueOnce({ ...transferApproval, status: 'APPROVED' });
    db.item.findUnique.mockResolvedValueOnce(childSplit2);

    await store().handleApproval({
      approvalId: 'appr-tr-01',
      action: 'APPROVE',
      reviewedById: 'EMP-HEAD',
    });

    const childSplit2Transferred = {
      ...childSplit2,
      currentCustodianId: 'EMP-C',
      assignedDepartmentId: 'DEP-OPS',
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 6: Return to Store (Model 21: 2 units returned by Derartu to Store)
    // ══════════════════════════════════════════════════════════════════════════
    const returnApproval = {
      id: 'appr-ret-01',
      transactionType: 'RETURN',
      itemId: 'item-batch-001-2',
      itemCode: 'MOA-2026-PUMP-01-2',
      ifmisSlipNumber: 'M21-001',
      targetLocationId: 'LOC-CW',
      purposeOrRemarks: 'Project ended, returned in GOOD condition',
      requestDetails: { condition: 'GOOD' },
      status: 'PENDING',
      currentStage: 2,
    };

    db.transactionApproval.findUnique.mockResolvedValueOnce(returnApproval);
    db.transactionApproval.update.mockResolvedValueOnce({ ...returnApproval, status: 'APPROVED' });
    db.item.findUnique.mockResolvedValueOnce(childSplit2Transferred);

    await store().handleApproval({
      approvalId: 'appr-ret-01',
      action: 'APPROVE',
      reviewedById: 'EMP-HEAD',
    });

    // When returned, childSplit2 status transitions to AVAILABLE (in store)
    const childSplit2Returned = {
      ...childSplit2Transferred,
      status: 'AVAILABLE',
      currentCustodianId: null,
      assignedDepartmentId: null,
      condition: 'GOOD',
    };

    // Verify balance calculation at final state:
    // Root has 4 available; Split 1 has 4 issued; Split 2 has 2 available.
    // In store total = 4 + 2 = 6 available. Issued total = 4. Overall total = 10.
    db.item.findMany
      .mockResolvedValueOnce([parentAfterIssue2])
      .mockResolvedValueOnce([childSplit1, childSplit2Returned]);

    const [finalItemBalance] = await store().getItems();
    expect(finalItemBalance.balance).toEqual({
      total: 10,
      available: 6,
      issued: 4,
      pending: 0,
    });

    // Verify Final Executive Dashboard metrics:
    db.item.findMany.mockResolvedValueOnce([parentAfterIssue2, childSplit1, childSplit2Returned]);
    db.transactionApproval.count.mockResolvedValueOnce(0);
    const finalDashboard = await store().getExecutiveDashboard();
    expect(finalDashboard.totalItems).toBe(10);
    expect(finalDashboard.availableCount).toBe(6);
    expect(finalDashboard.issuedCount).toBe(4);
    expect(finalDashboard.totalValuationETB).toBe(10 * 2500); // 25,000 ETB
  });
});
