import React from 'react';
import clsx from 'clsx';
import { ItemStatus, ApprovalStatus } from '../../types/asset-management';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'emerald' | 'amber' | 'blue' | 'purple';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center font-bold uppercase tracking-wider rounded border';

  const sizeStyles = {
    sm: 'px-1.5 py-0.2 text-[9px]',
    md: 'px-2 py-0.5 text-[10px]',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    warning: 'bg-amber-100 text-amber-800 border-amber-300',
    amber: 'bg-amber-100 text-amber-800 border-amber-300',
    danger: 'bg-red-100 text-red-800 border-red-300',
    info: 'bg-blue-100 text-blue-800 border-blue-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
    neutral: 'bg-slate-100 text-slate-700 border-slate-300',
  };

  return (
    <span
      className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: ItemStatus | ApprovalStatus | string }> = ({ status }) => {
  switch (status) {
    case ItemStatus.AVAILABLE:
      return <Badge variant="success">Available (In Store)</Badge>;

    case ItemStatus.ISSUED:
      return <Badge variant="info">Issued (In-Use)</Badge>;

    case ItemStatus.IN_REPAIR:
      return <Badge variant="purple">In-Repair / Maintenance</Badge>;

    case ItemStatus.PENDING_STOCK_IN:
      return <Badge variant="warning">Pending Stock-In</Badge>;

    case ItemStatus.PENDING_STOCK_OUT:
      return <Badge variant="warning">Pending Stock-Out</Badge>;

    case ItemStatus.UNDER_TRANSFER:
      return <Badge variant="purple">In-Transfer</Badge>;

    case ItemStatus.DISPOSED:
      return <Badge variant="danger">Disposed</Badge>;

    case ApprovalStatus.APPROVED:
      return <Badge variant="success">Approved</Badge>;

    case ApprovalStatus.PENDING:
      return <Badge variant="warning">Pending</Badge>;

    case ApprovalStatus.REJECTED:
      return <Badge variant="danger">Rejected</Badge>;

    default:
      return <Badge variant="neutral">{String(status).replace(/_/g, ' ')}</Badge>;
  }
};

export const ConditionBadge: React.FC<{ condition?: string }> = ({ condition = 'NEW' }) => {
  switch (condition) {
    case 'NEW':
      return <Badge variant="emerald">Brand New</Badge>;
    case 'GOOD':
      return <Badge variant="blue">Good Condition</Badge>;
    case 'FAIR':
      return <Badge variant="amber">Fair / Usable</Badge>;
    case 'NEEDS_REPAIR':
      return <Badge variant="purple">Needs Repair</Badge>;
    case 'DAMAGED':
      return <Badge variant="danger">Damaged / Defective</Badge>;
    default:
      return <Badge variant="neutral">{String(condition).replace(/_/g, ' ')}</Badge>;
  }
};
