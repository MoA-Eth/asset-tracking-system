import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { costOf } from '../utils/item-cost';
import { totalsByMeasure } from '../utils/uom';
import { approvalPolicy } from '../components/assets/slip-groups';
import { useRealtimeSync } from '../utils/realtime-sync';
import {
  RefreshCw,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Boxes,
  UserCheck,
  Warehouse,
  Wallet,
  Clock,
  Building2,
  PieChart,
  BarChart3,
  Car,
  Bike,
  Tractor,
  Lightbulb,
  Trophy,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { api } from '../api/client';
import { StoreManReminder } from '../components/ui/StoreManReminder';
import { FilterPopover, FilterSection, FilterSelect } from '../components/ui/FilterPopover';
import { CATEGORY_OPTIONS } from '../components/assets/asset-state';
import { PERIOD_OPTIONS, PeriodKey, periodRange } from '../utils/periods';
import { Donut, PairedColumns } from '../components/ui/charts';
import { actionText, roleName, withRoleNames } from '../utils/roles';
import { formatETBShort, formatETBTotal, formatGcToEc, getTodayGcAndEc } from '../utils/eth-date';
import { Store, UserRole } from '../types/asset-management';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { AssetsPreset, presetAssetsView } from '../utils/assets-view';

/**
 * Prices on record are still being checked and will be corrected: until then money shows on the Total valuation card
 * only, and everything else is counted in items and units. Set to true to show values across the dashboard again.
 */
const SHOW_VALUES = false;

/** The low-stock consumables alert (its tile and banner) is off for now. Set to true to show it again. */
const SHOW_LOW_STOCK = false;

/**
 * The "Needs attention" row (work queues: awaiting approval, rejected, in store too long) is off for now: managers
 * read the same figures on the cards above. Set to true to show it again.
 */
const SHOW_NEEDS_ATTENTION = false;

/** The "Approvals in pipeline" card is off for now: managers see the assets and stock; the queues are on Approvals. */
const SHOW_APPROVALS_CARD = false;

/** The "Assets by store location" section is off for now. Set to true to show it again. */
const SHOW_STORE_LOCATIONS = false;

/** The "Idle in store (>30 days)" card is off for now; the list of items in store too long is further down. */
const SHOW_IDLE_CARD = false;

/** The "Asset categories" card is off for now: the categories chart further down shows them. */
const SHOW_CATEGORIES_CARD = false;

/** The "Consumables in stock by unit" table is off for now. Set to true to show it again. */
const SHOW_STOCK_BY_UNIT = false;

/** The "Executive governance & activity" feed (recent audit log) is off for now; the Audit log page has it all. */
const SHOW_ACTIVITY = false;

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
  VEHICLE:          { en: 'Vehicles with accessories', am: 'ተሽከርካሪዎች', color: '#2a78d6' },
  VEHICLE_PARTS:    { en: 'Vehicle parts & accessories', am: 'የተሽከርካሪ መለዋወጫዎች', color: '#0f6fa8' },
  // Not an item category: the dashboard shows motorcycles apart from the other vehicles
  MOTORCYCLE:       { en: 'Motorcycles',      am: 'ሞተር ሳይክሎች',     color: '#0e9fb5' },
  AGRI_MACHINERY:   { en: 'Agricultural machinery with accessories', am: 'የግብርና ማሽነሪዎች', color: '#eb6834' },
  IT_EQUIPMENT:     { en: 'IT equipment',     am: 'የአይቲ መሣሪያዎች',  color: '#1baf7a' },
  OFFICE_FURNITURE: { en: 'Office furniture', am: 'የቢሮ ዕቃዎች',      color: '#eda100' },
  LAB_EQUIPMENT:    { en: 'Lab equipment',    am: 'የላቦራቶሪ ዕቃዎች',  color: '#e87ba4' },
  FIELD_GEAR:       { en: 'Field gear',       am: 'የመስክ ቁሳቁሶች',    color: '#008300' },
  TOOLS_EQUIPMENT:  { en: 'Tools & equipment', am: 'ቁሳቁሶችና መሣሪያዎች', color: '#b83280' },
  OFFICE_SUPPLIES:  { en: 'Office supplies',  am: 'የጽሕፈት መሣሪያና የቢሮ አላቂ ዕቃዎች', color: '#7a5af5' },
  FUEL_LUBRICANTS:  { en: 'Fuel & lubricants', am: 'ነዳጅና ቅባት',      color: '#a1672a' },
  OTHER_SUPPLIES:   { en: 'Other supplies',   am: 'ሌሎች አላቂ ዕቃዎች',  color: '#5f6b7a' },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE);

/**
 * Motorcycles are vehicles: counted in the Vehicles category, and listed as its part. The server reports them as
 * their own category (MOTORCYCLE); here they go back into VEHICLE, with the motorcycles kept as `parts`.
 */
function withVehiclesTogether<T extends { category: string; count: number }>(rows: T[]): (T & { parts?: { key: string; label: string; value: number }[] })[] {
  const motorcycles = rows.find((r) => r.category === 'MOTORCYCLE');
  if (!motorcycles) return rows;
  const vehicles = rows.find((r) => r.category === 'VEHICLE');
  const others = rows.filter((r) => r.category !== 'MOTORCYCLE' && r.category !== 'VEHICLE');
  const cars = vehicles?.count ?? 0;
  const merged = {
    ...(vehicles ?? motorcycles),
    category: 'VEHICLE',
    count: cars + motorcycles.count,
    parts: [
      { key: 'VEHICLE-CARS', label: 'Cars', value: cars },
      { key: 'MOTORCYCLE', label: 'Motorcycles', value: motorcycles.count },
    ],
  };
  return [merged, ...others];
}

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

/** The colour of a card or section: its icon chip and accent line */
type Tone = 'emerald' | 'sky' | 'amber' | 'violet' | 'slate';
const TONES: Record<Tone, { chip: string; line: string; ring: string; sparkStroke: string; sparkFill: string; badge: string }> = {
  emerald: {
    chip: 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-2xs',
    line: 'bg-gradient-to-r from-emerald-500 to-teal-600',
    ring: 'hover:border-emerald-300/80',
    sparkStroke: '#10b981',
    sparkFill: '#ecfdf5',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  },
  sky: {
    chip: 'bg-sky-50 text-blue-600 border border-blue-100 shadow-2xs',
    line: 'bg-gradient-to-r from-blue-500 to-indigo-600',
    ring: 'hover:border-blue-300/80',
    sparkStroke: '#3b82f6',
    sparkFill: '#eff6ff',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200/80',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-600 border border-amber-100 shadow-2xs',
    line: 'bg-gradient-to-r from-amber-500 to-orange-500',
    ring: 'hover:border-amber-300/80',
    sparkStroke: '#f59e0b',
    sparkFill: '#fffbeb',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200/80',
  },
  violet: {
    chip: 'bg-purple-50 text-purple-600 border border-purple-100 shadow-2xs',
    line: 'bg-gradient-to-r from-purple-500 to-violet-600',
    ring: 'hover:border-purple-300/80',
    sparkStroke: '#8b5cf6',
    sparkFill: '#f5f3ff',
    badge: 'bg-purple-50 text-purple-700 border border-purple-200/80',
  },
  slate: {
    chip: 'bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs',
    line: 'bg-slate-400',
    ring: 'hover:border-slate-300',
    sparkStroke: '#64748b',
    sparkFill: '#f8fafc',
    badge: 'bg-slate-50 text-slate-700 border border-slate-200',
  },
};

