import { describe, expect, it } from 'vitest';
import { periodRange } from './periods';

// 16 October 2026 G.C. is Tikimt 6, 2019 E.C.: in Q2 of EFY 2019 (Hamle 2018 – Sene 2019)
const TODAY = '2026-10-16';

describe('reporting periods on the Ethiopian fiscal calendar', () => {
  it('gives this and last E.C. month', () => {
    expect(periodRange('this-month', TODAY)).toEqual({ from: '2026-10-11', to: '2026-11-09', label: 'Tikimt 2019 E.C.' });
    expect(periodRange('last-month', TODAY)).toEqual({ from: '2026-09-11', to: '2026-10-10', label: 'Meskerem 2019 E.C.' });
  });

  it('gives the fiscal quarter: Q2 is Tikimt–Tahsas, Q1 is Hamle–Meskerem with Pagume', () => {
    expect(periodRange('this-quarter', TODAY)).toEqual({ from: '2026-10-11', to: '2027-01-08', label: 'Q2 EFY 2019' });
    expect(periodRange('last-quarter', TODAY)).toEqual({ from: '2026-07-08', to: '2026-10-10', label: 'Q1 EFY 2019' });
  });

  it('gives the fiscal year Hamle 1 – Sene 30, named by the year it ends in', () => {
    expect(periodRange('this-year', TODAY)).toEqual({ from: '2026-07-08', to: '2027-07-07', label: 'EFY 2019' });
    expect(periodRange('last-year', TODAY)).toEqual({ from: '2025-07-08', to: '2026-07-07', label: 'EFY 2018' });
  });

  it('crosses the fiscal year: in Hamle, last quarter is Q4 of the year before, and this year starts that day', () => {
    // 20 July 2026 is Hamle 13, 2018 E.C.: the first days of EFY 2019
    expect(periodRange('this-quarter', '2026-07-20').label).toBe('Q1 EFY 2019');
    expect(periodRange('last-quarter', '2026-07-20')).toEqual({ from: '2026-04-09', to: '2026-07-07', label: 'Q4 EFY 2018' });
    expect(periodRange('this-year', '2026-07-20').from).toBe('2026-07-08');
  });

  it('gives Pagume as a month of its own', () => {
    // 8 September 2026 is Pagume 3, 2018 E.C.
    expect(periodRange('this-month', '2026-09-08')).toEqual({ from: '2026-09-06', to: '2026-09-10', label: 'Pagume 2018 E.C.' });
  });
});
