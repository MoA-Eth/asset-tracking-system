/**
 * Reads the vouchers that IFMIS saves as PDF, so a form can be filled in from them.
 * Only a PDF that carries real text can be read this way (IFMIS PDFs do); a scan is a picture and gives back no text.
 * Everything runs in the browser with a bundled library, so it works without internet.
 * What is read is only ever a suggestion: the person checks it against the paper before submitting.
 */

/** A piece of text and where it starts across the page */
export interface PdfCell {
  x: number;
  text: string;
}

/** One printed row: its distance from the top of the document (pages follow each other) and its pieces, left to right */
export interface PdfRow {
  top: number;
  cells: PdfCell[];
}

/** A PDF opened with the bundled reader (pdf.js, loaded only when a PDF is attached) */
export async function openPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** The rows of a PDF, top to bottom. Empty for a scanned PDF. */
export async function readPdfRows(file: File, maxPages = 5): Promise<PdfRow[]> {
  const doc = await openPdf(file);
  const all: PdfRow[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      // Text comes in pieces; pieces at (nearly) the same height belong to one printed row
      const rows: { y: number; cells: PdfCell[] }[] = [];
      for (const item of content.items as { str?: string; transform?: number[] }[]) {
        const text = item.str?.trim();
        if (!text || !item.transform) continue;
        const [, , , , x, y] = item.transform;
        const row = rows.find((r) => Math.abs(r.y - y) <= 2) ?? rows[rows.push({ y, cells: [] }) - 1];
        row.cells.push({ x, text });
      }
      rows
        .sort((r1, r2) => r2.y - r1.y)
        .forEach((r) => all.push({ top: (p - 1) * 100000 + (height - r.y), cells: r.cells.sort((c1, c2) => c1.x - c2.x) }));
    }
  } finally {
    await doc.destroy();
  }
  return all;
}

/** The rows as text: one line per row, its cells two spaces apart */
export const rowsToText = (rows: PdfRow[]): string => rows.map((r) => r.cells.map((c) => c.text).join('  ')).join('\n');

/** The text of a PDF, one line per printed row with its cells two spaces apart. Empty for a scanned PDF. */
export async function readPdfText(file: File, maxPages = 3): Promise<string> {
  return rowsToText(await readPdfRows(file, maxPages));
}

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/**
 * A printed date as YYYY-MM-DD: 05-OCT-26 and 05-OCT-2026 (as IFMIS prints them), 05/10/2026 (day first), 2026-10-05.
 * A two-digit year is in the 2000s.
 */
export function toIsoDate(raw: string): string | undefined {
  const text = raw.trim().toUpperCase();
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[-/. ]([A-Z]{3})[A-Z]*[-/. ,]+(\d{4}|\d{2})\b/.exec(text)) && MONTHS[match[2]]) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2]], Number(match[3])];
    if (match[3].length === 2) y += 2000;
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(text))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 624,285.55 -> 624285.55 */
const amount = (text: string): number => Number(text.replace(/,/g, ''));

/** One asset line of a Model 21 */
export interface Model21SlipLine {
  description?: string;
  tagNumber?: string;
  unit?: number;
  origCost?: number;
  depreciation?: number;
  bookValue?: number;
  /** YYYY-MM-DD */
  date?: string;
}

/** What an IFMIS "Fixed Asset Internal Transfer Form" (Model 21) says */
export interface Model21SlipFields {
  model21No?: string;
  fromName?: string;
  fromEmployeeId?: string;
  toName?: string;
  toEmployeeId?: string;
  book?: string;
  /** e.g. "MoA Saris" (IFMIS pads it with "DefaultDefaultDefault", which is dropped) */
  fromLocation?: string;
  toLocation?: string;
  lines: Model21SlipLine[];
}

/** Whether the text is an IFMIS transfer form at all */
export const isModel21 = (text: string): boolean => /model\s*\/\s*21\b|internal\s+transfer\s+form/i.test(text);

