import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Field, ReadOnlyValue, inputClass } from '../ui/FormKit';
import { StoreKeeper } from '../../types/asset-management';

interface StoreManFieldProps {
  id: string;
  label: string;
  /** The active store men of the store this request is about */
  keepers: StoreKeeper[];
  /** The store men have been loaded (so "none" is known to be none) */
  ready: boolean;
  /** Name of the store, for the message when it has none */
  storeName: string;
  /** Chosen employee id */
  value: string;
  onChange: (employeeId: string) => void;
  /** Whether a store has been picked yet (nothing to say before that) */
  hasStore?: boolean;
  /** When correcting a request: the name it already has, kept unless another is chosen */
  current?: string;
  /** Whether it has to be filled in (new requests); corrections may keep what they had */
  required?: boolean;
  hint?: string;
}

/**
 * Who in the store takes part in a request (receives, issues, takes back, or signs as storekeeper). It is always one of the
 * store's store men: the only one is chosen for you, several are a dropdown, and none is a plain message,
 * because a store without a store man can't do the work.
 */
export const StoreManField: React.FC<StoreManFieldProps> = ({
  id,
  label,
  keepers,
  ready,
  storeName,
  value,
  onChange,
  hasStore = true,
  current,
  required = true,
  hint,
}) => {
  // The only store man is chosen for you; a choice that no longer belongs to this store is dropped
  useEffect(() => {
    if (!ready) return;
    if (keepers.length === 1 && value !== keepers[0].employeeId) onChange(keepers[0].employeeId);
    else if (value && !keepers.some((k) => k.employeeId === value)) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, keepers.map((k) => k.employeeId).join(',')]);

  if (!hasStore) {
    return (
      <Field label={label} required={required} optional={!required} htmlFor={id} hint="Pick the store first.">
        <ReadOnlyValue>—</ReadOnlyValue>
      </Field>
    );
  }

  // A store with none carries on: the voucher names nobody, and administrators are reminded to assign one
  if (ready && keepers.length === 0) {
    return (
      <Field label={label} optional htmlFor={id} hint={`${storeName} has no store man assigned yet, so none is named on the voucher. Ask the System Administrator to add one in Settings → Stores.`}>
        <ReadOnlyValue>—</ReadOnlyValue>
      </Field>
    );
  }


  if (keepers.length === 1) {
    return (
      <Field label={label} required={required} hint={hint}>
        <ReadOnlyValue>{keepers[0].fullNameEn}</ReadOnlyValue>
      </Field>
    );
  }

  return (
    <Field label={label} required={required} optional={!required} htmlFor={id} hint={current && !value ? `Currently ${current}. Choose another to change it.` : hint}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass('emerald')} disabled={!ready}>
        <option value="">{ready ? (current ? `Keep ${current}` : 'Choose a store man…') : 'Loading…'}</option>
        {keepers.map((k) => (
          <option key={k.employeeId} value={k.employeeId}>
            {k.fullNameEn} ({k.payrollId})
          </option>
        ))}
      </select>
    </Field>
  );
};
