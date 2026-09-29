import { describe, expect, it } from 'vitest';
import {
  gcToJdn,
  jdnToEc,
  ecToJdn,
  jdnToGc,
  formatGcToEc,
  formatEcToGc,
  getTodayGcAndEc,
  ETHIOPIAN_MONTH_NAMES_AM,
  ETHIOPIAN_MONTH_NAMES_EN,
} from './eth-date';

describe('backend eth-date engine', () => {
  describe('Julian Day Number conversions', () => {
    it('accurately converts Gregorian New Year boundary to Ethiopian calendar', () => {
      const jdn = gcToJdn(2023, 9, 12);
      const ec = jdnToEc(jdn);
      expect(ec.year).toBe(2016);
      expect(ec.month).toBe(1);
      expect(ec.day).toBe(1);
    });

    it('reverses Ethiopian date to Gregorian without drift', () => {
      const jdn = ecToJdn(2016, 1, 1);
      const gc = jdnToGc(jdn);
      expect(gc.year).toBe(2023);
      expect(gc.month).toBe(9);
      expect(gc.day).toBe(12);
    });
  });

  describe('formatGcToEc & formatEcToGc', () => {
    it('formats known boundary dates correctly', () => {
      expect(formatGcToEc('2023-09-12')).toBe('2016-01-01');
      expect(formatEcToGc('2016-01-01')).toBe('2023-09-12');
    });

    it('calculates 6-day Pagume for Ethiopian leap year (2015 EC)', () => {
      expect(formatGcToEc('2023-09-11')).toBe('2015-13-06');
    });

    it('calculates 5-day Pagume for Ethiopian common year (2016 EC)', () => {
      expect(formatGcToEc('2024-09-10')).toBe('2016-13-05');
    });

    it('defensively handles malformed or empty date strings', () => {
      expect(formatGcToEc('')).toBe('');
      expect(formatGcToEc('invalid')).toBe('invalid');
      expect(formatEcToGc('')).toBe('');
      expect(formatEcToGc('invalid')).toBe('invalid');
    });
  });

  describe('getTodayGcAndEc', () => {
    it('returns valid GC and EC localized today timestamps', () => {
      const today = getTodayGcAndEc();
      expect(today.gc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today.ec).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today.ecFormattedAm).toContain('ዓ.ም.');
      expect(today.ecFormattedEn).toContain('E.C.');
    });
  });

  describe('Statutory Ethiopian Month Arrays', () => {
    it('contains all 13 Ethiopian months in correct order', () => {
      expect(ETHIOPIAN_MONTH_NAMES_AM).toHaveLength(13);
      expect(ETHIOPIAN_MONTH_NAMES_EN).toHaveLength(13);
      expect(ETHIOPIAN_MONTH_NAMES_AM[0]).toBe('መስከረም');
      expect(ETHIOPIAN_MONTH_NAMES_AM[12]).toBe('ጳጉሜ');
      expect(ETHIOPIAN_MONTH_NAMES_EN[0]).toBe('Meskerem');
      expect(ETHIOPIAN_MONTH_NAMES_EN[12]).toBe('Pagume');
    });
  });
});
