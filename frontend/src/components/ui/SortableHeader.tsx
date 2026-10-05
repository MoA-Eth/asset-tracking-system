import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortableHeaderProps {
  label: string;
  columnKey: string;
  currentSortColumn?: string | null;
  currentSortDirection?: SortDirection;
  onSort: (columnKey: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  thClassName?: string;
  title?: string;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  columnKey,
  currentSortColumn,
  currentSortDirection = 'asc',
  onSort,
  align = 'left',
  className = '',
  thClassName = '',
  title,
}) => {
  const isSorted = currentSortColumn === columnKey;
  const ariaSort = isSorted ? (currentSortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th className={thClassName} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`group inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer select-none transition-colors ${
          align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''
        } ${className}`}
        title={title || `Sort by ${label}`}
      >
        <span>{label}</span>
        {isSorted ? (
          currentSortDirection === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown
            className="w-3 h-3 text-slate-400 group-hover:text-slate-600 shrink-0 opacity-40 group-hover:opacity-100 transition"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
};
