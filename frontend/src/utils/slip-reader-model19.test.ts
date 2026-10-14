import { describe, expect, it } from 'vitest';
import { isModel19, parseModel19, PdfRow, rowsToText } from './slip-reader';

/** A row of an IFMIS Model 19 as the reader returns it: distance from the top, then [x, text] pieces */
const row = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

// Laid out like the "Print Model19 Report" photo: header on the right, a table whose descriptions and categories wrap
const MODEL19: PdfRow[] = [
  row(60, [585, 'The Federal Democratic Republic of Ethiopia']),
  row(85, [470, 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa']),
  row(98, [640, 'Print Model19 Report']),
  row(146, [680, 'INV Model 19 No. :'], [812, '0000044']),
  row(162, [714, 'PO Number :'], [812, '186']),
  row(178, [697, 'Received Date :'], [812, '25-Sep-2026']),
  row(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
  row(208, [742, 'Source :'], [812, 'TEST TRADING ONE MEMBER']),
  row(223, [812, 'P.L.C']),
  row(240, [748, 'Buyer :'], [812, 'Tesfaye, Abel Girma']),
  row(268, [710, 'Sequence #']),
  row(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [462, 'Sub'], [536, 'Item'], [594, 'Lot/'], [666, 'Serial'], [826, 'Qty'], [1094, 'Remark']),
  row(305, [906, 'Unit Price'], [998, 'Total Amount']),
  row(316, [88, '1'], [128, '107101102.4336'], [270, 'Sulfa Drug In Vial'], [403, 'EA'], [435, 'AMedicine'], [510, 'Medical'], [826, '100'], [960, '825'], [1050, '82500']),
  row(330, [510, 'Supplies &']),
  row(342, [510, 'Related']),
  row(354, [510, 'Accessories']),
  row(366, [88, '2'], [124, '105101102.0415'], [268, 'Streptomycine'], [403, 'EA'], [435, 'AMedicine'], [510, 'Agricultural'], [826, '50'], [960, '341'], [1050, '17050']),
  row(378, [510, 'Supplies']),
  row(487, [88, '5'], [118, '107101102.0471'], [262, 'Oxytetracycline'], [403, 'EA'], [430, 'AMedicine'], [505, 'Medical'], [826, '100'], [960, '550'], [1050, '55000']),
  row(499, [262, '20%-Bottel'], [505, 'Supplies &']),
  row(511, [505, 'Related']),
  row(523, [505, 'Accessories']),
  row(630, [910, 'Grand Total'], [1050, '154550']),
  row(742, [70, 'Delivered By : Name :']),
  row(800, [884, 'Page 1 of 2']),
];

describe('reading an IFMIS Model 19', () => {
  it('knows the form', () => {
    expect(isModel19(rowsToText(MODEL19))).toBe(true);
    expect(isModel19('Fixed Asset Internal Transfer Form')).toBe(false);
  });

  it('reads the header, joining a source name that wraps onto the next line', () => {
    expect(parseModel19(MODEL19)).toMatchObject({
      model19No: '0000044',
      poNumber: '186',
      receivedDate: '2026-09-25',
      transactionType: 'PO Receipt',
      source: 'TEST TRADING ONE MEMBER P.L.C',
      buyer: 'Tesfaye, Abel Girma',
      programName: 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa',
    });
  });

  it('reads each item, joining a description and a category that wrap over several lines', () => {
    const { lines } = parseModel19(MODEL19);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({
      itemCode: '107101102.4336', description: 'Sulfa Drug In Vial', uom: 'EA', subInventory: 'AMedicine',
      category: 'Medical Supplies & Related Accessories', quantity: 100, unitPrice: 825, totalAmount: 82500,
    });
    expect(lines[1]).toMatchObject({ itemCode: '105101102.0415', category: 'Agricultural Supplies', quantity: 50, unitPrice: 341 });
    expect(lines[2]).toMatchObject({ description: 'Oxytetracycline 20%-Bottel', category: 'Medical Supplies & Related Accessories', quantity: 100, totalAmount: 55000 });
  });

  it('joins the wrapped source line also when the label and its value come as one piece', () => {
    const rows = MODEL19.map((r) => (r.top === 208 ? row(208, [742, 'Source : TEST TRADING ONE MEMBER']) : r));
    expect(parseModel19(rows).source).toBe('TEST TRADING ONE MEMBER P.L.C');
  });

  it('stops an item at the grand total, so the total is not taken as part of it', () => {
    const last = parseModel19(MODEL19).lines[2];
    expect(last.totalAmount).toBe(55000);
  });

  it('reads the figures by column when a total and its remark come as one piece, as in a real IFMIS PDF', () => {
    // Laid out like a real petty-cash Model 19: empty PO, source and buyer; a watermark; total and remark printed together
    const real: PdfRow[] = [
      row(63, [482, 'Print Model19 Report']),
      row(101, [515, 'INV Model 19 No. :'], [613, '0000005']),
      row(113, [541, 'PO Number :']),
      row(125, [528, 'Received Date :'], [613, '05-Sep-2020']),
      row(137, [513, 'Transaction Type :'], [613, 'Petty Cash Purchase Receipt']),
      row(149, [562, 'Source :']),
      row(160, [568, 'Buyer :']),
      row(188, [407, 'Item'], [465, 'Lot/'], [505, 'Serial'], [541, 'of Printed'], [815, 'Remark']),
      row(197, [59, 'S/No.'], [91, 'Item Code'], [203, 'Item Description'], [302, 'UOM'], [349, 'Sub'], [399, 'Category'], [625, 'Qty']),
      row(209, [535, 'FROM'], [572, 'TO'], [683, 'Unit Price'], [748, 'Total Amount']),
      row(219, [55, '1'], [85, '108101101.0021'], [198, 'Fuel Visa Card'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [621, '12918'], [729, '1'], [783, '12918 968765']),
      row(227, [317, 'IFMIS'], [387, 'Lubricant']),
      row(239, [55, '2'], [85, '108101101.0010'], [198, 'Coupon For Fuel Of Birr'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [628, '50'], [716, '1000'], [783, '50000 968766']),
      row(248, [198, '1000'], [387, 'Lubricant']),
      row(278, [55, '3'], [85, '101101101.0052'], [198, 'Mobile Card 100 Birr'], [305, 'EA'], [328, 'Stationery'], [387, 'Office supplies'], [625, '336'], [720, '100'], [783, '33600 968768']),
      row(287, [387, '& Other']),
      row(296, [387, 'related Item']),
      row(307, [688, 'Grand Total'], [778, '121518']),
    ];
    const slip = parseModel19(real);
    expect(slip).toMatchObject({ model19No: '0000005', receivedDate: '2020-09-05', transactionType: 'Petty Cash Purchase Receipt' });
    expect(slip.poNumber).toBeUndefined();
    expect(slip.source).toBeUndefined();
    expect(slip.lines.map((l) => [l.description, l.category, l.quantity, l.unitPrice, l.totalAmount])).toEqual([
      ['Fuel Visa Card', 'Fuel and Lubricant', 12918, 1, 12918],
      ['Coupon For Fuel Of Birr 1000', 'Fuel and Lubricant', 50, 1000, 50000],
      ['Mobile Card 100 Birr', 'Office supplies & Other related Item', 336, 100, 33600],
    ]);
  });
});

describe('Model 19 program name', () => {
  it('is read only from above the report title, never from an item line', () => {
    const rows: PdfRow[] = [
      row(98, [640, 'Print Model19 Report']),
      row(146, [680, 'INV Model 19 No. :'], [812, '0000077']),
      row(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
      row(316, [88, '1'], [128, '103101101.0001'], [270, 'Programmable Logic Controller'], [403, 'EA'], [435, 'AStore'], [510, 'Electrical'], [826, '1'], [960, '5000'], [1050, '5000']),
    ];
    expect(parseModel19(rows).programName).toBeUndefined();
    expect(parseModel19(rows).lines[0].description).toBe('Programmable Logic Controller');
  });
});

// Rows read from a real IFMIS "Print Model19 Report" (petty cash fuel purchase, 05-Sep-2020), exactly as the reader returns them
const REAL_PETTY_CASH: PdfRow[] = [
  row(36, [440, 'The Federal Democratic Republic of Ethiopia']),
  row(54, [462, 'Ministry of Agriculture']),
  row(63, [482, 'Print Model19 Report']),
  row(101, [515, 'INV Model 19 No. :'], [613, '0000005']),
  row(113, [541, 'PO Number :']),
  row(125, [528, 'Received Date :'], [613, '05-Sep-2020']),
  row(137, [513, 'Transaction Type :'], [613, 'Petty Cash Purchase Receipt']),
  row(149, [562, 'Source :']),
  row(160, [568, 'Buyer :']),
  row(180, [541, 'Sequence #']),
  row(188, [407, 'Item'], [465, 'Lot/'], [505, 'Serial'], [541, 'of Printed'], [815, 'Remark']),
  row(197, [59, 'S/No.'], [91, 'Item Code'], [203, 'Item Description'], [302, 'UOM'], [349, 'Sub'], [399, 'Category'], [451, 'Batch No.'], [511, 'No.'], [541, 'Pad'], [625, 'Qty']),
  row(205, [340, 'Inventory']),
  row(209, [535, 'FROM'], [572, 'TO'], [683, 'Unit Price'], [748, 'Total Amount']),
  row(219, [55, '1'], [85, '108101101.0021'], [198, 'Fuel Visa Card Nafeta'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [621, '12918'], [729, '1'], [783, '12918 968765']),
  row(227, [317, 'IFMIS'], [387, 'Lubricant']),
  row(239, [55, '2'], [85, '108101101.0010'], [198, 'Coupon For Fuel Of Birr'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [628, '50'], [716, '1000'], [783, '50000 968766']),
  row(248, [198, '1000'], [387, 'Lubricant']),
  row(258, [55, '3'], [85, '108101101.0010'], [198, 'Coupon For Fuel Of Birr'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [628, '25'], [716, '1000'], [783, '25000 968767']),
  row(267, [198, '1000'], [387, 'Lubricant']),
  row(278, [55, '4'], [85, '101101101.0052'], [198, 'Mobile Card 100 Birr'], [305, 'EA'], [328, 'Stationery'], [387, 'Office supplies'], [625, '336'], [720, '100'], [783, '33600 968768']),
  row(287, [387, '& Other']),
  row(296, [387, 'related Item']),
  row(307, [688, 'Grand Total'], [778, '121518']),
  row(410, [58, 'Delivered By : Name : ________________________________'], [454, 'Received By : Name : ____________________________']),
  row(582, [21, 'Report Taken By: lidlyats on 05-Oct-2026 @ 04:01 pm. from "ifmisdb1" instance.'], [669, 'Page 1 of 1']),
];

describe('a real IFMIS Model 19 (petty cash purchase)', () => {
  it('reads the header, leaving out what the slip leaves blank', () => {
    const slip = parseModel19(REAL_PETTY_CASH);
    expect(slip).toMatchObject({ model19No: '0000005', receivedDate: '2020-09-05', transactionType: 'Petty Cash Purchase Receipt' });
    expect(slip.poNumber).toBeUndefined();
    expect(slip.source).toBeUndefined();
    expect(slip.buyer).toBeUndefined();
    expect(slip.programName).toBeUndefined();
  });

  it('reads all four lines, with wrapped descriptions and categories, and the total apart from the remark', () => {
    const { lines } = parseModel19(REAL_PETTY_CASH);
    expect(lines.map((l) => [l.itemCode, l.description, l.category, l.quantity, l.unitPrice, l.totalAmount])).toEqual([
      ['108101101.0021', 'Fuel Visa Card Nafeta', 'Fuel and Lubricant', 12918, 1, 12918],
      ['108101101.0010', 'Coupon For Fuel Of Birr 1000', 'Fuel and Lubricant', 50, 1000, 50000],
      ['108101101.0010', 'Coupon For Fuel Of Birr 1000', 'Fuel and Lubricant', 25, 1000, 25000],
      ['101101101.0052', 'Mobile Card 100 Birr', 'Office supplies & Other related Item', 336, 100, 33600],
    ]);
  });
});

describe('Model 19 signature lines', () => {
  it('leaves blank (underscore) signature lines out', () => {
    const slip = parseModel19(REAL_PETTY_CASH);
    expect(slip.deliveredBy).toBeUndefined();
    expect(slip.receivedBy).toBeUndefined();
  });

  it('reads the names when IFMIS printed them, in the same piece or the next', () => {
    const rows: PdfRow[] = [
      row(63, [482, 'Print Model19 Report']),
      row(101, [515, 'INV Model 19 No. :'], [613, '0000006']),
      row(410, [58, 'Delivered By : Name : Kebede, Tolosa Ayana'], [454, 'Received By : Name :'], [560, 'Man, Abebe Store']),
    ];
    expect(parseModel19(rows)).toMatchObject({ deliveredBy: 'Kebede, Tolosa Ayana', receivedBy: 'Man, Abebe Store' });
  });
});
