import React, { useState } from 'react';
import { COMMON_UOMS, COMMON_UOM_OPTIONS } from './receipt-options';
import { cellClass } from './SlipLines';

export interface UomSelectProps {
  id?: string;
  ariaLabel?: string;
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}

export const UomSelect: React.FC<UomSelectProps> = ({
  id,
  ariaLabel = 'Unit of measure',
  value = 'EA',
  onChange,
  onBlur,
  invalid,
}) => {
  const currentUpper = (value || '').trim().toUpperCase();
  const isStandard = COMMON_UOMS.includes(currentUpper);
  const [customMode, setCustomMode] = useState(false);

  if (customMode) {
    return (
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          autoFocus
          aria-label={ariaLabel}
          placeholder="e.g. TON"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onBlur={onBlur}
          className={`${cellClass({ align: 'center', mono: true, invalid })} uppercase pr-5`}
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            if (!value) onChange('EA');
          }}
          title="Choose from standard units"
          aria-label="Back to standard units"
          className="absolute right-1 text-slate-400 hover:text-emerald-700 cursor-pointer text-[10px] font-bold"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={isStandard ? currentUpper : (value ? value : 'EA')}
      onChange={(e) => {
        if (e.target.value === '__OTHER__') {
          setCustomMode(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      onBlur={onBlur}
      className={`${cellClass({ align: 'left', invalid })} font-mono uppercase cursor-pointer text-xs`}
    >
      {/* If non-standard unit was extracted from slip, show it */}
      {value && !isStandard && (
        <option value={value}>{value}</option>
      )}
      {COMMON_UOM_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      <option value="__OTHER__">+ Other (type custom)…</option>
    </select>
  );
};
