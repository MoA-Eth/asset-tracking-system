import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  ShieldCheck,
  User,
  AlertCircle,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../api/client';
import { AuditLogEntry } from '../types/asset-management';
import { useToast } from '../context/ToastContext';

export const AuditLogsPage: React.FC = () => {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL_TIME');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      const msg = err.message || 'Failed to load statutory audit trail entries.';
      setError(msg);
      toast.error('Audit Log Sync Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filtered logs calculation
  const filteredLogs = useMemo(() => {
    const now = new Date();
    return logs.filter((log) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        log.action.toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        (log.ifmisSlipNumber && log.ifmisSlipNumber.toLowerCase().includes(q));

      const matchAction = selectedAction === 'ALL' || log.action.includes(selectedAction);

      // Date Range Filter logic
      let matchDate = true;
      if (log.timestampGc) {
        const logDate = new Date(log.timestampGc);
        if (!isNaN(logDate.getTime())) {
          if (dateFilter === 'TODAY') {
            matchDate = logDate.toDateString() === now.toDateString();
          } else if (dateFilter === 'THIS_WEEK') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchDate = logDate >= sevenDaysAgo;
          } else if (dateFilter === 'THIS_MONTH') {
            matchDate =
              logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
          }
        }
      }

      return matchSearch && matchAction && matchDate;
    });
  }, [logs, searchTerm, selectedAction, dateFilter]);


  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.warning('No Records', 'There are no audit log entries matching the current filters to export.');
      return;
    }
    try {
      const headers = [
        'Log ID',
        'Action',
        'User Name',
        'User Role',
        'IFMIS Slip #',
        'Timestamp (E.C.)',
        'Timestamp (G.C.)',
        'Details',
      ];
      const rows = filteredLogs.map((l) => [
        l.id,
        l.action,
        `"${l.userName.replace(/"/g, '""')}"`,
        l.userRole,
        l.ifmisSlipNumber || '',
        `"${l.timestampEc || ''}"`,
        `"${l.timestampGc || ''}"`,
        `"${l.details.replace(/"/g, '""')}"`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MoA_AMS_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        'Audit Trail Exported',
        `Successfully exported ${filteredLogs.length} audit entries to CSV.`
      );
    } catch (err: any) {
      toast.error('Export Failed', err.message || 'Failed to export audit trail.');
    }
  };

  // Print PDF handler
  const handlePrintPDF = () => {
    window.print();
  };

  const getActionColor = (action: string) => {
    if (action.includes('APPROVE')) return 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
    if (action.includes('REJECT')) return 'bg-rose-100 text-rose-900 border-rose-300 font-bold';
    if (action.includes('STOCK_IN')) return 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
    if (action.includes('STOCK_OUT')) return 'bg-amber-100 text-amber-950 border-amber-300 font-bold';
    if (action.includes('TRANSFER')) return 'bg-purple-100 text-purple-900 border-purple-300 font-bold';
    return 'bg-slate-100 text-slate-800 border-slate-300 font-bold';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
        Loading audit logs & statutory activity trail...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Audit Registry Load Error</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => fetchLogs()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* Header & Print/Export Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
              Governance & Anti-Tamper Trail
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Ethiopian Ministry of Agriculture
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            Statutory Audit Log & Activity Trail (የኦዲት መዝገብ)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable system logs for IFMIS registrations, stock receipts (Model 19), issues (Model 22), transfers and returns (Model 21), and approvals.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Export filtered audit log to CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={handlePrintPDF}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Print or save as PDF report"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print PDF</span>
          </button>
          <button
            onClick={fetchLogs}
            className="p-1.5 rounded-xl bg-white text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>


      {/* Search & Comprehensive Filters */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by user, action type, IFMIS slip #, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white font-mono"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Timeframe:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="ALL_TIME">All Time</option>
              <option value="TODAY">Today Only</option>
              <option value="THIS_WEEK">Past 7 Days</option>
              <option value="THIS_MONTH">This Month</option>
            </select>
          </div>
        </div>

        {/* Action Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          {[
            { label: 'All Activities', value: 'ALL' },
            { label: 'Stock-In (M19)', value: 'STOCK_IN' },
            { label: 'Stock-Out (M20)', value: 'STOCK_OUT' },
            { label: 'Approvals & Sign-Offs', value: 'APPROVE' },
            { label: 'Rejections', value: 'REJECT' },
            { label: 'Transfers', value: 'TRANSFER' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedAction(tab.value)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedAction === tab.value
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Entries List */}
      {filteredLogs.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-white border border-dashed border-slate-300 space-y-2 shadow-xs">
          <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-800">No Matching Audit Entries</p>
          <p className="text-xs text-slate-500">
            Try adjusting your search criteria or resetting filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;

            return (
              <div
                key={log.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-emerald-300 overflow-hidden transition"
              >
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs cursor-pointer select-none"
                >
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono border ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>

                      {log.ifmisSlipNumber && (
                        <span className="font-mono text-amber-900 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded text-[11px] font-bold">
                          IFMIS Slip: {log.ifmisSlipNumber}
                        </span>
                      )}

                      <span className="text-[10px] font-mono text-slate-400">ID: {log.id}</span>
                    </div>

                    <p className="text-slate-900 font-semibold leading-relaxed">{log.details}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-800">{log.userName}</strong> ({log.userRole.replace(/_/g, ' ')})
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0 text-right">
                    <div>
                      <p className="text-slate-900 font-bold font-mono text-[11px]">
                        {log.timestampEc} E.C.
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">{log.timestampGc} (G.C.)</p>
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-emerald-800 font-bold text-[10px]">
                      <span>{isExpanded ? 'Hide Payload' : 'View Payload'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                </div>

                {/* Expandable Raw JSON Payload View */}
                {isExpanded && (
                  <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs space-y-3 animate-fadeIn">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-700 border-b border-slate-200 pb-1.5">
                      <span>Immutable Security Log Payload</span>
                      <span className="font-mono text-slate-500 text-[10px]">Anti-Tamper Cryptographic Log</span>
                    </div>

                    {/* Metadata Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-400 block font-mono text-[10px]">AUTHORIZING USER</span>
                        <span className="font-bold text-slate-800">{log.userName}</span>
                        <span className="text-slate-500 block text-[10px]">{log.userRole}</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-400 block font-mono text-[10px]">IFMIS SLIP REFERENCE</span>
                        <span className="font-bold font-mono text-amber-900">
                          {log.ifmisSlipNumber || 'N/A (Internal Transfer)'}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-400 block font-mono text-[10px]">ORIGIN TIMESTAMP</span>
                        <span className="font-bold font-mono text-slate-800">{log.timestampGc}</span>
                        <span className="text-slate-500 block font-mono text-[10px]">{log.timestampEc} E.C.</span>
                      </div>
                    </div>

                    {/* Raw JSON Record */}
                    <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800">
                      <p className="text-slate-500 text-[10px] mb-1">// Raw Statutory Audit JSON Record</p>
                      <pre>{JSON.stringify(log, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