/** The fields of an IFMIS Model 21; anything not found is left out */
export function parseModel21(text: string): Model21SlipFields {
  const found: Model21SlipFields = { lines: [] };
  found.model21No = /model\s*#\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i.exec(text)?.[1];

  // "From Employee Name :  Borecha, Wosene  To : Lenjisso, Daniel"
  const names = /from\s+employee\s+name\s*:\s*(.*?)\s+to\s*:\s*(.+?)\s*$/im.exec(text);
  if (names) [found.fromName, found.toName] = [names[1].trim() || undefined, names[2].trim() || undefined];
  // "From Employee ID :  109870  To : 110347"
  const ids = /from\s+employee\s+id\s*:\s*([A-Za-z0-9/\-]*)\s+to\s*:\s*([A-Za-z0-9/\-]+)/i.exec(text);
  if (ids) [found.fromEmployeeId, found.toEmployeeId] = [ids[1] || undefined, ids[2]];
  found.book = /^\s*book\s*:\s*(.+?)\s*$/im.exec(text)?.[1];

  // "MoA SarisDefaultDefaultDefault  MoA Gurd ShollaDefaultDefaultDefault"
  const places = text.split('\n').find((l) => /\S(?:Default){2,}/.test(l));
  if (places) {
    const [from, to] = places.split(/\s{2,}/).map((c) => c.replace(/(?:Default)+$/, '').trim());
    found.fromLocation = from || undefined;
    found.toLocation = to || undefined;
  }

  // Asset lines: "1  Handheld GPS  MOA-072351  1  624,285.55  322,547.54  301,738.01  05-OCT-26"
  for (const line of text.split('\n')) {
    const cells = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4 || !/^\d{1,3}$/.test(cells[0])) continue;
    const dateCell = cells.find((c) => /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(c));
    const money = cells.filter((c) => /^-?[\d,]+\.\d{2}$/.test(c));
    if (!dateCell && money.length === 0) continue;
    const tagIndex = cells.findIndex((c, i) => i > 0 && /^[A-Za-z]{2,}[-/]?\d{3,}[A-Za-z0-9/\-]*$/.test(c));
    const unitCell = cells.find((c, i) => i > Math.max(tagIndex, 1) && /^\d+$/.test(c));
    found.lines.push({
      description: cells[1] && cells[1] !== cells[tagIndex] ? cells[1] : undefined,
      tagNumber: tagIndex > 0 ? cells[tagIndex] : undefined,
      unit: unitCell ? Number(unitCell) : undefined,
      origCost: money[0] !== undefined ? amount(money[0]) : undefined,
      depreciation: money[1] !== undefined ? amount(money[1]) : undefined,
      bookValue: money[2] !== undefined ? amount(money[2]) : undefined,
      date: dateCell ? toIsoDate(dateCell) : undefined,
    });
  }
  return found;
}

/** Employee IDs are compared without leading zeros, since IFMIS may print 0110347 or 110347 */
export const sameEmployeeId = (a?: string, b?: string): boolean =>
  !!a && !!b && a.replace(/^0+/, '').toLowerCase() === b.replace(/^0+/, '').toLowerCase();

// ─── Model 19 (Print Model19 Report) ─────────────────────────────────────────

/** One item line of an IFMIS Model 19 */
export interface Model19SlipLine {
  /** The IFMIS inventory item code, e.g. 107101102.4336 */
  itemCode?: string;
  description?: string;
  uom?: string;
  subInventory?: string;
  /** As IFMIS names it, e.g. "Medical Supplies & Related Accessories" */
  category?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
}

/** What an IFMIS "Print Model19 Report" says */
export interface Model19SlipFields {
  model19No?: string;
  poNumber?: string;
  /** YYYY-MM-DD */
  receivedDate?: string;
  transactionType?: string;
  source?: string;
  buyer?: string;
  programName?: string;
  lines: Model19SlipLine[];
}

/** Whether the text is an IFMIS Model 19 at all */
export const isModel19 = (text: string): boolean => /inv\.?\s*model\s*19\s*no|print\s*model\s*19/i.test(text);

const HEADER_LABELS: { key: Exclude<keyof Model19SlipFields, 'lines' | 'programName'>; label: RegExp }[] = [
  { key: 'model19No', label: /^inv\.?\s*model\s*19\s*no\.?/i },
  { key: 'poNumber', label: /^p\.?\s?o\.?\s*number/i },
  { key: 'receivedDate', label: /^received\s*date/i },
  { key: 'transactionType', label: /^transaction\s*type/i },
  { key: 'source', label: /^source\b/i },
  { key: 'buyer', label: /^buyer\b/i },
];

/** Rows that end the item table, or start a new page's copy of its header */
const TABLE_STOP = /^(grand\s+total|delivered\s+by|received\s+by|report\s+taken|page\s+\d)|item\s+code|s\/no/i;
const NUMBER = /^-?[\d,]+(\.\d+)?$/;
const asNumber = (text: string) => Number(text.replace(/,/g, ''));

