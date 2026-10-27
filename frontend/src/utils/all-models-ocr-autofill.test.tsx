import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfRow } from './slip-reader';
import { ocrRows } from './slip-ocr';
import { readPdfRows } from './slip-reader';
import { TransferForm } from '../components/assets/TransferForm';
import { StockOutForm } from '../components/assets/IssueForm';
import { DisposalForm } from '../components/assets/DisposalForm';
import { ItemWithRelations, ItemStatus, ItemType, Employee, Location, Department } from '../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: ['transfers.write', 'stock-out.write', 'disposals.write'] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));

vi.mock('./slip-ocr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./slip-ocr')>();
  return { ...actual, ocrRows: vi.fn() };
});

vi.mock('./slip-reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./slip-reader')>();
  return { ...actual, readPdfRows: vi.fn() };
});

vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn(async () => []),
    getStores: vi.fn(async () => []),
    getLocations: vi.fn(async () => []),
    getEmployees: vi.fn(async () => []),
    getDepartments: vi.fn(async () => []),
    getOrganizations: vi.fn(async () => []),
    transferItem: vi.fn(),
    registerStockOut: vi.fn(),
    registerDisposal: vi.fn(),
    uploadSlip: vi.fn(),
  },
}));

const row = (top: number, ...cells: [number, string][]): PdfRow => ({
  top,
  cells: cells.map(([x, text]) => ({ x, text })),
});

const sampleEmployee: Employee = {
  id: 'EMP-1', payrollId: '110347',
  fullNameEn: 'Daniel Lenjisso', fullNameAm: 'ዳንኤል ሌንጂሶ',
  departmentId: 'DEP-1', role: null, isActive: true,
};
const sampleDepartment: Department = { id: 'DEP-1', code: 'AGR', nameEn: 'Agriculture Directorate', nameAm: 'የግብርና መ/ቤት' };
const sampleLocation: Location = {
  id: 'LOC-1', storeId: 'S1', name: 'Central Store',
  storeName: 'Central Store', isActive: true,
  siteName: 'Central Store – Central Store', building: 'Main Building',
  roomNumber: 'A1',
};
const sampleItem: ItemWithRelations = {
  id: 'ITEM-1', itemCode: 'MOA-VEH-2024-0001', name: 'Toyota Land Cruiser Pick Up',
  category: 'VEHICLE' as any,
  itemType: ItemType.FIXED, status: ItemStatus.AVAILABLE,
  condition: 'GOOD' as any,
  quantity: 1, uom: 'EA',
  unitCostETB: 2500000,
  ifmisTagNumber: 'MOA-016341', serialNumber: 'JTEBB71JX07008920',
  storeLocationId: 'LOC-1', storeLocation: sampleLocation,
  ifmisSlipNumber: 'INV-2024-0001',
  ifmisSlipDateGc: '2024-01-01', ifmisSlipDateEc: '2016-04-23',
  registeredById: 'EMP-1',
  createdAtGc: '2024-01-01', createdAtEc: '2016-04-23',
  history: [],
};

