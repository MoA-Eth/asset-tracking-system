import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './ReportsPage';
import { api } from '../api/client';
import { downloadCsv } from '../utils/csv';

vi.mock('../utils/csv', () => ({ downloadCsv: vi.fn() }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { fullNameEn: 'Test User' } }) }));
vi.mock('../api/client', () => ({ api: { getItems: vi.fn(), getDepartments: vi.fn(), getLocations: vi.fn() } }));

const registration = (code: string, status: string, balance: { total: number; issued: number; available: number; pending: number }, programName?: string) => ({
  id: code,
  itemCode: code,
  name: `Item ${code}`,
  category: 'IT_EQUIPMENT',
  status,
  condition: 'NEW',
  unitCostETB: 1000,
  quantity: balance.total || 1,
  uom: 'EA',
  storeLocationId: 'LOC-01',
  ifmisSlipNumber: `M19-${code}`,
  ifmisSlipDateGc: '2026-10-01',
  createdAtGc: '2026-10-01',
  programName,
  history: [],
  balance,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getItems).mockResolvedValue([
    registration('IN-STORE', 'AVAILABLE', { total: 4, issued: 0, available: 4, pending: 0 }, 'PSNP Resilience'),
    registration('WITH-STAFF', 'ISSUED', { total: 2, issued: 2, available: 0, pending: 0 }, 'FSRP MoA'),
    registration('AWAITING', 'PENDING_STOCK_IN', { total: 50, issued: 0, available: 0, pending: 50 }),
    registration('REJECTED', 'DISPOSED', { total: 0, issued: 0, available: 0, pending: 0 }),
  ] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getLocations).mockResolvedValue([]);
});

describe('Reports count approved assets only', () => {
  it('leaves receipts awaiting approval and rejected receipts out of All Assets and Received', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    // Each code is in its column and, for narrower screens, under the asset's name
    expect(await screen.findAllByText('IN-STORE')).toHaveLength(2);
    expect(screen.getAllByText('WITH-STAFF')).toHaveLength(2);
    expect(screen.queryByText('AWAITING')).not.toBeInTheDocument();
    expect(screen.queryByText('REJECTED')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 registrations · Fixed assets: 6 units \(4 in store, 2 assigned\) · Consumables: 0 items/)).toBeInTheDocument();

    // The report tabs come before the table's Received column
    await user.click(screen.getAllByRole('button', { name: /^Received/ })[0]);
    expect(screen.queryByText('AWAITING')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 registrations/)).toBeInTheDocument();
  });

  it('displays Project column in table and includes project in CSV export', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    // Verify Project column header is present
    expect(await screen.findByRole('button', { name: /^Project$/i })).toBeInTheDocument();

    // Verify project names are displayed in the rows
    expect(screen.getAllByText('PSNP Resilience').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FSRP MoA').length).toBeGreaterThan(0);

    // Click CSV Export button
    const csvBtn = screen.getByRole('button', { name: /CSV/i });
    await user.click(csvBtn);

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, headers, rows] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toContain('MoA_Asset_Report_all_');
    expect(headers).toContain('Project / Program');
    // Ensure the rows contain the project names
    expect(rows[0]).toContain('PSNP Resilience');
    expect(rows[1]).toContain('FSRP MoA');
  });
});
