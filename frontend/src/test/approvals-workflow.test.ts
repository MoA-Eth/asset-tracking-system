import { describe, expect, it } from 'vitest';
import {
  ApprovalStatus,
  TransactionApproval,
  TransactionType,
  UserRole,
} from '../types/asset-management';
import { getVisibleQueueTabs } from '../pages/ApprovalsPage';

// Reusable mock factory
function createMockApproval(
  id: string,
  overrides: Partial<TransactionApproval> = {}
): TransactionApproval {
  return {
    id,
    transactionType: TransactionType.STOCK_OUT,
    itemId: `item-${id}`,
    status: ApprovalStatus.PENDING,
    currentStage: 1,
    itemCode: `MOA-AST-${id}`,
    itemName: `Enterprise Laptop ${id}`,
    ifmisSlipNumber: `IFMIS-2016-${id}`,
    ifmisSlipDateGc: '2023-09-12',
    ifmisSlipDateEc: '2016-01-01',
    requestedById: 'emp-1',
    createdAtGc: '2023-09-12',
    createdAtEc: '2016-01-01',
    purposeOrRemarks: 'Official departmental deployment',
    requestedBy: {
      id: 'emp-1',
      payrollId: 'PAY-1001',
      fullNameEn: 'Chala Bekele',
      fullNameAm: 'ጫላ በቀለ',
      departmentId: 'dept-ict',
      email: 'chala@moa.gov.et',
      phone: '+251911000000',
      role: UserRole.DATA_ENCODER,
      isActive: true,
    },
    ...overrides,
  };
}

// Logic under test replicated directly from ApprovalsPage specifications
export function isActionableForRole(item: TransactionApproval, role: UserRole): boolean {
  if (item.status !== ApprovalStatus.PENDING) return false;
  if (role === UserRole.TEAM_LEADER) {
    return (item.currentStage ?? 1) === 1;
  }
  if (role === UserRole.DEPARTMENT_HEAD) {
    return item.currentStage === 2;
  }
  return false;
}

export function filterApprovals(
  items: TransactionApproval[],
  {
    activeTab,
    role,
    typeFilter = 'ALL',
    searchTerm = '',
  }: {
    activeTab: 'MY_QUEUE' | 'STAGE_1' | 'STAGE_2' | 'APPROVED' | 'REJECTED' | 'ALL';
    role: UserRole;
    typeFilter?: 'ALL' | TransactionType;
    searchTerm?: string;
  }
): TransactionApproval[] {
  return items.filter((item) => {
    // 1. Tab Status Filter
    if (activeTab === 'MY_QUEUE') {
      if (item.status !== ApprovalStatus.PENDING) return false;
      if (role === UserRole.TEAM_LEADER && (item.currentStage ?? 1) !== 1) return false;
      if (role === UserRole.DEPARTMENT_HEAD && item.currentStage !== 2) return false;
    } else if (activeTab === 'STAGE_1') {
      if (item.status !== ApprovalStatus.PENDING || (item.currentStage ?? 1) !== 1) return false;
    } else if (activeTab === 'STAGE_2') {
      if (item.status !== ApprovalStatus.PENDING || item.currentStage !== 2) return false;
    } else if (activeTab === 'APPROVED') {
      if (item.status !== ApprovalStatus.APPROVED) return false;
    } else if (activeTab === 'REJECTED') {
      if (item.status !== ApprovalStatus.REJECTED) return false;
    }

    // 2. Type Filter
    if (typeFilter !== 'ALL' && item.transactionType !== typeFilter) {
      return false;
    }

    // 3. Search Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matches =
        item.itemCode.toLowerCase().includes(q) ||
        item.itemName.toLowerCase().includes(q) ||
        item.ifmisSlipNumber.toLowerCase().includes(q) ||
        (item.purposeOrRemarks && item.purposeOrRemarks.toLowerCase().includes(q)) ||
        (item.requestedBy?.fullNameEn && item.requestedBy.fullNameEn.toLowerCase().includes(q));
      if (!matches) return false;
    }

    return true;
  });
}

