import React from 'react';
import { Plus, X } from 'lucide-react';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';
import { inputClass, MoneyInput } from '../ui/FormKit';
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
  vatApplicable?: boolean;
  additionalCharges?: number;
  /** A consumable's IFMIS inventory code, read from the slip */
  ifmisCode?: string;
  /** The IFMIS sub inventory the slip printed for this line, kept for the voucher */
  subInventory?: string;
  /** Set when this line was already received on the same Model 19 No. */
  alreadyAs?: string;
  /** The quantity the slip printed, to warn when it lists several of a fixed asset */
  slipQuantity?: number;
}

/** An empty line added by hand */
export const blankLine = (): SlipLine => ({
  key: Date.now() + Math.random(),
  name: '',
  category: '',
  itemType: '',
  condition: ItemCondition.NEW,
  uom: 'EA',
  quantity: 0,
  unitPrice: 0,
  vatApplicable: false,
  additionalCharges: 0,
});

/** A fixed asset is one item, so its line is always quantity 1 */
export const oneIfFixed = (l: SlipLine): SlipLine => (l.itemType === ItemType.FIXED && l.quantity !== 1 ? { ...l, quantity: 1 } : l);

/** What a line still needs before the receipt can be submitted */
export const lineMissing = (l: SlipLine, donation = false): string[] =>
  [
    !l.name.trim() && 'description',
    !l.category && 'category',
    !l.ifmisCode?.trim() && 'item code',
    !!l.ifmisCode?.trim() && !l.itemType && 'item code starting with 0 or 1',
    !l.uom.trim() && 'unit',
    !(Number.isFinite(l.quantity) && l.quantity > 0) && 'quantity',
    !donation && !(l.unitPrice > 0) && 'unit price',
  ].filter(Boolean) as string[];

/** Fixed asset or consumable, as the item code says: shown, never chosen */
export const ItemTypeTag: React.FC<{ type: ItemType | ''; code?: string; label?: string }> = ({ type, code, label }) => {
  // Nothing to say until a code is typed: no empty badge taking room in the row
  if (!type && !code?.trim()) return null;
  const text = type === ItemType.FIXED ? 'Fixed asset' : type === ItemType.CONSUMABLE ? 'Consumable' : 'Check the code';
  const tone =
    type === ItemType.FIXED
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : type === ItemType.CONSUMABLE
        ? 'border-violet-200 bg-violet-50 text-violet-800'
        : 'border-rose-200 bg-rose-50 text-rose-700';
  return (
    <span aria-label={label} title={ITEM_CODE_RULE} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {text}
    </span>
  );
};

/** A compact input for a table cell */
export const cellClass = (opts?: { align?: 'right'; invalid?: boolean; mono?: boolean }) => `${inputClass('emerald', opts)} !px-2.5`;

export const money = (n: number) => {
  const decimals = (String(n).split('.')[1] || '').length;
  const maxDigits = Math.min(Math.max(decimals, 2), 6);
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
};

/**
 * Every item on the receipt, one row each, as on the Model 19 itself. The first row is the receipt's own item
 * (passed in as `first`); the others are lines read from the PDF or added by hand, each registered as its own
 * record with the same voucher details. The item type follows the IFMIS item code (1 = consumable, 0 = fixed asset).
 */
