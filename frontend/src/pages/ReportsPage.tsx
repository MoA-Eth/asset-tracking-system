import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Search,
  RefreshCw,
  Download,
  Printer,
  FileDown,
  Calendar,
  Layers,
  PackagePlus,
  CheckCircle2,
  FileCheck2,
  ArrowRightLeft,
  X,
  AlertCircle,
<<<<<<< Updated upstream
  FileSpreadsheet,
=======
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  CalendarRange,
  X,
>>>>>>> Stashed changes
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { api } from '../api/client';
import {
  ItemWithRelations,
  Department,
  Location,
  AssetCategory,
  ItemStatus,
} from '../types/asset-management';
import { formatETB, getTodayGcAndEc } from '../utils/eth-date';
import { useToast } from '../context/ToastContext';

export type ReportType = 'all' | 'registered' | 'available' | 'issued' | 'transferred';
export type TimeframePreset = 'ALL_TIME' | 'TODAY' | 'PAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM';

/* ------------------------------------------------------------------ */
/* Brand palette                                                       */
/* ------------------------------------------------------------------ */
const CHART_COLORS = {
  emerald: '#0A3F24',
  emeraldLight: '#078930',
  yellow: '#FCDD09',
  red: '#DA121A',
  blue: '#1D4ED8',
  amber: '#B45309',
  slate: '#475569',
  purple: '#7E22CE',
  teal: '#0F766E',
};

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

/** Convert any of the possible date representations into a JS Date (or null). */
const parseItemDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  // Try native Date parse first (works for ISO "2024-03-15" / "2024-03-15T10:00:00Z")
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;

  // Fallback: try GC formatted strings like "15/03/2024" or "15-03-2024"
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d2 = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
};

/** Get the "effective" date for an item depending on report type. */
const getItemDate = (item: ItemWithRelations, reportType: ReportType): Date | null => {
  if (reportType === 'stock_out_ledger') {
    return parseItemDate(item.createdAtGc || item.ifmisSlipDateGc);
  }
  // inventory_balance, stock_in_ledger, department_summary → use receipt/IFMIS date
  return parseItemDate(item.ifmisSlipDateGc || item.createdAtGc);
};

/** Format a Date to YYYY-MM-DD (used for <input type="date"> value). */
const toInputDate = (d: Date | null): string => {
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Inclusive start-of-day / end-of-day boundaries. */
const startOfDay = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};
const endOfDay = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
};

/** Reusable mini bar (department table). */
const MiniBar: React.FC<{ value: number; max: number; color?: string }> = ({
  value,
  max,
  color = CHART_COLORS.emerald,
}) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

<<<<<<< Updated upstream
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [reportType, setReportType] = useState<ReportType>('all');
  const [timeframe, setTimeframe] = useState<TimeframePreset>('ALL_TIME');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
=======
  // Existing filters
