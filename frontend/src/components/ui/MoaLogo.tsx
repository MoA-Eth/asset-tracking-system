import React from 'react';

/**
 * Ministry of Agriculture emblem used on printed slips and in the app chrome.
 * To use the official logo instead, replace the SVG below (or render an <img> of the logo file).
 */
export const MoaLogo: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Ministry of Agriculture logo">
    <circle cx="50" cy="50" r="46" fill="#0A3F24" stroke="#FCDD09" strokeWidth="3" />
    <path d="M50 16 L50 82" stroke="#FCDD09" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M50 28 Q66 22 68 34 Q58 38 50 34" fill="#FCDD09" />
    <path d="M50 42 Q68 36 70 48 Q60 52 50 48" fill="#FCDD09" />
    <path d="M50 28 Q34 22 32 34 Q42 38 50 34" fill="#FCDD09" />
    <path d="M50 42 Q32 36 30 48 Q40 52 50 48" fill="#FCDD09" />
    <circle cx="50" cy="50" r="4" fill="#FCDD09" />
  </svg>
);
