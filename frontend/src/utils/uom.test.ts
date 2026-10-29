import { describe, expect, it } from 'vitest';
import { totalsByMeasure } from './uom';

describe('totalsByMeasure', () => {
  it('keeps litres apart from pieces', () => {
    expect(totalsByMeasure([
      { quantity: 10, uom: 'EA' },
      { quantity: 4, uom: 'pair' },
      { quantity: 20, uom: 'LTR' },
      { quantity: 5, uom: 'Lt' },
    ])).toEqual({ units: 14, litres: 25, other: {} });
  });

  it('turns millilitres and gallons into litres', () => {
    expect(totalsByMeasure([{ quantity: 500, uom: 'ML' }, { quantity: 2, uom: 'GALLON' }]).litres).toBe(8.07);
  });

  it('keeps weights and lengths in their own measure', () => {
    expect(totalsByMeasure([{ quantity: 1, uom: 'KG' }, { quantity: 2.5, uom: 'kg' }, { quantity: 3, uom: 'QTL' }, { quantity: 7, uom: 'EA' }])).toEqual({
      units: 7, litres: 0, other: { KG: 3.5, QTL: 3 },
    });
  });

  it('counts a line with no unit as pieces', () => {
    expect(totalsByMeasure([{ quantity: 3, uom: undefined }, { quantity: 1, uom: '' }]).units).toBe(4);
  });
});
