import { describe, expect, it } from 'vitest';
import { stockByUnit, unitOf } from './stock-units';

const rec = (code: string, uom: string, quantity: number, inStore = true) => ({ code, uom, quantity, inStore });

describe('consumable stock by unit', () => {
  it('totals each unit on its own, with the spellings of a unit as one and millilitres in litres', () => {
    const rows = stockByUnit(
      [
        rec('diesel', 'LTR', 1000),
        rec('oil', 'Litre', 40),
        rec('oil', 'L', 20, false),
        rec('ink', 'ML', 500),
        rec('paper', 'RM', 40),
        rec('paper', 'RM', 10, false),
        rec('toner', 'EA', 20, false),
        rec('seed', 'kg', 300),
      ],
      (r) => r.code,
      (r) => r.inStore,
    );
    expect(rows).toEqual([
      { unit: 'LITRE', label: 'Litres', items: 3, inStore: 1040.5, issued: 20 },
      { unit: 'KG', label: 'Kilograms', items: 1, inStore: 300, issued: 0 },
      { unit: 'REAM', label: 'Reams', items: 1, inStore: 40, issued: 10 },
      { unit: 'PIECE', label: 'Pieces', items: 1, inStore: 0, issued: 20 },
    ]);
  });

  it('keeps a unit it does not know under its own name', () => {
    expect(unitOf('Sachet')).toEqual({ key: 'SACHET', label: 'SACHET' });
    expect(unitOf(undefined).label).toBe('Pieces');
  });
});
