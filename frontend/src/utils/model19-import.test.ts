import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildModel19Template, readModel19File, receiptOk, receiptsFromRows, stockInRequestFor, TEMPLATE_COLUMNS, toIsoDate } from './model19-import';
import { AssetCategory, ItemType } from '../types/asset-management';

const stores = [
  { id: 'LOC-1', label: 'Saris-Development · Saris' },
  { id: 'LOC-2', label: 'Kality-Medicinal · Kality' },
];
const today = new Date('2026-10-30T00:00:00Z');
type Row = Partial<Record<(typeof TEMPLATE_COLUMNS)[number], unknown>>;
const line = (over: Row = {}): Row => ({
  'Model 19 No.': '0000014',
  'PO No.': '193',
  'Received Date (G.C.)': '2026-03-26',
  'Transaction Type': 'PO Receipt',
  'Source / Supplier': 'Ethio Telecom',
  Buyer: 'Abduselam Ali',
  'Receiving Store': 'Saris-Development · Saris',
  'IFMIS Item Code': '305101101.0086',
  'Item Description': 'Lap Top Computer',
  UoM: 'EA',
  Category: 'IT Equipment & Accessories',
  Quantity: 32,
  'Unit Price (ETB)': 200000,
  'VAT 15%': 'Yes',
  ...over,
});
const read = (rows: Row[]) => receiptsFromRows(rows.map((r, i) => ({ row: i + 2, get: (c) => r[c] })), stores, today);

describe('reading Model 19 rows', () => {
  it('groups rows by Model 19 No. and PO into receipts, and works out each line', () => {
    const receipts = read([
      line(),
      line({ 'IFMIS Item Code': '107101102.4336', 'Item Description': 'Toner', Category: 'Office Supplies & Stationery', Quantity: 10, 'Unit Price (ETB)': 1500, 'VAT 15%': '' }),
      line({ 'Model 19 No.': '0000015', 'PO No.': '', 'Transaction Type': '', 'Item Description': 'Donated chairs', 'IFMIS Item Code': '', 'Item Type': 'Fixed asset', Category: 'Office Furniture & Fixtures', Quantity: 5, 'Unit Price (ETB)': 0, 'VAT 15%': 'No' }),
      // The template's example row and blank rows are not read
      line({ 'Model 19 No.': 'e.g. 0000001' }),
      {},
    ]);
    expect(receipts).toHaveLength(2);
    const [laptops, chairs] = receipts;
    expect(laptops).toMatchObject({ model19No: '0000014', poNumber: '193', receivedDate: '2026-03-26', storeLocationId: 'LOC-1' });
    expect(laptops.lines.map((l) => [l.name, l.itemType, l.total])).toEqual([
      ['Lap Top Computer', ItemType.FIXED, 7360000], // 32 × 200,000 + 15% VAT
      ['Toner', ItemType.CONSUMABLE, 15000],
    ]);
    // No PO: a donation, its transaction type said so when left blank
    expect(chairs).toMatchObject({ transactionType: 'Donation / Grant Receipt' });
    expect(receipts.every(receiptOk)).toBe(true);
  });

  it('points at every problem by row, and does not send a receipt that has one', () => {
    const bad = { 'Received Date (G.C.)': '0026-05-12', 'Receiving Store': 'Main warehouse' };
    const [receipt] = read([
      line(bad),
      line({ ...bad, Quantity: 'ten', Category: 'Gadgets', 'IFMIS Item Code': '', 'Item Type': '' }),
      line({ ...bad, 'Source / Supplier': 'Someone else' }),
    ]);
    expect(receipt.problems).toEqual([
      'Row 2: Received date 0026-05-12 is before 2000: check the year.',
      'Row 2: Receiving store "Main warehouse" is not a store in the system. Choose one from the list.',
      'Row 4: Source / supplier "Someone else" differs from the first line of Model 19 0000014 ("Ethio Telecom").',
    ]);
    expect(receipt.lines[1].problems).toEqual([
      'Quantity must be a number above 0.',
      'Category "Gadgets" is not one of the list.',
      'Item type is missing: write Fixed asset or Consumable, or give the IFMIS item code.',
    ]);
    expect(receiptOk(receipt)).toBe(false);
  });

  it('refuses a date in the future and reads the dates Excel gives', () => {
    expect(read([line({ 'Received Date (G.C.)': '2027-01-01' })])[0].problems[0]).toContain('in the future');
    expect(toIsoDate(new Date(Date.UTC(2026, 2, 26)))).toBe('2026-03-26');
    expect(toIsoDate(46107)).toBe('2026-03-26');
    expect(toIsoDate('26/03/2026')).toBe('2026-03-26');
  });

  it('builds the receive request the form sends: the Model 19 header, and every line in items', () => {
    const [receipt] = read([line(), line({ 'Item Description': 'Mouse', 'IFMIS Item Code': '107101102.0001', Category: 'IT Equipment & Accessories', Quantity: 2, 'Unit Price (ETB)': 500, 'VAT 15%': 'No' })]);
    const req = stockInRequestFor(receipt, 'EMP-1');
    expect(req).toMatchObject({
      ifmisSlipNumber: '0000014', ifmisSlipDateGc: '2026-03-26', storeLocationId: 'LOC-1', registeredById: 'EMP-1',
      provisionType: 'PURCHASE', poNumber: '193', buyer: 'Abduselam Ali', source: 'Ethio Telecom', transactionType: 'PO Receipt',
      name: 'Lap Top Computer', category: AssetCategory.IT_EQUIPMENT, isHistoricalData: false,
    });
    expect(req.items).toHaveLength(2);
    expect(req.items![1]).toMatchObject({ name: 'Mouse', itemType: ItemType.CONSUMABLE, quantity: 2, unitCostETB: 500, totalAmount: 1000, vatApplicable: false });
  });
});

describe('the template', () => {
  it('has the lines sheet with every column, an example that is not imported, and lists to choose from', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildModel19Template(stores));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Read me', 'Model 19 lines', 'Lists']);
    const sheet = wb.getWorksheet('Model 19 lines')!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...TEMPLATE_COLUMNS]);
    expect(String(sheet.getCell('A2').value)).toMatch(/^e\.g\./);
    expect(sheet.getCell('H3').dataValidation).toMatchObject({ type: 'list' });
    // The stores in the system are the list to choose from
    const lists = wb.getWorksheet('Lists')!;
    expect([lists.getCell('B2').value, lists.getCell('B3').value]).toEqual(stores.map((s) => s.label));
  });

  it('reads back as nothing to import until it is filled in', async () => {
    const buffer = await buildModel19Template(stores);
    const file = { arrayBuffer: async () => buffer } as unknown as File;
    expect(await readModel19File(file, stores)).toEqual([]);
  });
});
