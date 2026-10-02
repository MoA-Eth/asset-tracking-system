import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { btn, pill, statusTone } from '../../components/ui/theme';

/** Shared pieces of the Departments, Locations and Stores pages */

export type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

export const matchesStatus = (isActive: boolean, filter: StatusFilter) =>
  filter === 'ALL' || (filter === 'ACTIVE' ? isActive : !isActive);

/** Active / Deactivated / All switch above a table */
export const StatusTabs: React.FC<{ value: StatusFilter; onChange: (v: StatusFilter) => void; active: number; inactive: number }> = ({
  value,
  onChange,
  active,
  inactive,
}) => (
  <div role="group" aria-label="Filter by status" className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
    {(
      [
        ['ACTIVE', `Active (${active})`],
        ['INACTIVE', `Deactivated (${inactive})`],
        ['ALL', 'All'],
      ] as [StatusFilter, string][]
    ).map(([key, label]) => (
      <button
        key={key}
        type="button"
        aria-pressed={value === key}
        onClick={() => onChange(key)}
        className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${value === key ? btn.tabActive : 'text-slate-600 hover:text-slate-900'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const ActivePill: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`${pill} ${active ? statusTone.inStore : statusTone.neutral}`}>{active ? 'Active' : 'Deactivated'}</span>
);

/** Asks before deactivating, reactivating or deleting */
export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  /** Red button for deactivate / delete */
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ isOpen, title, confirmLabel, danger, busy, onConfirm, onClose, children }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-600">{children}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition disabled:bg-slate-300 cursor-pointer ${
            danger ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-700 hover:bg-emerald-800'
          }`}
        >
          {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);
