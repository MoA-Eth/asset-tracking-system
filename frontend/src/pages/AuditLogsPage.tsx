import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, ShieldCheck, AlertCircle, Download, Printer, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { AuditLogEntry } from '../types/asset-management';
import { useToast } from '../context/ToastContext';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RefreshButton } from '../components/ui/RefreshButton';
import { actionText, roleName, withRoleNames } from '../utils/roles';
import { downloadCsv } from '../utils/csv';
import { FilterPopover, FilterSection, FilterSelect, FilterPill } from '../components/ui/FilterPopover';
import { SortableHeader, SortDirection } from '../components/ui/SortableHeader';

/** What kind of activity an entry is, for the filter and the colour of its label */
type ActivityKind = 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'APPROVAL' | 'REJECTION' | 'ADMIN' | 'OTHER';

const KIND_FILTERS: { label: string; value: ActivityKind | 'ALL' }[] = [
  { label: 'All activity', value: 'ALL' },
  { label: 'Receiving (M19)', value: 'STOCK_IN' },
  { label: 'Issuing (M22)', value: 'STOCK_OUT' },
  { label: 'Transfers (M21)', value: 'TRANSFER' },
  { label: 'Approvals', value: 'APPROVAL' },
  { label: 'Rejections', value: 'REJECTION' },
  { label: 'Users & settings', value: 'ADMIN' },
];

