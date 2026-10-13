import { Employee, ItemWithRelations, Location, StoreKeeper } from '../types/asset-management';
import { parseCsv } from './employee-import';
import { toIsoDate } from './slip-reader';

/**
 * What every voucher import shares: reading a sheet by its headings, the template, and the checks that look up
 * items, employees and store men. Each voucher (Model 19, 22, 21, disposal) lists its own columns and rules.
 */

export interface SheetField<K extends string> {
  key: K;
  heading: string;
  required?: boolean;
  /** Other headings accepted when reading a file */
  aliases: string[];
}

/** One row read from a spreadsheet; `row` is the spreadsheet row number */
export type SheetRow<K extends string> = { row: number } & Record<K, string>;

export interface Sheet<K extends string> {
  rows: SheetRow<K>[];
  /** Required columns the sheet doesn't have */
  missing: K[];
}

/** Headings and names are compared without case, extra spaces or punctuation */
export const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[()_.:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

/**
 * Finds the heading row (the first, within the first 10 rows, that names the `anchor` column) and reads every
 * non-empty row below it. Columns it doesn't know are ignored.
 */
export function sheetRowsFrom<K extends string>(data: unknown[][], fields: SheetField<K>[], anchor: K): Sheet<K> {
  const byHeading = new Map<string, K>(fields.flatMap((f) => [f.heading, ...f.aliases].map((h) => [normalize(h), f.key] as [string, K])));
  const required = fields.filter((f) => f.required).map((f) => f.key);
  const headerIndex = data.slice(0, 10).findIndex((r) => r.some((c) => byHeading.get(normalize(c)) === anchor));
  if (headerIndex < 0) return { rows: [], missing: required };
  const map = new Map<number, K>();
  data[headerIndex].forEach((heading, i) => {
    const key = byHeading.get(normalize(heading));
    if (key && ![...map.values()].includes(key)) map.set(i, key);
  });
  const found = [...map.values()];
  const rows: SheetRow<K>[] = [];
  data.slice(headerIndex + 1).forEach((r, i) => {
    const out = { row: headerIndex + i + 2, ...Object.fromEntries(fields.map((f) => [f.key, ''])) } as SheetRow<K>;
    map.forEach((key, idx) => {
      (out as Record<string, unknown>)[key] = cell(r[idx]);
    });
    if (fields.some((f) => out[f.key] !== '')) rows.push(out);
  });
  return { rows, missing: required.filter((k) => !found.includes(k)) };
}

/** Reads the first sheet of an .xlsx file, or a .csv file */
export async function readSheetFile<K extends string>(file: File, fields: SheetField<K>[], anchor: K): Promise<Sheet<K>> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return sheetRowsFrom(parseCsv(await file.text()), fields, anchor);
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return sheetRowsFrom((await readSheet(file)) as unknown[][], fields, anchor);
  }
  throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and save as .xlsx first.');
}

/** The template: the headings, then one example row */
export const templateRows = <K extends string>(fields: SheetField<K>[], example: Record<K, string>): string[][] => [
  fields.map((f) => f.heading),
  fields.map((f) => example[f.key]),
];

/** A number typed in a cell: "65,000.00" or "65000"; NaN when empty */
export const amount = (text: string) => (text.trim() === '' ? NaN : Number(text.replace(/,/g, '').trim()));

/** The required columns a row leaves empty, as a message */
export const missingIn = <K extends string>(row: SheetRow<K>, fields: SheetField<K>[]): string | undefined => {
  const empty = fields.filter((f) => f.required && !row[f.key].trim());
  return empty.length ? `Missing ${empty.map((f) => f.heading).join(', ')}.` : undefined;
};

/** A date cell as YYYY-MM-DD, or why it can't be used */
export function dateIn(text: string, label: string, today: string): { date: string } | { error: string } {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : toIsoDate(text);
  if (!date) return { error: `${label} "${text}" is not a date. Use 2026-09-25 or 25/09/2026.` };
  if (date > today) return { error: `${label} is in the future.` };
  return { date };
}

/** What the imports need to know about the system to check rows */
export interface ImportContext {
  items: ItemWithRelations[];
  employees: Employee[];
  locations: Pick<Location, 'id' | 'storeId' | 'storeName' | 'name' | 'isActive'>[];
  storeMen: (storeId: string) => StoreKeeper[];
  /** Items that already have a request waiting for approval: one at a time per item */
  pendingItemIds: Set<string>;
  today: string;
}

/** The item a row names by its item code */
export const itemByCode = (ctx: ImportContext, code: string) => {
  const c = code.trim().toLowerCase();
  return ctx.items.find((i) => i.itemCode.toLowerCase() === c);
};

/** The employee a row names, by employee ID or full English name */
export const employeeIn = (ctx: ImportContext, text: string): Employee | undefined => {
  const t = text.trim();
  if (!t) return undefined;
  const padded = /^\d{1,8}$/.test(t) ? t.padStart(8, '0') : t;
  return (
    ctx.employees.find((e) => e.isActive !== false && (e.payrollId === t || e.payrollId === padded)) ??
    ctx.employees.find((e) => e.isActive !== false && normalize(e.fullNameEn) === normalize(t))
  );
};

/** The store man a row names for an item's store, or why it can't be decided */
export function storeManFor(ctx: ImportContext, item: ItemWithRelations, text: string): { id?: string } | { error: string } {
  const storeId = ctx.locations.find((l) => l.id === item.storeLocationId)?.storeId;
  const storeName = ctx.locations.find((l) => l.id === item.storeLocationId)?.storeName ?? 'The store';
  const men = storeId ? ctx.storeMen(storeId) : [];
  if (text.trim()) {
    const man = men.find((k) => k.payrollId === text.trim() || normalize(k.fullNameEn) === normalize(text));
    return man ? { id: man.employeeId } : { error: `"${text}" is not a store man of ${storeName}.` };
  }
  if (men.length > 1) return { error: `${storeName} has several store men; fill in the store man column.` };
  return {};
}

/** A status in words, for messages */
export const statusWords: Record<string, string> = {
  PENDING_STOCK_IN: 'waiting for receipt approval',
  AVAILABLE: 'in store',
  PENDING_STOCK_OUT: 'waiting for issue approval',
  ISSUED: 'issued',
  UNDER_TRANSFER: 'under transfer',
  PENDING_DISPOSAL: 'waiting for disposal approval',
  DISPOSED: 'disposed',
  REJECTED: 'rejected',
};
