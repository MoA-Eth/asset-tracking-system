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
}

const MENU_WIDTH = 224;

/**
 * "⋮" button that opens a row's actions (View, Edit, Print…), so tables don't need a wide Actions column.
 * The menu is drawn on top of the page, so a scrolling table can't clip it.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ actions, label }) => {
  const visible = actions.filter((a) => !a.hidden);
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
        aria-label={`Actions for ${label}`}
        title="Actions"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          open
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800'
        }`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${label}`}
            onKeyDown={onMenuKey}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-[60] rounded-xl border border-slate-200 bg-white p-1 text-left shadow-[0_10px_30px_-8px_rgba(15,23,42,0.25)]"
          >
            {visible.map((a) => {
              const Icon = a.disabled ? Lock : a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  disabled={a.disabled}
                  title={a.reason}
                  onClick={() => {
                    close(false);
                    a.onClick?.();
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-900 focus:bg-emerald-50 focus:text-emerald-900 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent cursor-pointer"
                >
                  <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${a.disabled ? 'text-slate-400' : 'text-emerald-700'}`} />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap">{a.label}</span>
                    {a.disabled && a.reason && (
                      <span className="mt-0.5 block whitespace-normal text-[10px] font-normal leading-snug text-slate-500">{a.reason}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
};
