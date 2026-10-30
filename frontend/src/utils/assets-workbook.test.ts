import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildAssetsWorkbook, itemKey } from './assets-workbook';

const headers = [
  '#', 'Asset Code', 'Asset Name', 'Category', 'Item Type', 'Status', 'UoM', 'Total Quantity', 'In Store Quantity', 'Issued Quantity',
  'Held By / Where', 'IFMIS Slip #', 'Slip Date (G.C.)', 'Unit Cost (ETB)', 'Total Value (ETB)', 'IFMIS Item Code', 'On Register', 'Days In Store',
];
const row = (code: string, name: string, type: string, total: number, inStore: number, issued: number, value: number, ifmis: string, onRegister: string) =>
  [1, code, name, 'IT Equipment', type, 'IN_STORE', 'EA', total, inStore, issued, '', '', '', 1, value, ifmis, onRegister, 40];

const read = async (buffer: ArrayBuffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
};

describe('itemKey', () => {
  it('tells supplies apart by IFMIS item code, a stray space ignored, or by name and unit', () => {
    expect(itemKey('102101103.0021', 'Toner', 'EA')).toBe(itemKey('102101103.00 21', 'Toner black', 'PCS'));
    expect(itemKey('', 'Hand  Soap', 'ea')).toBe(itemKey(undefined, 'hand soap', 'EA'));
    expect(itemKey('', 'Hand soap', 'EA')).not.toBe(itemKey('', 'Hand soap', 'BOX'));
  });
});

describe('the Excel export', () => {
  it('has the rows, and a Summary whose formulas read them as the dashboard counts', async () => {
    const wb = await read(await buildAssetsWorkbook(headers, [
      row('L1', 'Laptop', 'Fixed asset', 17, 17, 0, 3991304.35, '305101101.0086', 'Yes'),
      row('T1', 'Toner', 'Consumable', 5, 5, 0, 500, '102101103.0021', 'Yes'),
      row('R1', 'Scanner', 'Fixed asset', 2, 0, 0, 0, '', 'No'),
    ], 'Store: Saris'));

    const data = wb.getWorksheet('Assets')!;
    expect(data.getRow(1).values).toEqual(expect.arrayContaining(['IFMIS Item Code', 'On Register', 'Item Key', 'Consumable Counted Once']));
    expect(data.rowCount).toBe(4);
    // The working columns: the supply's key, and formulas flagging it once and whether any is in store
    expect(data.getCell('S3').value).toBe('code:102101103.0021');
    expect(String((data.getCell('T3').value as any).formula)).toContain('COUNTIFS(');
    expect(String((data.getCell('U3').value as any).formula)).toContain('SUMIFS(');
    expect(String((data.getCell('V3').value as any).formula)).toContain('">30"');

    const s = wb.getWorksheet('Summary')!;
    expect(s.getCell('A2').value).toContain('Store: Saris');
    expect(s.getRow(4).values).toEqual([undefined, '', 'Total', 'Assigned', 'Available']);
    const formula = (ref: string) => String((s.getCell(ref).value as any).formula);
    // Fixed assets in units, only rows on the register
    expect(formula('B5')).toBe('SUMIFS(Assets!$H$2:$H$4,Assets!$E$2:$E$4,"Fixed asset",Assets!$Q$2:$Q$4,"Yes")');
    expect(formula('C5')).toContain('Assets!$J$2:$J$4');
    expect(formula('D5')).toContain('Assets!$I$2:$I$4');
    // Consumables as items: counted once each; Assigned is what is not available, so they add up
    expect(formula('B6')).toBe('SUM(Assets!$T$2:$T$4)');
    expect(formula('C6')).toBe('B6-D6');
    expect(formula('D6')).toBe('SUM(Assets!$U$2:$U$4)');
    // The lower tables: by category, over 30 days, by directorate
    const labels = s.getColumn(1).values.filter(Boolean).map(String);
    expect(labels).toEqual(expect.arrayContaining(['Fixed assets by category (units)', 'IT Equipment', 'In store over 30 days', 'By directorate (issued to it)']));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Assets', 'Issued']);
    expect(formula('B8')).toBe('SUMIFS(Assets!$O$2:$O$4,Assets!$Q$2:$Q$4,"Yes")');
  });

  it('says when nothing was filtered', async () => {
    const wb = await read(await buildAssetsWorkbook(headers, [row('L1', 'Laptop', 'Fixed asset', 1, 1, 0, 1, '', 'Yes')], ''));
    expect(wb.getWorksheet('Summary')!.getCell('A2').value).toContain('All assets (no filters)');
  });
});
