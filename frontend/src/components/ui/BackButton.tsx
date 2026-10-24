import React from 'react';
import { ArrowLeft } from 'lucide-react';

export type BackButtonSize = 'sm' | 'md' | 'lg';
export type BackButtonTone = 'subtle' | 'dark' | 'ghost';

export interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onBack?: () => void;
  label?: string;
  title?: string;
  size?: BackButtonSize;
  tone?: BackButtonTone;
  className?: string;
}

const SIZE_STYLES: Record<BackButtonSize, { btn: string; icon: string }> = {
  sm: { btn: 'h-7 w-7 rounded-[5px]', icon: 'w-3 h-3' },
  md: { btn: 'h-8 w-8 rounded-[5px]', icon: 'w-3.5 h-3.5' },
  lg: { btn: 'h-9 w-9 rounded-[6px]', icon: 'w-4 h-4' },
};

const TONE_STYLES: Record<BackButtonTone, string> = {
  subtle:
    'border border-slate-200/90 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-300 shadow-2xs',
  dark:
    'border border-slate-700/80 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-600 shadow-2xs',
  ghost:
    'text-slate-400 hover:text-slate-700 hover:bg-slate-100/90 active:bg-slate-200/70',
};

/**
 * Standard Back Button for panel and form headers.
 * Symmetrical to CloseButton, provides tactile hover/focus states and accessible labelling.
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  onClick,
  label = 'Back',
  title = 'Back (Esc)',
  size = 'md',
  tone = 'subtle',
  className = '',
  ...rest
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented) {
      onBack?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={title || label}
      className={`inline-flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 cursor-pointer select-none shrink-0 ${SIZE_STYLES[size].btn} ${TONE_STYLES[tone]} ${className}`}
      {...rest}
    >
      <ArrowLeft className={SIZE_STYLES[size].icon} />
    </button>
  );
};
