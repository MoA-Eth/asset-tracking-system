import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Package,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  Department,
  Employee,
  ItemStatus,
  ItemWithRelations,
} from '../types/asset-management';
import { Button, StatCard, StatusBadge } from '../components/ui';
import { formatETB } from '../utils/eth-date';

interface Registry {
  departments: Department[];
  employees: Employee[];
  items: ItemWithRelations[];
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600';

export const DepartmentsPage: React.FC = () => {
  const [data, setData] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [allocationFilter, setAllocationFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetStatus, setAssetStatus] = useState('all');
  const requestId = useRef(0);
  const detailsRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const openDetails = (id: string, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setSelectedId(id);
    setAssetSearch('');
    setAssetStatus('all');
  };

  const loadData = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [departments, employees, items] = await Promise.all([
        api.getDepartments(),
        api.getEmployees(),
        api.getItems(),
      ]);
      if (id === requestId.current) setData({ departments, employees, items });
    } catch (err) {
      if (id === requestId.current)
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load the department registry.'
        );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    return () => {
      requestId.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    if (selectedId) {
      detailsRef.current?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [selectedId]);

  const registry = useMemo(() => {
    const active = (data?.items || []).filter(
      (item) => item.status !== ItemStatus.DISPOSED
    );
    const departmentIds = new Set(
      data?.departments.map((department) => department.id)
    );
    const rows = (data?.departments || []).map((department) => {
      const staff = data!.employees.filter(
        (employee) => employee.departmentId === department.id
      );
      const head = data!.employees.find(
        (employee) => employee.id === department.headEmployeeId
      );
      const assets = active.filter(
        (item) => item.assignedDepartmentId === department.id
      );
      return {
        department,
        staff,
        head,
        assets,
        issued: assets.filter((item) => item.status === ItemStatus.ISSUED)
          .length,
        value: assets.reduce((sum, item) => sum + item.unitCostETB, 0),
      };
    });
    return {
      rows,
      unallocated: active.filter((item) => !item.assignedDepartmentId),
      unknownDepartment: active.filter(
        (item) =>
          item.assignedDepartmentId &&
          !departmentIds.has(item.assignedDepartmentId)
      ),
      allocatedCount: rows.reduce((sum, row) => sum + row.assets.length, 0),
      allocatedValue: rows.reduce((sum, row) => sum + row.value, 0),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return registry.rows
      .filter((row) => {
        const matches = [
          row.department.nameEn,
          row.department.nameAm,
          row.department.code,
          row.head?.fullNameEn,
          row.head?.fullNameAm,
        ].some((value) => value?.toLocaleLowerCase().includes(query));
        return (
          matches &&
          (allocationFilter === 'all' ||
            (allocationFilter === 'allocated' && row.assets.length > 0) ||
            (allocationFilter === 'empty' && row.assets.length === 0) ||
            (allocationFilter === 'no-head' && !row.head))
        );
      })
      .sort((a, b) => {
        if (sort === 'value')
          return (
            b.value - a.value ||
            a.department.nameEn.localeCompare(b.department.nameEn)
          );
        if (sort === 'assets')
          return (
            b.assets.length - a.assets.length ||
            a.department.nameEn.localeCompare(b.department.nameEn)
          );
        return a.department.nameEn.localeCompare(b.department.nameEn);
      });
  }, [registry, search, allocationFilter, sort]);

  const selected = registry.rows.find(
    (row) => row.department.id === selectedId
  );
  const visibleAssets = (selected?.assets || []).filter((item) => {
    const query = assetSearch.trim().toLocaleLowerCase();
    return (
      (assetStatus === 'all' || item.status === assetStatus) &&
      [
        item.name,
        item.itemCode,
        item.serialNumber,
        item.ifmisSlipNumber,
        item.currentCustodian?.fullNameEn,
      ].some((value) => value?.toLocaleLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Directorate registry
          </span>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            Departments & asset allocation
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            View Ministry directorates, their staff, and the equipment allocated
            to each department.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          isLoading={loading}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh departments
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Unable to refresh departments</p>
            <p className="mt-1 text-xs">
              {error}
              {data && ' Showing the last loaded data.'}
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      {loading && !data && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500"
        >
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-700" />
          Loading departments and allocations…
        </div>
      )}

      {data && (
        <>
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Ministry allocation totals"
          >
            <StatCard
              label="Directorates"
              value={data.departments.length}
              subtitle="Registered Ministry departments"
              icon={<Building2 className="h-5 w-5" />}
            />
            <StatCard
              label="Registered staff"
              value={data.employees.length}
              subtitle="Across the Ministry"
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Allocated assets"
              value={registry.allocatedCount}
              subtitle="Active assets assigned to directorates"
              icon={<Package className="h-5 w-5" />}
            />
            <StatCard
              label="Allocated value"
              value={formatETB(registry.allocatedValue)}
              subtitle="Recorded asset cost • ETB"
              valueColor="text-emerald-800"
            />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-relaxed text-emerald-900">
            <strong>
              Unallocated active assets: {registry.unallocated.length}
            </strong>
            <span>
              {' '}
              ·{' '}
              {formatETB(
                registry.unallocated.reduce(
                  (sum, item) => sum + item.unitCostETB,
                  0
                )
              )}
              . Department totals use the recorded department assignment and
              exclude disposed assets.
            </span>
            {registry.unknownDepartment.length > 0 && (
              <p className="mt-1 font-semibold">
                Active assets with an unavailable department:{' '}
                {registry.unknownDepartment.length}. These are excluded from
                department totals.
              </p>
            )}
          </div>

          <section
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
            aria-label="Department registry"
            aria-busy={loading}
          >
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[minmax(0,1fr)_180px_170px]">
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                  htmlFor="department-search"
                >
                  Search departments
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="department-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, code, or department head…"
                    className={`${fieldClass} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                  htmlFor="department-allocation"
                >
                  Allocation filter
                </label>
                <select
                  id="department-allocation"
                  className={fieldClass}
                  value={allocationFilter}
                  onChange={(event) => setAllocationFilter(event.target.value)}
                >
                  <option value="all">All departments</option>
                  <option value="allocated">With active assets</option>
                  <option value="empty">No active assets</option>
                  <option value="no-head">Head unavailable</option>
                </select>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                  htmlFor="department-sort"
                >
                  Sort by
                </label>
                <select
                  id="department-sort"
                  className={fieldClass}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="name">Department name</option>
                  <option value="value">Highest value</option>
                  <option value="assets">Most assets</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="space-y-2 px-4 py-12 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                <h3 className="font-bold text-slate-800">
                  {data.departments.length === 0
                    ? 'No departments registered'
                    : 'No matching departments'}
                </h3>
                <p className="text-xs text-slate-500">
                  {data.departments.length === 0
                    ? 'Departments will appear here when they are added to the Ministry registry.'
                    : 'Try another name, code, or allocation filter.'}
                </p>
                {data.departments.length > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearch('');
                      setAllocationFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <caption className="sr-only">
                    Directorate staff and active asset allocations
                  </caption>
                  <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3" scope="col">
                        Directorate
                      </th>
                      <th className="px-4 py-3" scope="col">
                        Department head
                      </th>
                      <th className="px-4 py-3 text-right" scope="col">
                        Staff
                      </th>
                      <th className="px-4 py-3 text-right" scope="col">
                        Active assets
                      </th>
                      <th className="px-4 py-3 text-right" scope="col">
                        Issued
                      </th>
                      <th className="px-4 py-3 text-right" scope="col">
                        Value (ETB)
                      </th>
                      <th className="px-4 py-3" scope="col">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((row) => (
                      <tr
                        key={row.department.id}
                        className={
                          selectedId === row.department.id
                            ? 'bg-emerald-50'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <th
                          scope="row"
                          className="max-w-[290px] px-4 py-4 font-normal"
                        >
                          <span className="inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                            {row.department.code}
                          </span>
                          <button
                            type="button"
                            aria-label={`View ${row.department.nameEn} allocation`}
                            aria-expanded={selectedId === row.department.id}
                            aria-controls="department-details"
                            onClick={(event) =>
                              openDetails(
                                row.department.id,
                                event.currentTarget
                              )
                            }
                            className="mt-1 block text-left font-bold text-slate-900 hover:text-emerald-800 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600"
                          >
                            {row.department.nameEn}
                          </button>
                          <p
                            lang="am"
                            className="mt-1 text-[11px] text-slate-500"
                          >
                            {row.department.nameAm}
                          </p>
                        </th>
                        <td className="max-w-[190px] px-4 py-4 text-slate-700">
                          {row.head?.fullNameEn ||
                            (row.department.headEmployeeId
                              ? 'Head record unavailable'
                              : 'Not assigned')}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {row.staff.length}
                        </td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums">
                          {row.assets.length}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {row.issued}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-emerald-800">
                          {formatETB(row.value)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            aria-label={`View ${row.department.code} allocation`}
                            aria-expanded={selectedId === row.department.id}
                            aria-controls="department-details"
                            onClick={(event) =>
                              openDetails(
                                row.department.id,
                                event.currentTarget
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 font-bold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
                          >
                            View
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p
              role="status"
              className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500"
            >
              Showing {filtered.length} of {data.departments.length}{' '}
              departments. Summary totals cover the full Ministry registry.
            </p>
          </section>

          {selected && (
            <section
              id="department-details"
              ref={detailsRef}
              tabIndex={-1}
              aria-labelledby="department-details-title"
              className="scroll-mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xs focus:outline-none"
            >
              <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    {selected.department.code} · Allocation details
                  </span>
                  <h3
                    id="department-details-title"
                    className="mt-1 text-base font-bold text-slate-900"
                  >
                    {selected.department.nameEn}
                  </h3>
                  <p lang="am" className="mt-1 text-xs text-slate-500">
                    {selected.department.nameAm}
                  </p>
                  <p className="mt-3 text-xs text-slate-700">
                    <strong>Department head:</strong>{' '}
                    {selected.head?.fullNameEn ||
                      (selected.department.headEmployeeId
                        ? 'Head record unavailable'
                        : 'Not assigned')}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {selected.assets.length} active assets · {selected.issued}{' '}
                    issued · <strong>{formatETB(selected.value)}</strong>
                  </p>
                </div>
                <button
                  aria-label="Close department details"
                  onClick={() => {
                    setSelectedId(null);
                    openerRef.current?.focus();
                  }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <details className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <summary className="cursor-pointer text-xs font-bold text-emerald-800">
                  Staff directory ({selected.staff.length})
                </summary>
                {selected.staff.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">
                    No staff registered in this department.
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {selected.staff.map((employee) => (
                      <li
                        key={employee.id}
                        className="min-w-0 rounded-xl border border-slate-200 p-3 text-xs"
                      >
                        <p className="font-semibold text-slate-900">
                          {employee.fullNameEn}
                        </p>
                        <p lang="am" className="mt-1 text-slate-500">
                          {employee.fullNameAm}
                        </p>
                        <p className="mt-2 break-all text-slate-600">
                          {employee.email}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">
                          {employee.payrollId}
                        </p>
                        <p className="mt-2 text-[10px] font-bold text-emerald-700">
                          {employee.role.replace(/_/g, ' ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </details>

              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:px-5">
                <div className="flex-1">
                  <label
                    className="mb-1.5 block text-xs font-semibold text-slate-600"
                    htmlFor="department-asset-search"
                  >
                    Search allocated assets
                  </label>
                  <input
                    id="department-asset-search"
                    className={fieldClass}
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    placeholder="Item, serial, voucher, or custodian…"
                  />
                </div>
                <div className="sm:w-48">
                  <label
                    className="mb-1.5 block text-xs font-semibold text-slate-600"
                    htmlFor="department-asset-status"
                  >
                    Asset status
                  </label>
                  <select
                    id="department-asset-status"
                    className={fieldClass}
                    value={assetStatus}
                    onChange={(event) => setAssetStatus(event.target.value)}
                  >
                    <option value="all">All active statuses</option>
                    {Object.values(ItemStatus)
                      .filter((status) => status !== ItemStatus.DISPOSED)
                      .map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {visibleAssets.length === 0 ? (
                <p className="px-5 pb-8 pt-3 text-center text-sm text-slate-500">
                  {selected.assets.length === 0
                    ? 'No active assets allocated to this department.'
                    : 'No allocated assets match these filters.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <caption className="sr-only">
                      Active assets allocated to {selected.department.nameEn}
                    </caption>
                    <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th scope="col" className="px-5 py-3">
                          Asset / IFMIS reference
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Custodian / store
                        </th>
                        <th scope="col" className="px-5 py-3 text-right">
                          Value (ETB)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleAssets.map((item) => (
                        <tr key={item.id}>
                          <th scope="row" className="px-5 py-4 font-normal">
                            <p className="font-bold text-slate-900">
                              {item.name}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-emerald-700">
                              {item.itemCode}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">
                              {item.ifmisSlipNumber}
                            </p>
                          </th>
                          <td className="px-4 py-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="px-4 py-4">
                            <p>
                              {item.currentCustodian?.fullNameEn ||
                                (item.currentCustodianId
                                  ? 'Custodian record unavailable'
                                  : 'No active custodian')}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {item.storeLocation
                                ? `${item.storeLocation.siteName} · ${item.storeLocation.roomNumber}`
                                : 'Store record unavailable'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums">
                            {formatETB(item.unitCostETB)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-5 py-3 text-[11px] text-slate-500">
                Showing {visibleAssets.length} of {selected.assets.length}{' '}
                active allocations. Pending issues remain pending until final
                approval.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
};
