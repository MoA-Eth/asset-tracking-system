import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreService } from './store.service';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/asset-management';

const store = StoreService.getInstance();
const approval = {
  id: 'APP-1',
  itemId: 'ITEM-1',
  status: 'PENDING',
  transactionType: 'STOCK_IN',
  currentStage: 1,
};
const {
  SYSTEM_ADMIN: admin,
  DATA_ENCODER: encoder,
  TEAM_LEADER: leader,
  DEPARTMENT_HEAD: head,
  MANAGER: manager,
} = UserRole;
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(prisma.transactionApproval, 'findUnique').mockResolvedValue(
    approval as any
  );
  vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
    id: 'REVIEWER',
    fullNameEn: 'Reviewer',
    role: leader,
  } as any);
  vi.spyOn(prisma.transactionApproval, 'update').mockImplementation(
    (args: any) => Promise.resolve({ ...approval, ...args.data }) as any
  );
  vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
    id: 'ITEM-1',
    status: 'PENDING_STOCK_IN',
  } as any);
  vi.spyOn(prisma.item, 'update').mockResolvedValue({ id: 'ITEM-1' } as any);
  vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
});

describe('Actual store approval stage authorization', () => {
  it.each([
    [1, head, 'ENDORSE'],
    [1, head, 'APPROVE'],
    [1, head, 'REJECT'],
    [2, leader, 'REJECT'],
    [2, leader, 'APPROVE'],
    [2, leader, 'ENDORSE'],
    [1, encoder, 'REJECT'],
    [2, admin, 'APPROVE'],
    [2, manager, 'APPROVE'],
    [1, leader, 'APPROVE'],
    [2, head, 'ENDORSE'],
    [1, leader, 'UNKNOWN'],
  ])(
    'rejects stage %s / %s / %s without changing any records',
    async (stage, role, action) => {
      vi.mocked(prisma.transactionApproval.findUnique).mockResolvedValue({
        ...approval,
        currentStage: stage,
      } as any);
      vi.mocked(prisma.employee.findUnique).mockResolvedValue({
        id: 'REVIEWER',
        role,
      } as any);
      await expect(
        store.handleApproval({
          approvalId: 'APP-1',
          reviewedById: 'REVIEWER',
          action: action as any,
        })
      ).rejects.toMatchObject({ statusCode: expect.any(Number) });
      expect(prisma.transactionApproval.update).not.toHaveBeenCalled();
      expect(prisma.item.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    }
  );

  it.each([
    [1, leader, 'ENDORSE', 'PENDING'],
    [1, leader, 'REJECT', 'REJECTED'],
    [2, head, 'APPROVE', 'APPROVED'],
    [2, head, 'REJECT', 'REJECTED'],
  ])('allows stage %s / %s / %s', async (stage, role, action, status) => {
    vi.mocked(prisma.transactionApproval.findUnique).mockResolvedValue({
      ...approval,
      currentStage: stage,
    } as any);
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 'REVIEWER',
      role,
    } as any);
    const result = await store.handleApproval({
      approvalId: 'APP-1',
      reviewedById: 'REVIEWER',
      action: action as any,
    });
    expect(result.status).toBe(status);
    if (action === 'ENDORSE') expect(result.currentStage).toBe(2);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('queries only the encoder’s own submissions when a requester is supplied', async () => {
    vi.spyOn(prisma.transactionApproval, 'findMany').mockResolvedValue([]);
    await store.getApprovals(undefined, 'ENCODER-1');
    expect(prisma.transactionApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestedById: 'ENCODER-1' } })
    );
  });
});

describe('Atomic administrator role updates', () => {
  it('records the affected employee and both roles in the same transaction', async () => {
    const tx = {
      employee: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'ADMIN-1',
            fullNameEn: 'Admin',
            role: admin,
          })
          .mockResolvedValueOnce({
            id: 'EMP-1',
            fullNameEn: 'Staff',
            role: encoder,
          }),
        update: vi.fn().mockResolvedValue({ id: 'EMP-1', role: leader }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback(tx)
    );
    await store.updateEmployeeRole('EMP-1', leader, 'ADMIN-1');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'EMPLOYEE',
          entityId: 'EMP-1',
          userRole: admin,
          previousState: { role: encoder },
          newState: { role: leader },
        }),
      })
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
