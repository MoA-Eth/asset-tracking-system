/**
 * Reads the vouchers that IFMIS saves as PDF, so a form can be filled in from them.
 * Only a PDF that carries real text can be read this way (IFMIS PDFs do); a scan is a picture and gives back no text.
 * Everything runs in the browser with a bundled library, so it works without internet.
 * What is read is only ever a suggestion: the person checks it against the paper before submitting.
 */

/** The text of a PDF, one line per printed row with its cells two spaces apart. Empty for a scanned PDF. */
export async function readPdfText(file: File, maxPages = 3): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Text comes in pieces; pieces at (nearly) the same height belong to one printed row
      const rows: { y: number; cells: { x: number; text: string }[] }[] = [];
      for (const item of content.items as { str?: string; transform?: number[] }[]) {
        const text = item.str?.trim();
        if (!text || !item.transform) continue;
        const [, , , , x, y] = item.transform;
        const row = rows.find((r) => Math.abs(r.y - y) <= 2) ?? rows[rows.push({ y, cells: [] }) - 1];
        row.cells.push({ x, text });
      }
      rows
        .sort((a, b) => b.y - a.y)
        .forEach((r) => lines.push(r.cells.sort((a, b) => a.x - b.x).map((c) => c.text).join('  ')));
    }
  } finally {
    await doc.destroy();
  }
  return lines.join('\n');
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
