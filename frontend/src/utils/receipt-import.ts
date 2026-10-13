import { AssetCategory, CreateStockInRequest, ItemCondition, ItemType, Location, StoreKeeper } from '../types/asset-management';
import { CATEGORY_FROM_IFMIS, COMMON_CATEGORIES } from '../components/assets/receipt-options';
import { parseCsv } from './employee-import';
import { toIsoDate } from './slip-reader';

export type ReceiptField =
  | 'slipNumber'
  | 'receivedDate'
  | 'store'
  | 'location'
  | 'name'
  | 'category'
  | 'itemType'
  | 'uom'
  | 'quantity'
  | 'unitPrice'
  | 'condition'
  | 'itemCode'
  | 'serialNumber'
  | 'transactionType'
  | 'poNumber'
  | 'source'
  | 'buyer'
  | 'programName'
  | 'deliveredBy'
  | 'storeMan'
  | 'remark';

/**
 * The columns of the receipt import, in template order. One row is one receipt line, the same as one
 * "Receive items" form: an item with its quantity, on a Model 19.
 */
export const RECEIPT_FIELDS: { key: ReceiptField; heading: string; required?: boolean; aliases: string[] }[] = [
  { key: 'slipNumber', heading: 'Model 19 No.', required: true, aliases: ['model 19', 'model 19 no', 'inv model 19 no', 'slip no', 'slip number', 'ifmis slip number', 'voucher no'] },
  { key: 'receivedDate', heading: 'Received date', required: true, aliases: ['date', 'slip date', 'receipt date', 'date received'] },
  { key: 'store', heading: 'Store', required: true, aliases: ['receiving store', 'store name'] },
  { key: 'location', heading: 'Location in store', aliases: ['location', 'store location', 'room'] },
  { key: 'name', heading: 'Item description', required: true, aliases: ['description', 'item', 'item name', 'name', 'asset name'] },
  { key: 'category', heading: 'Category', required: true, aliases: ['item category', 'asset category'] },
  { key: 'itemType', heading: 'Item type', required: true, aliases: ['type', 'fixed or consumable', 'fixed consumable'] },
  { key: 'uom', heading: 'Unit of measure', required: true, aliases: ['uom', 'unit'] },
  { key: 'quantity', heading: 'Quantity', required: true, aliases: ['qty'] },
  { key: 'unitPrice', heading: 'Unit price (ETB)', required: true, aliases: ['unit price', 'unit cost', 'unit cost etb', 'price'] },
  { key: 'condition', heading: 'Condition', aliases: ['physical condition'] },
  { key: 'itemCode', heading: 'Item code', aliases: ['tag number', 'tag no', 'asset code'] },
  { key: 'serialNumber', heading: 'Serial number', aliases: ['serial', 'serial no'] },
  { key: 'transactionType', heading: 'Transaction type', aliases: [] },
  { key: 'poNumber', heading: 'PO number', aliases: ['po', 'po no', 'purchase order'] },
  { key: 'source', heading: 'Source', aliases: ['supplier', 'vendor'] },
  { key: 'buyer', heading: 'Buyer', aliases: [] },
  { key: 'programName', heading: 'Program', aliases: ['program name', 'project'] },
  { key: 'deliveredBy', heading: 'Delivered by', aliases: [] },
  { key: 'storeMan', heading: 'Received by (store man)', aliases: ['received by', 'store man', 'store keeper'] },
  { key: 'remark', heading: 'Remark', aliases: ['remarks', 'note', 'notes'] },
];

export const RECEIPT_REQUIRED = RECEIPT_FIELDS.filter((f) => f.required).map((f) => f.key);
export const RECEIPT_HEADINGS = Object.fromEntries(RECEIPT_FIELDS.map((f) => [f.key, f.heading])) as Record<ReceiptField, string>;