export const ReceiptItems: React.FC<{
  /** The row for item 1 */
  first: React.ReactNode;
  lines: SlipLine[];
  /** A donation has no price: the price columns are left out */
  donation?: boolean;
  onChange: (lines: SlipLine[]) => void;
  /** Adds an empty line; left out when correcting a receipt, which is one item */
  onAdd?: () => void;
  /** Grand total of all rows */
  total?: number;
}> = ({ first, lines, donation, onChange, onAdd, total }) => {
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

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1340px] text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs font-semibold text-slate-600">
              <th className="px-3 py-2.5 w-10 text-center">#</th>
              <th className="px-3 py-2.5 min-w-[240px]">Item description</th>
              <th className="px-3 py-2.5 w-56">IFMIS code</th>
              <th className="px-3 py-2.5 w-44">Category</th>
              <th className="px-3 py-2.5 w-24">Unit</th>
              <th className="px-3 py-2.5 w-24 text-right">Qty</th>
              {!donation && <th className="px-3 py-2.5 w-32 text-right">Unit price</th>}
              {!donation && <th className="px-3 py-2.5 w-28 text-center" title="15% VAT auto-calculated">VAT (15%)</th>}
              {!donation && <th className="px-3 py-2.5 w-32 text-right">Addl charges</th>}
              {!donation && <th className="px-3 py-2.5 w-36 text-right">Total</th>}
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {first}
            {lines.map((l, i) => {
              const n = i + 2;
              const lineBase = (l.quantity || 0) * (l.unitPrice || 0);
              const lineVat = l.vatApplicable ? Math.round(lineBase * 0.15 * 100) / 100 : 0;
              const lineTotal = donation ? 0 : lineBase + (l.vatApplicable ? lineVat : (l.additionalCharges || 0));
              return (
                <tr key={l.key} className="align-middle hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-slate-400 text-center text-xs">{n}</td>
                  <td className="px-3 py-2.5">
                    <input
                      aria-label={`Item ${n} description`}
                      placeholder="Item description *"
                      value={l.name}
                      onChange={(e) => set(l.key, { name: e.target.value })}
                      className={cellClass({ invalid: !l.name.trim() })}
                    />
                    {l.alreadyAs && <p className="mt-0.5 text-[10px] text-amber-700">Already received as {l.alreadyAs}; remove it unless this is a second delivery.</p>}
                    {l.itemType === ItemType.FIXED && (l.slipQuantity ?? 0) > 1 && (
                      <p className="mt-0.5 text-[10px] text-amber-700">The slip lists {l.slipQuantity}: a fixed asset is one item, so register the others as their own receipts.</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`Item ${n} item code`}
                        placeholder="e.g. 108101101.0021"
                        value={l.ifmisCode ?? ''}
                        onChange={(e) => set(l.key, { ifmisCode: e.target.value })}
                        className={cellClass({ mono: true, invalid: !l.ifmisCode?.trim() || !l.itemType })}
                      />
                      <ItemTypeTag type={l.itemType} code={l.ifmisCode} label={`Item ${n} item type`} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={`Item ${n} category`}
                      value={l.category}
                      onChange={(e) => set(l.key, { category: e.target.value as AssetCategory })}
                      className={cellClass({ invalid: !l.category })}
                    >
                      <option value="">Select category…</option>
                      {COMMON_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      aria-label={`Item ${n} unit`}
                      list="uom-options"
                      placeholder="EA"
                      value={l.uom}
                      onChange={(e) => set(l.key, { uom: e.target.value.toUpperCase() })}
                      className={`${cellClass({ mono: true, invalid: !l.uom.trim() })} uppercase`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      aria-label={`Item ${n} quantity`}
                      inputMode="numeric"
                      value={l.quantity || ''}
                      disabled={l.itemType === ItemType.FIXED}
                      title={l.itemType === ItemType.FIXED ? 'A fixed asset is one item' : undefined}
                      onChange={(e) => {
                        let clean = e.target.value.replace(/[^0-9.]/g, '');
                        const parts = clean.split('.');
                        if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
                        set(l.key, { quantity: clean === '' ? 0 : parseFloat(clean) || 0 });
                      }}
                      className={cellClass({ align: 'right', mono: true, invalid: !(l.quantity > 0) })}
                    />
                  </td>
                  {!donation && (
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        aria-label={`Item ${n} unit price`}
                        suffix=""
                        value={l.unitPrice}
                        onChange={(v) => set(l.key, { unitPrice: v })}
                        invalid={!(l.unitPrice > 0)}
                        placeholder="0.00"
                        inputClassName="!h-9 !px-2.5 !text-xs font-medium"
                      />
                    </td>
                  )}
                  {!donation && (
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <label
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer select-none"
                          title="15% VAT auto-calculated (no additional charges allowed)"
                        >
                          <input
                            aria-label={`Item ${n} VAT applicable`}
                            type="checkbox"
                            checked={!!l.vatApplicable}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              set(l.key, {
                                vatApplicable: checked,
                                additionalCharges: checked ? 0 : l.additionalCharges,
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                          />
                          <span className="text-[11px] font-semibold text-slate-700">15%</span>
                        </label>
                        {l.vatApplicable && lineVat > 0 && (
                          <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap" title="15% VAT auto-calculated">
                            +{money(lineVat)}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {!donation && (
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        aria-label={`Item ${n} additional charges`}
                        suffix=""
                        disabled={!!l.vatApplicable}
                        value={l.vatApplicable ? 0 : (l.additionalCharges || 0)}
                        onChange={(v) => set(l.key, { additionalCharges: v })}
                        placeholder="0.00"
                        title={l.vatApplicable ? 'Additional charges not allowed when price includes VAT' : undefined}
                        inputClassName={`!h-9 !px-2.5 !text-xs ${l.vatApplicable ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : ''}`}
                      />
                    </td>
                  )}
                  {!donation && (
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold text-xs whitespace-nowrap">
                      {money(lineTotal)} <span className="text-[10px] text-slate-400 font-normal">ETB</span>
                    </td>
                  )}
                  <td className="px-2 py-2.5 text-center">
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-3 py-2">
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        ) : (
          <span />
        )}
        {!donation && (
          <p className="text-xs text-slate-600">
            Grand total <span className="ml-1 font-mono text-sm font-semibold tabular-nums text-slate-900">{money(total)} ETB</span>
          </p>
        )}
      </div>
    </div>
  );
};
