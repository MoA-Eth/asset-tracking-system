import React from 'react';
import { ArrowUpDown, Triangle } from 'lucide-react';

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
        className={`group inline-flex items-center gap-1.5 font-normal hover:text-slate-900 cursor-pointer select-none transition-colors ${isSorted ? 'text-slate-900' : 'text-slate-600'} ${
          // A right-aligned column keeps its arrow on the left, so the label ends where the figures below it end
          align === 'right' ? 'ml-auto flex-row-reverse' : align === 'center' ? 'mx-auto' : ''
        } ${className}`}
        title={title || `Sort by ${label}`}
      >
        <span>{label}</span>
        {isSorted ? (
          // A filled arrow: up for ascending, down for descending
          <Triangle className={`h-2.5 w-2.5 shrink-0 fill-current text-slate-800 ${currentSortDirection === 'asc' ? '' : 'rotate-180'}`} aria-hidden="true" />
        ) : (
          <ArrowUpDown
            className="w-3 h-3 text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
};
