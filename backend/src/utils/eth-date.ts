/**
 * Ethiopian Calendar Conversion Utilities
 * Converts between Gregorian Calendar (G.C.) and Ethiopian Calendar (E.C.)
 */

export function gcToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export function jdnToEc(jdn: number): { year: number; month: number; day: number } {
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

export function ecToJdn(year: number, month: number, day: number): number {
  return 1723856 + 365 + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

export function jdnToGc(jdn: number): { year: number; month: number; day: number } {
  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l2 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l3) / 2447);
  const day = l3 - Math.floor((2447 * j) / 80);
  const l4 = Math.floor(j / 11);
  const month = j + 2 - 12 * l4;
  const year = 100 * (n - 49) + i + l4;
  return { year, month, day };
}

export const ETHIOPIAN_MONTH_NAMES_AM = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
];

export const ETHIOPIAN_MONTH_NAMES_EN = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

export function formatGcToEc(gcDateStr: string): string {
  const [y, m, d] = gcDateStr.split('-').map(Number);
  const jdn = gcToJdn(y, m, d);
  const ec = jdnToEc(jdn);
  return `${ec.year}-${String(ec.month).padStart(2, '0')}-${String(ec.day).padStart(2, '0')}`;
}

export function formatEcToGc(ecDateStr: string): string {
  const [y, m, d] = ecDateStr.split('-').map(Number);
  const jdn = ecToJdn(y, m, d);
  const gc = jdnToGc(jdn);
  return `${gc.year}-${String(gc.month).padStart(2, '0')}-${String(gc.day).padStart(2, '0')}`;
}

export function getTodayGcAndEc(): { gc: string; ec: string; ecFormattedAm: string; ecFormattedEn: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const gc = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const ecStr = formatGcToEc(gc);
  const [ey, em, ed] = ecStr.split('-').map(Number);
  const mIdx = em - 1;
  return {
    gc,
    ec: ecStr,
    ecFormattedAm: `${ETHIOPIAN_MONTH_NAMES_AM[mIdx] || ''} ${ed}፣ ${ey} ዓ.ም.`,
    ecFormattedEn: `${ETHIOPIAN_MONTH_NAMES_EN[mIdx] || ''} ${ed}, ${ey} E.C.`
  };
}
