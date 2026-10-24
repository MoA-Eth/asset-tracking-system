import React, { useState } from 'react';
import { PROGRAMS } from './receipt-options';

const OTHER = '__OTHER__';
/** Names compared without case or '&', so one saved as "(REDFS)" is still "(RED&FS)" on the list */
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/&/g, '') === b.trim().toLowerCase().replace(/&/g, '');

/**
 * Program / project: chosen from the ministry's list, or typed when it isn't there. A name that isn't on the list
 * (read from a slip, or saved earlier) is shown as it is.
 */
export const ProgramSelect: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
}> = ({ id, value, onChange, className }) => {
  const [typing, setTyping] = useState(false);
  const known = PROGRAMS.some((p) => same(p, value));

  if (typing) {
    return (
      <div className="relative w-full">
        <input
          id={id}
          type="text"
          autoFocus
          placeholder="Name of the program or project"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} pr-8 w-full`}
        />
        <button
          type="button"
          onClick={() => setTyping(false)}
          title="Choose from the list of programs"
          aria-label="Back to the list of programs"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-emerald-700 cursor-pointer p-0.5"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={known ? PROGRAMS.find((p) => same(p, value)) : value}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true);
          if (known) onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      className={`${className} cursor-pointer w-full`}
    >
      <option value="">None</option>
      {value.trim() && !known && <option value={value}>{value}</option>}
      {PROGRAMS.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
      <option value={OTHER}>+ Other (type the name)…</option>
    </select>
  );
};
