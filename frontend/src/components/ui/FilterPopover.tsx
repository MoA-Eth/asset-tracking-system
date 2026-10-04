import React, { useEffect, useRef, useState } from 'react';
import { ListFilter, X, RotateCcw, Check, ChevronDown } from 'lucide-react';

export interface FilterPopoverProps {
  label?: string;
  iconOnly?: boolean;
  ariaLabel?: string;
  title?: string;
  activeCount?: number;
  onReset?: () => void;
  resetLabel?: string;
  resultCountText?: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  triggerId?: string;
}

/**
 * Clean, accessible filter popover card designed for MoA-AMS enterprise tables.
 * Matches official MoA design system with ListFilter icon and clean card layout.
 */
export const FilterPopover: React.FC<FilterPopoverProps> = ({
  label = 'Filter',
  iconOnly = false,
  ariaLabel,
  title = 'Filters',
  activeCount = 0,
  onReset,
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
  const showText = !iconOnly && !!label;
  const accessibleLabel = ariaLabel || label || title || 'Filter assets';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={popoverRef}>
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

      {/* Popover Dropdown Card */}
      <div
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 w-80 sm:w-[360px] z-50 rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/12 animate-fadeIn overflow-hidden ${
          isOpen ? '' : 'hidden'
        }`}
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-100/60 border border-emerald-300/40 flex items-center justify-center text-emerald-800">
              <ListFilter className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 leading-none">{title}</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {hasActive ? `${activeCount} filter${activeCount > 1 ? 's' : ''} applied` : 'Refine table records'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {hasActive && onReset && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer px-1 py-0.5 transition"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{resetLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition"
              title="Close"
              aria-label="Close filters"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Form Content / Children */}
        <div className="p-4 space-y-4 max-h-[68vh] overflow-y-auto divide-y divide-slate-100 [&>*:not(:first-child)]:pt-3.5">
          {children}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
          {resultCountText ? (
            <span className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">
              Showing {resultCountText}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] bg-[#0B3D25] hover:bg-[#072F1C] text-white text-xs font-semibold cursor-pointer shadow-xs transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Filters</span>
          </button>
        </div>
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
    <div className="flex items-center justify-between mb-1.5">
      <label htmlFor={htmlFor} className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
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

