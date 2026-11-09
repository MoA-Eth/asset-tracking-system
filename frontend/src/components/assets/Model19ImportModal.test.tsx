import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcelJS from 'exceljs';
import { Model19ImportModal } from './Model19ImportModal';
import { api } from '../../api/client';
import { applySystemSettings } from '../../utils/system-settings';
import { TEMPLATE_COLUMNS } from '../../utils/model19-import';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'EMP-1' } }) }));
vi.mock('../../api/client', () => ({
  api: {
    registerStockIn: vi.fn(),
    getSystemSettings: vi.fn(),
    checkImportDuplicates: vi.fn(),
  },
}));

const stores = [{ id: 'LOC-1', label: 'Saris-Development · Saris' }];

/** A filled-in template: two Model 19s, the second with a line that has no quantity */
const file = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Model 19 lines');
  ws.addRow([...TEMPLATE_COLUMNS]);
  const row = (no: string, po: string, name: string, qty: unknown, price: number) => {
    const r: Record<string, unknown> = {
      'Model 19 No.': no, 'PO No.': po, 'Received Date (G.C.)': '2026-03-26', 'Transaction Type': 'PO Receipt', 'Receiving Store': stores[0].label,
      'IFMIS Item Code': '107101102.0001', 'Item Description': name, UoM: 'EA', Category: 'Office Supplies & Stationery', Quantity: qty, 'Unit Price (ETB)': price, 'VAT 15%': 'No',
    };
    ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ''));
  };
  row('0000101', '201', 'Toner', 4, 1000);
  row('0000101', '201', 'Paper', 10, 500);
  row('0000102', '202', 'Ink', '', 300);
  const buffer = await wb.xlsx.writeBuffer();
  return { name: 'receipts.xlsx', arrayBuffer: async () => buffer } as unknown as File;
};

const choose = async () => {
  render(<Model19ImportModal isOpen onClose={vi.fn()} onImported={onImported} stores={stores} />);
  fireEvent.change(screen.getByLabelText(/Choose the filled-in template/), { target: { files: [await file()] } });
  return screen.findByRole('table', { name: 'Model 19s in the file' });
};
const onImported = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  applySystemSettings({ slipAttachmentPolicy: 'OPTIONAL' });
  vi.mocked(api.registerStockIn).mockResolvedValue({} as any);
  vi.mocked(api.checkImportDuplicates).mockResolvedValue({ conflicts: [], totalDetected: 0, disposedCount: 0, availableCount: 0 });
});

