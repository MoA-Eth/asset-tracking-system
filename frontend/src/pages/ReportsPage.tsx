import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileSpreadsheet,
  FileDown,
  Printer,
  Download,
  Filter,
  RefreshCw,
  Search,
  Package,
  Layers,
  Building,
  TrendingDown,
  TrendingUp,
  FileCheck2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import {
  ItemWithRelations,
  Department,
  Location,
  Employee,
  AssetCategory,
  ItemStatus,
} from '../types/asset-management';
import { formatETB, getTodayGcAndEc } from '../utils/eth-date';

type ReportType =
  | 'inventory_balance'
  | 'stock_in_ledger'
  | 'stock_out_ledger'
  | 'department_summary';

export const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('inventory_balance');
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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
      setError(err.message || 'Failed to load report data and ledgers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchLoc = selectedLocation === 'ALL' || item.storeLocationId === selectedLocation;
      const matchDept = selectedDepartment === 'ALL' || item.assignedDepartmentId === selectedDepartment;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.ifmisSlipNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCat && matchLoc && matchDept && matchSearch;
    });
  }, [items, selectedCategory, selectedLocation, selectedDepartment, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalETB = 0;
    let inStoreCount = 0;
    let issuedCount = 0;

    filteredItems.forEach((i) => {
      totalETB += i.unitCostETB;
      if (i.status === ItemStatus.AVAILABLE) inStoreCount++;
      if (i.status === ItemStatus.ISSUED) issuedCount++;
    });

    return {
      totalCount: filteredItems.length,
      totalETB,
      inStoreCount,
      issuedCount,
    };
  }, [filteredItems]);

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const pw = doc.internal.pageSize.width;

    // Header Band (#0A3F24 Ethiopian MoA Dark Emerald)
    doc.setFillColor(10, 63, 36);
    doc.rect(0, 0, pw, 46, 'F');

    // Tricolor Ribbon
    doc.setFillColor(7, 137, 48);
    doc.rect(0, 46, pw / 3, 3, 'F');
    doc.setFillColor(252, 221, 9);
    doc.rect(pw / 3, 46, pw / 3, 3, 'F');
    doc.setFillColor(218, 18, 26);
    doc.rect((pw * 2) / 3, 46, pw / 3, 3, 'F');

    // Title Texts in Banner
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', 24, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('MINISTRY OF AGRICULTURE (MoA) • ASSET MANAGEMENT SYSTEM', 24, 36);

    doc.setFontSize(8.5);
    doc.text(`Report Date: ${dateInfo.gc} (G.C.) / ${dateInfo.ecFormattedAm}`, pw - 24, 28, { align: 'right' });

    let titleStr = '';
    if (reportType === 'inventory_balance') titleStr = 'Current Store Stock Balance Report';
    else if (reportType === 'stock_in_ledger') titleStr = 'Inbound Stock-In Ledger (IFMIS Reconciliation)';
    else if (reportType === 'stock_out_ledger') titleStr = 'Outbound Store Issue Ledger';
    else if (reportType === 'department_summary') titleStr = 'Directorate Asset Allocation Summary';

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

    if (reportType === 'department_summary') {
      const tableHead = [['Directorate / Program', 'Code', 'Allocated Items', 'Total Valuation (ETB)']];
      const tableBody = departments.map((dept) => {
        const deptItems = items.filter((i) => i.assignedDepartmentId === dept.id);
        const deptTotal = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
        return [dept.nameEn, dept.code, deptItems.length.toString(), formatETB(deptTotal)];
      });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 98,
        theme: 'grid',
        headStyles: { fillColor: [10, 63, 36], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 24, right: 24 },
      });
    } else {
      const tableHead = [['Tracking Code', 'Item Name', 'Category', 'IFMIS Slip', 'Store Location', 'Status', 'Unit Cost (ETB)']];
      const tableBody = filteredItems.map((item) => [
        item.itemCode,
        item.name,
        item.category.replace(/_/g, ' '),
        item.ifmisSlipNumber,
        item.storeLocation?.siteName || 'HQ Store',
        item.status.replace(/_/g, ' '),
        formatETB(item.unitCostETB),
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 98,
        theme: 'grid',
        headStyles: { fillColor: [10, 63, 36], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 24, right: 24 },
      });
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Federal Democratic Republic of Ethiopia • Ministry of Agriculture • Page ${i} of ${pageCount}`,
        pw / 2,
        doc.internal.pageSize.height - 12,
        { align: 'center' }
      );
    }

    doc.save(`MoA_${reportType}_${dateInfo.gc.replace(/\s+/g, '_')}.pdf`);
  };

  // Export CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    const filename = `MoA_${reportType}_${dateInfo.gc.replace(/\s+/g, '_')}.csv`;

    if (reportType === 'inventory_balance') {
      csvContent += 'Item Code,Item Name,Category,Serial Number,Store Location,Status,Unit Cost (ETB),IFMIS Slip,Assigned Dept,Current Custodian\n';
      filteredItems.forEach((item) => {
        csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.serialNumber || 'N/A'}","${item.storeLocation?.siteName || ''}","${item.status}",${item.unitCostETB},"${item.ifmisSlipNumber}","${item.assignedDepartment?.code || ''}","${item.currentCustodian?.fullNameEn || 'In Store'}"\n`;
      });
    } else if (reportType === 'stock_in_ledger') {
      csvContent += 'Item Code,Item Name,Category,IFMIS Slip,Date Received,Supplier/Source,Store Location,Unit Cost (ETB)\n';
      filteredItems.forEach((item) => {
        csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.ifmisSlipNumber}","${item.ifmisSlipDateGc}","${'MoA Central Store'}","${item.storeLocation?.siteName || ''}",${item.unitCostETB}\n`;
      });
    } else if (reportType === 'stock_out_ledger') {
      csvContent += 'Item Code,Item Name,Category,Requesting Directorate,Issued To,Issue Date,Purpose,Status\n';
      filteredItems
        .filter((item) => item.status === ItemStatus.ISSUED)
        .forEach((item) => {
          csvContent += `"${item.itemCode}","${item.name.replace(/"/g, '""')}","${item.category}","${item.assignedDepartment?.nameEn || ''}","${item.currentCustodian?.fullNameEn || ''}","${item.createdAtGc || item.ifmisSlipDateGc}","Official Operations","${item.status}"\n`;
        });
    } else if (reportType === 'department_summary') {
      csvContent += 'Directorate / Department,Code,Total Items Allocated,Total Valuation (ETB)\n';
      departments.forEach((dept) => {
        const deptItems = items.filter((i) => i.assignedDepartmentId === dept.id);
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
  };

  const reportTabs = [
    { id: 'inventory_balance', label: 'Store Stock Balance' },
    { id: 'stock_in_ledger', label: 'Inbound Stock-In (IFMIS)' },
    { id: 'stock_out_ledger', label: 'Outbound Store Issues' },
    { id: 'department_summary', label: 'Directorate Allocation' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
        Loading reporting ledgers & inventory balances...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Data Connection Error</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => loadData()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
              Reporting & Audits
            </span>
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              Statutory Stock Briefings
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
            Reports
          </h2>
          <p className="text-xs text-slate-500">
            Exportable and printable inventory ledgers, IFMIS inbound delivery summaries, and distribution reports.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 transition shadow-xs cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-white" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#FCDD09]" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Total Items Listed</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{metrics.totalCount}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Matching active filters</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Total Valuation (ETB)</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 block">{formatETB(metrics.totalETB)}</span>
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

      {/* Report Type Selector Tabs */}
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

      {/* Filter Controls Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-emerald-700 shrink-0" />

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {Object.values(AssetCategory).map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Store Location Filter */}
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none"
          >
            <option value="ALL">All Store Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.siteName}
              </option>
            ))}
          </select>

          {/* Department Filter */}
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

        {/* Search Input */}
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

      {/* Printable Report Document Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        {/* Printable Header */}
        <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {reportType === 'inventory_balance' && 'Current Store Stock Balance Report'}
              {reportType === 'stock_in_ledger' && 'Inbound Stock-In Ledger (IFMIS Reconciliation)'}
              {reportType === 'stock_out_ledger' && 'Outbound Store Issue Ledger'}
              {reportType === 'department_summary' && 'Directorate Asset Allocation Summary'}
            </h3>
            <p className="text-xs text-slate-500">
              Federal Democratic Republic of Ethiopia • Ministry of Agriculture
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-500 font-mono">
            <div>Report Date: {dateInfo.gc} (G.C.)</div>
            <div>Ethiopian Calendar: {dateInfo.ecFormattedAm}</div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          {reportType === 'department_summary' ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Directorate / Program</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3 text-center">Allocated Items</th>
                  <th className="py-2.5 px-3 text-right">Total Valuation (ETB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((dept) => {
                  const deptItems = items.filter((i) => i.assignedDepartmentId === dept.id);
                  const deptTotal = deptItems.reduce((acc, i) => acc + i.unitCostETB, 0);
                  return (
                    <tr key={dept.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{dept.nameEn}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{dept.code}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">{deptItems.length}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatETB(deptTotal)}</td>
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
                      No asset items match the selected report criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{item.itemCode}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{item.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{item.category.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 px-3 font-mono text-amber-800 font-bold">{item.ifmisSlipNumber}</td>
                      <td className="py-2.5 px-3 text-slate-600">{item.storeLocation?.siteName || 'HQ Store'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === ItemStatus.AVAILABLE
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatETB(item.unitCostETB)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
