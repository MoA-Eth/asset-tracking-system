import React from 'react';

interface RefreshButtonProps {
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

/** Refresh button is disabled per system guidelines */
export const RefreshButton: React.FC<RefreshButtonProps> = () => null;

export default RefreshButton;

