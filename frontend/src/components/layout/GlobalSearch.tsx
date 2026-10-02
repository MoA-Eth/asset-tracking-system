import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, LucideIcon, Package, RefreshCw, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ItemWithRelations } from '../../types/asset-management';
import { RecordDetailModal } from '../ui/RecordDetailModal';
import { NAV_SECTIONS, SETTINGS_NAV } from './navigation';

interface GlobalSearchProps {
  onNavigate: (tab: string) => void;
}

interface PageHit {
  kind: 'page';
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
}
interface ItemHit {
  kind: 'item';
  id: string;
  item: ItemWithRelations;
}
type Hit = PageHit | ItemHit;

const STATUS_LABELS: Record<string, string> = {
  PENDING_STOCK_IN: 'Awaiting approval',
  AVAILABLE: 'In store',
  PENDING_STOCK_OUT: 'Stock-out pending',
  ISSUED: 'Issued',
  UNDER_TRANSFER: 'Under transfer',
  DISPOSED: 'Rejected',
};

const MAX_ITEMS = 6;

/**
 * Search box in the top bar: finds an item by name, code, serial or slip number from any page,
 * and jumps to a page by name. Ctrl+K (or /) puts the cursor in it.
 */
export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const canSearchItems = user?.permissions?.includes('inventory.read') ?? false;

  // Pages this user may open
  const pages = useMemo<PageHit[]>(() => {
    const allowed = user?.allowedTabs ?? [];
    const all = [
      ...NAV_SECTIONS.flatMap((section) => section.items.map((item) => ({ id: item.id, label: item.label, hint: item.hint, icon: item.icon }))),
      ...SETTINGS_NAV.groups.flatMap((group) => group.items.map((item) => ({ id: item.id, label: item.label, hint: `Settings · ${group.label}`, icon: item.icon }))),
    ];
    return all.filter((page) => allowed.includes(page.id)).map((page) => ({ kind: 'page' as const, ...page }));
  }, [user?.allowedTabs]);

  const pageHits = useMemo(() => {
    if (!term) return pages;
    const q = term.toLowerCase();
    return pages.filter((page) => `${page.label} ${page.hint ?? ''}`.toLowerCase().includes(q));
  }, [pages, term]);

  // Items: asked from the server shortly after typing stops
  useEffect(() => {
    if (!canSearchItems || term.length < 2) {
      setItems([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .getItems({ search: term })
        .then((found) => {
          if (!cancelled) setItems(found);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, canSearchItems]);

  const itemHits = useMemo<ItemHit[]>(() => items.slice(0, MAX_ITEMS).map((item) => ({ kind: 'item', id: item.id, item })), [items]);
  const hits: Hit[] = useMemo(() => [...itemHits, ...pageHits], [itemHits, pageHits]);

  useEffect(() => setActive(0), [term, hits.length]);

  // Ctrl+K anywhere, or "/" when not typing in a field, moves the cursor to the search box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close when clicking elsewhere
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    if (hit.kind === 'page') onNavigate(hit.id);
    else setViewingItemId(hit.item.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (hits.length > 0) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[active]) choose(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const row = (hit: Hit, index: number, body: React.ReactNode) => (
    <li
      key={`${hit.kind}-${hit.id}`}
      id={`global-search-option-${index}`}
      role="option"
      aria-selected={index === active}
      onMouseEnter={() => setActive(index)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => choose(hit)}
      className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${index === active ? 'bg-emerald-50' : ''}`}
    >
      {body}
      {index === active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-700" />}
    </li>
  );

  return (
    <div ref={rootRef} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search items and pages"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-activedescendant={open && hits[active] ? `global-search-option-${active}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search items by name, code, serial or slip number…"
        className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-16 text-[13px] text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-400">
        Ctrl K
      </kbd>

      {open && (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 text-[13px] shadow-[0_18px_40px_-12px_rgba(15,23,42,0.3)] animate-fadeIn"
        >
          <ul role="listbox" aria-label="Search results">
            {canSearchItems && term.length >= 2 && (
              <>
                <li role="presentation" className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Items
                  {searching && <RefreshCw className="h-3 w-3 animate-spin text-emerald-700" />}
                  {!searching && items.length > MAX_ITEMS && <span className="font-normal normal-case tracking-normal text-slate-400">first {MAX_ITEMS} of {items.length}; type more to narrow</span>}
                </li>
                {!searching && itemHits.length === 0 && <li role="presentation" className="px-3 py-2 text-xs text-slate-500">No item matches “{term}”.</li>}
                {itemHits.map((hit, i) =>
                  row(
                    hit,
                    i,
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Package className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{hit.item.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          <span className="font-mono">{hit.item.itemCode}</span>
                          {' · '}
                          {STATUS_LABELS[hit.item.status] ?? hit.item.status}
                          {hit.item.currentCustodian ? ` · ${hit.item.currentCustodian.fullNameEn}` : ''}
                        </span>
                      </span>
                    </>,
                  ),
                )}
              </>
            )}

            {pageHits.length > 0 && (
              <>
                <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {term ? 'Pages' : 'Go to'}
                </li>
                {pageHits.map((hit, i) => {
                  const Icon = hit.icon;
                  return row(
                    hit,
                    itemHits.length + i,
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 truncate font-medium text-slate-900">{hit.label}</span>
                    </>,
                  );
                })}
              </>
            )}

            {term && hits.length === 0 && !searching && (term.length < 2 || !canSearchItems) && (
              <li role="presentation" className="px-3 py-3 text-xs text-slate-500">
                {canSearchItems ? 'Type at least 2 characters to search items.' : `Nothing matches “${term}”.`}
              </li>
            )}
          </ul>
          <p className="mt-1 border-t border-slate-100 px-3 pt-2 text-[11px] text-slate-400">↑ ↓ to move · Enter to open · Esc to close</p>
        </div>
      )}

      {viewingItemId && <RecordDetailModal itemId={viewingItemId} onClose={() => setViewingItemId(null)} />}
    </div>
  );
};
