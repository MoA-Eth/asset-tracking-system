/**
 * Units of measure: what can be added together. Pieces, pairs, packets and the like are counted; liquids are added up
 * in litres; weights, lengths and areas keep their own measure. Adding litres to pieces gives a figure nobody can read.
 */

/** Liquids, by how many litres one of them is */
const LITRES: Record<string, number> = {
  L: 1, LT: 1, LTR: 1, LTRS: 1, LITRE: 1, LITRES: 1, LITER: 1, LITERS: 1,
  ML: 0.001,
  GALLON: 3.785, GALLONS: 3.785, GAL: 3.785,
};

/** Weights, lengths and areas: kept in their own measure, never added to pieces */
const OWN_MEASURE = new Set(['KG', 'KGS', 'G', 'GM', 'GRAM', 'GRAMS', 'QUINTAL', 'QTL', 'TON', 'TONNE', 'MTR', 'M', 'METER', 'METRE', 'METERS', 'METRES', 'SQM', 'M2', 'M3']);

const clean = (uom?: string | null) => String(uom || 'EA').trim().toUpperCase();

export type MeasureTotals = {
  /** Counted pieces: EA, pairs, sets, packets, rolls, … */
  units: number;
  /** Liquids, in litres */
  litres: number;
  /** Everything else, by its own measure (e.g. KG: 68) */
  other: Record<string, number>;
};

/** Adds up quantities only where they can be added: pieces with pieces, litres with litres, kilograms with kilograms */
export function totalsByMeasure(lines: { quantity: number; uom?: string | null }[]): MeasureTotals {
  const totals: MeasureTotals = { units: 0, litres: 0, other: {} };
  for (const { quantity, uom } of lines) {
    const q = Number(quantity) || 0;
    const key = clean(uom);
    if (key in LITRES) totals.litres += q * LITRES[key];
    else if (OWN_MEASURE.has(key)) totals.other[key] = (totals.other[key] ?? 0) + q;
    else totals.units += q;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  totals.units = round(totals.units);
  totals.litres = round(totals.litres);
  for (const k of Object.keys(totals.other)) totals.other[k] = round(totals.other[k]);
  return totals;
}
