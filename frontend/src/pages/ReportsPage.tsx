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
  FileSpreadsheet,
  FileSearch,
} from 'lucide-react';
import { api } from '../api/client';
import { storeLocationLabel } from '../utils/location';
import { table, statusTone, btn } from '../components/ui/theme';
import { RecordDetailModal } from '../components/ui/RecordDetailModal';
import { Pagination, usePagination } from '../components/ui/Pagination';
import {
  ItemWithRelations,
  Department,
  Location,
  AssetCategory,
  ItemStatus,
} from '../types/asset-management';
import { formatETB, getTodayGcAndEc } from '../utils/eth-date';
import { useToast } from '../context/ToastContext';
import { RefreshButton } from '../components/ui/RefreshButton';
import { ReportCharts } from '../components/reports/ReportCharts';

export type ReportType = 'all' | 'registered' | 'available' | 'issued' | 'transferred';
export type TimeframePreset =
  | 'ALL_TIME'
  | 'TODAY'
  | 'THIS_WEEK'
  | 'PAST_7_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'LAST_QUARTER'
  | 'THIS_YEAR'
  | 'CUSTOM';

const formatDateOnly = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const ReportsPage: React.FC = () => {
  const toast = useToast();
  // One row per registration; records split off it by partial Stock-Outs are kept separately
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [splitRecords, setSplitRecords] = useState<ItemWithRelations[]>([]);
  // Read-only view of one item
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [reportType, setReportType] = useState<ReportType>('all');
  const [timeframe, setTimeframe] = useState<TimeframePreset>('ALL_TIME');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  const dateInfo = getTodayGcAndEc();

  // Helper date calculations for presets
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const todayStr = formatDateOnly(now);

  const startOfWeekDate = new Date(now);
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  startOfWeekDate.setDate(now.getDate() - dayOfWeek);
  const startOfWeekStr = formatDateOnly(startOfWeekDate);

  const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = formatDateOnly(sevenDaysAgoDate);

  const startOfMonthStr = formatDateOnly(new Date(currentYear, currentMonth, 1));
  const endOfMonthStr = formatDateOnly(new Date(currentYear, currentMonth + 1, 0));

  const startOfLastMonthStr = formatDateOnly(new Date(currentYear, currentMonth - 1, 1));
  const endOfLastMonthStr = formatDateOnly(new Date(currentYear, currentMonth, 0));

  const currentQuarter = Math.floor(currentMonth / 3);
  const startOfQuarterStr = formatDateOnly(new Date(currentYear, currentQuarter * 3, 1));
  const endOfQuarterStr = formatDateOnly(new Date(currentYear, (currentQuarter + 1) * 3, 0));

  const lastQuarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
  const lastQuarterIndex = currentQuarter === 0 ? 3 : currentQuarter - 1;
  const startOfLastQuarterStr = formatDateOnly(new Date(lastQuarterYear, lastQuarterIndex * 3, 1));
  const endOfLastQuarterStr = formatDateOnly(new Date(lastQuarterYear, (lastQuarterIndex + 1) * 3, 0));

  const startOfYearStr = formatDateOnly(new Date(currentYear, 0, 1));
  const endOfYearStr = formatDateOnly(new Date(currentYear, 11, 31));

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [itemsData, deptsData, locsData] = await Promise.all([
        api.getItems(),
        api.getDepartments(),
        api.getLocations(),
      ]);
      setItems(itemsData.filter((i) => !i.parentItemId));
      setSplitRecords(itemsData.filter((i) => i.parentItemId));
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

  const splitsByRoot = useMemo(() => {
    const map = new Map<string, ItemWithRelations[]>();
    for (const split of splitRecords) {
      map.set(split.parentItemId!, [...(map.get(split.parentItemId!) ?? []), split]);
    }
    return map;
  }, [splitRecords]);

  const balanceOf = (item: ItemWithRelations) =>
    item.balance ?? { total: Number(item.quantity) || 1, issued: 0, available: 0, pending: 0 };

/** Status wording for a registration; "Partly issued" when units are both out and in store */
  const statusLabel = (item: ItemWithRelations) => {
    const b = balanceOf(item);
    return b.issued > 0 && b.available > 0 ? 'Partly issued' : item.status.replace(/_/g, ' ');
  };

  /** Units a row contributes to this report: in store, issued, or all of them */
  const reportUnits = (item: ItemWithRelations) => {
    const b = balanceOf(item);
    return reportType === 'available' ? b.available : reportType === 'issued' ? b.issued : b.total;
  };

  // Filter items based on report type, timeframe, category, location, and search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Report Type Filter
      // Rows are registrations, so filter on where their units are, not on one record's status
      if (reportType === 'available') {
        if (balanceOf(item).available === 0) return false;
      } else if (reportType === 'issued') {
        if (balanceOf(item).issued === 0) return false;
      } else if (reportType === 'transferred') {
        const hasTransfer =
          item.status === ItemStatus.UNDER_TRANSFER ||
          (splitsByRoot.get(item.id) ?? []).some(
            (split) =>
              split.status === ItemStatus.UNDER_TRANSFER ||
              (split.history || []).some((h) => /TRANSFER|RETURN/i.test(h.action))
          ) ||
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
        } else if (timeframe === 'THIS_WEEK') {
          if (itemDateOnly < startOfWeekStr || itemDateOnly > todayStr) return false;
        } else if (timeframe === 'PAST_7_DAYS') {
          if (itemDateOnly < sevenDaysAgoStr || itemDateOnly > todayStr) return false;
        } else if (timeframe === 'THIS_MONTH') {
          if (itemDateOnly < startOfMonthStr || itemDateOnly > endOfMonthStr) return false;
        } else if (timeframe === 'LAST_MONTH') {
          if (itemDateOnly < startOfLastMonthStr || itemDateOnly > endOfLastMonthStr) return false;
        } else if (timeframe === 'THIS_QUARTER') {
          if (itemDateOnly < startOfQuarterStr || itemDateOnly > endOfQuarterStr) return false;
        } else if (timeframe === 'LAST_QUARTER') {
          if (itemDateOnly < startOfLastQuarterStr || itemDateOnly > endOfLastQuarterStr) return false;
        } else if (timeframe === 'THIS_YEAR') {
          if (itemDateOnly < startOfYearStr || itemDateOnly > endOfYearStr) return false;
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
        const q = searchTerm.trim().toLowerCase();
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
    });
  }, [
    items,
    splitsByRoot,
    reportType,
    timeframe,
    customFrom,
    customTo,
    selectedCategory,
    selectedLocation,
    searchTerm,
    todayStr,
    startOfWeekStr,
    sevenDaysAgoStr,
    startOfMonthStr,
    endOfMonthStr,
    startOfLastMonthStr,
    endOfLastMonthStr,
    startOfQuarterStr,
    endOfQuarterStr,
    startOfLastQuarterStr,
    endOfLastQuarterStr,
    startOfYearStr,
    endOfYearStr,
  ]);

  // Aggregate Total Valuation
  const totalValuation = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + item.unitCostETB * reportUnits(item), 0);
  }, [filteredItems, reportType]);

  const unitTotals = useMemo(
    () =>
      filteredItems.reduce(
        (acc, item) => {
          const b = balanceOf(item);
          return { total: acc.total + b.total, issued: acc.issued + b.issued, available: acc.available + b.available };
        },
        { total: 0, issued: 0, available: 0 }
      ),
    [filteredItems]
  );

  const getTimeframeLabel = () => {
    switch (timeframe) {
      case 'TODAY':
        return 'Today';
      case 'THIS_WEEK':
        return 'This Week';
      case 'PAST_7_DAYS':
        return 'Past 7 Days';
      case 'THIS_MONTH':
        return 'This Month';
      case 'LAST_MONTH':
        return 'Last Month';
      case 'THIS_QUARTER':
        return `This Quarter (Q${currentQuarter + 1})`;
      case 'LAST_QUARTER':
        return `Last Quarter (Q${lastQuarterIndex + 1})`;
      case 'THIS_YEAR':
        return `This Year (${currentYear})`;
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
        'UoM',
        'Received Qty',
        'Issued Qty',
        'In Store Qty',
        'Unit Cost (ETB)',
        'Value (ETB)',
      ];

      const rows = filteredItems.map((item, index) => [
        index + 1,
        item.itemCode,
        `"${item.name.replace(/"/g, '""')}"`,
        item.category,
        statusLabel(item),
        item.ifmisSlipNumber,
        `"${item.ifmisSlipDateEc || item.createdAtEc}"`,
        `"${item.ifmisSlipDateGc || item.createdAtGc}"`,
        `"${item.currentCustodian?.fullNameEn || 'In Store'}"`,
        `"${item.assignedDepartment?.nameEn || ''}"`,
        `"${item.storeLocation?.siteName || ''}"`,
        `"${item.serialNumber || 'N/A'}"`,
        item.uom || 'EA',
        balanceOf(item).total,
        balanceOf(item).issued,
        balanceOf(item).available,
        item.unitCostETB,
        item.unitCostETB * reportUnits(item),
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
      doc.text('MINISTRY OF AGRICULTURE (MoA) • FIXED ASSET TRACKING SYSTEM', 24, 32);

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
        `Timeframe: ${getTimeframeLabel()}  |  Category: ${selectedCategory.replace(/_/g, ' ')}  |  Registrations: ${filteredItems.length}  |  Units: ${unitTotals.total} received, ${unitTotals.issued} issued, ${unitTotals.available} in store  |  Total Valuation: ${formatETB(totalValuation)}`,
        24,
        82
      );

      const tableHead = [['#', 'Tracking Code', 'Asset Name', 'Category', 'Status', 'Received', 'Issued', 'In Store', 'IFMIS Slip #', 'Date (E.C.)', 'Custodian / Dept', 'Unit Cost (ETB)']];
      const tableBody = filteredItems.map((item, idx) => [
        idx + 1,
        item.itemCode,
        item.name,
        item.category.replace(/_/g, ' '),
        statusLabel(item),
        balanceOf(item).total,
        balanceOf(item).issued,
        balanceOf(item).available,
        item.ifmisSlipNumber,
        item.ifmisSlipDateEc || item.createdAtEc,
        item.currentCustodian?.fullNameEn || item.assignedDepartment?.nameEn || storeLocationLabel(item.storeLocation),
        formatETB(item.unitCostETB),
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 92,
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
  };

  const reportTabs: { id: ReportType; label: string; icon: any }[] = [
    { id: 'all', label: 'All Assets', icon: Layers },
    { id: 'registered', label: 'Registered (Stock-In)', icon: PackagePlus },
    { id: 'available', label: 'Available (In Store)', icon: CheckCircle2 },
    { id: 'issued', label: 'Issued (In Custody)', icon: FileCheck2 },
    { id: 'transferred', label: 'Transferred & Returned', icon: ArrowRightLeft },
  ];

  // Exports still use every filtered row; only the table on screen is paged
  const pager = usePagination(filteredItems, { resetKey: `${searchTerm}|${timeframe}` });

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
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            Asset Reports (የንብረት ሪፖርት)
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Export filtered records to official PDF"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-500" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Print report"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print</span>
          </button>
          <RefreshButton onClick={loadData} loading={loading} label="report" />
        </div>
      </div>

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
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="ALL_TIME">All Time</option>
              <option value="TODAY">Today</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="PAST_7_DAYS">Past 7 Days</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_MONTH">Last Month</option>
              <option value="THIS_QUARTER">This Quarter (Q{currentQuarter + 1})</option>
              <option value="LAST_QUARTER">Last Quarter (Q{lastQuarterIndex + 1})</option>
              <option value="THIS_YEAR">This Year ({currentYear})</option>
              <option value="CUSTOM">Custom Date Range...</option>
            </select>
          </div>

          {/* Category Dropdown */}
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

          {/* Store Location Dropdown */}
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
        </div>

        {/* Custom Date Pickers (only when Custom Range is active) */}
        {timeframe === 'CUSTOM' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs animate-fadeIn">
            <div className="flex flex-wrap items-center gap-2.5">
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
                  className="text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
                  title="Clear date inputs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Preset Buttons inside Custom Range */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium mr-0.5">Quick Fill:</span>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(startOfMonthStr);
                  setCustomTo(endOfMonthStr);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(startOfLastMonthStr);
                  setCustomTo(endOfLastMonthStr);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(startOfQuarterStr);
                  setCustomTo(endOfQuarterStr);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
              >
                This Quarter
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(startOfLastQuarterStr);
                  setCustomTo(endOfLastQuarterStr);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
              >
                Last Quarter
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(startOfYearStr);
                  setCustomTo(endOfYearStr);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
              >
                This Year
              </button>
            </div>
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

      {/* 3. Charts of the same filtered rows */}
      <ReportCharts items={filteredItems} splitsByRoot={splitsByRoot} departments={departments} unitsOf={reportUnits} />

      {/* 4. The rows themselves */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Subheader showing active count and valuation */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{getReportTypeLabel()}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">{getTimeframeLabel()}</span>
            <span className="text-slate-400">•</span>
            <span className="font-semibold text-emerald-800">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline-flex items-center gap-1 font-mono">
              ↔ Scrollable table
            </span>
            <div className="font-mono font-bold text-slate-800">
              Total Value: <span className="text-emerald-700">{formatETB(totalValuation)}</span>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1140px]">
            <thead className={table.headRow}>
              <tr>
                <th className="py-2.5 px-3 w-10 text-center shrink-0">#</th>
                <th className="py-2.5 px-3 w-32 shrink-0 whitespace-nowrap">Tracking Code</th>
                <th className="py-2.5 px-3 min-w-[180px] max-w-[260px]">Asset Item</th>
                <th className="py-2.5 px-3 w-28 shrink-0 whitespace-nowrap">Category</th>
                <th className="py-2.5 px-3 w-28 shrink-0 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 w-16 shrink-0 text-right whitespace-nowrap" title="All units received">Received</th>
                <th className="py-2.5 px-3 w-16 shrink-0 text-right whitespace-nowrap" title="Units with custodians">Issued</th>
                <th className="py-2.5 px-3 w-16 shrink-0 text-right whitespace-nowrap" title="Units in store">In Store</th>
                <th className="py-2.5 px-3 w-32 shrink-0 whitespace-nowrap">IFMIS Slip #</th>
                <th className="py-2.5 px-3 w-28 shrink-0 whitespace-nowrap">Date (E.C.)</th>
                <th className="py-2.5 px-3 min-w-[150px] max-w-[220px]">Custodian / Location</th>
                <th className="py-2.5 px-3 w-28 shrink-0 text-right whitespace-nowrap">Unit Cost</th>
                <th className="py-2.5 px-3 w-20 shrink-0 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400 space-y-1">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700 text-sm">No Assets Found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting the timeframe filter, search keyword, or selecting "All Time".
                    </p>
                  </td>
                </tr>
              ) : (
                pager.pageItems.map((item, idx) => {
                  const isPartly = statusLabel(item) === 'Partly issued';
                  const isAvailable = !isPartly && item.status === ItemStatus.AVAILABLE;
                  const isIssued = item.status === ItemStatus.ISSUED;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px] w-10 shrink-0">
                        {pager.from + idx}
                      </td>
                      <td className={`py-2.5 px-3 ${table.code} whitespace-nowrap w-32 shrink-0`}>
                        {item.itemCode}
                      </td>
                      <td className="py-2.5 px-3 min-w-[180px] max-w-[260px]">
                        <div className="font-semibold text-slate-900 truncate" title={item.name}>
                          {item.name}
                        </div>
                        {item.serialNumber && (
                          <div
                            className="text-[10px] text-slate-400 font-mono truncate"
                            title={`SN: ${item.serialNumber}`}
                          >
                            SN: {item.serialNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap w-28 shrink-0">
                        {item.category.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap w-28 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            isPartly
                              ? statusTone.partly
                              : isAvailable
                              ? statusTone.inStore
                              : isIssued
                              ? statusTone.issued
                              : statusTone.pending
                          }`}
                        >
                          {statusLabel(item)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).total} <span className="text-[10px] font-normal text-slate-400">{item.uom || 'EA'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).issued}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-800 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).available}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-900 whitespace-nowrap w-32 shrink-0">
                        {item.ifmisSlipNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap w-28 shrink-0">
                        {item.ifmisSlipDateEc || item.createdAtEc}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 min-w-[150px] max-w-[220px]">
                        {item.currentCustodian ? (
                          <div
                            className="font-semibold text-slate-900 truncate"
                            title={item.currentCustodian.fullNameEn}
                          >
                            {item.currentCustodian.fullNameEn}
                          </div>
                        ) : (splitsByRoot.get(item.id) ?? []).some((s) => s.currentCustodian) ? (
                          <div
                            className="font-semibold text-slate-900 truncate"
                            title={(splitsByRoot.get(item.id) ?? [])
                              .filter((s) => s.currentCustodian)
                              .map((s) => `${s.currentCustodian!.fullNameEn} (${s.quantity || 1} ${s.uom || 'EA'})`)
                              .join(', ')}
                          >
                            {(() => {
                              const holders = (splitsByRoot.get(item.id) ?? []).filter((s) => s.currentCustodian);
                              return holders.length === 1
                                ? holders[0].currentCustodian!.fullNameEn
                                : `${holders.length} custodians`;
                            })()}
                          </div>
                        ) : item.assignedDepartment ? (
                          <div
                            className="font-semibold text-slate-800 truncate"
                            title={item.assignedDepartment.nameEn}
                          >
                            {item.assignedDepartment.nameEn}
                          </div>
                        ) : (
                          <div className="text-slate-500 truncate">
                            {storeLocationLabel(item.storeLocation)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap w-28 shrink-0">
                        {formatETB(item.unitCostETB)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap w-20 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewingItemId(item.id)}
                          className={btn.row}
                          title="View the full record"
                        >
                          <FileSearch className={btn.rowIcon} />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} label="assets" />

        {/* Table Footer */}
        {filteredItems.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono">
            <div>
              Showing {filteredItems.length} of {items.length} registrations · Units: {unitTotals.total} received, {unitTotals.issued} issued, {unitTotals.available} in store
            </div>
            <div className="font-bold text-slate-800">
              Total: <span className="text-emerald-800">{formatETB(totalValuation)}</span>
            </div>
          </div>
        )}
      </div>

      {viewingItemId && <RecordDetailModal itemId={viewingItemId} onClose={() => setViewingItemId(null)} />}
    </div>
  );
};
