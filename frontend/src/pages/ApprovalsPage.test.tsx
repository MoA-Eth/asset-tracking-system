import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsPage } from './ApprovalsPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'leader', fullNameEn: 'Getnet Taye', permissions: ['approvals.endorse'] }, role: 'TEAM_LEADER' }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({
  api: { getApprovals: vi.fn(), getEmployees: vi.fn(), handleApproval: vi.fn(), handleSlipApproval: vi.fn() },
}));

const receiptLine = (id: string, name: string, extra: object = {}) => ({
  id, transactionType: 'STOCK_IN', itemId: `item-${id}`, itemCode: `MOA-${id}`, itemName: name, ifmisSlipNumber: '0000051', poNumber: 'PO-14',
  ifmisSlipDateGc: '2026-10-20', ifmisSlipDateEc: '2019-02-10', requestedById: 'encoder', requestedBy: { fullNameEn: 'Encoder' },
  purposeOrRemarks: '', status: 'PENDING', currentStage: 1, totalAmount: 1000, createdAtGc: '2026-10-20', createdAtEc: '2019-02-10', ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getEmployees).mockResolvedValue([]);
  vi.mocked(api.getApprovals).mockResolvedValue([
    receiptLine('A', 'Dell Latitude'),
    receiptLine('B', 'HP Printer'),
    receiptLine('C', 'Toner'),
    // Another PO on the same slip number is another receipt
    receiptLine('D', 'Scanner', { poNumber: 'PO-15' }),
  ] as any);
  vi.mocked(api.handleSlipApproval).mockResolvedValue([] as any);
});

describe('Approvals: one row per Model 19', () => {
  it('shows the lines of one Model 19 and PO as one row, and endorses them together', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);

    const row = (await screen.findByText('3 items')).closest('tr')!;
    expect(within(row).getByText('Dell Latitude, HP Printer +1')).toBeInTheDocument();
    expect(within(row).getByText('PO PO-14')).toBeInTheDocument();
    // The other PO stays its own row
    expect(screen.getByText('MOA-D')).toBeInTheDocument();
    expect(screen.queryByText('MOA-A')).toBeNull();

    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    const lines = screen.getByRole('table', { name: 'Items on this Model 19' });
    expect(within(lines).getAllByRole('row')).toHaveLength(4); // 3 items and the total
    await user.click(screen.getByRole('button', { name: 'Endorse (Stage 1)' }));

    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B', 'C'], action: 'ENDORSE' }));
    expect(api.handleApproval).not.toHaveBeenCalled();
  });

  it('finds a receipt by the name of any of its items', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('3 items');
    await user.type(screen.getByPlaceholderText(/search/i), 'toner');
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.queryByText('MOA-D')).toBeNull();
  });
});

describe('Approvals: a rejection shows why', () => {
  it('shows who rejected, when and the reason on the Rejected tab', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([
      receiptLine('R', 'Office chair', {
        status: 'REJECTED', reviewedBy: { fullNameEn: 'Getnet Taye' }, reviewedAtGc: '2026-10-21',
        reviewRemarks: 'Wrong unit price; register it again',
      }),
    ] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await user.click((await screen.findAllByRole('button', { name: /^Rejected/ }))[0]);
    const row = screen.getByText('Office chair').closest('tr')!;
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
    expect(within(row).getByText('by Getnet Taye · 21 Oct 2026')).toBeInTheDocument();
    expect(within(row).getByText('Reason: Wrong unit price; register it again')).toBeInTheDocument();
  });
});
