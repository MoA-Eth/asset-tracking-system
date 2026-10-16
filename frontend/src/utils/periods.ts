import { ETHIOPIAN_MONTH_NAMES_EN, ecToJdn, gcToJdn, jdnToEc, jdnToGc } from './eth-date';

/**
 * Reporting periods on the Ethiopian calendar, as the Ministry plans and reports:
 * - a month is an E.C. month (Pagume is the 13th, of 5 or 6 days);
 * - the fiscal year runs Hamle 1 – Sene 30 and is named by the E.C. year it ends in (EFY 2019: Hamle 2018 – Sene 2019);
 * - its quarters are Q1 Hamle–Meskerem (with Pagume), Q2 Tikimt–Tahsas, Q3 Tir–Megabit, Q4 Miyazya–Sene.
 * Each period is given back as G.C. dates (from and to, both included), which is what the server filters on.
 */
export type PeriodKey = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'this-year' | 'last-year';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'last-quarter', label: 'Last quarter' },
  { value: 'this-year', label: 'This fiscal year' },
  { value: 'last-year', label: 'Last fiscal year' },
];

export interface Period {
  from: string;
  to: string;
  /** e.g. "Tikimt 2019 E.C.", "Q2 EFY 2019", "EFY 2019" */
  label: string;
}

type Month = [year: number, month: number];

const iso = (jdn: number) => {
  const { year, month, day } = jdnToGc(jdn);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const nextMonth = ([y, m]: Month): Month => (m === 13 ? [y + 1, 1] : [y, m + 1]);
const prevMonth = ([y, m]: Month): Month => (m === 1 ? [y - 1, 13] : [y, m - 1]);
/** From the first day of the first month to the last day of the last one */
const span = (first: Month, last: Month, label: string): Period => ({
  from: iso(ecToJdn(first[0], first[1], 1)),
  to: iso(ecToJdn(...nextMonth(last), 1) - 1),
  label,
});
const monthName = ([y, m]: Month) => `${ETHIOPIAN_MONTH_NAMES_EN[m - 1]} ${y} E.C.`;

/** The months of a fiscal year in order, Hamle first; `startYear` is the E.C. year its Hamle falls in */
const fiscalMonths = (startYear: number): Month[] => [
  [startYear, 11], [startYear, 12], [startYear, 13],
  ...Array.from({ length: 10 }, (_, k): Month => [startYear + 1, k + 1]),
];
/** Where each quarter starts in the fiscal year's months: Q1 has four (Hamle, Nehase, Pagume, Meskerem) */
const QUARTER_STARTS = [0, 4, 7, 10];

const today = (todayGc: string): Month => {
  const [y, m, d] = todayGc.split('-').map(Number);
  const ec = jdnToEc(gcToJdn(y, m, d));
  return [ec.year, ec.month];
};
const fiscalStartOf = ([y, m]: Month) => (m >= 11 ? y : y - 1);

/** The dates a period covers, as of the given day (G.C. "YYYY-MM-DD") */
export function periodRange(key: PeriodKey, todayGc: string): Period {
  const now = today(todayGc);
  if (key === 'this-month') return span(now, now, monthName(now));
  if (key === 'last-month') {
    const m = prevMonth(now);
    return span(m, m, monthName(m));
  }
  const start = fiscalStartOf(now);
  if (key === 'this-year' || key === 'last-year') {
    const s = key === 'this-year' ? start : start - 1;
    const months = fiscalMonths(s);
    return span(months[0], months[12], `EFY ${s + 1}`);
  }
  // Quarters: this one, or the one before (which may be in last fiscal year)
  const months = fiscalMonths(start);
  const index = months.findIndex(([y, m]) => y === now[0] && m === now[1]);
  let q = QUARTER_STARTS.filter((i) => i <= index).length - 1;
  let fy = start;
  if (key === 'last-quarter') {
    q -= 1;
    if (q < 0) {
      q = 3;
      fy = start - 1;
    }
  }
  const fyMonths = fiscalMonths(fy);
  const first = QUARTER_STARTS[q];
  const last = (QUARTER_STARTS[q + 1] ?? 13) - 1;
  return span(fyMonths[first], fyMonths[last], `Q${q + 1} EFY ${fy + 1}`);
}
