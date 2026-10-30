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
vi.mock('../../api/client', () => ({ api: { registerStockIn: vi.fn(), getSystemSettings: vi.fn() } }));

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
});
