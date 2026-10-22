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
    // By role and a short date; the name, full date and reason on hover
    expect(within(row).getByText(/^by Team Leader · 21 Oct/)).toBeInTheDocument();
    expect(within(row).getByText('Wrong unit price; register it again')).toBeInTheDocument();
    expect(within(row).getByText('Rejected').closest('[title]')).toHaveAttribute('title', 'Getnet Taye · 21 Oct 2026 · Wrong unit price; register it again');
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

describe('Approvals: rejecting', () => {
  it('needs a reason, then sends the whole Model 19 back to its requester; there is no separate Return', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('3 items')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    // The decision window's own Reject (the row has one too); wider than before, to read the voucher's lines
    const modalReject = () => screen.getAllByRole('button', { name: /^Reject$/ }).find((b) => b.closest('.max-w-2xl'))!;
    expect(modalReject()).toBeDefined();
    expect(screen.queryByRole('button', { name: /Return for correction/ })).toBeNull();
    expect(screen.getByText(/goes back to its requester, who corrects and resubmits it, or cancels it/)).toBeInTheDocument();

    await user.click(modalReject());
    expect(api.handleSlipApproval).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Verified asset specifications/), 'Price is entered as USD.');
    await user.click(modalReject());
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B', 'C'], action: 'REJECT', reviewRemarks: 'Price is entered as USD.' }));
    expect(toast.warning).toHaveBeenCalledWith('Transaction Rejected', expect.stringContaining('went back to Encoder with your reason, to correct and resubmit, or cancel'));
  });

  it('rejects straight from the row: only the reason is asked, and the whole Model 19 goes back', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('3 items')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    // No reason, no rejecting
    expect(within(dialog).getByRole('button', { name: /^Reject$/ })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for rejecting' }), 'Price is entered as USD.');
    await user.click(within(dialog).getByRole('button', { name: /^Reject$/ }));
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B', 'C'], action: 'REJECT', reviewRemarks: 'Price is entered as USD.' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lists a rejected receipt, still with its requester, under Rejected, with nothing for the approver to do', async () => {
    const user = userEvent.setup();
    const rejected = { status: 'RETURNED', returnedBy: { fullNameEn: 'Getnet Taye' }, returnedFromStage: 1, returnedAtGc: '2026-10-21', returnRemarks: 'Price is entered as USD.' };
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('A', 'Dell Latitude', rejected), receiptLine('B', 'HP Printer', rejected)] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Returned/ })).toBeNull();
    await user.click((await screen.findAllByRole('button', { name: /^Rejected/ }))[0]);
    const row = screen.getByText('Dell Latitude, HP Printer').closest('tr')!;
    expect(within(row).getByText('Rejected · with requester')).toBeInTheDocument();
    expect(within(row).getByText(/^by Team Leader · 21 Oct/)).toBeInTheDocument();
    expect(within(row).getByText('Price is entered as USD.')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Endorse|Reject/ })).toBeNull();
  });

  it('shows a cancelled request as cancelled by its requester', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('A', 'Dell Latitude', { status: 'CANCELLED', reviewedBy: { fullNameEn: 'Encoder', role: 'DATA_ENCODER' }, reviewedAtGc: '2026-10-22', reviewRemarks: 'Entered twice' })] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await user.click((await screen.findAllByRole('button', { name: /^All Records/ }))[0]);
    const row = screen.getByText('Dell Latitude').closest('tr')!;
    expect(within(row).getByText('Cancelled')).toBeInTheDocument();
    expect(within(row).getByText(/^by the requester · 22 Oct/)).toBeInTheDocument();
    expect(within(row).getByText('Entered twice')).toBeInTheDocument();
  });
});
