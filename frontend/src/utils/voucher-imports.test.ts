import { describe, expect, it } from 'vitest';
import { Department, ItemWithRelations } from '../types/asset-management';
import { ImportContext, sheetRowsFrom } from './sheet-import';
import { checkDisposalRows, checkIssueRows, checkTransferRows, DISPOSAL_FIELDS, ISSUE_FIELDS, TRANSFER_FIELDS } from './voucher-imports';

const employee = (id: string, payrollId: string, fullNameEn: string, departmentId = 'D1') =>
  ({ id, payrollId, fullNameEn, fullNameAm: '', departmentId, role: null, isActive: true }) as any;
const item = (code: string, status: string, extra: Partial<ItemWithRelations> = {}) =>
  ({ id: code, itemCode: code, name: `Item ${code}`, status, quantity: 1, uom: 'EA', unitCostETB: 500, storeLocationId: 'L1', itemType: 'FIXED', ...extra }) as any;

const holder = employee('E1', '00000001', 'Test Holder One');
const other = employee('E2', '00000002', 'Test Person Two', 'D2');

const ctx: ImportContext & { departments: Department[] } = {
  items: [
    item('MOA-1', 'AVAILABLE', { quantity: 5 }),
    item('MOA-2', 'ISSUED', { currentCustodianId: 'E1', currentCustodian: holder }),
    item('MOA-3', 'AVAILABLE', { itemType: 'CONSUMABLE' as any, quantity: 20 }),
    item('MOA-4', 'PENDING_STOCK_IN'),
    item('MOA-5', 'ISSUED', { heldByOrganization: 'Test Partner Org' }),
    item('MOA-6', 'AVAILABLE'),
    item('MOA-7', 'DISPOSED'),
  ],
  employees: [holder, other],
  departments: [
    { id: 'D1', code: 'ICT', nameEn: 'ICT Directorate', nameAm: '' },
    { id: 'D2', code: 'FIN', nameEn: 'Finance Directorate', nameAm: '' },
  ],
  locations: [{ id: 'L1', storeId: 'S1', storeName: 'Central Store', name: 'Main', isActive: true }],
  storeMen: () => [],
  pendingItemIds: new Set(['MOA-6']),
  today: '2026-10-13',
};

describe('Model 22 issue import', () => {
  const rows = (...r: string[][]) =>
    sheetRowsFrom([['Model 22 No.', 'Issued date', 'Item code', 'Quantity', 'Recipient (employee ID)', 'Directorate', 'Purpose'], ...r], ISSUE_FIELDS, 'itemCode').rows;

  it('issues only items in store, up to the quantity in store', () => {
    const checked = checkIssueRows(
      rows(
        ['22-1', '2026-10-01', 'moa-1', '2', '1', '', 'Field work'],
        ['22-2', '2026-10-01', 'MOA-2', '1', '00000002', '', 'Field work'],
        ['22-3', '2026-10-01', 'MOA-1', '1', '00000002', '', 'Field work'],
        ['22-4', '2026-10-01', 'MOA-3', '21', '00000002', '', 'Field work'],
        ['22-5', '2026-10-01', 'MOA-6', '1', '00000002', '', 'Field work'],
        ['22-6', '2026-10-01', 'MOA-3', '4', '00000002', 'FIN', 'Supplies'],
        ['22-7', '2026-10-01', 'MOA-99', '1', '00000002', '', 'Field work'],
      ),
      ctx,
    );
    expect(checked.map((c) => c.error)).toEqual([
      undefined,
      'MOA-2 is issued, not in store.',
      'MOA-1 is also on row 2; one request per item at a time.',
      'Quantity must be a whole number from 1 to 20 (EA in store).',
      'MOA-6 already has a request waiting for approval.',
      undefined,
      'No item with code MOA-99.',
    ]);
    // An employee ID typed as a number gets its leading zeros back; the directorate defaults to the recipient's
    expect(checked[0].payload).toMatchObject({ itemId: 'MOA-1', quantity: 2, recipientEmployeeId: 'E1', targetDepartmentId: 'D1', totalAmount: 1000, transactionType: 'Move Order Issue' });
    expect(checked[5].payload).toMatchObject({ itemId: 'MOA-3', targetDepartmentId: 'D2', recipientEmployeeId: 'E2' });
  });
});

