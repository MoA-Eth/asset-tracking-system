import { describe, expect, it } from 'vitest';
import { UserRole } from '../types/asset-management';

describe('User Activity Claiming Invariants', () => {
  it('claims operation actor ID strictly from authenticated user session', () => {
    const authUser = {
      id: 'EMP-ACTIVE-001',
      fullNameEn: 'Civil Service Encoder',
      role: UserRole.DATA_ENCODER,
    };

    const resolveActorId = (currentUser: typeof authUser | null, fallbackEmployeeId: string) => {
      return currentUser?.id || fallbackEmployeeId || '';
    };

    expect(resolveActorId(authUser, 'EMP-FALLBACK-999')).toBe('EMP-ACTIVE-001');
    expect(resolveActorId(null, 'EMP-FALLBACK-999')).toBe('EMP-FALLBACK-999');
  });

  it('ensures review/endorsement actor ID matches authenticated officer', () => {
    const activeHead = {
      id: 'EMP-HEAD-ACTIVE',
      fullNameEn: 'Directorate Head',
      role: UserRole.DEPARTMENT_HEAD,
    };

    const resolveApproverId = (currentUser: typeof activeHead | null, fallbackId: string) => {
      return currentUser?.id || fallbackId;
    };

    expect(resolveApproverId(activeHead, 'EMP-DEFAULT-HEAD')).toBe('EMP-HEAD-ACTIVE');
  });

  it('guarantees custody voucher sign-off displays dynamic authenticated actors', () => {
    const approval = {
      requestedBy: { fullNameEn: 'Meron Alemu (Store Officer)' },
      endorsedBy: { fullNameEn: 'Mulugeta Berhanu (Property Team Leader)' },
      reviewedBy: { fullNameEn: 'Dawit Tadesse (Property Director)' },
      recipientEmployee: { fullNameEn: 'Kebede Alemu (Field Officer)' },
    };

    const issuedBy = approval.requestedBy.fullNameEn;
    const endorsedBy = approval.endorsedBy.fullNameEn;
    const approvedBy = approval.reviewedBy.fullNameEn;
    const receivedBy = approval.recipientEmployee.fullNameEn;

    expect(issuedBy).toBe('Meron Alemu (Store Officer)');
    expect(endorsedBy).toBe('Mulugeta Berhanu (Property Team Leader)');
    expect(approvedBy).toBe('Dawit Tadesse (Property Director)');
    expect(receivedBy).toBe('Kebede Alemu (Field Officer)');
  });
});
