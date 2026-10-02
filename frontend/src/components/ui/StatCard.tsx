import React from 'react';
import clsx from 'clsx';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  valueColor?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  valueColor = 'text-slate-900',
  className,
}) => {
  return (
    <div className={clsx('p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-bold text-slate-500 block truncate">{label}</span>
        <span className={clsx('text-xl sm:text-2xl font-black mt-1 block wrap-anywhere tracking-tight', valueColor)}>
          {value}
        </span>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 wrap-anywhere">{subtitle}</p>}
      </div>
      {icon && (
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 shrink-0">
          {icon}
        </div>
      )}
    </div>
  );
};
