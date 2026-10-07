/**
 * CSV files that open correctly in Excel: Amharic text intact, every value in its own column,
 * and no cell that Excel would run as a formula.
 */

export type CsvValue = string | number | null | undefined;

/** Byte-order mark: without it Excel on Windows reads the file as ANSI and garbles Ethiopic text */
const BOM = '﻿';

/**
 * One cell. Numbers are written as numbers; text is quoted, with inner quotes doubled.
 * Text starting with = + - @ (or a tab/return) gets a leading apostrophe so Excel shows it instead of running it.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The whole file: header row, then one line per row, with Windows line endings */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return BOM + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Builds the file and hands it to the browser as a download */
export function downloadCsv(fileName: string, headers: string[], rows: CsvValue[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
