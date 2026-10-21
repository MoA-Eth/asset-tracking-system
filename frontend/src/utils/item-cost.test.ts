import { describe, expect, it } from 'vitest';
import { costOf, valueOf } from './item-cost';

describe('what one unit cost, as IFMIS carries it', () => {
  it('takes the cost the server sends', () => {
    expect(costOf({ costPerUnit: 18_963.5, unitCostETB: 16_490 })).toBe(18_963.5);
  });

  it('works it out from the Model 19 total when the server did not send it', () => {
    // The battery on the IFMIS Model 22: 16,490 + 15% VAT
    expect(costOf({ unitCostETB: 16_490, quantity: 1, vatApplicable: true, totalAmount: 18_963.5 })).toBe(18_963.5);
    // The GPS on the IFMIS Model 21: 542,857 + 15% VAT
    expect(valueOf({ unitCostETB: 542_857, quantity: 1, vatApplicable: true }, 1)).toBe(624_285.55);
    // Charges shared over the units: 2 chairs at 1,500 with 100 of transport
    expect(costOf({ unitCostETB: 1_500, quantity: 2, additionalCharges: 100 })).toBe(1_550);
  });

  it('leaves a purchase without VAT or charges, and a donation, as they are', () => {
    expect(costOf({ unitCostETB: 168.75, quantity: 5 })).toBe(168.75);
    expect(costOf({ unitCostETB: 0, quantity: 500 })).toBe(0);
    expect(costOf(undefined)).toBe(0);
  });
});
