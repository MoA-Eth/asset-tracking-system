import React, { forwardRef } from 'react';
import clsx from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, className, id, required, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-amber-600 font-bold">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            required={required}
            className={clsx(
              'w-full px-3 py-2 bg-white border rounded-xl text-xs text-slate-900 placeholder-slate-400 transition',
              'focus:outline-none focus:ring-1',
              leftIcon ? 'pl-9' : 'pl-3',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-500',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
        {!error && helperText && <p className="text-[10px] text-slate-400">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
