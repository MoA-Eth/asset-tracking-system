import React from 'react';
import { Lock } from 'lucide-react';
import { RowAction } from './RowActionsMenu';

/** A form's own action in its header, beside the close button, e.g. "Import items" */
export const HeaderActionButton: React.FC<{ action: RowAction }> = ({ action }) => {
  if (action.hidden) return null;
  const Icon = action.disabled ? Lock : action.icon;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.reason}
      className="inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,0.05)] transition hover:border-emerald-300 hover:bg-emerald-50/70 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700 cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5" />
      {action.label}
    </button>
  );
};
