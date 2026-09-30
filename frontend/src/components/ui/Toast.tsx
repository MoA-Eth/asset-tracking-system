import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
  onClose: () => void;
}

/** Length of the exit animation; onClose fires once it has finished. */
export const TOAST_EXIT_MS = 160;

const TYPE_STYLES: Record<
  ToastType,
  { icon: React.ElementType; accent: string; badge: string; bar: string; label: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: 'bg-emerald-600',
    badge: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    bar: 'bg-emerald-500',
    label: 'Success',
  },
  error: {
    icon: XCircle,
    accent: 'bg-rose-600',
    badge: 'bg-rose-50 text-rose-600 ring-rose-100',
    bar: 'bg-rose-500',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    accent: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-600 ring-amber-100',
    bar: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    icon: Info,
    accent: 'bg-sky-600',
    badge: 'bg-sky-50 text-sky-600 ring-sky-100',
    bar: 'bg-sky-500',
    label: 'Information',
  },
};

export const Toast: React.FC<ToastProps> = ({
  type = 'success',
  title,
  message,
  duration = 4000,
  onClose,
}) => {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remainingRef = useRef(duration);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => setLeaving(true), []);

  // Auto-dismiss countdown that pauses while hovered or focused
  useEffect(() => {
    if (paused || leaving) return;
    const startedAt = Date.now();
    const timer = setTimeout(dismiss, remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAt;
    };
  }, [paused, leaving, dismiss]);

  // Let the exit animation play before removing the toast
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onCloseRef.current(), TOAST_EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const style = TYPE_STYLES[type];
  const Icon = style.icon;
  const isError = type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg shadow-slate-900/10 ${
        leaving ? 'animate-toastOut' : 'animate-toastIn'
      }`}
    >
      {/* Type accent edge */}
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />

      <div className="flex items-start gap-3 py-3.5 pl-5 pr-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${style.badge}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <span className="sr-only">{style.label}: </span>
          <p className="text-[13px] font-semibold leading-5 text-slate-900">{title}</p>
          {message && <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{message}</p>}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 cursor-pointer"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Countdown bar */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
        <div
          className={`h-full origin-left ${style.bar} opacity-70`}
          style={{
            animation: `toastProgress ${duration}ms linear forwards`,
            animationPlayState: paused || leaving ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
};

export default Toast;
