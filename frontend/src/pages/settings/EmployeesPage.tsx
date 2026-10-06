import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCheck,
  UserPlus,
  FileSpreadsheet,
  Search,
  RefreshCw,
  AlertCircle,
  Pencil,
  UserX,
  UserRoundCheck,
  KeyRound,
  IdCard,
  Building2,
  Package,
} from 'lucide-react';
import { api } from '../../api/client';
import { btn, table, pill, statusTone } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { EmployeeImportModal } from './EmployeeImportModal';
import { Field, FieldGrid, FormError, FormFooter, FormNotice, FormSection, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Department, Employee, EmployeeInput, UserRole } from '../../types/asset-management';
import { EMPLOYEE_FIELDS, EMPLOYEE_ID_FORMAT, EMPLOYEE_ID_PATTERN, EmployeeField } from '../../utils/employee-import';
import { RefreshButton } from '../../components/ui/RefreshButton';
import { FilterPopover, FilterSection, FilterSelect, FilterPill } from '../../components/ui/FilterPopover';
import { SortableHeader, SortDirection } from '../../components/ui/SortableHeader';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
  [UserRole.DATA_ENCODER]: 'Data Encoder',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.DEPARTMENT_HEAD]: 'Department Head',
  [UserRole.MANAGER]: 'Manager',
};

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

const emptyForm = (): EmployeeInput => ({
  departmentName: '',
  unit: '',
  fullNameAm: '',
  fullNameEn: '',
  payrollId: '',
  gender: '',
  jobTitle: '',
  phone: '',
  email: '',
});

const formOf = (e: Employee, departments: Department[]): EmployeeInput => ({
  departmentName: departments.find((d) => d.id === e.departmentId)?.nameEn ?? '',
  unit: e.unit ?? '',
  fullNameAm: e.fullNameAm,
  fullNameEn: e.fullNameEn,
  payrollId: e.payrollId,
  gender: e.gender ?? '',
  jobTitle: e.jobTitle ?? '',
  phone: e.phone ?? '',
  email: e.email ?? '',
});

/** Where each shared field lives on the form (the department is sent by name, so a new one can be typed) */
const FORM_KEY: Record<EmployeeField, keyof EmployeeInput> = {
  department: 'departmentName',
  unit: 'unit',
  fullNameAm: 'fullNameAm',
  fullNameEn: 'fullNameEn',
  payrollId: 'payrollId',
  gender: 'gender',
  jobTitle: 'jobTitle',
  phone: 'phone',
  email: 'email',
};

const PLACEHOLDERS: Partial<Record<EmployeeField, string>> = {
  department: 'Choose from the list, or type a new one',
  unit: 'e.g. የትራንስፖርት ስምሪት አገልግሎት',
  fullNameAm: 'e.g. አበበ ከበደ',
  fullNameEn: 'e.g. Hana Tesfaye Bekele',
  payrollId: 'e.g. 00123456',
  jobTitle: 'e.g. ሾፌር II',
  phone: '+251 911 000000',
  email: 'name@moa.gov.et',
};

// ─── Add / edit form ────────────────────────────────────────────────────────

