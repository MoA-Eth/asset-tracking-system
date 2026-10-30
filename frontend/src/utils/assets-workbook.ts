/**
 * The Assets page export as an Excel workbook: the listed rows on an "Assets" sheet, each issued piece on an "Issued"
 * sheet, and on a "Summary" sheet the dashboard's figures worked out by Excel formulas from them, so anyone can see
 * where each number comes from:
 *
 * - Fixed assets, one by one (units): Total, Assigned (issued) and Available (in store) add up.
 * - Consumables, by the different supplies (items): one with any stock in store is Available, one all issued is
 *   Assigned, so they add up too. A supply is told apart by its IFMIS item code (a stray space ignored), or, without
 *   one, by its name and unit: the same rule the dashboard uses.
 * - Total valuation: what everything on the register cost, VAT included.
 * - Fixed assets by category, what has stayed in store over 30 days, and what each directorate holds.
 *
 * Only rows on the register count (approved and still held), as on the dashboard. With every filter cleared the
 * Summary shows the dashboard's figures; with filters, the same figures for what was listed.
 */

/** The columns the formulas read, by their header on the Assets sheet */
const COLUMNS = {
  category: 'Category',
  type: 'Item Type',
  total: 'Total Quantity',
  inStore: 'In Store Quantity',
  issued: 'Issued Quantity',
  value: 'Total Value (ETB)',
  code: 'IFMIS Item Code',
  onRegister: 'On Register',
  days: 'Days In Store',
  name: 'Asset Name',
  uom: 'UoM',
} as const;

/** Each issued piece (a batch can be issued to several directorates): what the directorate figures read */
export const ISSUED_HEADERS = ['Asset Code', 'Asset Name', 'Item Type', 'Directorate', 'Units', 'UoM', 'IFMIS Item Code'];

/** Items in store longer than this should have been distributed (as on the dashboard) */
const STALE_DAYS = 30;

/** The supply a row is: its IFMIS item code without spaces, or its name and unit */
export const itemKey = (code: unknown, name: unknown, uom: unknown): string => {
  const c = String(code ?? '').replace(/\s+/g, '').toLowerCase();
  return c ? `code:${c}` : `name:${String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}|${String(uom || 'EA').toUpperCase()}`;
};

