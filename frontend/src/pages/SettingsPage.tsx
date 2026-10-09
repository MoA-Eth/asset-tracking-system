import React, { useState, useEffect } from 'react';
import {
  Settings,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserPlus,
  KeyRound,
  UserX,
  UserMinus,
} from 'lucide-react';
import { api } from '../api/client';
import { table, btn } from '../components/ui/theme';
import { UserRole, Employee, Department } from '../types/asset-management';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { departmentLabel } from '../utils/department';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { ConfirmDialog } from './settings/reference-ui';
import { AddUserModal, ResetPasswordModal, ROLE_LABELS } from './settings/UserAccessModals';
import { RefreshButton } from '../components/ui/RefreshButton';
import { FilterPopover, FilterSection, FilterSelect } from '../components/ui/FilterPopover';
import { SortableHeader, SortDirection } from '../components/ui/SortableHeader';

interface SettingsPageProps {
  currentRole: UserRole;
  userEmail?: string;
  initialRoleFilter?: UserRole | 'ALL';
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ initialRoleFilter = 'ALL' }) => {
  const toast = useToast();
  const { user, refreshSession } = useAuth();
  const canAssign = user?.permissions?.includes('roles.assign') ?? false;
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>(initialRoleFilter);
  useEffect(() => setRoleFilter(initialRoleFilter), [initialRoleFilter]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Employee | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const applyUpdate = (updated: Employee) => setEmployees((prev) => prev.map((emp) => (emp.id === updated.id ? { ...emp, ...updated } : emp)));

  const removeSignIn = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      applyUpdate(await api.removeAccess(removing.id));
      toast.success('Sign-in removed', `${removing.fullNameEn} can no longer sign in.`);
      setRemoving(null);
    } catch (err: any) {
      toast.error('Could not remove sign-in', err.message);
    } finally {
      setRemoveBusy(false);
    }
  };

  const deactivateUser = async () => {
    if (!deactivating) return;
    setDeactivateBusy(true);
    try {
      const updated = await api.setEmployeeActive(deactivating.id, false);
      applyUpdate(updated);
      toast.success('User deactivated', `${deactivating.fullNameEn} has been deactivated.`);
      setDeactivating(null);
    } catch (err: any) {
      toast.error('Could not deactivate user', err.message);
    } finally {
      setDeactivateBusy(false);
    }
  };

  const fetchData = async () => {
    if (!canAssign) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [emps, depts] = await Promise.all([
        api.getEmployees(),
        api.getDepartments(),
      ]);
      setEmployees(emps);
      setDepartments(depts);
    } catch (err: any) {
      console.error('Failed to load settings data:', err);
      const msg = err.message || 'Failed to load user permissions registry.';
      setError(msg);
      toast.error('Settings Sync Error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [canAssign]);

  const handleRoleChange = async (employeeId: string, newRole: UserRole) => {
    if (!canAssign) return;
    setUpdatingId(employeeId);
    setSuccessMsg(null);
    try {
      const updated = await api.updateEmployeeRole(employeeId, newRole);
      setEmployees((prev) => prev.map((emp) => (emp.id === employeeId ? updated : emp)));
      await refreshSession();
      const roleName = newRole.replace(/_/g, ' ');
      setSuccessMsg(`Role updated to ${roleName} for ${updated.fullNameEn}`);
      toast.success(
        'Authorization Role Updated',
        `Assigned ${roleName} permissions to ${updated.fullNameEn}.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      const errMsg = err.message || 'Role update rejected.';
      toast.error('Role Update Failed', errMsg);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      emp.fullNameEn.toLowerCase().includes(q) ||
      (emp.email || '').toLowerCase().includes(q) ||
      (emp.payrollId && emp.payrollId.toLowerCase().includes(q));
    const matchesDept = selectedDeptFilter === 'ALL' || emp.departmentId === selectedDeptFilter;
    // Users are employees who can sign in; staff without a role are managed under Settings → Employees
    return emp.isActive && !!emp.role && matchesSearch && matchesDept && (roleFilter === 'ALL' || emp.role === roleFilter);
  });

  type UserSortColumn = 'name' | 'payrollId' | 'email' | 'department' | 'role';
  const [sortColumn, setSortColumn] = useState<UserSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (colKey: string) => {
    const col = colKey as UserSortColumn;
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    let diff = 0;
    if (sortColumn === 'name') {
      diff = a.fullNameEn.localeCompare(b.fullNameEn);
    } else if (sortColumn === 'payrollId') {
      diff = (a.payrollId || '').localeCompare(b.payrollId || '', undefined, { numeric: true });
    } else if (sortColumn === 'email') {
      diff = (a.email || '').localeCompare(b.email || '');
    } else if (sortColumn === 'department') {
      const deptA = departmentLabel(departments.find((d) => d.id === a.departmentId));
      const deptB = departmentLabel(departments.find((d) => d.id === b.departmentId));
      diff = deptA.localeCompare(deptB);
    } else if (sortColumn === 'role') {
      const roleA = ROLE_LABELS[a.role || ''] || a.role || '';
      const roleB = ROLE_LABELS[b.role || ''] || b.role || '';
      diff = roleA.localeCompare(roleB);
    }
    return sortDirection === 'asc' ? diff : -diff;
  });

  const activeFilterCount = (roleFilter !== 'ALL' ? 1 : 0) + (selectedDeptFilter !== 'ALL' ? 1 : 0);

  const resetFilters = () => {
    setRoleFilter('ALL');
    setSelectedDeptFilter('ALL');
  };

  const pager = usePagination(sortedEmployees, { resetKey: `${searchTerm}|${selectedDeptFilter}|${roleFilter}|${sortColumn}|${sortDirection}` });

  if (!canAssign) return <p role="alert" className="text-sm text-slate-600">Only System Administrators can manage user roles.</p>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
        Loading settings & directorate parameters...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Settings Load Failure</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-[3px] transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
        <p className="text-xs text-slate-500">
          The people who can sign in, and their roles. Staff are added under Settings → Employees; give them sign-in here.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          {/* Reusable Filter Popover */}
          <FilterPopover
            label="Filter"
            ariaLabel="Filter users"
            title="Filters"
            resetLabel="Reset"
            activeCount={activeFilterCount}
            onReset={resetFilters}
            resultCountText={`${filteredEmployees.length} ${filteredEmployees.length === 1 ? 'user' : 'users'}`}
          >
            {/* Role Filter */}
            <FilterSection label="System Role">
              <FilterSelect
                id="user-role-filter"
                ariaLabel="Filter users by role"
                placeholder="All roles"
                value={roleFilter}
                onChange={(val) => setRoleFilter(val as UserRole | 'ALL')}
                options={Object.values(UserRole).map((code) => ({
                  value: code,
                  label: ROLE_LABELS[code] || code.replace(/_/g, ' '),
                }))}
              />
            </FilterSection>

            {/* Directorate / Department Filter */}
            <FilterSection label="Directorate / Department">
              <FilterSelect
                id="user-dept-filter"
                ariaLabel="Filter users by directorate"
                placeholder={`All Directorates (${departments.length})`}
                value={selectedDeptFilter}
                onChange={setSelectedDeptFilter}
                options={departments.map((d) => ({
                  value: d.id,
                  label: departmentLabel(d),
                }))}
              />
            </FilterSection>
          </FilterPopover>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* ── User Permissions Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Card Header matching Assets & Employees: Search on left, Action button on right */}
        <div className="border-b border-slate-200 px-3.5 py-2.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, email or employee ID…"
                aria-label="Search staff"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition"
              />
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={`${btn.primary} shrink-0`}
            >
              <UserPlus className="h-4 w-4" />
              <span>Add user</span>
            </button>
          </div>
        </div>
          {/* Email and directorate fold under the name on narrow screens, so the role and actions stay in view */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={table.headRow}>
                  <SortableHeader
                    label="User"
                    columnKey="name"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-3 px-4"
                  />
                  <SortableHeader
                    label="Employee ID"
                    columnKey="payrollId"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-3 px-3 whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Email"
                    columnKey="email"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="hidden md:table-cell py-3 px-3"
                  />
                  <SortableHeader
                    label="Directorate"
                    columnKey="department"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="hidden lg:table-cell py-3 px-3"
                  />
                  <SortableHeader
                    label="Role"
                    columnKey="role"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="py-3 px-3"
                  />
                  <th className={`py-3 px-3 ${table.actionsHead}`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pager.pageItems.map((emp) => {
                  const dept = departments.find((d) => d.id === emp.departmentId);
                  const deptName = dept ? departmentLabel(dept) : '—';
                  const isUpdating = updatingId === emp.id;

                  return (
                    <tr key={emp.id} className={table.row}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-300">
                            {emp.fullNameEn.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">
                              {emp.fullNameEn}
                              {emp.mustChangePassword && (
                                <span className="ml-2 inline-block rounded-full border border-amber-200 bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800" title="They haven't chosen their own password yet">
                                  Temporary password
                                </span>
                              )}
                            </p>
                            {emp.fullNameAm && <p className="text-[10px] text-slate-500">{emp.fullNameAm}</p>}
                            <p className="md:hidden max-w-[220px] truncate text-[11px] text-slate-500" title={emp.email ?? undefined}>{emp.email}</p>
                            <p className="lg:hidden max-w-[220px] truncate text-[11px] text-slate-500" title={deptName}>{deptName}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`py-3 px-3 whitespace-nowrap ${table.code}`}>{emp.payrollId}</td>
                      <td className="hidden md:table-cell py-3 px-3 font-mono text-slate-700">
                        <p className="max-w-[220px] truncate" title={emp.email ?? undefined}>{emp.email}</p>
                      </td>
                      <td className="hidden lg:table-cell py-3 px-3 text-slate-700 font-medium">
                        <p className="max-w-[260px] truncate" title={deptName}>{deptName}</p>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={emp.role}
                            disabled={updatingId !== null || !canAssign}
                            aria-label={`Role for ${emp.fullNameEn}`}
                            onChange={(e) => handleRoleChange(emp.id, e.target.value as UserRole)}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 disabled:opacity-50 cursor-pointer"
                          >
                            {Object.values(UserRole).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          {isUpdating && <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-emerald-600" />}
                        </div>
                      </td>
                      <td className={`py-3 px-3 ${table.actionsCell}`}>
                        <RowActionsMenu
                          label={emp.fullNameEn}
                          actions={[
                            {
                              label: 'Reset password',
                              icon: KeyRound,
                              onClick: () => setResetting(emp),
                              disabled: emp.id === user?.id,
                              reason: emp.id === user?.id ? 'Change your own password on your Profile page.' : undefined,
                            },
                            {
                              label: 'Remove sign-in',
                              icon: UserMinus,
                              onClick: () => setRemoving(emp),
                              disabled: emp.id === user?.id,
                              reason: emp.id === user?.id ? "You can't remove your own sign-in." : undefined,
                            },
                            {
                              label: 'Deactivate user',
                              icon: UserX,
                              onClick: () => setDeactivating(emp),
                              disabled: emp.id === user?.id || (emp.heldItemCount !== undefined && emp.heldItemCount > 0),
                              reason:
                                emp.id === user?.id
                                  ? "You can't deactivate your own account."
                                  : emp.heldItemCount
                                    ? `Holds ${emp.heldItemCount} ${emp.heldItemCount === 1 ? 'item' : 'items'}. Transfer or return ${emp.heldItemCount === 1 ? 'it' : 'them'} first.`
                                    : undefined,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      <div className="space-y-1.5">
                        <p>No users match these filters.</p>
                        {(activeFilterCount > 0 || searchTerm) && (
                          <button
                            type="button"
                            onClick={() => {
                              resetFilters();
                              setSearchTerm('');
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination pager={pager} label="users" />
        </div>

        <AddUserModal isOpen={adding} employees={employees} onClose={() => setAdding(false)} onSaved={applyUpdate} />
      <ResetPasswordModal employee={resetting} onClose={() => setResetting(null)} onSaved={applyUpdate} />
      <ConfirmDialog
        isOpen={!!removing}
        title={`Remove sign-in for ${removing?.fullNameEn ?? ''}?`}
        confirmLabel="Remove sign-in"
        danger
        busy={removeBusy}
        onConfirm={removeSignIn}
        onClose={() => setRemoving(null)}
      >
        They will be signed out and can no longer sign in. They stay on the staff list and keep any items they hold.
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={!!deactivating}
        title={`Deactivate ${deactivating?.fullNameEn ?? ''}?`}
        confirmLabel="Deactivate user"
        danger
        busy={deactivateBusy}
        onConfirm={deactivateUser}
        onClose={() => setDeactivating(null)}
      >
        They will be signed out immediately and can no longer sign in or receive asset items. Their past slips, approvals and history remain preserved.
      </ConfirmDialog>
    </div>
  );
};
