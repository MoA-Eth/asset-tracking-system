import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, X, ArrowRight, Layers } from 'lucide-react';

export interface ArrivalBottomSnackbarProps {
  id: string;
  title: string;
  message: string;
  count?: number;
  duration?: number; // ms, default 8000
  onReview: () => void;
  onClose: () => void;
}

export const ArrivalBottomSnackbar: React.FC<ArrivalBottomSnackbarProps> = ({
  id: _id,
  title,
  message,
  count = 1,
  duration = 8000,
  onReview,
  onClose,
}) => {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remainingRef = useRef(duration);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => {
    setLeaving(true);
  }, []);

  // Countdown timer with pause on hover
  useEffect(() => {
    if (paused || leaving) return;
    const startedAt = Date.now();
    const timer = setTimeout(dismiss, remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAt;
    };
  }, [paused, leaving, dismiss]);

  // Allow exit animation (180ms) before unmounting
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onCloseRef.current(), 180);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`no-print fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-[80] w-[calc(100%-1.5rem)] sm:w-auto sm:max-w-md transition-all duration-200 ease-out select-none ${
        leaving
          ? 'opacity-0 translate-y-2 pointer-events-none'
          : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-md border border-slate-200/90 bg-white text-slate-900 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 p-3.5 sm:p-4">
        {/* Subtle Government Green Accent Edge */}
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-emerald-800" />

        <div className="flex items-start gap-3 pl-1.5">
          {/* Professional Icon Badge */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/15">
            {count > 1 ? (
              <Layers className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </div>

          {/* Text Details */}
          <div
            onClick={onReview}
            className="flex-1 min-w-0 cursor-pointer pr-1"
            title="Click to view in Approvals queue"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-[13px] font-semibold text-slate-900 tracking-tight truncate">
                {title}
              </h4>
              {count > 1 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {count} vouchers
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-600 leading-snug line-clamp-2">
              {message}
            </p>
          </div>

          {/* Action Button & Dismiss */}
          <div className="flex items-center gap-1.5 shrink-0 self-center">
            <button
              type="button"
              onClick={onReview}
              className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-[4px] text-xs font-medium cursor-pointer transition shadow-2xs flex items-center gap-1 active:scale-95"
            >
              <span>Review</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="p-1 rounded-[4px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean, Subtle Progress Bar */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
          <div
            className="h-full origin-left bg-emerald-700 opacity-80"
            style={{
              animation: `toastProgress ${duration}ms linear forwards`,
              animationPlayState: paused || leaving ? 'paused' : 'running',
            }}
          />
        </div>
      </div>
    </aside>
  );
};
