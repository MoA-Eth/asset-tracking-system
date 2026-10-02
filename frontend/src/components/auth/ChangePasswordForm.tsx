import React, { useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { Field, FormError, inputClass } from '../ui/FormKit';

export const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';

/** True when the password meets the rule the server enforces */
export const isAcceptablePassword = (value: string) => value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);

/**
 * Lets a signed-in person replace their own password.
 * Used on the screen shown after a temporary password, and from the sidebar.
 */
export const ChangePasswordForm: React.FC<{
  onDone: () => void;
  onCancel?: () => void;
  /** Label of the current-password field: a temporary password reads better as such */
  temporary?: boolean;
}> = ({ onDone, onCancel, temporary }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isAcceptablePassword(next)) return setError(`Your new password needs: ${PASSWORD_RULE.toLowerCase()}`);
    if (next !== confirm) return setError('The two new passwords are not the same.');
    if (next === current) return setError('Choose a password that is different from your current one.');
    setSubmitting(true);
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err: any) {
      setError(err.message || 'The password could not be changed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={temporary ? 'Temporary password' : 'Current password'} required htmlFor="pw-current">
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClass('emerald')}
          autoFocus
        />
      </Field>
      <Field label="New password" required htmlFor="pw-new" hint={PASSWORD_RULE}>
        <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass('emerald')} />
      </Field>
      <Field label="New password again" required htmlFor="pw-confirm">
        <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass('emerald')} />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !current || !next || !confirm}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 cursor-pointer"
        >
          {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Change password
        </button>
      </div>
    </form>
  );
};
