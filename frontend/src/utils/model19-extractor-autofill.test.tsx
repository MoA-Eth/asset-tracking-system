import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isModel19, parseModel19, PdfRow, rowsToText } from './slip-reader';
import { ocrLinesToRows, OcrLine } from './slip-ocr';
import { StockInForm } from '../components/assets/ReceiptForm';
import { readPdfPages } from './slip-reader';
import { ocrRows } from './slip-ocr';

// Mocks for React components
const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: ['stock-in.write'] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));

vi.mock('./slip-reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./slip-reader')>();
  return {
    ...actual,
    readPdfPages: vi.fn(),
  };
});

vi.mock('./slip-ocr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./slip-ocr')>();
  return {
    ...actual,
    ocrRows: vi.fn(async () => []),
  };
});

vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn(async () => []),
    getStores: vi.fn(async () => []),
    getLocations: vi.fn(async () => []),
    getEmployees: vi.fn(async () => []),
    getPrograms: vi.fn(async () => []),
    registerStockIn: vi.fn(),
    uploadSlip: vi.fn(),
  },
}));

/** Helper to construct a PdfRow in the standard Model 19 test format */
const row = (top: number, ...cells: [number, string][]): PdfRow => ({
  top,
  cells: cells.map(([x, text]) => ({ x, text })),
});

/** Helper to construct an OcrLine in the standard OCR test format */
const line = (top: number, ...words: [string, number, number][]): OcrLine => ({
  bbox: { x0: words[0][1], y0: top, x1: words[words.length - 1][2], y1: top + 30 },
  words: words.map(([text, x0, x1]) => ({ text, bbox: { x0, y0: top, x1, y1: top + 30 } })),
});

