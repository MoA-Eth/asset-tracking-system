import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import {
  RefreshCw,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
} from 'lucide-react';
import { api } from '../api/client';
import { StoreManReminder } from '../components/ui/StoreManReminder';
import { FilterPopover, FilterSection, FilterSelect } from '../components/ui/FilterPopover';
import { CATEGORY_OPTIONS } from '../components/assets/asset-state';
import { PERIOD_OPTIONS, PeriodKey, periodRange } from '../utils/periods';
import { Donut } from '../components/ui/charts';
import { actionText, withRoleNames } from '../utils/roles';
import { formatETB, formatETBShort, formatGcToEc, getTodayGcAndEc } from '../utils/eth-date';
import { Store, UserRole } from '../types/asset-management';
import { useToast } from '../context/ToastContext';

interface ExecutiveDashboardPageProps {
  onNavigate: (tab: string) => void;
  currentRole: UserRole;
  selectedCenter?: string;
  setSelectedCenter?: (center: string) => void;
}

// ─── Colour roles ───────────────────────────────────────────────────────────
// One brand accent (emerald) for icons and meters; colour otherwise only where it
// carries meaning, always next to a text label. Hexes validated with the dataviz
// palette checker (light surface).

/** Asset categories: fixed slot per category, never by position or rank. */
const CATEGORY_STYLE: Record<string, { en: string; am: string; color: string }> = {
  VEHICLE:          { en: 'Vehicles',         am: 'ተሽከርካሪዎች',      color: '#2a78d6' },
  AGRI_MACHINERY:   { en: 'Agri. machinery',  am: 'የግብርና ማሽነሪዎች', color: '#eb6834' },
  IT_EQUIPMENT:     { en: 'IT equipment',     am: 'የአይቲ መሣሪያዎች',  color: '#1baf7a' },
  OFFICE_FURNITURE: { en: 'Office furniture', am: 'የቢሮ ዕቃዎች',      color: '#eda100' },
  LAB_EQUIPMENT:    { en: 'Lab equipment',    am: 'የላቦራቶሪ ዕቃዎች',  color: '#e87ba4' },
  FIELD_GEAR:       { en: 'Field gear',       am: 'የመስክ ቁሳቁሶች',    color: '#008300' },
  OFFICE_SUPPLIES:  { en: 'Office supplies',  am: 'የጽሕፈት መሣሪያና የቢሮ አላቂ ዕቃዎች', color: '#7a5af5' },
  FUEL_LUBRICANTS:  { en: 'Fuel & lubricants', am: 'ነዳጅና ቅባት',      color: '#a1672a' },
  OTHER_SUPPLIES:   { en: 'Other supplies',   am: 'ሌሎች አላቂ ዕቃዎች',  color: '#5f6b7a' },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE);

/** Item lifecycle states, shared by every status bar and badge on the page. */
const ITEM_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  AVAILABLE:         { label: 'Available',         color: '#0ca30c' },
  ISSUED:            { label: 'Issued',            color: '#2a78d6' },
  PENDING:           { label: 'Pending',           color: '#eda100' },
  PENDING_STOCK_IN:  { label: 'Receipt pending',   color: '#eda100' },
  PENDING_STOCK_OUT: { label: 'Issue pending',     color: '#eda100' },
  UNDER_TRANSFER:    { label: 'Under transfer',    color: '#eda100' },
  PENDING_DISPOSAL:  { label: 'Disposal pending',  color: '#eda100' },
  DISPOSED:          { label: 'Disposed',          color: '#94a3b8' },
  REJECTED:          { label: 'Rejected',          color: '#dc2626' },
  OTHER:             { label: 'Other',             color: '#cbd5e1' },
};

function getActionTone(action: string): string {
  if (action.startsWith('APPROVE')) return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  if (action.startsWith('REJECT')) return 'bg-rose-50 text-rose-800 border border-rose-200';
  if (action.startsWith('ENDORSE')) return 'bg-blue-50 text-blue-800 border border-blue-200';
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

// ─── Building blocks ────────────────────────────────────────────────────────

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, action, className = '', children }) => (
  <section className={`rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08),0_2px_4px_-1px_rgba(15,23,42,0.04)] ${className}`}>
    <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const CountPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
    {children}
  </span>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
  >
    <Eye className="h-3.5 w-3.5" /> {children}
  </button>
);

/** Meter in the brand accent: same-ramp track and fill. */
const Meter: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
    <div className="h-full rounded-full bg-emerald-600 transition-all duration-700" style={{ width: `${pct}%` }} />
  </div>
);

const formatAssetPct = (count: number, total: number): string => {
  if (total <= 0) return '0%';
  const pct = (count / total) * 100;
  if (count > 0 && pct < 0.05) return '<0.1%';
  if (count > 0 && pct < 1) return `${pct.toFixed(1)}%`;
  if (count < total && pct > 99.95) return '>99.9%';
  if (count < total && pct > 99) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
};

