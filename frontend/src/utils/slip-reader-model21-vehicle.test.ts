import { describe, expect, it } from 'vitest';
import { isModel21, parseModel21, parseModel21Particulars, PdfRow, rowsToText } from './slip-reader';

/** A row as the reader returns it: distance from the top, then [x, text] pieces */
const row = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

// test-fixtures/sample-model21-vehicle.pdf: a vehicle transfer laid out like the IFMIS Model 21 printout
const VEHICLE: PdfRow[] = [
  row(64, [345, 'Fixed Asset Internal Transfer Form']),
  row(95, [765, 'Model/21']),
  row(112, [735, 'Model # 0004386']),
  row(128, [15, 'From Employee Name :'], [125, 'Mekonnen, Abayneh Belachew'], [455, 'To : Ayele, Marta Mekete']),
  row(141, [30, 'From Employee ID :'], [125, '110895'], [455, 'To : 109856']),
  row(154, [85, 'Book :'], [125, 'MOA MC BOOK']),
  row(172, [188, 'Serial'], [225, 'Chassis'], [368, 'Depreciat'], [800, 'Rem']),
  row(180, [15, '#'], [45, 'Description'], [125, 'Tag Number'], [188, 'Number'], [225, 'Number'], [262, 'UOM'], [292, 'Unit'], [318, 'Orig. Cost'], [368, 'ion'], [420, 'Book Value'], [475, 'Date'], [560, 'From Location'], [690, 'To Location'], [800, 'ark']),
  row(188, [228, 'JTEBB71J']),
  row(196, [16, '1'], [45, 'Station Wagon -'], [125, 'MOA-016341'], [228, 'X0700892'], [297, '1'], [315, '530,450.88'], [365, '530,450.88'], [435, '0.00'], [465, '28-SEP-26'], [520, 'MoA Gurd ShollaDefaultDefaultDefault'], [650, 'MoA Gurd ShollaDefaultDefaultDefault']),
  row(204, [45, 'Diesel'], [240, '0']),
  row(222, [262, 'Plate No'], [320, '4-23794'], [435, 'tire no']),
  row(231, [262, 'Engine No'], [300, '1HZ-0641864'], [435, 'R240514711'], [560, 'Remark']),
  row(240, [262, 'Accessory'], [435, 'R240504703'], [560, 'The right side mirror is missing.']),
  row(249, [262, 'jack with handle'], [360, '1'], [435, 'R240504594'], [560, 'Both rear lights are broken.']),
  row(258, [262, 'tire wrench'], [360, '1'], [435, 'R240504595']),
  row(267, [262, 'key'], [360, '2'], [435, 'YY0219']),
  row(430, [30, 'I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.']),
  row(450, [70, 'Transferor Name and Signature'], [350, 'FAMU Accountant Name and Signature'], [620, "Recipient's Name and Signature"]),
  row(462, [70, 'Mekonnen, Abayneh Belachew'], [640, 'Ayele, Marta Mekete']),
];

describe('a Model 21 transferring a vehicle', () => {
  it('reads the voucher, the people and the asset line', () => {
    const text = rowsToText(VEHICLE);
    expect(isModel21(text)).toBe(true);
    const slip = parseModel21(text);
    expect(slip).toMatchObject({ model21No: '0004386', fromName: 'Mekonnen, Abayneh Belachew', fromEmployeeId: '110895', toName: 'Ayele, Marta Mekete', toEmployeeId: '109856', book: 'MOA MC BOOK' });
    expect(slip.lines[0]).toMatchObject({ tagNumber: 'MOA-016341', unit: 1, origCost: 530450.88, depreciation: 530450.88, bookValue: 0, date: '2026-09-28' });
  });

  it('reads the vehicle details under the table: chassis (wrapped), plate, engine, accessories, tires and remark', () => {
    expect(parseModel21Particulars(VEHICLE)).toEqual({
      chassisNumber: 'JTEBB71JX07008920',
      plateNo: '4-23794',
      engineNo: '1HZ-0641864',
      accessories: [
        { name: 'jack with handle', quantity: 1 },
        { name: 'tire wrench', quantity: 1 },
        { name: 'key', quantity: 2 },
      ],
      tireNos: ['R240514711', 'R240504703', 'R240504594', 'R240504595', 'YY0219'],
      remark: 'The right side mirror is missing. Both rear lights are broken.',
    });
  });

  it('leaves out what a transfer of something other than a vehicle does not print', () => {
    // The same form for a laptop: no chassis number in the line, nothing printed under the table
    const plain = VEHICLE.filter((r) => r.top < 210 && r.top !== 188 && r.top !== 204).map((r) => ({ ...r, cells: r.cells.filter((c) => c.text !== 'X0700892') }));
    expect(parseModel21Particulars(plain)).toEqual({ chassisNumber: undefined, plateNo: undefined, engineNo: undefined, accessories: [], tireNos: [], remark: undefined });
  });
});
