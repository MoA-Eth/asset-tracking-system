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

/**
 * A PDF opened with the bundled reader (pdf.js, loaded only when a PDF is attached). pdf.js needs features older
 * browsers lack (Promise.withResolvers: Firefox before 121, e.g. Firefox ESR 115, and Chrome before 119); those get
 * its legacy build, which brings its own.
 */
export async function openPdf(file: File) {
  const legacy = typeof (Promise as { withResolvers?: unknown }).withResolvers !== 'function';
  const [pdfjs, worker] = legacy
    ? await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
    : await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** The rows of a PDF, top to bottom. Empty for a scanned PDF. */
export async function readPdfRows(file: File, maxPages = 5): Promise<PdfRow[]> {
  return (await readPdfPages(file, maxPages)).rows;
}

/** The rows of a PDF with its page count, so a reader can tell when pages past `maxPages` were left unread */
export async function readPdfPages(file: File, maxPages = 5): Promise<{ rows: PdfRow[]; pages: number; pagesRead: number }> {
  const doc = await openPdf(file);
  const all: PdfRow[] = [];
  const pages = doc.numPages;
  const pagesRead = Math.min(pages, maxPages);
  try {
    for (let p = 1; p <= pagesRead; p++) {
      const page = await doc.getPage(p);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      // Text comes in pieces; pieces at (nearly) the same height belong to one printed row
      const rows: { y: number; cells: PdfCell[] }[] = [];
      for (const item of content.items as { str?: string; transform?: number[] }[]) {
        const text = item.str?.trim();
        if (!text || !item.transform) continue;
        const [, , , , x, y] = item.transform;
        const row = rows.find((r) => Math.abs(r.y - y) <= 3.5) ?? rows[rows.push({ y, cells: [] }) - 1];
        row.cells.push({ x, text });
      }
      rows
        .sort((r1, r2) => r2.y - r1.y)
        .forEach((r) => all.push({ top: (p - 1) * 100000 + (height - r.y), cells: r.cells.sort((c1, c2) => c1.x - c2.x) }));
    }
  } finally {
    await doc.destroy();
  }
  return { rows: all, pages, pagesRead };
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
export const isModel21 = (text: string): boolean => /model\s*[-/]?\s*21\b|internal\s+transfer(?:\s+form)?|ሞዴል\s*[-/]?\s*21/i.test(text);

/** The fields of an IFMIS Model 21; anything not found is left out */
export function parseModel21(text: string): Model21SlipFields {
  const found: Model21SlipFields = { lines: [] };
  found.model21No =
    /(?:model\s*(?:21\s*)?(?:#|no\.?|number)|internal\s+transfer\s+no\.?)\s*[:#№]?\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i.exec(text)?.[1] ??
    /model\s*#\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i.exec(text)?.[1];

  // "From Employee Name :  Borecha, Wosene  To : Lenjisso, Daniel"
  const names = /from\s+employee\s+name\s*:\s*(.*?)\s+to\s*:\s*(.+?)\s*$/im.exec(text);
  if (names) [found.fromName, found.toName] = [names[1].trim() || undefined, names[2].trim() || undefined];
  // "From Employee ID :  109870  To : 110347"
  const ids = /from\s+employee\s+id\s*:\s*([A-Za-z0-9/\-]*)\s+to\s*:\s*([A-Za-z0-9/\-]+)/i.exec(text);
  if (ids) [found.fromEmployeeId, found.toEmployeeId] = [ids[1] || undefined, ids[2]];
  found.book = /(?:^|\b)book\s*:\s*(.+?)(?:\s{2,}|$)/im.exec(text)?.[1]?.trim() ?? /^\s*book\s*:\s*(.+?)\s*$/im.exec(text)?.[1]?.trim();

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
    // An IFMIS tag (MOA-016341) or a code this system gave (MOA-VEH-2024-0001)
    const tagIndex = cells.findIndex((c, i) => i > 0 && (/^[A-Za-z]{2,}[-/]?\d{3,}[A-Za-z0-9/\-]*$/.test(c) || /^[A-Za-z]{2,}(?:[-/][A-Za-z]{2,})?[-/]\d{4}[-/]\d{3,}$/.test(c)));
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

/** The vehicle and machinery details a Model 21 prints under its table */
export interface Model21Particulars {
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  /** As the form names them: jack with handle, tire wrench, key, reserve tyre */
  accessories: { name: string; quantity: number }[];
  tireNos: string[];
  remark?: string;
}

/** The accessories a Model 21 lists, by the names the transfer form keeps them under */
const ACCESSORIES: [RegExp, string][] = [
  [/^jack(\s+with\s+handle)?\b/i, 'jack with handle'],
  [/^(tire|tyre|wheel)\s+wrench\b/i, 'tire wrench'],
  [/^keys?\b/i, 'key'],
  [/^(reserve|spare)\s+(tyre|tire)\b/i, 'reserve tyre'],
];
/** A tire or chassis number: letters and digits, with at least one digit */
const CODE = /^(?=.*\d)[A-Za-z0-9]{4,}$/;

/**
 * The vehicle details of a Model 21, read by position: the chassis number is the pieces under the "Chassis" heading
 * beside the asset line (IFMIS wraps it over several lines); plate, engine and accessories are "label value" pairs;
 * the tire numbers are listed under "tire no", and the remark under "Remark". Anything not found is left out.
 */
export function parseModel21Particulars(rows: PdfRow[]): Model21Particulars {
  const found: Model21Particulars = { accessories: [], tireNos: [] };
  const clean = (t: string) => t.replace(/^\s*:\s*/, '').trim();

  // "Plate No  4-23794", "Engine No  1HZ-0641864": the value in the same piece or the next one
  const labelled = (label: RegExp): string | undefined => {
    for (const row of rows) {
      const i = row.cells.findIndex((c) => label.test(c.text));
      if (i < 0) continue;
      const inline = clean(row.cells[i].text.replace(label, ''));
      const value = inline || clean(row.cells[i + 1]?.text ?? '');
      if (/^[A-Za-z0-9][A-Za-z0-9\-/ ]*$/.test(value)) return value;
    }
    return undefined;
  };
  found.plateNo = labelled(/^plate\s*no\.?\s*:?/i);
  found.engineNo = labelled(/^engine\s*no\.?\s*:?/i);

  // "jack with handle  1", "key  2": the count in the same piece or the next one
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      const hit = ACCESSORIES.find(([pattern]) => pattern.test(cell.text.trim()));
      if (!hit || found.accessories.some((a) => a.name === hit[1])) return;
      const inline = /(\d+)\s*$/.exec(cell.text.replace(hit[0], ''))?.[1];
      const next = /^\d+$/.test(row.cells[i + 1]?.text.trim() ?? '') ? row.cells[i + 1].text.trim() : undefined;
      const quantity = Number(inline ?? next);
      if (quantity > 0) found.accessories.push({ name: hit[1], quantity });
    });
  }

  // Tire numbers: the codes listed under "tire no", in its column
  const tireLabel = rows.flatMap((r) => r.cells.map((c) => ({ row: r, cell: c }))).find(({ cell }) => /^t[iy]re\s*no\.?\s*:?$/i.test(cell.text.trim()));
  if (tireLabel) {
    for (const row of rows) {
      if (row.top < tireLabel.row.top || row.top > tireLabel.row.top + 120) continue;
      for (const cell of row.cells) {
        if (Math.abs(cell.x - tireLabel.cell.x) < 20 && CODE.test(cell.text.trim())) found.tireNos.push(cell.text.trim());
      }
    }
  }

  // The remark: the lines under "Remark" (the last one on the page: the table's own heading comes first)
  const remarkLabel = rows.flatMap((r) => r.cells.map((c) => ({ row: r, cell: c }))).filter(({ cell }) => /^remarks?\s*:?$/i.test(cell.text.trim())).pop();
  if (remarkLabel) {
    const lines: string[] = [];
    for (const row of rows) {
      if (row.top <= remarkLabel.row.top || row.top > remarkLabel.row.top + 60) continue;
      if (/undersigned|signature/i.test(rowsToText([row]))) break;
      const piece = row.cells.filter((c) => Math.abs(c.x - remarkLabel.cell.x) < 30).map((c) => c.text.trim()).join(' ');
      if (piece) lines.push(piece);
    }
    if (lines.length) found.remark = lines.join(' ');
  }

  // The chassis number: what is under the "Chassis" heading, up to the next heading, beside the first asset line
  const headings = rows.flatMap((r) => r.cells.map((c) => ({ row: r, cell: c })));
  const chassis = headings.find(({ cell }) => /^chassis\b/i.test(cell.text.trim()));
  if (chassis) {
    const right = headings
      .filter(({ row, cell }) => Math.abs(row.top - chassis.row.top) <= 12 && cell.x > chassis.cell.x + 5)
      .map(({ cell }) => cell.x)
      .sort((a, b) => a - b)[0] ?? chassis.cell.x + 40;
    const line = rows.find((r) => r.top > chassis.row.top && /^\d{1,3}$/.test(r.cells[0]?.text.trim() ?? ''));
    if (line) {
      const pieces = rows
        .filter((r) => Math.abs(r.top - line.top) <= 12)
        .flatMap((r) => r.cells.filter((c) => c.x >= chassis.cell.x - 4 && c.x < right - 2).map((c) => ({ top: r.top, text: c.text.trim() })))
        .filter((p) => /^[A-Za-z0-9]+$/.test(p.text))
        .sort((a, b) => a.top - b.top)
        .map((p) => p.text);
      const joined = pieces.join('');
      if (CODE.test(joined)) found.chassisNumber = joined;
    }
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
  /** Names on the signature lines at the bottom, when IFMIS printed them (often the lines are left blank) */
  deliveredBy?: string;
  receivedBy?: string;
  lines: Model19SlipLine[];
}

/** Primary identifiers that uniquely define a Model 19 / Goods Receiving / Store Receipt voucher */
const MODEL19_PRIMARY =
  /(?:inv\.?\s*)?model\s*[-/]?\s*19\b|print\s*model\s*19|ሞዴል\s*[-/]?\s*19|goods\s*(?:receiving|receipt)\s*(?:note|voucher)|store\s*(?:receiving|receipt)\s*(?:note|voucher)|direct\s*delivery\s*receipt|የዕቃ\s*ገቢ\s*(?:ደረሰኝ)?|inv_model19/i;

const MODEL19_SECONDARY =
  /po\s*receipt\b|petty\s*cash\s*purchase\s*receipt|store\s*receipt\b|transfer\s*receipt\b/i;

/** Whether the text is an IFMIS Model 19 at all */
export const isModel19 = (text: string): boolean => {
  // If the document explicitly identifies itself as a Model 19 / Goods Receipt / Store Receipt, it IS a Model 19
  if (MODEL19_PRIMARY.test(text)) return true;
  // If it's explicitly identified as another form (Model 21, Model 22, Disposal), it is not Model 19
  if (isModel21(text) || isModel22(text) || isDisposalForm(text)) return false;
  // Otherwise check secondary receipt transaction types
  return MODEL19_SECONDARY.test(text);
};

const HEADER_LABELS: { key: Exclude<keyof Model19SlipFields, 'lines' | 'programName'>; label: RegExp }[] = [
  {
    key: 'model19No',
    label: /^(?:(?:inv\.?\s*)?model\s*[-/]?\s*19\s*(?:no\.?|number|#)?|(?:store\s*receipt\s*voucher|goods\s*(?:receiving|receipt)\s*(?:note|voucher))\s*(?:no\.?|number|#)?|voucher\s*(?:no\.?|number|#)?|receipt\s*no\.?)/i,
  },
  {
    key: 'poNumber',
    label: /^(?:p\.?\s*o\.?\s*(?:number|no\.?|#|:\s*$)|purchase\s*order\s*(?:number|no\.?|#)?)/i,
  },
  {
    key: 'receivedDate',
    label: /^(?:received\s*date|receipt\s*date|date\s*received|transaction\s*date|date\b)/i,
  },
  {
    key: 'transactionType',
    label: /^(?:transaction\s*type|receipt\s*type)/i,
  },
  {
    key: 'source',
    label: /^(?:source|supplier|vendor|received\s*from)\b/i,
  },
  {
    key: 'buyer',
    label: /^(?:buyer|purchaser|purchased\s*by|procurement\s*officer)\b/i,
  },
];

/** Rows that end the item table, or start a new page's copy of its header */
const TABLE_STOP = /^(grand\s+total|delivered\s+by|received\s+by|report\s+taken|page\s+\d)|item\s+code|s\/no/i;
const NUMBER = /^-?[\d,]+(\.\d+)?$/;
const asNumber = (text: string) => Number(text.replace(/,/g, ''));

/** The fields of an IFMIS Model 19; anything not found is left out */
export function parseModel19(rows: PdfRow[]): Model19SlipFields {
  const found: Model19SlipFields = { lines: [] };

  // Header: "Label :" then its value, either in the same piece or in subsequent pieces on the same row
  rows.forEach((row, index) => {
    row.cells.forEach((cell, i) => {
      for (const { key, label } of HEADER_LABELS) {
        if (found[key] || !label.test(cell.text)) continue;
        const inline = cell.text.replace(label, '').replace(/^\s*[:.\-]+\s*/, '').trim();
        // Look ahead for the first subsequent cell in this row that holds a value (skipping standalone ":" or punctuation)
        let candidate: PdfCell | undefined;
        for (let j = i + 1; j < row.cells.length; j++) {
          const c = row.cells[j];
          if (HEADER_LABELS.some((h) => h.label.test(c.text))) break;
          const clean = c.text.replace(/^[:.\-\s]+/, '').trim();
          if (clean.length > 0) {
            candidate = c;
            break;
          }
        }
        let value = inline || (candidate ? candidate.text.replace(/^[:.\-\s]+/, '').trim() : '');
        const valueX = inline ? cell.x : candidate?.x;
        // A long value (such as a company name) wraps onto the line below, under the value
        const below = rows[index + 1];
        const underValue = (x: number) => (inline ? x > cell.x : valueX !== undefined && Math.abs(x - valueX) < 15);
        if (key === 'source' && value && below && below.cells.length === 1 && underValue(below.cells[0].x) && !/:/.test(below.cells[0].text) && below.top - row.top < 25) {
          value += ' ' + below.cells[0].text;
        }
        if (!value || value === ':') continue;
        if (key === 'receivedDate') found.receivedDate = toIsoDate(value);
        else if (key === 'model19No' || key === 'poNumber') {
          const cleanVal = value.replace(/^[#№:.\s]+/, '');
          found[key] = /^[A-Za-z0-9][A-Za-z0-9/\-.]*/.exec(cleanVal)?.[0];
        } else {
          found[key] = value;
        }
      }
    });
  });
  // The program, printed above the report title (only there: an item such as "Programmable controller" is no program)
  const titleIndex = rows.findIndex((r) => /print\s*model\s*19/i.test(rowsToText([r])));
  const headerIndex = rows.findIndex((r) => r.cells.some((c) => HEADER_LABELS.some((h) => h.label.test(c.text))));
  const above = titleIndex >= 0 ? titleIndex : headerIndex >= 0 ? headerIndex : 0;
  const program = rows.slice(0, above).find((r) => /program/i.test(rowsToText([r])));
  if (program) found.programName = rowsToText([program]).trim();

  // Signature lines: "Delivered By : Name : <name>" / "Received By : Name : <name>"; blank ones are only underscores
  const signatory = (label: RegExp): string | undefined => {
    const clean = (s: string) => s.replace(/_+/g, ' ').replace(/^\s*:\s*/, '').replace(/\s+/g, ' ').trim();
    for (const row of rows) {
      for (let i = 0; i < row.cells.length; i++) {
        const match = label.exec(row.cells[i].text);
        if (!match) continue;
        let value = clean(row.cells[i].text.slice(match.index + match[0].length));
        const next = row.cells[i + 1];
        if (!value && next && !/\bby\s*:/i.test(next.text)) value = clean(next.text);
        return value || undefined;
      }
    }
    return undefined;
  };
  found.deliveredBy = signatory(/delivered\s+by\s*:?\s*(?:name\s*:?)?/i);
  found.receivedBy = signatory(/received\s+by\s*:?\s*(?:name\s*:?)?/i);

  found.lines = parseItemLines(rows);
  return found;
}

/**
 * The item lines of an IFMIS voucher table. Model 19 and Model 22 print the same columns: S/No., item code,
 * description, UOM, sub inventory, category, then quantity, unit price, total amount and remark.
 */
function parseItemLines(rows: PdfRow[]): Model19SlipLine[] {
  const lines: Model19SlipLine[] = [];
  const headingX = (pattern: RegExp) => rows.flatMap((r) => r.cells).find((c) => pattern.test(c.text))?.x;
  const columns = { qty: headingX(/^qty$/i), price: headingX(/^unit\s*price$/i), total: headingX(/^total\s*amount$/i), remark: headingX(/^remark$/i) };
  const byColumn = columns.qty !== undefined && columns.price !== undefined && columns.total !== undefined;

  // Items: a row that starts with its number and an item code (either in cell 0 & 1, or combined in cell 0)
  const starts: { row: PdfRow; index: number; codeText: string; restCells: PdfCell[] }[] = [];
  rows.forEach((row, index) => {
    if (row.cells.length < 2) return;
    const c0 = row.cells[0]?.text?.trim() ?? '';
    const c1 = row.cells[1]?.text?.trim() ?? '';
    // A scan whose item code couldn't be read gives "-" in its place: still an item line, with no code
    if (/^\d{1,3}\.?$/.test(c0) && (c1 === '-' || (/\d/.test(c1) && /^[A-Za-z0-9][A-Za-z0-9.\-/]{3,}$/.test(c1)))) {
      starts.push({ row, index, codeText: c1, restCells: row.cells.slice(2) });
      return;
    }
    const parts = c0.split(/\s+/);
    if (parts.length >= 2 && /^\d{1,3}\.?$/.test(parts[0]) && /\d/.test(parts[1]) && /^[A-Za-z0-9][A-Za-z0-9.\-/]{3,}$/.test(parts[1])) {
      const rest = [{ x: row.cells[0].x + 30, text: parts.slice(2).join(' ') }, ...row.cells.slice(1)].filter((c) => c.text.trim());
      starts.push({ row, index, codeText: parts[1], restCells: rest });
    }
  });

  starts.forEach(({ row, index, codeText, restCells }, n) => {
    const end = n + 1 < starts.length ? starts[n + 1].index : rows.length;
    const band: PdfRow[] = [row];
    for (let r = index + 1; r < end; r++) {
      if (TABLE_STOP.test(rowsToText([rows[r]]))) break;
      band.push(rows[r]);
    }

    const uomPattern = /^(?:EA|PCS|SET|BOX|BAG|PKT|ROLL|KG|QUINTAL|LTR|CAN|BOTTLE|VIAL|PAIR|M|DRUM|DOZEN|PACK|RM|REAM|UNIT|UNITS|CTN|CARTON|TUBE|SHEET|BDL|MTR|LTR|PC)$/i;
    const uomIndex = restCells.findIndex((c, i) => i > 0 && (uomPattern.test(c.text.trim()) || (/^[A-Za-z]{1,6}$/.test(c.text.trim()) && c.text === c.text.toUpperCase() && !NUMBER.test(c.text))));
    const uom = uomIndex >= 0 ? restCells[uomIndex] : undefined;
    const sub = uom && !NUMBER.test(restCells[uomIndex + 1]?.text ?? '') ? restCells[uomIndex + 1] : undefined;
    const cat = sub && !NUMBER.test(restCells[uomIndex + 2]?.text ?? '0') ? restCells[uomIndex + 2] : undefined;
    const descX = restCells[0]?.x ?? row.cells[0].x + 40;
    const near = (a: PdfCell, b?: PdfCell) => !!b && Math.abs(a.x - b.x) < 8;

    const description: string[] = [];
    const subInventory: string[] = [];
    const category: string[] = [];
    const numbers: PdfCell[] = [];
    for (const r of band) {
      for (const cell of r.cells) {
        if (cell === row.cells[0] || cell.text === codeText) continue;
        if (NUMBER.test(cell.text) && cell.x > (cat ?? sub ?? uom ?? { x: descX + 80 }).x + 10) numbers.push(cell);
        else if (uom && cell.x >= descX - 2 && cell.x < uom.x - 2) description.push(cell.text);
        else if (!uom && cell.x >= descX - 2 && (!columns.qty || cell.x < columns.qty - 50)) description.push(cell.text);
        else if (near(cell, cat)) category.push(cell.text);
        else if (near(cell, sub)) subInventory.push(cell.text);
      }
    }
    let figures: { quantity?: number; unitPrice?: number; totalAmount?: number } = {};
    if (byColumn) {
      const { qty, price, total, remark } = columns as Required<typeof columns>;
      for (const cell of row.cells) {
        const first = cell.text.split(/\s+/)[0];
        if (!NUMBER.test(first) || cell.x < qty - 40) continue;
        const value = asNumber(first);
        if (cell.x < price) figures.quantity ??= value;
        else if (cell.x < total) figures.unitPrice ??= value;
        else if (remark === undefined || cell.x < remark) figures.totalAmount ??= value;
      }
    } else {
      numbers.sort((c1, c2) => c1.x - c2.x);
      const [quantity, unitPrice, totalAmount] = numbers.slice(-3).map((c) => asNumber(c.text));
      if (numbers.length >= 3) figures = { quantity, unitPrice, totalAmount };
    }
    lines.push({
      itemCode: codeText === '-' ? undefined : codeText,
      description: description.join(' ').replace(/\s+/g, ' ').trim() || undefined,
      uom: uom?.text,
      subInventory: subInventory.join(' ').trim() || undefined,
      category: category.join(' ').replace(/\s+/g, ' ').trim() || undefined,
      ...figures,
    });
  });
  return lines;
}

// ─── Fixed Asset Disposal Form (Model 22/B) ──────────────────────────────────

/** One asset on an IFMIS disposal form */
export interface DisposalSlipLine {
  description?: string;
  tagNumber?: string;
  /** Matches an asset whose IFMIS tag isn't recorded yet, by the serial number received with it */
  serialNumber?: string;
  /** As IFMIS prints it, e.g. DONATION */
  disposalType?: string;
  originalCost?: number;
  accumulatedDepreciation?: number;
  bookValue?: number;
}

/** What an IFMIS "Fixed Asset Disposal Form" (Model 22/B) says */
export interface DisposalSlipFields {
  disposalNo?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** "Sold / Transferred / Donated to" */
  recipient?: string;
  lines: DisposalSlipLine[];
}

/** Whether the text is an IFMIS issue voucher (Model 22, "Receipt For Articles Or Property Issued") */
export const isModel22 = (text: string): boolean =>
  (/receipt\s+for\s+articles\s+or\s+property\s+issued|\bmodel\s*[-/]?\s*22(?:\s*(?:no\.?|#))?(?![-/]?\s*b\b)|\bሞዴል\s*[-/]?\s*22(?![-/]?\s*b\b)/i.test(text)) &&
  !/model\s*[-/]?\s*22\s*[-/]?\s*b\b|fixed\s+asset\s+disposal/i.test(text);

/** What an IFMIS issue voucher (Model 22, "Receipt For Articles Or Property Issued") says */
export interface Model22SlipFields {
  /** As printed, e.g. "0000001/A Inventory" */
  model22No?: string;
  /** YYYY-MM-DD */
  issuedDate?: string;
  transactionType?: string;
  destination?: string;
  transportationCost?: number;
  /** Names on the signature lines, when IFMIS printed them */
  issuedBy?: string;
  receivedBy?: string;
  lines: Model19SlipLine[];
  /** How many vouchers the PDF holds: only the first is read */
  vouchers: number;
}

const M22_LABELS: { key: 'model22No' | 'issuedDate' | 'transactionType' | 'destination'; label: RegExp }[] = [
  { key: 'model22No', label: /(?:^|\b)model\s*22\s*no\.?/i },
  { key: 'issuedDate', label: /(?:^|\b)issued\s*date/i },
  { key: 'transactionType', label: /(?:^|\b)transaction\s*type/i },
  { key: 'destination', label: /(?:^|\b)destination\b/i },
];

/**
 * The fields of an IFMIS Model 22; anything not found is left out. A report can hold several vouchers one after
 * another: the first one is read, and `vouchers` says how many there are.
 */
export function parseModel22(rows: PdfRow[]): Model22SlipFields {
  const headers = rows.map((r, i) => (r.cells.some((c) => M22_LABELS[0].label.test(c.text)) ? i : -1)).filter((i) => i >= 0);
  const voucher = headers.length > 1 ? rows.slice(0, headers[1]) : rows;
  const found: Model22SlipFields = { lines: parseItemLines(voucher), vouchers: Math.max(headers.length, 1) };

  // Header: "Label :" then its value, in the same piece or the next one
  for (const row of voucher) {
    row.cells.forEach((cell, i) => {
      for (const { key, label } of M22_LABELS) {
        if (found[key] || !label.test(cell.text)) continue;
        const inline = cell.text.replace(label, '').replace(/^\s*[:.]?\s*/, '').trim();
        const next = row.cells[i + 1];
        let value = inline || (next && !M22_LABELS.some((h) => h.label.test(next.text)) ? next.text.replace(/^:\s*/, '').trim() : '');
        if (key === 'model22No') {
          const match = /(?:model\s*22\s*no\.?|#)\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i.exec(cell.text);
          if (match) value = match[1];
        }
        if (!value || value === ':') continue;
        found[key] = key === 'issuedDate' ? toIsoDate(value) : value;
      }
    });
  }
  // "Transportation Cost:" and its figure, when there is one
  for (const row of voucher) {
    const at = row.cells.findIndex((c) => /transportation\s*cost/i.test(c.text));
    if (at < 0) continue;
    const figure = row.cells.slice(at + 1).map((c) => c.text.replace(/,/g, '')).find((t) => /^\d+(\.\d+)?$/.test(t));
    if (figure && Number(figure) > 0) found.transportationCost = Number(figure);
  }

  // Signature lines (on the last page): "Issued By : Name : <name>" / "Received By : Name : <name>"
  const signatory = (label: RegExp): string | undefined => {
    const clean = (t: string) => t.replace(/_+/g, ' ').replace(/^\s*:\s*/, '').replace(/\s+/g, ' ').trim();
    for (const row of rows) {
      for (let i = 0; i < row.cells.length; i++) {
        const match = label.exec(row.cells[i].text);
        if (!match) continue;
        let value = clean(row.cells[i].text.slice(match.index + match[0].length));
        // The value is in the next pieces, up to the other signature on the same line
        for (let j = i + 1; !value && j < row.cells.length && !/\bby\s*:/i.test(row.cells[j].text); j++) value = clean(row.cells[j].text);
        return value || undefined;
      }
    }
    return undefined;
  };
  found.issuedBy = signatory(/issued\s+by\s*:?\s*(?:name\s*:?)?/i);
  found.receivedBy = signatory(/received\s+by\s*:?\s*(?:name\s*:?)?/i);
  return found;
}

/** Whether the text is an IFMIS disposal form at all */
export const isDisposalForm = (text: string): boolean =>
  /fixed\s+asset\s+disposal\s+form|model\s*[-/]?\s*22\s*[-/]?\s*b\b|ሞዴል\s*[-/]?\s*22\s*[-/]?\s*b/i.test(text);

const MONEY = /^-?[\d,]+\.\d{2}$/;
// An IFMIS tag (MOA-004344) or a record code with its category (MOA-IT-2026-0075)
const TAG = /^[A-Za-z]{2,}(?:[-/][A-Za-z]{2,5})?[-/]?\d{3,}[A-Za-z0-9/\-]*$/;

/** The fields of an IFMIS disposal form; anything not found is left out */
export function parseDisposalForm(rows: PdfRow[]): DisposalSlipFields {
  const found: DisposalSlipFields = { lines: [] };
  // Header: "Label :" with its value in the next piece
  const after = (label: RegExp) => {
    for (const row of rows) {
      const i = row.cells.findIndex((c) => label.test(c.text));
      if (i >= 0) {
        // Only what follows the label: "Sold /Transferred / Donated to :" is one piece with its own slashes
        const match = label.exec(row.cells[i].text)!;
        const inline = row.cells[i].text.slice(match.index + match[0].length).replace(/^[:.\-\s]+/, '').trim();
        return inline || row.cells[i + 1]?.text.replace(/^[:.\-\s]+/, '').trim() || undefined;
      }
    }
    return undefined;
  };
  // The value may come in the same piece as its label ("Date: 28-JUL-26") or in the next one
  found.disposalNo = after(/^no\s*:?(?=\s|$)/i);
  const date = after(/^date\s*:?(?=\s|$)/i);
  found.date = date ? toIsoDate(date) : undefined;
  found.recipient = after(/donated\s+to\s*:?/i);

  // Assets. IFMIS doesn't print a line's cells on one baseline: the disposal type sits just above its number, a long
  // description wraps onto the next line, and the tag, serial and figures sit a little lower. So each line is the band
  // from just above its number to just above the next one.
  const cellsOf = rows.flatMap((r) => r.cells);
  const headingX = (pattern: RegExp) => cellsOf.find((c) => pattern.test(c.text))?.x;
  const typeX = headingX(/^disposal\s*type$/i);
  const tagX = headingX(/^tag\s*number$/i);
  const serialX = headingX(/^serial\s*number$/i);
  const headIndex = rows.findIndex((r) => r.cells.some((c) => /^tag\s*number$/i.test(c.text)));
  const endIndex = rows.findIndex((r, i) => i > headIndex && r.cells.some((c) => /undersigned|report taken/i.test(c.text)));
  // The headings wrap over several rows ("Asset" / "Description", "Accumulated" / "Depreciation"): none of them is a line
  const HEADING = /^(s\.?\s*no|asset|description|asset description|tag number|serial number|chassis no|engine no|declaration|number|declaration number|disposal type|original cost|accumulated|depreciation|accumulated depreciation|book value|remark)$/i;
  const body = rows.slice(headIndex + 1, endIndex < 0 ? undefined : endIndex).filter((r) => !r.cells.every((c) => HEADING.test(c.text)));
  // A line starts with its number, left of the tag column
  const starts = body.filter((r) => /^\d{1,3}$/.test(r.cells[0]?.text ?? '') && (tagX === undefined || r.cells[0].x < tagX - 10));
  const pitch = starts.length > 1 ? starts[1].top - starts[0].top : 30;
  // The disposal type is printed this far above the number at most; anything lower belongs to the line
  const lead = Math.min(12, pitch * 0.45);
  starts.forEach((start, n) => {
    const from = start.top - lead;
    const to = (starts[n + 1]?.top ?? start.top + pitch) - lead;
    const band = body
      .filter((r) => r.top >= from && r.top < to)
      .flatMap((r) => r.cells)
      // Close columns can come as one piece ("MOA-IT-2026-0075 SLIP-TEST-01"): the tag and the serial after it
      .flatMap((c) => {
        const [first, ...rest] = c.text.split(/\s+/);
        const nearTag = tagX === undefined || Math.abs(c.x - tagX) < 40;
        return nearTag && rest.length && TAG.test(first) ? [{ x: c.x, text: first }, { x: serialX ?? c.x + 50, text: rest.join(' ') }] : [c];
      });
    const number = start.cells[0];
    const tag = band.find((c) => TAG.test(c.text) && (tagX === undefined || Math.abs(c.x - tagX) < 40));
    if (!tag) return;
    const typeCell = band.find((c) => /^[A-Z][A-Z /]{2,}$/.test(c.text) && (typeX === undefined || Math.abs(c.x - typeX) < 20));
    const serial = serialX === undefined ? undefined : band.find((c) => c !== tag && c !== typeCell && !MONEY.test(c.text) && Math.abs(c.x - serialX) < 40);
    const description = band
      .filter((c) => c !== number && c.x > number.x && c.x < tag.x - 2 && c !== typeCell)
      .map((c) => c.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const money = band.filter((c) => MONEY.test(c.text)).sort((a, b) => a.x - b.x).map((c) => asNumber(c.text));
    found.lines.push({
      description: description || undefined,
      tagNumber: tag.text,
      ...(serial ? { serialNumber: serial.text } : {}),
      disposalType: typeCell?.text,
      originalCost: money[0],
      accumulatedDepreciation: money[1],
      bookValue: money[2],
    });
  });
  return found;
}

/**
 * Only a Model 19's prices are taken from its PDF. On the other forms the money (transport cost, original cost,
 * depreciation, book value, prices) is left empty for the person to enter: these drop it from what was read.
 */
export const withoutAmounts = {
  model22: ({ transportationCost: _cost, ...slip }: Model22SlipFields): Model22SlipFields => ({
    ...slip,
    lines: slip.lines.map(({ unitPrice: _price, totalAmount: _total, ...line }) => line),
  }),
  model21: (slip: Model21SlipFields): Model21SlipFields => ({
    ...slip,
    lines: slip.lines.map(({ origCost: _cost, depreciation: _dep, bookValue: _book, ...line }) => line),
  }),
  disposal: (form: DisposalSlipFields): DisposalSlipFields => ({
    ...form,
    lines: form.lines.map(({ originalCost: _cost, accumulatedDepreciation: _dep, bookValue: _book, ...line }) => line),
  }),
};
