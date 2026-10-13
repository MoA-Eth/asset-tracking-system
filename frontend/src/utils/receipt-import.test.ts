import { describe, expect, it } from 'vitest';
import { AssetCategory, ItemCondition, ItemType } from '../types/asset-management';
import { checkReceiptRows, receiptRowsFromSheet, receiptTemplateRows, RECEIPT_FIELDS, ReceiptImportContext } from './receipt-import';

const ctx: ReceiptImportContext = {
  locations: [
    { id: 'L1', storeId: 'S1', storeName: 'Central Store', name: 'Main', isActive: true },
    { id: 'L2', storeId: 'S2', storeName: 'Field Store', name: 'Shed A', isActive: true },
    { id: 'L3', storeId: 'S2', storeName: 'Field Store', name: 'Shed B', isActive: true },
  ],
  storeMen: (storeId) =>
    storeId === 'S2'
      ? [
          { employeeId: 'E1', fullNameEn: 'Test Keeper One', fullNameAm: '', payrollId: '00000001', isActive: true },
          { employeeId: 'E2', fullNameEn: 'Test Keeper Two', fullNameAm: '', payrollId: '00000002', isActive: true },
        ]
      : [],
  existing: [{ slipNumber: '0000099', name: 'Office chair', itemCode: 'MOA-0001' }],
  today: '2026-10-13',
};

/** Rows below the headings; the fourth cell of each row (a location) is dropped, as Model 19 has no location column */
const sheet = (...rows: string[][]) =>
  receiptRowsFromSheet(
    [
      ['Model 19 No.', 'Received date', 'Store', 'Item description', 'Category', 'Item type', 'UOM', 'Qty', 'Unit price', 'Received by (store man)'],
      ...rows.map((row) => row.filter((_, i) => i !== 3)),
    ],
  ).rows;

describe('receipt import', () => {
  it('reads the template back with every column', () => {
    const read = receiptRowsFromSheet(receiptTemplateRows());
    expect(read.missing).toEqual([]);
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0].name).toBe('Laptop computer, 14 inch');
    expect(Object.keys(read.rows[0])).toHaveLength(RECEIPT_FIELDS.length + 1);
  });

  it('names the required columns a sheet lacks', () => {
    expect(receiptRowsFromSheet([['Item description', 'Qty'], ['Chair', '2']]).missing).toContain('slipNumber');
  });

  it('turns a good row into a historical receipt waiting for approval', () => {
    const [row] = checkReceiptRows(
      sheet(['0000044', '25/09/2026', 'Central Store', '', 'Laptop', 'IT Equipment & Accessories', 'Fixed asset', 'ea', '10', '65,000', '']),
      ctx,
    );
    expect(row.error).toBeUndefined();
    expect(row.payload).toMatchObject({
      ifmisSlipNumber: '0000044',
      ifmisSlipDateGc: '2026-09-25',
      storeLocationId: 'L1',
      isHistoricalData: true,
      category: AssetCategory.IT_EQUIPMENT,
      itemType: ItemType.FIXED,
      condition: ItemCondition.GOOD,
    });
    expect(row.payload?.items?.[0]).toMatchObject({ uom: 'EA', quantity: 10, unitCostETB: 65000, totalAmount: 650000 });
  });

  it('accepts IFMIS category names, Amharic item types and a store man by employee ID', () => {
    const [row] = checkReceiptRows(
      sheet(['0000045', '2026-09-26', 'Field Store', 'Shed B', 'Seed', 'Agricultural Supplies', 'አላቂ ዕቃ', 'KG', '50', '120', '00000002']),
      ctx,
    );
    expect(row.error).toBeUndefined();
    expect(row.payload).toMatchObject({ storeLocationId: 'L2', category: AssetCategory.AGRI_MACHINERY, itemType: ItemType.CONSUMABLE, receivedByEmployeeId: 'E2' });
  });

  it('skips rows the receive form would refuse, saying why', () => {
    const line = (slip: string, store: string, location: string, name: string, type = 'Fixed', qty = '1', date = '2026-09-25') => [
      slip, date, store, location, name, 'Office Furniture', type, 'EA', qty, '100', '',
    ];
    const rows = checkReceiptRows(
      sheet(
        line('', 'Central Store', '', 'Chair'),
        line('1', 'Central Store', '', 'Chair', 'Fixed', '1', 'next week'),
        line('2', 'Nowhere', '', 'Chair'),
        line('3', 'Field Store', '', 'Chair'),
        line('4', 'Field Store', 'Shed A', 'Chair'),
        line('5', 'Central Store', '', 'Chair', 'Service'),
        line('6', 'Central Store', '', 'Chair', 'Fixed', '1.5'),
        line('0000099', 'Central Store', '', 'Office chair'),
        line('7', 'Central Store', '', 'Desk'),
        line('7', 'Central Store', '', 'desk'),
      ),
      ctx,
    );
    expect(rows.map((r) => r.error)).toEqual([
      'Missing Model 19 No..',
      expect.stringContaining('is not a date'),
      expect.stringContaining('No store named "Nowhere"'),
      'Field Store has several store men; fill in Received by (store man).',
      'Field Store has several store men; fill in Received by (store man).',
      expect.stringContaining('must be Fixed asset or Consumable item'),
      'Quantity must be a whole number, at least 1.',
      'Already registered as MOA-0001 (same Model 19 No. and description).',
      undefined,
      'Same Model 19 No. and description as row 10.',
    ]);
  });
});
