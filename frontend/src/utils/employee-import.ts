import { strToU8, zipSync } from 'fflate';

export type EmployeeField =
  | 'department'
  | 'unit'
  | 'fullNameAm'
  | 'fullNameEn'
  | 'payrollId'
  | 'gender'
  | 'jobTitle'
  | 'phone'
  | 'email';

/**
 * The employee fields, in HR's column order. This one list drives the Add / Edit form, the import
 * template and the column matching, so the form and the template always ask for the same things.
 */
export const EMPLOYEE_FIELDS: {
  key: EmployeeField;
  /** Label on the form */
  label: string;
  /** HR's column heading; used in the template and shown beside the label */
  heading: string;
  required?: boolean;
  /** Other headings accepted when reading a file */
  aliases: string[];
}[] = [
  { key: 'department', label: 'Department', heading: 'ዋና የስራ ክፍል', required: true, aliases: ['ዋና የሥራ ክፍል', 'department', 'main work unit', 'directorate', 'dept', 'ዳይሬክቶሬት', 'ክፍል'] },
  { key: 'unit', label: 'Unit', heading: 'የስራ ክፍል', aliases: ['የሥራ ክፍል', 'unit', 'work unit', 'sub unit', 'team', 'section'] },
  { key: 'fullNameAm', label: 'Full name (Amharic)', heading: 'ሙሉ ስም', aliases: ['full name amharic', 'amharic name', 'name amharic', 'ስም'] },
  { key: 'fullNameEn', label: 'Full name (English)', heading: 'ሙሉ ስም(በኢንግሊዘኛ)', required: true, aliases: ['ሙሉ ስም በእንግሊዝኛ', 'ሙሉ ስም በእንግሊዘኛ', 'full name english', 'full name', 'name', 'name english', 'english name', 'employee name', 'staff name'] },
  { key: 'payrollId', label: 'Employee ID', heading: 'የሰራተኛ መለያ ቁጥር', required: true, aliases: ['የሠራተኛ መለያ ቁጥር', 'employee id', 'employee no', 'staff id', 'id no', 'payroll id', 'payroll', 'payroll no', 'payroll number', 'የደመወዝ ቁጥር'] },
  { key: 'gender', label: 'Gender', heading: 'ፆታ', aliases: ['ጾታ', 'gender', 'sex'] },
  { key: 'jobTitle', label: 'Job title', heading: 'የስራ መደብ', aliases: ['የሥራ መደብ', 'job title', 'position', 'title', 'designation'] },
  { key: 'phone', label: 'Phone', heading: 'ስልክ', aliases: ['ስልክ ቁጥር', 'phone', 'phone number', 'mobile', 'telephone', 'tel'] },
  { key: 'email', label: 'Email', heading: 'ኢሜይል', aliases: ['email', 'e mail', 'email address'] },
];

export const fieldInfo = (key: EmployeeField) => EMPLOYEE_FIELDS.find((f) => f.key === key)!;
export const REQUIRED_COLUMNS = EMPLOYEE_FIELDS.filter((f) => f.required).map((f) => f.key);
export const COLUMN_LABELS = Object.fromEntries(EMPLOYEE_FIELDS.map((f) => [f.key, f.label])) as Record<EmployeeField, string>;

/** One employee row read from a spreadsheet; `row` is the spreadsheet row number */
export type EmployeeSheetRow = { row: number } & Record<EmployeeField, string>;

/** Headings are compared without case, extra spaces or punctuation */
const normalizeHeading = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[()_.:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const HEADING_TO_FIELD = new Map<string, EmployeeField>(
  EMPLOYEE_FIELDS.flatMap((f) => [f.heading, f.label, ...f.aliases].map((h) => [normalizeHeading(h), f.key] as [string, EmployeeField])),
);

const columnFor = (heading: unknown): EmployeeField | undefined => HEADING_TO_FIELD.get(normalizeHeading(heading));

/** HR's payroll employee ID: 8 digits, leading zeros kept (e.g. 00123456) */
export const EMPLOYEE_ID_PATTERN = /^\d{8}$/;
export const EMPLOYEE_ID_FORMAT = 'Employee ID must be 8 digits, as on the HR payroll (e.g. 00123456).';

/** Excel drops the leading zeros of IDs saved as numbers (00277240 → 277240); put them back */
const payrollCell = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1e8 ? String(value).padStart(8, '0') : cell(value);

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
  columns: EmployeeField[];
  /** Required columns the sheet doesn't have */
  missing: EmployeeField[];
}

