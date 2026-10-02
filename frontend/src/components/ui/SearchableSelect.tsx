import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  /** Shown after the label in a lighter colour, e.g. a role */
  note?: string;
  /** Listed, but can't be picked */
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SearchableSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  groups: SelectGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  autoFocus?: boolean;
}

/**
 * A dropdown with a search box inside it, for long lists such as staff.
 * Click to open, type to narrow the list, click or press Enter to choose.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  value,
  onChange,
  groups,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  autoFocus,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => groups.flatMap((g) => g.options).find((o) => o.value === value), [groups, value]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, options: q ? g.options.filter((o) => `${o.label} ${o.note ?? ''}`.toLowerCase().includes(q)) : g.options }))
      .filter((g) => g.options.length > 0);
  }, [groups, query]);
  // The options that can be chosen, in the order they are shown, for the arrow keys
  const pickable = useMemo(() => shown.flatMap((g) => g.options).filter((o) => !o.disabled), [shown]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) buttonRef.current?.focus();
  };
  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  useEffect(() => setActive(0), [query, open]);

  // Close when clicking elsewhere
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option in view
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (pickable.length > 0) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + pickable.length) % pickable.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pickable[active]) choose(pickable[active]);
    } else if (e.key === 'Escape') {
      // Close the list only, not the window it sits in
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    }
  };

  const total = shown.reduce((n, g) => n + g.options.length, 0);

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoFocus={autoFocus}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-[13px] transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
      >
        <span className={`truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_10px_30px_-8px_rgba(15,23,42,0.25)]">
          <div className="relative border-b border-slate-200 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id={`${id}-search`}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              aria-label="Search the list"
              aria-controls={`${id}-list`}
              autoComplete="off"
              className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>
          <ul id={`${id}-list`} ref={listRef} role="listbox" className="max-h-56 overflow-auto py-1 text-[13px]">
            {total === 0 && <li className="px-3 py-3 text-center text-xs text-slate-500">Nothing matches “{query}”.</li>}
            {shown.map((group) => (
              <li key={group.label} role="presentation">
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {group.label} ({group.options.length})
                </p>
                <ul role="group" aria-label={group.label}>
                  {group.options.map((option) => {
                    const isActive = !option.disabled && pickable[active]?.value === option.value;
                    return (
                      <li
                        key={option.value}
                        role="option"
                        aria-selected={option.value === value}
                        aria-disabled={option.disabled || undefined}
                        data-active={isActive}
                        onMouseEnter={() => !option.disabled && setActive(pickable.findIndex((o) => o.value === option.value))}
                        onClick={() => choose(option)}
                        className={`flex items-center justify-between gap-3 px-3 py-1.5 ${
                          option.disabled ? 'cursor-not-allowed text-slate-400' : `cursor-pointer text-slate-900 ${isActive ? 'bg-emerald-50' : ''}`
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {option.label}
                          {option.note && <span className="ml-2 text-[11px] text-slate-400">{option.note}</span>}
                        </span>
                        {option.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
