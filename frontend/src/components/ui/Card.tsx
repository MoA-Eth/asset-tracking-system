import React from 'react';
import clsx from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant: background / border style */
  variant?: 'default' | 'subtle' | 'bordered';
  /** Optional icon to display on the left */
  icon?: React.ReactNode;
  /** Optional title shown above the children */
  title?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className,
  ...props
}) => {
  const isClickable = !!props.onClick;
  const variantStyles = {
    default: 'bg-white border border-slate-200 shadow-xs',
    subtle: 'bg-slate-50/70 border border-slate-200',
    bordered: 'bg-white border-2 border-slate-300 shadow-xs',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (props.onClick as any)?.(e);
    }
  };

  return (
    <div
      className={clsx(
        'rounded-2xl p-4 sm:p-5 transition-shadow duration-200 ease-in-out hover:shadow-md hover:bg-slate-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        isClickable && 'cursor-pointer',
        variantStyles[variant],
        className
      )}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={clsx('flex items-center justify-between gap-3 pb-3 border-b border-slate-100', className)} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className,
  ...props
}) => (
  <h3 className={clsx('text-xs font-bold uppercase tracking-wider text-slate-800', className)} {...props}>
    {children}
  </h3>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={clsx('pt-3 space-y-3', className)} {...props}>
    {children}
  </div>
);