const letter = (index: number): string => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export async function buildAssetsWorkbook(
  headers: string[],
  rows: (string | number)[][],
  filters: string,
  issued: (string | number)[][] = [],
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const font = { name: 'Arial', size: 10 };
  const headFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0A3F24' } };

  const summary = wb.addWorksheet('Summary');
  const data = wb.addWorksheet('Assets', { views: [{ state: 'frozen', ySplit: 1 }] });
  const issuedSheet = wb.addWorksheet('Issued', { views: [{ state: 'frozen', ySplit: 1 }] });

  // ── Assets: the rows, and four working columns the Summary's formulas read ──
  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Export column missing: ${name}`);
    return letter(i);
  };
  const K = letter(headers.length); // the supply's key
  const S = letter(headers.length + 1); // 1 on the first row of each supply on the register
  const A = letter(headers.length + 2); // 1 when that supply has any stock in store (available)
  const O = letter(headers.length + 3); // 1 on the first row of each supply with stock in store over 30 days
  const last = Math.max(rows.length + 1, 2);
  const range = (c: string) => `Assets!$${c}$2:$${c}$${last}`;
  const local = (c: string) => `$${c}$2:$${c}$${last}`;

  const head = data.addRow([...headers, 'Item Key', 'Consumable Counted Once', 'Consumable With Stock In Store', 'Consumable Over 30 Days Counted Once']);
  head.eachCell((c) => { c.font = headFont; c.fill = headFill; });
  const T = col(COLUMNS.type), Q = col(COLUMNS.onRegister), I = col(COLUMNS.inStore), D = col(COLUMNS.days);
  const consumableOnRegister = (n: number) => `${T}${n}="Consumable",${Q}${n}="Yes"`;
  rows.forEach((r, i) => {
    const n = i + 2;
    const key = itemKey(r[headers.indexOf(COLUMNS.code)], r[headers.indexOf(COLUMNS.name)], r[headers.indexOf(COLUMNS.uom)]);
    const row = data.addRow([...r, key]);
    row.font = font;
    row.getCell(headers.length + 2).value = {
      formula: `IF(AND(${consumableOnRegister(n)},COUNTIFS($${K}$2:${K}${n},${K}${n},$${T}$2:${T}${n},"Consumable",$${Q}$2:${Q}${n},"Yes")=1),1,0)`,
    };
    row.getCell(headers.length + 3).value = {
      formula: `IF(${S}${n}=1,IF(SUMIFS(${local(I)},${local(K)},${K}${n},${local(T)},"Consumable",${local(Q)},"Yes")>0,1,0),0)`,
    };
    row.getCell(headers.length + 4).value = {
      formula: `IF(AND(${consumableOnRegister(n)},${I}${n}>0,N(${D}${n})>${STALE_DAYS},COUNTIFS($${K}$2:${K}${n},${K}${n},$${T}$2:${T}${n},"Consumable",$${Q}$2:${Q}${n},"Yes",$${I}$2:${I}${n},">0",$${D}$2:${D}${n},">${STALE_DAYS}")=1),1,0)`,
    };
  });
  data.columns.forEach((c, i) => { c.width = i === 0 ? 6 : i === 2 ? 34 : 18; });
  data.autoFilter = { from: 'A1', to: `${O}1` };

  // ── Issued: one row per issued piece, with its directorate, and a working column counting each supply once ──
  const iHead = issuedSheet.addRow([...ISSUED_HEADERS, 'Item Key', 'Consumable Counted Once In Directorate']);
  iHead.eachCell((c) => { c.font = headFont; c.fill = headFill; });
  const iLast = Math.max(issued.length + 1, 2);
  const iRange = (c: string) => `Issued!$${c}$2:$${c}$${iLast}`;
  // Issued columns: A code, B name, C type, D directorate, E units, F UoM, G IFMIS code, H key, I counted once
  issued.forEach((r, i) => {
    const n = i + 2;
    const row = issuedSheet.addRow([...r, itemKey(r[6], r[1], r[5])]);
    row.font = font;
    row.getCell(9).value = {
      formula: `IF(AND(C${n}="Consumable",D${n}<>"",COUNTIFS($H$2:H${n},H${n},$D$2:D${n},D${n},$C$2:C${n},"Consumable")=1),1,0)`,
    };
  });
  issuedSheet.columns.forEach((c, i) => { c.width = i === 1 || i === 3 ? 34 : 16; });
  issuedSheet.autoFilter = { from: 'A1', to: 'I1' };

  // ── Summary: the dashboard's figures, as formulas over the Assets and Issued sheets ──
  summary.columns = [{ width: 40 }, { width: 18 }, { width: 18 }, { width: 18 }];
  summary.getCell('A1').value = 'Asset summary';
  summary.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0A3F24' } };
  summary.getCell('A2').value = `Exported ${new Date().toISOString().slice(0, 10)} · ${filters || 'All assets (no filters)'}`;
  summary.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: 'FF5F6B7A' } };

  let at = 4;
  const header = (cells: string[]) => {
    const r = summary.getRow(at++);
    r.values = cells;
    r.eachCell((c) => { c.font = headFont; c.fill = headFill; });
  };
  const line = (cells: (string | { formula: string })[], money = false) => {
    const r = summary.getRow(at++);
    r.values = cells;
    r.font = font;
    summary.getCell(`A${r.number}`).font = { ...font, bold: true };
    for (const c of ['B', 'C', 'D']) summary.getCell(`${c}${r.number}`).numFmt = money ? '#,##0.00' : '#,##0';
    return r.number;
  };
  const yes = `${range(Q)},"Yes"`;
  const fixed = `${range(T)},"Fixed asset"`;

  // The four cards
  header(['', 'Total', 'Assigned', 'Available']);
  line([
    'Fixed assets (units)',
    { formula: `SUMIFS(${range(col(COLUMNS.total))},${fixed},${yes})` },
    { formula: `SUMIFS(${range(col(COLUMNS.issued))},${fixed},${yes})` },
    { formula: `SUMIFS(${range(I)},${fixed},${yes})` },
  ]);
  const cons = at;
  line(['Consumables (items)', { formula: `SUM(${range(S)})` }, { formula: `B${cons}-D${cons}` }, { formula: `SUM(${range(A)})` }]);
  at++;
  line(['Total valuation (ETB, VAT included)', { formula: `SUMIFS(${range(col(COLUMNS.value))},${yes})` }], true);
  at++;

  // Fixed assets by category, as the categories chart (units)
  const categories = [
    ...new Set(
      rows
        .filter((r) => r[headers.indexOf(COLUMNS.type)] === 'Fixed asset' && r[headers.indexOf(COLUMNS.onRegister)] === 'Yes')
        .map((r) => String(r[headers.indexOf(COLUMNS.category)] || 'Uncategorised')),
    ),
  ].sort();
  header(['Fixed assets by category (units)', 'Total', 'Assigned', 'Available']);
  const C = col(COLUMNS.category);
  for (const cat of categories) {
    const inCat = `${range(C)},"${cat.replace(/"/g, '""')}"`;
    line([
      cat,
      { formula: `SUMIFS(${range(col(COLUMNS.total))},${inCat},${fixed},${yes})` },
      { formula: `SUMIFS(${range(col(COLUMNS.issued))},${inCat},${fixed},${yes})` },
      { formula: `SUMIFS(${range(I)},${inCat},${fixed},${yes})` },
    ]);
  }
  if (categories.length === 0) line(['No fixed assets listed']);
  at++;

  // In store over 30 days: should have been distributed by now
  header([`In store over ${STALE_DAYS} days`, 'Count']);
  line([`Fixed assets (units)`, { formula: `SUMIFS(${range(I)},${fixed},${yes},${range(D)},">${STALE_DAYS}")` }]);
  line([`Consumables (items)`, { formula: `SUM(${range(O)})` }]);
  at++;

  // By directorate: what each holds (issued to it), from the Issued sheet
  const directorates = [...new Set(issued.map((r) => String(r[3] || '')).filter(Boolean))].sort();
  header(['By directorate (issued to it)', 'Fixed assets (units)', 'Consumables (items)']);
  for (const dir of directorates) {
    const inDir = `${iRange('D')},"${dir.replace(/"/g, '""')}"`;
    line([dir, { formula: `SUMIFS(${iRange('E')},${inDir},${iRange('C')},"Fixed asset")` }, { formula: `SUMIFS(${iRange('I')},${inDir})` }]);
  }
  if (directorates.length === 0) line(['Nothing issued to a directorate in this list']);
  at++;

  const notes = [
    'How the figures are counted (as on the dashboard):',
    '• Only rows on the register count ("On Register" = Yes): approved and still held. Receipts waiting for approval, rejected receipts and disposed items are listed but not counted.',
    '• Fixed assets are counted one by one, in units. Assigned + Available = Total.',
    '• Consumables are counted as different supplies (items), by IFMIS item code, or name and unit when there is none: the same supply bought twice is one. A supply with any stock in store is Available; one all issued is Assigned. Their quantities are not added, as they mix pieces, litres and kilograms.',
    '• Total valuation is the Total Value column of the rows on the register, VAT included.',
    `• In store over ${STALE_DAYS} days uses the Days In Store column; directorates use the Issued sheet (each issued piece and who holds it).`,
    'With every filter cleared on the Assets page, these figures are the dashboard\'s.',
  ];
  notes.forEach((t, i) => {
    const r = at + i;
    const c = summary.getCell(`A${r}`);
    c.value = t;
    c.font = i === 0 ? { ...font, bold: true } : { ...font, color: { argb: 'FF5F6B7A' } };
    summary.mergeCells(`A${r}:D${r}`);
    c.alignment = { wrapText: true, vertical: 'top' };
    summary.getRow(r).height = i === 0 || i === notes.length - 1 ? 16 : 30;
  });

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function downloadAssetsWorkbook(
  fileName: string,
  headers: string[],
  rows: (string | number)[][],
  filters: string,
  issued: (string | number)[][] = [],
): Promise<void> {
  const buffer = await buildAssetsWorkbook(headers, rows, filters, issued);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
