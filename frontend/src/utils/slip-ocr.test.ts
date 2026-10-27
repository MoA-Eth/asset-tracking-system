import { describe, expect, it } from 'vitest';
import { cellCode, cellNumber, cleanText, flatShare, isImageFile, ocrLinesToRows, OcrLine, readability, restoreDecimals, ruleLines, scanUnit, skewAngle } from './slip-ocr';

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

describe('which way up a scan is', () => {
  const word = (text: string, w: number, h: number) => ({ text, bbox: { x0: 0, y0: 0, x1: w, y1: h } });

  it('counts the words lying flat: text read down a sideways page comes out tall and narrow', () => {
    expect(flatShare([word('Model', 80, 20), word('Receipt', 90, 20), word('No', 30, 20)])).toBe(1);
    expect(flatShare([word('Model', 20, 80), word('Receipt', 20, 90), word('Total', 70, 20)])).toBeCloseTo(1 / 3);
    expect(flatShare([word('|', 2, 40)])).toBe(0);
  });

  it('rates text with the words of a Model 19 above garbled text of the same confidence', () => {
    expect(readability('INV Model 19 No. Transaction Type PO Receipt Total Amount', 55)).toBeGreaterThan(readability('1d1a29y Od adA] uonoesues]', 55));
  });
});

describe('reading the item table of a scanned Model 19 cell by cell', () => {
  it('finds rule lines as long dark stretches, and not text, which is short stretches', () => {
    // A 100 x 40 picture: a faint, broken line at y 10 (long stretches), text-like specks at y 25 (short ones)
    const dark = (y: number, x: number) => (y === 10 && x % 40 < 35) || (y === 25 && x % 6 < 2);
    expect(ruleLines(dark, 40, 0, 100, 0.25, 30)).toEqual([10]);
  });

  it('tells how far a table is turned from where its dark pixels line up', () => {
    const t = Math.tan((1.2 * Math.PI) / 180);
    const points = [0, 40, 80].flatMap((y) => Array.from({ length: 300 }, (_, x) => ({ x, y: Math.round(y + x * t) })));
    expect(skewAngle(points)).toBeCloseTo(1.2, 1);
    expect(skewAngle([{ x: 1, y: 1 }])).toBe(0);
  });

  it('reads figures: a dropped decimal point, thousands commas, and specks beside the figure', () => {
    expect(cellNumber('285 01')).toBe('285.01');
    expect(cellNumber('1,159.99')).toBe('1159.99');
    expect(cellNumber('1 2999.89')).toBe('2999.89');
    expect(cellNumber('—')).toBe('');
  });

  it('reads IFMIS item codes whole, wherever the dot went', () => {
    expect(cellCode('101101101 0339')).toBe('101101101.0339');
    expect(cellCode('1011011010339')).toBe('101101101.0339');
    expect(cellCode('101101101.0057')).toBe('101101101.0057');
  });

  it('reads units with stray letters around them, RM for a ream included', () => {
    expect(scanUnit('CPKT')).toBe('PKT');
    expect(scanUnit('RM')).toBe('RM');
    expect(scanUnit('EA |')).toBe('EA');
    expect(scanUnit('HL')).toBe('');
  });

  it('puts back a decimal point only where quantity x price = total proves it', () => {
    expect(restoreDecimals('15', '1159.99', '1739991')).toEqual({ price: '1159.99', total: '17399.91' });
    expect(restoreDecimals('10', '38004', '3800.41')).toEqual({ price: '380.04', total: '3800.41' });
    // Already adding up, or not provable: left as read
    expect(restoreDecimals('2', '18', '36')).toEqual({ price: '18', total: '36' });
    expect(restoreDecimals('1', '38004', '3800.41')).toEqual({ price: '38004', total: '3800.41' });
  });

  it('cleans the marks a cell edge leaves on a description', () => {
    expect(cleanText('Stapler Wire Small [')).toBe('Stapler Wire Small');
    expect(cleanText('Puncher Small | | EA')).toBe('Puncher Small');
    expect(cleanText('Note Pad\nMedium')).toBe('Note Pad Medium');
  });
});
