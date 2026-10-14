import React, { useState } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';
import { inputClass } from '../ui/FormKit';
import { ITEM_TYPE_OPTIONS } from './asset-state';
import { COMMON_CATEGORIES } from './receipt-options';

/** One item line of a receipt; each is registered as its own record when the receipt is submitted */
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
    !l.itemType && 'item type',
    l.itemType === ItemType.FIXED && !l.tag?.trim() && 'tag number',
    l.itemType === ItemType.CONSUMABLE && !l.ifmisCode?.trim() && 'item code',
    !l.condition && 'condition',
    !l.uom.trim() && 'unit',
    !(Number.isInteger(l.quantity) && l.quantity >= 1) && 'quantity',
    !donation && !(l.unitPrice > 0) && 'unit price',
  ].filter(Boolean) as string[];

/** An empty line, for an item typed in by hand */
export const blankLine = (): SlipLine => ({
  key: Date.now() + Math.random(),
  name: '',
  category: '',
  itemType: '',
  condition: ItemCondition.NEW,
  uom: 'EA',
  quantity: 0,
  unitPrice: 0,
});

const CONDITIONS: [ItemCondition, string][] = [
  [ItemCondition.NEW, 'New'],
  [ItemCondition.GOOD, 'Good'],
  [ItemCondition.FAIR, 'Fair'],
  [ItemCondition.NEEDS_REPAIR, 'Needs repair'],
  [ItemCondition.DAMAGED, 'Damaged'],
];

/**
 * Every item of the receipt in one table, one row per line, the way receipt screens of ERP systems work:
 * the Model 19 PDF fills the rows, and an empty required cell is marked. Each row becomes its own record.
 */
