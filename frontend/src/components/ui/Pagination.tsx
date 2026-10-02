import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const PAGE_SIZES = [10, 25, 50, 100];

export interface Pager<T> {
  /** The rows to show on the current page */
  pageItems: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Position of the first and last row shown, counting from 1 (0 when there are none) */
  from: number;
  to: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Splits a list that is already filtered and sorted into pages.
 * Going back to page 1 whenever `resetKey` changes keeps a new search or filter from landing on an empty page.
 */
export function usePagination<T>(items: T[], options: { pageSize?: number; resetKey?: unknown } = {}): Pager<T> {
  const [pageSize, setPageSizeState] = useState(options.pageSize ?? PAGE_SIZES[0]);
  const [page, setPageState] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPageState(1);
  }, [options.resetKey]);

  // Rows can disappear (a deletion, a narrower filter): never stay on a page that no longer exists
  const current = Math.min(page, pageCount);
  useEffect(() => {
    if (page !== current) setPageState(current);
  }, [page, current]);

  const pageItems = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);

  return {
    pageItems,
    page: current,
    pageCount,
    pageSize,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
    setPage: (p) => setPageState(Math.min(Math.max(1, p), pageCount)),
    setPageSize: (size) => {
      setPageSizeState(size);
      setPageState(1);
    },
  };
}

/** Page numbers to show: always the first and last, the current one and its neighbours, with gaps marked */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => wanted.add(p));
  if (page >= pageCount - 2) [pageCount - 1, pageCount - 2, pageCount - 3].forEach((p) => wanted.add(p));
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

const navButton =
  'flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 cursor-pointer';

interface PaginationProps {
  pager: Pager<unknown>;
  /** What the rows are, for the count line and screen readers, e.g. "employees" */
  label?: string;
  className?: string;
}

/** Footer under a table: how many rows are shown, rows per page, and the page buttons */
export const Pagination: React.FC<PaginationProps> = ({ pager, label = 'rows', className = '' }) => {
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = pager;
  if (total === 0) return null;

  return (
    <nav
      aria-label={`Pages of ${label}`}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 ${className}`}
    >
      <p aria-live="polite">
        Showing <span className="font-semibold tabular-nums text-slate-900">{from}–{to}</span> of{' '}
        <span className="font-semibold tabular-nums text-slate-900">{total.toLocaleString()}</span> {label}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {total > PAGE_SIZES[0] && (
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" className={navButton} onClick={() => setPage(1)} disabled={page === 1} aria-label="First page" title="First page">
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={navButton} onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page" title="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {pageWindow(page, pageCount).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-slate-400" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                  className={
                    p === page
                      ? 'flex h-8 min-w-8 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-2 text-xs font-bold tabular-nums text-white'
                      : `${navButton} tabular-nums`
                  }
                >
                  {p}
                </button>
              ),
            )}
            <button type="button" className={navButton} onClick={() => setPage(page + 1)} disabled={page === pageCount} aria-label="Next page" title="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={navButton} onClick={() => setPage(pageCount)} disabled={page === pageCount} aria-label="Last page" title="Last page">
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
