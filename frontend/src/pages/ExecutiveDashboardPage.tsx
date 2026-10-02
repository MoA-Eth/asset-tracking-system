import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  Warehouse,
  UserCheck,
  Banknote,
  ShieldCheck,
  Building2,
  Award,
  Activity,
  TrendingUp,
  AlertTriangle,
  Package,
  ArrowRightLeft,
  RotateCcw,
  FileText,
  XCircle,
  Eye,
  BarChart3,
  LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { formatETB } from '../utils/eth-date';
import { UserRole } from '../types/asset-management';
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
};
const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE);

/** Item lifecycle states, shared by every status bar and badge on the page. */
const ITEM_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  AVAILABLE:         { label: 'Available',         color: '#0ca30c' },
  ISSUED:            { label: 'Issued',            color: '#2a78d6' },
  PENDING:           { label: 'Pending',           color: '#eda100' },
  PENDING_STOCK_IN:  { label: 'Pending stock-in',  color: '#eda100' },
  PENDING_STOCK_OUT: { label: 'Pending stock-out', color: '#eda100' },
  UNDER_TRANSFER:    { label: 'Under transfer',    color: '#eda100' },
  DISPOSED:          { label: 'Disposed',          color: '#94a3b8' },
  OTHER:             { label: 'Other',             color: '#cbd5e1' },
};

/** Physical condition uses the status scale: good → warning → serious → critical. */
const CONDITION_STYLE: Record<string, { label: string; color: string }> = {
  NEW:          { label: 'New',          color: '#0ca30c' },
  GOOD:         { label: 'Good',         color: '#0ca30c' },
  FAIR:         { label: 'Fair',         color: '#eda100' },
  NEEDS_REPAIR: { label: 'Needs repair', color: '#ec835a' },
  DAMAGED:      { label: 'Damaged',      color: '#d03b3b' },
};

const ACTION_ICON: Record<string, LucideIcon> = {
  REGISTER_STOCK_IN: Package,
  REGISTER_HISTORICAL_ITEM: Package,
  REGISTER_STOCK_OUT: ArrowRightLeft,
  REGISTER_TRANSFER: ArrowRightLeft,
  TRANSFER_ITEM: ArrowRightLeft,
  REGISTER_RETURN: RotateCcw,
};

