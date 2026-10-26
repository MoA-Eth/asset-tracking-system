import React, { useEffect, useState, useRef, useCallback } from 'react';
import { BellRing, X, ArrowRight, Layers } from 'lucide-react';

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

  // Give 200ms for exit slide animation before unmounting
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onCloseRef.current(), 200);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`no-print fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-[80] w-[calc(100%-1.5rem)] sm:w-auto sm:max-w-md transition-all duration-300 ease-out select-none ${
        leaving
          ? 'opacity-0 translate-y-4 scale-95 pointer-events-none'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/95 text-white shadow-2xl shadow-black/40 backdrop-blur-md p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Animated Notification Badge Icon */}
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/40">
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {count > 1 ? (
              <Layers className="h-4 w-4" />
            ) : (
              <BellRing className="h-4 w-4 animate-bounce" />
            )}
          </div>

          {/* Text Details */}
          <div
            onClick={onReview}
            className="flex-1 min-w-0 cursor-pointer pr-1"
            title="Click to view in Approvals queue"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-[13px] font-bold text-white tracking-tight truncate">
                {title}
              </h4>
              {count > 1 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold">
                  {count} vouchers
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-300 leading-snug line-clamp-2">
              {message}
            </p>
          </div>

          {/* Action Button & Dismiss */}
          <div className="flex items-center gap-1.5 shrink-0 self-center">
            <button
              type="button"
              onClick={onReview}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs flex items-center gap-1 active:scale-95"
            >
              <span>Review</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telegram/Gmail style shrinking bottom progress bar */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-slate-800">
          <div
            className="h-full origin-left bg-emerald-500"
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
