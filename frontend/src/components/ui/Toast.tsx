import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'success',
  title,
  message,
  duration = 4000,
  onClose,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
    error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />,
  };

  const styleConfigs = {
    success: {
      bg: 'bg-gradient-to-br from-[#072416] to-[#03130B]',
      border: 'border-emerald-500/50 shadow-emerald-950/50',
      titleColor: 'text-white',
      descColor: 'text-emerald-200/90',
      barColor: 'bg-gradient-to-r from-emerald-500 to-amber-400',
    },
    warning: {
      bg: 'bg-gradient-to-br from-[#241A07] to-[#140E03]',
      border: 'border-amber-500/50 shadow-amber-950/50',
      titleColor: 'text-white',
      descColor: 'text-amber-200/90',
      barColor: 'bg-amber-400',
    },
    error: {
      bg: 'bg-gradient-to-br from-[#260B0B] to-[#140404]',
      border: 'border-red-500/50 shadow-red-950/50',
      titleColor: 'text-white',
      descColor: 'text-red-200/90',
      barColor: 'bg-red-500',
    },
    info: {
      bg: 'bg-gradient-to-br from-[#0B1E2E] to-[#050E17]',
      border: 'border-blue-500/50 shadow-blue-950/50',
      titleColor: 'text-white',
      descColor: 'text-blue-200/90',
      barColor: 'bg-blue-400',
    },
  };

  const config = styleConfigs[type];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative max-w-sm sm:max-w-md w-full rounded-2xl border ${config.bg} ${config.border} p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-slideDown overflow-hidden`}
    >
      <div className="flex items-start gap-3">
        {icons[type]}
        <div className="flex-1 min-w-0 pr-2">
          <h4 className={`text-xs font-bold ${config.titleColor} tracking-tight`}>{title}</h4>
          {message && (
            <p className={`text-[11px] ${config.descColor} font-medium mt-0.5 leading-relaxed`}>
              {message}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-white/10 shrink-0 cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Bar Timer */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 overflow-hidden">
        <div
          className={`h-full ${config.barColor} transition-all duration-75`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
export default Toast;
