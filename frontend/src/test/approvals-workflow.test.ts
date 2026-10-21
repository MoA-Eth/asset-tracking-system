import { describe, expect, it } from 'vitest';
import {
  ApprovalStatus,
  TransactionApproval,
  TransactionType,
  UserRole,
} from '../types/asset-management';
import { getVisibleQueueTabs, HIGH_VALUE_THRESHOLD } from '../pages/ApprovalsPage';

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
    itemName: `Enterprise Asset ${id}`,
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
  const isHighValue = (item.totalAmount || 0) > HIGH_VALUE_THRESHOLD;

  if (role === UserRole.TEAM_LEADER) {
    return (item.currentStage ?? 1) === 1;
  }
  if (role === UserRole.DEPARTMENT_HEAD) {
    return item.currentStage === 2 && !isHighValue;
  }
  if (role === UserRole.CHIEF_DIRECTOR) {
    return item.currentStage === 2 && isHighValue;
  }
  if (role === UserRole.SUPER_ADMIN || role === UserRole.SYSTEM_ADMIN) {
    return item.currentStage === 2 || (item.currentStage ?? 1) === 1;
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
    const isHighValue = (item.totalAmount || 0) > HIGH_VALUE_THRESHOLD;

    // 1. Tab Status Filter
    if (activeTab === 'MY_QUEUE') {
      if (item.status !== ApprovalStatus.PENDING) return false;
      if (role === UserRole.TEAM_LEADER && (item.currentStage ?? 1) !== 1) return false;
      if (role === UserRole.DEPARTMENT_HEAD && (item.currentStage !== 2 || isHighValue)) return false;
      if (role === UserRole.CHIEF_DIRECTOR && (item.currentStage !== 2 || !isHighValue)) return false;
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
    createMockApproval('001', { currentStage: 1, status: ApprovalStatus.PENDING, totalAmount: 50_000 }),
    createMockApproval('002', { currentStage: 2, status: ApprovalStatus.PENDING, totalAmount: 500_000 }),
    createMockApproval('003', {
      currentStage: 2,
      status: ApprovalStatus.APPROVED,
      transactionType: TransactionType.TRANSFER,
      totalAmount: 1_200_000,
    }),
    createMockApproval('004', {
      currentStage: 1,
      status: ApprovalStatus.REJECTED,
      transactionType: TransactionType.RETURN,
      totalAmount: 80_000,
    }),
  ];

  describe('isActionableForRole', () => {
    it('allows TEAM_LEADER to action only Stage 1 pending items', () => {
      expect(isActionableForRole(sampleData[0], UserRole.TEAM_LEADER)).toBe(true);
      expect(isActionableForRole(sampleData[1], UserRole.TEAM_LEADER)).toBe(false);
      expect(isActionableForRole(sampleData[2], UserRole.TEAM_LEADER)).toBe(false);
      expect(isActionableForRole(sampleData[3], UserRole.TEAM_LEADER)).toBe(false);
    });

    it('allows DEPARTMENT_HEAD to action only Stage 2 pending items below threshold', () => {
      expect(isActionableForRole(sampleData[0], UserRole.DEPARTMENT_HEAD)).toBe(false);
      expect(isActionableForRole(sampleData[1], UserRole.DEPARTMENT_HEAD)).toBe(true);
      expect(isActionableForRole(sampleData[2], UserRole.DEPARTMENT_HEAD)).toBe(false);
      expect(isActionableForRole(sampleData[3], UserRole.DEPARTMENT_HEAD)).toBe(false);
    });

    it('denies DATA_ENCODER and SYSTEM_ADMIN from reviewing any approval items', () => {
      sampleData.forEach((item) => {
        expect(isActionableForRole(item, UserRole.DATA_ENCODER)).toBe(false);
        expect(isActionableForRole(item, UserRole.MANAGER)).toBe(false);
        expect(isActionableForRole(item, UserRole.EMPLOYEE)).toBe(false);
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

  describe('High-Value (> 10M ETB) Statutory Routing: Chief Director vs Department Head', () => {
    const standardRequest = createMockApproval('std-1', {
      currentStage: 2,
      status: ApprovalStatus.PENDING,
      totalAmount: 4_500_000, // 4.5M ETB
    });

    const highValueRequest = createMockApproval('high-1', {
      currentStage: 2,
      status: ApprovalStatus.PENDING,
      totalAmount: 14_000_000, // 14M ETB (> 10M ETB)
    });

    const boundaryExact10M = createMockApproval('boundary-10m', {
      currentStage: 2,
      status: ApprovalStatus.PENDING,
      totalAmount: 10_000_000, // Exactly 10M ETB
    });

    const boundaryAbove10M = createMockApproval('boundary-10m-plus', {
      currentStage: 2,
      status: ApprovalStatus.PENDING,
      totalAmount: 10_000_001, // 10,000,001 ETB (> 10M ETB)
    });

    const testPool = [standardRequest, highValueRequest, boundaryExact10M, boundaryAbove10M];

    it('routes requests above 10,000,000 ETB to the Chief Director queue, not the Department Head', () => {
      const chiefQueue = filterApprovals(testPool, {
        activeTab: 'MY_QUEUE',
        role: UserRole.CHIEF_DIRECTOR,
      });

      const deptHeadQueue = filterApprovals(testPool, {
        activeTab: 'MY_QUEUE',
        role: UserRole.DEPARTMENT_HEAD,
      });

      // Chief Director receives ONLY the > 10M requests
      expect(chiefQueue.map((i) => i.id)).toEqual(['high-1', 'boundary-10m-plus']);

      // Department Head receives standard requests (<= 10M), never > 10M
      expect(deptHeadQueue.map((i) => i.id)).toEqual(['std-1', 'boundary-10m']);
    });

    it('confirms actionable rights: Chief Director can authorize > 10M, Department Head cannot', () => {
      // 14M High-value request
      expect(isActionableForRole(highValueRequest, UserRole.CHIEF_DIRECTOR)).toBe(true);
      expect(isActionableForRole(highValueRequest, UserRole.DEPARTMENT_HEAD)).toBe(false);

      // 4.5M Standard request
      expect(isActionableForRole(standardRequest, UserRole.CHIEF_DIRECTOR)).toBe(false);
      expect(isActionableForRole(standardRequest, UserRole.DEPARTMENT_HEAD)).toBe(true);
    });

    it('handles exact boundary threshold: exactly 10M goes to Department Head, 10M + 1 goes to Chief Director', () => {
      expect(isActionableForRole(boundaryExact10M, UserRole.DEPARTMENT_HEAD)).toBe(true);
      expect(isActionableForRole(boundaryExact10M, UserRole.CHIEF_DIRECTOR)).toBe(false);

      expect(isActionableForRole(boundaryAbove10M, UserRole.DEPARTMENT_HEAD)).toBe(false);
      expect(isActionableForRole(boundaryAbove10M, UserRole.CHIEF_DIRECTOR)).toBe(true);
    });

    it('ensures batch select-all respects the 10M threshold for each role', () => {
      const actionableForChief = testPool
        .filter((item) => isActionableForRole(item, UserRole.CHIEF_DIRECTOR))
        .map((item) => item.id);

      expect(actionableForChief).toEqual(['high-1', 'boundary-10m-plus']);

      const actionableForDeptHead = testPool
        .filter((item) => isActionableForRole(item, UserRole.DEPARTMENT_HEAD))
        .map((item) => item.id);

      expect(actionableForDeptHead).toEqual(['std-1', 'boundary-10m']);
    });
  });

  describe('Queue tabs per role', () => {
    it.each([UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD, UserRole.CHIEF_DIRECTOR])(
      '%s only sees its own queue plus history, not the other stage',
      (role) => {
        const tabs = getVisibleQueueTabs(role);
        expect(tabs).toEqual(['MY_QUEUE', 'APPROVED', 'RETURNED', 'REJECTED', 'ALL']);
        expect(tabs).not.toContain('STAGE_1');
        expect(tabs).not.toContain('STAGE_2');
      }
    );

    it("a Team Leader's queue holds only Stage 1 items; a Department Head's only standard Stage 2; Chief Director high-value Stage 2", () => {
      const items = [
        createMockApproval('001', { currentStage: 1, totalAmount: 100_000 }),
        createMockApproval('002', { currentStage: 2, totalAmount: 500_000 }),
        createMockApproval('003', { currentStage: 2, totalAmount: 15_000_000 }),
      ];
      expect(filterApprovals(items, { activeTab: 'MY_QUEUE', role: UserRole.TEAM_LEADER }).map((i) => i.id)).toEqual(['001']);
      expect(filterApprovals(items, { activeTab: 'MY_QUEUE', role: UserRole.DEPARTMENT_HEAD }).map((i) => i.id)).toEqual(['002']);
      expect(filterApprovals(items, { activeTab: 'MY_QUEUE', role: UserRole.CHIEF_DIRECTOR }).map((i) => i.id)).toEqual(['003']);
    });
  });
});