// Single-item Model 19 PDF fixture (derived from official Model 19 format)
const SINGLE_ITEM_PDF: PdfRow[] = [
  row(60, [585, 'The Federal Democratic Republic of Ethiopia']),
  row(85, [470, 'MoA Emergency Locust response Program']),
  row(98, [640, 'Print Model19 Report']),
  row(146, [680, 'INV Model 19 No. :'], [812, '0000070']),
  row(162, [714, 'PO Number :'], [812, '104']),
  row(178, [697, 'Received Date :'], [812, '30-Sep-2026']),
  row(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
  row(208, [742, 'Source :'], [812, 'F.G.G.IMPORT']),
  row(240, [748, 'Buyer :'], [812, 'Acha, Tizeta Belay']),
  row(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [462, 'Sub'], [536, 'Item Category'], [826, 'Qty']),
  row(305, [906, 'Unit Price'], [998, 'Total Amount']),
  row(316, [88, '1'], [128, '101101101.0339'], [270, 'Posta'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '2'], [906, '18'], [998, '36']),
  row(630, [906, 'Grand Total'], [998, '36']),
  row(742, [70, 'Delivered By : Name : Tizeta Belay'], [450, 'Received By : Name : mulutsehay']),
];

// Multi-item Model 19 PDF fixture (matching the user's real MoA scanned voucher: 0000070)
const REAL_LOCUST_MODEL19_PDF: PdfRow[] = [
  row(60, [585, 'The Federal Democratic Republic of Ethiopia']),
  row(85, [470, 'MoA Emergency Locust response Program']),
  row(98, [640, 'Print Model19 Report']),
  row(146, [680, 'INV Model 19 No. :'], [812, '0000070']),
  row(162, [714, 'PO Number :'], [812, '104']),
  row(178, [697, 'Received Date :'], [812, '30-Sep-2026']),
  row(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
  row(208, [742, 'Source :'], [812, 'F.G.G.IMPORT']),
  row(240, [748, 'Buyer :'], [812, 'Acha, Tizeta Belay']),
  row(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [462, 'Sub'], [536, 'Item Category'], [826, 'Qty']),
  row(305, [906, 'Unit Price'], [998, 'Total Amount']),
  row(316, [88, '1'], [128, '101101101.0339'], [270, 'Posta'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '2'], [906, '18'], [998, '36']),
  row(350, [88, '2'], [128, '102101102.1304'], [270, 'Staples-3/4 3/8'], [403, 'EA'], [435, 'Stationery'], [510, 'Construction Maintenance & Equipment & Accessories'], [826, '3'], [906, '1600'], [998, '4800']),
  row(380, [88, '3'], [128, '101101101.0057'], [270, 'Note Pad Medium'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '20'], [906, '150'], [998, '3000']),
  row(410, [88, '4'], [128, '101103101.0033'], [270, 'Puncher Small'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '2'], [906, '1800'], [998, '3600']),
  row(440, [88, '5'], [128, '101101101.0105'], [270, 'Stapler Wire Small'], [403, 'PKT'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '3'], [906, '95'], [998, '285']),
  row(470, [88, '6'], [128, '101101101.0006'], [270, 'Blue Pen'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '50'], [906, '39'], [998, '1950']),
  row(500, [88, '7'], [128, '101101101.0070'], [270, 'Photo Copy Paper'], [403, 'RM'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '15'], [906, '1160'], [998, '17400']),
  row(530, [88, '8'], [128, '101101101.0007'], [270, 'Box File'], [403, 'EA'], [435, 'Stationery'], [510, 'Office supplies & Other related Item'], [826, '10'], [906, '380'], [998, '3800']),
  row(630, [906, 'Grand Total'], [998, '34871']),
  row(742, [70, 'Delivered By : Name : Tizeta Belay'], [450, 'Received By : Name : mulutsehay']),
];

// Single-item Model 19 OCR Lines (with column gaps >= 50px so cells do not merge)
const SINGLE_ITEM_OCR_LINES: OcrLine[] = [
  line(100, ['The', 400, 450], ['Federal', 460, 560], ['Democratic', 570, 700], ['Republic', 710, 810], ['of', 820, 840], ['Ethiopia', 850, 950]),
  line(140, ['Ministry', 400, 500], ['of', 510, 535], ['Agriculture', 545, 680]),
  line(180, ['Print', 400, 480], ['Model19', 490, 620], ['Report', 630, 730]),
  line(240, ['INV', 1200, 1260], ['Model', 1270, 1360], ['19', 1370, 1400], ['No.', 1410, 1460], [':', 1470, 1480], ['0000070', 1550, 1680]),
  line(280, ['PO', 1200, 1250], ['Number', 1260, 1370], [':', 1380, 1390], ['104', 1550, 1620]),
  line(320, ['Received', 1200, 1330], ['Date', 1340, 1400], [':', 1410, 1420], ['30-Sep-2026', 1550, 1750]),
  line(360, ['Transaction', 1200, 1380], ['Type', 1390, 1460], [':', 1470, 1480], ['PO', 1550, 1590], ['Receipt', 1600, 1710]),
  line(400, ['Source', 1200, 1300], [':', 1310, 1320], ['F.G.G.IMPORT', 1550, 1750]),
  line(440, ['Buyer', 1200, 1290], [':', 1300, 1310], ['Acha,', 1550, 1630], ['Tizeta', 1640, 1720], ['Belay', 1730, 1810]),
  line(520, ['S/No.', 100, 180], ['Item', 240, 300], ['Code', 310, 380], ['Item', 500, 560], ['Description', 570, 720], ['UOM', 820, 880], ['Qty', 1600, 1660], ['Unit', 1780, 1840], ['Price', 1850, 1930], ['Total', 2000, 2070], ['Amount', 2080, 2190]),
  line(600, ['1', 100, 140], ['101101101.0339', 240, 440], ['Posta', 550, 680], ['EA', 820, 870], ['Stationery', 950, 1080], ['Office', 1150, 1230], ['supplies', 1240, 1340], ['2', 1610, 1650], ['18', 1800, 1860], ['36', 2020, 2080]),
  line(700, ['Grand', 1780, 1870], ['Total', 1880, 1960], ['36', 2020, 2080]),
];

// Multi-item Model 19 OCR Lines (items 1 and 2 from locust response voucher)
const MULTI_ITEM_OCR_LINES: OcrLine[] = [
  ...SINGLE_ITEM_OCR_LINES.slice(0, 10),
  line(600, ['1', 100, 140], ['101101101.0339', 240, 440], ['Posta', 550, 680], ['EA', 820, 870], ['Stationery', 950, 1080], ['Office', 1150, 1230], ['supplies', 1240, 1340], ['2', 1610, 1650], ['18', 1800, 1860], ['36', 2020, 2080]),
  line(660, ['2', 100, 140], ['102101102.1304', 240, 440], ['Staples-3/4', 550, 660], ['3/8', 670, 730], ['EA', 820, 870], ['Stationery', 950, 1080], ['Construction', 1150, 1300], ['Equipment', 1310, 1430], ['3', 1610, 1650], ['1600', 1800, 1870], ['4800', 2020, 2100]),
  line(740, ['Grand', 1780, 1870], ['Total', 1880, 1960], ['4836', 2020, 2100]),
];

const mockLocations = [
  { id: 'LOC-1', name: 'Central Store', storeId: 'S1', storeName: 'Head office', siteName: 'Head office', roomNumber: 'Central Store', isActive: true, building: 'Main' },
] as any;

const mockEmployees = [
  { id: 'E1', fullNameEn: 'Acha, Tizeta Belay', fullNameAm: 'አቻ ጥዘታ በላይ', payrollId: 'MOA/1', employeeId: '00000001', departmentId: 'D1', role: 'ENCODER', isActive: true },
] as any;

import { beforeEach } from 'vitest';

beforeEach(() => {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  } else {
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(window.URL, 'revokeObjectURL').mockReturnValue();
  }
});

describe('Model 19 PDF Extractor', () => {
  it('extracts all header fields and the single item line from a single-item Model 19 PDF', () => {
    expect(isModel19(rowsToText(SINGLE_ITEM_PDF))).toBe(true);
    const slip = parseModel19(SINGLE_ITEM_PDF);

    // Header extraction
    expect(slip).toMatchObject({
      model19No: '0000070',
      poNumber: '104',
      receivedDate: '2026-09-30',
      transactionType: 'PO Receipt',
      source: 'F.G.G.IMPORT',
      buyer: 'Acha, Tizeta Belay',
      programName: 'MoA Emergency Locust response Program',
      deliveredBy: 'Tizeta Belay',
      receivedBy: 'mulutsehay',
    });

    // Single item line extraction
    expect(slip.lines).toHaveLength(1);
    expect(slip.lines[0]).toEqual({
      itemCode: '101101101.0339',
      description: 'Posta',
      uom: 'EA',
      subInventory: 'Stationery',
      category: 'Office supplies & Other related Item',
      quantity: 2,
      unitPrice: 18,
      totalAmount: 36,
    });
  });

  it('extracts all header fields and all 8 item lines from the real MoA Model 19 voucher', () => {
    expect(isModel19(rowsToText(REAL_LOCUST_MODEL19_PDF))).toBe(true);
    const slip = parseModel19(REAL_LOCUST_MODEL19_PDF);

    // Header
    expect(slip).toMatchObject({
      model19No: '0000070',
      poNumber: '104',
      receivedDate: '2026-09-30',
      transactionType: 'PO Receipt',
      source: 'F.G.G.IMPORT',
      buyer: 'Acha, Tizeta Belay',
      programName: 'MoA Emergency Locust response Program',
    });

    // Multiple item lines (8 lines)
    expect(slip.lines).toHaveLength(8);
    expect(slip.lines[0]).toMatchObject({ itemCode: '101101101.0339', description: 'Posta', quantity: 2, unitPrice: 18, totalAmount: 36 });
    expect(slip.lines[1]).toMatchObject({ itemCode: '102101102.1304', description: 'Staples-3/4 3/8', quantity: 3, unitPrice: 1600, totalAmount: 4800 });
    expect(slip.lines[2]).toMatchObject({ itemCode: '101101101.0057', description: 'Note Pad Medium', quantity: 20, unitPrice: 150, totalAmount: 3000 });
    expect(slip.lines[3]).toMatchObject({ itemCode: '101103101.0033', description: 'Puncher Small', quantity: 2, unitPrice: 1800, totalAmount: 3600 });
    expect(slip.lines[4]).toMatchObject({ itemCode: '101101101.0105', description: 'Stapler Wire Small', uom: 'PKT', quantity: 3, unitPrice: 95, totalAmount: 285 });
    expect(slip.lines[5]).toMatchObject({ itemCode: '101101101.0006', description: 'Blue Pen', quantity: 50, unitPrice: 39, totalAmount: 1950 });
    expect(slip.lines[6]).toMatchObject({ itemCode: '101101101.0070', description: 'Photo Copy Paper', uom: 'RM', quantity: 15, unitPrice: 1160, totalAmount: 17400 });
    expect(slip.lines[7]).toMatchObject({ itemCode: '101101101.0007', description: 'Box File', quantity: 10, unitPrice: 380, totalAmount: 3800 });
  });
});

describe('Model 19 Image / OCR Extractor', () => {
  it('converts OCR lines to rows and extracts a single item Model 19', () => {
    const scale = 0.5;
    const rows = ocrLinesToRows(SINGLE_ITEM_OCR_LINES, scale);
    expect(rows.length).toBeGreaterThan(0);

    const text = rowsToText(rows);
    expect(isModel19(text)).toBe(true);

    const slip = parseModel19(rows);
    expect(slip).toMatchObject({
      model19No: '0000070',
      poNumber: '104',
      receivedDate: '2026-09-30',
      transactionType: 'PO Receipt',
      source: 'F.G.G.IMPORT',
      buyer: 'Acha, Tizeta Belay',
    });

    expect(slip.lines).toHaveLength(1);
    expect(slip.lines[0]).toMatchObject({
      itemCode: '101101101.0339',
      description: 'Posta',
      uom: 'EA',
      subInventory: 'Stationery',
      quantity: 2,
      unitPrice: 18,
      totalAmount: 36,
    });
  });

  it('converts OCR lines to rows and extracts multiple items from a Model 19 image', () => {
    const scale = 0.5;
    const rows = ocrLinesToRows(MULTI_ITEM_OCR_LINES, scale);
    const slip = parseModel19(rows);

    expect(slip.lines).toHaveLength(2);
    expect(slip.lines[0]).toMatchObject({
      itemCode: '101101101.0339',
      description: 'Posta',
      uom: 'EA',
      quantity: 2,
      unitPrice: 18,
      totalAmount: 36,
    });
    expect(slip.lines[1]).toMatchObject({
      itemCode: '102101102.1304',
      description: 'Staples-3/4 3/8',
      uom: 'EA',
      quantity: 3,
      unitPrice: 1600,
      totalAmount: 4800,
    });
  });
});

describe('Model 19 Autofill in ReceiptForm (StockInForm)', () => {
  it('autofills a single item from a Model 19 PDF into primary fields and leaves extra rows empty', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValueOnce({
      rows: SINGLE_ITEM_PDF,
      pages: 1,
      pagesRead: 1,
    });

    const { container } = render(
      <StockInForm
        locations={mockLocations}
        employees={mockEmployees}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['%PDF'], 'model19-single.pdf', { type: 'application/pdf' }));

    // Notice banner verifies successful slip read
    expect(await screen.findByText(/Filled in from the slip/i)).toBeInTheDocument();

    // Primary header fields autofilled
    expect(screen.getByLabelText(/Model 19 No/i)).toHaveValue('0000070');
    expect(screen.getByLabelText(/PO number/i)).toHaveValue('104');
    expect(screen.getByLabelText(/Received date/i)).toHaveValue('2026-09-30');
    expect(screen.getByLabelText(/Transaction type/i)).toHaveValue('PO Receipt');
    expect(screen.getByLabelText(/Source/i)).toHaveValue('F.G.G.IMPORT');
    expect(screen.getByLabelText(/Buyer/i)).toHaveValue('Acha, Tizeta Belay');
    expect(screen.getByLabelText(/Program \/ project/i)).toHaveValue('MoA Emergency Locust response Program');

    // Line 1 item particulars
    expect(screen.getByLabelText(/Item description/i)).toHaveValue('Posta');
    expect(screen.getByLabelText(/IFMIS item code/i)).toHaveValue('101101101.0339');
    expect(screen.getByLabelText('Item type')).toHaveTextContent('Consumable'); // 1... is Consumable
    expect(screen.getByLabelText(/^Quantity/i)).toHaveValue('2');
    expect(screen.getByLabelText(/Unit of measure/i)).toHaveValue('EA');
    expect(screen.getByLabelText(/Unit price \(ETB\)/i)).toHaveValue('18');

    // No extra item rows added since it is a single item
    expect(screen.queryByText(/Line 2/i)).toBeNull();
    expect(screen.queryByText(/more items/i)).toBeNull();
  });

  it('autofills multiple items from a Model 19 PDF into Line 1 and extra lines table', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValueOnce({
      rows: REAL_LOCUST_MODEL19_PDF,
      pages: 1,
      pagesRead: 1,
    });

    const { container } = render(
      <StockInForm
        locations={mockLocations}
        employees={mockEmployees}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['%PDF'], 'model19-multi.pdf', { type: 'application/pdf' }));

    // Notice banner announces 8 items
    expect(await screen.findByText(/This slip lists 8 items, one row each/i)).toBeInTheDocument();

    // Primary header fields
    expect(screen.getByLabelText(/Model 19 No/i)).toHaveValue('0000070');
    expect(screen.getByLabelText(/PO number/i)).toHaveValue('104');

    // Line 1 item particulars (Posta)
    expect(screen.getByLabelText(/Item description/i)).toHaveValue('Posta');
    expect(screen.getByLabelText(/IFMIS item code/i)).toHaveValue('101101101.0339');
    expect(screen.getByLabelText('Item type')).toHaveTextContent('Consumable');
    expect(screen.getByLabelText(/^Quantity/i)).toHaveValue('2');
    expect(screen.getByLabelText(/Unit price \(ETB\)/i)).toHaveValue('18');

    // Extra lines (Lines 2 through 8) populated in SlipLines
    expect(screen.getByDisplayValue('Staples-3/4 3/8')).toBeInTheDocument();
    expect(screen.getByDisplayValue('102101102.1304')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Note Pad Medium')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Puncher Small')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stapler Wire Small')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Blue Pen')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Photo Copy Paper')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Box File')).toBeInTheDocument();
  });

  it('autofills a single item from an image / scan via OCR with holdTogether validation', async () => {
    const user = userEvent.setup();
    const rows = ocrLinesToRows(SINGLE_ITEM_OCR_LINES, 0.5);
    vi.mocked(ocrRows).mockResolvedValueOnce(rows);

    const { container } = render(
      <StockInForm
        locations={mockLocations}
        employees={mockEmployees}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['image-bytes'], 'model19-scan.jpg', { type: 'image/jpeg' }));

    // Notice indicates scan read with check against paper
    expect(await screen.findByText(/Filled in from the scan/i)).toBeInTheDocument();
    expect(screen.getByText(/check every value against the paper/i)).toBeInTheDocument();

    // Header fields
    expect(screen.getByLabelText(/Model 19 No/i)).toHaveValue('0000070');
    expect(screen.getByLabelText(/PO number/i)).toHaveValue('104');

    // Line 1 item particulars
    expect(screen.getByLabelText(/Item description/i)).toHaveValue('Posta');
    expect(screen.getByLabelText(/IFMIS item code/i)).toHaveValue('101101101.0339');
    expect(screen.getByLabelText('Item type')).toHaveTextContent('Consumable');
    expect(screen.getByLabelText(/^Quantity/i)).toHaveValue('2');
    expect(screen.getByLabelText(/Unit of measure/i)).toHaveValue('EA');
    expect(screen.getByLabelText(/Unit price \(ETB\)/i)).toHaveValue('18');

    // Single item has no extra rows
    expect(screen.queryByText(/Line 2/i)).toBeNull();
  });

  it('autofills multiple items from an image / scan via OCR with Line 1 and extra lines', async () => {
    const user = userEvent.setup();
    const rows = ocrLinesToRows(MULTI_ITEM_OCR_LINES, 0.5);
    vi.mocked(ocrRows).mockResolvedValueOnce(rows);

    const { container } = render(
      <StockInForm
        locations={mockLocations}
        employees={mockEmployees}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['image-bytes'], 'model19-multi-scan.png', { type: 'image/png' }));

    // Notice indicates scan read and multiple items
    expect(await screen.findByText(/This slip lists 2 items, one row each/i)).toBeInTheDocument();

    // Line 1
    expect(screen.getByLabelText(/Item description/i)).toHaveValue('Posta');
    expect(screen.getByLabelText(/^Quantity/i)).toHaveValue('2');

    // Line 2 in extra lines
    expect(screen.getByDisplayValue('Staples-3/4 3/8')).toBeInTheDocument();
    expect(screen.getByDisplayValue('102101102.1304')).toBeInTheDocument();
  });
});
