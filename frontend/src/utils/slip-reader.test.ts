import { describe, expect, it } from 'vitest';
import { isModel21, parseModel21, sameEmployeeId, toIsoDate } from './slip-reader';

/** The text an IFMIS "Fixed Asset Internal Transfer Form" PDF gives, laid out as the reader returns it (names made up) */
const IFMIS_MODEL21 = [
  'The Federal Democratic Republic of Ethiopia',
  'Ministry of Agriculture',
  'Fixed Asset Internal Transfer Form',
  'Model/21',
  'Model # 0004399',
  'From Employee Name :  Kebede, Abebe Alemu  To : Tesfaye, Sara Bekele',
  'From Employee ID :  109870  To : 110347',
  'Book :  MOA MC BOOK',
  'Serial  Chassis  Depreciat  Rem',
  '#  Description  Tag Number  UOM  Unit  Orig. Cost  Book Value  Date  From  Location  To Location',
  'ark',
  'Number  Number  ion',
  'MoA SarisDefaultDefaultDefault  MoA Gurd ShollaDefaultDefaultDefault',
  '1  Handheld GPS  MOA-072351  1  624,285.55  322,547.54  301,738.01  05-OCT-26',
  'I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.',
  'Transferor Name and Signature  FAMU Accountant Name and Signature  Recipient\'s Name and Signature',
  'Kebede, Abebe Alemu  Tesfaye, Sara Bekele',
  'Report Taken By:  someone on 05-Oct-2026 @ 04:07 pm. on  05-OCT-2026 13:08  Page 1 of 1',
].join('\n');

describe('reading an IFMIS Model 21', () => {
  it('knows the form', () => {
    expect(isModel21(IFMIS_MODEL21)).toBe(true);
    expect(isModel21('Goods Receiving Report')).toBe(false);
  });

  it('reads the voucher number, both employees, their IDs and the book', () => {
    expect(parseModel21(IFMIS_MODEL21)).toMatchObject({
      model21No: '0004399',
      fromName: 'Kebede, Abebe Alemu',
      toName: 'Tesfaye, Sara Bekele',
      fromEmployeeId: '109870',
      toEmployeeId: '110347',
      book: 'MOA MC BOOK',
      fromLocation: 'MoA Saris',
      toLocation: 'MoA Gurd Sholla',
    });
  });

  it('reads each asset line: tag, unit, cost, depreciation, book value and date', () => {
    expect(parseModel21(IFMIS_MODEL21).lines).toEqual([
      { description: 'Handheld GPS', tagNumber: 'MOA-072351', unit: 1, origCost: 624285.55, depreciation: 322547.54, bookValue: 301738.01, date: '2026-10-05' },
    ]);
  });

  it('reads several lines, and none from text that has no table', () => {
    const two = IFMIS_MODEL21.replace(
      '1  Handheld GPS  MOA-072351  1  624,285.55  322,547.54  301,738.01  05-OCT-26',
      '1  Handheld GPS  MOA-072351  1  624,285.55  322,547.54  301,738.01  05-OCT-26\n2  Office desk  MOA-072352  2  12,000.00  0.00  12,000.00  05-OCT-26',
    );
    expect(parseModel21(two).lines.map((l) => [l.tagNumber, l.unit])).toEqual([['MOA-072351', 1], ['MOA-072352', 2]]);
    expect(parseModel21('nothing useful here').lines).toEqual([]);
  });
});

describe('dates and IDs as IFMIS prints them', () => {
  it.each([
    ['05-OCT-26', '2026-10-05'],
    ['05-OCT-2026', '2026-10-05'],
    ['05-Oct-2026 @ 04:07 pm', '2026-10-05'],
    ['05/10/2026', '2026-10-05'],
    ['2026-10-05', '2026-10-05'],
  ])('%s is %s', (raw, iso) => expect(toIsoDate(raw)).toBe(iso));

  it('rejects dates that do not exist', () => {
    expect(toIsoDate('31-FEB-26')).toBeUndefined();
    expect(toIsoDate('soon')).toBeUndefined();
  });

  it('compares employee IDs without leading zeros', () => {
    expect(sameEmployeeId('0110347', '110347')).toBe(true);
    expect(sameEmployeeId('110347', '110348')).toBe(false);
    expect(sameEmployeeId(undefined, '1')).toBe(false);
  });
});

describe('recognising a Model 22 issue voucher', () => {
  it('knows the IFMIS issue voucher and does not mistake other forms for it', async () => {
    const { isModel22 } = await import('./slip-reader');
    expect(isModel22('Receipt For Articles Or Property Issued\nModel 22 No. :  0000001/A Inventory')).toBe(true);
    expect(isModel22('Print Model19 Report\nINV Model 19 No. : 0000005')).toBe(false);
    expect(isModel22('Fixed Asset Disposal Form  Model/22/B')).toBe(false);
  });
});
