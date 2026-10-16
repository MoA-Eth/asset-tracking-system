import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalStatus,
  UserRole,
} from '../types/asset-management';
import {
  calculateApprovalTotalAmount,
  HIGH_VALUE_APPROVAL_THRESHOLD,
  StoreService,
} from './store.service';
import { ForbiddenError } from '../errors/app-error';

describe('Chief Director & 10M High-Value Approval Workflow', () => {
  it('defines the statutory high-value threshold at 10,000,000 ETB', () => {
    expect(HIGH_VALUE_APPROVAL_THRESHOLD).toBe(10_000_000);
  });

  it('calculates approval total amount accurately from line items and notes', () => {
    // 1. Direct unit cost * quantity
    const raw1 = {
      item: { notes: JSON.stringify({ quantity: 5, uom: 'SET' }), unitCostETB: 3_000_000 },
    };
    expect(calculateApprovalTotalAmount(raw1)).toBe(15_000_000);

    // 2. Explicit requestDetails totalAmount
    const raw2 = {
      requestDetails: { totalAmount: 12_500_000 },
      item: { unitCostETB: 100 },
    };
    expect(calculateApprovalTotalAmount(raw2)).toBe(12_500_000);

    // 3. Fallback to bookValue for transfer/return
    const raw3 = {
      requestDetails: { bookValue: 10_500_000 },
    };
    expect(calculateApprovalTotalAmount(raw3)).toBe(10_500_000);

    // 4. Standard below threshold
    const raw4 = {
      item: { notes: JSON.stringify({ quantity: 2, uom: 'EA' }), unitCostETB: 500_000 },
    };
    expect(calculateApprovalTotalAmount(raw4)).toBe(1_000_000);
  });

  it('refuses Department Head authorization when transaction exceeds 10,000,000 ETB', async () => {
    const db: any = {
      transactionApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-high-1',
          status: 'PENDING',
          currentStage: 2,
          itemId: 'item-machinery-1',
          itemCode: 'MOA-MACH-001',
          ifmisSlipNumber: 'M22-HIGH-01',
        }),
      },
      employee: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'EMP-HEAD',
          fullNameEn: 'Abebe Head',
          role: UserRole.DEPARTMENT_HEAD,
        }),
      },
      item: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'item-machinery-1',
          itemCode: 'MOA-MACH-001',
          unitCostETB: 12_000_000,
          notes: JSON.stringify({ quantity: 1, uom: 'UNIT' }),
        }),
      },
    };

    const store = new (StoreService as any)();
    await expect(
      (store as any).applyDecision(
        {
          approvalId: 'appr-high-1',
          action: 'APPROVE',
          reviewedById: 'EMP-HEAD',
          reviewRemarks: 'Department Head trying to approve high-value equipment',
        },
        db
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows Chief Director authorization when transaction exceeds 10,000,000 ETB', async () => {
    const approval = {
      id: 'appr-high-2',
      status: 'PENDING',
      currentStage: 2,
      itemId: 'item-machinery-2',
      itemCode: 'MOA-MACH-002',
      ifmisSlipNumber: 'M22-HIGH-02',
      transactionType: 'STOCK_OUT',
      requestedById: 'EMP-ENC',
    };

    const item = {
      id: 'item-machinery-2',
      itemCode: 'MOA-MACH-002',
      unitCostETB: 15_000_000,
      notes: JSON.stringify({ quantity: 1, uom: 'UNIT' }),
      currentCustodianId: null,
      assignedDepartmentId: null,
    };

    const db: any = {
      transactionApproval: {
        findUnique: vi.fn().mockResolvedValue(approval),
        update: vi.fn().mockResolvedValue({
          ...approval,
          status: 'APPROVED',
          reviewedById: 'EMP-CHIEF',
          reviewRemarks: 'Chief Director statutory approval granted',
          item,
        }),
      },
      employee: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'EMP-CHIEF',
          fullNameEn: 'Dr. Girma Chief',
          role: UserRole.CHIEF_DIRECTOR,
        }),
      },
      item: {
        findUnique: vi.fn().mockResolvedValue(item),
        update: vi.fn().mockResolvedValue(item),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const store = new (StoreService as any)();
    const result = await (store as any).applyDecision(
      {
        approvalId: 'appr-high-2',
        action: 'APPROVE',
        reviewedById: 'EMP-CHIEF',
        reviewRemarks: 'Chief Director statutory approval granted',
      },
      db
    );

    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(db.transactionApproval.update).toHaveBeenCalled();
  });

  it('allows Department Head authorization for standard amounts below 10,000,000 ETB', async () => {
    const approval = {
      id: 'appr-std-1',
      status: 'PENDING',
      currentStage: 2,
      itemId: 'item-std-1',
      itemCode: 'MOA-STD-001',
      ifmisSlipNumber: 'M22-STD-01',
      transactionType: 'STOCK_OUT',
      requestedById: 'EMP-ENC',
    };

    const item = {
      id: 'item-std-1',
      itemCode: 'MOA-STD-001',
      unitCostETB: 50_000,
      notes: JSON.stringify({ quantity: 2, uom: 'PCS' }),
      currentCustodianId: null,
      assignedDepartmentId: null,
    };

    const db: any = {
      transactionApproval: {
        findUnique: vi.fn().mockResolvedValue(approval),
        update: vi.fn().mockResolvedValue({
          ...approval,
          status: 'APPROVED',
          reviewedById: 'EMP-HEAD',
          reviewRemarks: 'Standard approval by Dept Head',
          item,
        }),
      },
      employee: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'EMP-HEAD',
          fullNameEn: 'Abebe Head',
          role: UserRole.DEPARTMENT_HEAD,
        }),
      },
      item: {
        findUnique: vi.fn().mockResolvedValue(item),
        update: vi.fn().mockResolvedValue(item),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const store = new (StoreService as any)();
    const result = await (store as any).applyDecision(
      {
        approvalId: 'appr-std-1',
        action: 'APPROVE',
        reviewedById: 'EMP-HEAD',
        reviewRemarks: 'Standard approval by Dept Head',
      },
      db
    );

    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(db.transactionApproval.update).toHaveBeenCalled();
  });
});
