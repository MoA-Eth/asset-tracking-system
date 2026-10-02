import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '../api/client';
import { table } from '../components/ui/theme';
import { UserRole, Employee, Department } from '../types/asset-management';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { departmentLabel } from '../utils/department';

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
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
              System Administration
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Ministry of Agriculture Policy & Access Controls
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-700" />
            Users (ተጠቃሚዎች)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage civil service authorization roles across directorates.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
          Refresh Registry
        </button>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* ── User Permissions ── */}
      <div className="space-y-4 animate-fadeIn">
        {/* Search & Filter Bar */}
        <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search staff by name, email, or payroll ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <select aria-label="Filter users by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value as UserRole | 'ALL')}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800">
              <option value="ALL">All roles</option>
              {Object.values(UserRole).map(code => <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>)}
            </select>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="ALL">All Directorates ({departments.length})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {departmentLabel(d)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Users Permission Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[860px]">
              <thead>
                <tr className={table.headRow}>
                  <th className="py-3 px-4 min-w-[200px]">Civil Servant / User</th>
                  <th className="py-3 px-4 w-48 whitespace-nowrap">Official Email</th>
                  <th className="py-3 px-4 min-w-[180px]">Directorate / Dept</th>
                  <th className="py-3 px-4 w-48 whitespace-nowrap">Assigned Authorization Role</th>
                  <th className="py-3 px-4 text-right w-56 whitespace-nowrap">Update Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const dept = departments.find((d) => d.id === emp.departmentId);
                  const isUpdating = updatingId === emp.id;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-300">
                            {emp.fullNameEn.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{emp.fullNameEn}</p>
                            <p className="text-[10px] text-slate-500">{emp.fullNameAm}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{emp.email}</td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {dept ? departmentLabel(dept) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            emp.role === UserRole.MANAGER
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : emp.role === UserRole.DEPARTMENT_HEAD
                              ? 'bg-blue-100 text-blue-900 border-blue-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {emp.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={emp.role}
                            disabled={updatingId !== null || !canAssign}
                            aria-label={`Role for ${emp.fullNameEn}`}
                            onChange={(e) => handleRoleChange(emp.id, e.target.value as UserRole)}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 disabled:opacity-50 cursor-pointer"
                          >
                            <option value={UserRole.SYSTEM_ADMIN}>System Administrator</option>
                            <option value={UserRole.DATA_ENCODER}>Store Custodian / Encoder</option>
                            <option value={UserRole.TEAM_LEADER}>Team Leader</option>
                            <option value={UserRole.DEPARTMENT_HEAD}>Directorate Head / Approver</option>
                            <option value={UserRole.MANAGER}>Manager</option>
                          </select>
                          {isUpdating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredEmployees.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
