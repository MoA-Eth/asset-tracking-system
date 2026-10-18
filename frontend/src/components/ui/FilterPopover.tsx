import React, { useEffect, useRef, useState } from 'react';
import { ListFilter, ChevronDown, X } from 'lucide-react';

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
 * Displays as an ergonomic bottom-sheet on mobile viewports (<640px)
 * and an anchored dropdown popover on tablet/desktop (>=640px).
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
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !buttonRef.current?.contains(target)
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
      {/* Outer Trigger Button - restored to original [ <ListFilter> Filter ] design */}
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
        } rounded-[4px] border font-semibold transition cursor-pointer select-none shadow-2xs ${
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
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer select-none"
        >
          <X className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      )}

      {/* Backdrop overlay on mobile: closes popover on tap */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs sm:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Single Responsive Popover Card: bottom-sheet on mobile (<640px), dropdown popover on tablet/desktop (>=640px) */}
      <div
        className={`${
          isOpen ? 'flex' : 'hidden'
        } fixed inset-x-0 bottom-0 z-50 max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:absolute sm:inset-auto sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-[75vh] sm:w-88 sm:rounded-md sm:border sm:border-slate-200 sm:p-4 sm:shadow-lg sm:pb-4 ${
          align === 'right' ? 'sm:right-0 sm:left-auto' : 'sm:left-0 sm:right-auto'
        } animate-fadeIn`}
        aria-label={title}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
      >
        {/* Mobile Drag Handle & Header */}
        <div className="flex sm:hidden flex-col mb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-sm font-bold text-slate-900">{title}</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              aria-label="Close filters"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable controls */}
        <div className="flex max-h-[58vh] sm:max-h-[62vh] flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
          <span className="truncate text-slate-500">{resultCountText ? `Showing ${resultCountText}` : ''}</span>
          <div className="flex items-center gap-2">
            {hasActive && onReset && (
              <button
                type="button"
                onClick={onReset}
                title="Reset all filters"
                className="shrink-0 font-medium text-slate-600 transition hover:text-rose-700 hover:underline cursor-pointer py-1 px-2"
              >
                {resetLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="sm:hidden rounded bg-emerald-700 px-3.5 py-1.5 font-semibold text-white shadow-xs hover:bg-emerald-800 cursor-pointer text-xs"
            >
              Apply
            </button>
          </div>
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
 * Clean Select dropdown helper for filters with opening/closing ChevronDown icon
 */
export const FilterSelect: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  ariaLabel?: string;
}> = ({ id, value, onChange, options, placeholder, ariaLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption
    ? selectedOption.label
    : (value && value !== 'ALL' ? value : (placeholder || 'Select option'));

  return (
    <div className="relative w-full text-left" ref={containerRef}>
      {/* Real select element for automated testing and accessible forms */}
      <select
        id={id}
        aria-label={ariaLabel || placeholder || 'Select option'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        tabIndex={-1}
        className="sr-only"
      >
        {placeholder && <option value="ALL">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Styled dropdown button with opening/closing ChevronDown */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-[4px] border bg-white px-3 py-1.5 text-left text-[13px] transition cursor-pointer select-none shadow-2xs ${
          isOpen
            ? 'border-emerald-700 ring-1 ring-emerald-700 text-slate-900'
            : 'border-slate-300 text-slate-800 hover:border-slate-400 hover:bg-slate-50/50'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-800' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Dropdown menu options */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg animate-fadeIn text-[13px]">
          {placeholder && (
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition cursor-pointer ${
                value === 'ALL' || !value
                  ? 'bg-emerald-50 text-emerald-900 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{placeholder}</span>
              {(value === 'ALL' || !value) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />}
            </button>
          )}
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-xs font-semibold transition cursor-pointer select-none ${
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
