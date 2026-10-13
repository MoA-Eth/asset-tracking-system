import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Lock, LucideIcon } from 'lucide-react';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  /** Shown greyed out with a lock; `reason` explains why */
  disabled?: boolean;
  reason?: string;
  /** Hide the action entirely */
  hidden?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  /** Names the row for screen readers, e.g. the item code */
  label: string;
  /** For a form's menu rather than a row's: the button and the menu are named by this, e.g. "More actions" */
  heading?: string;
}

const MENU_WIDTH = 248;

/**
 * What an action is, from its label, so the menu can order and mark them without every caller saying so:
 * the steps of the work first, then looking and printing, with a destructive one set apart.
 */
const kindOf = (label: string): 'work' | 'look' | 'danger' => {
  if (/^(View|Print)\b/i.test(label)) return 'look';
  if (/^(Dispose|Delete|Remove)\b/i.test(label)) return 'danger';
  return 'work';
};

/**
 * "⋮" button that opens a row's actions (View, Edit, Print…), so tables don't need a wide Actions column.
 * The menu is drawn on top of the page, so a scrolling table can't clip it.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ actions, label, heading }) => {
  const visible = actions.filter((a) => !a.hidden);
  const rank = { work: 0, look: 1, danger: 2 } as const;
  // Stable: actions of the same kind keep the order the page gave them
  const ordered = [...visible].sort((a, b) => rank[kindOf(a.label)] - rank[kindOf(b.label)]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  // Place the menu under the button, right-aligned; open upwards near the bottom of the screen
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const up = r.bottom + 6 + menuH > window.innerHeight - 8 && r.top - 6 - menuH > 8;
    setPos({
      top: up ? r.top - 6 - menuH : r.bottom + 6,
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      up,
    });
  }, [open]);

  // Focus the first action that can be used
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [open, pos.top]);

  // Close on outside click, Escape, scroll or resize
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onMove = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  if (visible.length === 0) return null;

  // Arrow keys move between the actions that can be used
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return;
    if (e.key === 'Tab') return close(false);
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={heading ?? `Actions for ${label}`}
        title={heading ?? 'Actions'}
        className={`inline-flex h-8 w-8 rounded-[3px] items-center justify-center border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
          open
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-inner'
            : 'border-slate-200 bg-white text-slate-500 shadow-[0_1px_1px_rgba(15,23,42,0.05)] hover:border-emerald-300 hover:bg-emerald-50/70 hover:text-emerald-800'
        }`}
      >
        <MoreVertical className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={heading ?? `Actions for ${label}`}
            onKeyDown={onMenuKey}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] animate-fadeIn"
          >
            <div role="presentation" className="border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {heading ?? (
                <>
                  Actions · <span className="font-mono normal-case tracking-normal text-slate-700">{label}</span>
                </>
              )}
            </div>
            <div className="p-1">
              {ordered.map((a, i) => {
                const Icon = a.disabled ? Lock : a.icon;
                const kind = kindOf(a.label);
                const groupStarts = i > 0 && kindOf(ordered[i - 1].label) !== kind;
                return (
                  <React.Fragment key={a.label}>
                    {groupStarts && <div role="separator" className="my-1 border-t border-slate-100" />}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={a.disabled}
                      title={a.reason}
                      onClick={() => {
                        close(false);
                        a.onClick?.();
                      }}
                      className={`group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium transition focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent cursor-pointer ${
                        kind === 'danger'
                          ? 'text-rose-700 hover:bg-rose-50 focus:bg-rose-50'
                          : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 focus:bg-emerald-50 focus:text-emerald-900'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
                          a.disabled
                            ? 'bg-slate-100 text-slate-400'
                            : kind === 'danger'
                              ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-100'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800 group-focus:bg-emerald-100'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 self-center">
                        <span className="block whitespace-nowrap leading-snug">{a.label}</span>
                        {a.disabled && a.reason && (
                          <span className="mt-0.5 block whitespace-normal text-[10px] font-normal leading-snug text-slate-500">{a.reason}</span>
                        )}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
