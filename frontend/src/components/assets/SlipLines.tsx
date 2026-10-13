import React from 'react';
import { Copy, X } from 'lucide-react';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';
import { inputClass } from '../ui/FormKit';
import { ITEM_TYPE_OPTIONS } from './asset-state';
import { COMMON_CATEGORIES } from './receipt-options';

/** One more item line from the same Model 19, registered as its own record when the receipt is submitted */
export interface SlipLine {
  key: number;
  name: string;
  category: AssetCategory | '';
  itemType: ItemType | '';
  condition: ItemCondition | '';
  uom: string;
  quantity: number;
  unitPrice: number;
  /** The IFMIS inventory code, kept in the remark as on the first line */
  ifmisCode?: string;
  /** Set when this line was already received on the same Model 19 No. */
  alreadyAs?: string;
}

/** What a line still needs before the receipt can be submitted */
export const lineMissing = (l: SlipLine): string[] =>
  [
    !l.name.trim() && 'description',
    !l.category && 'category',
    !l.itemType && 'item type',
    !l.condition && 'condition',
    !l.uom.trim() && 'unit',
    !(Number.isInteger(l.quantity) && l.quantity >= 1) && 'quantity',
    !(l.unitPrice > 0) && 'unit price',
  ].filter(Boolean) as string[];

const CONDITIONS: [ItemCondition, string][] = [
  [ItemCondition.NEW, 'New'],
  [ItemCondition.GOOD, 'Good'],
  [ItemCondition.FAIR, 'Fair'],
  [ItemCondition.NEEDS_REPAIR, 'Needs repair'],
  [ItemCondition.DAMAGED, 'Damaged'],
];

/**
 * The other item lines of a Model 19 read from its PDF. Each becomes its own record (its own row in Assets) with the
 * same voucher details; the user sets what the PDF doesn't say: item type and condition.
 */
export const SlipLines: React.FC<{
  lines: SlipLine[];
  onChange: (lines: SlipLine[]) => void;
  /** Copies the first item's type and condition into the lines that have none */
  onCopyFirst?: () => void;
}> = ({ lines, onChange, onCopyFirst }) => {
  const set = (key: number, patch: Partial<SlipLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const cell = (opts?: { align?: 'right'; invalid?: boolean; mono?: boolean }) => `${inputClass('emerald', opts)} !py-1 !text-xs`;
  const total = lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);

  return (
    <section aria-label="Other items on this slip" className="rounded-xl border border-slate-200 bg-slate-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">
          Other items on this slip ({lines.length})
          <span className="ml-1.5 font-normal text-slate-500">each is registered as its own record, with the same voucher details</span>
        </p>
        {onCopyFirst && (
          <button
            type="button"
            onClick={onCopyFirst}
            className="inline-flex items-center gap-1 rounded-[3px] border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800 cursor-pointer"
          >
            <Copy className="h-3 w-3" /> Use the first item's type and condition
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-2 py-1.5 w-8">#</th>
              <th className="px-2 py-1.5">Description</th>
              <th className="px-2 py-1.5 w-40">Category</th>
              <th className="px-2 py-1.5 w-36">Item type</th>
              <th className="px-2 py-1.5 w-28">Condition</th>
              <th className="px-2 py-1.5 w-16">Unit</th>
              <th className="px-2 py-1.5 w-20 text-right">Qty</th>
              <th className="px-2 py-1.5 w-28 text-right">Unit price</th>
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => {
              const n = i + 2;
              return (
                <tr key={l.key} className="align-top">
                  <td className="px-2 py-1.5 pt-2.5 font-mono text-slate-500">{n}</td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`Item ${n} description`} value={l.name} onChange={(e) => set(l.key, { name: e.target.value })} className={cell({ invalid: !l.name.trim() })} />
                    {l.alreadyAs && <p className="mt-0.5 text-[10px] text-amber-700">Already received as {l.alreadyAs}; remove it unless this is a second delivery.</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Item ${n} category`} value={l.category} onChange={(e) => set(l.key, { category: e.target.value as AssetCategory })} className={cell({ invalid: !l.category })}>
                      <option value="">Select…</option>
                      {COMMON_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Item ${n} item type`} value={l.itemType} onChange={(e) => set(l.key, { itemType: e.target.value as ItemType })} className={cell({ invalid: !l.itemType })}>
                      <option value="">Select…</option>
                      {ITEM_TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Item ${n} condition`} value={l.condition} onChange={(e) => set(l.key, { condition: e.target.value as ItemCondition })} className={cell({ invalid: !l.condition })}>
                      <option value="">Select…</option>
                      {CONDITIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`Item ${n} unit`} value={l.uom} onChange={(e) => set(l.key, { uom: e.target.value.toUpperCase() })} className={cell({ mono: true, invalid: !l.uom.trim() })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Item ${n} quantity`}
                      inputMode="numeric"
                      value={l.quantity || ''}
                      onChange={(e) => set(l.key, { quantity: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                      className={cell({ align: 'right', invalid: !(l.quantity >= 1) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Item ${n} unit price`}
                      inputMode="decimal"
                      value={l.unitPrice || ''}
                      onChange={(e) => set(l.key, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                      className={cell({ align: 'right', invalid: !(l.unitPrice > 0) })}
                    />
                  </td>
                  <td className="px-1 py-1.5 pt-2">
                    <button
                      type="button"
                      onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                      aria-label={`Remove item ${n}`}
                      title="Don't register this line"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-200 px-3 py-1.5 text-right text-[11px] text-slate-600">
        These lines: <span className="font-semibold tabular-nums text-slate-900">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETB</span>
      </p>
    </section>
  );
};