const KIND_TONE: Record<ActivityKind, string> = {
  STOCK_IN: 'bg-blue-50 text-blue-800 border-blue-200',
  STOCK_OUT: 'bg-amber-50 text-amber-900 border-amber-200',
  TRANSFER: 'bg-purple-50 text-purple-800 border-purple-200',
  APPROVAL: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTION: 'bg-rose-50 text-rose-800 border-rose-200',
  ADMIN: 'bg-slate-100 text-slate-700 border-slate-200',
  OTHER: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** Decisions first: "APPROVE_STOCK_IN" is an approval, not a stock-in */
export function activityKind(action: string): ActivityKind {
  if (/REJECT/.test(action)) return 'REJECTION';
  if (/APPROVE|ENDORSE/.test(action)) return 'APPROVAL';
  if (/ACCESS|PASSWORD|ROLE|PERMISSION|EMPLOYEE|STORE|LOCATION|SETTING|LOGIN/.test(action)) return 'ADMIN';
  if (/TRANSFER|RETURN/.test(action)) return 'TRANSFER';
  if (/STOCK_OUT/.test(action)) return 'STOCK_OUT';
  if (/STOCK_IN|REGISTER|ITEM/.test(action)) return 'STOCK_IN';
  return 'OTHER';
}

/** "APPROVE_STOCK_IN" → "Approve receipt" */
export const actionLabel = (action: string): string => actionText(action);

/** "2026-10-02 17:10:11" → date and time parts */
const splitStamp = (stamp?: string): [string, string] => {
  const [date = '', time = ''] = (stamp ?? '').trim().split(/[ T]/);
  return [date, time.slice(0, 5)];
};

const fieldLabel = (key: string): string => {
  const text = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const fieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return withRoleNames(String(value));
};

/** The recorded state before or after a change, one field per line; changed fields are highlighted */
const StateList: React.FC<{ title: string; state?: Record<string, unknown> | null; other?: Record<string, unknown> | null }> = ({ title, state, other }) => {
  if (!state || typeof state !== 'object' || Object.keys(state).length === 0) return null;
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <dl className="space-y-1">
        {Object.entries(state).map(([key, value]) => {
          const changed = other && fieldValue(other[key]) !== fieldValue(value);
          return (
            <div key={key} className="flex gap-2 text-[11px]">
              <dt className="w-36 shrink-0 text-slate-500">{fieldLabel(key)}</dt>
              <dd className={`min-w-0 break-words ${changed ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{fieldValue(value)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
};

export const AuditLogsPage: React.FC = () => {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKind, setSelectedKind] = useState<ActivityKind | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL_TIME');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const activeFilterCount = (selectedKind !== 'ALL' ? 1 : 0) + (dateFilter !== 'ALL_TIME' ? 1 : 0);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      const msg = err.message || 'The audit log could not be loaded.';
      setError(msg);
      toast.error("Couldn't load the audit log", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const now = new Date();
    const q = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      const matchSearch =
        !q ||
        log.action.toLowerCase().includes(q) ||
        actionLabel(log.action).toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        (log.ifmisSlipNumber ?? '').toLowerCase().includes(q);

      const matchKind = selectedKind === 'ALL' || activityKind(log.action) === selectedKind;

      let matchDate = true;
      if (log.timestampGc) {
        const logDate = new Date(log.timestampGc);
        if (!isNaN(logDate.getTime())) {
          if (dateFilter === 'TODAY') {
            matchDate = logDate.toDateString() === now.toDateString();
          } else if (dateFilter === 'THIS_WEEK') {
            matchDate = logDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          } else if (dateFilter === 'THIS_MONTH') {
            matchDate = logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
          }
        }
      }

      return matchSearch && matchKind && matchDate;
    });
  }, [logs, searchTerm, selectedKind, dateFilter]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.warning('Nothing to export', 'No audit log entries match the current filters.');
      return;
    }
    try {
      const headers = ['Log ID', 'Action', 'User Name', 'User Role', 'IFMIS Slip #', 'Timestamp (E.C.)', 'Timestamp (G.C.)', 'Details'];
      const rows = filteredLogs.map((l) => [l.id, l.action, l.userName, l.userRole, l.ifmisSlipNumber || '', l.timestampEc || '', l.timestampGc || '', l.details]);
      downloadCsv(`MoA_ATS_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
      toast.success('Audit log exported', `${filteredLogs.length} ${filteredLogs.length === 1 ? 'entry' : 'entries'} saved as CSV.`);
    } catch (err: any) {
      toast.error('Export failed', err.message || 'The audit log could not be exported.');
    }
  };

  type AuditSortColumn = 'date' | 'who' | 'action' | 'slip';
  const [sortColumn, setSortColumn] = useState<AuditSortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (colKey: string) => {
    const col = colKey as AuditSortColumn;
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'date' ? 'desc' : 'asc');
    }
  };

  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      let diff = 0;
      if (sortColumn === 'date') {
        const timeA = new Date(a.timestampGc || 0).getTime();
        const timeB = new Date(b.timestampGc || 0).getTime();
        diff = timeA - timeB;
      } else if (sortColumn === 'who') {
        diff = a.userName.localeCompare(b.userName);
      } else if (sortColumn === 'action') {
        diff = actionLabel(a.action).localeCompare(actionLabel(b.action));
      } else if (sortColumn === 'slip') {
        diff = (a.ifmisSlipNumber || '').localeCompare(b.ifmisSlipNumber || '');
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [filteredLogs, sortColumn, sortDirection]);

  // The export still uses every filtered entry; only the table on screen is paged
  const pager = usePagination(sortedLogs, { pageSize: 25, resetKey: `${searchTerm}|${dateFilter}|${selectedKind}|${sortColumn}|${sortDirection}` });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
        Loading the audit log…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">The audit log could not be loaded</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => fetchLogs()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-[3px] transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }

  const headButton = 'px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium text-xs rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer';

  return (
    <div className="space-y-2.5 animate-fadeIn pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2">
        <p className="text-xs text-slate-500">Who did what, and when. Entries are written by the system and can't be edited or deleted.</p>

        <div className="no-print flex items-center gap-2 shrink-0">
          <FilterPopover
            label="Filter"
            ariaLabel="Filter audit logs"
            title="Filters"
            resetLabel="Reset"
            activeCount={activeFilterCount}
            onReset={() => {
              setSelectedKind('ALL');
              setDateFilter('ALL_TIME');
            }}
            resultCountText={`${filteredLogs.length} ${filteredLogs.length === 1 ? 'entry' : 'entries'}`}
          >
            {/* Activity Type */}
            <FilterSection label="Activity Type">
              <div role="group" aria-label="Kind of activity" className="flex flex-wrap gap-1.5 pt-0.5">
                {KIND_FILTERS.map((tab) => (
                  <FilterPill
                    key={tab.value}
                    label={tab.label}
                    active={selectedKind === tab.value}
                    onClick={() => setSelectedKind(tab.value)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* Time Period */}
            <FilterSection label="Time Period" htmlFor="filter-time-period">
              <FilterSelect
                id="filter-time-period"
                ariaLabel="Period"
                value={dateFilter}
                onChange={setDateFilter}
                options={[
                  { label: 'All time', value: 'ALL_TIME' },
                  { label: 'Today', value: 'TODAY' },
                  { label: 'Past 7 days', value: 'THIS_WEEK' },
                  { label: 'This month', value: 'THIS_MONTH' },
                ]}
              />
            </FilterSection>
          </FilterPopover>

          <button onClick={handleExportCSV} className={headButton} title="Save the entries shown as a CSV file">
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 font-medium rounded-xl transition shadow-2xs flex items-center justify-center cursor-pointer h-8 w-8"
            title="Print, or save as PDF"
            aria-label="Print, or save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Search */}
        <div className="no-print border-b border-slate-200 px-3.5 py-2.5">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search the audit log"
              placeholder="Search by person, action, slip number or description…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800">No entries match</p>
            <p className="text-xs text-slate-500">Try a different search, period or kind of activity.</p>
            {(activeFilterCount > 0 || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedKind('ALL');
                  setDateFilter('ALL_TIME');
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="w-8 px-2 py-2"><span className="sr-only">Details</span></th>
                    <SortableHeader
                      label="Date & time"
                      columnKey="date"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      thClassName="w-40 px-3 py-2 whitespace-nowrap"
                    />
                    <SortableHeader
                      label="Who"
                      columnKey="who"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      thClassName="w-48 px-3 py-2"
                    />
                    <SortableHeader
                      label="Action"
                      columnKey="action"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      thClassName="w-44 px-3 py-2"
                    />
                    <SortableHeader
                      label="Slip no."
                      columnKey="slip"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      thClassName="w-36 px-3 py-2 whitespace-nowrap"
                    />
                    <th scope="col" className="px-3 py-2">What happened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const [ecDate, ecTime] = splitStamp(log.timestampEc);
                    const [gcDate] = splitStamp(log.timestampGc);
                    const hasStates = Boolean(log.previousState || log.newState);
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className={`cursor-pointer align-top transition-colors hover:bg-slate-50 ${isExpanded ? 'bg-emerald-50/40' : ''}`}
                        >
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Hide' : 'Show'} details of ${actionLabel(log.action)} by ${log.userName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLogId(isExpanded ? null : log.id);
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
                            >
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="block font-mono font-semibold tabular-nums text-slate-900">
                              {ecDate} <span className="font-normal text-slate-500">{ecTime}</span>
                            </span>
                            <span className="block font-mono text-[10px] tabular-nums text-slate-400">{gcDate} G.C.</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="block font-semibold text-slate-900">{log.userName}</span>
                            <span className="block text-[11px] text-slate-500">{roleName(log.userRole)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${KIND_TONE[activityKind(log.action)]}`}>
                              {actionLabel(log.action)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700">{log.ifmisSlipNumber || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-700">
                            <span className={isExpanded ? '' : 'line-clamp-2'}>{withRoleNames(log.details)}</span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td />
                            <td colSpan={5} className="px-3 pb-3.5 pt-1">
                              {hasStates ? (
                                <div className="flex flex-col gap-2.5 md:flex-row">
                                  <StateList title="Before" state={log.previousState} other={log.newState} />
                                  <StateList title="After" state={log.newState} other={log.previousState} />
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-500">No before-and-after values were recorded for this entry.</p>
                              )}
                              <p className="mt-2 font-mono text-[10px] text-slate-400">
                                Entry {log.id} · {log.timestampGc} G.C.
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pager={pager} label="entries" />
          </>
        )}
      </div>
    </div>
  );
};
