import { describe, expect, it } from 'vitest';
import {
  gcToJdn,
  jdnToEc,
  ecToJdn,
  jdnToGc,
  formatGcToEc,
  formatEcToGc,
  getTodayGcAndEc,
  formatETB,
  ETHIOPIAN_MONTH_NAMES_AM,
  ETHIOPIAN_MONTH_NAMES_EN,
} from './eth-date';

describe('eth-date engine', () => {
  describe('Julian Day Number conversions', () => {
    it('converts known Gregorian date to JDN correctly', () => {
      // 2023-09-12 GC is Meskerem 1, 2016 EC (JDN 2460199)
      const jdn = gcToJdn(2023, 9, 12);
      expect(jdn).toBe(2460200);
      const ec = jdnToEc(jdn);
      expect(ec.year).toBe(2016);
      expect(ec.month).toBe(1);
      expect(ec.day).toBe(1);
    });

    it('converts known Ethiopian date back to JDN and Gregorian', () => {
      const jdn = ecToJdn(2016, 1, 1);
      const gc = jdnToGc(jdn);
      expect(gc.year).toBe(2023);
      expect(gc.month).toBe(9);
      expect(gc.day).toBe(12);
    });
  });

  describe('formatGcToEc', () => {
    it('converts Gregorian New Year boundary date to Ethiopian Meskerem 1', () => {
      const ecDate = formatGcToEc('2023-09-12');
      expect(ecDate).toBe('2016-01-01');
    });

    it('correctly calculates Pagume (month 13) for Ethiopian leap year', () => {
      // 2015 EC was a leap year where Pagume has 6 days
      // 2023-09-11 is Pagume 6, 2015 EC
      const pagume6 = formatGcToEc('2023-09-11');
      expect(pagume6).toBe('2015-13-06');
    });

    it('correctly calculates Pagume (month 13) for common year', () => {
      // 2024-09-10 is Pagume 5, 2016 EC (common year Pagume ends at 5)
      const pagume5 = formatGcToEc('2024-09-10');
      expect(pagume5).toBe('2016-13-05');
    });

    it('handles mid-year dates accurately', () => {
      // 2024-01-01 GC -> 2016-04-22 EC (Tahsas 22, 2016)
      const ec = formatGcToEc('2024-01-01');
      expect(ec).toBe('2016-04-22');
    });

    it('gracefully returns original string when given malformed input', () => {
      expect(formatGcToEc('')).toBe('');
      expect(formatGcToEc('invalid-date')).toBe('invalid-date');
    });
  });

  describe('formatEcToGc', () => {
    it('converts Ethiopian Meskerem 1 back to Gregorian September 12', () => {
      const gc = formatEcToGc('2016-01-01');
      expect(gc).toBe('2023-09-12');
    });

    it('performs round-trip conversion without drift', () => {
      const originalEc = '2016-01-01';
      const gc = formatEcToGc(originalEc);
      const roundTripEc = formatGcToEc(gc);
      expect(roundTripEc).toBe(originalEc);
    });

    it('gracefully returns original string on malformed input', () => {
      expect(formatEcToGc('')).toBe('');
      expect(formatEcToGc('bad-format')).toBe('bad-format');
    });
  });

  describe('getTodayGcAndEc', () => {
    it('returns today in GC and EC with formatted localized strings', () => {
      const today = getTodayGcAndEc();
      expect(today.gc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today.ec).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Check Amharic and English month names are included
      expect(today.ecFormattedAm).toContain('ዓ.ም.');
      expect(today.ecFormattedEn).toContain('E.C.');

      const [, emStr] = today.ec.split('-');
      const mIdx = Number(emStr) - 1;
      expect(today.ecFormattedAm).toContain(ETHIOPIAN_MONTH_NAMES_AM[mIdx]);
      expect(today.ecFormattedEn).toContain(ETHIOPIAN_MONTH_NAMES_EN[mIdx]);
    });
  });

  describe('Ethiopian month arrays', () => {
    it('contains exactly 13 Ethiopian months in order', () => {
      expect(ETHIOPIAN_MONTH_NAMES_AM).toHaveLength(13);
      expect(ETHIOPIAN_MONTH_NAMES_EN).toHaveLength(13);

      expect(ETHIOPIAN_MONTH_NAMES_AM[0]).toBe('መስከረም');
      expect(ETHIOPIAN_MONTH_NAMES_AM[12]).toBe('ጳጉሜ');

      expect(ETHIOPIAN_MONTH_NAMES_EN[0]).toBe('Meskerem');
      expect(ETHIOPIAN_MONTH_NAMES_EN[12]).toBe('Pagume');
    });
  });

  describe('formatETB', () => {
    it('formats numbers into Ethiopian Birr with ETB code or symbol', () => {
      const formatted = formatETB(15000);
      expect(formatted).toMatch(/15,000|ETB/);
    });

    it('formats 0 without error', () => {
      const formatted = formatETB(0);
      expect(formatted).toMatch(/0|ETB/);
    });

    it('formats large asset values with thousand separators', () => {
      const formatted = formatETB(2500000);
      expect(formatted).toMatch(/2,500,000/);
    });
  });
});