>>>>>>> Stashed changes
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // --- NEW: Date range filters (ISO YYYY-MM-DD strings from <input type="date">)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const dateInfo = getTodayGcAndEc();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [itemsData, deptsData, locsData] = await Promise.all([
        api.getItems(),
        api.getDepartments(),
        api.getLocations(),
      ]);
      setItems(itemsData);
      setDepartments(deptsData);
      setLocations(locsData);
    } catch (err: any) {
      console.error('Failed to load report data:', err);
      const msg = err.message || 'Failed to load report data.';
      setError(msg);
      toast.error('Reports Sync Error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

<<<<<<< Updated upstream
  // Filter items based on report type, timeframe, category, location, and search
  const filteredItems = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = `${sevenDaysAgoDate.getFullYear()}-${String(sevenDaysAgoDate.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgoDate.getDate()).padStart(2, '0')}`;
    const firstDayOfMonth = `${y}-${m}-01`;

    return items.filter((item) => {
      // 1. Report Type Filter
      if (reportType === 'available') {
        if (item.status !== ItemStatus.AVAILABLE) return false;
      } else if (reportType === 'issued') {
        if (item.status !== ItemStatus.ISSUED) return false;
      } else if (reportType === 'transferred') {
        const hasTransfer =
          item.status === ItemStatus.UNDER_TRANSFER ||
          (item.history || []).some(
            (h) =>
              h.action.toUpperCase().includes('TRANSFER') ||
              h.action.toUpperCase().includes('RETURN')
          );
        if (!hasTransfer) return false;
      }
      // 'registered' & 'all' include all records

      // 2. Timeframe Filter
      const dateStr = item.ifmisSlipDateGc || item.createdAtGc;
      if (dateStr) {
        const itemDateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.slice(0, 10);

        if (timeframe === 'TODAY') {
          if (itemDateOnly !== todayStr) return false;
        } else if (timeframe === 'PAST_7_DAYS') {
          if (itemDateOnly < sevenDaysAgo) return false;
        } else if (timeframe === 'THIS_MONTH') {
          if (itemDateOnly < firstDayOfMonth) return false;
        } else if (timeframe === 'CUSTOM') {
          if (customFrom && itemDateOnly < customFrom) return false;
          if (customTo && itemDateOnly > customTo) return false;
        }
      }

      // 3. Category Filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;

      // 4. Store Location Filter
      if (selectedLocation !== 'ALL' && item.storeLocationId !== selectedLocation) return false;

      // 5. Search Term Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          item.name.toLowerCase().includes(q) ||
          item.itemCode.toLowerCase().includes(q) ||
          item.ifmisSlipNumber.toLowerCase().includes(q) ||
          (item.serialNumber && item.serialNumber.toLowerCase().includes(q)) ||
          (item.currentCustodian?.fullNameEn && item.currentCustodian.fullNameEn.toLowerCase().includes(q)) ||
          (item.assignedDepartment?.nameEn && item.assignedDepartment.nameEn.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
=======
  /* ---------------------------------------------------------------- */
  /* Date range presets                                               */
  /* ---------------------------------------------------------------- */
  const applyPreset = (preset: 'all' | 'thisMonth' | 'last30' | 'thisQuarter' | 'thisYear') => {
    const today = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'thisMonth') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toInputDate(first));
      setEndDate(toInputDate(today));
      return;
    }
    if (preset === 'last30') {
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      setStartDate(toInputDate(from));
      setEndDate(toInputDate(today));
      return;
    }
    if (preset === 'thisQuarter') {
      const q = Math.floor(today.getMonth() / 3);
      const from = new Date(today.getFullYear(), q * 3, 1);
      setStartDate(toInputDate(from));
      setEndDate(toInputDate(today));
      return;
    }
    if (preset === 'thisYear') {
      const from = new Date(today.getFullYear(), 0, 1);
      setStartDate(toInputDate(from));
      setEndDate(toInputDate(today));
      return;
    }
  };

  const clearDateRange = () => {
    setStartDate('');
    setEndDate('');
  };

  const hasDateFilter = !!startDate || !!endDate;

  /* ---------------------------------------------------------------- */
  /* Filtered items (now with date range)                             */
  /* ---------------------------------------------------------------- */
  const filteredItems = useMemo(() => {
    const from = startDate ? startOfDay(new Date(startDate)) : null;
    const to = endDate ? endOfDay(new Date(endDate)) : null;

    return items.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchLoc =
        selectedLocation === 'ALL' || item.storeLocationId === selectedLocation;
      const matchDept =
        selectedDepartment === 'ALL' || item.assignedDepartmentId === selectedDepartment;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.ifmisSlipNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.serialNumber &&
          item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      // ---- Date range check ----
      let matchDate = true;
      if (from || to) {
        const d = getItemDate(item, reportType);
        if (!d) {
          // Items with no parseable date are excluded when a date filter is active
          matchDate = false;
        } else {
          if (from && d < from) matchDate = false;
          if (to && d > to) matchDate = false;
        }
      }

      return matchCat && matchLoc && matchDept && matchSearch && matchDate;
    });
  }, [
    items,
    selectedCategory,
    selectedLocation,
    selectedDepartment,
    searchQuery,
    startDate,
    endDate,
    reportType,
  ]);

  /* ---------------------------------------------------------------- */
  /* Aggregate Metrics                                                */
  /* ---------------------------------------------------------------- */
  const metrics = useMemo(() => {
    let totalETB = 0;
    let inStoreCount = 0;
    let issuedCount = 0;

    filteredItems.forEach((i) => {
      totalETB += i.unitCostETB;
      if (i.status === ItemStatus.AVAILABLE) inStoreCount++;
      if (i.status === ItemStatus.ISSUED) issuedCount++;
>>>>>>> Stashed changes
    });
  }, [items, reportType, timeframe, customFrom, customTo, selectedCategory, selectedLocation, searchTerm]);

  // Aggregate Total Valuation
  const totalValuation = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + item.unitCostETB, 0);
  }, [filteredItems]);

