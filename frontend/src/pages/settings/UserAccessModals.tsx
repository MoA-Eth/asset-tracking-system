import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw, Wand2 } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Field, FormError, FormNotice, inputClass } from '../../components/ui/FormKit';
import { PASSWORD_RULE, isAcceptablePassword } from '../../components/auth/ChangePasswordForm';
import { useToast } from '../../context/ToastContext';
import { Employee, UserRole } from '../../types/asset-management';

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
  [UserRole.DATA_ENCODER]: 'Data Encoder',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.DEPARTMENT_HEAD]: 'Department Head',
  [UserRole.MANAGER]: 'Manager',
};

/** A random temporary password: 10 letters and digits, without look-alikes such as 0/O and 1/l */
export function makeTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string, n: number) => {
    const bytes = new Uint32Array(n);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => set[b % set.length]);
  };
  const chars = [...pick(letters, 7), ...pick(digits, 3)];
  // Shuffle so the digits aren't always at the end
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  return chars
    .map((c, i) => [order[i], c] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c)
    .join('');
}

/** Temporary password box with a "Generate" button; the administrator passes it on to the person */
const TemporaryPasswordField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const toast = useToast();
  return (
    <Field label="Temporary password" required htmlFor="temp-password" hint={`${PASSWORD_RULE} They must choose their own at first sign-in.`}>
      <div className="flex gap-2">
        <input
          id="temp-password"
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass('emerald', { mono: true })}
        />
        <button
          type="button"
          onClick={() => onChange(makeTemporaryPassword())}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
        >
          <Wand2 className="h-3.5 w-3.5 text-emerald-700" />
          Generate
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Copied', 'The temporary password is on your clipboard.'))}
          aria-label="Copy the temporary password"
          title="Copy"
          className="flex shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </Field>
  );
};

const Footer: React.FC<{ submitting: boolean; label: string; disabled?: boolean; onCancel: () => void }> = ({ submitting, label, disabled, onCancel }) => (
  <div className="flex justify-end gap-2 pt-1">
    <button
      type="button"
      onClick={onCancel}
      className="rounded-[3px] border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={submitting || disabled}
      className="flex items-center gap-2 rounded-[3px] bg-emerald-700 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 cursor-pointer"
    >
      {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      {label}
    </button>
  </div>
);

/** Give an employee sign-in: pick them from the staff list, choose a role, set a temporary password */
export const AddUserModal: React.FC<{
  isOpen: boolean;
  /** The registered employees; all active ones are listed, and those who already sign in can't be picked */
  employees: Employee[];
  onClose: () => void;
  onSaved: (updated: Employee) => void;
}> = ({ isOpen, employees, onClose, onSaved }) => {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every active registered employee (Settings → Employees) is listed, so the list matches the Employees page.
  // Those who don't sign in yet can be picked; those who already do are shown, but can't be added twice.
  const { candidates, existing } = useMemo(() => {
    const active = employees.filter((e) => e.isActive).sort((a, b) => a.fullNameEn.localeCompare(b.fullNameEn));
    return { candidates: active.filter((e) => !e.role), existing: active.filter((e) => !!e.role) };
  }, [employees]);
  const total = candidates.length + existing.length;
  // Searching matches the name (English or Amharic) and the employee ID
  const employeeGroups = useMemo(
    () => [
      {
        label: 'Can be added',
        options: candidates.map((e) => ({ value: e.id, label: `${e.fullNameEn} (${e.payrollId})`, note: e.fullNameAm || undefined })),
      },
      {
        label: 'Already users',
        options: existing.map((e) => ({ value: e.id, label: `${e.fullNameEn} (${e.payrollId})`, note: ROLE_LABELS[e.role as UserRole], disabled: true })),
      },
    ],
    [candidates, existing],
  );

  const close = () => {
    setEmployeeId('');
    setRole('');
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isAcceptablePassword(password)) return setError(`The temporary password needs: ${PASSWORD_RULE.toLowerCase()}`);
    setSubmitting(true);
    try {
      const updated = await api.grantAccess(employeeId, role as UserRole, password);
      toast.success('User added', `${updated.fullNameEn} can sign in as ${ROLE_LABELS[role as UserRole]}.`);
      onSaved(updated);
      close();
    } catch (err: any) {
      setError(err.message || 'Sign-in could not be given.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Add user" subtitle="Let an employee sign in. Employees are added under Settings → Employees." size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Employee"
          required
          htmlFor="add-user-employee"
          hint={
            candidates.length === 0
              ? `All ${total} registered employees already sign in. Add staff under Settings → Employees first.`
              : `${total} registered employees: ${candidates.length} can be added, ${existing.length} already sign in.`
          }
        >
          <SearchableSelect
            id="add-user-employee"
            value={employeeId}
            onChange={setEmployeeId}
            groups={employeeGroups}
            placeholder="Select an employee…"
            searchPlaceholder="Type a name or employee ID…"
          />
        </Field>
        <Field label="Role" required htmlFor="add-user-role">
          <select id="add-user-role" required value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass('emerald')}>
            <option value="">Select…</option>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <TemporaryPasswordField value={password} onChange={setPassword} />
        <FormNotice icon={CheckCircle2}>
          They sign in with their employee ID (or email, if they have one) and this temporary password, then choose their own.
        </FormNotice>
        <FormError message={error} />
        <Footer submitting={submitting} label="Add user" disabled={!employeeId || !role || !password} onCancel={close} />
      </form>
    </Modal>
  );
};

/** Set a new temporary password for someone who signs in */
export const ResetPasswordModal: React.FC<{ employee: Employee | null; onClose: () => void; onSaved: (updated: Employee) => void }> = ({
  employee,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setError(null);
    if (!isAcceptablePassword(password)) return setError(`The temporary password needs: ${PASSWORD_RULE.toLowerCase()}`);
    setSubmitting(true);
    try {
      const updated = await api.resetEmployeePassword(employee.id, password);
      toast.success('Password reset', `${updated.fullNameEn} must choose a new password at next sign-in.`);
      onSaved(updated);
      close();
    } catch (err: any) {
      setError(err.message || 'The password could not be reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={!!employee} onClose={close} title={`Reset password for ${employee?.fullNameEn ?? ''}`} subtitle="Their current password stops working straight away." size="md">
      <form onSubmit={submit} className="space-y-4">
        <TemporaryPasswordField value={password} onChange={setPassword} />
        <FormError message={error} />
        <Footer submitting={submitting} label="Reset password" disabled={!password} onCancel={close} />
      </form>
    </Modal>
  );
};