const emptyRow = (row: number): EmployeeSheetRow => ({
  row,
  ...(Object.fromEntries(EMPLOYEE_FIELDS.map((f) => [f.key, ''])) as Record<EmployeeField, string>),
});

/**
 * Finds the heading row (the first row that names an employee ID column, within the first 10 rows),
 * then reads every non-empty row below it. Columns it doesn't know (row number, salary…) are ignored.
 */
export function rowsFromSheet(data: unknown[][]): SheetReadResult {
  const headerIndex = data.slice(0, 10).findIndex((r) => r.some((c) => columnFor(c) === 'payrollId'));
  if (headerIndex < 0) return { rows: [], columns: [], missing: [...REQUIRED_COLUMNS] };

  const map = new Map<number, EmployeeField>();
  data[headerIndex].forEach((heading, i) => {
    const col = columnFor(heading);
    if (col && ![...map.values()].includes(col)) map.set(i, col);
  });
  const columns = [...map.values()];
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));

  const rows: EmployeeSheetRow[] = [];
  data.slice(headerIndex + 1).forEach((r, i) => {
    const out = emptyRow(headerIndex + i + 2);
    map.forEach((col, idx) => {
      out[col] = col === 'payrollId' ? payrollCell(r[idx]) : cell(r[idx]);
    });
    if (EMPLOYEE_FIELDS.some((f) => out[f.key] !== '')) rows.push(out);
  });
  return { rows, columns, missing };
}

/** Reads the first sheet of an .xlsx file, or a .csv file */
export async function readEmployeeFile(file: File): Promise<SheetReadResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return rowsFromSheet(parseCsv(await file.text()));
  if (name.endsWith('.xlsx')) {
    // The Excel reader is loaded only when someone imports a workbook
    const { readSheet } = await import('read-excel-file/browser');
    return rowsFromSheet((await readSheet(file)) as unknown[][]);
  }
  throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and save as .xlsx first.');
}

/** The template's rows: HR's headings, then one example employee */
export function employeeTemplateRows(): string[][] {
  const example: Record<EmployeeField, string> = {
    department: 'የፋይናንስ ሥራ አስፈጻሚ',
    unit: 'የክፍያ ቡድን',
    fullNameAm: 'ሐና ተስፋዬ በቀለ',
    fullNameEn: 'Hana Tesfaye Bekele',
    payrollId: '00123456',
    gender: 'ሴት',
    jobTitle: 'የሂሳብ ባለሙያ II',
    phone: '+251911000000',
    email: 'hana.t@moa.gov.et',
  };
  return [EMPLOYEE_FIELDS.map((f) => f.heading), EMPLOYEE_FIELDS.map((f) => example[f.key])];
}

const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Column letters for a zero-based index: A, B … Z, AA … */
const columnName = (index: number): string => (index < 26 ? '' : columnName(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26));

/**
 * Builds a one-sheet .xlsx workbook whose cells are all text, so employee IDs keep their leading zeros
 * (a CSV would lose them as soon as it is opened and saved in Excel).
 */
export function buildTextWorkbook(rows: string[][], sheetName = 'Employees'): Uint8Array {
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((v, ci) => (v === '' ? '' : `<c r="${columnName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`))
          .join('')}</row>`,
    )
    .join('');
  const xml = (body: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`);
  return zipSync({
    '[Content_Types].xml': xml(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': xml(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': xml(
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': xml(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': xml(
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${rows[0]?.length || 1}" width="26" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  });
}
