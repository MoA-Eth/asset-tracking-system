/**
 * What one unit of a record cost: its Model 19 total ÷ its quantity, so the VAT and additional charges paid are in
 * it, as IFMIS carries cost on the Model 22 and Model 21 (a battery bought at 16,490 + 15% VAT is issued at
 * 18,963.50). The server sends it as costPerUnit; an older payload is worked out the same way. The unit price on
 * the receipt (unitCostETB) stays the price before VAT: the receive form and the Model 19 show that one.
 */
export const costOf = (
  item?: { costPerUnit?: number; unitCostETB?: number; quantity?: number; totalAmount?: number; vatApplicable?: boolean; additionalCharges?: number } | null,
): number => {
  if (!item) return 0;
  // To 5 decimals, as IFMIS prints a unit price (18,963.50000)
  const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
  if (typeof item.costPerUnit === 'number' && Number.isFinite(item.costPerUnit)) return item.costPerUnit;
  const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  if (Number(item.totalAmount) > 0) return round5(Number(item.totalAmount) / qty);
  const unit = Number(item.unitCostETB) || 0;
  if (item.vatApplicable) return round5(unit * 1.15);
  return round5(unit + (Number(item.additionalCharges) || 0) / qty);
};

/** The value of some units of a record, to the cent */
export const valueOf = (item: Parameters<typeof costOf>[0], units: number): number => Math.round(costOf(item) * units * 100) / 100;
