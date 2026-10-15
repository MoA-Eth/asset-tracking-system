import { describe, expect, it } from 'vitest';
import { isDisposalForm, parseDisposalForm, PdfRow, rowsToText } from './slip-reader';

const row = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

// Laid out like a real IFMIS "Fixed Asset Disposal Form" (Model 22/B); the disposal type is printed just above each line
const FORM: PdfRow[] = [
  row(49, [444, 'Fixed Asset Disposal Form']),
  row(69, [922, 'Model/22/B']),
  row(80, [104, 'Name of Public Body :'], [221, 'Ministry of Agriculture']),
  row(92, [60, 'Sold /Transferred / Donated to :'], [221, 'Test Region Office (Test Person)'], [821, 'No:'], [849, '0000015/2013']),
  row(109, [813, 'Date:'], [849, '26-NOV-21']),
  row(143, [53, 'S.No'], [173, 'Tag Number'], [249, 'Serial Number'], [576, 'Disposal Type'], [653, 'Original Cost'], [830, 'Book Value']),
  row(159, [572, 'DONATION']),
  row(168, [79, '1'], [94, 'Tablet Computer'], [168, 'MOA-000343'], [679, '15,640.00'], [783, '0.00'], [859, '15,640.00']),
  row(186, [572, 'SALE']),
  row(195, [79, '2'], [94, 'Desktop Computer'], [168, 'MOA-000344'], [679, '30,000.00'], [783, '12,000.00'], [859, '18,000.00']),
  row(585, [32, 'Report Taken By:'], [232, '05-OCT-2026 13:09']),
];

// Laid out like a photographed IFMIS printout (No. 0001765/2018): each line's cells sit at different heights. The
// disposal type is above the number, the description wraps ("Lap Top" / "Computer"), the tag and serial are a little
// lower, and the figures sit with the description's second line.
const line = (top: number, n: number, tag: string, serial: string): PdfRow[] => [
  row(top - 1, [742, 'TRANSFER']),
  row(top, [203, String(n)], [221, 'Lap Top']),
  row(top + 4, [304, tag]),
  row(top + 6, [385, serial]),
  row(top + 10, [221, 'Computer'], [858, '80,378.00'], [948, '80,378.00'], [1083, '0.00']),
];
const PHOTO: PdfRow[] = [
  row(100, [548, 'The Federal Democratic Republic of Ethiopia']),
  row(132, [604, 'Fixed Asset Disposal Form']),
  row(154, [1130, 'Model/22/B']),
  row(162, [231, 'Name of Public Body :'], [361, 'Ministry of Agriculture']),
  row(180, [183, 'Sold /Transferred / Donated to :'], [361, 'East Shawa Zone Agriculture Office/Umer Ahmed'], [1018, 'No:'], [1048, '0001765/2018']),
  row(199, [1008, 'Date:'], [1036, '28-JUL-26']),
  row(233, [175, 'S.No'], [240, 'Asset Description'], [310, 'Tag Number'], [393, 'Serial Number'], [495, 'Chassis No'], [583, 'Engine No'], [662, 'Declaration Number'], [745, 'Disposal Type'], [830, 'Original Cost'], [920, 'Accumulated Depreciation'], [1027, 'Book Value'], [1128, 'Remark']),
  ...line(257, 1, 'MOA-004344', '5CG1091THZ'),
  ...line(287, 2, 'MOA-004254', '5CG1103XNM'),
  ...line(317, 3, 'MOA-004245', '5CG1103XX0'),
  ...line(346, 4, 'MOA-004244', '5CG109351J'),
  ...line(376, 5, 'MOA-004242', '5CG1093639'),
  row(617, [136, 'I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.']),
  row(645, [175, 'Storekeeper Name and Signature'], [506, 'FAMU Accountant Name and Signature'], [886, "Recipient's Name and Signature"]),
  row(722, [130, 'Report Taken By  LIDLYATS from "ifmisdb1" instance  on 28-JUL-2026 12:23']),
];

// What pdfjs returned for a PDF laid out like that printout: it joined "Date:" with its value, and the headings wrap
const FROM_PDFJS: PdfRow[] = [
  row(87, [399, 'Fixed Asset Disposal Form']),
  row(102, [746, 'Model/22/B']),
  row(107, [152, 'Name of Public Body :'], [238, 'Ministry of Agriculture']),
  row(119, [121, 'Sold /Transferred / Donated to :'], [238, 'East Shawa Zone Agriculture Office/Umer Ahmed'], [672, 'No:'], [692, '0001765/2018']),
  row(131, [665, 'Date: 28-JUL-26']),
  row(150, [158, 'Asset']),
  row(154, [116, 'S.No'], [205, 'Tag Number'], [259, 'Serial Number'], [437, 'Declaration'], [608, 'Accumulated'], [744, 'Remark']),
  row(157, [153, 'Description'], [327, 'Chassis No'], [385, 'Engine No'], [492, 'Disposal Type'], [548, 'Original Cost'], [678, 'Book Value']),
  row(161, [446, 'Number'], [608, 'Depreciation']),
  row(169, [134, '1'], [146, 'Lap Top'], [490, 'TRANSFER']),
  row(172, [201, 'MOA-004344'], [254, 'SN-1792011873087']),
  row(176, [146, 'Computer'], [566, '80,378.00'], [626, '80,378.00'], [715, '0.00']),
  row(189, [134, '2'], [146, 'Lap Top'], [490, 'TRANSFER']),
  row(192, [201, 'MOA-004254'], [254, '5CG1103XNM']),
  row(196, [146, 'Computer'], [566, '80,378.00'], [626, '80,378.00'], [715, '0.00']),
  // A long tag close to its serial comes as one piece
  row(209, [134, '3'], [146, 'Laser Jet'], [490, 'TRANSFER']),
  row(212, [201, 'MOA-IT-2026-0075 SLIP-TEST-01']),
  row(216, [146, 'Printer'], [566, '12,500.00'], [626, '10,000.00'], [715, '2,500.00']),
  row(407, [90, 'I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.']),
];