export const ReceiptItems: React.FC<{
  lines: SlipLine[];
  /** A donation has no price: the price and total columns are left out */
  donation?: boolean;
  onLineChange: (key: number, patch: Partial<SlipLine>) => void;
  /** Lines that can be taken out; the first line always stays */
  onRemove?: (key: number) => void;
  onAdd?: () => void;
  /** Mark empty required cells (once a slip was read or submitting was tried) */
  showGaps?: boolean;
  /** The first line's tag number can't change once registered */
  lockFirstCode?: boolean;
  /** Extra fields of the first line, opened from its ⋯ button (serial number, remark) */
  firstDetails?: React.ReactNode;
}> = ({ lines, donation, onLineChange, onRemove, onAdd, showGaps = false, lockFirstCode = false, firstDetails }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const set = (l: SlipLine, patch: Partial<SlipLine>) => {
    const next = oneIfFixed({ ...l, ...patch });
    onLineChange(l.key, Object.fromEntries(Object.entries(next).filter(([k, v]) => (l as any)[k] !== v)) as Partial<SlipLine>);
  };
  const cell = (opts?: { align?: 'right'; invalid?: boolean; mono?: boolean }) =>
    `${inputClass('emerald', { ...opts, invalid: showGaps && opts?.invalid })} !py-1 !text-xs`;
  const total = lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <section aria-label="Items on this receipt" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Items ({lines.length})</h3>
        <span className="text-[11px] text-slate-400">each is registered as its own record, with the voucher details above</span>
      </div>
      {/* Two lines per item, so the list fits the form without scrolling sideways:
          the line itself (description, quantity, price), then what kind of item it is */}
      <div className="hidden sm:grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4rem_6.5rem_6.5rem_3.5rem] gap-x-2 border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span>#</span>
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span>Unit</span>
        {!donation ? <span className="text-right">Unit price</span> : <span />}
        {!donation ? <span className="text-right">Total</span> : <span />}
        <span />
      </div>
      <ol className="divide-y divide-slate-100">
        {lines.map((l, i) => {
          const n = i + 1;
          const first = i === 0;
          const fixed = l.itemType === ItemType.FIXED;
          const caption = 'mb-0.5 block text-[10px] font-medium text-slate-500';
          return (
            <li key={l.key} className="px-3 py-2.5">
              {/* Line 1: the item and its figures */}
              <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4rem_6.5rem_6.5rem_3.5rem] items-start gap-x-2 gap-y-1.5">
                <span className="pt-1.5 font-mono text-xs text-slate-500">{n}</span>
                <div className="min-w-0">
                  <input aria-label={`Item ${n} description`} placeholder="Item description" value={l.name} onChange={(e) => set(l, { name: e.target.value })} className={cell({ invalid: !l.name.trim() })} />
                  {l.alreadyAs && <p className="mt-0.5 text-[10px] text-amber-700">Already received as {l.alreadyAs}; remove it unless this is a second delivery.</p>}
                  {fixed && (l.slipQuantity ?? 0) > 1 && (
                    <p className="mt-0.5 text-[10px] text-amber-700">The slip lists {l.slipQuantity}: a fixed asset is one item, so register the others as their own receipts.</p>
                  )}
                </div>
                {/* On phones the figures move to their own row under the description */}
                <div className="col-start-2 row-start-2 grid grid-cols-4 gap-x-2 sm:contents">
                  <input
                    aria-label={`Item ${n} quantity`}
                    inputMode="numeric"
                    placeholder="0"
                    value={l.quantity || ''}
                    disabled={fixed}
                    title={fixed ? 'A fixed asset is one item' : 'Quantity'}
                    onChange={(e) => set(l, { quantity: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                    className={cell({ align: 'right', invalid: !(l.quantity >= 1) })}
                  />
                  <input aria-label={`Item ${n} unit`} list="uom-options" title="Unit of measure" value={l.uom} onChange={(e) => set(l, { uom: e.target.value.toUpperCase() })} className={cell({ mono: true, invalid: !l.uom.trim() })} />
                  {!donation ? (
                    <input
                      aria-label={`Item ${n} unit price`}
                      inputMode="decimal"
                      title="Unit price (ETB)"
                      value={l.unitPrice || ''}
                      onChange={(e) => set(l, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                      className={cell({ align: 'right', invalid: !(l.unitPrice > 0) })}
                    />
                  ) : (
                    <span />
                  )}
                  {!donation ? (
                    <span className="pt-1.5 text-right font-mono text-xs tabular-nums text-slate-800">{money((l.quantity || 0) * (l.unitPrice || 0))}</span>
                  ) : (
                    <span />
                  )}
                </div>
                <div className="col-start-3 row-start-1 sm:col-start-auto flex justify-end gap-0.5 pt-0.5">
                  {first && firstDetails && (
                    <button
                      type="button"
                      onClick={() => setDetailsOpen((o) => !o)}
                      aria-expanded={detailsOpen}
                      aria-label={`More details of item ${n}`}
                      title="Serial number and remark"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!first && onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(l.key)}
                      aria-label={`Remove item ${n}`}
                      title="Don't register this line"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Line 2: what kind of item it is */}
              <div className="mt-1.5 ml-8 grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-4">
                <label className="min-w-0">
                  <span className={caption}>Item type</span>
                  <select aria-label={`Item ${n} item type`} value={l.itemType} onChange={(e) => set(l, { itemType: e.target.value as ItemType })} className={cell({ invalid: !l.itemType })}>
                    <option value="">Select…</option>
                    {ITEM_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={caption}>{fixed ? 'Tag number' : l.itemType === ItemType.CONSUMABLE ? 'Item code' : 'Tag / item code'}</span>
                  {first && lockFirstCode ? (
                    <input aria-label={`Item ${n} code`} disabled value={(fixed ? l.tag : l.ifmisCode) ?? ''} title="It can't be changed after registration" className={cell({ mono: true })} />
                  ) : fixed ? (
                    <input aria-label={`Item ${n} tag number`} placeholder="MOA-…" value={l.tag ?? ''} onChange={(e) => set(l, { tag: e.target.value.toUpperCase() })} className={cell({ mono: true, invalid: !l.tag?.trim() })} />
                  ) : l.itemType === ItemType.CONSUMABLE ? (
                    <input aria-label={`Item ${n} item code`} value={l.ifmisCode ?? ''} onChange={(e) => set(l, { ifmisCode: e.target.value })} className={cell({ mono: true, invalid: !l.ifmisCode?.trim() })} />
                  ) : (
                    <input aria-label={`Item ${n} code`} disabled placeholder="Choose the type first" className={cell({ mono: true })} />
                  )}
                </label>
                <label className="min-w-0">
                  <span className={caption}>Category</span>
                  <select aria-label={`Item ${n} category`} value={l.category} onChange={(e) => set(l, { category: e.target.value as AssetCategory })} className={cell({ invalid: !l.category })}>
                    <option value="">Select…</option>
                    {COMMON_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={caption}>Condition</span>
                  <select aria-label={`Item ${n} condition`} value={l.condition} onChange={(e) => set(l, { condition: e.target.value as ItemCondition })} className={cell({ invalid: !l.condition })}>
                    <option value="">Select…</option>
                    {CONDITIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {first && firstDetails && detailsOpen && <div className="mt-2 ml-8">{firstDetails}</div>}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5">
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-50 cursor-pointer"
          >
            <Plus className="h-3 w-3" /> Add item
          </button>
        ) : (
          <span />
        )}
        {!donation && (
          <p className="text-[11px] text-slate-600">
            Total: <span className="font-semibold tabular-nums text-slate-900">{money(total)} ETB</span>
          </p>
        )}
      </div>
    </section>
  );
};
