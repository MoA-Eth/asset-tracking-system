import React from 'react';

export interface OtherAsset {
  key: number;
  /** The item code, or the tag printed on the form when no record has it */
  code: string;
  name?: string;
  /** Why this asset can't go with the others; none when it can */
  problem?: string;
}

/**
 * The other assets an IFMIS form lists besides the one in the form, each checked in the order of operations.
 * Those that fit are submitted as their own requests with the same voucher; any can be left out.
 */
export const OtherAssets: React.FC<{
  label: string;
  note: string;
  okLabel: string;
  notLabel: string;
  assets: OtherAsset[];
  onLeaveOut: (key: number) => void;
}> = ({ label, note, okLabel, notLabel, assets, onLeaveOut }) => (
  <section aria-label={label} className="rounded-xl border border-slate-200 bg-slate-50/40">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
      <p className="text-xs font-semibold text-slate-800">
        {label} ({assets.length})<span className="ml-1.5 font-normal text-slate-500">{note}</span>
      </p>
    </div>
    <ul className="divide-y divide-slate-100 text-xs">
      {assets.map((o) => (
        <li key={o.key} className="flex items-start justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="font-mono font-semibold text-slate-800">{o.code}</span>
            {o.name && <span className="ml-2 text-slate-700">{o.name}</span>}
            {o.problem && <span className="mt-0.5 block text-[11px] text-amber-800">{o.problem}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.problem ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {o.problem ? notLabel : okLabel}
            </span>
            <button
              type="button"
              onClick={() => onLeaveOut(o.key)}
              aria-label={`Leave out ${o.code}`}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
            >
              Leave out
            </button>
          </span>
        </li>
      ))}
    </ul>
  </section>
);
