import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './ReportsPage';
import { api } from '../api/client';

vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../api/client', () => ({ api: { getItems: vi.fn(), getDepartments: vi.fn(), getLocations: vi.fn() } }));

const registration = (code: string, status: string, balance: { total: number; issued: number; available: number; pending: number }) => ({
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
  history: [],
  balance,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getItems).mockResolvedValue([
    registration('IN-STORE', 'AVAILABLE', { total: 4, issued: 0, available: 4, pending: 0 }),
    registration('WITH-STAFF', 'ISSUED', { total: 2, issued: 2, available: 0, pending: 0 }),
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

    expect(await screen.findByText('IN-STORE')).toBeInTheDocument();
    expect(screen.getByText('WITH-STAFF')).toBeInTheDocument();
    expect(screen.queryByText('AWAITING')).not.toBeInTheDocument();
    expect(screen.queryByText('REJECTED')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 registrations · Units: 6 received, 2 issued, 4 in store/)).toBeInTheDocument();

    // The report tabs come before the table's Received column
    await user.click(screen.getAllByRole('button', { name: /^Received/ })[0]);
    expect(screen.queryByText('AWAITING')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 registrations/)).toBeInTheDocument();
  });
});
