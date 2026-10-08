import { describe, expect, it } from 'vitest';
import {
  ItemStatus,
  ApprovalStatus,
  TransactionType,
  UserRole,
} from '../types/asset-management';

// Pure invariant rules representing StoreService state transitions and validation constraints
export function validateStockInPayload(slipNo?: string): { isValid: boolean; error?: string } {
  if (!slipNo || !slipNo.trim()) {
    return { isValid: false, error: 'IFMIS Slip / Voucher Number (Model 19) is mandatory.' };
  }
  return { isValid: true };
}

export function computeNextApprovalState(
  currentStage: number,
  status: ApprovalStatus,
  action: 'ENDORSE' | 'APPROVE' | 'REJECT',
  actorRole: UserRole
): { nextStage: number; nextStatus: ApprovalStatus; error?: string } {
  if (status !== ApprovalStatus.PENDING) {
    return { nextStage: currentStage, nextStatus: status, error: 'Cannot act on finalized approval.' };
  }

  if (action === 'ENDORSE') {
    if (actorRole !== UserRole.TEAM_LEADER) {
      return { nextStage: currentStage, nextStatus: status, error: 'Only Team Leader can endorse Stage 1.' };
    }
    if (currentStage !== 1) {
      return { nextStage: currentStage, nextStatus: status, error: 'Only Stage 1 can be endorsed.' };
    }
    return { nextStage: 2, nextStatus: ApprovalStatus.PENDING };
  }

  if (action === 'APPROVE') {
    if (actorRole !== UserRole.DEPARTMENT_HEAD) {
      return { nextStage: currentStage, nextStatus: status, error: 'Only Department Head can approve Stage 2.' };
    }
    if (currentStage !== 2) {
      return { nextStage: currentStage, nextStatus: status, error: 'Stage 1 must be endorsed before Stage 2 approval.' };
    }
    return { nextStage: 2, nextStatus: ApprovalStatus.APPROVED };
  }

  if (action === 'REJECT') {
    if (actorRole !== UserRole.TEAM_LEADER && actorRole !== UserRole.DEPARTMENT_HEAD) {
      return { nextStage: currentStage, nextStatus: status, error: 'Unauthorized to reject approval.' };
    }
    return { nextStage: currentStage, nextStatus: ApprovalStatus.REJECTED };
  }

  return { nextStage: currentStage, nextStatus: status, error: 'Unknown action.' };
}

export function computePostApprovalItemStatus(
  txType: TransactionType,
  approvalStatus: ApprovalStatus,
  currentItemStatus: ItemStatus
): ItemStatus {
  if (approvalStatus === ApprovalStatus.APPROVED) {
    if (txType === TransactionType.STOCK_IN) return ItemStatus.AVAILABLE;
    if (txType === TransactionType.STOCK_OUT) return ItemStatus.ISSUED;
    if (txType === TransactionType.RETURN) return ItemStatus.AVAILABLE;
  }

  if (approvalStatus === ApprovalStatus.REJECTED) {
    if (txType === TransactionType.STOCK_IN) return ItemStatus.REJECTED;
    if (txType === TransactionType.STOCK_OUT) return ItemStatus.AVAILABLE;
    if (txType === TransactionType.RETURN) return ItemStatus.ISSUED;
  }

  return currentItemStatus;
}

describe('Store Service Business Invariant Rules', () => {
  describe('Model 19 Stock-In Validation Rules', () => {
    it('rejects stock-in with missing or blank IFMIS slip number', () => {
      expect(validateStockInPayload('')).toEqual({
        isValid: false,
        error: 'IFMIS Slip / Voucher Number (Model 19) is mandatory.',
      });
      expect(validateStockInPayload('   ')).toEqual({
        isValid: false,
        error: 'IFMIS Slip / Voucher Number (Model 19) is mandatory.',
      });
    });

    it('accepts valid IFMIS Model 19 slip number', () => {
      expect(validateStockInPayload('MOA-M19-2016-0042')).toEqual({
        isValid: true,
      });
    });
  });

  describe('Two-Stage Sequential Approval Rules', () => {
    it('advances from Stage 1 to Stage 2 upon Team Leader endorsement', () => {
      const res = computeNextApprovalState(1, ApprovalStatus.PENDING, 'ENDORSE', UserRole.TEAM_LEADER);
      expect(res.nextStage).toBe(2);
      expect(res.nextStatus).toBe(ApprovalStatus.PENDING);
      expect(res.error).toBeUndefined();
    });

    it('rejects Stage 1 endorsement by Department Head or Data Encoder', () => {
      const resDept = computeNextApprovalState(1, ApprovalStatus.PENDING, 'ENDORSE', UserRole.DEPARTMENT_HEAD);
      expect(resDept.error).toContain('Only Team Leader can endorse Stage 1');

      const resEncoder = computeNextApprovalState(1, ApprovalStatus.PENDING, 'ENDORSE', UserRole.DATA_ENCODER);
      expect(resEncoder.error).toContain('Only Team Leader can endorse Stage 1');
    });

    it('finalizes to APPROVED upon Department Head approval in Stage 2', () => {
      const res = computeNextApprovalState(2, ApprovalStatus.PENDING, 'APPROVE', UserRole.DEPARTMENT_HEAD);
      expect(res.nextStage).toBe(2);
      expect(res.nextStatus).toBe(ApprovalStatus.APPROVED);
      expect(res.error).toBeUndefined();
    });

    it('rejects final approval if request has not yet reached Stage 2', () => {
      const res = computeNextApprovalState(1, ApprovalStatus.PENDING, 'APPROVE', UserRole.DEPARTMENT_HEAD);
      expect(res.error).toContain('Stage 1 must be endorsed before Stage 2 approval');
    });

    it('finalizes to REJECTED when reviewer rejects at any stage', () => {
      const res1 = computeNextApprovalState(1, ApprovalStatus.PENDING, 'REJECT', UserRole.TEAM_LEADER);
      expect(res1.nextStatus).toBe(ApprovalStatus.REJECTED);

      const res2 = computeNextApprovalState(2, ApprovalStatus.PENDING, 'REJECT', UserRole.DEPARTMENT_HEAD);
      expect(res2.nextStatus).toBe(ApprovalStatus.REJECTED);
    });
  });

  describe('Post-Approval Item Status Transitions', () => {
    it('transitions Stock-In item to AVAILABLE when approved', () => {
      const status = computePostApprovalItemStatus(
        TransactionType.STOCK_IN,
        ApprovalStatus.APPROVED,
        ItemStatus.PENDING_STOCK_IN
      );
      expect(status).toBe(ItemStatus.AVAILABLE);
    });

    it('transitions Stock-Out item to ISSUED when approved', () => {
      const status = computePostApprovalItemStatus(
        TransactionType.STOCK_OUT,
        ApprovalStatus.APPROVED,
        ItemStatus.PENDING_STOCK_OUT
      );
      expect(status).toBe(ItemStatus.ISSUED);
    });

    it('reverts Stock-Out item back to AVAILABLE when rejected', () => {
      const status = computePostApprovalItemStatus(
        TransactionType.STOCK_OUT,
        ApprovalStatus.REJECTED,
        ItemStatus.PENDING_STOCK_OUT
      );
      expect(status).toBe(ItemStatus.AVAILABLE);
    });

    it('transitions Return item back to AVAILABLE in store when approved', () => {
      const status = computePostApprovalItemStatus(
        TransactionType.RETURN,
        ApprovalStatus.APPROVED,
        ItemStatus.PENDING_STOCK_IN
      );
      expect(status).toBe(ItemStatus.AVAILABLE);
    });
  });
});
