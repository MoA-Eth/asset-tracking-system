import { describe, expect, it, vi } from 'vitest';

vi.mock('read-excel-file/browser', () => ({ readSheet: vi.fn() }));

import { employeeTemplateCsv, parseCsv, rowsFromSheet } from './employee-import';

describe('HR spreadsheet reading', () => {
  it('finds the heading row and matches headings in English or Amharic, in any order', () => {
    const sheet = rowsFromSheet([
      ['Ministry of Agriculture — staff list'],
      [],
      ['ስም', 'Position', 'PAYROLL NO.', 'Directorate', 'Name', 'Mobile', 'Notes'],
      ['አበበ ከበደ', 'Driver', 1234, 'PROP', ' Abebe Kebede ', 251911000000, 'ignored'],
      [null, null, null, null, null, null, null],
      ['ሐና', '', 'MOA/2', 'ICT', 'Hana', '', ''],
    ]);
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows).toEqual([
      { row: 4, payrollId: '1234', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ ከበደ', department: 'PROP', jobTitle: 'Driver', email: '', phone: '251911000000' },
      { row: 6, payrollId: 'MOA/2', fullNameEn: 'Hana', fullNameAm: 'ሐና', department: 'ICT', jobTitle: '', email: '', phone: '' },
    ]);
  });

  it('reports the required columns a sheet lacks', () => {
    expect(rowsFromSheet([['Payroll ID', 'Name'], ['1', 'A']]).missing).toEqual(['department']);
    expect(rowsFromSheet([['Something', 'Else'], ['1', 'A']]).columns).toEqual([]);
  });

  it('parses CSV with quoted commas, quotes and a byte-order mark', () => {
    expect(parseCsv('\uFEFFPayroll ID,Name\r\n1,"Kebede, Abebe ""Abe"""\n2,Hana')).toEqual([
      ['Payroll ID', 'Name'],
      ['1', 'Kebede, Abebe "Abe"'],
      ['2', 'Hana'],
    ]);
  });

  it('offers a template its own reader accepts', () => {
    const sheet = rowsFromSheet(parseCsv(employeeTemplateCsv()));
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows[0]).toMatchObject({ payrollId: 'MOA/1234', fullNameAm: 'ሐና ተስፋዬ', department: 'PROP', phone: '+251911000000' });
  });
});
