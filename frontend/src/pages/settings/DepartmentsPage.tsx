import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  Package,
  DollarSign,
  Search,
  RefreshCw,
  Plus,
  Eye,
  X,
  XCircle,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { StatCard } from '../../components/ui/StatCard';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { btn, table, statusTone, pill } from '../../components/ui/theme';
import {
  FormSection,
  FieldGrid,
  Field,
  FormError,
  FormFooter,
  inputClass,
} from '../../components/ui/FormKit';
import { Department, Employee, ItemWithRelations, UserRole } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

type SortField = 'code' | 'nameEn' | 'head' | 'staffCount' | 'itemCount' | 'totalValue';

export const DepartmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('roles.assign') || user?.role === UserRole.SYSTEM_ADMIN;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [filterHeadOnly, setFilterHeadOnly] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modals state
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [detailTab, setDetailTab] = useState<'assets' | 'staff'>('assets');
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form state for Add/Edit
  const [formCode, setFormCode] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formNameAm, setFormNameAm] = useState('');
  const [formHeadId, setFormHeadId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Recently registered or updated banner
  const [lastRegistered, setLastRegistered] = useState<{
    action: 'created' | 'updated';
    id: string;
    code: string;
    nameEn: string;
    nameAm?: string;
  } | null>(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [depts, emps, allItems] = await Promise.all([
        api.getDepartments(),
        api.getEmployees(),
        api.getItems(),
      ]);
      setDepartments(depts);
      setEmployees(emps);
      setItems(allItems);
    } catch (err: any) {
      console.error('Failed to load departments data:', err);
      const msg = err.message || 'Failed to load directorates and staff registry.';
      setError(msg);
      toast.error('Directory Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Aggregated data per department
  const deptStats = useMemo(() => {
    const stats: Record<
      string,
      {
        staff: Employee[];
        items: ItemWithRelations[];
        head: Employee | null;
        totalValue: number;
        totalUnits: number;
      }
    > = {};

    departments.forEach((dept) => {
      const staff = employees.filter((e) => e.departmentId === dept.id);
      const deptItems = items.filter((i) => i.assignedDepartmentId === dept.id);
      const head =
        employees.find((e) => e.id === dept.headEmployeeId) ||
        staff.find((e) => e.role === UserRole.DEPARTMENT_HEAD) ||
        null;
      const totalValue = deptItems.reduce(
        (sum, it) => sum + (Number(it.unitCostETB) || 0) * (Number(it.quantity) || 1),
        0
      );
      const totalUnits = deptItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

      stats[dept.id] = { staff, items: deptItems, head, totalValue, totalUnits };
    });

    return stats;
  }, [departments, employees, items]);

  // Overall KPI metrics
  const totalStaffCount = employees.filter((e) => !!e.departmentId).length;
  const totalAllocatedItems = items.filter((i) => !!i.assignedDepartmentId).length;
  const totalAllocatedUnits = items
    .filter((i) => !!i.assignedDepartmentId)
    .reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const totalAllocatedValue = items
    .filter((i) => !!i.assignedDepartmentId)
    .reduce((sum, i) => sum + (Number(i.unitCostETB) || 0) * (Number(i.quantity) || 1), 0);

  // Sorting helper
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    );
  };

  // Filtered department list
  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments.filter((d) => {
      const stats = deptStats[d.id];
      const headName = stats?.head ? stats.head.fullNameEn.toLowerCase() : '';
      const matchesSearch =
        !q ||
        d.code.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        (d.nameAm && d.nameAm.toLowerCase().includes(q)) ||
        headName.includes(q);

      const matchesHeadFilter = !filterHeadOnly || !!stats?.head;
      return matchesSearch && matchesHeadFilter;
    });
  }, [departments, search, filterHeadOnly, deptStats]);

  // Sorted department list
  const sortedDepartments = useMemo(() => {
    return [...filteredDepartments].sort((a, b) => {
      const statsA = deptStats[a.id];
      const statsB = deptStats[b.id];

      let valA: any = '';
      let valB: any = '';

      if (sortField === 'code') {
        valA = a.code.toLowerCase();
        valB = b.code.toLowerCase();
      } else if (sortField === 'nameEn') {
        valA = a.nameEn.toLowerCase();
        valB = b.nameEn.toLowerCase();
      } else if (sortField === 'head') {
        valA = (statsA?.head?.fullNameEn || '').toLowerCase();
        valB = (statsB?.head?.fullNameEn || '').toLowerCase();
      } else if (sortField === 'staffCount') {
        valA = statsA?.staff.length || 0;
        valB = statsB?.staff.length || 0;
      } else if (sortField === 'itemCount') {
        valA = statsA?.items.length || 0;
        valB = statsB?.items.length || 0;
      } else if (sortField === 'totalValue') {
        valA = statsA?.totalValue || 0;
        valB = statsB?.totalValue || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredDepartments, deptStats, sortField, sortDirection]);

  // Handlers for Add / Edit
  const openAddModal = () => {
    setEditingDept(null);
    setFormCode('');
    setFormNameEn('');
    setFormNameAm('');
    setFormHeadId('');
    setFormError(null);
    setIsAddEditModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setFormCode(dept.code);
    setFormNameEn(dept.nameEn);
    setFormNameAm(dept.nameAm);
    setFormHeadId(dept.headEmployeeId || '');
    setFormError(null);
    setIsAddEditModalOpen(true);
  };

  const handleSaveDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const code = formCode.trim().toUpperCase();
    const nameEn = formNameEn.trim();
    const nameAm = formNameAm.trim();

    if (!code || !nameEn || !nameAm) {
      setFormError('Directorate code, English name, and Amharic name are all required.');
      return;
    }

    if (editingDept) {
      // Update existing
      const updatedList = departments.map((d) =>
        d.id === editingDept.id
          ? {
              ...d,
              code,
              nameEn,
              nameAm,
              headEmployeeId: formHeadId || undefined,
            }
          : d
      );
      setDepartments(updatedList);
      setLastRegistered({
        action: 'updated',
        id: editingDept.id,
        code,
        nameEn,
        nameAm,
      });
      toast.success(
        'Directorate Updated',
        `Changes saved for ${nameEn} (${code}).`
      );
    } else {
      // Create new
      const newId = `DEP-${String(departments.length + 1).padStart(2, '0')}`;
      const newDept: Department = {
        id: newId,
        code,
        nameEn,
        nameAm,
        headEmployeeId: formHeadId || undefined,
      };
      setDepartments((prev) => [...prev, newDept]);
      setLastRegistered({
        action: 'created',
        id: newId,
        code,
        nameEn,
        nameAm,
      });
      toast.success(
        'Directorate Registered',
        `Successfully registered ${nameEn} (${code}).`
      );
    }

    setIsAddEditModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
        Loading directorates and staff registry...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Directory Connection Error</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => loadData()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-700" />
            Departments & Directorates — የሥራ ክፍሎች እና ዳይሬክቶሬቶች
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ministry operational wings, directorates, and asset-holding administrative divisions.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <button onClick={openAddModal} className={btn.primary}>
              <Plus className="w-4 h-4" />
              Register Directorate
            </button>
          </div>
        )}
      </div>

      {/* ── Last Registration / Update Banner ── */}
      {lastRegistered && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-emerald-900">
              {lastRegistered.action === 'created'
                ? 'Directorate Successfully Registered!'
                : 'Directorate Successfully Updated!'}
            </p>
            <p className="text-slate-700 mt-0.5">
              <span className="font-mono font-bold text-emerald-800">{lastRegistered.code}</span> —{' '}
              {lastRegistered.nameEn} ({lastRegistered.nameAm || '—'}) is active in the ministry registry.
            </p>
          </div>
          <button
            onClick={() => setLastRegistered(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Directorates"
          value={departments.length.toLocaleString()}
          subtitle="Ministry operational wings"
          icon={<Building2 className="w-5 h-5" />}
        />
        <StatCard
          label="Civil Servants"
          value={totalStaffCount.toLocaleString()}
          subtitle="Assigned across directorates"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Allocated Assets"
          value={totalAllocatedItems.toLocaleString()}
          subtitle={`${totalAllocatedUnits} total units in custody`}
          icon={<Package className="w-5 h-5" />}
        />
        <StatCard
          label="Allocated Valuation"
          value={formatETB(totalAllocatedValue)}
          subtitle="Capital property under custody"
          icon={<DollarSign className="w-5 h-5" />}
        />
      </div>

      {/* ── Directorates Table Container ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        {/* Card Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            Directorate Directory ({departments.length})
          </h3>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code, English name, Amharic name, or director..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={table.search}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterHeadOnly((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                filterHeadOnly
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              With Assigned Head
            </button>

            {search.trim() && (
              <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl font-medium shrink-0">
                {filteredDepartments.length} of {departments.length} found
              </span>
            )}

            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer shrink-0"
              title="Refresh Directory"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Directory Table */}
        {sortedDepartments.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {search ? 'No directorates match your search query.' : 'No directorates registered in the system.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className={table.headRow}>
                  <th
                    onClick={() => handleSort('code')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition w-28 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Directorate Code</span>
                      {renderSortIcon('code')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('nameEn')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition min-w-[220px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Directorate / Department Name</span>
                      {renderSortIcon('nameEn')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('head')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition min-w-[190px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Directorate Head</span>
                      {renderSortIcon('head')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('staffCount')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition text-center w-24 whitespace-nowrap"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Staff</span>
                      {renderSortIcon('staffCount')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('itemCount')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition text-center w-32 whitespace-nowrap"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Assigned Assets</span>
                      {renderSortIcon('itemCount')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('totalValue')}
                    className="px-3 py-2.5 hover:bg-slate-100 cursor-pointer select-none transition text-right w-36 whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Capital</span>
                      {renderSortIcon('totalValue')}
                    </div>
                  </th>
                  <th className={`px-3 py-2.5 ${table.actionsHead}`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDepartments.map((dept) => {
                  const stats = deptStats[dept.id] || {
                    staff: [],
                    items: [],
                    head: null,
                    totalValue: 0,
                    totalUnits: 0,
                  };
                  const isHighlighted = lastRegistered?.id === dept.id;

                  return (
                    <tr
                      key={dept.id}
                      className={`transition ${isHighlighted ? `${table.rowHighlight} font-medium` : table.row}`}
                    >
                      {/* Code */}
                      <td className={`px-3 py-3 ${table.code} whitespace-nowrap w-28`}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDept(dept);
                              setDetailTab('assets');
                            }}
                            className="font-mono font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                            title={`View details for ${dept.code}`}
                          >
                            {dept.code}
                          </button>
                          {isHighlighted && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-700 text-white tracking-wider animate-pulse">
                              {lastRegistered.action === 'created' ? 'New' : 'Updated'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Directorate Name */}
                      <td className="px-3 py-3 min-w-[220px]">
                        <div
                          onClick={() => {
                            setSelectedDept(dept);
                            setDetailTab('assets');
                          }}
                          className="cursor-pointer group"
                        >
                          <p className="font-bold text-slate-900 text-xs group-hover:text-emerald-700 transition">
                            {dept.nameEn}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">{dept.nameAm}</p>
                        </div>
                      </td>

                      {/* Directorate Head */}
                      <td className="px-3 py-3 min-w-[190px]">
                        {stats.head ? (
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 border border-emerald-200">
                              {stats.head.fullNameEn
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate text-[11px]">
                                {stats.head.fullNameEn}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">{stats.head.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <ShieldAlert className="w-3 h-3 shrink-0" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Staff Count */}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDept(dept);
                            setDetailTab('staff');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[11px] border border-blue-200 transition cursor-pointer"
                          title="View Civil Servants"
                        >
                          <Users className="w-3 h-3" />
                          {stats.staff.length}
                        </button>
                      </td>

                      {/* Assigned Assets */}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDept(dept);
                            setDetailTab('assets');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200 transition cursor-pointer"
                          title="View Assigned Assets"
                        >
                          <Package className="w-3 h-3" />
                          {stats.items.length} units
                        </button>
                      </td>

                      {/* Total Capital */}
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatETB(stats.totalValue)}
                      </td>

                      {/* Actions */}
                      <td className={`px-3 py-3 ${table.actionsCell}`}>
                        <RowActionsMenu
                          label={dept.nameEn}
                          actions={[
                            {
                              label: 'View details',
                              icon: Eye,
                              onClick: () => {
                                setSelectedDept(dept);
                                setDetailTab('assets');
                              },
                            },
                            {
                              label: 'Staff directory',
                              icon: Users,
                              onClick: () => {
                                setSelectedDept(dept);
                                setDetailTab('staff');
                              },
                            },
                            {
                              label: 'Edit directorate',
                              icon: Pencil,
                              onClick: () => openEditModal(dept),
                              hidden: !canManage,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Department Details Modal (Assets & Staff) ── */}
      {selectedDept && (
        <Modal
          isOpen={!!selectedDept}
          onClose={() => setSelectedDept(null)}
          title={`${selectedDept.nameEn} (${selectedDept.code})`}
          subtitle={`${selectedDept.nameAm} · Directorate Resource Overview`}
          size="2xl"
          accentColor="emerald"
        >
          <div className="space-y-4">
            {/* Directorate Info Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Department Head</span>
                <span className="font-semibold text-slate-800">
                  {deptStats[selectedDept.id]?.head?.fullNameEn || 'No Department Head Assigned'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Civil Servants</span>
                <span className="font-semibold text-slate-800">
                  {deptStats[selectedDept.id]?.staff.length || 0} Employees
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Capital Property Held</span>
                <span className="font-mono font-bold text-emerald-800">
                  {formatETB(deptStats[selectedDept.id]?.totalValue || 0)}
                </span>
              </div>
            </div>

            {/* Sub-tabs switcher */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setDetailTab('assets')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  detailTab === 'assets'
                    ? btn.tabActive
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Assigned Assets ({deptStats[selectedDept.id]?.items.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('staff')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  detailTab === 'staff'
                    ? btn.tabActive
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Staff Directory ({deptStats[selectedDept.id]?.staff.length || 0})
              </button>
            </div>

            {/* Sub-tab 1: Assigned Assets */}
            {detailTab === 'assets' && (
              <div className="space-y-2">
                {(deptStats[selectedDept.id]?.items.length || 0) === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No physical assets currently assigned to this directorate.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className={table.headRow}>
                        <tr>
                          <th className="px-3 py-2 w-28">Item Code</th>
                          <th className="px-3 py-2">Item Description</th>
                          <th className="px-3 py-2">Custodian</th>
                          <th className="px-3 py-2 text-right">Unit Value</th>
                          <th className="px-3 py-2 text-center w-24">Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deptStats[selectedDept.id]?.items.map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50 transition">
                            <td className="px-3 py-2 font-mono font-bold text-slate-800 text-[11px]">
                              {it.itemCode}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              <div>{it.name}</div>
                              {it.serialNumber && (
                                <div className="text-[10px] text-slate-400 font-mono">SN: {it.serialNumber}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {it.assignedEmployee?.fullNameEn || 'Directorate Pool'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-800">
                              {formatETB(it.unitCostETB)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {it.condition}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 2: Staff Directory */}
            {detailTab === 'staff' && (
              <div className="space-y-2">
                {(deptStats[selectedDept.id]?.staff.length || 0) === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No employees currently assigned to this directorate.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className={table.headRow}>
                        <tr>
                          <th className="px-3 py-2 w-24">Payroll ID</th>
                          <th className="px-3 py-2">Full Name (English / Amharic)</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2 text-center w-28">System Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deptStats[selectedDept.id]?.staff.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50 transition">
                            <td className="px-3 py-2 font-mono font-bold text-slate-800 text-[11px]">
                              {emp.payrollId}
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-900">{emp.fullNameEn}</p>
                              <p className="text-[10px] text-slate-400">{emp.fullNameAm}</p>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{emp.email}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {emp.role ? emp.role.replace(/_/g, ' ') : 'Staff'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Add / Edit Directorate Modal (FormKit) ── */}
      {isAddEditModalOpen && (
        <Modal
          isOpen={isAddEditModalOpen}
          onClose={() => setIsAddEditModalOpen(false)}
          title={editingDept ? `Edit Directorate · ${editingDept.code}` : 'Register New Directorate'}
          subtitle="Ministry organizational division for asset custody and department-level approvals."
          size="2xl"
          accentColor="emerald"
        >
          <form onSubmit={handleSaveDepartment} className="space-y-4">
            <FormError message={formError} />

            <FormSection
              step={1}
              title="Directorate Particulars"
              subtitle="Official organizational identification and bilingual labeling"
              icon={Building2}
              accent="emerald"
            >
              <FieldGrid cols={2}>
                <Field label="Directorate Code" required hint="Short code, e.g. ICT, EXT, HORT">
                  <input
                    type="text"
                    required
                    placeholder="e.g. ICT, EXT, HORT"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className={inputClass('emerald', { mono: true })}
                  />
                </Field>

                <Field label="Director / Department Head" optional hint="Can be assigned later if vacant">
                  <select
                    value={formHeadId}
                    onChange={(e) => setFormHeadId(e.target.value)}
                    className={inputClass('emerald')}
                  >
                    <option value="">-- Unassigned (Vacant) --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullNameEn} ({emp.role ? emp.role.replace(/_/g, ' ') : 'Staff'})
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldGrid>

              <div className="mt-3.5 space-y-3.5">
                <Field label="Directorate Name (English)" required hint="Official English designation in federal directory">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Digital Agriculture & ICT Directorate"
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    className={inputClass('emerald')}
                  />
                </Field>

                <Field label="Directorate Name (Amharic)" required hint="Official Amharic designation on receiving vouchers">
                  <input
                    type="text"
                    required
                    placeholder="e.g. የኢንፎርሜሽን ቴክኖሎጂ ዳይሬክቶሬት"
                    value={formNameAm}
                    onChange={(e) => setFormNameAm(e.target.value)}
                    className={inputClass('emerald')}
                  />
                </Field>
              </div>
            </FormSection>

            <FormFooter
              accent="emerald"
              submitting={false}
              submitLabel={editingDept ? 'Save Changes' : 'Register Directorate'}
              onCancel={() => setIsAddEditModalOpen(false)}
            />
          </form>
        </Modal>
      )}
    </div>
  );
};
