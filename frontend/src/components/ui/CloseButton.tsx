import React from 'react';

export type CloseButtonSize = 'sm' | 'md' | 'lg';
export type CloseButtonTone = 'subtle' | 'dark' | 'ghost';

export interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClose?: () => void;
  label?: string;
  title?: string;
  size?: CloseButtonSize;
  tone?: CloseButtonTone;
  className?: string;
}

/**
 * Authentic Fishbowl Inventory FBOClose geometric cross icon.
 * Sourced directly from Fishbowl Drive (drive/materials/items) design system.
 */
export const FishbowlCloseIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 18 17"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.4094 8.28024L17.8394 0.850244C18.1594 0.540244 17.9294 0.000244141 17.4894 0.000244141H16.0794C15.9494 0.000244141 15.8194 0.0502441 15.7294 0.150244L9.00939 6.87024L2.26939 0.150244C2.17939 0.0602441 2.04939 0.000244141 1.91939 0.000244141H0.499395C0.0593946 0.000244141 -0.170605 0.540244 0.149395 0.850244L7.57939 8.28024L0.149395 15.7102C-0.170605 16.0302 0.0593946 16.5602 0.499395 16.5602H1.90939C2.03939 16.5602 2.16939 16.5102 2.25939 16.4102L8.97939 9.69024L15.6994 16.4102C15.7894 16.5002 15.9194 16.5602 16.0494 16.5602H17.4594C17.9094 16.5602 18.1294 16.0202 17.8094 15.7102L10.3794 8.28024H10.4094Z" />
  </svg>
);

const SIZE_STYLES: Record<CloseButtonSize, { btn: string; icon: string }> = {
  sm: { btn: 'h-7 w-7 rounded-[5px]', icon: 'w-3 h-3' },
  md: { btn: 'h-8 w-8 rounded-[5px]', icon: 'w-3.5 h-3.5' },
  lg: { btn: 'h-9 w-9 rounded-[6px]', icon: 'w-4 h-4' },
};

const TONE_STYLES: Record<CloseButtonTone, string> = {
  // Elevated, clean light surface button with subtle border and crisp hover
  subtle:
    'border border-slate-200/90 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-300 shadow-2xs',
  // Dark header variant for voucher and document toolbars
  dark:
    'border border-slate-700/80 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-600 shadow-2xs',
  // Flat minimal ghost button matching Fishbowl tertiary neutral button
  ghost:
    'text-slate-400 hover:text-slate-700 hover:bg-slate-100/90 active:bg-slate-200/70',
};

/**
 * Standard Close Button matching the exact Fishbowl Inventory / Drive design system.
 * Uses Fishbowl's authentic FBOClose vector geometry, crisp 5px rounded corners,
 * and tactile hover/press states.
 */
export const CloseButton: React.FC<CloseButtonProps> = ({
  onClose,
  onClick,
  label = 'Close',
  title,
  size = 'md',
  tone = 'subtle',
  className = '',
  ...rest
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    onClose?.();
  };

  const sz = SIZE_STYLES[size] || SIZE_STYLES.md;
  const tn = TONE_STYLES[tone] || TONE_STYLES.subtle;
  const computedTitle = title ?? label ?? 'Close';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={computedTitle}
      className={`inline-flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 cursor-pointer select-none shrink-0 ${sz.btn} ${tn} ${className}`}
      {...rest}
    >
      <FishbowlCloseIcon className={sz.icon} />
    </button>
  );
};
