import React from 'react';
import { Plus, X } from 'lucide-react';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';
import { inputClass, MoneyInput } from '../ui/FormKit';
import { COMMON_CATEGORIES, ITEM_CODE_RULE, itemTypeFromIfmisCode } from './receipt-options';
import { UomSelect } from './UomSelect';
import { formatETB } from '../../utils/eth-date';

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
  quantity: 1,
  unitPrice: 0,
  vatApplicable: false,
  additionalCharges: 0,
});

/** Whether a line is a fixed asset: by its code (3… is fixed), else by the type chosen */
export const isLineFixed = (l: { ifmisCode?: string; itemType?: ItemType | '' }): boolean => {
  const code = l.ifmisCode?.trim();
  if (code) return itemTypeFromIfmisCode(code) === ItemType.FIXED;
  return l.itemType === ItemType.FIXED;
};

/** Kept for the slip-quantity warning; Qty is always editable so this no longer forces qty=1 */
export const oneIfFixed = (l: SlipLine): SlipLine => l;

/** What a line still needs before the receipt can be submitted */
export const lineMissing = (l: SlipLine, _donation = false): string[] =>
  [
    !l.name.trim() && 'description',
    !l.category && 'category',
    !l.ifmisCode?.trim() && 'item code',
    !l.itemType && 'item type',
    !l.uom.trim() && 'unit',
    !(Number.isFinite(l.quantity) && l.quantity > 0) && 'quantity',
  ].filter(Boolean) as string[];

