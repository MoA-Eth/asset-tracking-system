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
});