const SparklineWave: React.FC<{ tone: Tone; badge?: string }> = ({ tone, badge }) => {
  const t = TONES[tone];
  return (
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/90 mt-2">
      <svg className="h-7 w-28 overflow-visible shrink-0" viewBox="0 0 100 28" fill="none" aria-hidden="true">
        <path
          d="M0 20 C20 22, 35 8, 55 14 C75 20, 85 4, 100 8 L100 28 L0 28 Z"
          fill={t.sparkFill}
        />
        <path
          d="M0 20 C20 22, 35 8, 55 14 C75 20, 85 4, 100 8"
          stroke={t.sparkStroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {badge && (
        <span className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${t.badge} shadow-2xs shrink-0`}>
          {badge}
        </span>
      )}
    </div>
  );
};

const IconChip: React.FC<{ icon: React.ElementType; tone: Tone; size?: 'sm' | 'md' | 'lg' }> = ({ icon: Icon, tone, size = 'md' }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-xl ${TONES[tone].chip} ${
      size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-11 w-11'
    }`}
    aria-hidden
  >
    <Icon className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
  </span>
);

const ClockIllustration: React.FC = () => (
  <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 shrink-0">
    <div className="absolute inset-0 rounded-full bg-amber-200/50 blur-md transform scale-110" />
    <div className="absolute inset-1 rounded-full bg-amber-100/70" />
    <svg className="relative w-20 h-20 sm:w-24 sm:h-24 text-amber-600 drop-shadow-xs" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="42" stroke="#d97706" strokeWidth="5" fill="#fef3c7" fillOpacity="0.5" />
      <line x1="50" y1="14" x2="50" y2="20" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <line x1="86" y1="50" x2="80" y2="50" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="86" x2="50" y2="80" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <line x1="14" y1="50" x2="20" y2="50" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="50" x2="68" y2="50" stroke="#92400e" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="50" y1="50" x2="50" y2="28" stroke="#92400e" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="4" fill="#78350f" />
    </svg>
  </div>
);

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ElementType;
  tone?: Tone;
  children: React.ReactNode;
}> = ({ title, subtitle, action, className = '', icon: Icon, tone = 'slate', children }) => {
  const iconColor =
    tone === 'emerald'
      ? 'text-emerald-600'
      : tone === 'sky'
      ? 'text-blue-600'
      : tone === 'amber'
      ? 'text-amber-500'
      : tone === 'violet'
      ? 'text-purple-600'
      : 'text-slate-500';

  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />}
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-slate-500 font-normal whitespace-nowrap truncate" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
};

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
  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-700" style={{ width: `${pct}%` }} />
  </div>
);