/** The fields of an IFMIS Model 19; anything not found is left out */
export function parseModel19(rows: PdfRow[]): Model19SlipFields {
  const found: Model19SlipFields = { lines: [] };

  // Header: "Label :" then its value, either in the same piece or the next one
  rows.forEach((row, index) => {
    row.cells.forEach((cell, i) => {
      for (const { key, label } of HEADER_LABELS) {
        if (found[key] || !label.test(cell.text)) continue;
        const inline = cell.text.replace(label, '').replace(/^\s*[:.]?\s*/, '').trim();
        const next = row.cells[i + 1];
        let value = inline || (next && !HEADER_LABELS.some((h) => h.label.test(next.text)) ? next.text.replace(/^:\s*/, '').trim() : '');
        const valueX = inline ? cell.x : next?.x;
        // A long value (such as a company name) wraps onto the line below, under the value
        const below = rows[index + 1];
        // (when the label and value came as one piece, the value starts somewhere right of the label)
        const underValue = (x: number) => (inline ? x > cell.x : valueX !== undefined && Math.abs(x - valueX) < 6);
        if (key === 'source' && value && below && below.cells.length === 1 && underValue(below.cells[0].x) && !/:/.test(below.cells[0].text) && below.top - row.top < 25) {
          value += ' ' + below.cells[0].text;
        }
        if (!value || value === ':') continue;
        if (key === 'receivedDate') found.receivedDate = toIsoDate(value);
        else if (key === 'model19No' || key === 'poNumber') found[key] = /^[A-Za-z0-9][A-Za-z0-9/\-.]*/.exec(value)?.[0];
        else found[key] = value;
      }
    });
  });
  // The program, printed above the report title
  const program = rows.find((r) => /program/i.test(rowsToText([r])) && !/print\s*model/i.test(rowsToText([r])));
  if (program) found.programName = rowsToText([program]).trim();

  // Items: a row that starts with its number and an item code
  const starts = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.cells.length >= 3 && /^\d{1,3}$/.test(row.cells[0].text) && /\d/.test(row.cells[1].text) && /^[A-Za-z0-9][A-Za-z0-9.\-/]{3,}$/.test(row.cells[1].text));

  starts.forEach(({ row, index }, n) => {
    const end = n + 1 < starts.length ? starts[n + 1].index : rows.length;
    const band: PdfRow[] = [row];
    for (let r = index + 1; r < end; r++) {
      if (TABLE_STOP.test(rowsToText([rows[r]]))) break;
      band.push(rows[r]);
    }
    const [, code, ...rest] = row.cells;
    // Columns are found from the first line: description, then the unit (EA, PKT…), the sub inventory and the category
    const uomIndex = rest.findIndex((c, i) => i > 0 && /^[A-Za-z]{1,6}$/.test(c.text) && c.text === c.text.toUpperCase());
    const uom = uomIndex >= 0 ? rest[uomIndex] : undefined;
    const sub = uom ? rest[uomIndex + 1] : undefined;
    const cat = sub && !NUMBER.test(rest[uomIndex + 2]?.text ?? '0') ? rest[uomIndex + 2] : undefined;
    const descX = rest[0]?.x ?? code.x;
    const near = (a: PdfCell, b?: PdfCell) => !!b && Math.abs(a.x - b.x) < 6;

    const description: string[] = [];
    const subInventory: string[] = [];
    const category: string[] = [];
    const numbers: PdfCell[] = [];
    for (const r of band) {
      for (const cell of r.cells) {
        if (cell === row.cells[0] || cell === code) continue;
        if (NUMBER.test(cell.text) && cell.x > (cat ?? sub ?? uom ?? code).x + 20) numbers.push(cell);
        else if (uom && cell.x >= descX - 2 && cell.x < uom.x - 2) description.push(cell.text);
        else if (near(cell, cat)) category.push(cell.text);
        else if (near(cell, sub)) subInventory.push(cell.text);
      }
    }
    // Quantity, unit price and total are the last three figures on the line
    numbers.sort((c1, c2) => c1.x - c2.x);
    const [quantity, unitPrice, totalAmount] = numbers.slice(-3).map((c) => asNumber(c.text));
    found.lines.push({
      itemCode: code.text,
      description: description.join(' ').replace(/\s+/g, ' ').trim() || undefined,
      uom: uom?.text,
      subInventory: subInventory.join(' ').trim() || undefined,
      category: category.join(' ').replace(/\s+/g, ' ').trim() || undefined,
      ...(numbers.length >= 3 ? { quantity, unitPrice, totalAmount } : {}),
    });
  });
  return found;
}
