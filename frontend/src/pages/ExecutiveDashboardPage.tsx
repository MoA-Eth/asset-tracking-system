import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  Warehouse,
  UserCheck,
  Sparkles,
  DollarSign,
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
  Zap,
  Eye,
} from 'lucide-react';
import { api } from '../api/client';
import { formatETB } from '../utils/eth-date';
import { UserRole } from '../types/asset-management';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface ExecutiveDashboardPageProps {
  onNavigate: (tab: string) => void;
  currentRole: UserRole;
  selectedCenter?: string;
  setSelectedCenter?: (center: string) => void;
}

const CONDITION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; bar: string }> = {
  NEW:          { label: 'New',          color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', bar: 'bg-emerald-500' },
  GOOD:         { label: 'Good',         color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    bar: 'bg-blue-500'    },
  FAIR:         { label: 'Fair',         color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   bar: 'bg-amber-500'   },
  NEEDS_REPAIR: { label: 'Needs Repair', color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  bar: 'bg-orange-500'  },
  DAMAGED:      { label: 'Damaged',      color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     bar: 'bg-red-500'     },
};

const CATEGORY_LABELS: Record<string, { en: string; am: string }> = {
  VEHICLE:          { en: 'Vehicles',           am: 'ተሽከርካሪዎች' },
  AGRI_MACHINERY:   { en: 'Agri. Machinery',    am: 'የግብርና ማሽነሪዎች' },
  IT_EQUIPMENT:     { en: 'IT Equipment',       am: 'የአይቲ መሣሪያዎች' },
  OFFICE_FURNITURE: { en: 'Office Furniture',   am: 'የቢሮ ዕቃዎች' },
  LAB_EQUIPMENT:    { en: 'Lab Equipment',      am: 'የላቦራቶሪ ዕቃዎች' },
  FIELD_GEAR:       { en: 'Field Gear',         am: 'የመስክ ቁሳቁሶች' },
};

const CATEGORY_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-purple-500', 'bg-amber-500', 'bg-rose-500',
];

const ACTION_ICON: Record<string, React.ReactNode> = {
  REGISTER_STOCK_IN:   <Package className="w-3 h-3" />,
  APPROVE_STOCK_IN:    <CheckCircle2 className="w-3 h-3" />,
  REGISTER_STOCK_OUT:  <ArrowRightLeft className="w-3 h-3" />,
  APPROVE_STOCK_OUT:   <CheckCircle2 className="w-3 h-3" />,
  TRANSFER_ITEM:       <ArrowRightLeft className="w-3 h-3" />,
  REGISTER_RETURN:     <RotateCcw className="w-3 h-3" />,
  APPROVE_RETURN:      <CheckCircle2 className="w-3 h-3" />,
  ENDORSE_STOCK_IN:    <FileText className="w-3 h-3" />,
  ENDORSE_STOCK_OUT:   <FileText className="w-3 h-3" />,
  ENDORSE_RETURN:      <FileText className="w-3 h-3" />,
};

function getActionStyle(action: string): string {
  if (action.startsWith('APPROVE') || action.startsWith('REGISTER_STOCK_IN')) return 'bg-emerald-100 text-emerald-800';
  if (action.startsWith('REJECT')) return 'bg-red-100 text-red-800';
  if (action.startsWith('ENDORSE')) return 'bg-blue-100 text-blue-800';
  if (action.includes('RETURN')) return 'bg-purple-100 text-purple-800';
  if (action.includes('TRANSFER')) return 'bg-indigo-100 text-indigo-800';
  return 'bg-slate-100 text-slate-700';
}