function getActionVisual(action: string): { icon: LucideIcon; tone: string } {
  if (action.startsWith('APPROVE')) return { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' };
  if (action.startsWith('REJECT')) return { icon: XCircle, tone: 'bg-rose-50 text-rose-700' };
  if (action.startsWith('ENDORSE')) return { icon: FileText, tone: 'bg-slate-100 text-slate-600' };
  return { icon: ACTION_ICON[action] || Activity, tone: 'bg-slate-100 text-slate-600' };
}

// ─── Building blocks ────────────────────────────────────────────────────────

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, action, className = '', children }) => (
  <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs ${className}`}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="h-4 w-4 shrink-0 text-emerald-700" />
          {title}
        </h2>
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

const StatTile: React.FC<{
  label: string;
  labelAm: string;
  icon: LucideIcon;
  value: React.ReactNode;
  footer: React.ReactNode;
  meterPct?: number;
}> = ({ label, labelAm, icon: Icon, value, footer, meterPct }) => (
  <div className="flex flex-col rounded-2xl border border-b-2 border-slate-200 border-b-slate-300 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-6px_rgba(15,23,42,0.12)] transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_14px_28px_-8px_rgba(15,23,42,0.18)]">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400">{labelAm}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 wrap-anywhere">{value}</p>
    <div className="mt-auto space-y-1.5 pt-3">
      {meterPct !== undefined && <Meter pct={meterPct} />}
      <p className="text-[11px] text-slate-500">{footer}</p>
    </div>
  </div>
);

/** Compact count tile for the workflow row. `tone` is reserved for real states. */
const WorkTile: React.FC<{
  label: string;
  count: number;
  icon: LucideIcon;
  onClick?: () => void;
  tone?: 'neutral' | 'warning' | 'critical';
  note?: string;
}> = ({ label, count, icon: Icon, onClick, tone = 'neutral', note }) => {
  const iconTone =
    tone === 'warning' ? 'bg-amber-100 text-amber-700' : tone === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700';
  const content = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-tight text-slate-900">{count}</span>
        <span className="block text-xs font-medium text-slate-700">{label}</span>
        {note && <span className={`block text-[10px] font-medium ${tone === 'critical' ? 'text-rose-700' : 'text-amber-700'}`}>{note}</span>}
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl border border-b-2 border-slate-200 border-b-slate-300 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_12px_-4px_rgba(15,23,42,0.10)]';
  return onClick ? (
    <button onClick={onClick} className={`${cls} transition duration-200 hover:border-emerald-300 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_20px_-6px_rgba(15,23,42,0.16)] cursor-pointer`}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
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

const EmptyState: React.FC<{ icon: LucideIcon; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="py-8 text-center text-slate-400">
    <Icon className="mx-auto mb-2 h-8 w-8 opacity-40" />
    <p className="text-xs">{children}</p>
  </div>
);

// ─── Stock movement chart ───────────────────────────────────────────────────

type MovementMonth = { month: string; received: number; issued: number };

// Validated categorical pair (light surface): series colours follow the entity, never its rank
const MOVEMENT_SERIES = [
  { key: 'received' as const, label: 'Received', color: '#eb6834' },
  { key: 'issued' as const, label: 'Issued', color: '#2a78d6' },
];

const monthLabel = (month: string, withYear = false) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', withYear ? { month: 'long', year: 'numeric' } : { month: 'short' });

/** Rounded-up axis maximum with 4 even steps */
const niceAxis = (max: number) => {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= rough) ?? 10 * mag;
  return { top: step * 4, step };
};

/** Bar with a 4px rounded top, anchored square to the baseline */
const barPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

const StockMovementChart: React.FC<{ months: MovementMonth[] }> = ({ months }) => {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text and bars keep their pixel sizes
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const totals = MOVEMENT_SERIES.map((sr) => months.reduce((sum, m) => sum + m[sr.key], 0));
  const empty = months.length === 0 || totals.every((t) => t === 0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);
  if (empty) {
    return <EmptyState icon={BarChart3}>No stock was received or issued in the last {months.length || 6} months.</EmptyState>;
  }

  const H = 220, left = 36, right = 8, top = 10, bottom = 26;
  const plotW = W - left - right, plotH = H - top - bottom;
  const { top: axisTop, step } = niceAxis(Math.max(...months.map((m) => Math.max(m.received, m.issued))));
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);
  const y = (v: number) => top + plotH - (v / axisTop) * plotH;
  const groupW = plotW / months.length;
  const barW = Math.min(28, (groupW * 0.56 - 2) / 2);
  const gap = 2;
  const hovered = hover === null ? null : months[hover];

  return (
    <div className="space-y-3">
      {/* Legend with 6-month totals */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {MOVEMENT_SERIES.map((sr, i) => (
          <div key={sr.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: sr.color }} aria-hidden />
            <span className="text-xs text-slate-600">{sr.label}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{totals[i].toLocaleString()}</span>
            <span className="text-[11px] text-slate-400">units</span>
          </div>
        ))}
      </div>

      <div ref={boxRef} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = left + groupW * i + groupW / 2;
            return (
              <g key={m.month}>
                {hover === i && <rect x={left + groupW * i + 4} y={top} width={groupW - 8} height={plotH} rx={6} fill="#f8fafc" />}
                {MOVEMENT_SERIES.map((sr, k) => {
                  const v = m[sr.key];
                  if (v <= 0) return null;
                  const x = k === 0 ? cx - gap / 2 - barW : cx + gap / 2;
                  return <path key={sr.key} d={barPath(x, y(v), barW, y(0) - y(v))} fill={sr.color} />;
                })}
                <text x={cx} y={H - 8} textAnchor="middle" className={`text-[11px] ${hover === i ? 'fill-slate-700 font-semibold' : 'fill-slate-500'}`}>
                  {monthLabel(m.month)}
                </text>
                {/* Hit target: the whole month column */}
                <rect
                  x={left + groupW * i}
                  y={top}
                  width={groupW}
                  height={plotH + bottom}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>

        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
            style={{ left: `${((left + groupW * hover + groupW / 2) / W) * 100}%` }}
          >
            <p className="mb-1 text-[11px] font-semibold text-slate-900">{monthLabel(hovered.month, true)}</p>
            {MOVEMENT_SERIES.map((sr) => (
              <p key={sr.key} className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: sr.color }} />
                  {sr.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{hovered[sr.key].toLocaleString()}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Same figures as a table for screen readers */}
      <table className="sr-only">
        <caption>Units received and issued per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Received</th>
            <th scope="col">Issued</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month, true)}</th>
              <td>{m.received}</td>
              <td>{m.issued}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

export const ExecutiveDashboardPage: React.FC<ExecutiveDashboardPageProps> = ({ onNavigate }) => {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExecutiveDashboard();
      setData(res);
    } catch (err: any) {
      const msg = err.message || 'Failed to load executive metrics.';
      setError(msg);
      toast.error('Dashboard Sync Error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[65vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <p className="text-xs font-medium text-slate-600">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-white border border-rose-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-900">Couldn't load the dashboard</h3>
        <p className="text-xs text-slate-600">{error}</p>
        <button onClick={fetchDashboard} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalItems        = data?.totalItems          || 0;
  const availableCount    = data?.availableCount       || 0;
  const issuedCount       = data?.issuedCount          || 0;
  const pendingApprovals  = data?.pendingApprovalsCount || 0;
  const pendingStockIn    = data?.pendingStockInCount   || 0;
  const pendingStockOut   = data?.pendingStockOutCount  || 0;
  const pendingTransfer   = data?.pendingTransferCount  || 0;
  const totalValuation    = data?.totalValuationETB     || 0;
  const issuedValuation   = data?.issuedValuationETB    || 0;
  const availableValuation= data?.availableValuationETB || 0;
  const unassignedCount   = data?.unassignedItemsCount  || 0;

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
  const catTotal = categoryRows.reduce((s: number, c: any) => s + c.count, 0) || 1;

  const condRows: any[] = data?.conditionDistribution || [];
  const condTotal = condRows.reduce((s: number, c: any) => s + c.count, 0) || 1;
  const atRiskCount = condRows
    .filter((c: any) => c.condition === 'NEEDS_REPAIR' || c.condition === 'DAMAGED')
    .reduce((s: number, c: any) => s + c.count, 0);

  // Items that should have been distributed: in store longer than the limit (30 days)
  const stale = data?.staleInStore || { thresholdDays: 30, itemCount: 0, units: 0, valueETB: 0, items: [] };
  const staleItems: any[] = stale.items || [];
  const showStale = () => document.getElementById('stale-in-store')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const stockMovement: MovementMonth[] = data?.stockMovement || [];

  const topAssets: any[] = (data?.topValuationAssets || []).slice(0, 6);
  const storeLocations: any[] = data?.locationUtilization || [];
  const activeLocations = storeLocations.filter((l: any) => l.itemCount > 0).length;
  const recentLogs: any[] = data?.recentAuditLogs || [];

  return (
    <div className="space-y-5 animate-fadeIn pb-16">

      {/* ── Row 1: KPI tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Total valuation"
          labelAm="ጠቅላላ የካፒታል ንብረት ዋጋ"
          icon={Banknote}
          value={formatETB(totalValuation)}
          footer={<>Issued {formatETB(issuedValuation)} · in store {formatETB(availableValuation)}</>}
        />
        <StatTile
          label="Total assets"
          labelAm="በመዝገብ ላይ ያለ ጠቅላላ ንብረት"
          icon={Layers}
          value={<>{totalItems.toLocaleString()}<span className="ml-1 text-sm font-normal text-slate-400">units</span></>}
          footer={unassignedCount > 0 ? `${unassignedCount} not assigned to a directorate` : 'All assets assigned'}
        />
        <StatTile
          label="In store"
          labelAm="በመጋዘን ያለ ዝግጁ ንብረት"
          icon={Warehouse}
          value={<>{availableCount}<span className="ml-1 text-sm font-normal text-slate-400">/ {totalItems}</span></>}
          meterPct={availablePct}
          footer={`${availablePct}% of assets available`}
        />
        <StatTile
          label="Issued"
          labelAm="ወጪ የተደረገ ንብረት"
          icon={UserCheck}
          value={<>{issuedCount}<span className="ml-1 text-sm font-normal text-slate-400">/ {totalItems}</span></>}
          meterPct={issuedPct}
          footer={`${issuedPct}% of assets with custodians`}
        />
      </div>

      {/* ── Row 2: Workflow counts ──────────────────────────────────────────── */}
      {(pendingApprovals > 0 || pendingStockIn > 0 || pendingStockOut > 0 || pendingTransfer > 0 || atRiskCount > 0 || stale.itemCount > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold text-slate-800">
            Needs attention
            <span className="text-[10px] font-normal text-slate-400">ትኩረት የሚሹ</span>
          </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {pendingApprovals > 0 && (
            <WorkTile label="Pending approvals" count={pendingApprovals} icon={Clock} tone="warning" note="Needs action" onClick={() => onNavigate('approvals')} />
          )}
          {pendingStockIn > 0 && (
            <WorkTile label="Pending stock-in" count={pendingStockIn} icon={Package} onClick={() => onNavigate('stock-in')} />
          )}
          {pendingStockOut > 0 && (
            <WorkTile label="Pending stock-out" count={pendingStockOut} icon={ArrowRightLeft} onClick={() => onNavigate('stock-out')} />
          )}
          {pendingTransfer > 0 && (
            <WorkTile label="Pending transfers" count={pendingTransfer} icon={ArrowRightLeft} onClick={() => onNavigate('transfer-asset')} />
          )}
          {atRiskCount > 0 && (
            <WorkTile label="At-risk assets" count={atRiskCount} icon={AlertTriangle} tone="critical" note="Damaged or needs repair" />
          )}
          {stale.itemCount > 0 && (
            <WorkTile
              label={`In store over ${stale.thresholdDays} days`}
              count={stale.itemCount}
              icon={Warehouse}
              tone="warning"
              note={`${stale.units} units · distribute`}
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
          icon={Clock}
        >
          {staleItems.length === 0 ? (
            <EmptyState icon={CheckCircle2}>Nothing has been in store for more than {stale.thresholdDays} days.</EmptyState>
          ) : (
            <div className="space-y-4">
              {/* Summary: what is overdue in total */}
              <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
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
                    { label: 'Units', value: stale.units.toLocaleString() },
                    { label: 'Value', value: formatETB(stale.valueETB) },
                  ].map((s) => (
                    <div key={s.label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/70">{s.label}</dt>
                      <dd className="text-base font-semibold text-slate-900 whitespace-nowrap">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* One row per item, oldest first */}
              <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-auto">
                {staleItems.map((i: any) => {
                  const overdue = Math.max(0, i.daysInStore - stale.thresholdDays);
                  // Bar fills over a further month past the limit
                  const overduePct = Math.min(100, Math.round((overdue / stale.thresholdDays) * 100));
                  const arrived = i.inStoreSinceGc
                    ? new Date(`${i.inStoreSinceGc}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                  return (
                    <li key={i.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <Package className="h-4 w-4" />
                        </span>
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
            </div>
          )}
        </Panel>
      </div>

      {/* ── Stock movement ─────────────────────────────────────────────────── */}
      <Panel title="Stock movement" subtitle="የዕቃ እንቅስቃሴ · units received and issued per month, last 6 months" icon={BarChart3}>
        <StockMovementChart months={stockMovement} />
      </Panel>

      {/* ── Row 3: Directorates + categories ───────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Panel
          className="xl:col-span-7"
          title="Directorate allocation"
          subtitle={deptRows.length > 0 ? 'Asset value held by each directorate' : 'No assets assigned to directorates yet'}
          icon={Building2}
          action={<CountPill>{deptRows.length} directorates</CountPill>}
        >
          {deptRows.length === 0 ? (
            <EmptyState icon={Building2}>No directorate allocations yet. Issue items to directorates via Stock-Out.</EmptyState>
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
                        <span className="text-[10px] text-slate-500">{dept.itemCount} units · {dept.issuedCount} issued</span>
                      </div>
                    </div>
                    <Meter pct={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-5" title="Asset categories" subtitle="የንብረት አይነት ስርጭት" icon={Award}>
          {categoryRows.length === 0 ? (
            <EmptyState icon={Package}>No items registered yet.</EmptyState>
          ) : (
            <div className="space-y-4">
              <SegmentBar
                height="h-3"
                segments={categoryRows.map((c: any) => ({
                  key: c.category,
                  label: CATEGORY_STYLE[c.category]?.en || c.category,
                  count: c.count,
                  color: CATEGORY_STYLE[c.category]?.color || '#cbd5e1',
                }))}
              />
              <ul className="space-y-2">
                {categoryRows.map((cat: any) => {
                  const style = CATEGORY_STYLE[cat.category] || { en: cat.category, am: '', color: '#cbd5e1' };
                  const pct = Math.round((cat.count / catTotal) * 100);
                  return (
                    <li key={cat.category} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <Dot color={style.color} />
                        <span className="truncate text-slate-700">{style.en}</span>
                        <span className="hidden text-[10px] text-slate-400 sm:inline">{style.am}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold text-slate-900">{cat.count}</span>
                        <span className="text-slate-400"> · {pct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 4: Condition + top assets ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Panel className="xl:col-span-5" title="Asset condition" subtitle="የንብረቶች ጤንነት ሁኔታ" icon={Activity}>
          {atRiskCount > 0 && (
            <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-xs text-rose-800">
                <span className="font-semibold">{atRiskCount}</span> asset{atRiskCount !== 1 ? 's' : ''} need attention (damaged or needs repair)
              </p>
            </div>
          )}
          <div className="space-y-3.5">
            {condRows.map((cond: any) => {
              const cfg = CONDITION_STYLE[cond.condition];
              if (!cfg) return null;
              const pct = Math.round((cond.count / condTotal) * 100);
              return (
                <div key={cond.condition} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-700">
                      <Dot color={cfg.color} />
                      {cfg.label}
                    </span>
                    <span>
                      <span className="font-semibold text-slate-900">{cond.count}</span>
                      <span className="text-slate-400"> · {pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          className="xl:col-span-7"
          title="Highest-value assets"
          subtitle="ከፍተኛ ዋጋ ያላቸው ንብረቶች"
          icon={TrendingUp}
          action={<LinkButton onClick={() => onNavigate('stock-in')}>View all</LinkButton>}
        >
          {topAssets.length === 0 ? (
            <EmptyState icon={Award}>No assets registered yet.</EmptyState>
          ) : (
            <ol className="divide-y divide-slate-100">
              {topAssets.map((asset: any, idx: number) => (
                <li key={asset.id} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] sm:flex items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="row-span-2 w-4 shrink-0 text-xs font-medium text-slate-400">{idx + 1}</span>
                  <div className="col-span-2 min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900">{asset.name}</p>
                    <p className="wrap-anywhere font-mono text-[10px] text-slate-500">{asset.itemCode}</p>
                  </div>
                  <StatusTag status={asset.status} />
                  <span className="sm:w-28 shrink-0 text-right text-xs font-semibold text-slate-900">{formatETB(asset.unitCostETB)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* ── Row 5: Locations ───────────────────────────────────────────────── */}
      <Panel
        title="Assets by location"
        subtitle="በማከማቻ ቦታ የተከፋፈለ የንብረት ክምችት"
        icon={Warehouse}
        action={<CountPill>{activeLocations} active location{activeLocations !== 1 ? 's' : ''}</CountPill>}
      >
        {storeLocations.length === 0 ? (
          <EmptyState icon={Warehouse}>No store locations configured yet.</EmptyState>
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
                <div key={loc.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">{loc.siteName}</span>
                        {loc.isCentralStore && (
                          <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                            Central
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{loc.building} — {loc.roomNumber}</p>
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <span className="block text-xl font-semibold text-slate-900">{total}</span>
                      <span className="text-[10px] text-slate-500">{total === 1 ? 'item' : 'items'}</span>
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

      {/* ── Row 6: Recent activity ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5">
        <Panel
          title="Recent activity"
          subtitle="ቅርብ ጊዜ የስርዓት ድርጊቶች"
          icon={ShieldCheck}
          action={<LinkButton onClick={() => onNavigate('audit')}>Full log</LinkButton>}
        >
          {recentLogs.length === 0 ? (
            <EmptyState icon={Activity}>No activity recorded yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentLogs.map((log: any) => {
                const { icon: Icon, tone } = getActionVisual(log.action);
                return (
                  <li key={log.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium capitalize text-slate-900">
                          {log.action.replace(/_/g, ' ').toLowerCase()}
                        </p>
                        {log.ifmisSlipNumber && (
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">#{log.ifmisSlipNumber}</span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">{log.details}</p>
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
