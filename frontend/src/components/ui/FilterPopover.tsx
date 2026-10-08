import React, { useEffect, useRef, useState } from 'react';
import { ListFilter, X, ChevronDown } from 'lucide-react';

export interface FilterPopoverProps {
  label?: string;
  iconOnly?: boolean;
  ariaLabel?: string;
  title?: string;
  activeCount?: number;
  onReset?: () => void;
  /** What the Clear button beside the trigger does; defaults to onReset. Use it to also clear search or sort. */
  onClear?: () => void;
  /** Whether the Clear button shows; defaults to "any filter in the popover is active" */
  showClear?: boolean;
  resetLabel?: string;
  resultCountText?: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  triggerId?: string;
}

/**
 * Clean, accessible filter popover card designed for MoA-ATS enterprise tables.
 * Matches official MoA design system with ListFilter icon and clean card layout.
 */
export const FilterPopover: React.FC<FilterPopoverProps> = ({
  label = 'Filter',
  iconOnly = false,
  ariaLabel,
  title = 'Filters',
  activeCount = 0,
  onReset,
  onClear,
  showClear,
  resetLabel = 'Reset all',
  resultCountText,
  children,
  align = 'right',
  className = '',
  triggerId = 'filter-popover-button',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const hasActive = activeCount > 0;
  const clear = onClear ?? onReset;
  const clearShown = !!clear && (showClear ?? hasActive);
  const showText = !iconOnly && !!label;
  const accessibleLabel = ariaLabel || label || title || 'Filter assets';

  return (
    <div className={`relative inline-flex items-center gap-1.5 text-left ${className}`} ref={popoverRef}>
      {/* Trigger Button - exactly matching [ <ListFilter> Filter ] */}
      <button
        ref={buttonRef}
        type="button"
        id={triggerId}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${accessibleLabel}${hasActive ? ` (${activeCount} active)` : ''}`}
        title={accessibleLabel}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center justify-center gap-1.5 ${
          showText ? 'px-3.5 py-1.5 text-xs' : 'px-2.5 py-1.5 h-8'
        } rounded-xl border font-semibold transition cursor-pointer select-none shadow-2xs ${
          hasActive || isOpen
            ? 'border-emerald-700/60 bg-emerald-50/80 text-emerald-950 shadow-xs ring-1 ring-emerald-600/20'
            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900'
        }`}
      >
        <ListFilter className={`w-3.5 h-3.5 shrink-0 transition-colors ${hasActive || isOpen ? 'text-emerald-800' : 'text-slate-700'}`} />
        {showText && <span>{label}</span>}
        {hasActive && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0B3D25] px-1 text-[10px] font-bold text-white leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* Clear sits beside the trigger, so filters can be removed without opening the popover */}
      {clearShown && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear filters"
          title="Clear all filters"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer select-none"
        >
          <X className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      )}

      {/* Popover card: just the controls. Filters apply as you change them, so there is nothing to confirm;
          Escape or a click outside closes it. */}
      <div
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 w-[min(22rem,calc(100vw-2rem))] z-50 rounded-xl border border-slate-200 bg-white p-4 shadow-lg animate-fadeIn ${
          isOpen ? '' : 'hidden'
        }`}
        aria-label={title}
      >
        <div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto">{children}</div>

        {(resultCountText || (hasActive && onReset)) && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
            <span className="truncate text-slate-500">{resultCountText ? `Showing ${resultCountText}` : ''}</span>
            {hasActive && onReset && (
              <button
                type="button"
                onClick={onReset}
                title="Reset all filters"
                className="shrink-0 font-medium text-slate-600 transition hover:text-rose-700 hover:underline cursor-pointer"
              >
                {resetLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Reusable Section component for items inside FilterPopover
 */
export const FilterSection: React.FC<{
  label: string;
  htmlFor?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, badge, children, className = '' }) => (
  <div className={className}>
    <div className="mb-1.5 flex items-center justify-between">
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700">
        {label}
      </label>
      {badge && <span className="text-[10px] text-slate-400 font-medium">{badge}</span>}
    </div>
    {children}
  </div>
);

/**
 * Clean Select dropdown helper for filters
 */
export const FilterSelect: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  ariaLabel?: string;
}> = ({ id, value, onChange, options, placeholder, ariaLabel }) => (
  <div className="relative">
    <select
      id={id}
      aria-label={ariaLabel || placeholder || 'Select option'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-3 pr-8 text-xs text-slate-800 transition hover:bg-slate-50 focus:border-[#0B3D25] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0B3D25]/20 cursor-pointer"
    >
      {placeholder && <option value="ALL">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
  </div>
);

/**
 * Pill button helper for segmented filter options (e.g. status)
 */
export const FilterPill: React.FC<{
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer select-none ${
      active
        ? 'bg-[#0B3D25] text-white shadow-xs'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900'
    }`}
  >
    <span>{label}</span>
    {typeof count === 'number' && (
      <>
        {' '}
        <span
          className={`text-[10px] font-mono rounded px-1 py-0.2 leading-tight ${
            active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {count}
        </span>
      </>
    )}
  </button>
);

export default FilterPopover;

