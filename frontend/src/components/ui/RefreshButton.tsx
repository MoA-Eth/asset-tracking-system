import React from 'react';
import { RotateCw } from 'lucide-react';

interface RefreshButtonProps {
  onClick: () => void;
  /** Spins the arrow and blocks a second click while the list is being re-read */
  loading?: boolean;
  disabled?: boolean;
  /** What is re-read, for the tooltip and screen readers, e.g. "requests" */
  label?: string;
}

/** The one refresh control used on every list page: same size, icon and behaviour everywhere */
export const RefreshButton: React.FC<RefreshButtonProps> = ({ onClick, loading = false, disabled = false, label }) => {
  const text = label ? `Refresh ${label}` : 'Refresh';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={text}
      aria-busy={loading || undefined}
      title={text}
      className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
    >
      <RotateCw
        strokeWidth={2.25}
        className={`h-4 w-4 transition-transform duration-500 ${loading ? 'animate-spin text-emerald-700' : 'group-hover:rotate-90'}`}
      />
    </button>
  );
};
