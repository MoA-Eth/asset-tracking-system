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

/** Words printed across Ethiopian government asset vouchers (Model 19, 21, 22, 22/B) to detect orientation */
const SLIP_WORDS = /\b(model|receipt|receiving|quantity|total|amount|item|description|price|date|number|supplier|received|delivered|inventory|transaction|category|transfer|internal|issue|issued|store|disposal|chassis|plate|engine|accessory|articles|property)\b/gi;

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
 * Where a picture has printed rule lines: the positions (pixels along `length`) where at least `share` of the
 * span `[from, to)` across is dark. Neighbouring positions of one thick line are merged into its centre.
 */
export function ruleLines(
  dark: (along: number, across: number) => boolean,
  length: number,
  from: number,
  to: number,
  share = 0.45,
  minRun = 1,
): number[] {
  const span = Math.max(1, to - from);
  const hits: number[] = [];
  for (let a = 0; a < length; a++) {
    // Only unbroken dark stretches of at least `minRun` count: a printed line is long stretches, text short ones
    let covered = 0;
    let run = 0;
    for (let c = from; c <= to; c++) {
      if (c < to && dark(a, c)) run++;
      else {
        if (run >= minRun) covered += run;
        run = 0;
      }
    }
    if (covered / span >= share) hits.push(a);
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
  const t = text.replace(/[^\d.,\s]/g, ' ').trim();
  // "285 01": a decimal point lost between the birr and the cents
  const split = /^(\d[\d,]*)\s+(\d{2})(?!\d)/.exec(t);
  if (split) return `${split[1]}.${split[2]}`.replace(/,/g, '');
  // Otherwise the figure with the most digits: a speck or a bit of border read as "1" beside it is not part of it
  const figures = (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((f) => f.replace(/,/g, ''));
  return figures.reduce((best, f) => (f.replace(/\D/g, '').length > best.replace(/\D/g, '').length ? f : best), '');
};

/** A description as OCR reads it, without the marks a cell's edges leave: bars, brackets and stray bits at its end */
export const cleanText = (text: string): string => {
  const words = text.replace(/\n/g, ' ').replace(/[|[\]{}~“”"_]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && words[words.length - 1].replace(/[^A-Za-z0-9]/g, '').length <= 2) words.pop();
  return words.join(' ');
};

/** Units IFMIS prints on a Model 19 (RM is a ream of paper) */
const SCAN_UNITS = ['QUINTAL', 'BOTTLE', 'DOZEN', 'PAIR', 'PACK', 'ROLL', 'DRUM', 'VIAL', 'PCS', 'PKT', 'SET', 'BOX', 'BAG', 'LTR', 'CAN', 'KG', 'EA', 'RM'];

/** A unit as OCR reads it, with stray letters around it dropped: "CPKT" is PKT. Empty when no unit is in it */
export const scanUnit = (text: string): string => {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  return SCAN_UNITS.find((u) => letters.includes(u)) ?? '';
};

/**
 * A decimal point OCR dropped, put back where the arithmetic proves it: when a price or total read a hundred times
 * too large ("1739991" for 17399.91) makes quantity × price equal the total once divided by 100, two independent
 * figures agree on it. Anything else is left as read, for the person to check.
 */
export function restoreDecimals(qty: string, price: string, total: string): { price: string; total: string } {
  const q = Number(qty);
  const p = Number(price);
  const t = Number(total);
  const near = (a: number, b: number) => b > 0 && Math.abs(a - b) <= Math.max(1, b * 0.01);
  if (!(q > 0 && p > 0 && t > 0) || near(q * p, t)) return { price, total };
  if (!total.includes('.') && near(q * p, t / 100)) return { price, total: (t / 100).toFixed(2) };
  if (!price.includes('.') && near((q * p) / 100, t)) return { price: (p / 100).toFixed(2), total };
  return { price, total };
}

/** An IFMIS item code as OCR reads it: "101101101 0339" or "1011011010339" is 101101101.0339 */
export const cellCode = (text: string): string => {
  const digits = text.replace(/[^\d.]/g, '');
  if (/^\d{9}\.\d{4}$/.test(digits)) return digits;
  const bare = digits.replace(/\./g, '');
  return bare.length === 13 ? `${bare.slice(0, 9)}.${bare.slice(9)}` : digits;
};

/**
 * How far (in degrees, clockwise) the rule lines among `points` are turned: the angle at which the most dark pixels
 * fall on the same lines. Tried from -3° to 3°; 0 when nothing stands out.
 */
export function skewAngle(points: { x: number; y: number }[]): number {
  if (points.length < 50) return 0;
  let best = { angle: 0, score: -1 };
  for (let tenth = -30; tenth <= 30; tenth++) {
    const t = Math.tan((tenth / 10) * (Math.PI / 180));
    const bins = new Map<number, number>();
    for (const p of points) {
      const k = Math.round(p.y - p.x * t);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    let score = 0;
    for (const c of bins.values()) score += c * c;
    if (score > best.score) best = { angle: tenth / 10, score };
  }
  return best.angle;
}

/**
 * The page turned so that the item table's rule lines run straight across, with the recognised words moved to
 * match. Unchanged when the table is already straight (under 0.15°) or can't be located.
 */
function straighten(page: HTMLCanvasElement, words: BoxWord[]): { canvas: HTMLCanvasElement; words: BoxWord[] } {
  const marks = words.filter((w) => /^(description|price|amount|category)$/i.test(w.text.trim()));
  if (marks.length < 2) return { canvas: page, words };
  const x0 = Math.max(0, Math.min(...marks.map((w) => w.bbox.x0)) - 300);
  const x1 = Math.min(page.width, Math.max(...marks.map((w) => w.bbox.x1)) + 300);
  const y0 = Math.max(0, Math.min(...marks.map((w) => w.bbox.y0)) - 80);
  const y1 = Math.min(page.height, y0 + 1600);
  const image = page.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0);
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 3) if (image.data[(y * image.width + x) * 4] < 150) points.push({ x, y });
  }
  const angle = skewAngle(points.length > 120000 ? points.filter((_, i) => i % 2 === 0) : points);
  if (Math.abs(angle) < 0.15) return { canvas: page, words };

  const theta = (-angle * Math.PI) / 180;
  const cx = page.width / 2;
  const cy = page.height / 2;
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(cx, cy);
  ctx.rotate(theta);
  ctx.drawImage(page, -cx, -cy);
  const move = (x: number, y: number) => ({
    x: cx + (x - cx) * Math.cos(theta) - (y - cy) * Math.sin(theta),
    y: cy + (x - cx) * Math.sin(theta) + (y - cy) * Math.cos(theta),
  });
  return {
    canvas,
    words: words.map((w) => {
      const c = move((w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2);
      const hw = (w.bbox.x1 - w.bbox.x0) / 2;
      const hh = (w.bbox.y1 - w.bbox.y0) / 2;
      return { ...w, bbox: { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh } };
    }),
  };
}

/**
 * The item table of a scanned Model 19, read cell by cell. Reading the whole page mixes the columns of a ruled
 * table, so the table's printed lines are found in the picture, each column is named by its heading, and every
 * cell is read on its own (codes and figures as digits only). Rows come back laid out as a text PDF's are, with
 * their own headings, so the Model 19 reader takes them as it is. Null when the table can't be found.
 */
async function readItemTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worker: any,
  page: HTMLCanvasElement,
  pageWords: BoxWord[],
  scale: number,
  pageOffset: number,
): Promise<{ rows: PdfRow[]; top: number; bottom: number } | null> {
  // Straightened first: a scan or photo is usually turned a little, and its rule lines then cross the pixel rows
  const { canvas, words } = straighten(page, pageWords);
  const find = (pattern: RegExp) => words.find((w) => pattern.test(w.text.trim()));
  const heads = {
    code: find(/^code$/i),
    desc: find(/^description$/i),
    // OCR often misreads these short headings: "VOM", "U0M", "Oty", "Qtv"
    uom: find(/^[uv][o0]m$/i),
    sub: find(/^sub$/i),
    cat: find(/^category$/i),
    qty: find(/^[qo0a]t[yv]\.?$/i),
    price: find(/^price$/i),
    total: find(/^amount$/i),
  };
  if (!heads.desc || !heads.price || !heads.total) return null;
  const found = Object.values(heads).filter(Boolean) as BoxWord[];
  const headTop = Math.min(...found.map((w) => w.bbox.y0));
  const headBottom = Math.max(...found.map((w) => w.bbox.y1));
  const grand = words.find((w) => /^grand$/i.test(w.text.trim()) && w.bbox.y0 > headBottom);

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // The page's whole width: a heading OCR missed (Item Code, S/No.) can sit far left of the ones it found
  const left = 0;
  const right = canvas.width;
  const top = Math.max(0, headTop - 60);
  const bottom = Math.min(canvas.height, (grand ? grand.bbox.y1 : canvas.height) + 10);
  const image = ctx.getImageData(left, top, right - left, bottom - top);
  const w = image.width;
  // Rule lines on a scan are thin and grey (more so once straightened): anything clearly not paper counts. A line
  // still stands out, crossing nearly the whole table where text never does
  const h = image.height;
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && image.data[(y * w + x) * 4] < 200;
  // A thin line left a pixel or two off level still counts as one line: look two pixels either side
  const nearRow = (x: number, y: number) => dark(x, y) || dark(x, y - 1) || dark(x, y + 1) || dark(x, y - 2) || dark(x, y + 2);
  const nearCol = (x: number, y: number) => dark(x, y) || dark(x - 1, y) || dark(x + 1, y) || dark(x - 2, y) || dark(x + 2, y);

  // Row lines across the table, column lines down it
  // Faint, broken lines on a scan still cover a quarter of the table in long stretches; text never does
  const rowLines = ruleLines((y, x) => nearRow(x, y), h, 0, w, 0.25, 30).map((y) => y + top);
  const colLines = ruleLines((x, y) => nearCol(x, y), w, 0, h, 0.15, 40).map((x) => x + left);
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
  // A heading OCR couldn't read is found by its place: Item Code just left of Description, UOM just right of it,
  // Qty just left of Unit Price
  const neighbour = (col: { x0: number; x1: number } | undefined, step: -1 | 1) => {
    if (!col) return undefined;
    const i = colLines.indexOf(step < 0 ? col.x0 : col.x1);
    const j = i + step;
    if (i < 0 || j < 0 || j >= colLines.length) return undefined;
    return step < 0 ? { x0: colLines[j], x1: col.x0 } : { x0: col.x1, x1: colLines[j] };
  };
  const cols = {
    code: columnOf(heads.code) ?? neighbour(columnOf(heads.desc), -1),
    desc: columnOf(heads.desc),
    uom: columnOf(heads.uom) ?? neighbour(columnOf(heads.desc), 1),
    sub: columnOf(heads.sub),
    cat: columnOf(heads.cat),
    qty: columnOf(heads.qty) ?? neighbour(columnOf(heads.price), -1),
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

  // One cell, read on its own. IFMIS prints text right under a row's top line, so the cell is taken with its lines
  // and the lines are then painted out (a pixel row or column that is mostly dark is a line, not text): a tight
  // crop would cut the tops off the digits, and a stray bit of line reads as a digit. Small print is enlarged.
  const cell = (col: { x0: number; x1: number }, band: { y0: number; y1: number }, enlarge = false) => {
    const sx = Math.max(0, col.x0 - 4);
    const sy = Math.max(0, band.y0 - 6);
    const cw = Math.max(1, Math.min(canvas.width, col.x1 + 4) - sx);
    const ch = Math.max(1, Math.min(canvas.height, band.y1 + 6) - sy);
    const clip = document.createElement('canvas');
    clip.width = cw;
    clip.height = ch;
    const c = clip.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);
    const px = c.getImageData(0, 0, cw, ch);
    const inked = (x: number, y: number) => px.data[(y * cw + x) * 4] < 160;
    const white = (x: number, y: number) => {
      const i = (y * cw + x) * 4;
      px.data[i] = px.data[i + 1] = px.data[i + 2] = 255;
    };
    // Near the cell's edges only a border can be, faint and broken on a scan: a quarter dark is enough there
    for (let y = 0; y < ch; y++) {
      let n = 0;
      for (let x = 0; x < cw; x++) if (inked(x, y)) n++;
      const edge = y < 10 || y >= ch - 10;
      if (n > cw * (edge ? 0.25 : 0.5)) for (let x = 0; x < cw; x++) white(x, y);
    }
    for (let x = 0; x < cw; x++) {
      let n = 0;
      for (let y = 0; y < ch; y++) if (inked(x, y)) n++;
      const edge = x < 15 || x >= cw - 15;
      if (n > ch * (edge ? 0.25 : 0.5)) for (let y = 0; y < ch; y++) white(x, y);
    }
    c.putImageData(px, 0, 0);
    const factor = enlarge || ch < 60 ? 2 : 1;
    const out = document.createElement('canvas');
    out.width = cw * factor + 20;
    out.height = ch * factor + 20;
    const o = out.getContext('2d')!;
    o.fillStyle = '#fff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(clip, 0, 0, cw, ch, 10, 10, cw * factor, ch * factor);
    return out;
  };
  const read = async (key: keyof typeof cols, mode: string, whitelist: string, enlarge = false) => {
    const col = cols[key];
    if (!col) return bands.map(() => '');
    await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist });
    const texts: string[] = [];
    for (const band of bands) {
      const { data } = await worker.recognize(cell(col, band, enlarge));
      // Line breaks kept: a cell's first line is its value, what wraps below is the rest of a long text
      texts.push(String(data.text ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
    }
    return texts;
  };
  const BLOCK = '6';
  // Read freely and cleaned afterwards: this engine's character whitelist returns nothing on many scanned cells.
  // Each cell's first line: IFMIS prints the code, unit and figures at the top, a long category wraps below
  const topLine = (t: string) => t.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  // A code only when read whole (9 digits, a dot, 4 digits): it decides fixed asset or consumable, so a partly
  // read code is worse than none, which the person types in
  const code = (await read('code', BLOCK, '')).map((t) => {
    const c = cellCode(topLine(t));
    return /^\d{9}\.\d{4}$/.test(c) ? c : '';
  });
  const desc = await read('desc', BLOCK, '');
  const uom = (await read('uom', BLOCK, '', true)).map((t) => scanUnit(topLine(t)));
  const sub = await read('sub', BLOCK, '');
  const cat = await read('cat', BLOCK, '');
  const qty = (await read('qty', BLOCK, '', true)).map((t) => cellNumber(topLine(t)));
  const price = (await read('price', BLOCK, '')).map((t) => cellNumber(topLine(t)));
  const total = (await read('total', BLOCK, '')).map((t) => cellNumber(topLine(t)));
  await worker.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' });
  bands.forEach((_, i) => {
    const fixed = restoreDecimals(qty[i], price[i], total[i]);
    price[i] = fixed.price;
    total[i] = fixed.total;
  });

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
      { x: at(cols.desc), text: cleanText(desc[i]) || '-' },
    ];
    if (uom[i]) cells.push({ x: at(cols.uom), text: uom[i] });
    if (sub[i]) cells.push({ x: at(cols.sub), text: sub[i].replace(/\n/g, ' ') });
    if (cat[i]) cells.push({ x: at(cols.cat), text: cat[i].replace(/\n/g, ' ') });
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