/** One receipt row read from a spreadsheet; `row` is the spreadsheet row number */
export type ReceiptSheetRow = { row: number } & Record<ReceiptField, string>;

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[()_.:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const HEADING_TO_FIELD = new Map<string, ReceiptField>(
  RECEIPT_FIELDS.flatMap((f) => [f.heading, ...f.aliases].map((h) => [normalize(h), f.key] as [string, ReceiptField])),
);

const cell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

export interface ReceiptSheet {
  rows: ReceiptSheetRow[];
  /** Required columns the sheet doesn't have */
  missing: ReceiptField[];
}

/** Finds the heading row (the first that names an item description column, within the first 10 rows) and reads the rows below it */
export function receiptRowsFromSheet(data: unknown[][]): ReceiptSheet {
  const headerIndex = data.slice(0, 10).findIndex((r) => r.some((c) => HEADING_TO_FIELD.get(normalize(c)) === 'name'));
  if (headerIndex < 0) return { rows: [], missing: [...RECEIPT_REQUIRED] };
  const map = new Map<number, ReceiptField>();
  data[headerIndex].forEach((heading, i) => {
    const field = HEADING_TO_FIELD.get(normalize(heading));
    if (field && ![...map.values()].includes(field)) map.set(i, field);
  });
  const found = [...map.values()];
  const rows: ReceiptSheetRow[] = [];
  data.slice(headerIndex + 1).forEach((r, i) => {
    const out = { row: headerIndex + i + 2, ...Object.fromEntries(RECEIPT_FIELDS.map((f) => [f.key, ''])) } as ReceiptSheetRow;
    map.forEach((field, idx) => {
      out[field] = cell(r[idx]);
    });
    if (RECEIPT_FIELDS.some((f) => out[f.key] !== '')) rows.push(out);
  });
  return { rows, missing: RECEIPT_REQUIRED.filter((k) => !found.includes(k)) };
}

/** Reads the first sheet of an .xlsx file, or a .csv file */
export async function readReceiptFile(file: File): Promise<ReceiptSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return receiptRowsFromSheet(parseCsv(await file.text()));
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return receiptRowsFromSheet((await readSheet(file)) as unknown[][]);
  }
  throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and save as .xlsx first.');
}

/** The template: the headings, then one example line */
export function receiptTemplateRows(): string[][] {
  const example: Record<ReceiptField, string> = {
    slipNumber: '0000044',
    receivedDate: '2026-09-25',
    store: 'Central Store',
    location: '',
    name: 'Laptop computer, 14 inch',
    category: 'IT Equipment & Accessories',
    itemType: 'Fixed asset',
    uom: 'EA',
    quantity: '10',
    unitPrice: '65000',
    condition: 'New',
    itemCode: '',
    serialNumber: '',
    transactionType: 'PO Receipt',
    poNumber: '186',
    source: 'Example Trading PLC',
    buyer: '',
    programName: '',
    deliveredBy: '',
    storeMan: '',
    remark: 'Opening stock',
  };
  return [RECEIPT_FIELDS.map((f) => f.heading), RECEIPT_FIELDS.map((f) => example[f.key])];
}

// ─── Checking rows ──────────────────────────────────────────────────────────

const CONDITIONS: [RegExp, ItemCondition][] = [
  [/^new$/i, ItemCondition.NEW],
  [/^good$/i, ItemCondition.GOOD],
  [/^fair$/i, ItemCondition.FAIR],
  [/^(needs?\s*repair|needs_repair|repair)$/i, ItemCondition.NEEDS_REPAIR],
  [/^damaged$/i, ItemCondition.DAMAGED],
];

export function categoryFrom(text: string): AssetCategory | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const exact = COMMON_CATEGORIES.find((c) => c.value === t.toUpperCase().replace(/[\s&-]+/g, '_') || normalize(c.label) === normalize(t));
  if (exact) return exact.value;
  return CATEGORY_FROM_IFMIS.find(([re]) => re.test(t))?.[1];
}

export function itemTypeFrom(text: string): ItemType | undefined {
  const t = text.trim();
  if (/^(fixed|fixed asset|f|ቋሚ|ቋሚ ዕቃ)$/i.test(t) || /^fixed/i.test(t)) return ItemType.FIXED;
  if (/^(consumable|consumable item|c|አላቂ|አላቂ ዕቃ)$/i.test(t) || /^consumable/i.test(t)) return ItemType.CONSUMABLE;
  return undefined;
}

/** A number typed in a cell: "65,000.00" or "65000" */
const amount = (text: string) => (text.trim() === '' ? NaN : Number(text.replace(/,/g, '').trim()));

/** What the import needs to know about the system to check rows */
export interface ReceiptImportContext {
  locations: Pick<Location, 'id' | 'storeId' | 'storeName' | 'name' | 'isActive'>[];
  storeMen: (storeId: string) => StoreKeeper[];
  /** Receipt lines already registered: their Model 19 number and description, to catch a file imported twice */
  existing: { slipNumber?: string; name: string; itemCode: string }[];
  today: string;
}

export interface CheckedReceiptRow {
  sheet: ReceiptSheetRow;
  /** Why the row can't be imported; empty when it can */
  error?: string;
  /** The receipt it becomes, without who registers it */
  payload?: Omit<CreateStockInRequest, 'registeredById'>;
  storeLabel?: string;
}

const lineKey = (slip: string, name: string) => `${slip.trim().toLowerCase()}|${name.trim().toLowerCase()}`;

