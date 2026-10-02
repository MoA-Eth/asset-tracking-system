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
import { EmployeeImportModal } from './EmployeeImportModal';
import { Field, FieldGrid, FormError, FormFooter, FormNotice, FormSection, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Department, Employee, EmployeeInput, UserRole } from '../../types/asset-management';
import { EMPLOYEE_FIELDS, EmployeeField } from '../../utils/employee-import';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
  [UserRole.DATA_ENCODER]: 'Data Encoder',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.DEPARTMENT_HEAD]: 'Department Head',
  [UserRole.MANAGER]: 'Manager',
};

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

const emptyForm = (): EmployeeInput => ({
  departmentId: '',
  unit: '',
  fullNameAm: '',
  fullNameEn: '',
  payrollId: '',
  gender: '',
  jobTitle: '',
  phone: '',
  email: '',
});

const formOf = (e: Employee): EmployeeInput => ({
  departmentId: e.departmentId,
  unit: e.unit ?? '',
  fullNameAm: e.fullNameAm,
  fullNameEn: e.fullNameEn,
  payrollId: e.payrollId,
  gender: e.gender ?? '',
  jobTitle: e.jobTitle ?? '',
  phone: e.phone ?? '',
  email: e.email ?? '',
});

/** Where each shared field lives on the form (the department is picked, so it is stored by id) */
const FORM_KEY: Record<EmployeeField, keyof EmployeeInput> = {
  department: 'departmentId',
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
  unit: 'e.g. የትራንስፖርት ስምሪት አገልግሎት',
  fullNameAm: 'ሙሉ ስም',
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
  const [form, setForm] = useState<EmployeeInput>(editing ? formOf(editing) : emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof EmployeeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
            return (
              <Field key={field.key} label={`${field.label} · ${field.heading}`} required={field.required} optional={!field.required} htmlFor={id}>
                {field.key === 'department' ? (
                  <select {...common} className={inputClass('emerald')} autoFocus={index === 0}>
                    <option value="">Select…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nameEn}
                      </option>
                    ))}
                  </select>
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
                    placeholder={PLACEHOLDERS[field.key]}
                    className={inputClass('emerald', { mono: field.key === 'payrollId' })}
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === 'ACTIVE' && !e.isActive) return false;
      if (statusFilter === 'INACTIVE' && e.isActive) return false;
      if (deptFilter !== 'ALL' && e.departmentId !== deptFilter) return false;
      if (!q) return true;
      return [e.fullNameEn, e.fullNameAm, e.payrollId, e.jobTitle, e.unit, e.email, e.phone].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [employees, search, deptFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      active: employees.filter((e) => e.isActive).length,
      inactive: employees.filter((e) => !e.isActive).length,
      signIn: employees.filter((e) => e.isActive && e.role).length,
    }),
    [employees],
  );

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

  const colCount = canManage ? 8 : 5;

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <UserCheck className="h-5 w-5 text-emerald-700" />
            Employees (ሰራተኞች)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Staff who hold, receive or approve items. Only active employees appear in the Stock-Out, Transfer and Return forms.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              Import from Excel
            </button>
            <button type="button" onClick={openAdd} className={btn.primary}>
              <UserPlus className="h-4 w-4" />
              Add employee
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            id="employee-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee ID, unit or job title…"
            aria-label="Search employees"
            className={table.search}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="employee-dept-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameEn}
              </option>
            ))}
          </select>
          {canManage && (
            <div role="group" aria-label="Filter by status" className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              {(
                [
                  ['ACTIVE', `Active (${counts.active})`],
                  ['INACTIVE', `Deactivated (${counts.inactive})`],
                  ['ALL', 'All'],
                ] as [StatusFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${statusFilter === value ? btn.tabActive : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={load}
            aria-label="Refresh"
            title="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              <span className="font-semibold text-slate-900">{rows.length}</span> of {employees.length} employees
            </span>
            {canManage && <span>{counts.signIn} can sign in</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={table.headRow}>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Employee ID</th>
                  <th className="px-3 py-2.5">Department / Unit</th>
                  {canManage && <th className="px-3 py-2.5">Contact</th>}
                  <th className="px-3 py-2.5 whitespace-nowrap">Sign-in</th>
                  {canManage && <th className="px-3 py-2.5 text-right whitespace-nowrap">Items held</th>}
                  <th className="px-3 py-2.5">Status</th>
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
                        'No employees match these filters.'
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => {
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
                ? 'They will no longer appear in the Stock-Out, Transfer and Return forms' +
                  (confirming.role ? ' and will be signed out and unable to sign in' : '') +
                  '. Their name stays on past slips, approvals and history.'
                : 'They will appear in the forms again' + (confirming.role ? ' and can sign in with their current password' : '') + '.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={toggleActive}
                disabled={toggling}
                className={
                  confirming.isActive
                    ? 'flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-800 disabled:bg-slate-300 cursor-pointer'
                    : 'flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:bg-slate-300 cursor-pointer'
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
