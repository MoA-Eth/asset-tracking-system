/**
 * The app's key figures for another system (e.g. the Ministry KPI dashboard), read with an API key.
 * Numbers only: no item lists, no names. They come from the executive dashboard's own calculation, so the two always
 * agree, with the same filters (period, store, category, item type).
 */
import { StoreService } from './store.service';

export interface AssetsDashboardFilter {
  from?: unknown;
  to?: unknown;
  storeId?: unknown;
  category?: unknown;
  itemType?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function getAssetsDashboard(filter: AssetsDashboardFilter) {
  const d: any = await StoreService.getInstance().getExecutiveDashboard(filter);
  const amount = (units: number, valueETB: number) => ({ units: Number(units) || 0, valueETB: Number(valueETB) || 0 });

  return {
    generatedAt: new Date().toISOString(),
    filter: { from: str(filter.from) ?? null, to: str(filter.to) ?? null, storeId: str(filter.storeId) ?? null, category: str(filter.category) ?? null, itemType: str(filter.itemType) ?? null },
    // Approved records only; receipts waiting for approval are under "pending"
    assets: {
      total: amount(d.totalItems, d.totalValuationETB),
      inStore: amount(d.availableCount, d.availableValuationETB),
      issued: amount(d.issuedCount, d.issuedValuationETB),
      disposed: amount(d.disposedCount, d.disposedValuationETB),
      fixedAssets: amount(d.fixedAssetsCount, d.fixedAssetsValuationETB),
      consumables: amount(d.consumableCount, d.consumableValuationETB),
    },
    pending: {
      receipts: d.pendingStockInCount ?? 0,
      issues: d.pendingStockOutCount ?? 0,
      transfers: d.pendingTransferCount ?? 0,
      disposals: d.pendingDisposalCount ?? 0,
      total: d.pendingApprovalsCount ?? 0,
      valueETB: d.pendingApprovalsValuationETB ?? 0,
      withTeamLeader: d.pendingStageCounts?.stage1 ?? 0,
      withDepartmentHead: d.pendingStageCounts?.stage2 ?? 0,
    },
    movement: (d.stockMovement ?? []).map((m: any) => ({ month: m.month, received: m.received ?? 0, issued: m.issued ?? 0 })),
    byCategory: (d.categoryBreakdown ?? [])
      .filter((c: any) => c.count > 0)
      .map((c: any) => ({ category: c.category, units: c.count, valueETB: c.totalValueETB })),
    byStore: (d.locationUtilization ?? []).map((l: any) => ({
      store: [l.siteName, l.roomNumber].filter(Boolean).join(' · '),
      units: l.itemCount ?? 0,
      valueETB: l.totalValueETB ?? 0,
      inStoreUnits: l.availableCount ?? 0,
      issuedUnits: l.issuedCount ?? 0,
      pending: l.pendingCount ?? 0,
    })),
    byCondition: (d.conditionDistribution ?? []).map((c: any) => ({ condition: c.condition, units: c.count, valueETB: c.totalValueETB })),
    staleInStore: {
      thresholdDays: d.staleInStore?.thresholdDays ?? 30,
      items: d.staleInStore?.itemCount ?? 0,
      units: d.staleInStore?.units ?? 0,
      valueETB: d.staleInStore?.valueETB ?? 0,
    },
  };
}
