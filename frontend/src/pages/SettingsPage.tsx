import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  FileText,
  FileCheck,
  UserCheck,
  Sliders,
} from 'lucide-react';
import { api } from '../api/client';
import { UserRole, Employee, Department } from '../types/asset-management';
import { getSystemSettings, saveSystemSettings, AttachmentPolicy } from '../utils/system-settings';
import { useToast } from '../context/ToastContext';

interface SettingsPageProps {
  currentRole: UserRole;
  userEmail?: string;
  initialTab?: 'users' | 'policies';
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ initialTab = 'users' }) => {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'policies'>(initialTab);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // System Settings state
  const [attachmentPolicy, setAttachmentPolicy] = useState<AttachmentPolicy>(
    getSystemSettings().historicalDataAttachmentPolicy
  );

  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  const fetchData = async () => {
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
  }, []);

  const handleRoleChange = async (employeeId: string, newRole: UserRole) => {
    setUpdatingId(employeeId);
    setSuccessMsg(null);
    try {
      const updated = await api.updateEmployeeRole(employeeId, newRole);
      setEmployees((prev) => prev.map((emp) => (emp.id === employeeId ? updated : emp)));
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

  const handlePolicyChange = (policy: AttachmentPolicy) => {
    setAttachmentPolicy(policy);
    saveSystemSettings({ historicalDataAttachmentPolicy: policy });
    const isReq = policy === 'REQUIRED';
    const policyDesc = isReq
      ? 'Scanned IFMIS slip attachment is now MANDATORY for historical legacy stock-in data.'
      : 'Scanned IFMIS slip attachment is now OPTIONAL for historical legacy stock-in data.';
    setSuccessMsg(`Policy updated: ${policyDesc}`);
    toast.info('Store Policy Updated', policyDesc);
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      emp.fullNameEn.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.payrollId && emp.payrollId.toLowerCase().includes(q));
    const matchesDept = selectedDeptFilter === 'ALL' || emp.departmentId === selectedDeptFilter;
    return matchesSearch && matchesDept;
  });

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
              Department Head Settings
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Ministry of Agriculture Policy & Access Controls
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-700" />
            Settings — Governance & Policies (ቅንብሮች እና መመሪያዎች)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure system data policies and manage civil service authorization roles across directorates.
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

      {/* Sub-Menu Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'users'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>User Permissions & Roles</span>
        </button>

        <button
          onClick={() => setActiveSubTab('policies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'policies'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>System Settings</span>
        </button>
      </div>

      {/* ── Sub-Menu 1: User Permissions ── */}
      {activeSubTab === 'users' && (
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
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="ALL">All Directorates ({departments.length})</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Users Permission Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Civil Servant / User</th>
                    <th className="py-3 px-4">Official Email</th>
                    <th className="py-3 px-4">Directorate / Dept</th>
                    <th className="py-3 px-4">Assigned Authorization Role</th>
                    <th className="py-3 px-4 text-right">Update Role</th>
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
                          {dept ? `${dept.code} — ${dept.nameEn}` : 'Ministry HQ'}
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
                              disabled={isUpdating}
                              onChange={(e) => handleRoleChange(emp.id, e.target.value as UserRole)}
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 disabled:opacity-50 cursor-pointer"
                            >
                              <option value={UserRole.SYSTEM_ADMIN}>System Administrator</option>
                              <option value={UserRole.DATA_ENCODER}>Store Custodian / Encoder</option>
                              <option value={UserRole.TEAM_LEADER}>Team Leader</option>
                              <option value={UserRole.DEPARTMENT_HEAD}>Directorate Head / Approver</option>
                              <option value={UserRole.MANAGER}>General Manager</option>
                            </select>
                            {isUpdating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Menu 2: System Data Policies ── */}
      {activeSubTab === 'policies' && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-700" />
              Historical Legacy Data Attachment Policy (የቀድሞ መረጃዎች ፋይል መስፈርት)
            </h3>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Store Registration Rule
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <p className="text-xs font-bold text-slate-900">
                  IFMIS Scanned Slip Attachment for Historical Stock-In
                </p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Define whether Store Custodians must upload a scanned IFMIS delivery slip when checking the{' '}
                <strong className="text-slate-800">"Historical Legacy Data"</strong> checkbox during Stock-In registration.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-300">
              <button
                onClick={() => handlePolicyChange('OPTIONAL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  attachmentPolicy === 'OPTIONAL'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Optional (ተመራጭ)
              </button>
              <button
                onClick={() => handlePolicyChange('REQUIRED')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  attachmentPolicy === 'REQUIRED'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Mandatory / Required (ግዴታ)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
