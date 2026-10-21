import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsPage } from './ApprovalsPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';
import { approvalPolicy } from '../components/assets/slip-groups';

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

describe('Approvals: one row per Model 22', () => {
  it('shows the lines of one issue as one row, whatever receipt each came from, and endorses them together', async () => {
    const user = userEvent.setup();
    const issueLine = (id: string, name: string, extra: object = {}) =>
      receiptLine(id, name, { transactionType: 'STOCK_OUT', ifmisSlipNumber: '0000201/A', poNumber: undefined, requestDetails: { quantity: 2 }, ...extra });
    vi.mocked(api.getApprovals).mockResolvedValue([
      issueLine('X', 'Toner'),
      issueLine('Y', 'Printer paper'),
      // Another Model 22 is another row
      issueLine('Z', 'Stapler', { ifmisSlipNumber: '0000202/A' }),
    ] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);

    const row = (await screen.findByText('2 items')).closest('tr')!;
    expect(within(row).getByText('Toner, Printer paper')).toBeInTheDocument();
    expect(screen.getByText('MOA-Z')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    const lines = screen.getByRole('table', { name: 'Items on this Model 22' });
    expect(within(lines).getAllByRole('row')).toHaveLength(3); // 2 items and the total
    await user.click(screen.getByRole('button', { name: 'Endorse (Stage 1)' }));
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['X', 'Y'], action: 'ENDORSE' }));
    expect(api.handleApproval).not.toHaveBeenCalled();
  });
});

// Two receipt lines of 6 million birr each: each under 10 million, the receipt above it
const sixMillion = (id: string, name: string) => receiptLine(id, name, { currentStage: 2, totalAmount: 6_000_000, poNumber: 'PO-77', ifmisSlipNumber: '0000077' });

describe('Approvals: with the Chief Director step off, every voucher is the Department Head\'s', () => {
  afterEach(() => {
    auth.role = 'TEAM_LEADER';
    auth.user.permissions = ['approvals.endorse'];
  });

  it('puts a voucher above 10 million in the Department Head\'s queue', async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([sixMillion('P', 'Tractor'), sixMillion('Q', 'Harvester')] as any);
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize'];
    render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('Tractor, Harvester')).closest('tr')!;
    expect(within(row).getByText('2. Dept. Head')).toBeInTheDocument();
    expect(screen.queryByText(/Chief Director \(>10M\)/)).toBeNull();
  });
});

describe('Approvals: the Chief Director signs a voucher by its grand total', () => {
  afterEach(() => {
    auth.role = 'TEAM_LEADER';
    auth.user.permissions = ['approvals.endorse'];
    approvalPolicy.chiefDirectorAboveThreshold = false;
  });
  beforeEach(() => {
    // On for these tests: the step is off in the app for now
    approvalPolicy.chiefDirectorAboveThreshold = true;
    vi.mocked(api.getApprovals).mockResolvedValue([sixMillion('P', 'Tractor'), sixMillion('Q', 'Harvester'), receiptLine('S', 'Laptop', { currentStage: 2, ifmisSlipNumber: '0000078' })] as any);
  });

  it("puts the receipt in the Chief Director's queue, marked for the Chief Director", async () => {
    auth.role = 'CHIEF_DIRECTOR';
    auth.user.permissions = ['approvals.authorize'];
    render(<ApprovalsPage currentRole={UserRole.CHIEF_DIRECTOR} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('Tractor, Harvester')).closest('tr')!;
    expect(within(row).getByText('2. Chief Director (>10M)')).toBeInTheDocument();
    // The small receipt is the Department Head's
    expect(screen.queryByText('Laptop')).toBeNull();
  });

  it("leaves it out of the Department Head's queue", async () => {
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize'];
    render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('Laptop')).closest('tr')!;
    expect(within(row).getByText('2. Dept. Head')).toBeInTheDocument();
    expect(screen.queryByText('Tractor, Harvester')).toBeNull();
  });
});

describe('Approvals: return for correction', () => {
  it('needs a reason, then sends the whole Model 19 back to its requester', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('3 items')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    // Wider than before, to read the voucher's lines
    expect(screen.getByRole('button', { name: /Return for correction/ }).closest('.max-w-2xl')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Return for correction/ }));
    expect(api.handleSlipApproval).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('Reason Required', expect.any(String));

    await user.type(screen.getByPlaceholderText(/Verified asset specifications/), 'Price is entered as USD.');
    await user.click(screen.getByRole('button', { name: /Return for correction/ }));
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B', 'C'], action: 'RETURN', reviewRemarks: 'Price is entered as USD.' }));
    expect(toast.success).toHaveBeenCalledWith('Returned for Correction', expect.stringContaining('went back to Encoder'));
  });

  it('lists a returned receipt with who returned it, when and why, and lets it only be rejected for good', async () => {
    const user = userEvent.setup();
    const returned = { status: 'RETURNED', returnedBy: { fullNameEn: 'Getnet Taye' }, returnedAtGc: '2026-10-21', returnRemarks: 'Price is entered as USD.' };
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('A', 'Dell Latitude', returned), receiptLine('B', 'HP Printer', returned)] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await user.click((await screen.findAllByRole('button', { name: /^Returned/ }))[0]);
    const row = screen.getByText('Dell Latitude, HP Printer').closest('tr')!;
    expect(within(row).getByText('Returned for correction')).toBeInTheDocument();
    expect(within(row).getByText('by Getnet Taye · 21 Oct 2026')).toBeInTheDocument();
    expect(within(row).getByText('Reason: Price is entered as USD.')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Endorse/ })).toBeNull();

    await user.click(within(row).getByRole('button', { name: /Reject/ }));
    expect(screen.queryByRole('button', { name: /Endorse \(Stage 1\)/ })).toBeNull();
    await user.type(screen.getByPlaceholderText(/Verified asset specifications/), 'Not our delivery');
    await user.click(screen.getByRole('button', { name: /Reject for good/ }));
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B'], action: 'REJECT', reviewRemarks: 'Not our delivery' }));
  });
});