const EmployeeForm: React.FC<{
  departments: Department[];
  editing: Employee | null;
  onCancel: () => void;
  onSaved: (saved: Employee) => void;
}> = ({ departments, editing, onCancel, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<EmployeeInput>(editing ? formOf(editing, departments) : emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof EmployeeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setError(null);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  // Ethiopic script validation for Amharic full name
  const hasAmharicLatin = Boolean(form.fullNameAm && /[a-zA-Z]/.test(form.fullNameAm));
  const hasAmharicNonEthiopic = Boolean(
    form.fullNameAm &&
      form.fullNameAm.trim() &&
      !/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/.test(form.fullNameAm)
  );
  const amharicError = hasAmharicLatin
    ? 'Ethiopic script only (e.g. አበበ ከበደ). Latin letters are not allowed.'
    : hasAmharicNonEthiopic
    ? 'Full name (Amharic) must contain Ethiopic script characters (e.g. አበበ ከበደ).'
    : null;

  // A name that matches no existing department will be created with the employee
  const typedDepartment = form.departmentName.trim().replace(/\s+/g, ' ').toLowerCase();
  const isNewDepartment =
    typedDepartment !== '' && !departments.some((d) => [d.nameEn, d.nameAm, d.code].some((v) => (v || '').trim().replace(/\s+/g, ' ').toLowerCase() === typedDepartment));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Name every missing field at once, instead of one per attempt
    const missing = [
      [form.departmentName, 'Department'],
      [form.fullNameEn, 'Full name (English)'],
      [form.payrollId, 'Employee ID'],
    ].filter(([value]) => !String(value ?? '').trim()).map(([, label]) => label);
    if (missing.length > 0) {
      setError(`Fill in: ${missing.join(', ')}.`);
      return;
    }
    if (amharicError) {
      setError(amharicError);
      return;
    }
    // Older IDs (e.g. MOA/DIR-008) can stay as they are; a new or changed ID must follow HR's format
    const payrollId = form.payrollId.trim();
    if (payrollId !== editing?.payrollId && !EMPLOYEE_ID_PATTERN.test(payrollId)) {
      setError(EMPLOYEE_ID_FORMAT);
      return;
    }
    setSubmitting(true);
    try {
      // Staff details only: any sign-in the employee has is left as it is
      const saved = editing ? await api.updateEmployee(editing.id, form) : await api.createEmployee(form);
      toast.success(editing ? 'Employee updated' : 'Employee added', `${saved.fullNameEn} (${saved.payrollId})`);
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || 'The employee could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Same fields, in the same order, as the import template (see EMPLOYEE_FIELDS) */}
      <FormSection step={1} title="Employee details" subtitle="የሰራተኛ መረጃ · the same fields as the Excel template" icon={IdCard} accent="emerald">
        <FieldGrid cols={2}>
          {EMPLOYEE_FIELDS.map((field, index) => {
            const key = FORM_KEY[field.key];
            const id = `emp-${field.key}`;
            const common = { id, value: form[key] ?? '', onChange: set(key) };
            const isAmharic = field.key === 'fullNameAm';
            const hint = isAmharic
              ? amharicError ? (
                  <span className="font-medium text-rose-600 flex items-center gap-1">
                    <AlertCircle className="size-3 shrink-0 inline" />
                    {amharicError}
                  </span>
                ) : (
                  <span className="text-slate-400">Ethiopic script only · የግዕዝ/አማርኛ ፊደላት ብቻ</span>
                )
              : field.key === 'department' && isNewDepartment
              ? 'New department. It will be added when you save.'
              : field.key === 'payrollId'
              ? '8 digits, as on the HR payroll'
              : undefined;

            return (
              <Field
                key={field.key}
                label={`${field.label} · ${field.heading}`}
                required={field.required}
                optional={!field.required}
                htmlFor={id}
                hint={hint}
              >
                {field.key === 'department' ? (
                  <>
                    <input
                      {...common}
                      list="emp-department-options"
                      autoComplete="off"
                      placeholder={PLACEHOLDERS.department}
                      className={inputClass('emerald')}
                      autoFocus={index === 0}
                    />
                    <datalist id="emp-department-options">
                      {departments.map((d) => (
                        <option key={d.id} value={d.nameEn} />
                      ))}
                    </datalist>
                  </>
                ) : field.key === 'gender' ? (
                  <select {...common} className={inputClass('emerald')}>
                    <option value="">Select…</option>
                    <option value="MALE">Male · ወንድ</option>
                    <option value="FEMALE">Female · ሴት</option>
                  </select>
                ) : (
                  <input
                    {...common}
                    type={field.key === 'email' ? 'email' : field.key === 'phone' ? 'tel' : 'text'}
                    lang={isAmharic ? 'am' : undefined}
                    dir={isAmharic ? 'ltr' : undefined}
                    inputMode={field.key === 'payrollId' ? 'numeric' : undefined}
                    aria-invalid={isAmharic && Boolean(amharicError) ? 'true' : undefined}
                    placeholder={PLACEHOLDERS[field.key]}
                    className={inputClass('emerald', {
                      mono: field.key === 'payrollId',
                      invalid: isAmharic && Boolean(amharicError),
                    })}
                  />
                )}
              </Field>
            );
          })}
        </FieldGrid>
      </FormSection>

      {editing?.role && (
        <FormNotice icon={KeyRound}>
          Signs in as <b>{ROLE_LABELS[editing.role]}</b>. Their sign-in is managed under Settings → Users and isn't changed here.
        </FormNotice>
      )}

      <FormError message={error} />
      <FormFooter accent="emerald" submitting={submitting} submitLabel={editing ? 'Save changes' : 'Add employee'} onCancel={onCancel} />
    </form>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

export const EmployeesPage: React.FC = () => {
  const toast = useToast();
  const { user, refreshSession } = useAuth();
  const canManage = user?.permissions?.includes('employees.manage') ?? false;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirming, setConfirming] = useState<Employee | null>(null);
  const [toggling, setToggling] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [emps, depts] = await Promise.all([api.getEmployees(undefined, { includeInactive: canManage }), api.getDepartments()]);
      setEmployees(emps);
      setDepartments(depts);
    } catch (err: any) {
      setError(err.message || 'The staff list could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [canManage]);

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  type EmployeeSortColumn = 'name' | 'payrollId' | 'department' | 'role' | 'heldItemCount' | 'status';
  const [sortColumn, setSortColumn] = useState<EmployeeSortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (colKey: string) => {
    const col = colKey as EmployeeSortColumn;
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'heldItemCount' ? 'desc' : 'asc');
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = employees.filter((e) => {
      if (statusFilter === 'ACTIVE' && !e.isActive) return false;
      if (statusFilter === 'INACTIVE' && e.isActive) return false;
      if (deptFilter !== 'ALL' && e.departmentId !== deptFilter) return false;
      if (!q) return true;
      return [e.fullNameEn, e.fullNameAm, e.payrollId, e.jobTitle, e.unit, e.email, e.phone].some((v) => (v || '').toLowerCase().includes(q));
    });

    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortColumn === 'name') {
        diff = a.fullNameEn.localeCompare(b.fullNameEn);
      } else if (sortColumn === 'payrollId') {
        diff = (a.payrollId || '').localeCompare(b.payrollId || '', undefined, { numeric: true });
      } else if (sortColumn === 'department') {
        const deptA = deptById.get(a.departmentId)?.nameEn || '';
        const deptB = deptById.get(b.departmentId)?.nameEn || '';
        diff = deptA.localeCompare(deptB);
      } else if (sortColumn === 'role') {
        const roleA = a.role ? (ROLE_LABELS[a.role] || a.role) : '';
        const roleB = b.role ? (ROLE_LABELS[b.role] || b.role) : '';
        diff = roleA.localeCompare(roleB);
      } else if (sortColumn === 'heldItemCount') {
        diff = (a.heldItemCount || 0) - (b.heldItemCount || 0);
      } else if (sortColumn === 'status') {
        diff = a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [employees, search, deptFilter, statusFilter, sortColumn, sortDirection, deptById]);

  const counts = useMemo(
    () => ({
      active: employees.filter((e) => e.isActive).length,
      inactive: employees.filter((e) => !e.isActive).length,
      signIn: employees.filter((e) => e.isActive && e.role).length,
    }),
    [employees],
  );

  const pager = usePagination(rows, { pageSize: 25, resetKey: `${search}|${deptFilter}|${statusFilter}|${sortColumn}|${sortDirection}` });

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setFormOpen(true);
  };

  const onSaved = async (saved: Employee) => {
    setEmployees((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      const next = exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      return next.sort((a, b) => a.fullNameEn.localeCompare(b.fullNameEn));
    });
    setFormOpen(false);
    setEditing(null);
    // A new department may have been created with the employee
    if (!departments.some((d) => d.id === saved.departmentId)) api.getDepartments().then(setDepartments).catch(() => {});
    if (saved.id === user?.id) await refreshSession();
  };

  const toggleActive = async () => {
    if (!confirming) return;
    setToggling(true);
    try {
      const updated = await api.setEmployeeActive(confirming.id, !confirming.isActive);
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast.success(updated.isActive ? 'Employee reactivated' : 'Employee deactivated', updated.fullNameEn);
      setConfirming(null);
    } catch (err: any) {
      toast.error(confirming.isActive ? 'Could not deactivate' : 'Could not reactivate', err.message);
    } finally {
      setToggling(false);
    }
  };

  const activeFilterCount = (deptFilter !== 'ALL' ? 1 : 0) + (statusFilter !== 'ACTIVE' ? 1 : 0);

  const resetFilters = () => {
    setDeptFilter('ALL');
    setStatusFilter('ACTIVE');
  };

  const colCount = canManage ? 8 : 5;

  return (
    <div className="space-y-4 animate-fadeIn pb-16">
      {/* ── Page header matching AssetsPage ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2">
        <p className="text-xs text-slate-500">
          Staff who hold, receive or approve items. Only active employees appear in the issue and transfer forms.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Reusable Filter Popover */}
          <FilterPopover
            label="Filter"
            ariaLabel="Filter employees"
            title="Filters"
            resetLabel="Reset"
            activeCount={activeFilterCount}
            onReset={resetFilters}
            resultCountText={`${rows.length} ${rows.length === 1 ? 'employee' : 'employees'}`}
          >
            {/* Employment Status Filter */}
            {canManage && (
              <FilterSection label="Employment Status">
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {(
                    [
                      ['ACTIVE', 'Active', counts.active],
                      ['INACTIVE', 'Deactivated', counts.inactive],
                      ['ALL', 'All', employees.length],
                    ] as [StatusFilter, string, number][]
                  ).map(([value, label, count]) => (
                    <FilterPill
                      key={value}
                      label={label}
                      count={count}
                      active={statusFilter === value}
                      onClick={() => setStatusFilter(value)}
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Department Filter */}
            <FilterSection label="Department">
              <FilterSelect
                id="employee-dept-filter"
                ariaLabel="Filter by department"
                placeholder="All departments"
                value={deptFilter}
                onChange={setDeptFilter}
                options={departments.map((d) => ({
                  value: d.id,
                  label: d.nameEn,
                }))}
              />
            </FilterSection>
          </FilterPopover>

          {canManage && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              title="Import employees from Excel"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import from Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div role="alert" className="mx-auto max-w-md space-y-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="text-xs text-red-700">{error}</p>
          <button type="button" onClick={load} className={btn.row}>
            <RefreshCw className={btn.rowIcon} /> Try again
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {/* Table Card Header matching AssetsPage: Search on left, Action button on right */}
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="employee-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, employee ID, unit or job title…"
                  aria-label="Search employees"
                  className={table.search.replace('pr-8', 'pr-3')}
                />
              </div>
              {canManage && (
                <button type="button" onClick={openAdd} className={`${btn.primary} shrink-0`}>
                  <UserPlus className="h-4 w-4" />
                  <span>Add employee</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>
                <span className="font-semibold text-slate-900">{rows.length}</span> of {employees.length} employees
              </span>
              {canManage && <span>{counts.signIn} can sign in</span>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={table.headRow}>
                  <SortableHeader
                    label="Employee"
                    columnKey="name"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="px-4 py-2.5"
                  />
                  <SortableHeader
                    label="Employee ID"
                    columnKey="payrollId"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="px-3 py-2.5 whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Department / Unit"
                    columnKey="department"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="px-3 py-2.5"
                  />
                  {canManage && <th className="px-3 py-2.5 font-semibold text-slate-700">Contact</th>}
                  <SortableHeader
                    label="Sign-in"
                    columnKey="role"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="px-3 py-2.5 whitespace-nowrap"
                  />
                  {canManage && (
                    <SortableHeader
                      label="Items held"
                      columnKey="heldItemCount"
                      currentSortColumn={sortColumn}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                      thClassName="px-3 py-2.5 text-right whitespace-nowrap"
                    />
                  )}
                  <SortableHeader
                    label="Status"
                    columnKey="status"
                    currentSortColumn={sortColumn}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    thClassName="px-3 py-2.5"
                  />
                  {canManage && (
                    <th className={`px-3 py-2.5 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && employees.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-slate-400">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-700" />
                      Loading staff…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-slate-500">
                      {employees.length === 0 ? (
                        <>
                          No employees yet.
                          {canManage && ' Add the first one with "Add employee".'}
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <p>No employees match these filters.</p>
                          {(activeFilterCount > 0 || search) && (
                            <button
                              type="button"
                              onClick={() => {
                                resetFilters();
                                setSearch('');
                              }}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Clear all filters
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  pager.pageItems.map((e) => {
                    const dept = deptById.get(e.departmentId);
                    return (
                      <tr key={e.id} className={`${table.row} ${e.isActive ? '' : 'text-slate-400'}`}>
                        <td className="px-4 py-2.5">
                          <p className={`font-semibold ${e.isActive ? 'text-slate-900' : 'text-slate-500'}`}>{e.fullNameEn}</p>
                          <p className="text-[11px] text-slate-500">
                            {[e.fullNameAm, e.jobTitle].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className={`px-3 py-2.5 whitespace-nowrap ${table.code}`}>{e.payrollId}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <p className="max-w-[260px] truncate" title={dept?.nameEn}>{dept?.nameEn ?? '—'}</p>
                          {e.unit && <p className="max-w-[260px] truncate text-[11px] text-slate-500" title={e.unit}>{e.unit}</p>}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2.5 text-slate-600">
                            <p className="truncate max-w-[200px]" title={e.email ?? undefined}>{e.email || '—'}</p>
                            {e.phone && <p className="font-mono text-[11px] text-slate-500">{e.phone}</p>}
                          </td>
                        )}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {e.role ? (
                            <span className={`${pill} ${statusTone.approved}`}>
                              <KeyRound className="h-3 w-3" />
                              {ROLE_LABELS[e.role]}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">No sign-in</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                            {e.heldItemCount ? (
                              <span className="inline-flex items-center gap-1 text-slate-900">
                                <Package className="h-3 w-3 text-slate-400" />
                                {e.heldItemCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <span className={`${pill} ${e.isActive ? statusTone.inStore : statusTone.neutral}`}>
                            {e.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        {canManage && (
                          <td className={`px-3 py-2.5 ${table.actionsCell}`}>
                            <RowActionsMenu
                              label={e.fullNameEn}
                              actions={[
                                { label: 'Edit', icon: Pencil, onClick: () => openEdit(e) },
                                {
                                  label: 'Deactivate',
                                  icon: UserX,
                                  onClick: () => setConfirming(e),
                                  hidden: !e.isActive,
                                  disabled: e.id === user?.id || !!e.heldItemCount,
                                  reason:
                                    e.id === user?.id
                                      ? "You can't deactivate your own account."
                                      : e.heldItemCount
                                        ? `Holds ${e.heldItemCount} ${e.heldItemCount === 1 ? 'item' : 'items'}. Transfer or return ${e.heldItemCount === 1 ? 'it' : 'them'} first.`
                                        : undefined,
                                },
                                { label: 'Reactivate', icon: UserRoundCheck, onClick: () => setConfirming(e), hidden: e.isActive },
                              ]}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination pager={pager} label="employees" />
        </div>
      )}

      {/* Add / edit */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.fullNameEn}` : 'Add employee'}
        subtitle={editing ? `Employee ID ${editing.payrollId}` : 'Add someone who can receive, hold, transfer and return items.'}
        size="lg"
      >
        {formOpen && (
          <EmployeeForm
            key={editing?.id ?? 'new'}
            departments={departments}
            editing={editing}
            onCancel={() => setFormOpen(false)}
            onSaved={onSaved}
          />
        )}
      </Modal>

      <EmployeeImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

      {/* Deactivate / reactivate */}
      <Modal
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.isActive ? `Deactivate ${confirming?.fullNameEn}?` : `Reactivate ${confirming?.fullNameEn}?`}
        size="sm"
      >
        {confirming && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">
              {confirming.isActive
                ? 'They will no longer appear in the issue and transfer forms' +
                  (confirming.role ? ' and will be signed out and unable to sign in' : '') +
                  '. Their name stays on past slips, approvals and history.'
                : 'They will appear in the forms again' + (confirming.role ? ' and can sign in with their current password' : '') + '.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-[3px] border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={toggleActive}
                disabled={toggling}
                className={
                  confirming.isActive
                    ? 'flex items-center gap-1.5 rounded-[3px] bg-red-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-800 disabled:bg-slate-300 cursor-pointer'
                    : 'flex items-center gap-1.5 rounded-[3px] bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:bg-slate-300 cursor-pointer'
                }
              >
                {toggling && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {confirming.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