const StatTile: React.FC<{
  label: string;
  labelAm: string;
  action?: React.ReactNode;
  value: React.ReactNode;
  /** The exact figure, in small type under a shortened value (e.g. "ETB 16,484,461.10" under "ETB 16.48M") */
  exact?: string;
  footer: React.ReactNode;
  meterPct?: number;
  splitBar?: {
    primaryPct: number;
    primaryColor?: string;
    secondaryColor?: string;
    primaryLabel?: string;
    secondaryLabel?: string;
  };
}> = ({ label, labelAm, action, value, exact, footer, meterPct, splitBar }) => (
  <div className="rounded-md flex flex-col border border-slate-200/90 border-b-2 border-b-slate-300 bg-white p-5 transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_4px_6px_rgba(15,23,42,0.06),0_16px_32px_-8px_rgba(15,23,42,0.18)] shadow-[0_3px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)]">
    <div className="flex items-start justify-between gap-2 min-w-0">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-[10px] text-slate-400">{labelAm}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="mt-3 min-w-0 truncate text-xl sm:text-2xl xl:text-3xl font-bold tracking-tight text-slate-900 tabular-nums" title={exact}>{value}</div>
    {exact && <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-500">{exact}</p>}
    <div className="mt-auto space-y-1.5 pt-3">
      {meterPct !== undefined && <Meter pct={meterPct} />}
      {splitBar && (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
          {splitBar.primaryPct > 0 && (
            <div
              className={`h-full transition-all duration-700 ${splitBar.primaryColor || 'bg-emerald-600'} ${splitBar.primaryPct >= 100 ? 'rounded-full' : 'rounded-l-full'}`}
              style={{ width: `${Math.min(100, Math.max(0, splitBar.primaryPct))}%` }}
              title={`${splitBar.primaryLabel || 'Primary'}: ${splitBar.primaryPct}%`}
            />
          )}
          {splitBar.primaryPct < 100 && (
            <div
              className={`h-full transition-all duration-700 ${splitBar.secondaryColor || 'bg-slate-300'} ${splitBar.primaryPct <= 0 ? 'rounded-full' : 'rounded-r-full'}`}
              style={{ width: `${Math.min(100, Math.max(0, 100 - splitBar.primaryPct))}%` }}
              title={`${splitBar.secondaryLabel || 'Secondary'}: ${100 - splitBar.primaryPct}%`}
            />
          )}
        </div>
      )}
      <div className="text-[11px] text-slate-500">{footer}</div>
    </div>
  </div>
);

/** Compact count tile for the workflow row. `tone` is reserved for real states. */
const WorkTile: React.FC<{
  label: string;
  count: number;
  onClick?: () => void;
  tone?: 'neutral' | 'warning' | 'critical';
  note?: string;
}> = ({ label, count, onClick, tone = 'neutral', note }) => {
  const badgeTone =
    tone === 'critical'
      ? 'bg-rose-50 text-rose-700 border border-rose-200'
      : tone === 'warning'
      ? 'bg-amber-50 text-amber-800 border border-amber-200'
      : 'bg-slate-100 text-slate-700 border border-slate-200';
  const content = (
    <div className="min-w-0 w-full">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold font-mono leading-tight text-slate-900">{count}</span>
        {note && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] ${badgeTone}`}>{note}</span>}
      </div>
      <span className="block text-xs font-semibold text-slate-700 mt-1">{label}</span>
    </div>
  );
  const cls = 'flex items-center gap-3 rounded-md border border-slate-200/90 border-b-2 border-b-slate-300 bg-white p-3.5 text-left shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)]';
  return onClick ? (
    <button onClick={onClick} className={`${cls} transition duration-200 hover:border-emerald-300 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_20px_-6px_rgba(15,23,42,0.16)] cursor-pointer w-full`}>
      {content}
    </button>
  ) : (
    <div className={`${cls} w-full`}>{content}</div>
  );
};

/** Coloured dot + text label; the colour is never the only cue. */
const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
);

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const s = ITEM_STATUS_STYLE[status] || { label: status.replace(/_/g, ' ').toLowerCase(), color: '#cbd5e1' };
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
      <Dot color={s.color} />
      {s.label}
    </span>
  );
};

/** Stacked bar with 2px gaps between segments and a legend of labelled counts. */
const SegmentBar: React.FC<{ segments: { key: string; label: string; count: number; color: string }[]; height?: string }> = ({
  segments,
  height = 'h-2.5',
}) => {
  const visible = segments.filter((s) => s.count > 0);
  const total = visible.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return <div className={`${height} w-full rounded-full bg-slate-100`} />;
  return (
    <div className={`flex ${height} w-full gap-0.5 overflow-hidden rounded-full`}>
      {visible.map((s) => (
        <div
          key={s.key}
          title={`${s.label}: ${s.count}`}
          className="h-full first:rounded-l-full last:rounded-r-full transition-all"
          style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
    <p className="text-xs">{children}</p>
  </div>
);

// ─── Page ───────────────────────────────────────────────────────────────────

/** What the dashboard is narrowed to; remembered in this browser */
interface DashboardFilters {
  storeId: string;
  category: string;
  itemType: string;
  /** A preset on the Ethiopian fiscal calendar, 'custom' for the dates below, or '' for all time */
  period: '' | PeriodKey | 'custom';
  from: string;
  to: string;
}
const NO_FILTERS: DashboardFilters = { storeId: '', category: '', itemType: '', period: '', from: '', to: '' };
const FILTERS_KEY = 'moa_dashboard_filters';
const recallFilters = (): DashboardFilters => {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...NO_FILTERS, ...saved } : NO_FILTERS;
  } catch {
    return NO_FILTERS;
  }
};
const ITEM_TYPE_OPTIONS = [
  { value: 'FIXED', label: 'Fixed assets' },
  { value: 'CONSUMABLE', label: 'Consumables' },
];

export const ExecutiveDashboardPage: React.FC<ExecutiveDashboardPageProps> = ({
  onNavigate,
  selectedCenter,
  setSelectedCenter,
}) => {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(recallFilters);
  const [stores, setStores] = useState<Store[]>([]);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(() => {
    if (typeof document !== 'undefined') {
      return document.getElementById('page-header-actions');
    }
    return null;
  });
  const [isStaleExpanded, setIsStaleExpanded] = useState(false);
  const [locationsViewMode, setLocationsViewMode] = useState<'table' | 'grid'>('table');

  // Synchronize store selection from TopHeader with dashboard filters
  useEffect(() => {
    if (selectedCenter !== undefined) {
      const storeFromHeader = selectedCenter === 'ALL' ? '' : selectedCenter;
      if (storeFromHeader !== filters.storeId) {
        setFilters((prev) => {
          const next = { ...prev, storeId: storeFromHeader };
          try {
            localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    }
  }, [selectedCenter]);
  useEffect(() => {
    const el = document.getElementById('page-header-actions');
    if (el && el !== headerSlot) {
      setHeaderSlot(el);
    }
  }, [headerSlot]);

  // The stores to choose from; the dashboard works without them
  useEffect(() => {
    api.getStores().then(setStores).catch(() => setStores([]));
  }, []);

  const changeFilters = (next: DashboardFilters) => {
    setFilters(next);
    if (setSelectedCenter && next.storeId !== undefined) {
      setSelectedCenter(next.storeId || 'ALL');
    }
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch {
      // Not remembered when storage is unavailable
    }
  };
  // The dates the period covers: a preset as of today, or the custom range (either end may be open)
  const period =
    filters.period === 'custom'
      ? filters.from || filters.to
        ? { from: filters.from, to: filters.to, label: `${filters.from || '…'} – ${filters.to || '…'}` }
        : undefined
      : filters.period
        ? periodRange(filters.period, getTodayGcAndEc().gc)
        : undefined;
  const request = { storeId: filters.storeId, category: filters.category, itemType: filters.itemType, from: period?.from ?? '', to: period?.to ?? '' };
  const activeFilterCount = [filters.storeId, filters.category, filters.itemType, period].filter(Boolean).length;
  const storeName = stores.find((st) => st.id === filters.storeId)?.name ?? 'Store';
  const categoryName = CATEGORY_OPTIONS.find((c) => c.value === filters.category)?.label ?? filters.category;
  const itemTypeName = ITEM_TYPE_OPTIONS.find((t) => t.value === filters.itemType)?.label ?? filters.itemType;

  const fetchDashboard = async (current: typeof request = request) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExecutiveDashboard(current);
      setData(res);
    } catch (err: any) {
      const msg = err.message || 'Failed to load executive metrics.';
      setError(msg);
      toast.error('Dashboard Sync Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // Load again whenever the filters change, and when a request is decided elsewhere
  useEffect(() => {
    fetchDashboard(request);
    const handleUpdate = () => {
      fetchDashboard(request);
    };
    window.addEventListener('moa_approvals_updated', handleUpdate);
    return () => window.removeEventListener('moa_approvals_updated', handleUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.storeId, request.category, request.itemType, request.from, request.to]);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-white border border-rose-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <div className="w-3 h-3 rounded-full bg-rose-600 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-900">Couldn't load the dashboard</h3>
        <p className="text-xs text-slate-600">{error}</p>
        <button onClick={() => fetchDashboard()} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-[4px] transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalItems        = data?.totalItems          || 0;
  const totalRecords      = data?.totalRecords        || 0;
  const availableCount    = data?.availableCount       || 0;
  const issuedCount       = data?.issuedCount          || 0;
  const pendingApprovals  = data?.pendingApprovalsCount || 0;
  const pendingApprovalsValuationETB = data?.pendingApprovalsValuationETB || 0;
  const pendingStageCounts = data?.pendingStageCounts || { stage1: 0, stage2: 0, departmentHead: 0, executive: 0 };
  const pendingStockIn    = data?.pendingStockInCount   || 0;
  const pendingStockOut   = data?.pendingStockOutCount  || 0;
  const pendingTransfer   = data?.pendingTransferCount  || 0;
  const pendingDisposal   = data?.pendingDisposalCount  || 0;
  const pendingDisposalValuationETB = data?.pendingDisposalValuationETB || 0;
  const totalValuation    = data?.totalValuationETB     || 0;
  const fixedAssetsCount  = data?.fixedAssetsCount      || 0;
  const fixedAssetsValuationETB = data?.fixedAssetsValuationETB || 0;
  const consumableCount   = data?.consumableCount       || 0;
  const consumableValuationETB = data?.consumableValuationETB || 0;
  const issuedValuation   = data?.issuedValuationETB    || 0;
  const availableValuation= data?.availableValuationETB || 0;
  const unassignedCount   = data?.unassignedItemsCount  || 0;
  const fleetStats = data?.fleetStats || {
    totalVehicles: 0,
    vehicleValuationETB: 0,
    activeVehicles: 0,
    inStoreVehicles: 0,
    totalMachinery: 0,
    machineryValuationETB: 0,
    activeMachinery: 0,
    inStoreMachinery: 0,
  };

  const issuedPct    = totalItems > 0 ? Math.round((issuedCount / totalItems) * 100) : 0;
  const availablePct = totalItems > 0 ? Math.round((availableCount / totalItems) * 100) : 0;

  const deptRows: any[] = (data?.departmentDistribution || [])
    .filter((d: any) => d.itemCount > 0)
    .sort((a: any, b: any) => b.totalValueETB - a.totalValueETB)
    .slice(0, 6);
  const deptMaxVal = deptRows.length > 0 ? deptRows[0].totalValueETB : 1;

  // Categories in their fixed order so colours never shift
  const categoryRows: any[] = (data?.categoryBreakdown || [])
    .filter((c: any) => c.count > 0)
    .sort((a: any, b: any) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

  // Items that should have been distributed: in store longer than the limit (30 days)
  const stale = data?.staleInStore || { thresholdDays: 30, itemCount: 0, units: 0, valueETB: 0, items: [] };
  const staleItems: any[] = stale.items || [];
  const showStale = () => {
    setIsStaleExpanded(true);
    setTimeout(() => {
      document.getElementById('stale-in-store')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  const topAssets: any[] = (data?.topValuationAssets || []).slice(0, 6);
  const storeLocations: any[] = data?.locationUtilization || [];
  const activeLocations = storeLocations.filter((l: any) => l.itemCount > 0).length;
  const recentLogs: any[] = data?.recentAuditLogs || [];

  // Active filter chips component
  const filterChips = activeFilterCount > 0 && (
    <>
      {[
        filters.storeId && { key: 'storeId', label: storeName },
        filters.category && { key: 'category', label: categoryName },
        filters.itemType && { key: 'itemType', label: itemTypeName },
        period && { key: 'period', label: period.label },
      ]
        .filter(Boolean)
        .map((chip) => {
          const c = chip as { key: keyof DashboardFilters; label: string };
          return (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-2.5 pr-1 font-medium text-emerald-900 text-xs">
              {c.label}
              <button
                type="button"
                onClick={() => changeFilters(c.key === 'period' ? { ...filters, period: '', from: '', to: '' } : { ...filters, [c.key]: '' })}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
    </>
  );

  const filterPopoverElement = (
    <FilterPopover
      label="Filter"
      ariaLabel="Filter the dashboard"
      title="Filters"
      resetLabel="Reset"
      align="right"
      activeCount={activeFilterCount}
      onReset={() => changeFilters(NO_FILTERS)}
    >
      <FilterSection label="Period" htmlFor="dashboard-filter-period">
        <FilterSelect
          id="dashboard-filter-period"
          value={filters.period || 'ALL'}
          onChange={(v) => changeFilters({ ...filters, period: v === 'ALL' ? '' : (v as DashboardFilters['period']) })}
          placeholder="All time"
          options={[...PERIOD_OPTIONS, { value: 'custom', label: 'Custom range…' }]}
        />
        {filters.period === 'custom' ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">
              From
              <input
                type="date"
                aria-label="From"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => changeFilters({ ...filters, from: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-[4px] border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
              {filters.from && <span className="block">{formatGcToEc(filters.from)} E.C.</span>}
            </label>
            <label className="text-[11px] text-slate-500">
              To
              <input
                type="date"
                aria-label="To"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => changeFilters({ ...filters, to: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-[4px] border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
              {filters.to && <span className="block">{formatGcToEc(filters.to)} E.C.</span>}
            </label>
          </div>
        ) : (
          period && <p className="mt-1 text-[11px] text-slate-500">{period.from} – {period.to} G.C.</p>
        )}
      </FilterSection>
      <FilterSection label="Store" htmlFor="dashboard-filter-store">
        <FilterSelect
          id="dashboard-filter-store"
          value={filters.storeId || 'ALL'}
          onChange={(v) => changeFilters({ ...filters, storeId: v === 'ALL' ? '' : v })}
          placeholder="All stores"
          options={stores.filter((st) => st.isActive !== false || st.id === filters.storeId).map((st) => ({ value: st.id, label: st.name }))}
        />
      </FilterSection>
      <FilterSection label="Category" htmlFor="dashboard-filter-category">
        <FilterSelect
          id="dashboard-filter-category"
          value={filters.category || 'ALL'}
          onChange={(v) => changeFilters({ ...filters, category: v === 'ALL' ? '' : v })}
          placeholder="All categories"
          options={CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
        />
      </FilterSection>
      <FilterSection label="Item type" htmlFor="dashboard-filter-type">
        <FilterSelect
          id="dashboard-filter-type"
          value={filters.itemType || 'ALL'}
          onChange={(v) => changeFilters({ ...filters, itemType: v === 'ALL' ? '' : v })}
          placeholder="Fixed assets and consumables"
          options={ITEM_TYPE_OPTIONS}
        />
      </FilterSection>
    </FilterPopover>
  );

  const headerContent = (
    <div className="flex items-center gap-2">
      {loading && data && (
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" aria-label="Updating" />
      )}
      {filterPopoverElement}
    </div>
  );

  return (
    <div className="space-y-4 animate-fadeIn pb-16">
      <StoreManReminder onAssign={() => onNavigate('settings-stores')} />

      {headerSlot ? (
        createPortal(headerContent, headerSlot)
      ) : (
        <div className="flex justify-end">{headerContent}</div>
      )}

      {/* Active filter chips: minimal chip row only shown when filters are active */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">Filtered by:</span>
          {filterChips}
          <button
            type="button"
            onClick={() => changeFilters(NO_FILTERS)}
            className="text-xs text-rose-700 hover:text-rose-800 hover:underline font-medium ml-1.5 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Row 1: KPI tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total valuation"
          labelAm="ጠቅላላ የካፒታል ንብረት ዋጋ"
          value={formatETBShort(totalValuation)}
          exact={totalValuation >= 1_000_000 ? formatETB(totalValuation) : undefined}
          splitBar={
            totalValuation > 0 && (fixedAssetsValuationETB > 0 || consumableValuationETB > 0)
              ? {
                  primaryPct: Math.round((fixedAssetsValuationETB / totalValuation) * 100),
                  primaryColor: 'bg-emerald-600',
                  secondaryColor: 'bg-violet-500',
                  primaryLabel: 'Fixed Assets',
                  secondaryLabel: 'Consumables',
                }
              : undefined
          }
          footer={
            <div className="space-y-1 pt-0.5 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Fixed Assets:</span>
                <span className="tabular-nums font-semibold text-emerald-800 text-[11px] whitespace-nowrap" title={formatETB(fixedAssetsValuationETB)}>
                  {formatETBShort(fixedAssetsValuationETB)}{' '}
                  {totalValuation > 0 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({formatAssetPct(fixedAssetsValuationETB, totalValuation)})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Consumables:</span>
                <span className="tabular-nums font-semibold text-violet-800 text-[11px] whitespace-nowrap" title={formatETB(consumableValuationETB)}>
                  {formatETBShort(consumableValuationETB)}{' '}
                  {totalValuation > 0 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({formatAssetPct(consumableValuationETB, totalValuation)})
                    </span>
                  )}
                </span>
              </div>
            </div>
          }
        />
        <StatTile
          label="Total assets"
          labelAm="በመዝገብ ላይ ያለ ጠቅላላ ንብረት"
          action={
            totalRecords > 0 ? (
              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {totalRecords.toLocaleString()} {totalRecords === 1 ? 'item' : 'items'}
              </span>
            ) : undefined
          }
          value={
            <span>
              {totalItems.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-slate-400">
                {totalItems === 1 ? 'unit' : 'units'}
              </span>
            </span>
          }
          splitBar={{
            primaryPct: totalItems > 0 && issuedCount > 0 ? Math.max(2, Math.round((issuedCount / totalItems) * 100)) : 0,
            primaryColor: 'bg-emerald-600',
            secondaryColor: 'bg-slate-300',
            primaryLabel: `With Staff (${formatAssetPct(issuedCount, totalItems)})`,
            secondaryLabel: `In Store (${formatAssetPct(availableCount, totalItems)})`,
          }}
          footer={
            <div className="space-y-1 pt-0.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 text-[11px]" title="Available in storehouse / warehouse">
                  In Store:
                </span>
                <span className="tabular-nums font-semibold text-slate-900 text-[11px]">
                  {availableCount.toLocaleString()} {availableCount === 1 ? 'unit' : 'units'}{' '}
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({formatAssetPct(availableCount, totalItems)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-800 text-[11px]" title="Issued to employees on Model 22">
                  With Staff:
                </span>
                <span className="tabular-nums font-semibold text-slate-900 text-[11px]">
                  {issuedCount.toLocaleString()} {issuedCount === 1 ? 'unit' : 'units'}{' '}
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({formatAssetPct(issuedCount, totalItems)})
                  </span>
                </span>
              </div>
            </div>
          }
        />
        <StatTile
          label="Approvals in pipeline"
          labelAm="ውሳኔ የሚጠብቁ ጥያቄዎች"
          action={
            pendingApprovals > 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
              >
                Review &rarr;
              </button>
            ) : undefined
          }
          value={
            <span>
              {pendingApprovals}
              <span className="ml-1 text-sm font-normal text-slate-400">pending</span>
            </span>
          }
          footer={
            pendingApprovals > 0 ? (
              <div className="space-y-1 pt-0.5 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Team Lead:</span>
                  <span className="font-semibold text-amber-800 tabular-nums">
                    {pendingStageCounts.stage1}
                  </span>
                </div>
                {/* Stage 2 by who authorizes it: above 10 million birr (a voucher by its grand total) the Chief Director */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Dept Head:</span>
                  <span className="font-semibold text-blue-800 tabular-nums">
                    {pendingStageCounts.departmentHead ?? pendingStageCounts.stage2}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Executive (&gt; 10M):</span>
                  <span className="font-semibold text-purple-800 tabular-nums">
                    {pendingStageCounts.executive ?? 0}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-emerald-700 font-medium text-[11px]">All queues clear</span>
            )
          }
        />
        <StatTile
          label="Idle capital (>30 days)"
          labelAm="ከ30 ቀን በላይ በመጋዘን የቆየ"
          action={
            stale.itemCount > 0 ? (
              <button
                type="button"
                onClick={showStale}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline cursor-pointer"
              >
                View &rarr;
              </button>
            ) : undefined
          }
          value={formatETBShort(stale.valueETB)}
          exact={stale.valueETB >= 1_000_000 ? formatETB(stale.valueETB) : undefined}
          footer={
            stale.itemCount > 0 ? (
              <div className="space-y-1 pt-0.5 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Stale Stock:</span>
                  <span className="tabular-nums font-semibold text-amber-800 text-[11px]">
                    {stale.units.toLocaleString()} {stale.units === 1 ? 'unit' : 'units'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Affected Items:</span>
                  <span className="tabular-nums font-semibold text-slate-700 text-[11px]">
                    {stale.itemCount.toLocaleString()} {stale.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-emerald-700 font-medium text-[11px]">Zero stagnant inventory in stores</span>
            )
          }
        />
      </div>

      {/* ── Row 2: Workflow counts ──────────────────────────────────────────── */}
      {(pendingApprovals > 0 || pendingStockIn > 0 || pendingStockOut > 0 || pendingTransfer > 0 || pendingDisposal > 0 || stale.itemCount > 0) && (
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold text-slate-800">
            Needs attention
            <span className="text-[10px] font-normal text-slate-400">ትኩረት የሚሹ</span>
          </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {pendingApprovals > 0 && (
            <WorkTile
              label="Pending approvals"
              count={pendingApprovals}
              tone="warning"
              note={pendingApprovalsValuationETB > 0 ? `${formatETBShort(pendingApprovalsValuationETB)} · Action required` : 'Needs action'}
              onClick={() => onNavigate('approvals')}
            />
          )}
          {pendingStockIn > 0 && (
            <WorkTile label="Pending stock-in" count={pendingStockIn} note="Receiving & inspection" onClick={() => onNavigate('assets')} />
          )}
          {pendingStockOut > 0 && (
            <WorkTile label="Pending stock-out" count={pendingStockOut} note="Model 22 issuance" onClick={() => onNavigate('assets')} />
          )}
          {pendingTransfer > 0 && (
            <WorkTile label="Pending transfers" count={pendingTransfer} note="Custodian handovers" onClick={() => onNavigate('assets')} />
          )}
          {pendingDisposal > 0 && (
            <WorkTile
              label="Pending disposals"
              count={pendingDisposal}
              tone="critical"
              note={pendingDisposalValuationETB > 0 ? `${formatETBShort(pendingDisposalValuationETB)} · Model 28` : 'Disposal queue'}
              onClick={() => onNavigate('assets')}
            />
          )}
          {stale.itemCount > 0 && (
            <WorkTile
              label={`In store over ${stale.thresholdDays} days`}
              count={stale.itemCount}
              tone="warning"
              note={`${formatETBShort(stale.valueETB)} · ${stale.units.toLocaleString()} ${stale.units === 1 ? 'unit' : 'units'}`}
              onClick={showStale}
            />
          )}
        </div>
        </section>
      )}

      {/* ── Items in store too long ─────────────────────────────────────────── */}
      <div id="stale-in-store" className="scroll-mt-20">
        <Panel
          title={`In store over ${stale.thresholdDays} days`}
          subtitle={`ከ${stale.thresholdDays} ቀን በላይ በመጋዘን የቆዩ ዕቃዎች · items should be distributed within a month of arriving`}
        >
          {staleItems.length === 0 ? (
            <EmptyState>Nothing has been in store for more than {stale.thresholdDays} days.</EmptyState>
          ) : (
            <div className="space-y-4">
              {/* Summary: what is overdue in total */}
              <div className="flex flex-col gap-4 rounded-md border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 px-2.5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-900 font-mono text-[11px] font-bold">ATTN</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">These items should have been distributed by now</p>
                    <p className="text-[11px] text-amber-800/80">
                      Each has stayed in store longer than {stale.thresholdDays} days since it arrived.
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 sm:gap-6 text-right">
                  {[
                    { label: stale.itemCount === 1 ? 'Item' : 'Items', value: stale.itemCount.toLocaleString() },
                    { label: stale.units === 1 ? 'Unit' : 'Units', value: stale.units.toLocaleString() },
                    { label: 'Value', value: formatETB(stale.valueETB) },
                  ].map((s) => (
                    <div key={s.label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/70">{s.label}</dt>
                      <dd className="text-base font-semibold text-slate-900 whitespace-nowrap">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Collapsible toggle bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsStaleExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                >
                  {isStaleExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isStaleExpanded ? 'Hide item-level details' : `Inspect ${staleItems.length} overdue inventory items`}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('assets')}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <span>Open in Asset Register</span>
                  &rarr;
                </button>
              </div>

              {/* One row per item, oldest first (collapsed by default to prevent dashboard clutter) */}
              {isStaleExpanded && (
                <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-auto pt-2">
                  {staleItems.map((i: any) => {
                    const overdue = Math.max(0, i.daysInStore - stale.thresholdDays);
                    const overduePct = Math.min(100, Math.round((overdue / stale.thresholdDays) * 100));
                    const arrived = i.inStoreSinceGc
                      ? new Date(`${i.inStoreSinceGc}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—';
                    return (
                      <li key={i.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{i.name}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                              <span className="font-mono">{i.itemCode}</span>
                              <span>· Arrived {arrived}</span>
                              {i.issuePending && (
                                <span className="rounded-full border border-slate-200 bg-white px-1.5 py-px text-[10px] font-medium text-slate-600">
                                  Issue requested
                                </span>
                              )}
                              {i.disposalPending && (
                                <span className="rounded-full border border-slate-200 bg-white px-1.5 py-px text-[10px] font-medium text-slate-600">
                                  Disposal requested
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="w-full sm:w-44">
                          <div className="flex items-baseline justify-between text-[11px]">
                            <span className="font-semibold text-amber-800">
                              Overdue by {overdue} {overdue === 1 ? 'day' : 'days'}
                            </span>
                            <span className="text-slate-400">{i.daysInStore}d</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(6, overduePct)}%` }} />
                          </div>
                        </div>

                        <div className="flex shrink-0 items-baseline justify-between gap-4 sm:w-40 sm:flex-col sm:items-end sm:gap-0">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            {i.unitsInStore} {i.uom}
                          </span>
                          <span className="text-[11px] text-slate-500">{formatETB(i.valueETB)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 3: Directorates + categories ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Panel
          className="lg:col-span-7"
          title="Directorate allocation"
          subtitle={deptRows.length > 0 ? 'Asset value held by each directorate' : 'No assets assigned to directorates yet'}
          action={<CountPill>{deptRows.length} directorates</CountPill>}
        >
          {deptRows.length === 0 ? (
            <EmptyState>No directorate allocations yet. Issue items to directorates from Assets.</EmptyState>
          ) : (
            <div className="space-y-4">
              {deptRows.map((dept: any) => {
                const pct = Math.min(100, Math.round((dept.totalValueETB / deptMaxVal) * 100));
                return (
                  <div key={dept.departmentId} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{dept.nameEn}</span>
                        <span className="text-[10px] text-slate-400">{dept.nameAm}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block font-semibold text-slate-900">{formatETB(dept.totalValueETB)}</span>
                        <span className="text-[10px] text-slate-500">{dept.itemCount.toLocaleString()} {dept.itemCount === 1 ? 'unit' : 'units'} · {dept.issuedCount.toLocaleString()} issued</span>
                      </div>
                    </div>
                    <Meter pct={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-5" title="Asset categories" subtitle="የንብረት አይነት ስርጭት">
          {categoryRows.length === 0 ? (
            <EmptyState>No items registered yet.</EmptyState>
          ) : (
            <div className="space-y-4">
              <Donut
                label="Units by category"
                empty="No items registered yet."
                segments={categoryRows.map((c: any) => ({
                  key: c.category,
                  label: CATEGORY_STYLE[c.category]?.en || c.category,
                  color: CATEGORY_STYLE[c.category]?.color || '#cbd5e1',
                  value: c.count,
                }))}
              />

              {/* Strategic Fleet & Heavy Machinery Overview */}
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    High-Value Fleet & Heavy Machinery
                  </span>
                  <span className="text-[10px] text-slate-400">ከፍተኛ ካፒታል</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">Vehicles</span>
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {fleetStats.totalVehicles.toLocaleString()} {fleetStats.totalVehicles === 1 ? 'unit' : 'units'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-bold text-slate-900">{formatETB(fleetStats.vehicleValuationETB)}</p>
                    <p className="text-[10px] text-slate-500">
                      {fleetStats.activeVehicles.toLocaleString()} active · {fleetStats.inStoreVehicles.toLocaleString()} in store
                    </p>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">Agri Machinery</span>
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {fleetStats.totalMachinery.toLocaleString()} {fleetStats.totalMachinery === 1 ? 'unit' : 'units'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-bold text-slate-900">{formatETB(fleetStats.machineryValuationETB)}</p>
                    <p className="text-[10px] text-slate-500">
                      {fleetStats.activeMachinery.toLocaleString()} deployed · {fleetStats.inStoreMachinery.toLocaleString()} in store
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 4: Locations (Warehouse & Store Distribution) ────────────────── */}
      <Panel
        title="Assets by store location"
        subtitle="በማከማቻ ቦታ የተከፋፈለ የንብረት ክምችት · Regional and central warehouses"
        action={
          <div className="flex items-center gap-2">
            <CountPill>{activeLocations} active location{activeLocations !== 1 ? 's' : ''}</CountPill>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-slate-600">
              <button
                type="button"
                title="Table view"
                onClick={() => setLocationsViewMode('table')}
                className={`rounded px-1.5 py-0.5 text-xs transition cursor-pointer ${locationsViewMode === 'table' ? 'bg-white font-medium text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Card grid view"
                onClick={() => setLocationsViewMode('grid')}
                className={`rounded px-1.5 py-0.5 text-xs transition cursor-pointer ${locationsViewMode === 'grid' ? 'bg-white font-medium text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        }
      >
        {storeLocations.length === 0 ? (
          <EmptyState>No store locations configured yet.</EmptyState>
        ) : locationsViewMode === 'table' ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-3.5 py-1.5">Facility / Site</th>
                  <th className="px-3.5 py-1.5">Building & Room</th>
                  <th className="px-3.5 py-1.5 text-right">Total Units</th>
                  <th className="px-3.5 py-1.5">Status Allocation</th>
                  <th className="px-3.5 py-1.5 text-right">Valuation (ETB)</th>
                  <th className="px-3.5 py-1.5">Key Categories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {storeLocations.map((loc: any) => {
                  const total = loc.itemCount || 0;
                  const avail = loc.availableCount || 0;
                  const issued = loc.issuedCount || 0;
                  const pending = loc.pendingCount || 0;
                  const other = Math.max(0, total - avail - issued - pending);
                  const segments = [
                    { key: 'AVAILABLE', ...ITEM_STATUS_STYLE.AVAILABLE, count: avail },
                    { key: 'ISSUED', ...ITEM_STATUS_STYLE.ISSUED, count: issued },
                    { key: 'PENDING', ...ITEM_STATUS_STYLE.PENDING, count: pending },
                    { key: 'OTHER', ...ITEM_STATUS_STYLE.OTHER, count: other },
                  ];
                  const topCats = (loc.categoryBreakdown || []).slice(0, 2);

                  return (
                    <tr key={loc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-2 font-medium text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => loc.storeId && changeFilters({ ...filters, storeId: loc.storeId })}
                            title={`Filter dashboard to ${loc.siteName}`}
                            className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-emerald-700 hover:underline cursor-pointer"
                          >
                            {loc.siteName}
                          </button>
                          {loc.isCentralStore && (
                            <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
                              Central
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 text-slate-500 whitespace-nowrap">
                        {loc.building} — {loc.roomNumber}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {total.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2 min-w-[150px]">
                        <SegmentBar segments={segments} height="h-2" />
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
                          {avail > 0 && <span className="text-emerald-700 font-medium">{avail} ready</span>}
                          {issued > 0 && <span>{issued} issued</span>}
                          {pending > 0 && <span className="text-amber-700">{pending} pending</span>}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatETB(loc.totalValueETB || 0)}
                      </td>
                      <td className="px-3.5 py-2 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {topCats.map((cat: any) => (
                            <span key={cat.category} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-600">
                              {CATEGORY_STYLE[cat.category]?.en || cat.category} ({cat.count})
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {storeLocations.map((loc: any) => {
              const total = loc.itemCount || 0;
              const avail = loc.availableCount || 0;
              const issued = loc.issuedCount || 0;
              const pending = loc.pendingCount || 0;
              const other = Math.max(0, total - avail - issued - pending);
              const segments = [
                { key: 'AVAILABLE', ...ITEM_STATUS_STYLE.AVAILABLE, count: avail },
                { key: 'ISSUED', ...ITEM_STATUS_STYLE.ISSUED, count: issued },
                { key: 'PENDING', ...ITEM_STATUS_STYLE.PENDING, count: pending },
                { key: 'OTHER', ...ITEM_STATUS_STYLE.OTHER, count: other },
              ];
              const topCats = (loc.categoryBreakdown || []).slice(0, 3);

              return (
                <div key={loc.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">{loc.siteName}</span>
                        {loc.isCentralStore && (
                          <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            Central
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{loc.building} — {loc.roomNumber}</p>
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <span className="block text-xl font-semibold text-slate-900">{total.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500">{total === 1 ? 'unit' : 'units'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="text-slate-500">Total value</span>
                    <span className="font-semibold text-slate-900">{formatETB(loc.totalValueETB || 0)}</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <SegmentBar segments={segments} />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      {total === 0 ? (
                        <span className="text-slate-400">Empty</span>
                      ) : (
                        segments
                          .filter((s) => s.count > 0)
                          .map((s) => (
                            <span key={s.key} className="flex items-center gap-1.5">
                              <Dot color={s.color} />
                              {s.count} {s.label.toLowerCase()}
                            </span>
                          ))
                      )}
                    </div>
                  </div>

                  {topCats.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Top categories</p>
                      <div className="flex flex-wrap gap-1">
                        {topCats.map((cat: any) => (
                          <span key={cat.category} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700">
                            {CATEGORY_STYLE[cat.category]?.en || cat.category} ({cat.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Row 5: Highest-Value Assets & Executive Governance (Side-by-Side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="Highest-value capital assets"
          subtitle="ከፍተኛ ዋጋ ያላቸው ንብረቶች"
          action={<LinkButton onClick={() => onNavigate('assets')}>View all</LinkButton>}
        >
          {topAssets.length === 0 ? (
            <EmptyState>No assets registered yet.</EmptyState>
          ) : (
            <ol className="divide-y divide-slate-100">
              {topAssets.map((asset: any, idx: number) => (
                <li key={asset.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 shrink-0 text-xs font-medium text-slate-400">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900">{asset.name}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10px] text-slate-500">
                      <span>{asset.itemCode}</span>
                      {asset.assignedDepartment?.nameEn && (
                        <span className="font-sans text-slate-400">· {asset.assignedDepartment.nameEn}</span>
                      )}
                      {asset.currentCustodian?.fullNameEn && (
                        <span className="font-sans text-slate-400">({asset.currentCustodian.fullNameEn})</span>
                      )}
                    </p>
                  </div>
                  <StatusTag status={asset.status} />
                  <span className="w-28 shrink-0 text-right text-xs font-semibold text-slate-900">{formatETB(asset.unitCostETB)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title="Executive governance & activity"
          subtitle="ቅርብ ጊዜ የስርዓት ድርጊቶችና የኦዲት መዝገብ"
          action={<LinkButton onClick={() => onNavigate('audit')}>Full audit log</LinkButton>}
        >
          {recentLogs.length === 0 ? (
            <EmptyState>No activity recorded yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentLogs.slice(0, 6).map((log: any) => {
                const tone = getActionTone(log.action);
                return (
                  <li key={log.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
                      {log.action.replace(/^REGISTER_/, '')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium capitalize text-slate-900">
                          {actionText(log.action)}
                        </p>
                        {log.ifmisSlipNumber && (
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">#{log.ifmisSlipNumber}</span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">{withRoleNames(log.details)}</p>
                      <p className="text-[10px] text-slate-400">{log.userName} · {log.timestampEc || log.timestampGc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};