describe('reading an IFMIS disposal form', () => {
  it('reads the rows pdfjs makes of it: a label joined with its value, and headings over several rows', () => {
    const form = parseDisposalForm(FROM_PDFJS);
    expect(form).toMatchObject({ disposalNo: '0001765/2018', date: '2026-07-28', recipient: 'East Shawa Zone Agriculture Office/Umer Ahmed' });
    expect(form.lines).toEqual([
      { description: 'Lap Top Computer', tagNumber: 'MOA-004344', serialNumber: 'SN-1792011873087', disposalType: 'TRANSFER', originalCost: 80378, accumulatedDepreciation: 80378, bookValue: 0 },
      { description: 'Lap Top Computer', tagNumber: 'MOA-004254', serialNumber: '5CG1103XNM', disposalType: 'TRANSFER', originalCost: 80378, accumulatedDepreciation: 80378, bookValue: 0 },
      { description: 'Laser Jet Printer', tagNumber: 'MOA-IT-2026-0075', serialNumber: 'SLIP-TEST-01', disposalType: 'TRANSFER', originalCost: 12500, accumulatedDepreciation: 10000, bookValue: 2500 },
    ]);
  });

  it('reads a printout whose cells sit at different heights, with wrapped descriptions', () => {
    const form = parseDisposalForm(PHOTO);
    expect(form).toMatchObject({ disposalNo: '0001765/2018', date: '2026-07-28', recipient: 'East Shawa Zone Agriculture Office/Umer Ahmed' });
    expect(form.lines).toHaveLength(5);
    expect(form.lines[0]).toEqual({
      description: 'Lap Top Computer', tagNumber: 'MOA-004344', serialNumber: '5CG1091THZ', disposalType: 'TRANSFER',
      originalCost: 80378, accumulatedDepreciation: 80378, bookValue: 0,
    });
    expect(form.lines.map((l) => [l.tagNumber, l.serialNumber, l.disposalType, l.bookValue])).toEqual([
      ['MOA-004344', '5CG1091THZ', 'TRANSFER', 0],
      ['MOA-004254', '5CG1103XNM', 'TRANSFER', 0],
      ['MOA-004245', '5CG1103XX0', 'TRANSFER', 0],
      ['MOA-004244', '5CG109351J', 'TRANSFER', 0],
      ['MOA-004242', '5CG1093639', 'TRANSFER', 0],
    ]);
  });

  it('reads the same printout when the reader puts the type and the number on one row', () => {
    // Pieces less than a couple of points apart come out as one row
    const merged = PHOTO.reduce<PdfRow[]>((out, r) => {
      const last = out[out.length - 1];
      if (last && r.top - last.top <= 2) last.cells.push(...r.cells.map((c) => ({ ...c })));
      else out.push({ top: r.top, cells: r.cells.map((c) => ({ ...c })) });
      return out;
    }, []);
    merged.forEach((r) => r.cells.sort((a, b) => a.x - b.x));
    const form = parseDisposalForm(merged);
    expect(form.lines.map((l) => [l.description, l.tagNumber, l.serialNumber, l.disposalType, l.originalCost])).toEqual(
      ['MOA-004344', 'MOA-004254', 'MOA-004245', 'MOA-004244', 'MOA-004242'].map((tag, i) => ['Lap Top Computer', tag, ['5CG1091THZ', '5CG1103XNM', '5CG1103XX0', '5CG109351J', '5CG1093639'][i], 'TRANSFER', 80378]),
    );
  });

  it('knows the form, and not a Model 19', () => {
    expect(isDisposalForm(rowsToText(FORM))).toBe(true);
    expect(isDisposalForm('Print Model19 Report\nINV Model 19 No. : 0000005')).toBe(false);
  });

  it('reads the header and every asset with its own disposal type and figures', () => {
    const form = parseDisposalForm(FORM);
    expect(form).toMatchObject({ disposalNo: '0000015/2013', date: '2021-11-26', recipient: 'Test Region Office (Test Person)' });
    expect(form.lines).toEqual([
      { description: 'Tablet Computer', tagNumber: 'MOA-000343', disposalType: 'DONATION', originalCost: 15640, accumulatedDepreciation: 0, bookValue: 15640 },
      { description: 'Desktop Computer', tagNumber: 'MOA-000344', disposalType: 'SALE', originalCost: 30000, accumulatedDepreciation: 12000, bookValue: 18000 },
    ]);
  });
});
