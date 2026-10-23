/**
 * Reads a scanned slip (a scanned PDF or a photo) with OCR, so the same slip reader can fill the form from it.
 * The OCR engine and its English data are served by the app at /ocr/, so this works without internet.
 * A scan can be misread: the form says what was filled from it and asks for a check against the paper.
 */
import { PdfCell, PdfRow, openPdf } from './slip-reader';

/** A word as the OCR engine returns it, with its box in pixels */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** A line of words as the OCR engine returns it */
export interface OcrLine {
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Table borders and stray marks that OCR reads as "words" */
const NOISE = /^[|[\]{}()_\-—–=~'"`!¦]+$/;

/**
 * Recognised lines as rows of cells, in the units the slip reader works in (PDF points: an A4 page is 842 wide
 * lying down, 595 standing). Words close together form one cell; a wide gap, such as between table columns, starts the next.
 */
export function ocrLinesToRows(lines: OcrLine[], scale: number, pageOffset = 0): PdfRow[] {
  const rows: PdfRow[] = [];
  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim() && !NOISE.test(w.text.trim())).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (words.length === 0) continue;
    const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)] || 10;
    const cells: { x: number; end: number; text: string }[] = [];
    for (const word of words) {
      const last = cells[cells.length - 1];
      if (last && word.bbox.x0 - last.end <= height * 1.2) {
        last.text += ' ' + word.text.trim();
        last.end = word.bbox.x1;
      } else {
        cells.push({ x: word.bbox.x0, end: word.bbox.x1, text: word.text.trim() });
      }
    }
    rows.push({
      top: pageOffset + line.bbox.y0 * scale,
      cells: cells.map((c): PdfCell => ({ x: c.x * scale, text: c.text })),
    });
  }
  return rows.sort((a, b) => a.top - b.top);
}

/** About 300 dots per inch across an A4 page, which is what the OCR engine reads best */
const TARGET_WIDTH = 2600;

/** Enlarged to about TARGET_WIDTH, made grey and stretched to full contrast, which OCR reads far better than a raw photo */
function prepare(source: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const factor = Math.min(3, Math.max(1, TARGET_WIDTH / source.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * factor);
  canvas.height = Math.round(source.height * factor);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const grey = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = grey;
    histogram[grey]++;
  }
  // The darkest and lightest 1% set the range, so a grey photo becomes black text on white
  const pixels = d.length / 4;
  let low = 0;
  let high = 255;
  for (let sum = 0; low < 255 && (sum += histogram[low]) < pixels * 0.01; low++);
  for (let sum = 0; high > 0 && (sum += histogram[high]) < pixels * 0.01; high--);
  const span = Math.max(1, high - low);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - low) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The pages of a scanned PDF as pictures */
