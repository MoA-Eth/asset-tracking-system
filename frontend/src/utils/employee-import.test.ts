import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

vi.mock('read-excel-file/browser', () => ({ readSheet: vi.fn() }));

import { EMPLOYEE_FIELDS, buildTextWorkbook, employeeTemplateRows, parseCsv, rowsFromSheet } from './employee-import';

describe('HR spreadsheet reading', () => {
  it("reads HR's own sheet: its headings, in its order, ignoring the columns we don't keep", () => {
    const sheet = rowsFromSheet([
      ['ተ/ቁ', 'ተቋም', 'ዋና የስራ ክፍል', 'የስራ ክፍል', 'ሙሉ ስም', 'ሙሉ ስም(በኢንግሊዘኛ)', 'የሰራተኛ መለያ ቁጥር', 'ፆታ', 'የስራ መደብ', 'ደመወዝ', 'መደብ መ.ቁ.', 'እርከን'],
      [1, 'ግብርና ሚኒስቴር', 'የኢፒዲሞሎጂ ዴስክ', 'የኢፒዲሞሎጂ ዴስክ መደቦች', 'ጌታሁን ባህሩ', 'Getahun Bahiru', '00275823', 'ወንድ', 'የእንስሳት ሐኪም', 32809, '13/ግብ/1249', '0'],
    ]);
    expect(sheet.missing).toEqual([]);
    expect(sheet.columns).toEqual(['department', 'unit', 'fullNameAm', 'fullNameEn', 'payrollId', 'gender', 'jobTitle']);
    expect(sheet.rows).toEqual([
      {
        row: 2,
        department: 'የኢፒዲሞሎጂ ዴስክ',
        unit: 'የኢፒዲሞሎጂ ዴስክ መደቦች',
        fullNameAm: 'ጌታሁን ባህሩ',
        fullNameEn: 'Getahun Bahiru',
        payrollId: '00275823',
        gender: 'ወንድ',
        jobTitle: 'የእንስሳት ሐኪም',
        phone: '',
        email: '',
      },
    ]);
    // Salary, position number and step are never read
    expect(JSON.stringify(sheet.rows)).not.toContain('32809');
    expect(JSON.stringify(sheet.rows)).not.toContain('13/ግብ/1249');
  });

  it('finds the heading row under a title and accepts English headings in any order', () => {
    const sheet = rowsFromSheet([
      ['Ministry of Agriculture — staff list'],
      [],
      ['Position', 'PAYROLL NO.', 'Directorate', 'Name', 'Mobile', 'Sex', 'Notes'],
      ['Driver', 1234, 'Transport', ' Abebe Kebede ', 251911000000, 'M', 'ignored'],
      [null, null, null, null, null, null, null],
      ['', 'MOA/2', 'ICT', 'Hana', '', '', ''],
    ]);
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows.map((r) => r.row)).toEqual([4, 6]);
    // A numeric cell lost its leading zeros in Excel; text IDs are left as typed
    expect(sheet.rows[0]).toMatchObject({ payrollId: '00001234', fullNameEn: 'Abebe Kebede', department: 'Transport', jobTitle: 'Driver', phone: '251911000000', gender: 'M' });
    expect(sheet.rows[1]).toMatchObject({ payrollId: 'MOA/2' });
  });

  it('reports the required columns a sheet lacks', () => {
    expect(rowsFromSheet([['Employee ID', 'Full name'], ['1', 'A']]).missing).toEqual(['department']);
    expect(rowsFromSheet([['Something', 'Else'], ['1', 'A']]).columns).toEqual([]);
  });

  it('parses CSV with quoted commas, quotes and a byte-order mark', () => {
    expect(parseCsv('﻿Employee ID,Name\r\n1,"Kebede, Abebe ""Abe"""\n2,Hana')).toEqual([
      ['Employee ID', 'Name'],
      ['1', 'Kebede, Abebe "Abe"'],
      ['2', 'Hana'],
    ]);
  });
});

describe('Import template', () => {
  it('has exactly the form fields, in the same order, and its own reader accepts it', () => {
    const [headings, example] = employeeTemplateRows();
    expect(headings).toEqual(EMPLOYEE_FIELDS.map((f) => f.heading));
    const sheet = rowsFromSheet([headings, example]);
    expect(sheet.columns).toEqual(EMPLOYEE_FIELDS.map((f) => f.key));
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows[0]).toMatchObject({ payrollId: '00123456', gender: 'ሴት' });
  });

  it('is an .xlsx whose cells are text, so employee IDs keep their leading zeros', () => {
    const files = unzipSync(buildTextWorkbook(employeeTemplateRows()));
    const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(Object.keys(files)).toContain('[Content_Types].xml');
    expect(sheetXml).toContain('<c r="E2" t="inlineStr"><is><t xml:space="preserve">00123456</t></is></c>');
    expect(sheetXml).toContain('ዋና የስራ ክፍል');
  });
});