<<<<<<< Updated upstream
  const getTimeframeLabel = () => {
    switch (timeframe) {
      case 'TODAY':
        return 'Today';
      case 'PAST_7_DAYS':
        return 'Past 7 Days';
      case 'THIS_MONTH':
        return 'This Month';
      case 'CUSTOM':
        return customFrom && customTo
          ? `${customFrom} to ${customTo}`
          : customFrom
          ? `Since ${customFrom}`
          : customTo
          ? `Up to ${customTo}`
          : 'Custom Range';
      case 'ALL_TIME':
      default:
        return 'All Time';
    }
  };

  const getReportTypeLabel = () => {
    switch (reportType) {
      case 'registered':
        return 'Registered Assets (Stock-In)';
      case 'available':
        return 'Available Assets (In Store)';
      case 'issued':
        return 'Issued Assets (In Custody)';
      case 'transferred':
        return 'Transferred & Returned Assets';
      case 'all':
      default:
        return 'All Assets';
    }
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredItems.length === 0) {
      toast.warning('No Records', 'There are no asset records matching current filters to export.');
      return;
    }
    try {
      const headers = [
        '#',
        'Tracking Code',
        'Asset Name',
        'Category',
        'Status',
        'IFMIS Slip #',
        'Receipt/Slip Date (E.C.)',
        'Date (G.C.)',
        'Custodian / User',
        'Department / Directorate',
        'Store Location',
        'Serial Number',
        'Unit Cost (ETB)',
      ];

      const rows = filteredItems.map((item, index) => [
        index + 1,
        item.itemCode,
        `"${item.name.replace(/"/g, '""')}"`,
        item.category,
        item.status,
        item.ifmisSlipNumber,
        `"${item.ifmisSlipDateEc || item.createdAtEc}"`,
        `"${item.ifmisSlipDateGc || item.createdAtGc}"`,
        `"${item.currentCustodian?.fullNameEn || 'In Store'}"`,
        `"${item.assignedDepartment?.nameEn || ''}"`,
        `"${item.storeLocation?.siteName || ''}"`,
        `"${item.serialNumber || 'N/A'}"`,
        item.unitCostETB,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MoA_Asset_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        'CSV Export Completed',
        `Successfully generated and downloaded spreadsheet with ${filteredItems.length} asset records.`
      );
    } catch (err: any) {
      toast.error('CSV Export Failed', err.message || 'Failed to generate CSV export.');
    }
  };

  // PDF Export handler
  const handleExportPDF = () => {
    if (filteredItems.length === 0) {
      toast.warning('No Records', 'There are no asset records matching current filters to export.');
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4',
      });

      const pw = doc.internal.pageSize.width;

      // Header Band (#0A3F24 Ethiopian MoA Dark Emerald)
      doc.setFillColor(10, 63, 36);
      doc.rect(0, 0, pw, 44, 'F');

      // Tricolor Ribbon
      doc.setFillColor(7, 137, 48);
      doc.rect(0, 44, pw / 3, 3, 'F');
      doc.setFillColor(252, 221, 9);
      doc.rect(pw / 3, 44, pw / 3, 3, 'F');
      doc.setFillColor(218, 18, 26);
      doc.rect((pw * 2) / 3, 44, pw / 3, 3, 'F');

      // Header Text
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', 24, 18);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('MINISTRY OF AGRICULTURE (MoA) • FIXED ASSET MANAGEMENT SYSTEM', 24, 32);

      doc.setFontSize(8);
      doc.text(`Generated: ${dateInfo.gc} (G.C.) / ${dateInfo.ecFormattedAm}`, pw - 24, 25, { align: 'right' });

      // Report Title & Period Subheader
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(getReportTypeLabel(), 24, 68);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Timeframe: ${getTimeframeLabel()}  |  Category: ${selectedCategory.replace(/_/g, ' ')}  |  Total Assets: ${filteredItems.length}  |  Total Valuation: ${formatETB(totalValuation)}`,
        24,
        82
      );

      const tableHead = [['#', 'Tracking Code', 'Asset Name', 'Category', 'Status', 'IFMIS Slip #', 'Date (E.C.)', 'Custodian / Dept', 'Unit Cost (ETB)']];
      const tableBody = filteredItems.map((item, idx) => [
        idx + 1,
=======
  /* ---------------------------------------------------------------- */
  /* Chart datasets                                                   */
  /* ---------------------------------------------------------------- */
  const categoryChartData = useMemo(() => {
    const map = new Map<string, { count: number; valuation: number }>();
    filteredItems.forEach((i) => {
      const key = i.category.replace(/_/g, ' ');
      const prev = map.get(key) ?? { count: 0, valuation: 0 };
      map.set(key, { count: prev.count + 1, valuation: prev.valuation + i.unitCostETB });
    });
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.valuation - a.valuation);
  }, [filteredItems]);

  const locationChartData = useMemo(() => {
    const map = new Map<string, { count: number; valuation: number }>();
    filteredItems.forEach((i) => {
      const key = i.storeLocation?.siteName || 'HQ Central Store';
      const prev = map.get(key) ?? { count: 0, valuation: 0 };
      map.set(key, { count: prev.count + 1, valuation: prev.valuation + i.unitCostETB });
    });
    return Array.from(map.entries())
      .map(([location, v]) => ({ location, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [filteredItems]);

  const statusChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((i) => {
      const key = i.status.replace(/_/g, ' ');
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    const colorFor = (status: string) => {
      const s = status.toLowerCase();
      if (s.includes('available')) return CHART_COLORS.blue;
      if (s.includes('issued')) return CHART_COLORS.emeraldLight;
      if (s.includes('damaged')) return CHART_COLORS.red;
      if (s.includes('maintenance')) return CHART_COLORS.amber;
      if (s.includes('disposed')) return CHART_COLORS.slate;
      return CHART_COLORS.purple;
    };
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      fill: colorFor(name),
    }));
  }, [filteredItems]);

  const departmentChartData = useMemo(() => {
    return departments
      .map((dept) => {
        const deptItems = filteredItems.filter((i) => i.assignedDepartmentId === dept.id);
        const valuation = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
        return {
          name: dept.code,
          fullName: dept.nameEn,
          items: deptItems.length,
          valuation,
        };
      })
      .sort((a, b) => b.valuation - a.valuation)
      .slice(0, 10);
  }, [departments, filteredItems]);

  const stockInTrendData = useMemo(() => {
    const map = new Map<string, { count: number; valuation: number }>();
    filteredItems.forEach((i) => {
      const d = parseItemDate(i.ifmisSlipDateGc);
      const key = d ? toInputDate(d) : 'Undated';
      const prev = map.get(key) ?? { count: 0, valuation: 0 };
      map.set(key, { count: prev.count + 1, valuation: prev.valuation + i.unitCostETB });
    });
    return Array.from(map.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredItems]);

  const stockHealthData = useMemo(() => {
    const total = filteredItems.length || 1;
    return [
      {
        name: 'Available',
        value: Math.round((metrics.inStoreCount / total) * 100),
        fill: CHART_COLORS.blue,
      },
      {
        name: 'Issued',
        value: Math.round((metrics.issuedCount / total) * 100),
        fill: CHART_COLORS.emeraldLight,
      },
    ];
  }, [filteredItems, metrics]);

  /* ---------------------------------------------------------------- */
  /* Exports                                                          */
  /* ---------------------------------------------------------------- */
  const dateRangeLabel = () => {
    if (!startDate && !endDate) return 'All time';
    const fmt = (s: string) => (s ? new Date(s).toLocaleDateString('en-GB') : '—');
    return `${fmt(startDate)} → ${fmt(endDate)}`;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pw = doc.internal.pageSize.width;

    doc.setFillColor(10, 63, 36);
    doc.rect(0, 0, pw, 46, 'F');

    doc.setFillColor(7, 137, 48);
    doc.rect(0, 46, pw / 3, 3, 'F');
    doc.setFillColor(252, 221, 9);
    doc.rect(pw / 3, 46, pw / 3, 3, 'F');
    doc.setFillColor(218, 18, 26);
    doc.rect((pw * 2) / 3, 46, pw / 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', 24, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('MINISTRY OF AGRICULTURE (MoA) • ASSET MANAGEMENT SYSTEM', 24, 36);

    doc.setFontSize(8.5);
    doc.text(
      `Report Date: ${dateInfo.gc} (G.C.) / ${dateInfo.ecFormattedAm}`,
      pw - 24,
      28,
      { align: 'right' }
    );

    let titleStr = '';
    if (reportType === 'inventory_balance') titleStr = 'Current Store Stock Balance Report';
    else if (reportType === 'stock_in_ledger')
      titleStr = 'Inbound Stock-In Ledger (IFMIS Reconciliation)';
    else if (reportType === 'stock_out_ledger') titleStr = 'Outbound Store Issue Ledger';
    else if (reportType === 'department_summary')
      titleStr = 'Directorate Asset Allocation Summary';

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(titleStr, 24, 72);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Items: ${metrics.totalCount} | Available: ${metrics.inStoreCount} | Issued: ${metrics.issuedCount} | Total Valuation: ${formatETB(metrics.totalETB)}`,
      24,
      86
    );
    doc.text(`Period: ${dateRangeLabel()}`, 24, 98);

    if (reportType === 'department_summary') {
      const tableHead = [
        ['Directorate / Program', 'Code', 'Allocated Items', 'Total Valuation (ETB)'],
      ];
      const tableBody = departments.map((dept) => {
        const deptItems = filteredItems.filter((i) => i.assignedDepartmentId === dept.id);
        const deptTotal = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
        return [dept.nameEn, dept.code, deptItems.length.toString(), formatETB(deptTotal)];
      });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 110,
        theme: 'grid',
        headStyles: { fillColor: [10, 63, 36], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 24, right: 24 },
      });
    } else {
      const tableHead = [
        ['Tracking Code', 'Item Name', 'Category', 'IFMIS Slip', 'Store Location', 'Status', 'Unit Cost (ETB)'],
      ];
      const tableBody = filteredItems.map((item) => [
>>>>>>> Stashed changes
        item.itemCode,
        item.name,
        item.category.replace(/_/g, ' '),
        item.status.replace(/_/g, ' '),
        item.ifmisSlipNumber,
        item.ifmisSlipDateEc || item.createdAtEc,
        item.currentCustodian?.fullNameEn || item.assignedDepartment?.code || item.storeLocation?.siteName || 'In Store',
        formatETB(item.unitCostETB),
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
<<<<<<< Updated upstream
        startY: 92,
=======
        startY: 110,
>>>>>>> Stashed changes
        theme: 'grid',
        headStyles: { fillColor: [10, 63, 36], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 24, right: 24 },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Federal Democratic Republic of Ethiopia • Ministry of Agriculture • Page ${i} of ${pageCount}`,
          pw / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }

      doc.save(`MoA_Asset_Report_${reportType}_${dateInfo.gc.replace(/\s+/g, '_')}.pdf`);

      toast.success(
        'PDF Report Generated',
        `Official statutory summary (${filteredItems.length} records) downloaded.`
      );
    } catch (err: any) {
      toast.error('PDF Export Failed', err.message || 'Failed to render PDF document.');
    }
<<<<<<< Updated upstream
=======

    doc.save(`MoA_${reportType}_${dateInfo.gc.replace(/\s+/g, '_')}.pdf`);
  };

  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    const filename = `MoA_${reportType}_${dateInfo.gc.replace(/\s+/g, '_')}.csv`;

    // Prepend date range as a comment row for audit trail
    csvContent += `"Report Period: ${dateRangeLabel()}"\n`;

    if (reportType === 'inventory_balance') {
      csvContent +=
        'Item Code,Item Name,Category,Serial Number,Store Location,Status,Unit Cost (ETB),IFMIS Slip,Assigned Dept,Current Custodian\n';
      filteredItems.forEach((item) => {
        csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.serialNumber || 'N/A'}","${item.storeLocation?.siteName || ''}","${item.status}",${item.unitCostETB},"${item.ifmisSlipNumber}","${item.assignedDepartment?.code || ''}","${item.currentCustodian?.fullNameEn || 'In Store'}"\n`;
      });
    } else if (reportType === 'stock_in_ledger') {
      csvContent +=
        'Item Code,Item Name,Category,IFMIS Slip,Date Received,Supplier/Source,Store Location,Unit Cost (ETB)\n';
      filteredItems.forEach((item) => {
        csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.ifmisSlipNumber}","${item.ifmisSlipDateGc}","MoA Central Store","${item.storeLocation?.siteName || ''}",${item.unitCostETB}\n`;
      });
    } else if (reportType === 'stock_out_ledger') {
      csvContent +=
        'Item Code,Item Name,Category,Requesting Directorate,Issued To,Issue Date,Purpose,Status\n';
      filteredItems
        .filter((item) => item.status === ItemStatus.ISSUED)
        .forEach((item) => {
          csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.assignedDepartment?.nameEn || ''}","${item.currentCustodian?.fullNameEn || ''}","${item.createdAtGc || item.ifmisSlipDateGc}","Official Operations","${item.status}"\n`;
        });
    } else if (reportType === 'department_summary') {
      csvContent += 'Directorate / Department,Code,Total Items Allocated,Total Valuation (ETB)\n';
      departments.forEach((dept) => {
        const deptItems = filteredItems.filter((i) => i.assignedDepartmentId === dept.id);
        const deptTotal = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
        csvContent += `"${dept.nameEn}","${dept.code}",${deptItems.length},${deptTotal}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
>>>>>>> Stashed changes
  };

  const reportTabs: { id: ReportType; label: string; icon: any }[] = [
    { id: 'all', label: 'All Assets', icon: Layers },
    { id: 'registered', label: 'Registered (Stock-In)', icon: PackagePlus },
    { id: 'available', label: 'Available (In Store)', icon: CheckCircle2 },
    { id: 'issued', label: 'Issued (In Custody)', icon: FileCheck2 },
    { id: 'transferred', label: 'Transferred & Returned', icon: ArrowRightLeft },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
        Loading asset reports...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Failed to Load Reports</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn pb-16">
      {/* 1. Header Bar with Direct Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
<<<<<<< Updated upstream
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
              Operational Reporting
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Ministry of Agriculture
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            Asset Reports (የንብረት ሪፖርት)
=======
          <div className="flex items-center gap-2">
           <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300 transition-colors">
            Reporting & Audits
          </span>
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              Statutory Stock Briefings
            </span>
        </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
            Reports
>>>>>>> Stashed changes
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
<<<<<<< Updated upstream
            className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Export filtered records to official PDF"
=======
             className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
>>>>>>> Stashed changes
          >
            <FileDown className="w-3.5 h-3.5 text-white" />
            <span>Export PDF</span>
          </button>
          <button
<<<<<<< Updated upstream
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Print report"
=======
            onClick={handleExportCSV}
             className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
>>>>>>> Stashed changes
          >
            <Printer className="w-3.5 h-3.5 text-amber-300" />
            <span>Print</span>
          </button>
          <button
<<<<<<< Updated upstream
            onClick={loadData}
            className="p-1.5 rounded-xl bg-white text-slate-700 hover:text-slate-900 border border-slate-200 transition shadow-xs cursor-pointer"
            title="Refresh Data"
=======
            onClick={() => window.print()}
             className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
>>>>>>> Stashed changes
          >
            <RefreshCw className={`w-4 h-4 text-emerald-700 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

<<<<<<< Updated upstream
      {/* 2. Simple, Unified Filter & Search Bar */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Search + Timeframe + Category + Location */}
        <div className="flex flex-col lg:flex-row items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by code, item name, serial #, slip #, or custodian..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white font-mono"
            />
          </div>

          {/* Timeframe Dropdown */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
            <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframePreset)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="ALL_TIME">All Time</option>
              <option value="TODAY">Today</option>
              <option value="PAST_7_DAYS">Past 7 Days</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="CUSTOM">Custom Date Range...</option>
            </select>
          </div>

          {/* Category Dropdown */}
=======
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Total Items Listed</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{metrics.totalCount}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Matching active filters</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Total Valuation (ETB)</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 block">
            {formatETB(metrics.totalETB)}
          </span>
          <p className="text-[10px] text-slate-400 mt-0.5">Acquisition unit cost</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Available in Store</span>
          <span className="text-2xl font-black text-blue-700 mt-1 block">{metrics.inStoreCount}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Ready for issuance</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Issued to Staff</span>
          <span className="text-2xl font-black text-amber-700 mt-1 block">{metrics.issuedCount}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Under department custody</p>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id as ReportType)}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              reportType === tab.id
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============ DATE RANGE FILTER BAR (NEW) ============ */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50/60 to-white border border-emerald-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
            <CalendarRange className="w-4 h-4" />
            <span>Date Range</span>
          </div>

          {/* Start date */}
          <div className="flex items-center gap-1.5">
            <label className="text-slate-600 font-semibold">From:</label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* End date */}
          <div className="flex items-center gap-1.5">
            <label className="text-slate-600 font-semibold">To:</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-slate-500 text-[11px] font-medium mr-1">Quick:</span>
            <button
              onClick={() => applyPreset('thisMonth')}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('last30')}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyPreset('thisQuarter')}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
            >
              This Quarter
            </button>
            <button
              onClick={() => applyPreset('thisYear')}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
            >
              This Year
            </button>
            <button
              onClick={() => applyPreset('all')}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
            >
              All Time
            </button>
          </div>

          {/* Clear */}
          {hasDateFilter && (
            <button
              onClick={clearDateRange}
              className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-[11px] font-bold transition cursor-pointer"
              title="Clear date range"
            >
              <X className="w-3 h-3" />
              Clear Dates
            </button>
          )}
        </div>

        {/* Active range display */}
        <div className="mt-2.5 flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-medium">Active period:</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300 transition-colors">
            {dateRangeLabel()}
          </span>
          <span className="text-slate-400">
            • {filteredItems.length} of {items.length} items in range
          </span>
        </div>
      </div>

      {/* Other filters (category, location, dept, search) */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-emerald-700 shrink-0" />

>>>>>>> Stashed changes
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Categories</option>
            {Object.values(AssetCategory).map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

<<<<<<< Updated upstream
          {/* Store Location Dropdown */}
=======
>>>>>>> Stashed changes
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.siteName}
              </option>
            ))}
          </select>