async function pdfPages(file: File, maxPages: number): Promise<HTMLCanvasElement[]> {
  const doc = await openPdf(file);
  const pages: HTMLCanvasElement[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      pages.push(canvas);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** A photo or image file as a picture */
async function imagePage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

export const isImageFile = (file: File): boolean =>
  /^image\/(png|jpe?g|webp)$/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);

/** A picture turned clockwise by a quarter turn, a half turn or three quarters */
export function rotate(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (degrees % 360 === 0) return source;
  const quarter = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? source.height : source.width;
  canvas.height = quarter ? source.width : source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/** Words every Model 19 prints, to tell a page read the right way up from one read sideways or upside down */
const SLIP_WORDS = /\b(model|receipt|receiving|quantity|total|amount|item|description|price|date|number|supplier|received|delivered|inventory|transaction|category)\b/gi;

/** How readable recognised text is: words of the form found, then the engine's own confidence */
export const readability = (text: string, confidence: number): number => (text.match(SLIP_WORDS)?.length ?? 0) * 10 + confidence;

/** The share of real words (3 letters or more) lying flat: text read down a sideways page has tall, narrow words */
export const flatShare = (words: OcrWord[]): number => {
  const real = words.filter((w) => w.text.trim().length >= 3);
  if (real.length === 0) return 0;
  return real.filter((w) => w.bbox.x1 - w.bbox.x0 > w.bbox.y1 - w.bbox.y0).length / real.length;
};

/**
 * Which way up a scanned page is: scans and phone photos often come sideways or upside down. Each turn is read once,
 * small and quick, and the one that reads most like a Model 19 with its words lying flat wins (the engine can read
 * text running down a sideways page, but its words then come out of order); a page that already reads well is kept.
 */
async function uprightTurn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worker: { recognize: (image: HTMLCanvasElement, options?: object, output?: object) => Promise<{ data: any }> },
  picture: CanvasImageSource & { width: number; height: number },
): Promise<number> {
  const small = document.createElement('canvas');
  const factor = Math.min(1, 1400 / Math.max(picture.width, picture.height));
  small.width = Math.round(picture.width * factor);
  small.height = Math.round(picture.height * factor);
  small.getContext('2d')!.drawImage(picture, 0, 0, small.width, small.height);
  let best = { turn: 0, score: -1 };
  for (const turn of [0, 180, 90, 270]) {
    const { data } = await worker.recognize(rotate(small, turn), {}, { blocks: true, text: true });
    const words: OcrWord[] = (data.blocks ?? []).flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines.flatMap((l: any) => l.words)));
    const flat = flatShare(words);
    const score = readability(data.text, data.confidence) * flat;
    if (score > best.score) best = { turn, score };
    // Plainly the right way up: no need to try the other turns
    if (turn === 0 && (data.text.match(SLIP_WORDS)?.length ?? 0) >= 5 && data.confidence >= 60 && flat >= 0.8) break;
  }
  return best.turn;
}

/** A recognised word with its box, as the engine's blocks give it */
type BoxWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };

/**
 * Where a picture has printed rule lines: the positions (pixels along `length`) where more than `share` of the
 * span `[from, to)` across is dark. Neighbouring positions of one thick line are merged into its centre.
 */
export function ruleLines(dark: (along: number, across: number) => boolean, length: number, from: number, to: number, share = 0.45): number[] {
  const span = Math.max(1, to - from);
  const hits: number[] = [];
  for (let a = 0; a < length; a++) {
    let n = 0;
    for (let c = from; c < to; c += 2) if (dark(a, c)) n++;
    if ((n * 2) / span >= share) hits.push(a);
  }
  const lines: number[] = [];
  let start = -1;
  for (let i = 0; i < hits.length; i++) {
    if (start < 0) start = hits[i];
    if (i === hits.length - 1 || hits[i + 1] - hits[i] > 3) {
      lines.push(Math.round((start + hits[i]) / 2));
      start = -1;
    }
  }
  return lines;
}

/** A figure as OCR reads it in a cell: "1,159.99", "285 01" (a dropped decimal point) */
export const cellNumber = (text: string): string => {
  const t = text.replace(/[^\d.,\s]/g, '').trim();
  const split = /^(\d[\d,]*)\s+(\d{2})$/.exec(t);
  return (split ? `${split[1]}.${split[2]}` : t.replace(/\s+/g, '')).replace(/,/g, '');
};

/** An IFMIS item code as OCR reads it: "101101101 0339" or "1011011010339" is 101101101.0339 */
export const cellCode = (text: string): string => {
  const digits = text.replace(/[^\d.]/g, '');
  if (/^\d{9}\.\d{4}$/.test(digits)) return digits;
  const bare = digits.replace(/\./g, '');
  return bare.length === 13 ? `${bare.slice(0, 9)}.${bare.slice(9)}` : digits;
};

/**
 * The item table of a scanned Model 19, read cell by cell. Reading the whole page mixes the columns of a ruled
 * table, so the table's printed lines are found in the picture, each column is named by its heading, and every
 * cell is read on its own (codes and figures as digits only). Rows come back laid out as a text PDF's are, with
 * their own headings, so the Model 19 reader takes them as it is. Null when the table can't be found.
 */