describe('Model 21 transfer import', () => {
  const rows = (...r: string[][]) =>
    sheetRowsFrom([['Model 21 No.', 'Transfer date', 'Book', 'Item code', 'From (employee ID)', 'To (employee ID)'], ...r], TRANSFER_FIELDS, 'itemCode').rows;

  it('transfers fixed assets that are issued or in store, from the employee who holds them', () => {
    const checked = checkTransferRows(
      rows(
        ['21-1', '2026-10-01', '12', 'MOA-2', '00000001', '00000002'],
        ['21-2', '2026-10-01', '12', 'MOA-1', '', 'Test Holder One'],
        ['21-3', '2026-10-01', '12', 'MOA-3', '', '00000002'],
        ['21-4', '2026-10-01', '12', 'MOA-4', '', '00000002'],
        ['21-5', '2026-10-01', '12', 'MOA-5', '', '00000002'],
        ['21-6', '2026-10-01', '12', 'MOA-7', '', '00000002'],
      ),
      ctx,
    );
    expect(checked.map((c) => c.error)).toEqual([
      undefined,
      undefined,
      'MOA-3 is a consumable item; consumables are issued, not transferred.',
      'MOA-4 is waiting for receipt approval, not issued or in store.',
      'MOA-5 is held by Test Partner Org, outside the Ministry.',
      'MOA-7 is disposed, not issued or in store.',
    ]);
    expect(checked[0].payload).toMatchObject({ itemId: 'MOA-2', toEmployeeId: 'E2', toDepartmentId: 'D2', model21No: '21-1', book: '12' });
  });

  it('refuses a From that is not the current holder, and a transfer to the holder', () => {
    const checked = checkTransferRows(
      rows(['21-1', '2026-10-01', '12', 'MOA-2', '00000002', '00000002'], ['21-2', '2026-10-01', '12', 'MOA-1', '00000001', '00000002']),
      ctx,
    );
    expect(checked[0].error).toBe('MOA-2 is held by Test Holder One, not "00000002".');
    expect(checked[1].error).toContain('MOA-1 is in store');
    const toHolder = checkTransferRows(rows(['21-3', '2026-10-01', '12', 'MOA-2', '', '00000001']), ctx);
    expect(toHolder[0].error).toBe('MOA-2 is already with Test Holder One.');
  });
});

describe('Disposal import', () => {
  const rows = (...r: string[][]) =>
    sheetRowsFrom([['Disposal reference no.', 'Disposal date', 'Item code', 'Quantity', 'Reason', 'Condition'], ...r], DISPOSAL_FIELDS, 'itemCode').rows;

  it('disposes of items in store only; an empty quantity takes everything in store', () => {
    const checked = checkDisposalRows(
      rows(
        ['DSP-1', '2026-10-01', 'MOA-1', '', 'Damaged', 'Damaged'],
        ['DSP-2', '2026-10-01', 'MOA-2', '1', 'Damaged', ''],
        ['DSP-3', '2026-10-01', 'MOA-3', '3', 'Expired', 'Broken'],
        ['DSP-4', '2026-11-01', 'MOA-3', '3', 'Expired', ''],
      ),
      ctx,
    );
    expect(checked.map((c) => c.error)).toEqual([
      undefined,
      'MOA-2 is issued, not in store.',
      'Condition "Broken" must be New, Good, Fair, Needs repair or Damaged.',
      'Disposal date is in the future.',
    ]);
    expect(checked[0].payload).toMatchObject({ itemId: 'MOA-1', quantity: 5, disposalNo: 'DSP-1', condition: 'DAMAGED' });
  });
});