describe('All Models OCR Autofill from Images and Scanned PDFs', () => {
  beforeEach(() => {
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    } else {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    }
  });

  it('Model 21 TransferForm: autofills from an image scan via OCR without extracting price fields', async () => {
    const user = userEvent.setup();
    const m21ScanRows: PdfRow[] = [
      row(50, [100, 'Ministry of Agriculture'], [400, 'Fixed Asset Internal Transfer Form Model 21']),
      row(80, [100, 'Model # 210099'], [400, 'Book : Central']),
      row(110, [100, 'From Employee Name :  Borecha, Wosene  To : Daniel Lenjisso']),
      row(140, [100, 'From Employee ID : 109870  To : 110347']),
      row(200, [50, '1'], [100, 'Toyota Land Cruiser'], [220, 'MOA-016341'], [300, '1'], [350, '2,500,000.00'], [420, '500,000.00'], [500, '2,000,000.00'], [600, '05-OCT-26']),
      row(300, [100, 'Plate No 4-23794'], [300, 'Engine No 1HZ-0641864']),
      row(330, [100, 'jack with handle 1'], [250, 'tire wrench 1'], [400, 'key 2']),
    ];
    vi.mocked(ocrRows).mockResolvedValueOnce(m21ScanRows);
    render(
      <TransferForm items={[sampleItem]} employees={[sampleEmployee]} departments={[sampleDepartment]}
        locations={[sampleLocation]} pendingByItem={new Map()} openByItem={new Map()}
        initialItemId="ITEM-1" onCancel={vi.fn()} onSaved={vi.fn()} />
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    await user.upload(fileInput, new File(['fake-scan-image-bytes'], 'model21-signed-scan.png', { type: 'image/png' }));
    await waitFor(() => {
      const model21Input = document.querySelector('input[placeholder*="Model 21 form"]') as HTMLInputElement;
      expect(model21Input.value).toBe('210099');
    });
    const bookInput = document.querySelector('input[placeholder*="Central"]') as HTMLInputElement;
    expect(bookInput?.value || screen.getByDisplayValue('Central')).toBeTruthy();
    const plateInput = document.querySelector('#transfer-plate') as HTMLInputElement;
    const engineInput = document.querySelector('#transfer-engine') as HTMLInputElement;
    expect(plateInput.value).toBe('4-23794');
    expect(engineInput.value).toBe('1HZ-0641864');
    const notice = document.querySelector('[role="status"]')?.textContent ?? '';
    expect(notice).not.toMatch(/depreciation/i);
    expect(notice).not.toMatch(/book value/i);
  });

  it('Model 22 StockOutForm: autofills from an image scan via OCR without extracting price fields', async () => {
    const user = userEvent.setup();
    const consumableItem: ItemWithRelations = {
      id: 'ITEM-2', itemCode: 'MOA-TONER-01', ifmisItemCode: '107101102.4336',
      name: 'HP LaserJet Toner 85A',
      category: 'SUPPLIES' as any,
      itemType: ItemType.CONSUMABLE, status: ItemStatus.AVAILABLE,
      condition: 'GOOD' as any,
      quantity: 50, unitCostETB: 4500, uom: 'EA',
      serialNumber: '',
      storeLocationId: 'LOC-1', storeLocation: sampleLocation,
      ifmisSlipNumber: 'INV-2024-0002',
      ifmisSlipDateGc: '2024-01-01', ifmisSlipDateEc: '2016-04-23',
      registeredById: 'EMP-1',
      createdAtGc: '2024-01-01', createdAtEc: '2016-04-23',
      history: [],
    };
    const m22ScanRows: PdfRow[] = [
      row(50, [100, 'Receipt For Articles Or Property Issued Model 22 No. 88201']),
      row(80, [100, 'Issued Date : 12-NOV-2026']),
      row(110, [100, 'Transaction Type : ISSUE']),
      row(140, [100, 'Destination : Agriculture Directorate']),
      row(200, [50, '1'], [100, '107101102.4336'], [220, 'HP LaserJet Toner 85A'], [350, 'EA'], [420, '10'], [500, '4,500.00'], [600, '45,000.00']),
    ];
    vi.mocked(ocrRows).mockResolvedValueOnce(m22ScanRows);
    render(
      <StockOutForm availableItems={[consumableItem]} departments={[sampleDepartment]}
        employees={[sampleEmployee]} onCancel={vi.fn()} onSuccess={vi.fn()} />
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    await user.upload(fileInput, new File(['fake-m22-photo'], 'model22-voucher.jpg', { type: 'image/jpeg' }));
    await waitFor(() => {
      const model22Input = document.querySelector('#stock-out-model22') as HTMLInputElement;
      expect(model22Input.value).toBe('88201');
    });
    const deptSelect = screen.getByLabelText(/Destination directorate/i) as HTMLSelectElement;
    expect(deptSelect.value).toBe('DEP-1');
    const qtyInput = screen.getByLabelText(/Quantity to issue/i) as HTMLInputElement;
    expect(qtyInput.value).toBe('10');
    const notice = document.querySelector('[role="status"]')?.textContent ?? '';
    expect(notice).not.toMatch(/unit price/i);
    expect(notice).not.toMatch(/total amount/i);
    expect(notice).not.toMatch(/transport cost/i);
  });

  /**
   * Images uploaded to DisposalForm are treated as direct photo attachments (signed copy),
   * not OCR-scanned. Only PDFs with no embedded text fall through to the OCR path.
   */
  it('Model 22/B DisposalForm: autofills from a scanned PDF via OCR without extracting price fields', async () => {
    const user = userEvent.setup();
    const disposalScanRows: PdfRow[] = [
      row(50, [100, 'Fixed Asset Disposal Form (Model 22/B)']),
      row(80, [100, 'No : DSP-2026-999'], [400, 'Date : 18-NOV-2026']),
      row(110, [100, 'Sold /Transferred / Donated to : Kality Vocational College']),
      row(160, [30, 'S.No'], [80, 'Tag Number'], [220, 'Asset Description'], [380, 'Disposal Type'], [500, 'Book Value']),
      row(200, [30, '1'], [80, 'MOA-016341'], [220, 'Toyota Land Cruiser'], [380, 'DONATION'], [500, '1,800,000.00']),
    ];
    // Scanned PDF: readPdfRows returns empty (no embedded text), triggering OCR fallback
    vi.mocked(readPdfRows).mockResolvedValueOnce([]);
    vi.mocked(ocrRows).mockResolvedValueOnce(disposalScanRows);
    render(
      <DisposalForm item={sampleItem} allItems={[sampleItem]} onCancel={vi.fn()} onSuccess={vi.fn()} />
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    // Upload a scanned PDF — images are treated as direct photo attachments, not OCR'd
    await user.upload(fileInput, new File(['%PDF-1.4'], 'disposal-form-scan.pdf', { type: 'application/pdf' }));
    await waitFor(() => {
      const refInput = document.querySelector('#disposal-no') as HTMLInputElement;
      expect(refInput.value).toBe('DSP-2026-999');
    });
    const recipientInput = screen.getByLabelText(/Sold \/ transferred \/ donated to/i) as HTMLInputElement;
    expect(recipientInput.value).toBe('Kality Vocational College');
    const reasonInput = screen.getByLabelText(/Disposal type/i) as HTMLInputElement;
    expect(reasonInput.value).toBe('DONATION');
    const notice = document.querySelector('[role="status"]')?.textContent ?? '';
    expect(notice).not.toMatch(/book value/i);
  });
});