async function readItemTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worker: any,
  canvas: HTMLCanvasElement,
  words: BoxWord[],
  scale: number,
  pageOffset: number,
): Promise<{ rows: PdfRow[]; top: number; bottom: number } | null> {
  const find = (pattern: RegExp) => words.find((w) => pattern.test(w.text.trim()));
  const heads = {
    sno: find(/^s\/?n[o0]\.?$/i),
    code: find(/^code$/i),
    desc: find(/^description$/i),
    uom: find(/^uom$/i),
    sub: find(/^sub$/i),
    cat: find(/^category$/i),
    qty: find(/^qty$/i),
    price: find(/^price$/i),
    total: find(/^amount$/i),
    remark: find(/^remark$/i),
  };
  if (!heads.code || !heads.desc || !heads.qty || !heads.price || !heads.total) return null;
  const found = Object.values(heads).filter(Boolean) as BoxWord[];
  const headTop = Math.min(...found.map((w) => w.bbox.y0));
  const headBottom = Math.max(...found.map((w) => w.bbox.y1));
  const grand = words.find((w) => /^grand$/i.test(w.text.trim()) && w.bbox.y0 > headBottom);

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const left = Math.max(0, Math.min(...found.map((w) => w.bbox.x0)) - 160);
  const right = Math.min(canvas.width, Math.max(...found.map((w) => w.bbox.x1)) + 220);
  const top = Math.max(0, headTop - 60);
  const bottom = Math.min(canvas.height, (grand ? grand.bbox.y1 : canvas.height) + 10);
  const image = ctx.getImageData(left, top, right - left, bottom - top);
  const w = image.width;
  const dark = (x: number, y: number) => image.data[(y * w + x) * 4] < 110;

  // Row lines across the table, column lines down it
  const rowLines = ruleLines((y, x) => dark(x, y), image.height, 0, w).map((y) => y + top);
  const colLines = ruleLines((x, y) => dark(x, y), w, 0, image.height, 0.4).map((x) => x + left);
  const firstLine = rowLines.find((y) => y > headBottom);
  const lastLine = grand ? [...rowLines].reverse().find((y) => y <= grand.bbox.y0 + 4) : rowLines[rowLines.length - 1];
  if (firstLine === undefined || lastLine === undefined || colLines.length < 5) return null;

  // Each heading's column: the space between the column lines around it
  const columnOf = (word?: BoxWord) => {
    if (!word) return undefined;
    const mid = (word.bbox.x0 + word.bbox.x1) / 2;
    const after = colLines.findIndex((x) => x > mid);
    return after > 0 ? { x0: colLines[after - 1], x1: colLines[after] } : undefined;
  };
  const cols = {
    code: columnOf(heads.code),
    desc: columnOf(heads.desc),
    uom: columnOf(heads.uom),
    sub: columnOf(heads.sub),
    cat: columnOf(heads.cat),
    qty: columnOf(heads.qty),
    price: columnOf(heads.price),
    total: columnOf(heads.total),
  };
  if (!cols.code || !cols.desc || !cols.qty || !cols.price || !cols.total) return null;

  const bands: { y0: number; y1: number }[] = [];
  for (const [i, y] of rowLines.entries()) {
    const next = rowLines[i + 1];
    if (y >= firstLine && next !== undefined && next <= lastLine && next - y > 18) bands.push({ y0: y, y1: next });
  }
  if (bands.length === 0) return null;

  // One cell, read on its own: a little inside its lines, enlarged when small
  const cell = (col: { x0: number; x1: number }, band: { y0: number; y1: number }) => {
    const pad = 4;
    const cw = Math.max(1, col.x1 - col.x0 - pad * 2);
    const ch = Math.max(1, band.y1 - band.y0 - pad * 2);
    const factor = ch < 60 ? 2 : 1;
    const out = document.createElement('canvas');
    out.width = cw * factor + 20;
    out.height = ch * factor + 20;
    const o = out.getContext('2d')!;
    o.fillStyle = '#fff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(canvas, col.x0 + pad, band.y0 + pad, cw, ch, 10, 10, cw * factor, ch * factor);
    return out;
  };
  const read = async (key: keyof typeof cols, mode: string, whitelist: string) => {
    const col = cols[key];
    if (!col) return bands.map(() => '');
    await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist });
    const texts: string[] = [];
    for (const band of bands) {
      const { data } = await worker.recognize(cell(col, band));
      texts.push(String(data.text ?? '').replace(/\s+/g, ' ').trim());
    }
    return texts;
  };
  const LINE = '7';
  const BLOCK = '6';
  const code = (await read('code', LINE, '0123456789. ')).map(cellCode);
  const desc = await read('desc', BLOCK, '');
  const uom = (await read('uom', LINE, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')).map((t) => t.replace(/[^A-Z]/g, ''));
  const sub = await read('sub', BLOCK, '');
  const cat = await read('cat', BLOCK, '');
  const qty = (await read('qty', LINE, '0123456789., ')).map(cellNumber);
  const price = (await read('price', LINE, '0123456789., ')).map(cellNumber);
  const total = (await read('total', LINE, '0123456789., ')).map(cellNumber);
  await worker.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' });

  // As a text PDF lays them out: the headings, then one row per line, each cell where its heading is
  const at = (col?: { x0: number; x1: number }) => (col ? (col.x0 + 6) * scale : 0);
  const rows: PdfRow[] = [
    {
      top: pageOffset + headTop * scale,
      cells: [
        { x: at(cols.qty), text: 'Qty' },
        { x: at(cols.price), text: 'Unit Price' },
        { x: at(cols.total), text: 'Total Amount' },
      ],
    },
  ];
  let n = 0;
  bands.forEach((band, i) => {
    if (!code[i] && !desc[i]) return;
    n += 1;
    const cells: PdfCell[] = [
      { x: Math.max(0, at(cols.code) - 30), text: String(n) },
      { x: at(cols.code), text: code[i] || '-' },
      { x: at(cols.desc), text: desc[i] || '-' },
    ];
    if (uom[i]) cells.push({ x: at(cols.uom), text: uom[i] });
    if (sub[i]) cells.push({ x: at(cols.sub), text: sub[i] });
    if (cat[i]) cells.push({ x: at(cols.cat), text: cat[i] });
    for (const [col, value] of [[cols.qty, qty[i]], [cols.price, price[i]], [cols.total, total[i]]] as const) {
      if (value) cells.push({ x: at(col), text: value });
    }
    rows.push({ top: pageOffset + ((band.y0 + band.y1) / 2) * scale, cells });
  });
  return { rows, top: pageOffset + (headTop - 4) * scale, bottom: pageOffset + lastLine * scale };
}

/** The rows of a scanned slip, read with OCR. Empty when nothing could be recognised. */
export async function ocrRows(file: File, maxPages = 2): Promise<PdfRow[]> {
  const pictures = isImageFile(file) ? [await imagePage(file)] : await pdfPages(file, maxPages);
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    workerBlobURL: false,
    gzip: true,
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
    const rows: PdfRow[] = [];
    for (let i = 0; i < pictures.length; i++) {
      const canvas = rotate(prepare(pictures[i]), await uprightTurn(worker, pictures[i]));
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const lines: OcrLine[] =
        (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines as unknown as OcrLine[])) ??
        ((data as unknown as { lines?: OcrLine[] }).lines ?? []);
      // Pixels to points: the picture is a page lying down (842 wide) or standing (595)
      const scale = (canvas.width > canvas.height ? 842 : 595) / canvas.width;
      const pageRows = ocrLinesToRows(lines, scale, i * 100000);
      // The item table, read cell by cell, in place of what the whole-page reading made of it
      const words = lines.flatMap((l) => l.words) as BoxWord[];
      const table = await readItemTable(worker, canvas, words, scale, i * 100000).catch(() => null);
      if (table) {
        rows.push(...pageRows.filter((r) => r.top < table.top || r.top > table.bottom), ...table.rows);
        rows.sort((a, b) => a.top - b.top);
      } else {
        rows.push(...pageRows);
      }
    }
    return rows;
  } finally {
    await worker.terminate();
    pictures.forEach((p) => 'close' in p && typeof p.close === 'function' && p.close());
  }
}
