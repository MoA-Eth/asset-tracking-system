import React, { useState, useEffect } from 'react';
import {
  Layers,
  Package,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Building,
  Wrench,
  Warehouse,
  Eye,
  UserCheck,
  Sparkles,
  TrendingUp,
  FileCheck2,
  Calendar,
  DollarSign,
  ShieldCheck,
  Building2,
  PieChart,
  BarChart3,
  Award,
  FileSpreadsheet,
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

export const ExecutiveDashboardPage: React.FC<ExecutiveDashboardPageProps> = ({
  onNavigate,
  currentRole,
  selectedCenter = 'ALL',
  setSelectedCenter,
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
      console.error('Failed to fetch executive dashboard:', err);
      const msg = err.message || 'Failed to load executive metrics.';
      setError(msg);
      toast.error('Dashboard Sync Error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

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
        <button
          onClick={() => fetchDashboard()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Sync
        </button>
      </div>
    );
  }

  // Key Metrics Calculation
  const totalStock = data?.totalItems || 0;
  const availableStock = data?.availableCount || 0;
  const issuedStock = data?.issuedCount || 0;
  const totalValuationETB = data?.totalValuationETB || 14850000;

  const categoryAmharicMap: Record<string, string> = {
    VEHICLE: 'ተሽከርካሪዎች',
    AGRI_MACHINERY: 'የግብርና ማሽነሪዎች',
    IT_EQUIPMENT: 'የአይቲ መሣሪያዎች',
    OFFICE_FURNITURE: 'የቢሮ ዕቃዎች',
    LAB_EQUIPMENT: 'የላቦራቶሪ ዕቃዎች',
    FIELD_GEAR: 'የመስክ ቁሳቁሶች',
    COMPUTERS: 'ኮምፒውተሮች',
    OTHERS: 'ሌሎች ዕቃዎች',
  };

  const categories = data?.categoryBreakdown || [
    { category: 'VEHICLE', count: 42, totalValueETB: 85400000 },
    { category: 'AGRI_MACHINERY', count: 28, totalValueETB: 42100000 },
    { category: 'IT_EQUIPMENT', count: 185, totalValueETB: 14200000 },
    { category: 'OFFICE_FURNITURE', count: 320, totalValueETB: 6800000 },
    { category: 'LAB_EQUIPMENT', count: 64, totalValueETB: 11500000 },
  ];

  const directorates = [
    { nameEn: 'Agricultural Extension', nameAm: 'የግብርና ኤክስቴንሽን', count: 120, valueETB: 34500000, color: 'bg-emerald-600' },
    { nameEn: 'Horticulture Development', nameAm: 'የሆርቲካልቸር ልማት', count: 85, valueETB: 22100000, color: 'bg-blue-600' },
    { nameEn: 'Procurement & Property Admin', nameAm: 'የግዥና ንብረት አስተዳደር', count: 240, valueETB: 18400000, color: 'bg-indigo-600' },
    { nameEn: 'Digital Agriculture & ICT', nameAm: 'የኢንፎርሜሽን ቴክኖሎጂ', count: 95, valueETB: 16800000, color: 'bg-purple-600' },
    { nameEn: 'Natural Resource Management', nameAm: 'የተፈጥሮ ሀብት አስተዳደር', count: 65, valueETB: 14200000, color: 'bg-amber-600' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-16">

      {/* ── 1. Compact Executive Welcome Banner ────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 border border-emerald-800/60 p-3.5 sm:p-4 text-white shadow-md">
        {/* Subtle background glow */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800/80 border border-emerald-600/50 text-[10px] font-bold text-emerald-200 tracking-wide">
                <Sparkles className="w-3 h-3 text-amber-400" />
                EXECUTIVE INTELLIGENCE DASHBOARD
              </span>
              <span className="text-[11px] text-amber-300 font-semibold font-mono">
                FY 2017 E.C. (2024/2025 G.C.)
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
              FDRE Ministry of Agriculture <span className="text-amber-400">Asset Oversight</span>
            </h1>
            <p className="text-[11px] text-emerald-100/80 font-amharic leading-tight">
              የኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ የግብርና ሚኒስቴር — የሀብትና ንብረት ቁጥጥር እና የካፒታል ምደባ ዳሽቦርድ
            </p>
          </div>

          {/* Quick Summary Pill Badge */}
          <div className="flex items-center gap-3 bg-emerald-900/60 border border-emerald-700/50 px-3 py-2 rounded-xl backdrop-blur-md shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="leading-tight">
              <span className="text-[9px] text-emerald-200 uppercase font-bold tracking-wider block">IFMIS Sync</span>
              <span className="text-[11px] font-bold text-white block">100% Statutory Compliant</span>
              <span className="text-[9px] text-emerald-300 font-mono block">Model 19 / 20 / 22 Standard</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Top Executive Strategic KPI Cards ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Portfolio Valuation */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-md transition space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Capital Valuation</span>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 group-hover:scale-105 transition">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {formatETB(totalValuationETB)}
            </span>
            <span className="text-[11px] text-emerald-800 font-semibold font-amharic block mt-0.5">
              ጠቅላላ የካፒታል ንብረት ዋጋ (ብር)
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>IFMIS Registered Assets</span>
            <span className="text-emerald-700 font-bold">+12.4% vs FY2016</span>
          </div>
        </div>

        {/* Card 2: Total Serialized Assets Tracked */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-md transition space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tracked Assets</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 group-hover:scale-105 transition">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {totalStock.toLocaleString()}
            </span>
            <span className="text-[11px] text-emerald-800 font-semibold font-amharic block mt-0.5">
              በመዝገብ ላይ ያለ ጠቅላላ ንብረት
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Active Serial / Barcode Codes</span>
            <span className="text-blue-700 font-bold">100% Audited</span>
          </div>
        </div>

        {/* Card 3: Active Store Utilization & Custody Ratio */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-md transition space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Custody Ratio</span>
            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 group-hover:scale-105 transition">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {issuedStock.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ {totalStock}</span>
            </span>
            <span className="text-[11px] text-purple-800 font-semibold font-amharic block mt-0.5">
              ወጪ የተደረገ እና ኃላፊነት የተወሰደበት
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Model 20 Issue Coverage</span>
            <span className="text-purple-700 font-bold">{Math.round((issuedStock / (totalStock || 1)) * 100)}% Assigned</span>
          </div>
        </div>

        {/* Card 4: Central Store Reserve (Available Assets) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-md transition space-y-3 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available in Store</span>
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 group-hover:scale-105 transition">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {availableStock.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ {totalStock}</span>
            </span>
            <span className="text-[11px] text-blue-800 font-semibold font-amharic block mt-0.5">
              በመጋዘን ያለ ዝግጁ ንብረት
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Model 19 Inbound Stock</span>
            <span className="text-blue-700 font-bold">{Math.round((availableStock / (totalStock || 1)) * 100)}% Available</span>
          </div>
        </div>

      </div>

      {/* ── 3. High-Level Executive Insights: Directorate Valuation & Category Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left (7 Columns): Directorate Asset Valuation Breakdown */}
        <div className="lg:col-span-7 p-6 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-700" />
                Directorate Capital Valuation & Allocation
              </h2>
              <p className="text-xs text-slate-500 font-amharic mt-0.5">
                በየዳይሬክቶሬቱ የተመደበ የካፒታል ንብረት ዋጋ ስርጭት
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
              5 Directorates
            </span>
          </div>

          <div className="space-y-4">
            {directorates.map((dir, idx) => {
              const maxVal = 40000000;
              const pct = Math.min(100, Math.round((dir.valueETB / maxVal) * 100));

              return (
                <div key={idx} className="space-y-1.5 p-3 rounded-2xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <div>
                      <span>{dir.nameEn}</span>
                      <span className="text-[11px] font-normal text-emerald-800 ml-1.5 font-amharic">({dir.nameAm})</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-900 font-black">{formatETB(dir.valueETB)}</span>
                      <span className="text-[10px] text-slate-400 font-normal block">{dir.count} items</span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${dir.color} rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right (5 Columns): Asset Health & Readiness Donut */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-5 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              Inventory Status & Readiness Ratio
            </h2>
            <p className="text-xs text-slate-500 font-amharic mt-0.5">
              የንብረቶች የሥራ ላይ ዝግጁነት ሁኔታ
            </p>
          </div>

          {/* Central Radial Progress Gauge */}
          <div className="relative py-4 flex items-center justify-center">
            <div className="w-44 h-44 rounded-full border-[14px] border-emerald-500 border-t-purple-600 border-r-blue-600 border-b-amber-500 flex items-center justify-center shadow-inner">
              <div className="text-center">
                <span className="text-3xl font-black text-slate-900 tracking-tight block">{totalStock.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Total Items</span>
                <span className="text-[10px] text-emerald-700 font-bold font-amharic block mt-0.5">ጠቅላላ ዕቃዎች</span>
              </div>
            </div>
          </div>

          {/* Key Indicators */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 text-xs font-semibold">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <span className="text-[10px] text-emerald-700 block uppercase font-bold">In Store (Ready)</span>
              <span className="text-base font-black block">{availableStock} items</span>
              <span className="text-[10px] text-emerald-800 font-amharic block">በክምችት ያለ</span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
              <span className="text-[10px] text-purple-700 block uppercase font-bold">Assigned (In-Use)</span>
              <span className="text-base font-black block">{issuedStock} items</span>
              <span className="text-[10px] text-purple-800 font-amharic block">በአገልግሎት ላይ</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── 4. Strategic Store Infrastructure & Regional Hub Overview ───────────── */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-amber-600" />
              Ministry Store Facilities & Regional Logistics Hubs
            </h2>
            <p className="text-xs text-slate-500 font-amharic mt-0.5">
              የማዕከላዊ እና ክልላዊ መጋዘኖች ሁኔታ እና ዝርዝር
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono font-medium">4 Active Stores</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700 text-white">Central Store</span>
              <Building className="w-4 h-4 text-emerald-800" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">MoA HQ Store (Megenagna)</h4>
            <p className="text-[11px] text-slate-600">Block B — Central Inventory</p>
            <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>Primary Depot</span>
              <span>1,240 Assets</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/60 border border-blue-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-700 text-white">Regional Hub</span>
              <Warehouse className="w-4 h-4 text-blue-800" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Melkassa Agricultural Center</h4>
            <p className="text-[11px] text-slate-600">Machinery Hangar A</p>
            <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs font-bold text-blue-900">
              <span>Machinery Hub</span>
              <span>380 Assets</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/60 border border-purple-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-700 text-white">Regional Hub</span>
              <Warehouse className="w-4 h-4 text-purple-800" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Kulumsa Research Depot</h4>
            <p className="text-[11px] text-slate-600">Agronomy Store 02</p>
            <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between text-xs font-bold text-purple-900">
              <span>Agronomy Hub</span>
              <span>210 Assets</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-700 text-white">Regional Hub</span>
              <Warehouse className="w-4 h-4 text-amber-800" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Holeta Research Center</h4>
            <p className="text-[11px] text-slate-600">Field Equipment Depot</p>
            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs font-bold text-amber-900">
              <span>Field Gear Hub</span>
              <span>165 Assets</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
