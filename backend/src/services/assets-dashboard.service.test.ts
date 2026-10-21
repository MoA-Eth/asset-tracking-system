import { describe, expect, it, vi } from 'vitest';
import { getAssetsDashboard } from './assets-dashboard.service';
import { StoreService } from './store.service';

describe('Key figures for another system', () => {
  it('gives the dashboard figures with the same filters, and leaves out item lists and names', async () => {
    const dashboard = vi.spyOn(StoreService.getInstance(), 'getExecutiveDashboard').mockResolvedValue({
      totalItems: 120, totalValuationETB: 5_000_000, availableCount: 30, availableValuationETB: 1_200_000,
      issuedCount: 85, issuedValuationETB: 3_600_000, disposedCount: 5, disposedValuationETB: 200_000,
      fixedAssetsCount: 70, fixedAssetsValuationETB: 4_500_000, consumableCount: 50, consumableValuationETB: 500_000,
      pendingStockInCount: 4, pendingStockOutCount: 2, pendingTransferCount: 1, pendingDisposalCount: 0,
      pendingApprovalsCount: 7, pendingApprovalsValuationETB: 90_000, pendingStageCounts: { stage1: 5, stage2: 3, departmentHead: 2, executive: 1 },
      stockMovement: [{ month: '2026-09', received: 12, issued: 9, extra: 'x' }],
      categoryBreakdown: [{ category: 'IT_EQUIPMENT', count: 40, totalValueETB: 2_000_000 }, { category: 'VEHICLES', count: 0, totalValueETB: 0 }],
      locationUtilization: [{ id: 'L1', siteName: 'Head office', roomNumber: 'Central Store', itemCount: 100, totalValueETB: 4_000_000, availableCount: 25, issuedCount: 70, pendingCount: 3 }],
      conditionDistribution: [{ condition: 'NEW', count: 90, totalValueETB: 4_000_000 }],
      staleInStore: { thresholdDays: 30, itemCount: 3, units: 6, valueETB: 60_000, items: [{ itemCode: 'MOA-1', name: 'Laptop' }] },
      // What must not leave the app
      topValuationAssets: [{ itemCode: 'MOA-9', name: 'Tractor' }],
      unassignedItems: [{ itemCode: 'MOA-2' }],
      recentAuditLogs: [{ userName: 'Getnet Taye', details: 'Endorsed MOA-3' }],
      departmentDistribution: [{ department: 'Finance', count: 3 }],
    } as any);

    const figures = await getAssetsDashboard({ from: '2026-07-08', to: '2026-10-20', storeId: 'S1' });
    expect(dashboard).toHaveBeenCalledWith({ from: '2026-07-08', to: '2026-10-20', storeId: 'S1' });
    expect(figures.assets.total).toEqual({ units: 120, valueETB: 5_000_000 });
    expect(figures.pending).toMatchObject({ receipts: 4, total: 7, withTeamLeader: 5, withDepartmentHead: 2, withChiefDirector: 1 });
    expect(figures.movement).toEqual([{ month: '2026-09', received: 12, issued: 9 }]);
    expect(figures.byCategory).toEqual([{ category: 'IT_EQUIPMENT', units: 40, valueETB: 2_000_000 }]);
    expect(figures.byStore).toEqual([{ store: 'Head office · Central Store', units: 100, valueETB: 4_000_000, inStoreUnits: 25, issuedUnits: 70, pending: 3 }]);
    expect(figures.staleInStore).toEqual({ thresholdDays: 30, items: 3, units: 6, valueETB: 60_000 });

    const text = JSON.stringify(figures);
    for (const leaked of ['MOA-', 'Laptop', 'Tractor', 'Getnet', 'Finance', 'extra']) expect(text).not.toContain(leaked);
  });
});