describe('importing Model 19s from Excel', () => {
  it('shows every receipt and its problems by row, and receives only the ready ones', async () => {
    const user = userEvent.setup();
    const preview = await choose();
    expect(preview).toHaveTextContent('0000101');
    expect(preview).toHaveTextContent('Ready');
    expect(preview).toHaveTextContent('Row 4: Quantity must be a number above 0.');
    expect(screen.getByText(/2 Model 19s, 3 lines/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Receive 1 Model 19' }));
    await waitFor(() => expect(api.registerStockIn).toHaveBeenCalledTimes(1));
    // Sent as the receive form sends it: the Model 19 and both its lines
    expect(vi.mocked(api.registerStockIn).mock.calls[0][0]).toMatchObject({
      ifmisSlipNumber: '0000101', poNumber: '201', storeLocationId: 'LOC-1', registeredById: 'EMP-1', items: [{ name: 'Toner', quantity: 4 }, { name: 'Paper', quantity: 10 }],
    });
    expect(await screen.findByText(/Received · waiting for approval/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });

  it('reports a receipt the server refuses, with its reason', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockIn).mockRejectedValue(new Error('Model 19 0000101 is already received.'));
    await choose();
    await user.click(screen.getByRole('button', { name: 'Receive 1 Model 19' }));
    expect(await screen.findByText('Model 19 0000101 is already received.')).toBeInTheDocument();
    expect(screen.getByText('Refused')).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalled();
  });

  it('receives nothing while a scanned slip is required on every receipt', async () => {
    applySystemSettings({ slipAttachmentPolicy: 'REQUIRED' });
    await choose();
    expect(screen.getByText(/A scanned copy of the slip is required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive 1 Model 19' })).toBeDisabled();
  });

  it('rejects csv files and asks for the Excel template', async () => {
    render(<Model19ImportModal isOpen onClose={vi.fn()} onImported={onImported} stores={stores} />);
    const csvFile = { name: 'receipts.csv', type: 'text/csv' } as unknown as File;
    fireEvent.change(screen.getByLabelText(/Choose the filled-in/), { target: { files: [csvFile] } });
    expect(await screen.findByText(/Please upload an Excel workbook \(\.xlsx\)\. CSV files are not supported/)).toBeInTheDocument();
  });

  it('detects duplicate lines within the same Model 19 in the spreadsheet', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Model 19 lines');
    ws.addRow([...TEMPLATE_COLUMNS]);
    const row = (name: string, qty: number, price: number) => {
      const r: Record<string, unknown> = {
        'Model 19 No.': '0000202', 'PO No.': 'PO-99', 'Received Date (G.C.)': '2026-03-26', 'Transaction Type': 'PO Receipt', 'Receiving Store': stores[0].label,
        'IFMIS Item Code': '107101102.0001', 'Item Description': name, UoM: 'EA', Category: 'Office Supplies & Stationery', Quantity: qty, 'Unit Price (ETB)': price, 'VAT 15%': 'No',
      };
      ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ''));
    };
    row('Photocopy Paper A4', 5, 500);
    row('Photocopy  Paper - A4', 10, 500);
    const buffer = await wb.xlsx.writeBuffer();
    const dupFile = { name: 'dup-receipts.xlsx', arrayBuffer: async () => buffer } as unknown as File;

    render(<Model19ImportModal isOpen onClose={vi.fn()} onImported={onImported} stores={stores} />);
    fireEvent.change(screen.getByLabelText(/Choose the filled-in template/), { target: { files: [dupFile] } });
    const preview = await screen.findByRole('table', { name: 'Model 19s in the file' });
    expect(preview).toHaveTextContent(/Duplicates item on Row 2/);
  });

  it('detects database duplicates, auto-excludes disposed assets, and handles available asset prompt resolution', async () => {
    const user = userEvent.setup();
    vi.mocked(api.checkImportDuplicates).mockResolvedValue({
      conflicts: [
        {
          row: 87,
          itemName: 'Office Table',
          unitCostETB: 21673.65,
          matchType: 'DISPOSED',
          existingItemCode: 'MOA-FUR-2026-0007',
          existingItemName: 'Office Table',
          existingStatus: 'DISPOSED',
          disposedDate: 'Oct 2026',
          action: 'AUTO_EXCLUDED',
          message: 'Matches DISPOSED Asset MOA-FUR-2026-0007 (Disposed Oct 2026)',
        },
        {
          row: 387,
          itemName: 'Sensitive Scale',
          unitCostETB: 149500.0,
          matchType: 'AVAILABLE',
          existingItemCode: 'MOA-OFS-2026-0084',
          existingItemName: 'Sensitive Scale',
          existingStatus: 'AVAILABLE',
          storeName: 'Saris Store',
          action: 'PROMPT_USER',
          message: 'Matches AVAILABLE Asset MOA-OFS-2026-0084 in Saris Store',
        },
      ],
      totalDetected: 2,
      disposedCount: 1,
      availableCount: 1,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Model 19 lines');
    ws.addRow([...TEMPLATE_COLUMNS]);
    const addRow = (no: string, name: string, qty: number, price: number) => {
      const r: Record<string, unknown> = {
        'Model 19 No.': no, 'PO No.': 'PO-10', 'Received Date (G.C.)': '2026-03-26', 'Transaction Type': 'PO Receipt', 'Receiving Store': stores[0].label,
        'IFMIS Item Code': '107101102.0001', 'Item Description': name, UoM: 'EA', Category: 'Office Supplies & Stationery', Quantity: qty, 'Unit Price (ETB)': price, 'VAT 15%': 'No',
      };
      ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ''));
    };
    addRow('0000301', 'Printer Cartridge', 2, 800);
    const buffer = await wb.xlsx.writeBuffer();
    const testFile = { name: 'dup-test.xlsx', arrayBuffer: async () => buffer } as unknown as File;

    render(<Model19ImportModal isOpen onClose={vi.fn()} onImported={onImported} stores={stores} />);
    fireEvent.change(screen.getByLabelText(/Choose the filled-in template/), { target: { files: [testFile] } });

    // Header summary
    expect(await screen.findByText(/2 Potential Duplicates Found/)).toBeInTheDocument();

    // Disposed card
    expect(screen.getByText(/Row 87: Office Table/)).toBeInTheDocument();
    expect(screen.getByText(/Matches DISPOSED Asset MOA-FUR-2026-0007 \(Disposed Oct 2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/\[Auto-Excluded - Cannot import disposed item\]/)).toBeInTheDocument();

    // Available card
    expect(screen.getByText(/Row 387: Sensitive Scale/)).toBeInTheDocument();
    expect(screen.getByText(/Matches existing MOA-OFS-2026-0084 in Saris Store/)).toBeInTheDocument();
    expect(screen.getByLabelText(/This is a duplicate \(Already registered\) - Skip row 387/)).toBeChecked();

    // Select Force Import as New Asset
    const forceRadio = screen.getByLabelText(/This is a new, separate unit - Import row 387/);
    await user.click(forceRadio);
    expect(forceRadio).toBeChecked();

    // Apply Resolutions
    await user.click(screen.getByRole('button', { name: 'Apply Resolutions & Continue' }));

    // Now in preview table mode
    expect(await screen.findByRole('table', { name: 'Model 19s in the file' })).toBeInTheDocument();
    // Banner should be visible
    expect(screen.getByText(/2 duplicate conflicts evaluated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Duplicates/ })).toBeInTheDocument();
  });

  it('discards matching re-count rows by default and excludes them from the stock-in payload', async () => {
    const user = userEvent.setup();
    vi.mocked(api.checkImportDuplicates).mockResolvedValue({
      conflicts: [
        {
          row: 3,
          itemName: 'Existing Scale',
          unitCostETB: 5000,
          matchType: 'AVAILABLE',
          existingItemCode: 'MOA-SCL-01',
          existingItemName: 'Existing Scale',
          existingStatus: 'AVAILABLE',
          storeName: 'Saris Store',
          action: 'PROMPT_USER',
          message: 'Matches AVAILABLE Asset MOA-SCL-01 in Saris Store',
        },
      ],
      totalDetected: 1,
      disposedCount: 0,
      availableCount: 1,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Model 19 lines');
    ws.addRow([...TEMPLATE_COLUMNS]);
    const addRow = (name: string, qty: number, price: number) => {
      const r: Record<string, unknown> = {
        'Model 19 No.': '0000401', 'PO No.': 'PO-88', 'Received Date (G.C.)': '2026-03-26', 'Transaction Type': 'PO Receipt', 'Receiving Store': stores[0].label,
        'IFMIS Item Code': '107101102.0001', 'Item Description': name, UoM: 'EA', Category: 'Office Supplies & Stationery', Quantity: qty, 'Unit Price (ETB)': price, 'VAT 15%': 'No',
      };
      ws.addRow(TEMPLATE_COLUMNS.map((c) => r[c] ?? ''));
    };
    addRow('Fresh New Item', 1, 1000); // row 2
    addRow('Existing Scale', 1, 5000);  // row 3 (duplicate)
    const buffer = await wb.xlsx.writeBuffer();
    const testFile = { name: 'discard-test.xlsx', arrayBuffer: async () => buffer } as unknown as File;

    render(<Model19ImportModal isOpen onClose={vi.fn()} onImported={onImported} stores={stores} />);
    fireEvent.change(screen.getByLabelText(/Choose the filled-in template/), { target: { files: [testFile] } });

    expect(await screen.findByText(/1 Potential Duplicates Found/)).toBeInTheDocument();
    // Default is Discard -> Click Apply Resolutions
    await user.click(screen.getByRole('button', { name: 'Apply Resolutions & Continue' }));

    // Verify preview table only has 1 line remaining (Fresh New Item), Row 3 discarded
    expect(await screen.findByRole('table', { name: 'Model 19s in the file' })).toBeInTheDocument();
    expect(screen.getByText(/1 lines/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Receive 1 Model 19' }));
    await waitFor(() => expect(api.registerStockIn).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.registerStockIn).mock.calls[0][0]).toMatchObject({
      items: [{ name: 'Fresh New Item', quantity: 1 }],
    });
  });

  it('allows saving Model 19s as drafts even when a scanned slip is required', async () => {
    const user = userEvent.setup();
    applySystemSettings({ slipAttachmentPolicy: 'REQUIRED' });
    const preview = await choose();

    expect(preview).toHaveTextContent('0000101');
    expect(screen.getByRole('button', { name: 'Receive 1 Model 19' })).toBeDisabled();

    const saveDraftBtn = screen.getByRole('button', { name: 'Save 1 as Draft' });
    expect(saveDraftBtn).not.toBeDisabled();

    await user.click(saveDraftBtn);
    await waitFor(() => expect(api.registerStockIn).toHaveBeenCalledTimes(1));

    expect(vi.mocked(api.registerStockIn).mock.calls[0][0]).toMatchObject({
      action: 'SAVE_AS_DRAFT',
      isDraft: true,
      ifmisSlipNumber: '0000101',
    });
    expect(await screen.findByText(/Saved in Drafts 📝/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Model 19 drafts saved', expect.stringContaining('1 draft is saved in Drafts'));
  });
});
