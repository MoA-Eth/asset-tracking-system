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

describe('reading an IFMIS disposal form', () => {
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
