import { readSheet } from 'read-excel-file/browser';

/** One employee row read from an HR spreadsheet; `row` is the spreadsheet row number */
export interface EmployeeSheetRow {
  row: number;
  payrollId: string;
  fullNameEn: string;
  fullNameAm: string;
  department: string;
  jobTitle: string;
  email: string;
  phone: string;
}

type Column = Exclude<keyof EmployeeSheetRow, 'row'>;

/** Column headings we recognise, in English and Amharic (compared without case, spaces or punctuation) */
const HEADINGS: Record<Column, string[]> = {
  payrollId: ['payroll id', 'payroll', 'payroll no', 'payroll number', 'employee id', 'employee no', 'staff id', 'id no', 'የደመወዝ ቁጥር', 'የሰራተኛ መለያ ቁጥር'],
  fullNameEn: ['full name english', 'full name', 'name', 'name english', 'english name', 'employee name', 'staff name'],
  fullNameAm: ['full name amharic', 'amharic name', 'name amharic', 'ሙሉ ስም', 'ስም'],
  department: ['department', 'directorate', 'dept', 'department code', 'office', 'ክፍል', 'ዳይሬክቶሬት', 'የስራ ክፍል'],
  jobTitle: ['job title', 'position', 'title', 'designation', 'የስራ መደብ', 'የስራ ድርሻ'],
  email: ['email', 'e mail', 'email address', 'ኢሜይል'],
  phone: ['phone', 'phone number', 'mobile', 'telephone', 'tel', 'ስልክ', 'ስልክ ቁጥር'],
};

export const REQUIRED_COLUMNS: Column[] = ['payrollId', 'fullNameEn', 'department'];

export const COLUMN_LABELS: Record<Column, string> = {
  payrollId: 'Payroll ID',
  fullNameEn: 'Full name (English)',
  fullNameAm: 'Full name (Amharic)',
  department: 'Department',
  jobTitle: 'Job title',
  email: 'Email',
  phone: 'Phone',
};

const normalizeHeading = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[()_.:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const columnFor = (heading: unknown): Column | undefined => {
  const h = normalizeHeading(heading);
  if (!h) return undefined;
  return (Object.keys(HEADINGS) as Column[]).find((c) => HEADINGS[c].includes(h));
};

const cell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

/** Splits CSV text into rows, handling quoted cells with commas, quotes and line breaks */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += ch;
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export interface SheetReadResult {
  rows: EmployeeSheetRow[];
  /** Columns found, in sheet order */
  columns: Column[];
  /** Required columns the sheet doesn't have */
  missing: Column[];
}

/**
 * Finds the heading row (the first row that names a payroll ID column, within the first 10 rows),
 * then reads every non-empty row below it.
 */
export function rowsFromSheet(data: unknown[][]): SheetReadResult {
  const headerIndex = data.slice(0, 10).findIndex((r) => r.some((c) => columnFor(c) === 'payrollId'));
  if (headerIndex < 0) return { rows: [], columns: [], missing: [...REQUIRED_COLUMNS] };

  const map = new Map<number, Column>();
  data[headerIndex].forEach((heading, i) => {
    const col = columnFor(heading);
    if (col && ![...map.values()].includes(col)) map.set(i, col);
  });
  const columns = [...map.values()];
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));

  const rows: EmployeeSheetRow[] = [];
  data.slice(headerIndex + 1).forEach((r, i) => {
    const out: EmployeeSheetRow = { row: headerIndex + i + 2, payrollId: '', fullNameEn: '', fullNameAm: '', department: '', jobTitle: '', email: '', phone: '' };
    map.forEach((col, idx) => {
      out[col] = cell(r[idx]);
    });
    if ((Object.keys(HEADINGS) as Column[]).some((c) => out[c] !== '')) rows.push(out);
  });
  return { rows, columns, missing };
}

/** Reads the first sheet of an .xlsx file, or a .csv file */
export async function readEmployeeFile(file: File): Promise<SheetReadResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return rowsFromSheet(parseCsv(await file.text()));
  if (name.endsWith('.xlsx')) return rowsFromSheet((await readSheet(file)) as unknown[][]);
  throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and save as .xlsx first.');
}

/** A CSV template with the expected headings; the byte-order mark makes Excel show Amharic correctly */
export function employeeTemplateCsv(): string {
  const heading = (Object.keys(COLUMN_LABELS) as Column[]).map((c) => COLUMN_LABELS[c]).join(',');
  const example = 'MOA/1234,Hana Tesfaye,ሐና ተስፋዬ,PROP,Agronomist,hana.t@moa.gov.et,+251911000000';
  return `﻿${heading}\r\n${example}\r\n`;
}
