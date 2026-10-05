import React, { useState } from 'react';
import moaLogoUrl from '../../assets/moa-logo.png';

export interface MoaLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Official Ministry of Agriculture emblem used on printed slips, statutory vouchers, and app chrome.
 * Uses the authentic MoA Ethiopia circular emblem (sun rays, green terraced fields, and blue waters).
 */
export const MoaLogo: React.FC<MoaLogoProps> = ({
  className = 'w-14 h-14',
  alt = 'Ministry of Agriculture logo',
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

  return (
    <img
      src={moaLogoUrl}
      alt={alt}
      width={332}
      height={328}
      onError={() => setHasError(true)}
      className={`${className} object-contain inline-block shrink-0`}
      loading="eager"
    />
  );
};
