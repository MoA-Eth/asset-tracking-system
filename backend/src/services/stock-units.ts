/**
 * Consumable stock by unit of measure: quantities only add up within one unit, so litres are totalled with litres,
 * reams with reams, kilograms with kilograms. The spellings of a unit on slips (L, LT, LTR, Litre…) are one unit, and a
 * millilitre or gallon is converted to litres.
 */

interface UnitDef {
  key: string;
  label: string;
  /** How many of the unit one of the spelling is (ML → 0.001 litres) */
  factor?: number;
}

const UNITS: Record<string, UnitDef> = {};
const define = (key: string, label: string, spellings: string[], factors: Record<string, number> = {}) => {
  for (const s of spellings) UNITS[s] = { key, label, factor: factors[s] };
};
define('LITRE', 'Litres', ['L', 'LT', 'LTR', 'LTRS', 'LITRE', 'LITRES', 'LITER', 'LITERS', 'ML', 'GALLON', 'GALLONS', 'GAL'], { ML: 0.001, GALLON: 3.785, GALLONS: 3.785, GAL: 3.785 });
define('PIECE', 'Pieces', ['EA', 'EACH', 'PC', 'PCS', 'PIECE', 'PIECES', 'NO', 'NOS', 'UNIT', 'UNITS']);
define('KG', 'Kilograms', ['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS']);
define('GRAM', 'Grams', ['G', 'GM', 'GRAM', 'GRAMS']);
define('QUINTAL', 'Quintals', ['QUINTAL', 'QUINTALS', 'QTL']);
define('TONNE', 'Tonnes', ['TON', 'TONS', 'TONNE', 'TONNES']);
define('METRE', 'Metres', ['M', 'MTR', 'METER', 'METERS', 'METRE', 'METRES']);
define('REAM', 'Reams', ['RM', 'REAM', 'REAMS']);
define('BAG', 'Bags', ['BAG', 'BAGS']);
define('BOX', 'Boxes', ['BOX', 'BOXES']);
define('PACKET', 'Packets', ['PKT', 'PACK', 'PACKS', 'PACKET', 'PACKETS']);
define('CARTON', 'Cartons', ['CTN', 'CARTON', 'CARTONS']);
define('ROLL', 'Rolls', ['ROLL', 'ROLLS']);
define('SET', 'Sets', ['SET', 'SETS']);
define('PAIR', 'Pairs', ['PAIR', 'PAIRS']);
define('DOZEN', 'Dozens', ['DOZEN', 'DOZ']);
define('BOTTLE', 'Bottles', ['BOTTLE', 'BOTTLES']);
define('CAN', 'Cans', ['CAN', 'CANS']);
define('DRUM', 'Drums', ['DRUM', 'DRUMS']);
define('VIAL', 'Vials', ['VIAL', 'VIALS']);
define('TUBE', 'Tubes', ['TUBE', 'TUBES']);
define('SHEET', 'Sheets', ['SHEET', 'SHEETS']);

/** The unit a slip's spelling stands for; one not known keeps its own spelling */
export function unitOf(uom?: string | null): UnitDef {
  const spelled = String(uom || 'EA').trim().toUpperCase().replace(/\.$/, '');
  return UNITS[spelled] ?? { key: spelled, label: spelled };
}

export interface StockByUnitRow {
  unit: string;
  label: string;
  /** Different supplies counted in this unit */
  items: number;
  /** Quantity in store */
  inStore: number;
  /** Quantity issued and held by staff or directorates */
  issued: number;
}

/** Consumables held, by unit: largest stock in store first */
export function stockByUnit<T extends { uom?: string | null; quantity?: number | null }>(
  records: T[],
  supplyKey: (r: T) => string,
  isInStore: (r: T) => boolean,
): StockByUnitRow[] {
  const rows = new Map<string, StockByUnitRow & { supplies: Set<string> }>();
  for (const r of records) {
    const unit = unitOf(r.uom);
    const qty = (Number(r.quantity) || 0) * (unit.factor ?? 1);
    const row = rows.get(unit.key) ?? { unit: unit.key, label: unit.label, items: 0, inStore: 0, issued: 0, supplies: new Set<string>() };
    row.supplies.add(supplyKey(r));
    if (isInStore(r)) row.inStore += qty;
    else row.issued += qty;
    rows.set(unit.key, row);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...rows.values()]
    .map(({ supplies, ...row }) => ({ ...row, items: supplies.size, inStore: round(row.inStore), issued: round(row.issued) }))
    .sort((a, b) => b.inStore - a.inStore || a.label.localeCompare(b.label));
}
