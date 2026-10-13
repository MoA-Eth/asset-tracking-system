import { describe, expect, it } from 'vitest';
import { isImageFile, ocrLinesToRows, OcrLine } from './slip-ocr';

/** A line of OCR words: [text, left, right] in pixels, all 30 px tall at the given top */
const line = (top: number, ...words: [string, number, number][]): OcrLine => ({
  bbox: { x0: words[0][1], y0: top, x1: words[words.length - 1][2], y1: top + 30 },
  words: words.map(([text, x0, x1]) => ({ text, bbox: { x0, y0: top, x1, y1: top + 30 } })),
});

describe('OCR words as rows of cells', () => {
  it('joins words that sit together, starts a new cell at a wide gap, and drops table borders', () => {
    const rows = ocrLinesToRows(
      [
        line(400, ['INV', 2000, 2060], ['Model', 2075, 2160], ['19', 2175, 2205], ['No.', 2220, 2270], [':', 2280, 2290], ['0000044', 2420, 2560]),
        line(1000, ['|', 80, 84], ['1', 100, 115], ['|', 150, 154], ['107101102.4336', 200, 420], ['Sulfa', 600, 670], ['Drug', 685, 750], ['|', 900, 904]),
      ],
      0.5,
    );
    expect(rows).toEqual([
      { top: 200, cells: [{ x: 1000, text: 'INV Model 19 No. :' }, { x: 1210, text: '0000044' }] },
      { top: 500, cells: [{ x: 50, text: '1' }, { x: 100, text: '107101102.4336' }, { x: 300, text: 'Sulfa Drug' }] },
    ]);
  });

  it('puts the second page below the first', () => {
    const rows = ocrLinesToRows([line(10, ['Page', 10, 60])], 1, 100000);
    expect(rows[0].top).toBe(100010);
  });

  it('knows which files are pictures', () => {
    expect(isImageFile(new File([''], 'slip.JPG', { type: '' }))).toBe(true);
    expect(isImageFile(new File([''], 'x', { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new File([''], 'slip.pdf', { type: 'application/pdf' }))).toBe(false);
  });
});
