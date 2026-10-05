import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Shield,
  Users,
  CheckCircle2,
  MinusCircle,
  ArrowUpRight,
  RefreshCw,
  LockKeyhole,
  AlertCircle,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Save,
  Lock,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { RefreshButton } from '../../components/ui/RefreshButton';
import { Department, Employee, RoleDirectory, UserRole } from '../../types/asset-management';

interface RolesPageProps {
  onViewUsers: (role: UserRole) => void;
}

const PROTECTED_CORE_PERMISSIONS: Partial<Record<string, string[]>> = {
  SYSTEM_ADMIN: ['roles.assign', 'roles.read'],
};

export const RolesPage: React.FC<RolesPageProps> = ({ onViewUsers }) => {
  const { user, refreshSession } = useAuth();
  const canView = user?.permissions?.includes('roles.read') ?? false;
  const canAssign = user?.permissions?.includes('roles.assign') ?? false;

  // Safe toast helper in case rendered outside ToastProvider
  let toast: ReturnType<typeof useToast> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    toast = useToast();
  } catch {
    toast = null;
  }

  const [directory, setDirectory] = useState<RoleDirectory | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetTargetRole, setResetTargetRole] = useState<UserRole | null>(null);

  // Dynamic staged permissions: roleCode -> array of active permission keys
  const [stagedPermissions, setStagedPermissions] = useState<Record<string, string[]>>({});

  const requestId = useRef(0);
  const detailRef = useRef<HTMLElement>(null);

  const load = async () => {
    if (!canView) return;
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [roles, members, depts] = await Promise.all([
        api.getRoles(),
        api.getEmployees(),
        api.getDepartments(),
      ]);
      if (current !== requestId.current) return;
      setDirectory(roles);
      setEmployees(members);
      setDepartments(depts);

      // Initialize staged permissions from server directory
      const initial: Record<string, string[]> = {};
      roles.roles.forEach((r) => {
        initial[r.code] = [...r.permissions];
      });
      setStagedPermissions(initial);
    } catch (err: any) {
      if (current === requestId.current) {
        setError(err.message || 'Unable to load roles. Please try again.');
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [canView]);

  useEffect(() => {
    if (selected) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);

  const roles = directory?.roles ?? [];
  const permissionGroups = directory?.permissionGroups ?? [];

  // Calculate pending diffs across all roles
  const diffSummary = useMemo(() => {
    if (!directory) return [];
    return directory.roles
      .map((role) => {
        const original = new Set(role.permissions);
        const current = new Set(stagedPermissions[role.code] ?? role.permissions);

        const added = Array.from(current).filter((p) => !original.has(p));
        const revoked = Array.from(original).filter((p) => !current.has(p));

        return {
          role,
          added,
          revoked,
          hasDiff: added.length > 0 || revoked.length > 0,
        };
      })
      .filter((d) => d.hasDiff);
  }, [directory, stagedPermissions]);

  const totalUnsavedChanges = useMemo(() => {
    return diffSummary.reduce((sum, d) => sum + d.added.length + d.revoked.length, 0);
  }, [diffSummary]);

  const isPermissionProtected = (roleCode: string, permissionKey: string) => {
    return PROTECTED_CORE_PERMISSIONS[roleCode]?.includes(permissionKey) ?? false;
  };

  const togglePermission = (roleCode: string, permissionKey: string) => {
    if (!canAssign) return;
    if (isPermissionProtected(roleCode, permissionKey)) return;

    setStagedPermissions((prev) => {
      const currentList = prev[roleCode] ? [...prev[roleCode]] : [];
      const hasPerm = currentList.includes(permissionKey);
      const updated = hasPerm
        ? currentList.filter((k) => k !== permissionKey)
        : [...currentList, permissionKey];
      return { ...prev, [roleCode]: updated };
    });
  };

  const discardChanges = () => {
    if (!directory) return;
    const reverted: Record<string, string[]> = {};
    directory.roles.forEach((r) => {
      reverted[r.code] = [...r.permissions];
    });
    setStagedPermissions(reverted);
    toast?.info('Changes Discarded', 'Reverted permission changes to saved state.');
  };

  const saveAllChanges = async () => {
    if (!canAssign || diffSummary.length === 0) return;
    setSaving(true);
    try {
      let latestDirectory: RoleDirectory = directory!;
      for (const diff of diffSummary) {
        const perms = stagedPermissions[diff.role.code] ?? diff.role.permissions;
        latestDirectory = await api.updateRolePermissions(diff.role.code as UserRole, perms);
      }
      setDirectory(latestDirectory);
      const synced: Record<string, string[]> = {};
      latestDirectory.roles.forEach((r) => {
        synced[r.code] = [...r.permissions];
      });
      setStagedPermissions(synced);
      setShowConfirmModal(false);
      await refreshSession();
      window.dispatchEvent(new Event('moa_access_changed'));
      toast?.success('Permissions Saved', `Updated permissions across ${diffSummary.length} roles.`);
    } catch (err: any) {
      toast?.error('Failed to Save Permissions', err.message || 'Server rejected permission changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async (roleCode: UserRole) => {
    if (!canAssign) return;
    setSaving(true);
    try {
      const updated = await api.resetRolePermissions(roleCode);
      setDirectory(updated);
      setStagedPermissions((prev) => ({
        ...prev,
        [roleCode]: [...(updated.roles.find((r) => r.code === roleCode)?.permissions ?? [])],
      }));
      setResetTargetRole(null);
      await refreshSession();
      window.dispatchEvent(new Event('moa_access_changed'));
      toast?.success('Role Reset', `Restored ${roleCode} to baseline statutory policy.`);
    } catch (err: any) {
      toast?.error('Reset Failed', err.message || 'Unable to reset role.');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <p role="alert" className="text-sm text-slate-600">
        Only System Administrators can view the role directory.
      </p>
    );
  }

  const filtered = roles;
  const selectedRole = roles.find((role) => role.code === selected);
  const members = employees.filter((employee) => employee.role === selected);

  // Helper to resolve permission label from key
  const getPermissionLabel = (key: string) => {
    for (const g of permissionGroups) {
      const found = g.permissions.find((p) => p.key === key);
      if (found) return found.label;
    }
    return key;
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
        <p className="text-xs text-slate-500">
          What each role is allowed to do. Switch a permission on or off, then save; every change is recorded in the audit log.
        </p>
      </header>

      {loading ? (
        <div role="status" className="flex justify-center items-center gap-2 py-24 text-sm text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
          Loading roles and permission matrix…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-3">
          <p className="font-semibold text-red-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Unable to load roles
          </p>
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="outline" onClick={load}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/* Unsaved changes: the only place to save or discard, kept in view while scrolling */}
          {totalUnsavedChanges > 0 && (
            <div role="status" className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-sm animate-fadeIn">
              <span className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {totalUnsavedChanges} unsaved {totalUnsavedChanges === 1 ? 'change' : 'changes'} in {diffSummary.length} {diffSummary.length === 1 ? 'role' : 'roles'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={discardChanges} disabled={saving}>
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  onClick={() => setShowConfirmModal(true)}
                  disabled={saving}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  Save changes ({totalUnsavedChanges})
                </Button>
              </div>
            </div>
          )}

          {/* Permission Matrix Section */}
          <section aria-label="System roles" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-5 py-2.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Allowed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                Not allowed
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-slate-400" />
                Always on, so administrators can't lock themselves out
              </span>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="w-[260px] px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 align-bottom">
                      Permission
                    </th>
                    {filtered.map((role) => {
                      const isSelected = selected === role.code;
                      const hasPendingDiff = diffSummary.some((d) => d.role.code === role.code);
                      return (
                        <th
                          key={role.code}
                          scope="col"
                          className={`px-3 py-3 min-w-[128px] text-center align-bottom transition-colors border-l border-slate-200/60 ${
                            isSelected ? 'bg-emerald-50/70' : ''
                          }`}
                        >
                          <button
                            onClick={() => setSelected(isSelected ? null : role.code)}
                            aria-label={`View ${role.name} details`}
                            aria-expanded={isSelected}
                            aria-controls={isSelected ? 'role-details' : undefined}
                            title={role.description}
                            className={`inline-flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                              isSelected ? 'text-emerald-800' : 'text-slate-900 hover:text-emerald-700'
                            }`}
                          >
                            {role.name}
                            {hasPendingDiff && <span title="Has unsaved changes" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                            <ChevronRight className={`h-3 w-3 text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                          </button>
                          <button
                            onClick={() => onViewUsers(role.code)}
                            aria-label={`View ${role.memberCount} ${role.name} users`}
                            title="Open these users on the Users page"
                            className="mt-0.5 flex w-full items-center justify-center gap-1 text-[11px] font-normal text-slate-500 hover:text-emerald-700 cursor-pointer"
                          >
                            <Users className="h-3 w-3" />
                            {role.memberCount} {role.memberCount === 1 ? 'user' : 'users'}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No roles to show.
                      </td>
                    </tr>
                  ) : (
                    permissionGroups.map((group) => (
                      <React.Fragment key={group.name}>
                        {/* Group Header Row */}
                        <tr className="bg-slate-50">
                          <td colSpan={filtered.length + 1} className="px-5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {group.name}
                          </td>
                        </tr>

                        {/* Permission Rows */}
                        {group.permissions.map((permission) => (
                          <tr key={permission.key} className="hover:bg-slate-50/80 transition-colors">
                            <th scope="row" className="px-5 py-2 text-xs font-medium text-slate-800 align-middle">
                              {permission.label}
                            </th>
                            {filtered.map((role) => {
                              const rolePerms = stagedPermissions[role.code] ?? role.permissions;
                              const allowed = rolePerms.includes(permission.key);
                              const isSelected = selected === role.code;
                              const isProtected = isPermissionProtected(role.code, permission.key);
                              const originalAllowed = role.permissions.includes(permission.key);
                              const isDirty = allowed !== originalAllowed;

                              return (
                                <td
                                  key={role.code}
                                  className={`px-3 py-2 text-center align-middle border-l border-slate-100 transition-colors ${
                                    isSelected ? 'bg-emerald-50/50' : ''
                                  } ${isDirty ? 'bg-amber-50/30' : ''}`}
                                >
                                  {isProtected ? (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                                      <Lock className="w-3 h-3 text-slate-500" />
                                      <span>Core</span>
                                      <span className="sr-only">: Allowed</span>
                                    </div>
                                  ) : (
                                    <div className="inline-flex flex-col items-center gap-1">
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={allowed}
                                        aria-label={`${allowed ? 'Revoke' : 'Grant'} ${permission.label} for ${role.name}`}
                                        disabled={!canAssign || saving}
                                        onClick={() => togglePermission(role.code, permission.key)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
                                          allowed ? 'bg-emerald-600' : 'bg-slate-200'
                                        } ${isDirty ? 'ring-2 ring-amber-400' : ''} ${
                                          !canAssign ? 'cursor-not-allowed opacity-75' : ''
                                        }`}
                                      >
                                        <span className="sr-only">{allowed ? 'Allowed' : 'Not allowed'}</span>
                                        <span
                                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                                            allowed ? 'translate-x-5' : 'translate-x-0'
                                          }`}
                                        >
                                          {allowed ? (
                                            <Check className="w-3 h-3 text-emerald-700" strokeWidth={3} />
                                          ) : (
                                            <X className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
                                          )}
                                        </span>
                                      </button>
                                      {isDirty && (
                                        <span className="text-[9px] font-bold text-amber-700 uppercase tracking-tighter">
                                          {allowed ? '+ Added' : '- Removed'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Detailed Role Inspector Panel */}
          {selectedRole && (
            <section
              id="role-details"
              ref={detailRef}
              role="region"
              tabIndex={-1}
              aria-label={`${selectedRole.name} details`}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-all animate-fadeIn"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedRole.name}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedRole.description}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedRole.approvalResponsibility}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canAssign && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResetTargetRole(selectedRole.code as UserRole)}
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      title="Put this role's permissions back to the built-in defaults"
                    >
                      Reset to defaults
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onViewUsers(selectedRole.code)} rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                    Manage assignments
                  </Button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.4fr_1fr]">
                {/* Permissions Breakdown */}
                <div className="p-5 space-y-5 lg:border-r border-slate-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Permissions</h4>
                    <span className="text-xs text-slate-400">
                      {(stagedPermissions[selectedRole.code] ?? selectedRole.permissions).length} allowed
                    </span>
                  </div>
                  {directory?.permissionGroups.map((group) => (
                    <div key={group.name}>
                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        {group.name}
                      </h5>
                      <ul className="space-y-2">
                        {group.permissions.map((permission) => {
                          const activeList = stagedPermissions[selectedRole.code] ?? selectedRole.permissions;
                          const allowed = activeList.includes(permission.key);
                          const Icon = allowed ? CheckCircle2 : MinusCircle;
                          return (
                            <li
                              key={permission.key}
                              className={`flex gap-2 text-xs items-start ${
                                allowed ? 'text-slate-800' : 'text-slate-400'
                              }`}
                            >
                              <Icon
                                aria-hidden="true"
                                className={`w-4 h-4 shrink-0 ${
                                  allowed ? 'text-emerald-600' : 'text-slate-300'
                                }`}
                              />
                              <span>
                                {permission.label}
                                <span className="sr-only">: {allowed ? 'Allowed' : 'Not allowed'}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Assigned Users */}
                <div className="p-5 border-t lg:border-t-0 border-slate-200">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">
                    Assigned users <span className="text-slate-400 font-normal">({members.length})</span>
                  </h4>
                  {members.length ? (
                    <ul className="divide-y divide-slate-100">
                      {members.slice(0, 6).map((member) => (
                        <li key={member.id} className="py-3 first:pt-0">
                          <p className="text-xs font-semibold text-slate-900">{member.fullNameEn}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {departments.find((dept) => dept.id === member.departmentId)?.nameEn ||
                              'Department unavailable'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 break-all">{member.email}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 py-5">No users are assigned to this role.</p>
                  )}
                  <button
                    className="text-xs text-emerald-700 font-semibold mt-4 hover:underline inline-flex items-center gap-1"
                    onClick={() => onViewUsers(selectedRole.code)}
                  >
                    View users in this role
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Confirmation Modal for Permission Changes */}
          <Modal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            title="Confirm Permission Changes"
            subtitle="The following modifications will be written to institutional policy and logged in the audit registry."
            size="md"
          >
            <div className="space-y-4">
              <div className="max-h-72 overflow-y-auto space-y-4 pr-1 divide-y divide-slate-100">
                {diffSummary.map((diff) => (
                  <div key={diff.role.code} className="pt-3 first:pt-0">
                    <p className="text-xs font-bold text-slate-900 mb-2">{diff.role.name}</p>
                    <div className="space-y-1.5 pl-2 text-xs">
                      {diff.added.map((permKey) => (
                        <div key={permKey} className="flex items-center gap-2 text-emerald-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          <span>+ Granted: {getPermissionLabel(permKey)}</span>
                        </div>
                      ))}
                      {diff.revoked.map((permKey) => (
                        <div key={permKey} className="flex items-center gap-2 text-red-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <span>- Revoked: {getPermissionLabel(permKey)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                <LockKeyhole className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Action will be authorized by <strong>{user?.fullNameEn || 'System Administrator'}</strong> and recorded with Ethiopian and Gregorian calendar timestamps.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={saveAllChanges}
                  disabled={saving}
                  leftIcon={saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {saving ? 'Applying Changes…' : 'Confirm & Apply'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Reset Role to Defaults Modal */}
          {resetTargetRole && (
            <Modal
              isOpen={Boolean(resetTargetRole)}
              onClose={() => setResetTargetRole(null)}
              title="Reset Role to Statutory Defaults"
              subtitle={`Are you sure you want to reset ${resetTargetRole} to official Ministry baseline permissions?`}
              size="sm"
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  This will discard all custom capability overrides for this role and restore the statutory policy defined under Federal Property Administration rules.
                </p>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <Button variant="outline" onClick={() => setResetTargetRole(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleResetToDefault(resetTargetRole)}
                    disabled={saving}
                    className="bg-red-700 hover:bg-red-800 text-white"
                    leftIcon={saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  >
                    {saving ? 'Resetting…' : 'Confirm Reset'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
};
