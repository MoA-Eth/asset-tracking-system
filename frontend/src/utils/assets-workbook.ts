/**
 * The Assets page export as an Excel workbook: the listed rows on an "Assets" sheet, and on a "Summary" sheet the
 * dashboard's figures worked out by Excel formulas from those rows, so anyone can see where each number comes from:
 *
 * - Fixed assets, one by one (units): Total, Assigned (issued) and Available (in store) add up.
 * - Consumables, by the different supplies (items): one with any stock in store is Available, one all issued is
 *   Assigned, so they add up too. A supply is told apart by its IFMIS item code (a stray space ignored), or, without
 *   one, by its name and unit: the same rule the dashboard uses.
 * - Total valuation: what everything on the register cost, VAT included.
 *
 * Only rows on the register count (approved and still held), as on the dashboard. With every filter cleared the
 * Summary shows the dashboard's figures; with filters, the same figures for what was listed.
 */

/** The columns the formulas read, by their header on the Assets sheet */
const COLUMNS = {
  type: 'Item Type',
  total: 'Total Quantity',
  inStore: 'In Store Quantity',
  issued: 'Issued Quantity',
  value: 'Total Value (ETB)',
  code: 'IFMIS Item Code',
  onRegister: 'On Register',
  name: 'Asset Name',
  uom: 'UoM',
} as const;

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

export async function buildAssetsWorkbook(headers: string[], rows: (string | number)[][], filters: string): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const font = { name: 'Arial', size: 10 };
  const headFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0A3F24' } };

  const summary = wb.addWorksheet('Summary');
  const data = wb.addWorksheet('Assets', { views: [{ state: 'frozen', ySplit: 1 }] });

  // ── Assets: the rows, and three working columns the Summary's formulas read ──
  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Export column missing: ${name}`);
    return letter(i);
  };
  const keyCol = letter(headers.length);
  const onceCol = letter(headers.length + 1);
  const stockCol = letter(headers.length + 2);
  const last = rows.length + 1;
  const range = (c: string) => `Assets!$${c}$2:$${c}$${Math.max(last, 2)}`;
  const local = (c: string) => `$${c}$2:$${c}$${Math.max(last, 2)}`;

  const head = data.addRow([...headers, 'Item Key', 'Consumable Counted Once', 'Consumable With Stock In Store']);
  head.eachCell((c) => { c.font = headFont; c.fill = headFill; });
  const T = col(COLUMNS.type), Q = col(COLUMNS.onRegister), K = keyCol, S = onceCol, I = col(COLUMNS.inStore);
  rows.forEach((r, i) => {
    const n = i + 2;
    const key = itemKey(r[headers.indexOf(COLUMNS.code)], r[headers.indexOf(COLUMNS.name)], r[headers.indexOf(COLUMNS.uom)]);
    const row = data.addRow([...r, key]);
    row.font = font;
    // 1 on the first row of each supply on the register: counting them counts the different supplies
    row.getCell(headers.length + 2).value = {
      formula: `IF(AND(${T}${n}="Consumable",${Q}${n}="Yes",COUNTIFS($${K}$2:${K}${n},${K}${n},$${T}$2:${T}${n},"Consumable",$${Q}$2:${Q}${n},"Yes")=1),1,0)`,
    };
    // 1 when that supply has any stock in store across its rows: it is available, not all assigned
    row.getCell(headers.length + 3).value = {
      formula: `IF(${S}${n}=1,IF(SUMIFS(${local(I)},${local(K)},${K}${n},${local(T)},"Consumable",${local(Q)},"Yes")>0,1,0),0)`,
    };
  });
  data.columns.forEach((c, i) => { c.width = i === 0 ? 6 : i === 2 ? 34 : 18; });
  data.autoFilter = { from: 'A1', to: `${stockCol}1` };

  // ── Summary: the dashboard's figures, as formulas over the Assets sheet ──
  summary.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }];
  summary.getCell('A1').value = 'Asset summary';
  summary.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0A3F24' } };
  summary.getCell('A2').value = `Exported ${new Date().toISOString().slice(0, 10)} · ${filters || 'All assets (no filters)'}`;
  summary.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: 'FF5F6B7A' } };

  const h = summary.getRow(4);
  h.values = ['', 'Total', 'Assigned', 'Available'];
  h.eachCell((c) => { c.font = headFont; c.fill = headFill; });
  const yes = `${range(Q)},"Yes"`;
  summary.getRow(5).values = [
    'Fixed assets (units)',
    { formula: `SUMIFS(${range(col(COLUMNS.total))},${range(T)},"Fixed asset",${yes})` },
    { formula: `SUMIFS(${range(col(COLUMNS.issued))},${range(T)},"Fixed asset",${yes})` },
    { formula: `SUMIFS(${range(I)},${range(T)},"Fixed asset",${yes})` },
  ];
  summary.getRow(6).values = [
    'Consumables (items)',
    { formula: `SUM(${range(S)})` },
    { formula: 'B6-D6' },
    { formula: `SUM(${range(stockCol)})` },
  ];
  summary.getRow(8).values = ['Total valuation (ETB, VAT included)', { formula: `SUMIFS(${range(col(COLUMNS.value))},${yes})` }];
  summary.getCell('B8').numFmt = '#,##0.00';
  for (const r of [5, 6, 8]) {
    summary.getRow(r).font = font;
    summary.getCell(`A${r}`).font = { ...font, bold: true };
    for (const c of ['B', 'C', 'D']) if (r !== 8 && c !== 'B') summary.getCell(`${c}${r}`).numFmt = '#,##0';
    summary.getCell(`B${r}`).numFmt = r === 8 ? '#,##0.00' : '#,##0';
  }

  const notes = [
    'How the figures are counted (as on the dashboard):',
    '• Only rows on the register count ("On Register" = Yes): approved and still held. Receipts waiting for approval, rejected receipts and disposed items are listed but not counted.',
    '• Fixed assets are counted one by one, in units. Assigned + Available = Total.',
    '• Consumables are counted as different supplies (items), by IFMIS item code, or name and unit when there is none: the same supply bought twice is one. A supply with any stock in store is Available; one all issued is Assigned. Their quantities are not added, as they mix pieces, litres and kilograms.',
    '• Total valuation is the Total Value column of the rows on the register, VAT included.',
    'With every filter cleared on the Assets page, these figures are the dashboard\'s.',
  ];
  notes.forEach((t, i) => {
    const c = summary.getCell(`A${10 + i}`);
    c.value = t;
    c.font = i === 0 ? { ...font, bold: true } : { ...font, color: { argb: 'FF5F6B7A' } };
    summary.mergeCells(`A${10 + i}:D${10 + i}`);
    c.alignment = { wrapText: true, vertical: 'top' };
    summary.getRow(10 + i).height = i === 0 || i === notes.length - 1 ? 16 : 30;
  });

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function downloadAssetsWorkbook(fileName: string, headers: string[], rows: (string | number)[][], filters: string): Promise<void> {
  const buffer = await buildAssetsWorkbook(headers, rows, filters);
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
