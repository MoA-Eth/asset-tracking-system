import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRealtimeSync } from '../utils/realtime-sync';
import { costOf, valueOf } from '../utils/item-cost';
import {
  Search,
  FileText,
  Eye,
  RefreshCw,
  Download,
  FileDown,
  X,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../api/client';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import { storeLocationLabel } from '../utils/location';
import { table, statusTone } from '../components/ui/theme';
import { Pagination, usePagination } from '../components/ui/Pagination';
import {
  ItemWithRelations,
  Department,
  Location,
  ItemStatus,
} from '../types/asset-management';
import { formatETB, getTodayGcAndEc } from '../utils/eth-date';
import { downloadCsv } from '../utils/csv';
import { useToast } from '../context/ToastContext';
import { SortableHeader, SortDirection } from '../components/ui/SortableHeader';
import { FilterPopover, FilterSection, FilterSelect, FilterPill } from '../components/ui/FilterPopover';
import { RecordDetailModal } from '../components/ui/RecordDetailModal';
import { SlipViewerModal } from '../components/ui/SlipViewerModal';
import { CATEGORY_OPTIONS } from '../components/assets/asset-state';
import { isGeneratedSerialNumber, displaySerialNumber } from '../utils/asset-tag';

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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewerSlipUrl, setViewerSlipUrl] = useState<string | null>(null);

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

  useRealtimeSync(
    useCallback(() => {
      loadData();
    }, [])
  );

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
    if (b.issued > 0 && b.available > 0) return 'Partly issued';
    return item.status === 'PENDING_DISPOSAL' ? 'Disposal pending' : item.status.replace(/_/g, ' ');
  };

  /** The status in plain words, for the table on screen (the exports keep the status as recorded) */
  const STATUS_WORDS: Record<string, string> = {
    AVAILABLE: 'In store', ISSUED: 'Issued', PENDING_STOCK_IN: 'Receipt pending', PENDING_STOCK_OUT: 'Issue pending',
    UNDER_TRANSFER: 'Transfer pending', PENDING_DISPOSAL: 'Disposal pending', DISPOSED: 'Disposed', REJECTED: 'Rejected',
  };
  const statusWords = (item: ItemWithRelations) => {
    const label = statusLabel(item);
    return label === 'Partly issued' ? label : STATUS_WORDS[item.status] ?? label;
  };

  /** Units a row contributes to this report: in store, issued, or all of them */
  const reportUnits = (item: ItemWithRelations) => {
    const b = balanceOf(item);
    return reportType === 'available' ? b.available : reportType === 'issued' ? b.issued : b.total;
  };

  // Reports cover approved assets only: receipts awaiting endorsement or approval, and rejected ones, have no
  // units in store or issued, so they are left out (as on the dashboard)
  const recordedItems = useMemo(
    () => items.filter((item) => balanceOf(item).available + balanceOf(item).issued > 0),
    [items]
  );

  // Filter items based on report type, timeframe, category, location, and search
  const filteredItems = useMemo(() => {
    return recordedItems.filter((item) => {
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
      // 'registered' & 'all' include every approved registration

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
        const historySlips = (item.history || []).map((h) => `${h.ifmisSlipNumber || ''} ${h.notes || ''}`).join(' ');
        const hasModel19 = Boolean(item.ifmisSlipNumber);
        const hasModel22 = item.status === 'ISSUED' || (item.history || []).some((h) => h.action.includes('STOCK_OUT') || h.action.includes('ISSUE'));
        const hasModel21 = (item.history || []).some((h) => h.action.includes('TRANSFER') || h.action.includes('RETURN'));
        const hasModel20 = item.status === 'DISPOSED' || (item.history || []).some((h) => h.action.includes('DISPOSAL'));

        const modelTags = [
          hasModel19 ? 'model 19 model-19 model19 m19 receipt receiving' : '',
          hasModel22 ? 'model 22 model-22 model22 m22 issue siv' : '',
          hasModel21 ? 'model 21 model-21 model21 m21 transfer return' : '',
          hasModel20 ? 'model 20 model-20 model20 m20 disposal model 22/b' : '',
        ].filter(Boolean).join(' ');

        const poVariations = item.poNumber ? [item.poNumber, item.poNumber.replace(/[-_#]/g, ' '), item.poNumber.replace(/[-_#]/g, '')] : [];
        const codeVariations = [
          ...(item.itemCode ? [item.itemCode.replace(/[-_.]/g, ' '), item.itemCode.replace(/[-_.]/g, '')] : []),
          ...(item.ifmisItemCode ? [item.ifmisItemCode, item.ifmisItemCode.replace(/[.]/g, ' ')] : []),
          ...(item.ifmisTagNumber ? [item.ifmisTagNumber.replace(/[-_.]/g, ' '), item.ifmisTagNumber.replace(/[-_.]/g, '')] : []),
        ];

        const targets = [
          item.name,
          item.itemCode,
          item.ifmisItemCode,
          item.ifmisSlipNumber,
          item.ifmisTagNumber,
          item.poNumber,
          ...poVariations,
          ...codeVariations,
          item.serialNumber,
          item.currentCustodian?.fullNameEn,
          item.currentCustodian?.fullNameAm,
          item.heldByOrganization,
          item.assignedDepartment?.nameEn,
          item.programName,
          historySlips,
          modelTags,
        ].filter(Boolean).join(' ').toLowerCase();

        const words = q.split(/\s+/).filter(Boolean);
        const match = targets.includes(q) || (words.length > 1 && words.every((w) => targets.includes(w)));
        if (!match) return false;
      }

      return true;
    });
  }, [
    recordedItems,
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
    return filteredItems.reduce((sum, item) => sum + costOf(item) * reportUnits(item), 0);
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

  const tabCounts = useMemo(() => ({ all: recordedItems.length, registered: recordedItems.length, available: recordedItems.filter((i) => balanceOf(i).available > 0).length, issued: recordedItems.filter((i) => balanceOf(i).issued > 0).length, transferred: recordedItems.filter((i) => i.status === ItemStatus.UNDER_TRANSFER || (splitsByRoot.get(i.id) || []).some((sp) => sp.status === ItemStatus.UNDER_TRANSFER || (sp.history || []).some((h) => /TRANSFER|RETURN/i.test(h.action))) || (i.history || []).some((h) => /TRANSFER|RETURN/i.test(h.action))).length }), [recordedItems, splitsByRoot]);

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
        return 'Registered assets (Receiving)';
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
        item.name,
        item.category,
        statusLabel(item),
        item.ifmisSlipNumber,
        item.ifmisSlipDateEc || item.createdAtEc,
        item.ifmisSlipDateGc || item.createdAtGc,
        item.currentCustodian?.fullNameEn || item.heldByOrganization || 'In Store',
        item.assignedDepartment?.nameEn || '',
        item.storeLocation?.siteName || '',
        displaySerialNumber(item.serialNumber) === '—' ? 'N/A' : item.serialNumber,
        item.uom || 'EA',
        balanceOf(item).total,
        balanceOf(item).issued,
        balanceOf(item).available,
        Math.round(costOf(item) * 100) / 100,
        valueOf(item, reportUnits(item)),
      ]);

      downloadCsv(`MoA_Asset_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);

      toast.success(
        'CSV Export Completed',
        `Successfully generated and downloaded spreadsheet with ${filteredItems.length} asset records.`
      );
    } catch (err: any) {
      toast.error('CSV Export Failed', err.message || 'Failed to generate CSV export.');
    }
  };

  // PDF Export handler
  const handleExportPDF = async () => {
    if (filteredItems.length === 0) {
      toast.warning('No Records', 'There are no asset records matching current filters to export.');
      return;
    }

    try {
      // The PDF library is large, so it is loaded only when someone exports
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
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
      doc.text('MINISTRY OF AGRICULTURE (MoA) • ASSET TRACKING SYSTEM', 24, 32);

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
        item.currentCustodian?.fullNameEn || item.heldByOrganization || item.assignedDepartment?.nameEn || storeLocationLabel(item.storeLocation),
        formatETB(costOf(item)),
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

  const reportTabs: { id: ReportType; label: string; count: number }[] = [
    { id: 'all', label: 'All Assets', count: tabCounts.all },
    { id: 'registered', label: 'Received', count: tabCounts.registered },
    { id: 'available', label: 'In Store', count: tabCounts.available },
    { id: 'issued', label: 'In Custody', count: tabCounts.issued },
    { id: 'transferred', label: 'Transferred & Returned', count: tabCounts.transferred },
  ];

  type ReportSortColumn = 'code' | 'name' | 'category' | 'status' | 'received' | 'issued' | 'available' | 'slip' | 'date' | 'custodian' | 'cost';
  const [sortColumn, setSortColumn] = useState<ReportSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (colKey: string) => {
    const col = colKey as ReportSortColumn;
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'cost' || col === 'received' || col === 'issued' || col === 'available' ? 'desc' : 'asc');
    }
  };

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let diff = 0;
      if (sortColumn === 'code') {
        diff = a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true });
      } else if (sortColumn === 'name') {
        diff = a.name.localeCompare(b.name);
      } else if (sortColumn === 'category') {
        diff = a.category.localeCompare(b.category);
      } else if (sortColumn === 'status') {
        diff = statusLabel(a).localeCompare(statusLabel(b));
      } else if (sortColumn === 'received') {
        diff = balanceOf(a).total - balanceOf(b).total;
      } else if (sortColumn === 'issued') {
        diff = balanceOf(a).issued - balanceOf(b).issued;
      } else if (sortColumn === 'available') {
        diff = balanceOf(a).available - balanceOf(b).available;
      } else if (sortColumn === 'slip') {
        diff = (a.ifmisSlipNumber || '').localeCompare(b.ifmisSlipNumber || '');
      } else if (sortColumn === 'date') {
        const timeA = new Date(a.createdAtGc || 0).getTime();
        const timeB = new Date(b.createdAtGc || 0).getTime();
        diff = timeA - timeB;
      } else if (sortColumn === 'custodian') {
        const custA = a.currentCustodian?.fullNameEn || a.heldByOrganization || a.assignedDepartment?.nameEn || storeLocationLabel(a.storeLocation);
        const custB = b.currentCustodian?.fullNameEn || b.heldByOrganization || b.assignedDepartment?.nameEn || storeLocationLabel(b.storeLocation);
        diff = custA.localeCompare(custB);
      } else if (sortColumn === 'cost') {
        diff = costOf(a) - costOf(b);
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [filteredItems, sortColumn, sortDirection]);

  // Exports still use every filtered row; only the table on screen is paged
  const pager = usePagination(sortedItems, { resetKey: `${searchTerm}|${timeframe}|${reportType}|${selectedCategory}|${selectedLocation}|${sortColumn}|${sortDirection}` });

  // ── Statutory Report Types ──
  const statutoryReports = useMemo(() => [
    {
      id: 'all' as ReportType,
      title: 'All Assets',
      tag: 'General Ledger',
      fullName: 'Asset Register',
      nameAm: 'የንብረት መዝገብ',
      count: tabCounts.all,
    },
    {
      id: 'registered' as ReportType,
      title: 'Received',
      tag: 'Model 19',
      fullName: 'Receipts (Model 19)',
      nameAm: 'ሞዴል 19 ገቢ',
      count: tabCounts.registered,
    },
    {
      id: 'available' as ReportType,
      title: 'In Store',
      tag: 'Stock Balance',
      fullName: 'Store Inventory',
      nameAm: 'ስቶር ክምችት',
      count: tabCounts.available,
    },
    {
      id: 'issued' as ReportType,
      title: 'In Custody',
      tag: 'Model 22',
      fullName: 'Staff Custody (Model 22)',
      nameAm: 'ሞዴል 22 ወጪ',
      count: tabCounts.issued,
    },
    {
      id: 'transferred' as ReportType,
      title: 'Transferred & Returned',
      tag: 'Model 21',
      fullName: 'Transfers (Model 21)',
      nameAm: 'ሞዴል 21 ዝውውር',
      count: tabCounts.transferred,
    },
  ], [tabCounts]);

  const activeReportDef = statutoryReports.find((r) => r.id === reportType) || statutoryReports[0];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (timeframe !== 'ALL_TIME') count++;
    if (selectedCategory !== 'ALL') count++;
    if (selectedLocation !== 'ALL') count++;
    if (reportType !== 'all') count++;
    return count;
  }, [timeframe, selectedCategory, selectedLocation, reportType]);

  const viewChanged = activeFilterCount > 0 || !!searchTerm.trim();

  const handleResetFilters = () => {
    setTimeframe('ALL_TIME');
    setCustomFrom('');
    setCustomTo('');
    setSelectedCategory('ALL');
    setSelectedLocation('ALL');
    setReportType('all');
  };

  const handleClearAll = () => {
    handleResetFilters();
    setSearchTerm('');
  };

  if (loading) {
    return <ReportsSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Failed to Load Reports</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-[3px] transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 animate-fadeIn pb-3">
      {/* ── Official Government Print Header (Visible ONLY on print) ── */}
      <div className="hidden print:block pb-4 mb-4 border-b-2 border-slate-900 text-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-700">Federal Democratic Republic of Ethiopia</p>
            <h1 className="text-lg font-black uppercase text-slate-950">Ministry of Agriculture (MoA)</h1>
            <p className="text-xs font-semibold text-slate-700">Asset & Store Management — Statutory Inventory Report</p>
          </div>
          <div className="text-right text-[11px] font-mono space-y-0.5">
            <p><span className="font-bold">Report Type:</span> {getReportTypeLabel()}</p>
            <p><span className="font-bold">Period:</span> {getTimeframeLabel()}</p>
            <p><span className="font-bold">Date (G.C.):</span> {dateInfo.gc}</p>
            <p><span className="font-bold">Date (E.C.):</span> {dateInfo.ecFormattedAm}</p>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[11px]">
          <div>
            <span><strong>Scope:</strong> {selectedCategory === "ALL" ? "All Categories" : selectedCategory.replace(/_/g, " ")} · </span>
            <span><strong>Location:</strong> {selectedLocation === "ALL" ? "All Stores" : locations.find(l => l.id === selectedLocation)?.siteName || "Store"} · </span>
            <span><strong>Registrations:</strong> {filteredItems.length} · </span>
            <span><strong>Units:</strong> {unitTotals.total} (Store: {unitTotals.available}, Custody: {unitTotals.issued})</span>
          </div>
          <div className="font-mono font-bold">
            Total Valuation: {formatETB(totalValuation)}
          </div>
        </div>
      </div>

      {/* ── Executive Statutory Report Catalog (Top Grid) ── */}
      <div className="no-print space-y-3">
        {/* 5 Statutory Report Selector Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {statutoryReports.map((report) => {
            const isSelected = reportType === report.id;
            return (
              <button
                key={report.id}
                type="button"
                role="button"
                onClick={() => setReportType(report.id)}
                className={`p-3 rounded-md text-left transition cursor-pointer select-none border bg-white ${
                  isSelected
                    ? 'border-slate-300 border-t-2 border-t-slate-900 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 text-slate-600 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] uppercase tracking-wider ${
                      isSelected
                        ? 'bg-slate-100 text-slate-900 font-bold'
                        : 'bg-slate-100/70 text-slate-500 font-medium'
                    }`}
                  >
                    {report.tag}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full tabular-nums font-mono font-bold ${
                      isSelected
                        ? 'bg-slate-100 text-slate-900'
                        : 'bg-slate-100/70 text-slate-500'
                    }`}
                  >
                    {report.count}
                  </span>
                </div>
                <div className={`text-[13px] leading-tight ${isSelected ? 'font-bold text-slate-950' : 'font-semibold text-slate-700'}`}>
                  {report.title}
                </div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {report.nameAm}
                </div>
              </button>
            );
          })}
        </div>

        {/* Dedicated Report Generator Toolbar */}
        <div className="rounded-md p-3 sm:p-3.5 bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
            {/* Active Ledger Identity */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-[3px] uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                {activeReportDef.tag}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-900 truncate">{activeReportDef.fullName}</h2>
                  <span className="text-[11px] text-slate-500 font-medium hidden md:inline truncate">({activeReportDef.nameAm})</span>
                </div>
              </div>
            </div>

            {/* Right: Quick Search + Filter Popover + CSV & PDF Export */}
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto shrink-0 justify-between sm:justify-end">
              {/* Search Box */}
              <div className="relative flex-1 sm:w-60 md:w-64 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search reports"
                  placeholder={`Search in ${activeReportDef.title.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 h-8 bg-white border border-slate-300 hover:border-slate-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 rounded-[4px] text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filter Popover */}
              <FilterPopover
                label="Filter"
                ariaLabel="Filter report records"
                title="Filters"
                resetLabel="Reset all"
                activeCount={activeFilterCount}
                onReset={handleResetFilters}
                onClear={handleClearAll}
                showClear={viewChanged}
                resultCountText={`${sortedItems.length} ${sortedItems.length === 1 ? 'record' : 'records'}`}
              >
                {/* Report Scope */}
                <FilterSection label="Report Scope">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {statutoryReports.map((report) => (
                      <FilterPill
                        key={report.id}
                        label={report.title}
                        active={reportType === report.id}
                        onClick={() => setReportType(report.id)}
                      />
                    ))}
                  </div>
                </FilterSection>

                {/* Timeframe */}
                <FilterSection label="Time Period" htmlFor="report-filter-timeframe">
                  <FilterSelect
                    id="report-filter-timeframe"
                    ariaLabel="Filter by time period"
                    value={timeframe}
                    onChange={(val) => setTimeframe(val as TimeframePreset)}
                    options={[
                      { value: 'ALL_TIME', label: 'All Time' },
                      { value: 'TODAY', label: 'Today' },
                      { value: 'THIS_WEEK', label: 'This Week' },
                      { value: 'PAST_7_DAYS', label: 'Past 7 Days' },
                      { value: 'THIS_MONTH', label: 'This Month' },
                      { value: 'LAST_MONTH', label: 'Last Month' },
                      { value: 'THIS_QUARTER', label: `This Quarter (Q${currentQuarter + 1})` },
                      { value: 'LAST_QUARTER', label: `Last Quarter (Q${lastQuarterIndex + 1})` },
                      { value: 'THIS_YEAR', label: `This Year (${currentYear})` },
                      { value: 'CUSTOM', label: 'Custom Date Range...' },
                    ]}
                  />
                </FilterSection>

                {/* Asset Category */}
                <FilterSection label="Asset Category" htmlFor="report-filter-category">
                  <FilterSelect
                    id="report-filter-category"
                    ariaLabel="Filter by asset category"
                    placeholder="All Categories"
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    options={CATEGORY_OPTIONS}
                  />
                </FilterSection>

                {/* Store & Location */}
                <FilterSection label="Store & Custody Location" htmlFor="report-filter-location">
                  <FilterSelect
                    id="report-filter-location"
                    ariaLabel="Filter by store location"
                    placeholder="All Locations"
                    value={selectedLocation}
                    onChange={setSelectedLocation}
                    options={locations.map((loc) => ({
                      value: loc.id,
                      label: storeLocationLabel(loc),
                    }))}
                  />
                </FilterSection>
              </FilterPopover>

              {/* Direct Statutory Export Actions */}
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  title="Export tabular dataset to CSV spreadsheet"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 h-8 rounded-[4px] border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition cursor-pointer select-none"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  title="Generate official statutory PDF report"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 h-8 rounded-[4px] border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition cursor-pointer select-none"
                >
                  <FileDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Custom Date Pickers (only when Custom Range is active) */}
          {timeframe === 'CUSTOM' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                <span className="font-semibold text-slate-600">Date Range:</span>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  <div className="flex items-center gap-1.5">
                    <label className="text-slate-500 font-medium text-[11px] shrink-0">From:</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-[4px] text-xs font-mono text-slate-800 focus:outline-none focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-slate-500 font-medium text-[11px] shrink-0">To:</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-[4px] text-xs font-mono text-slate-800 focus:outline-none focus:bg-white"
                    />
                  </div>
                </div>
                {(customFrom || customTo) && (
                  <button
                    type="button"
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
                  className="px-2 py-1 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom(startOfLastMonthStr);
                    setCustomTo(endOfLastMonthStr);
                  }}
                  className="px-2 py-1 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom(startOfQuarterStr);
                    setCustomTo(endOfQuarterStr);
                  }}
                  className="px-2 py-1 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                >
                  This Quarter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom(startOfLastQuarterStr);
                    setCustomTo(endOfLastQuarterStr);
                  }}
                  className="px-2 py-1 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                >
                  Last Quarter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom(startOfYearStr);
                    setCustomTo(endOfYearStr);
                  }}
                  className="px-2 py-1 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                >
                  This Year
                </button>
              </div>
            </div>
          )}

          {/* Active Filter Chips */}
          {(timeframe !== 'ALL_TIME' || selectedCategory !== 'ALL' || selectedLocation !== 'ALL') && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] font-semibold text-slate-500">Active filters:</span>
              {timeframe !== 'ALL_TIME' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 text-[11px] font-medium border border-emerald-200">
                  <span>Period: {getTimeframeLabel()}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeframe('ALL_TIME');
                      setCustomFrom('');
                      setCustomTo('');
                    }}
                    title="Reset timeframe"
                    aria-label="Reset timeframe"
                    className="hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {selectedCategory !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 text-[11px] font-medium border border-blue-200">
                  <span>Category: {selectedCategory.replace(/_/g, ' ')}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    title="Reset category filter"
                    aria-label="Reset category filter"
                    className="hover:text-blue-950 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {selectedLocation !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-900 text-[11px] font-medium border border-purple-200">
                  <span>Location: {locations.find((l) => l.id === selectedLocation)?.siteName || 'Store'}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedLocation('ALL')}
                    title="Reset location filter"
                    aria-label="Reset location filter"
                    className="hover:text-purple-950 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Statutory Ledger Data Table Card ── */}
      <div className="rounded-md bg-white border border-slate-200 overflow-hidden shadow-2xs">
        {/* Authoritative Ledger Summary Subheader */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900">{activeReportDef.fullName}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-600 font-medium">{getTimeframeLabel()}</span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-emerald-800">
              {filteredItems.length} {filteredItems.length === 1 ? 'record' : 'records'}
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              ({unitTotals.total} units: {unitTotals.available} in store, {unitTotals.issued} in custody)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {viewChanged && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-semibold text-slate-500 hover:text-rose-700 transition cursor-pointer"
              >
                Clear all
              </button>
            )}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-slate-500 text-[11px]">Total Valuation:</span>
              <span className="font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-2xs font-mono text-xs font-bold">
                {formatETB(totalValuation)}
              </span>
            </div>
          </div>
        </div>
{/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] min-w-[1140px]">
            <thead className={table.headRow}>
              <tr>
                <th className="py-1.5 px-3 w-10 text-center shrink-0 font-normal">#</th>
                <SortableHeader
                  label="Code"
                  columnKey="code"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 w-32 shrink-0 whitespace-nowrap"
                />
                <SortableHeader
                  label="Asset"
                  columnKey="name"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 min-w-[180px] max-w-[260px]"
                />
                <SortableHeader
                  label="Category"
                  columnKey="category"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 w-28 shrink-0 whitespace-nowrap"
                />
                <SortableHeader
                  label="Status"
                  columnKey="status"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 w-28 shrink-0 whitespace-nowrap"
                />
                <SortableHeader
                  label="Received"
                  columnKey="received"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  title="Sort by All units received"
                  thClassName="py-1.5 px-3 w-16 shrink-0 text-right whitespace-nowrap"
                />
                <SortableHeader
                  label="Issued"
                  columnKey="issued"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  title="Sort by Units with custodians"
                  thClassName="py-1.5 px-3 w-16 shrink-0 text-right whitespace-nowrap"
                />
                <SortableHeader
                  label="In store"
                  columnKey="available"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  title="Sort by Units in store"
                  thClassName="py-1.5 px-3 w-16 shrink-0 text-right whitespace-nowrap"
                />
                <SortableHeader
                  label="IFMIS slip"
                  columnKey="slip"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 w-32 shrink-0 whitespace-nowrap"
                />
                <SortableHeader
                  label="Date (E.C.)"
                  columnKey="date"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 w-28 shrink-0 whitespace-nowrap"
                />
                <SortableHeader
                  label="Custodian / location"
                  columnKey="custodian"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  thClassName="py-1.5 px-3 min-w-[150px] max-w-[220px]"
                />
                <SortableHeader
                  label="Unit cost & value"
                  columnKey="cost"
                  currentSortColumn={sortColumn}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  thClassName="py-1.5 px-3 w-28 shrink-0 text-right whitespace-nowrap"
                />
                <th className="py-1.5 px-2 w-12 text-center shrink-0 font-normal no-print">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
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
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      title="Click to view complete asset details and voucher history"
                      className="hover:bg-slate-50/80 transition cursor-pointer select-none group"
                    >
                      <td className="py-2 px-3 text-center text-slate-400 tabular-nums text-xs w-10 shrink-0">
                        {pager.from + idx}
                      </td>
                      <td className="py-2 px-3 tabular-nums text-slate-700 whitespace-nowrap w-32 shrink-0">
                        {item.itemCode}
                      </td>
                      <td className="py-2 px-3 min-w-[180px] max-w-[260px]">
                        <div className="text-slate-900 truncate" title={item.name}>
                          {item.name}
                        </div>
                        {item.serialNumber && !isGeneratedSerialNumber(item.serialNumber) && (
                          <div
                            className="text-xs text-slate-500 truncate"
                            title={`SN: ${item.serialNumber}`}
                          >
                            SN: {item.serialNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap w-28 shrink-0">
                        {item.itemCategoryDisplay || CATEGORY_OPTIONS.find((o) => o.value === item.category)?.label || item.category}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap w-28 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                            isPartly
                              ? statusTone.partly
                              : isAvailable
                              ? statusTone.inStore
                              : isIssued
                              ? statusTone.issued
                              : statusTone.pending
                          }`}
                        >
                          {statusWords(item)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-900 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).total} <span className="text-slate-500">{(item.uom || 'EA').toLowerCase()}</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).issued}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-800 whitespace-nowrap w-16 shrink-0">
                        {balanceOf(item).available}
                      </td>
                      <td className="py-2 px-3 tabular-nums text-slate-700 whitespace-nowrap w-32 shrink-0">
                        {item.ifmisSlipAttachmentUrl ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewerSlipUrl(item.ifmisSlipAttachmentUrl!);
                            }}
                            title={`Preview or download attached voucher for slip ${item.ifmisSlipNumber}`}
                            className="inline-flex items-center gap-1 font-mono text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>{item.ifmisSlipNumber}</span>
                          </button>
                        ) : (
                          <span className="font-mono">{item.ifmisSlipNumber}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 tabular-nums text-slate-600 whitespace-nowrap w-28 shrink-0">
                        {item.ifmisSlipDateEc || item.createdAtEc}
                      </td>
                      <td className="py-2 px-3 text-slate-700 min-w-[150px] max-w-[220px]">
                        {item.currentCustodian ? (
                          <div
                            className="text-slate-900 truncate"
                            title={item.currentCustodian.fullNameEn}
                          >
                            {item.currentCustodian.fullNameEn}
                          </div>
                        ) : item.heldByOrganization ? (
                          <div className="text-slate-900 truncate" title={item.heldByOrganization}>
                            {item.heldByOrganization}
                          </div>
                        ) : (splitsByRoot.get(item.id) ?? []).some((s) => s.currentCustodian) ? (
                          <div
                            className="text-slate-900 truncate"
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
                            className="text-slate-800 truncate"
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
                      <td className="py-2 px-3 text-right tabular-nums text-slate-900 whitespace-nowrap w-32 shrink-0">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {formatETB(valueOf(item, reportUnits(item)))}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatETB(costOf(item))} <span className="text-slate-400">/ {item.uom || "EA"}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap w-12 shrink-0 no-print">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItemId(item.id);
                          }}
                          title="View complete record and vouchers"
                          className="p-1 rounded hover:bg-slate-200/80 text-slate-400 hover:text-slate-800 transition cursor-pointer"
                          aria-label={`View details for ${item.itemCode}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Summary Bar - Placed above pagination to close the table neatly */}
        {filteredItems.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono">
            <div>
              Showing {filteredItems.length} of {recordedItems.length} registrations · Units: {unitTotals.total} received, {unitTotals.issued} issued, {unitTotals.available} in store
            </div>
            <div className="font-bold text-slate-800">
              Total Valuation: <span className="text-emerald-800 font-mono">{formatETB(totalValuation)}</span>
            </div>
          </div>
        )}

        <Pagination pager={pager} label="assets" />

      </div>

      {/* ── Official MoA Statutory Signature & Verification Block (Visible ONLY on print) ── */}
      <div className="hidden print:block pt-8 mt-6 border-t border-slate-300 text-xs">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div className="space-y-12">
            <p className="font-bold text-slate-800">Prepared By (Property Admin Officer)</p>
            <div className="border-t border-slate-400 pt-1">
              <p className="text-slate-600">Name & Signature</p>
              <p className="text-[10px] text-slate-500">Date: ____________________</p>
            </div>
          </div>
          <div className="space-y-12">
            <p className="font-bold text-slate-800">Verified By (Store Controller)</p>
            <div className="border-t border-slate-400 pt-1">
              <p className="text-slate-600">Name & Signature</p>
              <p className="text-[10px] text-slate-500">Date: ____________________</p>
            </div>
          </div>
          <div className="space-y-12">
            <p className="font-bold text-slate-800">Approved By (Director, Property Admin)</p>
            <div className="border-t border-slate-400 pt-1">
              <p className="text-slate-600">Name & Signature / Stamp</p>
              <p className="text-[10px] text-slate-500">Date: ____________________</p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-[10px] text-center text-slate-500 italic">
          Official statutory asset register report generated from the Ministry of Agriculture Asset Tracking System.
        </p>
      </div>


      {/* ── Asset Detail Modal (Full specs, approval timeline, custody and vouchers) ── */}
      {selectedItemId && (
        <RecordDetailModal
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
        />
      )}

      {/* ── Slip Document Viewer Modal (Preview and direct download of PDF/image) ── */}
      {viewerSlipUrl && (
        <SlipViewerModal
          url={viewerSlipUrl}
          onClose={() => setViewerSlipUrl(null)}
        />
      )}
    </div>
  );
};
