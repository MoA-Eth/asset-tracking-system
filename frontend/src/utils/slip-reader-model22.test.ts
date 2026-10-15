import { describe, expect, it } from 'vitest';
import { isModel19, isModel22, parseModel22, PdfRow, rowsToText } from './slip-reader';

/** A row as the reader returns it: distance from the top, then [x, text] pieces */
const row = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

// The real IFMIS Model 22 in test-fixtures/ifmis-model22-issue.pdf: two vouchers on page 1, the signatures on page 2
const REAL_MODEL22: PdfRow[] = [
  row(41, [266, 'The Federal Democratic Republic of Ethiopia']),
  row(53, [327, 'Ministry of Agriculture']),
  row(64, [297, 'Receipt For Articles Or Property Issued']),
  row(118, [500, 'Model 22 No. :'], [579, '0000001/A Inventory']),
  row(130, [506, 'Issued Date :'], [579, '07-Aug-2020']),
  row(141, [479, 'Transaction Type :'], [579, 'Miscellaneous issue']),
  row(153, [507, 'Destination :']),
  row(173, [467, 'Sequence #']),
  row(181, [359, 'Lot /'], [467, 'Printed Pad']),
  row(191, [356, 'Batch'], [660, 'Total Amount']),
  row(197, [229, 'Sub'], [394, 'Serial'], [534, 'Qty'], [574, 'Unit Price'], [732, 'Remark']),
  row(200, [362, 'No.'], [462, 'From'], [503, 'To']),
  row(205, [24, 'S/No.'], [57, 'Item'], [124, 'Item Description'], [197, 'UOM'], [220, 'Inventory'], [263, 'Item Category']),
  row(216, [29, '1'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Other materials and'], [534, '1'], [607, '168.75000'], [683, '168.75000'], [732, 'Model 22-660919']),
  row(226, [263, 'supplies']),
  row(235, [29, '2'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Other materials and'], [534, '1'], [607, '168.75000'], [683, '168.75000'], [732, 'model 22/660920']),
  row(245, [263, 'supplies']),
  row(254, [29, '3'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Other materials and'], [534, '1'], [607, '168.75000'], [683, '168.75000'], [732, 'model 22/660921']),
  row(264, [263, 'supplies']),
  row(273, [29, '4'], [51, '101102101.0027'], [119, 'Plastic Glove'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Office supplies &'], [534, '6'], [611, '34.90000'], [683, '209.40000'], [732, 'model 22/660921']),
  row(283, [263, 'Other related Item']),
  row(292, [29, '5'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Other materials and'], [534, '1'], [607, '168.75000'], [683, '168.75000'], [732, 'model 22/660922']),
  row(302, [263, 'supplies']),
  row(311, [29, '6'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms &'], [263, 'Other materials and'], [534, '1'], [607, '168.75000'], [683, '168.75000'], [732, 'model 22/660923']),
  row(321, [263, 'supplies']),
  row(342, [500, 'Model 22 No. :'], [579, '0000001/A Inventory']),
  row(354, [506, 'Issued Date :'], [579, '30-Nov-2021']),
  row(366, [479, 'Transaction Type :'], [579, 'Subinventory Transfer']),
  row(378, [507, 'Destination :']),
  row(430, [24, 'S/No.'], [57, 'Item'], [124, 'Item Description'], [197, 'UOM'], [220, 'Inventory'], [263, 'Item Category']),
  row(441, [29, '1'], [51, '101102101.0028'], [119, 'Powder Soap'], [201, 'EA'], [218, 'Stationery'], [263, 'Office supplies &'], [534, '131'], [611, '12.36000'], [676, '1,619.16000'], [732, '2122']),
  row(480, [623, 'Total:'], [672, '11,470.31000']),
  row(489, [565, 'Transportation Cost:']),
  row(499, [600, 'Grand Total']),
  row(588, [25, 'Report printed by lidlyats from "ifmisdb3" instance. on 05th October ,2026 @ 01:05 am'], [753, 'Page 1 of 2']),
  row(653, [266, 'The Federal Democratic Republic of Ethiopia']),
  row(804, [30, 'Issued By : Name'], [111, ':'], [124, '_____________________________________________'], [426, 'Received By : Name'], [513, ':']),
  row(821, [63, 'Signature'], [111, ':'], [124, '_____________________________________________'], [466, 'Signature'], [513, ':'], [530, '_____________________________________________']),
];

describe('a real IFMIS Model 22 (issue voucher)', () => {
  it('is a Model 22, not a Model 19', () => {
    const text = rowsToText(REAL_MODEL22);
    expect(isModel22(text)).toBe(true);
    expect(isModel19(text)).toBe(false);
  });

  it('reads the first voucher of the report, and says there are two', () => {
    const slip = parseModel22(REAL_MODEL22);
    expect(slip).toMatchObject({ model22No: '0000001/A Inventory', issuedDate: '2020-08-07', transactionType: 'Miscellaneous issue', vouchers: 2 });
    expect(slip.destination).toBeUndefined();
    expect(slip.transportationCost).toBeUndefined();
  });

  it('reads its six lines with code, wrapped category, quantity and prices, not the second voucher\'s', () => {
    const { lines } = parseModel22(REAL_MODEL22);
    expect(lines.map((l) => [l.itemCode, l.description, l.uom, l.subInventory, l.category, l.quantity, l.unitPrice, l.totalAmount])).toEqual([
      ['111101102.0010', 'Umberella', 'EA', 'Uniforms &', 'Other materials and supplies', 1, 168.75, 168.75],
      ['111101102.0010', 'Umberella', 'EA', 'Uniforms &', 'Other materials and supplies', 1, 168.75, 168.75],
      ['111101102.0010', 'Umberella', 'EA', 'Uniforms &', 'Other materials and supplies', 1, 168.75, 168.75],
      ['101102101.0027', 'Plastic Glove', 'EA', 'Uniforms &', 'Office supplies & Other related Item', 6, 34.9, 209.4],
      ['111101102.0010', 'Umberella', 'EA', 'Uniforms &', 'Other materials and supplies', 1, 168.75, 168.75],
      ['111101102.0010', 'Umberella', 'EA', 'Uniforms &', 'Other materials and supplies', 1, 168.75, 168.75],
    ]);
  });

  it('leaves blank signature lines out, and reads printed names', () => {
    expect(parseModel22(REAL_MODEL22)).toMatchObject({ issuedBy: undefined, receivedBy: undefined });
    const signed: PdfRow[] = [
      row(118, [500, 'Model 22 No. :'], [579, '0000002']),
      row(130, [489, 'Transportation Cost:'], [600, '350.00']),
      row(804, [30, 'Issued By : Name'], [111, ':'], [124, 'Mamo, Abebech Dejene'], [426, 'Received By : Name'], [513, ':'], [530, 'Kebede, Tolosa Ayana']),
    ];
    expect(parseModel22(signed)).toMatchObject({ issuedBy: 'Mamo, Abebech Dejene', receivedBy: 'Kebede, Tolosa Ayana', transportationCost: 350, vouchers: 1 });
  });
});
