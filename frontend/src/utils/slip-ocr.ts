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
      const canvas = prepare(pictures[i]);
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const lines: OcrLine[] =
        (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines as unknown as OcrLine[])) ??
        ((data as unknown as { lines?: OcrLine[] }).lines ?? []);
      // Pixels to points: the picture is a page lying down (842 wide) or standing (595)
      const scale = (canvas.width > canvas.height ? 842 : 595) / canvas.width;
      rows.push(...ocrLinesToRows(lines, scale, i * 100000));
    }
    return rows;
  } finally {
    await worker.terminate();
    pictures.forEach((p) => 'close' in p && typeof p.close === 'function' && p.close());
  }
}
