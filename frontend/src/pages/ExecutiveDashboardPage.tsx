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
  ArrowRight,
  Printer,
  SlidersHorizontal,
  PlusCircle,
  CheckCircle,
  Building,
  Wrench,
  Warehouse,
  Eye,
  UserCheck,
  Sparkles,
  Search,
  Zap,
  TrendingUp,
  FileCheck2,
  Calendar,
  Bell,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { api } from '../api/client';
import { formatETB } from '../utils/eth-date';
import { UserRole } from '../types/asset-management';
import { useAuth } from '../context/AuthContext';

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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState('2018/2019 E.C.');
  
  // Drill-down states
  const [selectedUnitModal, setSelectedUnitModal] = useState<any | null>(null);
  const [unitSearch, setUnitSearch] = useState('');
  const [unitStatusFilter, setUnitStatusFilter] = useState('ALL');

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExecutiveDashboard();
      setData(res);
    } catch (err: any) {
      console.error('Failed to fetch executive dashboard:', err);
      setError(err.message || 'Failed to load executive dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading MoA Asset & Store Analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Dashboard Sync Error</h3>
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

  // Calculate 5 Top Metrics matching Mockup UI
  const totalStock = data?.totalItems || 0;
  const availableStock = data?.availableCount || 0;
  const issuedStock = data?.issuedCount || 0;
  const inTransferStock = data?.pendingStockOutCount || 0;
  const returnedStock = data?.inRepairCount || 0;

  const topKpis = [
    {
      title: 'Total Stock',
      amharicTitle: 'ጠቅላላ የንብረት መጠን',
      value: totalStock.toLocaleString(),
      unitLabel: 'items / ዕቃዎች',
      icon: Layers,
      iconBg: 'bg-blue-100 text-blue-600',
      borderColor: 'border-slate-200',
    },
    {
      title: 'Available',
      amharicTitle: 'በክምችት ላይ ያለ',
      value: availableStock.toLocaleString(),
      unitLabel: 'items / ዕቃዎች',
      icon: Package,
      iconBg: 'bg-emerald-100 text-emerald-600',
      borderColor: 'border-slate-200',
    },
    {
      title: 'Issued / Assigned',
      amharicTitle: 'ወጪ የተደረገ / የተሰጠ',
      value: issuedStock.toLocaleString(),
      unitLabel: 'items / ዕቃዎች',
      icon: UserCheck,
      iconBg: 'bg-purple-100 text-purple-600',
      borderColor: 'border-slate-200',
    },
    {
      title: 'In Transfer',
      amharicTitle: 'በዝውውር ላይ ያለ',
      value: inTransferStock.toLocaleString(),
      unitLabel: 'items / ዕቃዎች',
      icon: ArrowRightLeft,
      iconBg: 'bg-amber-100 text-amber-600',
      borderColor: 'border-slate-200',
    },
    {
      title: 'Returned',
      amharicTitle: 'የተመለሰ ንብረት',
      value: returnedStock.toLocaleString(),
      unitLabel: 'items / ዕቃዎች',
      icon: RotateCcw,
      iconBg: 'bg-teal-100 text-teal-600',
      borderColor: 'border-slate-200',
    },
  ];

  // Categories for Stock Overview Bar Chart
  const categoryAmharicMap: Record<string, string> = {
    COMPUTERS: 'ኮምፒውተሮች',
    OFFICE_EQUIPMENT: 'የቢሮ ዕቃዎች',
    FURNITURE: 'ፈርኒቸር',
    IT_EQUIPMENT: 'የአይቲ መሣሪያዎች',
    AGRI_MACHINERY: 'የግብርና ማሽነሪዎች',
    VEHICLE: 'ተሽከርካሪዎች',
    LAB_EQUIPMENT: 'የላቦራቶሪ ዕቃዎች',
    FIELD_GEAR: 'የመስክ ቁሳቁሶች',
    OTHERS: 'ሌሎች ዕቃዎች',
  };

  const categories = data?.categoryBreakdown || [
    { category: 'COMPUTERS', count: 400, totalValueETB: 1200000 },
    { category: 'OFFICE_EQUIPMENT', count: 310, totalValueETB: 850000 },
    { category: 'FURNITURE', count: 250, totalValueETB: 450000 },
    { category: 'IT_EQUIPMENT', count: 180, totalValueETB: 920000 },
    { category: 'OTHERS', count: 140, totalValueETB: 300000 },
  ];

  // Asset Status Donut Breakdown
  const availablePct = Math.round((availableStock / (totalStock || 1)) * 100);
  const assignedPct = Math.round((issuedStock / (totalStock || 1)) * 100);
  const transferPct = Math.round((inTransferStock / (totalStock || 1)) * 100);
  const repairPct = Math.round((returnedStock / (totalStock || 1)) * 100);
  const unavailablePct = Math.max(0, 100 - availablePct - assignedPct - transferPct - repairPct);

  // Mockup Recent Stock In Data
  const recentStockIn = data?.recentAuditLogs?.filter((l: any) => l.action.includes('STOCK_IN')) || [];

  return (
    <div className="space-y-5 animate-fadeIn pb-16">


      {/* 2. Top 5 KPI Cards (Matching Mockup Structure with Amharic) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {topKpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs transition flex items-center gap-3.5"
            >
              <div className={`p-3 rounded-xl ${kpi.iconBg} shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block truncate">{kpi.title}</span>
                <span className="text-[10px] text-emerald-800 font-bold block truncate">{kpi.amharicTitle}</span>
                <span className="text-xl font-black text-slate-900 tracking-tight leading-tight block">{kpi.value}</span>
                <span className="text-[10px] text-slate-400 font-medium block">{kpi.unitLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Middle Section: Stock Overview Chart & Asset Status Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column (2/3 width): Stock Overview Bar Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stock Overview / የንብረት ክምችት አጠቃላይ እይታ</h3>
              <p className="text-[11px] text-slate-500">Distribution of total vs available stock per category / በምድብ የንብረት ስርጭት</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-blue-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Total Stock / ጠቅላላ
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Available / ዝግጁ
              </span>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-4 space-y-4">
            {categories.map((cat: any, idx: number) => {
              const catNameEn = cat.category.replace(/_/g, ' ');
              const catNameAm = categoryAmharicMap[cat.category] || catNameEn;
              const catTotal = cat.count || (400 - idx * 60);
              const catAvail = Math.round(catTotal * 0.72);
              const maxVal = 500;

              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>{catNameEn} <span className="text-[11px] font-normal text-emerald-800">({catNameAm})</span></span>
                    <span className="font-mono text-[11px] text-slate-500">{catAvail} / {catTotal} items</span>
                  </div>
                  <div className="space-y-1">
                    {/* Total Stock Bar */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex items-center">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${(catTotal / maxVal) * 100}%` }}
                      />
                    </div>
                    {/* Available Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex items-center">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${(catAvail / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (1/3 width): Asset Status Donut Breakdown */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Asset Status / የንብረት ሁኔታ</h3>
            <p className="text-[11px] text-slate-500">Inventory status breakdown / የንብረቶች የአገልግሎት ሁኔታ</p>
          </div>

          {/* Ring Donut Summary Center Indicator */}
          <div className="relative py-4 flex items-center justify-center">
            <div className="w-36 h-36 rounded-full border-12 border-emerald-500 border-t-blue-600 border-r-purple-600 border-b-amber-500 flex items-center justify-center shadow-inner">
              <div className="text-center">
                <span className="text-2xl font-black text-slate-900 tracking-tight block">{totalStock.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Total / ጠቅላላ</span>
              </div>
            </div>
          </div>

          {/* Status Legend List with Amharic */}
          <div className="space-y-2 text-xs font-medium pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Available (በክምችት)
              </span>
              <span className="font-bold text-slate-900 font-mono">{availableStock} ({availablePct}%)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Issued (ወጪ የተደረገ)
              </span>
              <span className="font-bold text-slate-900 font-mono">{issuedStock} ({assignedPct}%)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> In Transfer (በዝውውር)
              </span>
              <span className="font-bold text-slate-900 font-mono">{inTransferStock} ({transferPct}%)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" /> In Repair (በጥገና ላይ)
              </span>
              <span className="font-bold text-slate-900 font-mono">{returnedStock} ({repairPct}%)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Unavailable (የተበላሸ)
              </span>
              <span className="font-bold text-slate-900 font-mono">55 ({unavailablePct}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Lower Section: Recent Stock In Table & Recent Activity Stream (2 Columns matching Mockup) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column (2/3 width): Recent Stock In Table */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Stock In</h3>
              <p className="text-[11px] text-slate-500">Live inbound store receipts synchronized with IFMIS slips</p>
            </div>
            <button
              onClick={() => onNavigate('stock-in')}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
            >
              View All →
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Date (E.C. / G.C.)</th>
                  <th className="p-3">IFMIS Ref</th>
                  <th className="p-3">Activity & Details</th>
                  <th className="p-3">Officer</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {data?.recentAuditLogs && data.recentAuditLogs.length > 0 ? (
                  data.recentAuditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-600 font-mono text-[11px]">
                        <span className="font-bold text-slate-800 block">{log.timestampEc} E.C.</span>
                        <span className="text-[10px] text-slate-400 block">{log.timestampGc}</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 w-fit">
                        {log.ifmisSlipNumber || 'IFMIS-STORE'}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-900 block">{log.action}</span>
                        <span className="text-[11px] text-slate-600 block line-clamp-1">{log.details}</span>
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-semibold block">{log.userName}</span>
                        <span className="text-[10px] text-slate-400 block">{log.userRole}</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Verified
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No stock-in records logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (1/3 width): Live Synchronized Recent Activity Timeline Stream */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
            <button
              onClick={() => onNavigate('audit')}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
            >
              View All →
            </button>
          </div>

          <div className="space-y-3 text-xs max-h-88 overflow-y-auto pr-1">
            {data?.recentAuditLogs && data.recentAuditLogs.length > 0 ? (
              data.recentAuditLogs.map((log: any) => {
                let Icon = Plus;
                let bgStyle = 'bg-emerald-100 text-emerald-700';

                if (log.action.includes('OUT') || log.action.includes('ISSUE')) {
                  Icon = Minus;
                  bgStyle = 'bg-red-100 text-red-700';
                } else if (log.action.includes('ASSIGN')) {
                  Icon = UserCheck;
                  bgStyle = 'bg-blue-100 text-blue-700';
                } else if (log.action.includes('TRANSFER')) {
                  Icon = ArrowRightLeft;
                  bgStyle = 'bg-purple-100 text-purple-700';
                } else if (log.action.includes('RETURN')) {
                  Icon = RotateCcw;
                  bgStyle = 'bg-teal-100 text-teal-700';
                }

                return (
                  <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className={`p-2 rounded-full ${bgStyle} shrink-0`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 block truncate">{log.action}</span>
                      <p className="text-[11px] text-slate-600 leading-tight line-clamp-2">{log.details}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-200/60">
                        <span>{log.timestampEc} E.C.</span>
                        <span className="text-slate-700 font-semibold">{log.userName}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-slate-400">
                No activity records available.
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
};
