import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('CSV export', () => {
  it('starts with a byte-order mark so Excel keeps Amharic text', () => {
    const csv = toCsv(['Name'], [['ሙሉጌታ ብርሃኑ']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"ሙሉጌታ ብርሃኑ"');
  });

  it('keeps commas, quotes and line breaks inside one cell', () => {
    expect(csvCell('Slip 12, Box "A"')).toBe('"Slip 12, Box ""A"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('writes numbers as numbers and blanks for missing values', () => {
    expect(csvCell(85000)).toBe('85000');
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('stops text from running as an Excel formula', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"');
    expect(csvCell('+251911000000')).toBe('"\'+251911000000"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('MOA-IT-2024-0001')).toBe('"MOA-IT-2024-0001"');
  });

  it('puts one row per line with Windows line endings', () => {
    expect(toCsv(['A', 'B'], [[1, 'x'], [2, 'y']])).toBe('﻿"A","B"\r\n1,"x"\r\n2,"y"');
  });
});