/** Fixed asset or consumable, as the item code says: shown as a badge, clickable to toggle */
export const ItemTypeTag: React.FC<{
  type: ItemType | '';
  code?: string;
  label?: string;
  onToggle?: () => void;
}> = ({ type, code, label, onToggle }) => {
  // Nothing to say until a code is typed or type is set
  if (!type && !code?.trim()) return null;
  const effectiveType = type || (code ? itemTypeFromIfmisCode(code) : undefined) || ItemType.FIXED;
  const text = effectiveType === ItemType.FIXED ? 'Fixed asset' : effectiveType === ItemType.CONSUMABLE ? 'Consumable' : 'Fixed asset';
  const tone =
    effectiveType === ItemType.FIXED
      ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100/80'
      : effectiveType === ItemType.CONSUMABLE
        ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100/80'
        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/80';

  const title = onToggle
    ? `${text} · Click to switch to ${effectiveType === ItemType.FIXED ? 'consumable' : 'fixed asset'}`
    : ITEM_CODE_RULE;

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        title={title}
        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-all active:scale-95 cursor-pointer select-none ${tone}`}
      >
        {text}
      </button>
    );
  }

  return (
    <span aria-label={label} title={title} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {text}
    </span>
  );
};

/** A compact input for a table cell */
export const cellClass = (opts?: { align?: 'left' | 'right' | 'center'; invalid?: boolean; mono?: boolean }) => `${inputClass('emerald', opts)} !h-9 !px-2.5 !text-xs !rounded-md`;

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
  /** Whether 15% VAT applies to all items on this receipt (switched above the table); each total then includes it */
  vatApplicable?: boolean;
  onChange: (lines: SlipLine[]) => void;
  /** Adds an empty line; left out when correcting a receipt, which is one item */
  onAdd?: () => void;
  /** Grand total of all rows */
  total?: number;
}> = ({ first, lines, donation, vatApplicable, onChange, onAdd, total }) => {
  const set = (key: number, patch: Partial<SlipLine>) =>
    onChange(
      lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // The item code decides fixed asset or consumable if itemType was not explicitly provided
        if ('ifmisCode' in patch && !('itemType' in patch)) {
          next.itemType = itemTypeFromIfmisCode(next.ifmisCode) ?? '';
          // Always default to 1 if qty is unset; Qty is always editable
          if (!next.quantity || next.quantity === 0) {
            next.quantity = 1;
          }
        }
        return next;
      }),
    );

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className="overflow-x-auto">
        {/* Fits a laptop screen (about 960 px) with the description as the widest column; narrower screens scroll */}
        <table className="w-full min-w-[880px] text-xs table-fixed">
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '158px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '54px' }} />
            {!donation && <col style={{ width: '96px' }} />}
            {!donation && <col style={{ width: '82px' }} />}
            {!donation && <col style={{ width: '108px' }} />}
            <col style={{ width: '36px' }} />
          </colgroup>
          <thead className="bg-slate-50/90 border-b border-slate-200/90 shadow-2xs">
            <tr className="text-xs font-semibold text-slate-600">
              <th className="px-2 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5 text-left">Item description</th>
              <th className="px-3 py-2.5 text-left">IFMIS code</th>
              <th className="px-3 py-2.5 text-left">Category</th>
              <th className="px-2 py-2.5 text-center">Unit</th>
              <th className="px-2 py-2.5 text-center">Qty</th>
              {!donation && <th className="px-3 py-2.5 text-right">Unit price</th>}
              {!donation && <th className="px-3 py-2.5 text-right" title="Additional charges (transport, installation…); not with VAT">Charges</th>}
              {!donation && <th className="px-3 py-2.5 text-right">Total</th>}
              <th className="px-2 py-2.5 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {first}
            {lines.map((l, i) => {
              const n = i + 2;
              const isVat = Boolean(vatApplicable ?? l.vatApplicable);
              const lineBase = (l.quantity || 0) * (l.unitPrice || 0);
              const lineVat = isVat ? Math.round(lineBase * 0.15 * 100) / 100 : 0;
              const lineTotal = donation ? 0 : lineBase + (isVat ? lineVat : (l.additionalCharges || 0));
              return (
                <tr key={l.key} className="align-middle hover:bg-slate-50/50 transition-colors">
                  <td className="px-2 py-2.5 font-mono text-slate-400 text-center text-xs">{n}</td>
                  <td className="px-3 py-2.5">
                    <input
                      aria-label={`Item ${n} description`}
                      placeholder="Item description"
                      value={l.name}
                      onChange={(e) => set(l.key, { name: e.target.value })}
                      className={cellClass({ invalid: !l.name.trim() })}
                    />
                    {l.alreadyAs && <p className="mt-0.5 text-[10px] font-semibold text-rose-600">Already received as {l.alreadyAs}. Duplicate entrance is not permitted.</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      <input
                        aria-label={`Item ${n} item code`}
                        placeholder="e.g. 108101101.0021"
                        value={l.ifmisCode ?? ''}
                        onChange={(e) => set(l.key, { ifmisCode: e.target.value })}
                        className={cellClass({ mono: true, invalid: !l.ifmisCode?.trim() || !l.itemType })}
                      />
                      <ItemTypeTag
                        type={l.itemType}
                        code={l.ifmisCode}
                        label={`Item ${n} item type`}
                        onToggle={() =>
                          set(l.key, {
                            itemType: l.itemType === ItemType.CONSUMABLE ? ItemType.FIXED : ItemType.CONSUMABLE,
                          })
                        }
                      />
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
                  <td className="px-2 py-2.5">
                    <UomSelect
                      ariaLabel={`Item ${n} unit`}
                      value={l.uom}
                      onChange={(newUom) => set(l.key, { uom: newUom })}
                      invalid={!l.uom.trim()}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      aria-label={`Item ${n} quantity`}
                      inputMode="numeric"
                      value={l.quantity || ''}
                      onChange={(e) => {
                        let clean = e.target.value.replace(/[^0-9.]/g, '');
                        const parts = clean.split('.');
                        if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
                        set(l.key, { quantity: clean === '' ? 0 : parseFloat(clean) || 0 });
                      }}
                      className={cellClass({ align: 'center', mono: true, invalid: !(l.quantity > 0) })}
                    />
                  </td>
                  {!donation && (
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        aria-label={`Item ${n} unit price`}
                        suffix=""
                        value={l.unitPrice}
                        onChange={(v) => set(l.key, { unitPrice: v })}
                        placeholder="0.00"
                        inputClassName="!h-9 !px-2.5 !text-xs font-medium !rounded-md"
                      />
                    </td>
                  )}
                  {!donation && (
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        aria-label={`Item ${n} additional charges`}
                        suffix=""
                        disabled={isVat}
                        value={isVat ? 0 : (l.additionalCharges || 0)}
                        onChange={(v) => set(l.key, { additionalCharges: v })}
                        placeholder="0.00"
                        title={isVat ? 'Additional charges not allowed when price includes VAT' : undefined}
                        inputClassName={`!h-9 !px-2.5 !text-xs !rounded-md ${isVat ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : ''}`}
                      />
                    </td>
                  )}
                  {!donation && (
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold text-xs whitespace-nowrap">
                      {money(lineTotal)} <span className="text-[10px] text-slate-400 font-normal">ETB</span>
                      {isVat && lineVat > 0 && <span className="block text-[10px] font-normal text-emerald-700">incl. VAT {money(lineVat)}</span>}
                    </td>
                  )}
                  <td className="px-1.5 py-2.5 text-center">
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
            Grand total <span className="ml-1 font-mono text-sm font-semibold tabular-nums text-slate-900">{formatETB(total)}</span>
          </p>
        )}
      </div>
    </div>
  );
};
