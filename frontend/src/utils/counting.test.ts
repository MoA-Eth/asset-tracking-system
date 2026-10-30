import { describe, expect, it } from 'vitest';
import { heldCounts, supplyKey } from './counting';

const rec = (name: string, itemType: string, uom: string, available: number, issued: number, ifmisItemCode = '') => ({ name, itemType, uom, ifmisItemCode, available, issued });

describe('counting what is held, as the dashboard does', () => {
  it('counts fixed assets in units and consumables by supply, never adding litres to pieces', () => {
    const records = [
      rec('Laptop', 'FIXED', 'EA', 7, 3),
      rec('Desk', 'FIXED', 'EA', 6, 0),
      rec('Diesel', 'CONSUMABLE', 'LTR', 1000, 0, '107201101.0007'),
      rec('Paper', 'CONSUMABLE', 'RM', 40, 10, '107101102.0005'),
      rec('Toner', 'CONSUMABLE', 'EA', 0, 20, '107101102.0006'),
      // Bought again under the same code (a stray space): still one supply
      rec('Toner', 'CONSUMABLE', 'EA', 0, 5, '107101102. 0006'),
      // All gone (disposed): not held
      rec('Old ink', 'CONSUMABLE', 'EA', 0, 0, '107101102.0099'),
    ];
    expect(heldCounts(records, (r) => r)).toEqual({
      fixed: { held: 16, inStore: 13, issued: 3 },
      supplies: { held: 3, inStore: 2, issued: 1 },
    });
  });

  it('keys a supply by its IFMIS code, or by name and unit without one', () => {
    expect(supplyKey({ ifmisItemCode: ' 107101102. 0006 ' })).toBe('code:107101102.0006');
    expect(supplyKey({ name: ' A4 Paper ', uom: 'rm' })).toBe('name:a4 paper|RM');
  });
});