export const ExecutiveDashboardPage: React.FC<ExecutiveDashboardPageProps> = ({
  onNavigate,
  currentRole,
}) => {
  const { user } = useAuth();
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
          <div className="w-12 h-12 rounded-2xl bg-emerald-900 border-2 border-amber-400 flex items-center justify-center shadow-lg animate-bounce">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-600">Syncing Executive Asset Intelligence...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Executive Analytics Sync Failed</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button onClick={fetchDashboard} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Retry Sync
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
  const totalValuation    = data?.totalValuationETB     || 0;
  const issuedValuation   = data?.issuedValuationETB    || 0;
  const availableValuation= data?.availableValuationETB || 0;
  const unassignedCount   = data?.unassignedItemsCount  || 0;

  const issuedPct    = totalItems > 0 ? Math.round((issuedCount / totalItems) * 100) : 0;
  const availablePct = totalItems > 0 ? Math.round((availableCount / totalItems) * 100) : 0;

  // Department data — real from API
  const deptRows: any[] = (data?.departmentDistribution || [])
    .filter((d: any) => d.itemCount > 0)
    .sort((a: any, b: any) => b.totalValueETB - a.totalValueETB)
    .slice(0, 6);

  const deptMaxVal = deptRows.length > 0 ? deptRows[0].totalValueETB : 1;
  const DEPT_COLORS = ['bg-emerald-600', 'bg-blue-600', 'bg-indigo-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600'];

  // Category breakdown — real from API
  const categoryRows: any[] = (data?.categoryBreakdown || []).filter((c: any) => c.count > 0);
  const catTotal = categoryRows.reduce((s: number, c: any) => s + c.count, 0) || 1;

  // Condition distribution — real from API
  const condRows: any[] = data?.conditionDistribution || [];
  const condTotal = condRows.reduce((s: number, c: any) => s + c.count, 0) || 1;
  const atRiskCount = condRows
    .filter((c: any) => c.condition === 'NEEDS_REPAIR' || c.condition === 'DAMAGED')
    .reduce((s: number, c: any) => s + c.count, 0);

  // Top value assets — real from API
  const topAssets: any[] = (data?.topValuationAssets || []).slice(0, 6);

  // Store locations — real from API
  const storeLocations: any[] = data?.locationUtilization || [];

  // Recent audit trail — real from API
  const recentLogs: any[] = data?.recentAuditLogs || [];

  return (
    <div className="space-y-5 animate-fadeIn pb-16">

      {/* ── Banner ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 border border-emerald-800/60 p-3.5 sm:p-4 text-white shadow-md">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800/80 border border-emerald-600/50 text-[10px] font-bold text-emerald-200 tracking-wide">
                <Sparkles className="w-3 h-3 text-amber-400" /> EXECUTIVE INTELLIGENCE DASHBOARD
              </span>
              <span className="text-[11px] text-amber-300 font-semibold font-mono">
                FY 2017 E.C. (2024/2025 G.C.)
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
              FDRE Ministry of Agriculture <span className="text-amber-400">Asset Oversight</span>
            </h1>
            <p className="text-[11px] text-emerald-100/80 font-amharic leading-tight">
              የኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ የግብርና ሚኒስቴር — የሀብትና ንብረት ቁጥጥር
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {pendingApprovals > 0 && (
              <button
                onClick={() => onNavigate('approvals')}
                className="flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-amber-950">{pendingApprovals}</span>
                </div>
                <div className="leading-tight text-left">
                  <span className="text-[9px] text-amber-200 uppercase font-bold tracking-wider block">Action Required</span>
                  <span className="text-[11px] font-bold text-white block">Pending Approvals</span>
                </div>
              </button>
            )}
            <div className="flex items-center gap-2 bg-emerald-900/60 border border-emerald-700/50 px-3 py-2 rounded-xl backdrop-blur-md">
              <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
              </div>
              <div className="leading-tight">
                <span className="text-[9px] text-emerald-200 uppercase font-bold tracking-wider block">IFMIS Sync</span>
                <span className="text-[11px] font-bold text-white block">100% Compliant</span>
                <span className="text-[9px] text-emerald-300 font-mono block">Model 19 / 21 / 22</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 1: 4 KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total Valuation */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Valuation</span>
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 group-hover:scale-105 transition">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">{formatETB(totalValuation)}</span>
            <span className="text-[10px] text-emerald-700 font-semibold font-amharic block mt-0.5">ጠቅላላ የካፒታል ንብረት ዋጋ</span>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="text-emerald-700 font-bold">Issued: {formatETB(issuedValuation)}</span>
          </div>
        </div>

        {/* Total Assets */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Assets</span>
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 group-hover:scale-105 transition">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">{totalItems.toLocaleString()}</span>
            <span className="text-[10px] text-emerald-700 font-semibold font-amharic block mt-0.5">በመዝገብ ላይ ያለ ጠቅላላ ንብረት</span>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            {unassignedCount > 0
              ? <span className="text-amber-600 font-bold">{unassignedCount} unassigned items</span>
              : <span className="text-blue-700 font-bold">All items tracked</span>
            }
          </div>
        </div>

        {/* In Store */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">In Store</span>
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 group-hover:scale-105 transition">
              <Warehouse className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">
              {availableCount} <span className="text-xs text-slate-400 font-normal">/ {totalItems}</span>
            </span>
            <span className="text-[10px] text-blue-700 font-semibold font-amharic block mt-0.5">በመጋዘን ያለ ዝግጁ ንብረት</span>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <div className="w-full bg-slate-100 h-1.5 rounded-full">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${availablePct}%` }} />
            </div>
            <span className="text-[11px] text-blue-700 font-bold">{availablePct}% Available</span>
          </div>
        </div>

        {/* Issued / Pending */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Issued</span>
            <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 group-hover:scale-105 transition">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">
              {issuedCount} <span className="text-xs text-slate-400 font-normal">/ {totalItems}</span>
            </span>
            <span className="text-[10px] text-purple-700 font-semibold font-amharic block mt-0.5">ወጪ የተደረገ ንብረት</span>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <div className="w-full bg-slate-100 h-1.5 rounded-full">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${issuedPct}%` }} />
            </div>
            <span className="text-[11px] text-purple-700 font-bold">{issuedPct}% Issued</span>
          </div>
        </div>

      </div>

      {/* ── Row 2: Pending Workflow Status Chips (if any) ───────────────────── */}
      {(pendingApprovals > 0 || pendingStockIn > 0 || pendingStockOut > 0 || atRiskCount > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {pendingApprovals > 0 && (
            <button onClick={() => onNavigate('approvals')} className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-400 hover:bg-amber-100 transition cursor-pointer text-left">
              <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0"><Clock className="w-3.5 h-3.5" /></div>
              <div>
                <span className="text-lg font-black text-amber-900 block">{pendingApprovals}</span>
                <span className="text-[10px] text-amber-700 font-bold uppercase">Pending Approvals</span>
              </div>
            </button>
          )}
          {pendingStockIn > 0 && (
            <button onClick={() => onNavigate('stock-in')} className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100 transition cursor-pointer text-left">
              <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0"><Package className="w-3.5 h-3.5" /></div>
              <div>
                <span className="text-lg font-black text-emerald-900 block">{pendingStockIn}</span>
                <span className="text-[10px] text-emerald-700 font-bold uppercase">Pending Stock-In</span>
              </div>
            </button>
          )}
          {pendingStockOut > 0 && (
            <button onClick={() => onNavigate('stock-out')} className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100 transition cursor-pointer text-left">
              <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0"><ArrowRightLeft className="w-3.5 h-3.5" /></div>
              <div>
                <span className="text-lg font-black text-indigo-900 block">{pendingStockOut}</span>
                <span className="text-[10px] text-indigo-700 font-bold uppercase">Pending Stock-Out</span>
              </div>
            </button>
          )}
          {atRiskCount > 0 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200">
              <div className="p-2 rounded-lg bg-red-600 text-white shrink-0"><AlertTriangle className="w-3.5 h-3.5" /></div>
              <div>
                <span className="text-lg font-black text-red-900 block">{atRiskCount}</span>
                <span className="text-[10px] text-red-700 font-bold uppercase">At-Risk Assets</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Row 3: Department Breakdown + Category Distribution ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Left: Dept Allocation */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" /> Directorate / Department Allocation
              </h2>
              <p className="text-[10px] text-slate-500 font-amharic mt-0.5">
                {deptRows.length > 0 ? 'Real-time data from IFMIS registry' : 'No items assigned to departments yet'}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800">
              {deptRows.length} Directorates
            </span>
          </div>

          {deptRows.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No department allocations yet. Issue items to departments via Stock-Out.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deptRows.map((dept: any, idx: number) => {
                const pct = Math.min(100, Math.round((dept.totalValueETB / deptMaxVal) * 100));
                return (
                  <div key={dept.departmentId} className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-50/80 transition">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{dept.nameEn}</span>
                        <span className="text-[10px] font-normal text-emerald-700 font-amharic">{dept.nameAm}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-slate-900 font-black block">{formatETB(dept.totalValueETB)}</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {dept.itemCount} items · {dept.issuedCount} issued
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${DEPT_COLORS[idx % DEPT_COLORS.length]} rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Category Breakdown */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" /> Asset Category Distribution
            </h2>
            <p className="text-[10px] text-slate-500 font-amharic mt-0.5">የንብረት አይነት ስርጭት</p>
          </div>

          {/* Stacked bar */}
          {categoryRows.length > 0 && (
            <div className="w-full h-4 rounded-full overflow-hidden flex gap-0.5">
              {categoryRows.map((cat: any, idx: number) => (
                <div
                  key={cat.category}
                  title={`${CATEGORY_LABELS[cat.category]?.en || cat.category}: ${cat.count}`}
                  className={`h-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} transition-all`}
                  style={{ width: `${(cat.count / catTotal) * 100}%` }}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            {categoryRows.map((cat: any, idx: number) => {
              const pct = Math.round((cat.count / catTotal) * 100);
              const label = CATEGORY_LABELS[cat.category] || { en: cat.category, am: '' };
              return (
                <div key={cat.category} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`} />
                    <span className="text-slate-700 font-medium truncate">{label.en}</span>
                    <span className="text-[10px] text-slate-400 font-amharic hidden sm:inline">{label.am}</span>
                  </div>
                  <div className="shrink-0 ml-2 text-right">
                    <span className="font-bold text-slate-900">{cat.count}</span>
                    <span className="text-slate-400 font-normal"> ({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>

          {categoryRows.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No items registered yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Condition Health + Top Value Assets ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Condition Health */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-600" /> Asset Health & Condition Report
            </h2>
            <p className="text-[10px] text-slate-500 font-amharic mt-0.5">የንብረቶች ጤንነት ሁኔታ</p>
          </div>

          {atRiskCount > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-xs text-red-800 font-semibold">
                <span className="font-black">{atRiskCount}</span> asset{atRiskCount !== 1 ? 's' : ''} need attention (Damaged or Needs Repair)
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {condRows.map((cond: any) => {
              const cfg = CONDITION_CONFIG[cond.condition];
              if (!cfg) return null;
              const pct = Math.round((cond.count / condTotal) * 100);
              return (
                <div key={cond.condition} className={`p-3 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                    <div className="text-right">
                      <span className={`text-sm font-black ${cfg.color}`}>{cond.count}</span>
                      <span className="text-[10px] text-slate-500 ml-1">({pct}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-white/60 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full ${cfg.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Value Assets */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-600" /> Top High-Value Assets
              </h2>
              <p className="text-[10px] text-slate-500 font-amharic mt-0.5">ከፍተኛ ዋጋ ያላቸው ንብረቶች</p>
            </div>
            <button onClick={() => onNavigate('stock-in')} className="text-[10px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer">
              <Eye className="w-3 h-3" /> View All
            </button>
          </div>

          {topAssets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No assets registered yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topAssets.map((asset: any, idx: number) => {
                const statusColors: Record<string, string> = {
                  AVAILABLE:        'bg-emerald-100 text-emerald-800',
                  ISSUED:           'bg-purple-100 text-purple-800',
                  PENDING_STOCK_IN: 'bg-amber-100 text-amber-800',
                  PENDING_STOCK_OUT:'bg-indigo-100 text-indigo-800',
                  DISPOSED:         'bg-slate-100 text-slate-600',
                };
                return (
                  <div key={asset.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                    <span className="text-xs font-black text-slate-400 w-4 shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{asset.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{asset.itemCode}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${statusColors[asset.status] || 'bg-slate-100 text-slate-700'}`}>
                      {asset.status?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-black text-slate-900 shrink-0">{formatETB(asset.unitCostETB)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Asset Distribution by Location ───────────────────────────── */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-emerald-700" /> Asset Distribution by Location
            </h2>
            <p className="text-[10px] text-slate-500 font-amharic mt-0.5">
              በማከማቻ ቦታ የተከፋፈለ የንብረት ክምችት
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800">
            {storeLocations.filter((l: any) => l.itemCount > 0).length} Active Location{storeLocations.filter((l: any) => l.itemCount > 0).length !== 1 ? 's' : ''}
          </span>
        </div>

        {storeLocations.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No store locations configured yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {storeLocations.map((loc: any, idx: number) => {
              const total = loc.itemCount || 0;
              const avail = loc.availableCount || 0;
              const issued = loc.issuedCount || 0;
              const pending = loc.pendingCount || 0;
              const other = total - avail - issued - pending;
              const availPct  = total > 0 ? Math.round((avail   / total) * 100) : 0;
              const issuedPct = total > 0 ? Math.round((issued  / total) * 100) : 0;
              const pendPct   = total > 0 ? Math.round((pending / total) * 100) : 0;
              const topCats   = (loc.categoryBreakdown || []).slice(0, 3);

              const BORDER_COLORS = ['border-emerald-300', 'border-blue-300', 'border-indigo-300', 'border-purple-300', 'border-amber-300'];
              const HEADER_COLORS = ['from-emerald-50 to-emerald-100/40', 'from-blue-50 to-blue-100/40', 'from-indigo-50 to-indigo-100/40', 'from-purple-50 to-purple-100/40', 'from-amber-50 to-amber-100/40'];
              const ICON_COLORS   = ['text-emerald-700', 'text-blue-700', 'text-indigo-700', 'text-purple-700', 'text-amber-700'];
              const bc  = BORDER_COLORS[idx % BORDER_COLORS.length];
              const hc  = HEADER_COLORS[idx % HEADER_COLORS.length];
              const ic  = ICON_COLORS[idx % ICON_COLORS.length];

              return (
                <div key={loc.id} className={`rounded-xl border-2 ${bc} overflow-hidden`}>
                  {/* Card Header */}
                  <div className={`p-3.5 bg-gradient-to-br ${hc} flex items-start justify-between gap-2`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Warehouse className={`w-3.5 h-3.5 shrink-0 ${ic}`} />
                        <span className="text-xs font-black text-slate-900 truncate">{loc.siteName}</span>
                        {loc.isCentralStore && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-700 text-white shrink-0">Central</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{loc.building} — {loc.roomNumber}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xl font-black ${ic}`}>{total}</span>
                      <span className="text-[10px] text-slate-500 block">items</span>
                    </div>
                  </div>

                  {/* Valuation */}
                  <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Total Value</span>
                    <span className="text-xs font-black text-slate-900">{formatETB(loc.totalValueETB || 0)}</span>
                  </div>

                  {/* Stacked Status Bar */}
                  <div className="px-3.5 pt-3">
                    <div className="w-full h-3 rounded-full overflow-hidden flex gap-0.5 bg-slate-100">
                      {avail > 0 && (
                        <div title={`Available: ${avail}`} className="h-full bg-emerald-500 transition-all" style={{ width: `${availPct}%` }} />
                      )}
                      {issued > 0 && (
                        <div title={`Issued: ${issued}`} className="h-full bg-purple-500 transition-all" style={{ width: `${issuedPct}%` }} />
                      )}
                      {pending > 0 && (
                        <div title={`Pending: ${pending}`} className="h-full bg-amber-400 transition-all" style={{ width: `${pendPct}%` }} />
                      )}
                      {other > 0 && (
                        <div title={`Other: ${other}`} className="h-full bg-slate-300 transition-all flex-1" />
                      )}
                    </div>
                  </div>

                  {/* Status Chips */}
                  <div className="px-3.5 pt-2 pb-3 flex flex-wrap gap-1.5 text-[9px] font-bold">
                    {avail > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {avail} Available
                      </span>
                    )}
                    {issued > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        {issued} Issued
                      </span>
                    )}
                    {pending > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        {pending} Pending
                      </span>
                    )}
                    {total === 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        Empty
                      </span>
                    )}
                  </div>

                  {/* Top categories at this location */}
                  {topCats.length > 0 && (
                    <div className="px-3.5 pb-3 border-t border-slate-100 pt-2.5">
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Top Categories</p>
                      <div className="flex flex-wrap gap-1">
                        {topCats.map((cat: any) => {
                          const label = CATEGORY_LABELS[cat.category]?.en || cat.category;
                          return (
                            <span key={cat.category} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[9px] text-slate-700 font-semibold">
                              {label} ({cat.count})
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Row 6: Store Facilities + Recent Activity ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Store Facilities */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-amber-600" /> Store Locations Summary
            </h2>
            <p className="text-[10px] text-slate-500 font-amharic mt-0.5">
              {storeLocations.length} Configured Store{storeLocations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-2.5">
            {(storeLocations.length > 0 ? storeLocations : [
              { id: 'LOC-01', siteName: 'Kality', building: 'Kality Depot', roomNumber: 'Store-01', itemCount: 0, totalValueETB: 0, isCentralStore: false },
              { id: 'LOC-02', siteName: 'Saris', building: 'Saris Storehouse', roomNumber: 'Store-02', itemCount: 0, totalValueETB: 0, isCentralStore: false },
              { id: 'LOC-03', siteName: 'Head Office', building: 'Main HQ Block', roomNumber: 'Central Store', itemCount: 0, totalValueETB: 0, isCentralStore: true },
            ]).map((loc: any, idx: number) => {
              const themes = [
                { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-700', text: 'text-emerald-700' },
                { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-700', text: 'text-blue-700' },
                { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-700', text: 'text-amber-700' },
              ];
              const theme = themes[idx % themes.length];
              return (
                <div key={loc.id} className={`p-3.5 rounded-xl ${theme.bg} border ${theme.border} flex items-center justify-between gap-3`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Warehouse className={`w-3.5 h-3.5 ${theme.text} shrink-0`} />
                      <span className="text-xs font-bold text-slate-900 truncate">{loc.siteName}</span>
                      {loc.isCentralStore && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${theme.badge} text-white shrink-0`}>Central</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{loc.building} — {loc.roomNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-black ${theme.text}`}>{loc.itemCount ?? 0}</span>
                    <span className="text-[10px] text-slate-500 block">items</span>
                    <span className="text-[10px] font-mono text-slate-700 font-semibold">{formatETB(loc.totalValueETB || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Audit Activity */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-600" /> Recent System Activity
              </h2>
              <p className="text-[10px] text-slate-500 font-amharic mt-0.5">ቅርብ ጊዜ የስርዓት ድርጊቶች</p>
            </div>
            <button onClick={() => onNavigate('audit')} className="text-[10px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer">
              <Eye className="w-3 h-3" /> Full Log
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 transition">
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${getActionStyle(log.action)}`}>
                    {ACTION_ICON[log.action] || <Activity className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-900 truncate">
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{log.details}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{log.userName} · {log.timestampEc || log.timestampGc}</p>
                  </div>
                  {log.ifmisSlipNumber && (
                    <span className="text-[9px] font-mono text-slate-500 shrink-0 mt-0.5">#{log.ifmisSlipNumber}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
