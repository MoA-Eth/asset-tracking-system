/**
 * One look for every page. MoA green is the only action color; other colors only describe status.
 * Pages are told apart by their icon and title, not by button colors.
 */

/** Buttons */
export const btn = {
  /** Main action of a page, e.g. "Register goods received", "Issue asset" */
  primary:
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-[3px] shadow-xs transition active:scale-95 cursor-pointer shrink-0',
  /** Second action next to the main one, e.g. "Return to store" beside "New transfer" */
  secondary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border border-slate-300 hover:border-emerald-300 font-bold text-xs rounded-[3px] shadow-xs transition active:scale-95 cursor-pointer shrink-0',
  /** Small action inside a table row: Edit, Print, Return… */
  row: 'inline-flex items-center justify-center gap-1 px-2 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 hover:border-emerald-300 rounded-[3px] text-[11px] font-bold transition cursor-pointer whitespace-nowrap',
  /** Icon inside a row action */
  rowIcon: 'w-3.5 h-3.5 text-emerald-700',
  /** Row action that isn't available right now (the reason goes in its title) */
  rowLocked:
    'inline-flex items-center justify-center gap-1 px-2 py-1 bg-slate-50 text-slate-400 border border-slate-200 rounded-[3px] text-[11px] font-bold cursor-not-allowed whitespace-nowrap',
  /** Active tab in a page's tab switcher */
  tabActive: 'bg-emerald-700 text-white shadow-xs',
} as const;

/** Tables */
export const table = {
  /** Header row: small uppercase labels on a light background */
  headRow: 'bg-slate-50 border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600',
  /** Body row */
  row: 'hover:bg-slate-50 transition',
  /** Row just created or updated by the user */
  rowHighlight: 'bg-emerald-50/80 border-l-4 border-emerald-600',
  /** Item / tracking code cell text: plain, set apart only by the monospace font */
  code: 'font-mono font-bold text-slate-800',
  /** Actions column ("⋮"), pinned to the right edge so it stays visible when the table scrolls */
  actionsHead: 'sticky right-0 z-[1] bg-slate-50 w-12 text-right',
  actionsCell: 'sticky right-0 z-[1] bg-white w-12 text-right whitespace-nowrap shadow-[-10px_0_10px_-10px_rgba(15,23,42,0.18)]',
  /** Search box above a table */
  search:
    'w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500',
} as const;

/** Status colors, shared by every badge and chip */
export type StatusTone = 'inStore' | 'issued' | 'partly' | 'pending' | 'approved' | 'rejected' | 'neutral';

export const statusTone: Record<StatusTone, string> = {
  /** Units in store / available */
  inStore: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  /** Units with custodians */
  issued: 'bg-blue-100 text-blue-800 border-blue-200',
  /** Some units out, the rest in store */
  partly: 'bg-sky-100 text-sky-800 border-sky-200',
  /** Waiting for approval, a pending request, or being transferred */
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  /** A request that was approved */
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  /** A request that was rejected */
  rejected: 'bg-red-100 text-red-800 border-red-200',
  /** Disposed or unknown */
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** Shape shared by status badges */
export const pill = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap';