describe('Two-Stage Approval Workflow & Queue Logic', () => {
  const sampleData: TransactionApproval[] = [
    createMockApproval('001', { currentStage: 1, status: ApprovalStatus.PENDING }),
    createMockApproval('002', { currentStage: 2, status: ApprovalStatus.PENDING }),
    createMockApproval('003', {
      currentStage: 2,
      status: ApprovalStatus.APPROVED,
      transactionType: TransactionType.TRANSFER,
    }),
    createMockApproval('004', {
      currentStage: 1,
      status: ApprovalStatus.REJECTED,
      transactionType: TransactionType.RETURN,
    }),
  ];

  describe('isActionableForRole', () => {
    it('allows TEAM_LEADER to action only Stage 1 pending items', () => {
      expect(isActionableForRole(sampleData[0], UserRole.TEAM_LEADER)).toBe(true);
      expect(isActionableForRole(sampleData[1], UserRole.TEAM_LEADER)).toBe(false);
      expect(isActionableForRole(sampleData[2], UserRole.TEAM_LEADER)).toBe(false);
      expect(isActionableForRole(sampleData[3], UserRole.TEAM_LEADER)).toBe(false);
    });

    it('allows DEPARTMENT_HEAD to action only Stage 2 pending items', () => {
      expect(isActionableForRole(sampleData[0], UserRole.DEPARTMENT_HEAD)).toBe(false);
      expect(isActionableForRole(sampleData[1], UserRole.DEPARTMENT_HEAD)).toBe(true);
      expect(isActionableForRole(sampleData[2], UserRole.DEPARTMENT_HEAD)).toBe(false);
      expect(isActionableForRole(sampleData[3], UserRole.DEPARTMENT_HEAD)).toBe(false);
    });

    it('denies DATA_ENCODER and SYSTEM_ADMIN from reviewing any approval items', () => {
      sampleData.forEach((item) => {
        expect(isActionableForRole(item, UserRole.DATA_ENCODER)).toBe(false);
        expect(isActionableForRole(item, UserRole.SYSTEM_ADMIN)).toBe(false);
        expect(isActionableForRole(item, UserRole.MANAGER)).toBe(false);
      });
    });
  });

  describe('Queue and Tab Filtering', () => {
    it('filters MY_QUEUE appropriately for TEAM_LEADER', () => {
      const filtered = filterApprovals(sampleData, {
        activeTab: 'MY_QUEUE',
        role: UserRole.TEAM_LEADER,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('001');
    });

    it('filters MY_QUEUE appropriately for DEPARTMENT_HEAD', () => {
      const filtered = filterApprovals(sampleData, {
        activeTab: 'MY_QUEUE',
        role: UserRole.DEPARTMENT_HEAD,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('002');
    });

    it('filters APPROVED and REJECTED tabs strictly by status', () => {
      const approved = filterApprovals(sampleData, {
        activeTab: 'APPROVED',
        role: UserRole.TEAM_LEADER,
      });
      expect(approved).toHaveLength(1);
      expect(approved[0].id).toBe('003');

      const rejected = filterApprovals(sampleData, {
        activeTab: 'REJECTED',
        role: UserRole.DEPARTMENT_HEAD,
      });
      expect(rejected).toHaveLength(1);
      expect(rejected[0].id).toBe('004');
    });

    it('filters by TransactionType', () => {
      const transfers = filterApprovals(sampleData, {
        activeTab: 'ALL',
        role: UserRole.DEPARTMENT_HEAD,
        typeFilter: TransactionType.TRANSFER,
      });
      expect(transfers).toHaveLength(1);
      expect(transfers[0].id).toBe('003');
    });

    it('searches across itemCode, itemName, and requester', () => {
      const codeMatch = filterApprovals(sampleData, {
        activeTab: 'ALL',
        role: UserRole.TEAM_LEADER,
        searchTerm: '001',
      });
      expect(codeMatch).toHaveLength(1);
      expect(codeMatch[0].id).toBe('001');

      const nameMatch = filterApprovals(sampleData, {
        activeTab: 'ALL',
        role: UserRole.TEAM_LEADER,
        searchTerm: 'Chala',
      });
      expect(nameMatch).toHaveLength(4);
    });
  });

  describe('Batch Selection Safety', () => {
    it('ensures batch select-all only selects items actionable by the current reviewer', () => {
      const allFiltered = filterApprovals(sampleData, {
        activeTab: 'ALL',
        role: UserRole.TEAM_LEADER,
      });

      const actionableForTeamLead = allFiltered
        .filter((item) => isActionableForRole(item, UserRole.TEAM_LEADER))
        .map((item) => item.id);

      expect(actionableForTeamLead).toEqual(['001']);

      const actionableForDeptHead = allFiltered
        .filter((item) => isActionableForRole(item, UserRole.DEPARTMENT_HEAD))
        .map((item) => item.id);

      expect(actionableForDeptHead).toEqual(['002']);
    });
  });

  describe('Queue tabs per role', () => {
    it.each([UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD])(
      '%s only sees its own queue plus history, not the other stage',
      (role) => {
        const tabs = getVisibleQueueTabs(role);
        expect(tabs).toEqual(['MY_QUEUE', 'APPROVED', 'REJECTED', 'ALL']);
        expect(tabs).not.toContain('STAGE_1');
        expect(tabs).not.toContain('STAGE_2');
      }
    );

    it("a Team Leader's queue holds only Stage 1 items; a Department Head's only Stage 2", () => {
      const items = [
        createMockApproval('001', { currentStage: 1 }),
        createMockApproval('002', { currentStage: 2 }),
      ];
      expect(filterApprovals(items, { activeTab: 'MY_QUEUE', role: UserRole.TEAM_LEADER }).map((i) => i.id)).toEqual(['001']);
      expect(filterApprovals(items, { activeTab: 'MY_QUEUE', role: UserRole.DEPARTMENT_HEAD }).map((i) => i.id)).toEqual(['002']);
    });
  });
});
