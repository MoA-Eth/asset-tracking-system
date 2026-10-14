import React from 'react';
import { X } from 'lucide-react';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';
import { inputClass } from '../ui/FormKit';
import { COMMON_CATEGORIES, ITEM_CODE_RULE, itemTypeFromIfmisCode } from './receipt-options';

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
  /** A consumable's IFMIS inventory code, read from the slip */
  ifmisCode?: string;
  /** A fixed asset's tag number, typed: it becomes its item code */
  tag?: string;
  /** Set when this line was already received on the same Model 19 No. */
  alreadyAs?: string;
  /** The quantity the slip printed, to warn when it lists several of a fixed asset */
  slipQuantity?: number;
}

/** A fixed asset is one tagged item, so its line is always quantity 1 */
export const oneIfFixed = (l: SlipLine): SlipLine => (l.itemType === ItemType.FIXED && l.quantity !== 1 ? { ...l, quantity: 1 } : l);

/** What a line still needs before the receipt can be submitted */
export const lineMissing = (l: SlipLine, donation = false): string[] =>
  [
    !l.name.trim() && 'description',
    !l.category && 'category',
    !l.ifmisCode?.trim() && 'item code',
    !!l.ifmisCode?.trim() && !l.itemType && 'item code starting with 0 or 1',
    l.itemType === ItemType.FIXED && !l.tag?.trim() && 'tag number',
    !l.uom.trim() && 'unit',
    !(Number.isInteger(l.quantity) && l.quantity >= 1) && 'quantity',
    !donation && !(l.unitPrice > 0) && 'unit price',
  ].filter(Boolean) as string[];

/** Fixed asset or consumable, as the item code says: shown, never chosen */
export const ItemTypeTag: React.FC<{ type: ItemType | ''; code?: string; label?: string }> = ({ type, code, label }) => {
  const text = type === ItemType.FIXED ? 'Fixed asset' : type === ItemType.CONSUMABLE ? 'Consumable' : code?.trim() ? 'Check the code' : 'From the code';
  const tone =
    type === ItemType.FIXED
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : type === ItemType.CONSUMABLE
        ? 'border-violet-200 bg-violet-50 text-violet-800'
        : code?.trim()
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-400';
  return (
    <span aria-label={label} title={ITEM_CODE_RULE} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {text}
    </span>
  );
};

/**
 * The other item lines of a Model 19 read from its PDF. Each becomes its own record (its own row in Assets) with the
 * same voucher details. The item type follows the IFMIS item code (1 = consumable, 0 = fixed asset).
 */
export const SlipLines: React.FC<{
  lines: SlipLine[];
  /** A donation has no price: the price column is left out */
  donation?: boolean;
  onChange: (lines: SlipLine[]) => void;
}> = ({ lines, donation, onChange }) => {
  const set = (key: number, patch: Partial<SlipLine>) =>
    onChange(
      lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // The item code decides fixed asset or consumable
        if ('ifmisCode' in patch) next.itemType = itemTypeFromIfmisCode(next.ifmisCode) ?? '';
        return oneIfFixed(next);
      }),
    );
  const cell = (opts?: { align?: 'right'; invalid?: boolean; mono?: boolean }) => `${inputClass('emerald', opts)} !py-1 !text-xs`;
  const total = lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);

  return (
    <section aria-label="Other items on this slip" className="rounded-xl border border-slate-200 bg-slate-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">
          Other items on this slip ({lines.length})
          <span className="ml-1.5 font-normal text-slate-500">each is registered as its own record, with the same voucher details</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-2 py-1.5 w-8">#</th>
              <th className="px-2 py-1.5 min-w-[220px]">Description</th>
              <th className="px-2 py-1.5 w-56">IFMIS item code</th>
              <th className="px-2 py-1.5 w-36">Tag number</th>
              <th className="px-2 py-1.5 w-40">Category</th>
              <th className="px-2 py-1.5 w-16">Unit</th>
              <th className="px-2 py-1.5 w-20 text-right">Qty</th>
              {!donation && <th className="px-2 py-1.5 w-28 text-right">Unit price</th>}
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
                    {l.itemType === ItemType.FIXED && (l.slipQuantity ?? 0) > 1 && (
                      <p className="mt-0.5 text-[10px] text-amber-700">The slip lists {l.slipQuantity}: a fixed asset is one item, so register the others as their own receipts.</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`Item ${n} item code`}
                        placeholder="e.g. 108101101.0021"
                        value={l.ifmisCode ?? ''}
                        onChange={(e) => set(l.key, { ifmisCode: e.target.value })}
                        className={cell({ mono: true, invalid: !l.ifmisCode?.trim() || !l.itemType })}
                      />
                      <ItemTypeTag type={l.itemType} code={l.ifmisCode} label={`Item ${n} item type`} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {l.itemType === ItemType.FIXED ? (
                      <input aria-label={`Item ${n} tag number`} placeholder="MOA-…" value={l.tag ?? ''} onChange={(e) => set(l.key, { tag: e.target.value.toUpperCase() })} className={cell({ mono: true, invalid: !l.tag?.trim() })} />
                    ) : (
                      <span className="block pt-1.5 text-slate-400" title="Only a fixed asset has a tag number">—</span>
                    )}
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
                    <input aria-label={`Item ${n} unit`} value={l.uom} onChange={(e) => set(l.key, { uom: e.target.value.toUpperCase() })} className={cell({ mono: true, invalid: !l.uom.trim() })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Item ${n} quantity`}
                      inputMode="numeric"
                      value={l.quantity || ''}
                      disabled={l.itemType === ItemType.FIXED}
                      title={l.itemType === ItemType.FIXED ? 'A fixed asset is one item' : undefined}
                      onChange={(e) => set(l.key, { quantity: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                      className={cell({ align: 'right', invalid: !(l.quantity >= 1) })}
                    />
                  </td>
                  {!donation && (
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Item ${n} unit price`}
                      inputMode="decimal"
                      value={l.unitPrice || ''}
                      onChange={(e) => set(l.key, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                      className={cell({ align: 'right', invalid: !(l.unitPrice > 0) })}
                    />
                  </td>
                  )}
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
      {!donation && (
      <p className="border-t border-slate-200 px-3 py-1.5 text-right text-[11px] text-slate-600">
        These lines: <span className="font-semibold tabular-nums text-slate-900">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETB</span>
      </p>
      )}
    </section>
  );
};