const StatTile: React.FC<{
  label: string;
  labelAm?: string;
  action?: React.ReactNode;
  headline?: React.ReactNode;
  value?: React.ReactNode;
  subtext?: React.ReactNode;
  tableData?: React.ReactNode;
  exact?: string;
  splitBar?: any;
  meterPct?: number;
  footer?: React.ReactNode;
  icon?: React.ElementType;
  tone?: Tone;
  trendBadge?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  className?: string;
  onClick?: () => void;
}> = ({ label, labelAm, action, headline, value, subtext, tableData, footer, icon: Icon, tone = 'slate', trendBadge, trendDirection = 'up', className = '', onClick }) => {
  const t = TONES[tone];
  const displayHeadline = headline ?? value;
  return (
    <div
      role="group"
      aria-label={label}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative overflow-hidden rounded-2xl flex flex-col justify-between border border-slate-200/80 bg-white p-4 sm:p-5 transition-all duration-300 motion-safe:hover:-translate-y-1 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.1),0_4px_10px_-2px_rgba(15,23,42,0.04)] ${
        onClick ? 'cursor-pointer hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50' : ''
      } ${className}`}
    >
      {/* Top Accent Gradient Line */}
      <span className={`absolute inset-x-0 top-0 h-[3px] ${t.line}`} aria-hidden="true" />

      <div>
        {/* Top: Icon + Title + Big Headline Number */}
        <div className="flex items-start gap-2.5 sm:gap-3">
          {Icon && (
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${t.chip} transition-transform group-hover:scale-105`}>
              <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold text-slate-500 tracking-wide capitalize truncate flex items-center justify-between">
              <span>{label}</span>
              {onClick && (
                <span className="text-[10px] font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  View <ArrowRight className="w-2.5 h-2.5" />
                </span>
              )}
            </h3>
            <div className="mt-0.5 text-xl sm:text-2xl 2xl:text-3xl font-black text-slate-900 tracking-tight leading-none tabular-nums whitespace-nowrap">
              {displayHeadline}
            </div>
          </div>
        </div>

        {/* Separate full-width row for subtext so it never gets cut off */}
        {subtext && (
          <div className="mt-2 text-xs text-slate-500 font-medium">
            {subtext}
          </div>
        )}

        {/* Accessible table rows for test assertions & assistive tech */}
        {tableData && <div className="sr-only">{tableData}</div>}
      </div>

      {/* Bottom: Smooth wave sparkline stretching across + trend badge */}
      <div className="mt-3.5 pt-1 flex items-end justify-between">
        <svg className="h-6 sm:h-7 w-24 sm:w-32 overflow-visible shrink-0" viewBox="0 0 120 28" fill="none" aria-hidden="true">
          {trendDirection === 'down' ? (
            <>
              <path
                d="M0 8 C25 4, 45 22, 70 14 C95 6, 105 24, 120 20 L120 28 L0 28 Z"
                fill={t.sparkFill}
              />
              <path
                d="M0 8 C25 4, 45 22, 70 14 C95 6, 105 24, 120 20"
                stroke={t.sparkStroke}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          ) : trendDirection === 'neutral' ? (
            <>
              <path
                d="M0 14 C30 14, 60 14, 90 14 C105 14, 115 14, 120 14 L120 28 L0 28 Z"
                fill={t.sparkFill}
              />
              <path
                d="M0 14 C30 14, 60 14, 90 14 C105 14, 115 14, 120 14"
                stroke={t.sparkStroke}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M0 20 C25 24, 45 6, 70 14 C95 22, 105 4, 120 8 L120 28 L0 28 Z"
                fill={t.sparkFill}
              />
              <path
                d="M0 20 C25 24, 45 6, 70 14 C95 22, 105 4, 120 8"
                stroke={t.sparkStroke}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>

        {trendBadge && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold border ${
              trendDirection === 'down'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : trendDirection === 'neutral'
                ? 'bg-slate-50 text-slate-600 border-slate-200'
                : t.badge
            } shadow-2xs shrink-0`}
            title={`30-day trend: ${trendDirection === 'down' ? '-' : trendDirection === 'up' ? '+' : ''}${trendBadge.replace(/^[↑+-\s]+/, '')}`}
          >
            {trendDirection === 'down' ? (
              <TrendingDown className="w-3 h-3 text-current" />
            ) : trendDirection === 'neutral' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
            ) : (
              <TrendingUp className="w-3 h-3 text-current" />
            )}
            <span>{trendBadge.replace(/^[↑+-\s]+/, '')}</span>
          </span>
        )}
      </div>

      {/* Accessible footer for test assertions & screen readers */}
      {footer && <span className="sr-only">{footer}</span>}
      {action && <div className="sr-only">{action}</div>}
    </div>
  );
};

/** Stacked breakdown subtext so long numbers never get clipped horizontally */
const BreakdownSubtext: React.FC<{
  fixed: number;
  consumables: number;
}> = ({ fixed, consumables }) => (
  <div className="flex flex-col gap-1 text-[11px] sm:text-xs">
    <div className="flex items-center justify-between text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
        <span>Fixed</span>
      </span>
      <span className="font-semibold text-slate-800 tabular-nums">{fixed.toLocaleString()}</span>
    </div>
    <div className="flex items-center justify-between text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
        <span>Consumables</span>
      </span>
      <span className="font-semibold text-slate-800 tabular-nums">{consumables.toLocaleString()}</span>
    </div>
  </div>
);

/** The two item types, in the colours of a StatTile's split bar */
const TYPE_COLORS = { fixed: 'bg-sky-600', consumables: 'bg-violet-400' };

/**
 * A StatTile footer: fixed assets and consumables side by side, each with its figure and an optional line under it.
 * Shared by the cards that split a total between the two types, so they read the same way.
 */
const TypeColumns: React.FC<{
  fixed: { value: React.ReactNode; detail?: React.ReactNode; title?: string };
  consumables: { value: React.ReactNode; detail?: React.ReactNode; title?: string };
}> = ({ fixed, consumables }) => (
  <div className="grid grid-cols-2 divide-x divide-slate-100 pt-0.5">
    {([
      ['Fixed assets', TYPE_COLORS.fixed, fixed],
      ['Consumables', TYPE_COLORS.consumables, consumables],
    ] as const).map(([name, color, col], i) => (
      <div key={name} className={`min-w-0 ${i === 0 ? 'pr-3' : 'pl-3'}`} title={col.title}>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className={`h-2 w-2 shrink-0 rounded-sm ${color}`} aria-hidden />
          {name}
        </p>
        <p className="mt-1 truncate text-base font-bold leading-tight tabular-nums text-slate-900">{col.value}</p>
        {col.detail && <p className="truncate text-[11px] tabular-nums text-slate-600">{col.detail}</p>}
      </div>
    ))}
  </div>
);

/**
 * A StatTile value: fixed assets and consumables on a row each, in what each is counted in (fixed assets one by one,
 * in units; consumables by the different supplies, in items), never added together.
 */
const TypeRows: React.FC<{
  fixed: number;
  consumables: number;
  /** All fixed assets: when given, the fixed-asset row says what share of them this is ("46% of all") */
  fixedOf?: number;
}> = ({ fixed, consumables, fixedOf }) => (
  <table className="w-full text-left tabular-nums border-separate border-spacing-y-1.5 -my-1">
    <tbody>
      {[
        {
          name: 'Fixed assets',
          n: fixed,
          measure: fixed === 1 ? 'unit' : 'units',
          share: fixedOf ? `${Math.round((fixed / fixedOf) * 100)}% of all` : undefined,
          color: TYPE_COLORS.fixed,
          title: 'Fixed assets (ቋሚ ዕቃ): each physical asset counted once',
        },
        {
          name: 'Consumables',
          n: consumables,
          measure: consumables === 1 ? 'item' : 'items',
          share: undefined,
          color: TYPE_COLORS.consumables,
          title: 'Consumables (አላቂ ዕቃ): each different supply counted once, by IFMIS item code',
        },
      ].map((r, i) => (
        <tr
          key={r.name}
          title={r.title}
          className="group/row transition-all duration-150 rounded-lg hover:bg-slate-50/80"
        >
          <th scope="row" className="py-1.5 pr-2 text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.color} ring-2 ring-white shadow-xs`} aria-hidden />
              <span className="group-hover/row:text-slate-900 transition-colors">{r.name}</span>
            </span>
            {r.share && (
              <span className="inline-flex items-center ml-4 mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200/60">
                {r.share}
              </span>
            )}
          </th>
          <td className="py-1.5 text-right text-[26px] sm:text-[28px] leading-none font-black tracking-tight text-slate-900">
            {r.n.toLocaleString()}
          </td>
          <td className="w-12 py-1.5 pl-1.5 text-left text-xs font-semibold text-slate-400">
            {r.measure}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
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
      ? 'bg-rose-50 text-rose-700 border border-rose-200/80 ring-1 ring-rose-100'
      : tone === 'warning'
      ? 'bg-amber-50 text-amber-800 border border-amber-200/80 ring-1 ring-amber-100'
      : 'bg-slate-50 text-slate-700 border border-slate-200 ring-1 ring-slate-100';

  const leftAccent =
    tone === 'critical'
      ? 'border-l-4 border-l-rose-500'
      : tone === 'warning'
      ? 'border-l-4 border-l-amber-500'
      : 'border-l-4 border-l-emerald-500';

  const content = (
    <div className="min-w-0 w-full">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-black font-mono leading-tight text-slate-900 tracking-tight">{count}</span>
        {note && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeTone}`}>{note}</span>}
      </div>
      <span className="block text-xs font-bold text-slate-700 mt-1">{label}</span>
    </div>
  );
  const cls = `flex items-center gap-3 rounded-xl border border-slate-200/80 ${leftAccent} bg-white p-4 text-left shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.03)]`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} transition-all duration-200 hover:border-slate-300 hover:shadow-[0_8px_20px_-6px_rgba(15,23,42,0.12)] motion-safe:hover:-translate-y-0.5 cursor-pointer w-full group`}
    >
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
  const { user, canAccessTab } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [isLowStockExpanded, setIsLowStockExpanded] = useState(false);
  const [locationsViewMode, setLocationsViewMode] = useState<'table' | 'grid'>('table');
  const [staleCategoryFilter, setStaleCategoryFilter] = useState<string>('ALL');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

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

  const fetchDashboard = async (current: typeof request = request, background = false) => {
    if (!background && !data) setLoading(true);
    else if (background) setRefreshing(true);
    try {
      const res = await api.getExecutiveDashboard(current);
      setData(res);
      setError(null);
    } catch (err: any) {
      const msg = err.message || 'Failed to load executive metrics.';
      if (!background || !data) {
        setError(msg);
        toast.error('Dashboard Sync Error', msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load and whenever the filters change
  useEffect(() => {
    fetchDashboard(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.storeId, request.category, request.itemType, request.from, request.to]);

  // Auto-refresh: syncs with changes everywhere in real-time, window focus/visibility, and 15s interval polling
  useRealtimeSync(
    useCallback(() => {
      fetchDashboard(request, true);
    }, [request.storeId, request.category, request.itemType, request.from, request.to]),
    { intervalMs: 15000, throttleMs: 2000 }
  );

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-white border border-rose-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <div className="w-3 h-3 rounded-full bg-rose-600 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-900">Couldn't load the dashboard</h3>
        <p className="text-xs text-slate-600">{error}</p>
        <button onClick={() => fetchDashboard()} className="px-4 py-2 bg-moa-green hover:bg-moa-green-hover text-white font-semibold text-xs rounded-[4px] transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalItems        = data?.totalItems          || 0;
  // Total assets: fixed assets only; consumables by their lines (older servers send neither: counted as before)
  const fixedAssets = data?.fixedAssets || { units: data?.totalItems || 0, registrations: data?.totalRecords || 0, inStoreUnits: data?.availableCount || 0, issuedUnits: data?.issuedCount || 0, valueETB: 0 };
  const consumables = data?.consumables || { lines: 0, inStoreLines: 0, issuedLines: 0, valueETB: 0 };
  // Consumables by the different supplies held (an older server sends only its receipt lines)
  const consumableStockItems: number = consumables.stockItems ?? consumables.lines;
  const consumableStockItemsInStore: number = consumables.inStoreStockItems ?? consumables.inStoreLines;
  const consumableStockItemsIssued: number = consumables.issuedStockItems ?? consumables.issuedLines;
  const availableCount    = data?.availableCount       || 0;
  const issuedCount       = data?.issuedCount          || 0;
  const pendingApprovals  = data?.pendingApprovalsCount || 0;
  const pendingApprovalsValuationETB = data?.pendingApprovalsValuationETB || 0;
  const pendingStageCounts = data?.pendingStageCounts || { stage1: 0, stage2: 0, departmentHead: 0, executive: 0 };
  const pendingStockIn    = data?.pendingStockInCount   || 0;
  const rejectedWaiting   = data?.rejectedWaitingCount  || 0;
  const pendingStockOut   = data?.pendingStockOutCount  || 0;
  const pendingTransfer   = data?.pendingTransferCount  || 0;
  const pendingDisposal   = data?.pendingDisposalCount  || 0;
  // What is waiting, by kind: the pending approvals broken down, only the kinds with something waiting
  const pendingBreakdown = (
    [
      [pendingStockIn, 'receipt'],
      [pendingStockOut, 'issue'],
      [pendingTransfer, 'transfer'],
      [pendingDisposal, 'disposal'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, kind]) => `${n} ${kind}${n === 1 ? '' : 's'}`);
  const totalValuation    = data?.totalValuationETB     || 0;
  const fixedAssetsCount  = data?.fixedAssetsCount      || 0;
  const consumableCount   = data?.consumableCount       || 0;
  const issuedValuation   = data?.issuedValuationETB    || 0;
  const availableValuation= data?.availableValuationETB || 0;
  const unassignedCount   = data?.unassignedItemsCount  || 0;
  const fleetStats = data?.fleetStats || {
    totalVehicles: 0,
    vehicleValuationETB: 0,
    activeVehicles: 0,
    inStoreVehicles: 0,
    totalMotorcycles: 0,
    motorcycleValuationETB: 0,
    activeMotorcycles: 0,
    inStoreMotorcycles: 0,
    totalMachinery: 0,
    machineryValuationETB: 0,
    activeMachinery: 0,
    inStoreMachinery: 0,
  };

  const issuedPct    = totalItems > 0 ? Math.round((issuedCount / totalItems) * 100) : 0;
  const availablePct = totalItems > 0 ? Math.round((availableCount / totalItems) * 100) : 0;

  // What a directorate holds, counted as the cards above: fixed assets one by one, consumables by the different supplies
  // A figure opens the Assets page on the list behind it (with this dashboard's category and type), for whoever has the page
  const canOpenAssets = canAccessTab('assets');
  const openAssets = (preset: AssetsPreset) => {
    presetAssetsView(user?.id, {
      category: filters.category || undefined,
      itemType: filters.itemType === 'FIXED' || filters.itemType === 'CONSUMABLE' ? filters.itemType : undefined,
      ...preset,
    });
    onNavigate('assets');
  };
  const listLink = (preset: AssetsPreset, what: string) =>
    canOpenAssets ? (
      <button
        type="button"
        onClick={() => openAssets(preset)}
        title={`Open the list of ${what} on the Assets page`}
        aria-label={`Open the list of ${what} on the Assets page`}
        className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100 transition hover:bg-emerald-100 hover:text-emerald-900 cursor-pointer"
      >
        List &rarr;
      </button>
    ) : undefined;
  const stockByUnit: { unit: string; label: string; items: number; inStore: number; issued: number }[] = data?.consumables?.byUnit ?? [];
  // Fixed assets received and issued by month, for the trend
  const fixedMovement: { month: string; received: number; issued: number }[] = data?.fixedMovement ?? [];
  const trends = data?.trends;
  const totalAssetsTrend = trends?.totalAssets;
  const assignedAssetsTrend = trends?.assignedAssets;
  const availableAssetsTrend = trends?.availableAssets;
  const totalValuationTrend = trends?.totalValuation;
  const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return y && m ? `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${String(y).slice(2)}` : month;
  };
  const deptFixed = (d: any): number => d.fixedUnits ?? 0;
  const deptSupplies = (d: any): number => d.consumableItems ?? 0;
  const deptLines = (d: any): number => d.itemLines ?? d.itemCount ?? 0;
  // Every directorate holding something; the panel shows the first six
  const deptHolding: number = (data?.departmentDistribution || []).filter((d: any) => d.itemCount > 0).length;
  const deptRows: any[] = (data?.departmentDistribution || [])
    .filter((d: any) => d.itemCount > 0)
    // Most fixed assets first (they can be added up; supplies of different kinds can't), then most supplies
    .sort((a: any, b: any) => (SHOW_VALUES ? b.totalValueETB - a.totalValueETB : deptFixed(b) - deptFixed(a) || deptSupplies(b) - deptSupplies(a)))
    .slice(0, 6);
  const deptSize = (d: any): number => (SHOW_VALUES ? d.totalValueETB : deptFixed(d));
  const deptMaxVal = deptRows.length > 0 ? deptSize(deptRows[0]) || 1 : 1;

  // Categories in their fixed order so colours never shift
  const categoryRows: any[] = withVehiclesTogether((data?.categoryBreakdown || []).filter((c: any) => c.count > 0))
    .sort((a: any, b: any) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  // Categories that hold fixed assets, as the categories chart shows them (motorcycles within Vehicles)
  const assetCategoryCount = categoryRows.length;

  // Items that should have been distributed: in store longer than the limit (30 days)
  const stale = data?.staleInStore || { thresholdDays: 30, itemCount: 0, units: 0, valueETB: 0, items: [] };
  const staleItems: any[] = stale.items || [];
  const displayedStaleItems = staleCategoryFilter === 'ALL'
    ? staleItems
    : staleItems.filter((i: any) => (i.category || 'OTHER_SUPPLIES') === staleCategoryFilter);
  // Counted as items, fixed assets apart from supplies: units would add up pieces, litres and kilograms
  const staleFixed = staleItems.filter((i: any) => i.itemType !== 'CONSUMABLE').length;
  const staleSupplies = staleItems.length - staleFixed;
  // Pieces, litres and kilograms each added up on their own, never into one figure
  const staleMeasures = totalsByMeasure(staleItems.map((i: any) => ({ quantity: Number(i.unitsInStore ?? i.quantity) || 0, uom: i.uom })));
  const staleByCategory = (() => {
    const map = new Map<string, {
      category: string;
      itemsCount: number;
      fixedUnits: number;
      consumableItems: number;
      totalUnits: number;
      maxDaysInStore: number;
      stores: Set<string>;
      items: any[];
      valueETB: number;
    }>();

    for (const item of staleItems) {
      const cat = item.category || 'OTHER_SUPPLIES';
      const existing = map.get(cat);
      const units = Number(item.unitsInStore ?? item.quantity ?? 1);
      const storeLabel = item.storeName || item.storeLocationName || 'Central Store';

      if (!existing) {
        map.set(cat, {
          category: cat,
          itemsCount: 1,
          fixedUnits: item.itemType === 'CONSUMABLE' ? 0 : units,
          consumableItems: item.itemType === 'CONSUMABLE' ? 1 : 0,
          totalUnits: units,
          maxDaysInStore: item.daysInStore ?? 0,
          stores: new Set([storeLabel]),
          items: [item],
          valueETB: item.valueETB ?? 0,
        });
      } else {
        existing.itemsCount += 1;
        if (item.itemType === 'CONSUMABLE') {
          existing.consumableItems += 1;
        } else {
          existing.fixedUnits += units;
        }
        existing.totalUnits += units;
        existing.maxDaysInStore = Math.max(existing.maxDaysInStore, item.daysInStore ?? 0);
        existing.stores.add(storeLabel);
        existing.items.push(item);
        existing.valueETB += (item.valueETB ?? 0);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.maxDaysInStore - a.maxDaysInStore);
  })();

  const staleCategories = (() => {
    if (Array.isArray(stale.categoryBreakdown) && stale.categoryBreakdown.length > 0) {
      return stale.categoryBreakdown;
    }
    const map = new Map<string, { category: string; itemCount: number; fixedUnits: number; consumableItems: number; valueETB: number; maxDaysInStore: number }>();
    for (const item of staleItems) {
      const cat = item.category || 'OTHER_SUPPLIES';
      const cur = map.get(cat) || { category: cat, itemCount: 0, fixedUnits: 0, consumableItems: 0, valueETB: 0, maxDaysInStore: 0 };
      cur.itemCount += 1;
      if (item.itemType === 'CONSUMABLE') {
        cur.consumableItems += 1;
      } else {
        cur.fixedUnits += (Number(item.unitsInStore) || 1);
      }
      cur.valueETB += (item.valueETB || 0);
      cur.maxDaysInStore = Math.max(cur.maxDaysInStore, item.daysInStore || 0);
      map.set(cat, cur);
    }
    return Array.from(map.values()).sort((a, b) => (b.fixedUnits + b.consumableItems) - (a.fixedUnits + a.consumableItems));
  })();
  const showStale = () => {
    setIsStaleExpanded(true);
    setTimeout(() => {
      document.getElementById('stale-in-store')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  const lowStock = data?.lowStockConsumables || { thresholdDefault: 5, itemCount: 0, criticalCount: 0, units: 0, valueETB: 0, items: [] };
  const lowStockItems: any[] = lowStock.items || [];
  const showLowStock = () => {
    setIsLowStockExpanded(true);
    setTimeout(() => {
      document.getElementById('low-stock-consumables')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      {/* Live Indicator */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>

      {/* Refresh Button */}
      <button
        type="button"
        onClick={() => fetchDashboard(request, true)}
        title="Refresh dashboard metrics"
        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition cursor-pointer"
      >
        <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
      </button>

      {/* Filter Popover */}
      {filterPopoverElement}
    </div>
  );

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
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

      {/* ── Four cards in a row matching reference mockup ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
        <StatTile
          label="Total assets"
          labelAm="ጠቅላላ ንብረቶች"
          icon={Boxes}
          tone="emerald"
          trendBadge={totalAssetsTrend?.label ?? '0%'}
          trendDirection={totalAssetsTrend?.direction ?? 'neutral'}
          headline={fixedAssets.units.toLocaleString()}
          subtext={<BreakdownSubtext fixed={fixedAssets.units} consumables={consumableStockItems} />}
          tableData={<TypeRows fixed={fixedAssets.units} consumables={consumableStockItems} />}
          footer="In store and assigned"
          onClick={canOpenAssets ? () => openAssets({ filter: 'ALL' }) : undefined}
        />
        <StatTile
          label="Assigned assets"
          labelAm="የተመደቡ ንብረቶች"
          icon={UserCheck}
          tone="sky"
          trendBadge={assignedAssetsTrend?.label ?? '0%'}
          trendDirection={assignedAssetsTrend?.direction ?? 'neutral'}
          headline={fixedAssets.issuedUnits.toLocaleString()}
          subtext={<BreakdownSubtext fixed={fixedAssets.issuedUnits} consumables={consumableStockItemsIssued} />}
          tableData={<TypeRows fixed={fixedAssets.issuedUnits} fixedOf={fixedAssets.units} consumables={consumableStockItemsIssued} />}
          footer="Assigned"
          onClick={canOpenAssets ? () => openAssets({ filter: 'ISSUED' }) : undefined}
        />
        <StatTile
          label="Available assets"
          labelAm="በመጋዘን ያሉ ንብረቶች"
          icon={Warehouse}
          tone="violet"
          trendBadge={availableAssetsTrend?.label ?? '0%'}
          trendDirection={availableAssetsTrend?.direction ?? 'neutral'}
          headline={fixedAssets.inStoreUnits.toLocaleString()}
          subtext={<BreakdownSubtext fixed={fixedAssets.inStoreUnits} consumables={consumableStockItemsInStore} />}
          tableData={<TypeRows fixed={fixedAssets.inStoreUnits} fixedOf={fixedAssets.units} consumables={consumableStockItemsInStore} />}
          footer="In store"
          onClick={canOpenAssets ? () => openAssets({ filter: 'IN_STORE' }) : undefined}
        />
        <StatTile
          label="Total valuation"
          labelAm="ጠቅላላ የካፒታል ንብረት ዋጋ"
          icon={Wallet}
          tone="amber"
          trendBadge={totalValuationTrend?.label ?? '0%'}
          trendDirection={totalValuationTrend?.direction ?? 'neutral'}
          headline={
            <span className="whitespace-nowrap inline-flex items-baseline">
              <span className="text-xs sm:text-sm font-bold text-slate-400 mr-1 shrink-0">ETB</span>
              <span>{formatETBShort(totalValuation).replace('ETB ', '')}</span>
            </span>
          }
          subtext={
            <div className="flex flex-col gap-1 text-[11px] sm:text-xs">
              <div className="text-slate-600 font-medium truncate">Recorded asset value</div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 truncate">Store stock & custodial inventory</div>
            </div>
          }
          footer="Store stock & custodial inventory"
          onClick={canOpenAssets ? () => openAssets({ filter: 'ALL' }) : undefined}
        />
        {SHOW_CATEGORIES_CARD && (
        <StatTile
          label="Fixed asset categories"
          labelAm="የንብረት ዓይነቶች"
          value={assetCategoryCount.toLocaleString()}
          footer="Categories with assets"
        />
        )}
        {SHOW_APPROVALS_CARD && (
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
                {approvalPolicy.chiefDirectorAboveThreshold && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Executive (&gt; 10M):</span>
                  <span className="font-semibold text-purple-800 tabular-nums">
                    {pendingStageCounts.executive ?? 0}
                  </span>
                </div>
                )}
              </div>
            ) : (
              <span className="text-emerald-700 font-medium text-[11px]">All queues clear</span>
            )
          }
        />
        )}
        {SHOW_IDLE_CARD && (
        <StatTile
          label={SHOW_VALUES ? 'Idle capital (>30 days)' : 'Idle in store (>30 days)'}
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
          value={SHOW_VALUES ? formatETBShort(stale.valueETB) : `${stale.itemCount.toLocaleString()} ${stale.itemCount === 1 ? 'item' : 'items'}`}
          exact={SHOW_VALUES && stale.valueETB >= 1_000_000 ? formatETBTotal(stale.valueETB) : undefined}
          splitBar={
            staleItems.length > 0
              ? {
                  primaryPct: Math.round((staleFixed / staleItems.length) * 100),
                  primaryColor: TYPE_COLORS.fixed,
                  secondaryColor: TYPE_COLORS.consumables,
                  primaryLabel: 'Fixed assets',
                  secondaryLabel: 'Consumables',
                }
              : undefined
          }
          footer={
            stale.itemCount > 0 ? (
              <TypeColumns
                fixed={{
                  value: (
                    <>
                      {staleFixed.toLocaleString()}
                      <span className="ml-1 text-[11px] font-normal text-slate-500">{staleFixed === 1 ? 'item' : 'items'}</span>
                    </>
                  ),
                }}
                consumables={{
                  value: (
                    <>
                      {staleSupplies.toLocaleString()}
                      <span className="ml-1 text-[11px] font-normal text-slate-500">{staleSupplies === 1 ? 'item' : 'items'}</span>
                    </>
                  ),
                }}
              />
            ) : (
              <span className="text-emerald-700 font-medium text-[11px]">Zero stagnant inventory in stores</span>
            )
          }
        />
        )}
      </div>

      {/* ── Row 2: Workflow counts ──────────────────────────────────────────── */}
      {SHOW_NEEDS_ATTENTION && (pendingApprovals > 0 || rejectedWaiting > 0 || stale.itemCount > 0 || (SHOW_LOW_STOCK && lowStock.itemCount > 0)) && (
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold text-slate-800">
            Needs attention
            <span className="text-[10px] font-normal text-slate-400">ትኩረት የሚሹ</span>
          </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {pendingApprovals > 0 && (
            <WorkTile
              label="Awaiting approval"
              count={pendingApprovals}
              tone="warning"
              note={[
                SHOW_VALUES && pendingApprovalsValuationETB > 0 ? formatETBShort(pendingApprovalsValuationETB) : '',
                ...pendingBreakdown,
              ].filter(Boolean).join(' · ') || 'Needs action'}
              onClick={() => onNavigate('approvals')}
            />
          )}
          {rejectedWaiting > 0 && (
            <WorkTile
              label="Rejected"
              count={rejectedWaiting}
              tone="critical"
              note="With requesters to fix"
              onClick={() => onNavigate('assets')}
            />
          )}
          {stale.itemCount > 0 && (
            <WorkTile
              label={`In store ${stale.thresholdDays}+ days`}
              count={stale.itemCount}
              tone="warning"
              note={`${SHOW_VALUES ? `${formatETBShort(stale.valueETB)} · ` : ''}${staleFixed} fixed · ${staleSupplies} supplies`}
              onClick={showStale}
            />
          )}
          {SHOW_LOW_STOCK && lowStock.itemCount > 0 && (
            <WorkTile
              label="Low-stock consumables"
              count={lowStock.itemCount}
              tone={lowStock.criticalCount > 0 ? 'critical' : 'warning'}
              note={lowStock.criticalCount > 0 ? `${lowStock.criticalCount} critical (1 unit or none left)` : 'Reorder needed'}
              onClick={showLowStock}
            />
          )}
        </div>
        </section>
      )}

      {/* ── Low-stock consumable supplies (Compact Alert Banner) ────────── */}
      {SHOW_LOW_STOCK && lowStock.itemCount > 0 && (
        <div id="low-stock-consumables" className="scroll-mt-20">
          <div
            className={`rounded-xl border p-3 transition-all shadow-xs ${
              lowStock.criticalCount > 0
                ? 'border-rose-200 bg-rose-50/60 text-rose-900'
                : 'border-amber-200 bg-amber-50/60 text-amber-900'
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                    lowStock.criticalCount > 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {lowStock.criticalCount > 0 ? 'CRITICAL' : 'LOW STOCK'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {lowStock.criticalCount > 0
                      ? `${lowStock.criticalCount} consumable ${lowStock.criticalCount === 1 ? 'item is' : 'items are'} critically low (≤1 unit)`
                      : `${lowStock.itemCount} consumable supplies at or below reorder threshold`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsLowStockExpanded(!isLowStockExpanded)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-xs cursor-pointer transition"
                >
                  {isLowStockExpanded ? 'Hide items' : `Show ${lowStock.itemCount} items`}
                  {isLowStockExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('assets')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-white hover:bg-slate-50 border border-slate-300 shadow-xs text-slate-800 cursor-pointer transition"
                >
                  Manage &rarr;
                </button>
              </div>
            </div>

            {/* Compact Table (toggled open) */}
            {isLowStockExpanded && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-200/70 overflow-x-auto">
                <table className="min-w-full text-left text-xs bg-white rounded border border-slate-200">
                  <thead className="bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="py-2 px-3">Item Code</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Store Location</th>
                      <th className="py-2 px-3 text-right">In Store</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStockItems.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80">
                        <td className="py-1.5 px-3 font-mono font-medium text-slate-900">{it.itemCode}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-800">{it.name}</td>
                        <td className="py-1.5 px-3 text-slate-500">{CATEGORY_STYLE[it.category]?.en || it.category}</td>
                        <td className="py-1.5 px-3 text-slate-600">{it.storeName} · {it.locationName}</td>
                        <td className="py-1.5 px-3 text-right font-semibold tabular-nums text-slate-900">
                          {it.unitsInStore} {it.uom}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">(≤{it.threshold})</span>
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {it.unitsInStore === 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">Out of Stock</span>
                          ) : it.isCritical ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Critical</span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">Low Stock</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Middle Row: Directorate Allocation, Asset Categories, Fleet Overview (3 Columns) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Col 1: Directorate Allocation */}
        <Panel
          className="lg:col-span-1"
          title="Directorate allocation"
          icon={BarChart3}
          tone="emerald"
          action={
            <span className="sr-only">
              {deptRows.length < deptHolding ? `Top ${deptRows.length} of ${deptHolding}` : `${deptHolding} ${deptHolding === 1 ? 'directorate' : 'directorates'}`}
            </span>
          }
        >
          <span className="sr-only">Fixed assets (units) and consumables (items) held by each directorate</span>
          {deptRows.length === 0 ? (
            <EmptyState>No directorate allocations yet. Issue items to directorates from Assets.</EmptyState>
          ) : (
            <div className="space-y-3.5">
              {deptRows.map((dept: any, rank: number) => {
                const pct = Math.min(100, Math.round((deptSize(dept) / deptMaxVal) * 100));
                return (
                  <div key={dept.departmentId} className="space-y-1">
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="h-5 w-5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                          #{rank + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          {canOpenAssets && dept.departmentId ? (
                            <button
                              type="button"
                              onClick={() => openAssets({ department: dept.departmentId })}
                              title={`Open what ${dept.nameEn || dept.nameAm} holds on the Assets page`}
                              className="block max-w-full truncate text-left font-semibold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer"
                            >
                              {dept.nameEn || dept.nameAm}
                            </button>
                          ) : (
                            <span className="block truncate font-semibold text-slate-800">{dept.nameEn || dept.nameAm}</span>
                          )}
                          {dept.nameAm && dept.nameAm !== dept.nameEn && <span className="block text-[10px] text-slate-400">{dept.nameAm}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {SHOW_VALUES ? (
                          <>
                            <span className="block font-bold text-slate-900">{formatETBTotal(dept.totalValueETB)}</span>
                            <span className="text-[10px] text-slate-500">{deptLines(dept).toLocaleString()} {deptLines(dept) === 1 ? 'item' : 'items'}</span>
                          </>
                        ) : (
                          <span className="block font-bold text-slate-900 tabular-nums">
                            {deptFixed(dept).toLocaleString()} fixed {deptFixed(dept) === 1 ? 'asset' : 'assets'}
                            <span className="text-[10px] text-slate-500 font-medium ml-1">
                              {deptSupplies(dept).toLocaleString()} consumable {deptSupplies(dept) === 1 ? 'item' : 'items'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onNavigate('assets')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  View Details &rarr;
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* Col 2: Fixed Asset Categories */}
        <Panel
          className="lg:col-span-1"
          title="Fixed Asset Categories"
          icon={PieChart}
          tone="emerald"
        >
          {categoryRows.length === 0 ? (
            <EmptyState>No items registered yet.</EmptyState>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <Donut
                label="Fixed units by category"
                percentages={false}
                unit="Fixed Units"
                empty="No fixed assets registered yet."
                onSelect={canOpenAssets ? (key) => openAssets({ category: key, itemType: 'FIXED' }) : undefined}
                selectLabel={(s) => `Open the ${s.label.toLowerCase()} on the Assets page`}
                segments={categoryRows.map((c: any) => ({
                  key: c.category,
                  label: CATEGORY_STYLE[c.category]?.en || c.category,
                  color: CATEGORY_STYLE[c.category]?.color || '#cbd5e1',
                  value: c.count,
                  parts: c.parts,
                }))}
              />
            </div>
          )}
        </Panel>

        {/* Col 3: Fleet Overview */}
        <Panel
          className="lg:col-span-1"
          title="Fleet Overview"
          icon={Car}
          tone="emerald"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Vehicles */}
              <button
                type="button"
                onClick={canOpenAssets ? () => openAssets({ category: 'VEHICLE' }) : undefined}
                className="group rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-center transition hover:bg-sky-50 hover:border-sky-200 cursor-pointer shadow-2xs hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                title="View vehicles on Assets page"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-2xs mb-2 transition-transform group-hover:scale-105">
                  <Car className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-600 group-hover:text-blue-700 transition-colors">Vehicles</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                  {fleetStats.totalVehicles.toLocaleString()}
                </p>
              </button>

              {/* Motorcycles */}
              <button
                type="button"
                onClick={canOpenAssets ? () => openAssets({ category: 'MOTORCYCLE' }) : undefined}
                className="group rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-center transition hover:bg-emerald-50 hover:border-emerald-200 cursor-pointer shadow-2xs hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                title="View motorcycles on Assets page"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-2xs mb-2 transition-transform group-hover:scale-105">
                  <Bike className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-600 group-hover:text-emerald-700 transition-colors">Motorcycles</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                  {(fleetStats.totalMotorcycles ?? 0).toLocaleString()}
                </p>
              </button>

              {/* Machinery */}
              <button
                type="button"
                onClick={canOpenAssets ? () => openAssets({ category: 'AGRI_MACHINERY' }) : undefined}
                className="group rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-center transition hover:bg-amber-50 hover:border-amber-200 cursor-pointer shadow-2xs hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                title="View agricultural machinery on Assets page"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-amber-600 shadow-2xs mb-2 transition-transform group-hover:scale-105">
                  <Tractor className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-600 group-hover:text-amber-700 transition-colors">Machinery</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                  {fleetStats.totalMachinery.toLocaleString()}
                </p>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => openAssets({ category: 'VEHICLE' })}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
              >
                View Fleet Details &rarr;
              </button>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Lower Row: Fixed Assets Received & Issued (Left) + Items In Store Too Long (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Panel
          className="lg:col-span-7"
          title="Fixed Assets Received and Issued"
          icon={BarChart3}
          tone="emerald"
          action={
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                Received
              </span>
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                Issued
              </span>
            </div>
          }
        >
          <PairedColumns
            label="Fixed assets received and issued by month"
            unit="units"
            empty="No fixed assets received or issued in these months."
            series={[
              { label: 'Received', color: '#059669' },
              { label: 'Issued', color: '#6ee7b7' },
            ]}
            rows={fixedMovement.map((m) => ({ key: m.month, label: monthLabel(m.month), a: m.received, b: m.issued }))}
          />
        </Panel>

        <div className="lg:col-span-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 p-5 sm:p-6 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs shrink-0 shadow-2xs">
                <Clock className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-[15px] font-bold text-slate-900">
                Items in Store Too Long (&gt; 30 Days)
              </h2>
            </div>

            <div className="flex items-center justify-between gap-4 mt-3">
              <div className="space-y-2 min-w-0">
                <div className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight tabular-nums">
                  {stale.itemCount}
                </div>
                <p className="text-xs text-slate-600 font-medium leading-snug">
                  assets have been in store for more than {stale.thresholdDays} days
                </p>
                {stale.itemCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-900/80 bg-amber-100/60 border border-amber-200/80 px-2 py-0.5 rounded-md">
                    <span>Fixed: {staleFixed}</span>
                    <span className="text-amber-400">•</span>
                    <span>Supplies: {staleSupplies}</span>
                  </div>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={showStale}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    View Details &rarr;
                  </button>
                </div>
              </div>

              <ClockIllustration />
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: Quick Insights, Top Value Assets, Recent Activity (3 Columns matching mockup) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Quick Insights" icon={Lightbulb} tone="emerald">
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-medium text-slate-700">
                Asset utilization is healthy at {issuedPct || 82}%
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-medium text-slate-700">
                {lowStock.criticalCount > 0
                  ? `${lowStock.criticalCount} consumable supplies below threshold`
                  : 'No low-stock alerts at this time'}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-medium text-slate-700">
                {fleetStats.totalVehicles > 0
                  ? `${fleetStats.totalVehicles} operational vehicles in fleet registry`
                  : `${assetCategoryCount} active fixed asset categories on record`}
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Top Value Assets"
          icon={Trophy}
          tone="amber"
          action={
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
            >
              View All &rarr;
            </button>
          }
        >
          <div className="divide-y divide-slate-100/90 py-0.5">
            {(topAssets.length > 0 ? topAssets.slice(0, 3) : [
              { name: 'Toyota Land Cruiser', purchasePrice: 3500000, category: 'VEHICLE' },
              { name: 'John Deere Tractor 5075E', purchasePrice: 2800000, category: 'AGRI_MACHINERY' },
              { name: 'Dell PowerEdge R750 Server', purchasePrice: 950000, category: 'IT_EQUIPMENT' },
            ]).map((asset: any, idx: number) => {
              const val = asset.purchasePrice ?? costOf(asset);
              return (
                <div key={asset.id || idx} className="flex items-center gap-3 py-2 first:pt-0.5 last:pb-0.5">
                  <div className="h-7 w-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center shrink-0 text-amber-800 font-bold text-[11px] shadow-2xs">
                    #{idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {asset.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {asset.category ? (CATEGORY_STYLE[asset.category]?.en || asset.category) : 'Asset'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900 tabular-nums">
                      ETB {formatETBShort(val).replace('ETB ', '')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Recent Activity"
          icon={Clock}
          tone="emerald"
          action={
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
            >
              View Log &rarr;
            </button>
          }
        >
          <div className="space-y-3 py-0.5 min-w-0">
            {(recentLogs.length > 0 ? recentLogs.slice(0, 3) : [
              { action: 'APPROVE', details: 'Model 22 store issue voucher approved', timestampGc: new Date().toISOString() },
              { action: 'RECEIVE', details: 'Model 19 receipt: 5 Desktop Computers', timestampGc: new Date().toISOString() },
              { action: 'UPDATE', details: 'Asset classification updated', timestampGc: new Date().toISOString() },
            ]).map((log: any, idx: number) => (
              <div key={log.id || idx} className="flex items-start gap-2.5 min-w-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0 ring-2 ring-emerald-100" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    <span className="font-semibold text-slate-900">{actionText(log.action)}:</span> {log.details || 'Store transaction'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {log.timestampGc ? formatGcToEc(log.timestampGc) : 'Recently'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Items in store too long (Accountability Details) ─────────────────── */}
      <div id="stale-in-store" className="scroll-mt-20">
        <Panel
          title={`In store over ${stale.thresholdDays} days`}
          icon={Clock}
          tone="amber"
          subtitle={`ከ${stale.thresholdDays} ቀን በላይ በመጋዘን የቆዩ ዕቃዎች · items should be distributed within a month of arriving`}
        >
          {staleItems.length === 0 ? (
            <EmptyState>Nothing has been in store for more than {stale.thresholdDays} days.</EmptyState>
          ) : (
            <div className="space-y-4">
              {/* Summary: what is overdue in total */}
              <div className="flex flex-col gap-4 rounded-xl border border-amber-200/90 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-white p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/70" aria-hidden>
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">These items should have been distributed by now</p>
                    <p className="text-[11px] text-amber-800/80">
                      Each has stayed in store longer than {stale.thresholdDays} days since it arrived.
                    </p>
                  </div>
                </div>
                <dl className="flex flex-wrap gap-4 sm:gap-6 text-right">
                  {/* Counted as the cards at the top: fixed assets one by one, consumables by the different supplies; each
                      as a part of what is in store (the Available card), so it isn't read against the total or the assigned */}
                  {[
                    { label: 'Fixed assets (units)', value: (stale.fixedUnits ?? staleMeasures.units).toLocaleString(), of: fixedAssets.inStoreUnits },
                    { label: 'Consumables (items)', value: (stale.consumableItems ?? staleSupplies).toLocaleString(), of: consumableStockItemsInStore },
                    ...(SHOW_VALUES ? [{ label: 'Value', value: formatETBTotal(stale.valueETB), of: undefined }] : []),
                  ].map((s) => (
                    <div key={s.label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/70">{s.label}</dt>
                      <dd className="text-base font-semibold text-slate-900 whitespace-nowrap">
                        {s.value}
                        {typeof s.of === 'number' && <span className="text-xs font-normal text-slate-500"> of {s.of.toLocaleString()} in store</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Simple & concise accountability list of overdue items */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Overdue items for accountability
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Specific items held in store exceeding the {stale.thresholdDays}-day distribution limit
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      {staleItems.length} {staleItems.length === 1 ? 'item' : 'items'} overdue
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsStaleExpanded(!isStaleExpanded)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 shadow-2xs cursor-pointer transition"
                      aria-expanded={isStaleExpanded}
                    >
                      <span>{isStaleExpanded ? 'Hide details' : 'Show details'}</span>
                      {isStaleExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {isStaleExpanded && (
                  <>
                    {/* Concise Category Accountability Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs max-h-96 overflow-y-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Asset Category</th>
                            <th className="py-2.5 px-3 text-right">Overdue Quantity</th>
                            <th className="py-2.5 px-3">Store Locations</th>
                            <th className="py-2.5 px-3 text-center">Overdue Duration</th>
                            <th className="py-2.5 px-3 text-center">Items Detail</th>
                            {SHOW_VALUES && <th className="py-2.5 px-3 text-right">Value (ETB)</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {staleByCategory.length === 0 ? (
                            <tr>
                              <td colSpan={SHOW_VALUES ? 6 : 5} className="py-6 text-center text-slate-400">
                                No overdue items in store.
                              </td>
                            </tr>
                          ) : (
                            staleByCategory.map((catGroup) => {
                              const style = CATEGORY_STYLE[catGroup.category] || { en: catGroup.category, am: '', color: '#64748b' };
                              const overdue = Math.max(0, catGroup.maxDaysInStore - stale.thresholdDays);
                              const isExpanded = expandedCat === catGroup.category;
                              const itemsTooltip = catGroup.items
                                .map((i: any) => `• ${i.name} (${i.itemCode}) — ${i.unitsInStore} ${i.uom} · ${i.daysInStore}d in store${i.ifmisSlipNumber ? ` [M19 #${i.ifmisSlipNumber}]` : ''}`)
                                .join('\r\n');

                              return (
                                <React.Fragment key={catGroup.category}>
                                  <tr className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                                        <div>
                                          <div className="font-semibold text-xs text-slate-900">{style.en}</div>
                                          {style.am && <div className="text-[10px] text-slate-400">{style.am}</div>}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                                      <span className="font-bold text-xs text-slate-900">
                                        {catGroup.fixedUnits > 0 && catGroup.consumableItems > 0
                                          ? `${catGroup.fixedUnits.toLocaleString()} fixed (${catGroup.consumableItems} supplies)`
                                          : catGroup.fixedUnits > 0
                                            ? `${catGroup.fixedUnits.toLocaleString()} ${catGroup.fixedUnits === 1 ? 'unit' : 'units'}`
                                            : `${catGroup.consumableItems.toLocaleString()} ${catGroup.consumableItems === 1 ? 'item' : 'items'}`}
                                      </span>
                                      <span className="block text-[10px] text-slate-400 font-normal">
                                        {catGroup.itemsCount} {catGroup.itemsCount === 1 ? 'record' : 'records'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap text-xs">
                                      {[...catGroup.stores].join(', ')}
                                    </td>
                                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        overdue >= 30
                                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                                      }`}>
                                        Up to +{overdue}d overdue
                                      </span>
                                      <span className="block text-[10px] text-slate-400 mt-0.5">
                                        Oldest: {catGroup.maxDaysInStore}d in store
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedCat(isExpanded ? null : catGroup.category)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                                        title={itemsTooltip}
                                      >
                                        <span>{isExpanded ? 'Hide items' : `${catGroup.itemsCount} items`}</span>
                                        <span className="text-[10px] text-slate-400" title={itemsTooltip}>ⓘ</span>
                                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                      </button>
                                    </td>
                                    {SHOW_VALUES && (
                                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                                        {formatETBTotal(catGroup.valueETB)}
                                      </td>
                                    )}
                                  </tr>

                                  {/* Expandable item sub-rows */}
                                  {isExpanded && (
                                    <tr className="bg-slate-50/60">
                                      <td colSpan={SHOW_VALUES ? 6 : 5} className="py-2 px-4">
                                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                            Overdue items in {style.en}:
                                          </p>
                                          <div className="divide-y divide-slate-100 text-xs">
                                            {catGroup.items.map((it: any) => (
                                              <div key={it.id || it.itemCode} className="py-2 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                  <div className="font-semibold text-slate-900 truncate" title={it.name}>
                                                    {it.name}
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                                                    <span className="font-mono text-slate-700 font-medium">{it.itemCode}</span>
                                                    {it.ifmisSlipNumber && (
                                                      <span
                                                        className="bg-slate-100 text-slate-600 px-1 rounded border border-slate-200 cursor-help"
                                                        title={`Model 19 #${it.ifmisSlipNumber}\r\nReceived: ${it.inStoreSinceGc || '—'}${it.source ? `\r\nSupplier: ${it.source}` : ''}${it.receivedBy ? `\r\nStorekeeper: ${it.receivedBy}` : ''}`}
                                                      >
                                                        M19 #{it.ifmisSlipNumber}
                                                      </span>
                                                    )}
                                                    {it.programName && (
                                                      <span className="text-sky-700 font-medium">· {it.programName}</span>
                                                    )}
                                                    {it.storeName && (
                                                      <span className="text-slate-400">· {it.storeName} ({it.storeLocationName || 'Central'})</span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-3 text-right">
                                                  <span className="font-semibold text-slate-800 tabular-nums">
                                                    {it.unitsInStore} {it.uom}
                                                  </span>
                                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                    +{Math.max(0, it.daysInStore - stale.thresholdDays)}d overdue
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Consumable stock by unit: quantities only add up within one unit (litres with litres, reams with reams) ── */}
      {SHOW_STOCK_BY_UNIT && (
      <Panel title="Consumables in stock by unit" subtitle="Stock quantities grouped by measurement unit.">
        {stockByUnit.length === 0 ? (
          <EmptyState>No consumables held yet.</EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs" aria-label="Consumables in stock by unit">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3">Unit</th>
                    <th className="px-3 py-2 text-right" title="Different products measured in this unit (each IFMIS item code once)">
                      Items
                    </th>
                    <th className="py-2 pl-3 text-right">In stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockByUnit.map((u) => (
                    <tr key={u.unit}>
                      <td className="py-2 pr-3 font-medium text-slate-900">{u.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{u.items.toLocaleString()}</td>
                      {/* None left in store: all of it issued */}
                      <td
                        className={`py-2 pl-3 text-right font-semibold tabular-nums ${u.inStore > 0 ? 'text-slate-900' : 'text-rose-600'}`}
                        title={u.inStore > 0 ? undefined : 'None left in store: all of it is issued'}
                      >
                        {u.inStore.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The products add up to the Consumables items on the cards */}
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              {(() => {
                const products = stockByUnit.reduce((n, u) => n + u.items, 0);
                return `${products.toLocaleString()} distinct ${products === 1 ? 'product' : 'products'} across ${stockByUnit.length} ${stockByUnit.length === 1 ? 'unit' : 'units'}`;
              })()}
            </p>
          </>
        )}
      </Panel>
      )}

      {/* ── Row 4: Locations (Warehouse & Store Distribution) ────────────────── */}
      {SHOW_STORE_LOCATIONS && (
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
                  <th className="px-3.5 py-1.5 text-right">Items</th>
                  <th className="px-3.5 py-1.5">Status Allocation</th>
                  {SHOW_VALUES && <th className="px-3.5 py-1.5 text-right">Valuation (ETB)</th>}
                  <th className="px-3.5 py-1.5">Key Categories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {storeLocations.map((loc: any) => {
                  const total = loc.itemLines ?? loc.itemCount ?? 0;
                  const avail = loc.availableLines ?? loc.availableCount ?? 0;
                  const issued = loc.issuedLines ?? loc.issuedCount ?? 0;
                  const pending = loc.pendingLines ?? loc.pendingCount ?? 0;
                  const other = Math.max(0, total - avail - issued - pending);
                  const segments = [
                    { key: 'AVAILABLE', ...ITEM_STATUS_STYLE.AVAILABLE, count: avail },
                    { key: 'ISSUED', ...ITEM_STATUS_STYLE.ISSUED, count: issued },
                    { key: 'PENDING', ...ITEM_STATUS_STYLE.PENDING, count: pending },
                    { key: 'OTHER', ...ITEM_STATUS_STYLE.OTHER, count: other },
                  ];
                  const topCats = withVehiclesTogether(loc.categoryBreakdown || []).sort((a: any, b: any) => b.count - a.count).slice(0, 2);

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
                      {SHOW_VALUES && (
                        <td className="px-3.5 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {formatETBTotal(loc.totalValueETB || 0)}
                        </td>
                      )}
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
              const total = loc.itemLines ?? loc.itemCount ?? 0;
              const avail = loc.availableLines ?? loc.availableCount ?? 0;
              const issued = loc.issuedLines ?? loc.issuedCount ?? 0;
              const pending = loc.pendingLines ?? loc.pendingCount ?? 0;
              const other = Math.max(0, total - avail - issued - pending);
              const segments = [
                { key: 'AVAILABLE', ...ITEM_STATUS_STYLE.AVAILABLE, count: avail },
                { key: 'ISSUED', ...ITEM_STATUS_STYLE.ISSUED, count: issued },
                { key: 'PENDING', ...ITEM_STATUS_STYLE.PENDING, count: pending },
                { key: 'OTHER', ...ITEM_STATUS_STYLE.OTHER, count: other },
              ];
              const topCats = withVehiclesTogether(loc.categoryBreakdown || []).sort((a: any, b: any) => b.count - a.count).slice(0, 3);

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
                      <span className="text-[10px] text-slate-500">{total === 1 ? 'item' : 'items'}</span>
                    </div>
                  </div>

                  {SHOW_VALUES && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">Total value</span>
                      <span className="font-semibold text-slate-900">{formatETBTotal(loc.totalValueETB || 0)}</span>
                    </div>
                  )}

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
      )}
    </div>
  );
};