/** Checks every row the way the receive form would, and turns the good ones into receipts */
export function checkReceiptRows(rows: ReceiptSheetRow[], ctx: ReceiptImportContext): CheckedReceiptRow[] {
  const done = new Map(ctx.existing.filter((e) => e.slipNumber).map((e) => [lineKey(e.slipNumber!, e.name), e.itemCode]));
  const inFile = new Map<string, number>();
  const usable = ctx.locations.filter((l) => l.isActive !== false);

  return rows.map((r): CheckedReceiptRow => {
    const fail = (error: string): CheckedReceiptRow => ({ sheet: r, error });
    const missing = RECEIPT_REQUIRED.filter((k) => !r[k].trim());
    if (missing.length) return fail(`Missing ${missing.map((k) => RECEIPT_HEADINGS[k]).join(', ')}.`);

    const date = /^\d{4}-\d{2}-\d{2}$/.test(r.receivedDate) ? r.receivedDate : toIsoDate(r.receivedDate);
    if (!date) return fail(`Received date "${r.receivedDate}" is not a date. Use 2026-09-25 or 25/09/2026.`);
    if (date > ctx.today) return fail('Received date is in the future.');

    // The store by its name, or a location written as "Store · Location"
    const byLabel = usable.find((l) => normalize(`${l.storeName} · ${l.name}`) === normalize(r.store));
    const inStore = usable.filter((l) => normalize(l.storeName) === normalize(r.store));
    if (!byLabel && inStore.length === 0) return fail(`No store named "${r.store}". Use the store's name as in Settings → Stores.`);
    const location =
      byLabel ??
      (r.location.trim() ? inStore.find((l) => normalize(l.name) === normalize(r.location)) : inStore.length === 1 ? inStore[0] : undefined);
    if (!location) {
      return fail(
        r.location.trim()
          ? `${inStore[0].storeName} has no location "${r.location}".`
          : `${inStore[0].storeName} has several locations; fill in Location in store.`,
      );
    }

    const category = categoryFrom(r.category);
    if (!category) return fail(`Category "${r.category}" is not one of: ${COMMON_CATEGORIES.map((c) => c.label).join(', ')}.`);
    const itemType = itemTypeFrom(r.itemType);
    if (!itemType) return fail(`Item type "${r.itemType}" must be Fixed asset or Consumable item.`);
    const quantity = amount(r.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return fail('Quantity must be a whole number, at least 1.');
    const unitPrice = amount(r.unitPrice);
    if (!(unitPrice > 0)) return fail('Unit price must be a number above zero.');
    const condition = r.condition.trim() ? CONDITIONS.find(([re]) => re.test(r.condition.trim()))?.[1] : ItemCondition.GOOD;
    if (!condition) return fail(`Condition "${r.condition}" must be New, Good, Fair, Needs repair or Damaged.`);

    const men = ctx.storeMen(location.storeId);
    let storeManId: string | undefined;
    if (r.storeMan.trim()) {
      const man = men.find((k) => k.payrollId === r.storeMan.trim() || normalize(k.fullNameEn) === normalize(r.storeMan));
      if (!man) return fail(`"${r.storeMan}" is not a store man of ${location.storeName}.`);
      storeManId = man.employeeId;
    } else if (men.length > 1) {
      return fail(`${location.storeName} has several store men; fill in Received by (store man).`);
    }

    const key = lineKey(r.slipNumber, r.name);
    if (done.has(key)) return fail(`Already registered as ${done.get(key)} (same Model 19 No. and description).`);
    if (inFile.has(key)) return fail(`Same Model 19 No. and description as row ${inFile.get(key)}.`);
    inFile.set(key, r.row);

    const text = (v: string) => v.trim() || undefined;
    const categoryLabel = COMMON_CATEGORIES.find((c) => c.value === category)?.label;
    const line = {
      itemCode: text(r.itemCode),
      name: r.name.trim(),
      category,
      itemType,
      serialNumber: text(r.serialNumber),
      unitCostETB: unitPrice,
      condition,
      uom: r.uom.trim().toUpperCase(),
      itemCategoryDisplay: categoryLabel,
      quantity,
      totalAmount: quantity * unitPrice,
      remark: text(r.remark),
    };
    return {
      sheet: r,
      storeLabel: `${location.storeName} · ${location.name}`,
      payload: {
        name: line.name,
        category,
        itemType,
        serialNumber: line.serialNumber ?? '',
        unitCostETB: unitPrice,
        condition,
        storeLocationId: location.id,
        ifmisSlipNumber: r.slipNumber.trim(),
        ifmisSlipDateGc: date,
        // Recorded from before the system: it may have no scanned slip, and still goes through approval
        isHistoricalData: true,
        notes: line.remark,
        poNumber: text(r.poNumber),
        transactionType: text(r.transactionType),
        source: text(r.source),
        buyer: text(r.buyer),
        programName: text(r.programName),
        deliveredBy: text(r.deliveredBy),
        receivedByEmployeeId: storeManId,
        items: [line],
      },
    };
  });
}