<<<<<<< Updated upstream
        </div>

        {/* Custom Date Pickers (only when Custom Range is active) */}
        {timeframe === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs animate-fadeIn">
            <span className="font-semibold text-slate-600">Date Range:</span>
            <div className="flex items-center gap-1.5">
              <label className="text-slate-500 font-medium">From:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-slate-500 font-medium">To:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:bg-white"
              />
            </div>
            {(customFrom || customTo) && (
              <button
                onClick={() => {
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 text-xs"
                title="Clear date inputs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Row 2: Report Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {reportTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = reportType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setReportType(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-emerald-800 text-white shadow-xs font-bold'
                    : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-300' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Pure Clean Tabular Form */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Subheader showing active count and valuation */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{getReportTypeLabel()}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">{getTimeframeLabel()}</span>
            <span className="text-slate-400">•</span>
            <span className="font-semibold text-emerald-800">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
=======

          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none"
          >
            <option value="ALL">All Directorates</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.code} - {dept.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, slip, serial..."
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white"
          />
        </div>
      </div>

      {/* ============ ANALYTICS CHARTS ============ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-900">Analytics Overview</h3>
          <span className="text-[10px] text-slate-400 font-mono">
            Live visual insights • {filteredItems.length} items in scope
          </span>
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status Pie */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <PieChartIcon className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">Status Distribution</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">by count</span>
            </div>
            <div className="h-56">
              {statusChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-400">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      fontSize={10}
                    >
                      {statusChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Radial Health */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">Stock Health Ratio</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">% of total</span>
            </div>
            <div className="h-56 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="35%"
                  outerRadius="95%"
                  barSize={18}
                  data={stockHealthData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar background dataKey="value" cornerRadius={8} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                    formatter={(v: any) => [`${v}%`, 'Share']}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-emerald-800">
                  {Math.round(
                    ((metrics.inStoreCount + metrics.issuedCount) /
                      Math.max(1, filteredItems.length)) *
                      100
                  )}
                  %
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                  Accounted
                </span>
              </div>
            </div>
          </div>

          {/* Category Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">Top Categories</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">ETB valuation</span>
            </div>
            <div className="h-56">
              {categoryChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-400">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryChartData.slice(0, 6)}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 9, fill: '#64748b' }}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      tick={{ fontSize: 9, fill: '#334155' }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                      }}
                      formatter={(v: any) => [formatETB(Number(v)), 'Valuation']}
                    />
                    <Bar dataKey="valuation" fill={CHART_COLORS.emerald} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 - context-dependent */}
        {reportType === 'department_summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-emerald-700" />
                  <h4 className="text-xs font-bold text-slate-800">
                    Top 10 Directorates by Items
                  </h4>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">count</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={departmentChartData}
                    margin={{ top: 8, right: 12, left: -8, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: '#334155' }}
                      angle={-35}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                      }}
                      formatter={(v: any) => [`${v} items`, 'Allocated']}
                      labelFormatter={(label, payload) =>
                        payload?.[0]?.payload?.fullName ?? label
                      }
                    />
                    <Bar dataKey="items" fill={CHART_COLORS.emeraldLight} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                  <h4 className="text-xs font-bold text-slate-800">
                    Top 10 Directorates by Valuation
                  </h4>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">ETB</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...departmentChartData].sort((a, b) => b.valuation - a.valuation)}
                    margin={{ top: 8, right: 12, left: -8, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: '#334155' }}
                      angle={-35}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#64748b' }}
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1000
                          ? `${(v / 1000).toFixed(0)}k`
                          : `${v}`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                      }}
                      formatter={(v: any) => [formatETB(Number(v)), 'Valuation']}
                      labelFormatter={(label, payload) =>
                        payload?.[0]?.payload?.fullName ?? label
                      }
                    />
                    <Bar dataKey="valuation" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {reportType === 'stock_in_ledger' && (
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">
                  IFMIS Inbound Delivery Trend
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                items received per slip date
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stockInTrendData}
                  margin={{ top: 8, right: 16, left: -8, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="gradInbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.emeraldLight} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={CHART_COLORS.emeraldLight} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#334155' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_COLORS.emerald}
                    strokeWidth={2}
                    fill="url(#gradInbound)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {reportType === 'stock_out_ledger' && (
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">
                  Issued Items by Directorate
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">count</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={departmentChartData}
                  margin={{ top: 8, right: 12, left: -8, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: '#334155' }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                    formatter={(v: any) => [`${v} items`, 'Issued']}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.fullName ?? label
                    }
                  />
                  <Bar dataKey="items" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {reportType === 'inventory_balance' && (
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-700" />
                <h4 className="text-xs font-bold text-slate-800">
                  Stock Distribution by Store Location
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                items / valuation
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={locationChartData}
                  margin={{ top: 8, right: 12, left: -8, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="location"
                    tick={{ fontSize: 9, fill: '#334155' }}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 9, fill: '#64748b' }}
                    label={{
                      value: 'Items',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 9, fill: '#64748b' },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 9, fill: '#64748b' }}
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : `${v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                    formatter={(v: any, n: any) =>
                      n === 'count' ? [`${v} items`, 'Items'] : [formatETB(v), 'Valuation']
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Items"
                    fill={CHART_COLORS.emerald}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="valuation"
                    name="Valuation (ETB)"
                    fill={CHART_COLORS.yellow}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Printable document card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {reportType === 'inventory_balance' && 'Current Store Stock Balance Report'}
              {reportType === 'stock_in_ledger' &&
                'Inbound Stock-In Ledger (IFMIS Reconciliation)'}
              {reportType === 'stock_out_ledger' && 'Outbound Store Issue Ledger'}
              {reportType === 'department_summary' &&
                'Directorate Asset Allocation Summary'}
            </h3>
            <p className="text-xs text-slate-500">
              Federal Democratic Republic of Ethiopia • Ministry of Agriculture
            </p>
            {hasDateFilter && (
              <p className="text-[11px] text-emerald-800 mt-1 font-semibold">
                <Calendar className="w-3 h-3 inline -mt-0.5 mr-1" />
                Reporting period: {dateRangeLabel()}
              </p>
            )}
>>>>>>> Stashed changes
          </div>
          <div className="font-mono font-bold text-slate-800">
            Total Value: <span className="text-emerald-700">{formatETB(totalValuation)}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Tracking Code</th>
                <th className="py-2.5 px-3">Asset Item</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">IFMIS Slip #</th>
                <th className="py-2.5 px-3">Date (E.C.)</th>
                <th className="py-2.5 px-3">Custodian / Location</th>
                <th className="py-2.5 px-3 text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
<<<<<<< Updated upstream
                  <td colSpan={9} className="py-16 text-center text-slate-400 space-y-1">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700 text-sm">No Assets Found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting the timeframe filter, search keyword, or selecting "All Time".
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isAvailable = item.status === ItemStatus.AVAILABLE;
                  const isIssued = item.status === ItemStatus.ISSUED;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                        {item.itemCode}
                      </td>
=======
                  <th className="py-2.5 px-3">Directorate / Program</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3 text-center">Allocated Items</th>
                  <th className="py-2.5 px-3 text-right">Total Valuation (ETB)</th>
                  <th className="py-2.5 px-3 w-40">Relative Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((dept) => {
                  const deptItems = filteredItems.filter(
                    (i) => i.assignedDepartmentId === dept.id
                  );
                  const deptTotal = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
                  const maxValuation = departmentChartData.reduce(
                    (m, d) => Math.max(m, d.valuation),
                    1
                  );
                  return (
                    <tr key={dept.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {dept.nameEn}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                        {dept.code}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {deptItems.length}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {formatETB(deptTotal)}
                      </td>
                      <td className="py-2.5 px-3">
                        <MiniBar value={deptTotal} max={maxValuation} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Tracking Code</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">IFMIS Slip</th>
                  <th className="py-2.5 px-3">Store Location</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No asset items match the selected report criteria
                      {hasDateFilter ? ' and date range' : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                        {item.itemCode}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {item.category.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-800 font-bold">
                        {item.ifmisSlipNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {item.storeLocation?.siteName || 'HQ Store'}
                      </td>
>>>>>>> Stashed changes
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.serialNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            SN: {item.serialNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.category.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            isAvailable
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isIssued
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
<<<<<<< Updated upstream
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-900 whitespace-nowrap">
                        {item.ifmisSlipNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {item.ifmisSlipDateEc || item.createdAtEc}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {item.currentCustodian ? (
                          <div className="font-semibold text-slate-900">
                            {item.currentCustodian.fullNameEn}
                          </div>
                        ) : item.assignedDepartment ? (
                          <div className="font-semibold text-slate-800">
                            {item.assignedDepartment.nameEn}
                          </div>
                        ) : (
                          <div className="text-slate-500">
                            {item.storeLocation?.siteName || 'Central Store'}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
=======
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
>>>>>>> Stashed changes
                        {formatETB(item.unitCostETB)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {filteredItems.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono">
            <div>
              Showing {filteredItems.length} of {items.length} total records
            </div>
            <div className="font-bold text-slate-800">
              Total: <span className="text-emerald-800">{formatETB(totalValuation)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};