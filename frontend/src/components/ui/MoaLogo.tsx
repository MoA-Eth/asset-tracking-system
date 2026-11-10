import React, { useState } from 'react';
import moaEmblemUrl from '../../assets/moa-logo.png';
import moaFullLogoUrl from '../../assets/moa-full-logo.png';

export interface MoaLogoProps {
  className?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'emblem' | 'full';
}

const widths = { sm: 132, md: 190, lg: 230 } as const;

/**
 * Official Ministry of Agriculture emblem and logo lockup:
 * - Default / variant="emblem": 32-bit transparent circular emblem (sun rays, green terraces, blue waves).
 *   Used in the sidebar, app chrome, headers, and vouchers without any opaque box or unreadable text.
 * - size prop / variant="full": Complete institutional lockup with official typography
 *   (የግብርና ሚኒስቴር / MINISTRY OF AGRICULTURE) for sign-in and auth cards.
 */
export const MoaLogo: React.FC<MoaLogoProps> = ({
  className = 'w-14 h-14',
  alt = 'Ministry of Agriculture',
  size,
  variant,
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    // Clean fallback with the official MoA palette
    return (
      <svg viewBox="0 0 100 100" className={`${className} shrink-0`} role="img" aria-label={alt}>
        <circle cx="50" cy="50" r="46" fill="#FBB03B" stroke="#008938" strokeWidth="2" />
        <path d="M 6 48 Q 50 38 94 48 L 94 68 Q 50 58 6 68 Z" fill="#008938" />
        <path d="M 6 68 Q 50 58 94 68 A 46 46 0 0 1 6 68 Z" fill="#1A659E" />
      </svg>
    );
  }

  // Use full typography lockup on auth cards when size or variant="full" is requested
  const isFullLockup = variant === 'full' || (size !== undefined && variant !== 'emblem');

  if (isFullLockup) {
    const width = size ? widths[size] : 190;
    return (
      <img
        src={moaFullLogoUrl}
        alt={alt}
        width={width}
        height={Math.round((width * 2) / 3)}
        onError={() => setHasError(true)}
        className={`moa-logo h-auto w-auto object-contain inline-block shrink-0 ${className !== 'w-14 h-14' ? className : ''}`}
        style={{ width: `${width}px`, maxWidth: '100%' }}
        loading="eager"
      />
    );
  }

  return (
    <img
      src={moaEmblemUrl}
      alt={alt}
      onError={() => setHasError(true)}
      className={`${className} object-contain inline-block shrink-0`}
      loading="eager"
    />
  );
};
