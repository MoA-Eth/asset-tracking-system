import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsPage } from './ApprovalsPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';
import { approvalPolicy, OPEN_CORRECTION_EVENT, takePendingCorrection } from '../components/assets/slip-groups';

const auth = vi.hoisted(() => ({ user: { id: 'leader', fullNameEn: 'Getnet Taye', permissions: ['approvals.endorse'] }, role: 'TEAM_LEADER' }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({
  api: { getApprovals: vi.fn(), getEmployees: vi.fn(), handleApproval: vi.fn(), handleSlipApproval: vi.fn(), voidApprovals: vi.fn() },
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

    const row = (await screen.findByText('3 lines')).closest('tr')!;
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
    await screen.findByText('3 lines');
    await user.type(screen.getByPlaceholderText(/search/i), 'toner');
    expect(screen.getByText('3 lines')).toBeInTheDocument();
    expect(screen.queryByText('MOA-D')).toBeNull();
  });

  it('finds a receipt by its item code or batch item codes', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('3 lines');
    await user.type(screen.getByPlaceholderText(/search/i), 'MOA-B');
    expect(screen.getByText('3 lines')).toBeInTheDocument();
    expect(screen.queryByText('MOA-D')).toBeNull();

    await user.clear(screen.getByPlaceholderText(/search/i));
    await user.type(screen.getByPlaceholderText(/search/i), 'MOA-D');
    expect(screen.getByText('MOA-D')).toBeInTheDocument();
    expect(screen.queryByText('3 lines')).toBeNull();
  });

  it('finds a receipt by PO number', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('3 lines');
    await user.type(screen.getByPlaceholderText(/search/i), 'PO-15');
    expect(screen.getByText('MOA-D')).toBeInTheDocument();
    expect(screen.queryByText('3 lines')).toBeNull();
  });

  it('finds a receipt by IFMIS item code', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([
      receiptLine('A', 'Dell Latitude', { ifmisItemCode: '107101102.4336' }),
      receiptLine('D', 'Scanner', { ifmisItemCode: '305101101.0912', poNumber: 'PO-15' }),
    ] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('Dell Latitude');
    await user.type(screen.getByPlaceholderText(/search/i), '107101102.4336');
    expect(screen.getByText('Dell Latitude')).toBeInTheDocument();
    expect(screen.queryByText('Scanner')).toBeNull();
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

    const row = (await screen.findByText('2 lines')).closest('tr')!;
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
  it('offers Reject in the review modal and seamlessly opens the reason dialog if remarks are empty', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('3 lines')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    const modal = screen.getByText(/Stage 1: Team Leader Endorsement/).closest<HTMLElement>('.max-w-2xl')!;
    expect(within(modal).getByRole('button', { name: /Endorse \(Stage 1\)/ })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: /^Reject$/ })).toBeInTheDocument();
    expect(within(modal).getByText(/Optional endorsement remarks recorded in the official audit trail/)).toBeInTheDocument();

    // Clicking Reject with empty remarks transitions seamlessly to the dedicated reject reason dialog
    await user.click(within(modal).getByRole('button', { name: /^Reject$/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Reason for rejecting' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Reject$/ })).toBeDisabled();

    // Canceling out returns back to the review modal
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/Stage 1: Team Leader Endorsement/)).toBeInTheDocument();
  });

  it('rejects straight from the row: only the reason is asked, and the whole Model 19 goes back', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('3 lines')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    // No reason, no rejecting
    expect(within(dialog).getByRole('button', { name: /^Reject$/ })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for rejecting' }), 'Price is entered as USD.');
    await user.click(within(dialog).getByRole('button', { name: /^Reject$/ }));
    expect(api.handleSlipApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalIds: ['A', 'B', 'C'], action: 'REJECT', reviewRemarks: 'Price is entered as USD.' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('allows Stage 2 Department Head to reject from inside the authorization modal with seamless transition', async () => {
    const user = userEvent.setup();
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize'];

    const pendingStage2 = {
      status: 'PENDING',
      currentStage: 2,
      requestedById: 'different-user',
      totalAmount: 50000,
    };
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('STAGE2-1', 'Server Rack', pendingStage2)] as any);

    try {
      render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={vi.fn()} />);
      const row = (await screen.findByText(/Server Rack/)).closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /Authorize/ }));

      const modal = screen.getByText(/Stage 2 Authorization/).closest<HTMLElement>('.max-w-2xl')!;
      expect(within(modal).getByRole('button', { name: /Authorize & Sign-Off/ })).toBeInTheDocument();
      expect(within(modal).getByRole('button', { name: /^Reject$/ })).toBeInTheDocument();

      await user.click(within(modal).getByRole('button', { name: /^Reject$/ }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('textbox', { name: 'Reason for rejecting' })).toBeInTheDocument();
      await user.type(within(dialog).getByRole('textbox', { name: 'Reason for rejecting' }), 'Incorrect store allocation.');
      await user.click(within(dialog).getByRole('button', { name: /^Reject$/ }));
      expect(api.handleApproval).toHaveBeenCalledWith(
        expect.objectContaining({ approvalId: 'STAGE2-1', action: 'REJECT', reviewRemarks: 'Incorrect store allocation.' })
      );
    } finally {
      auth.role = 'TEAM_LEADER';
      auth.user.permissions = ['approvals.endorse'];
    }
  });

  it('lists a rejected receipt, still with its requester, under Rejected, with nothing for the approver to do', async () => {
    const user = userEvent.setup();
    const rejected = { status: 'REJECTED', returnedBy: { fullNameEn: 'Getnet Taye' }, returnedFromStage: 1, returnedAtGc: '2026-10-21', returnRemarks: 'Price is entered as USD.' };
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('A', 'Dell Latitude', rejected), receiptLine('B', 'HP Printer', rejected)] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Returned/ })).toBeNull();
    await user.click((await screen.findAllByRole('button', { name: /^Rejected/ }))[0]);
    const row = screen.getByText('Dell Latitude, HP Printer').closest('tr')!;
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
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

describe('Approvals: voiding an approved request', () => {
  afterEach(() => {
    auth.role = 'TEAM_LEADER';
    auth.user.permissions = ['approvals.endorse'];
  });

  it('allows an authorized user to void an approved voucher with an audit justification', async () => {
    const user = userEvent.setup();
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize', 'approvals.void'];

    const approvedLine = receiptLine('APP1', 'Dell Server', {
      status: 'APPROVED',
      reviewedBy: { fullNameEn: 'Dept Head' },
      reviewedAtGc: '2026-10-21',
    });
    vi.mocked(api.getApprovals).mockResolvedValue([approvedLine] as any);
    vi.mocked(api.voidApprovals).mockResolvedValue({ voidedCount: 1 } as any);

    render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={vi.fn()} />);

    // Switch to Approved tab
    await user.click((await screen.findAllByRole('button', { name: /^Approved History/ }))[0]);
    const row = screen.getByText('Dell Server').closest('tr')!;
    expect(within(row).getByText('Approved')).toBeInTheDocument();

    // Click the Void button on the approved row
    const voidBtn = within(row).getByRole('button', { name: /Void/i });
    expect(voidBtn).toBeInTheDocument();
    await user.click(voidBtn);

    // Void modal opens
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Void Approved Model 19/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Audited Statutory Reversal/i)).toBeInTheDocument();

    // Confirm button is disabled until at least 10 characters are typed
    const confirmBtn = within(dialog).getByRole('button', { name: /Confirm Void & Reversal/i });
    expect(confirmBtn).toBeDisabled();

    // Type a short reason (< 10 chars)
    const reasonInput = within(dialog).getByPlaceholderText(/Explain why this approved voucher is being voided/i);
    await user.type(reasonInput, 'Too short');
    expect(confirmBtn).toBeDisabled();

    // Type valid reason
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Received wrong specifications from supplier; returned.');
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm
    await user.click(confirmBtn);

    expect(api.voidApprovals).toHaveBeenCalledWith(
      ['APP1'],
      'Received wrong specifications from supplier; returned.'
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Transaction Voided',
      expect.stringContaining('Successfully voided Model 19')
    );
  });

  it('renders voided vouchers under the Voided tab with void details', async () => {
    const user = userEvent.setup();
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize', 'approvals.void'];

    const voidedLine = receiptLine('VOID1', 'Cisco Switch', {
      status: 'VOIDED',
      voidDetails: {
        voided: true,
        voidedById: 'dept-head',
        voidedByName: 'Dept Head',
        voidedAtGc: '2026-10-22',
        voidReason: 'Procurement cancelled by ministry directive.',
      },
    });
    vi.mocked(api.getApprovals).mockResolvedValue([voidedLine] as any);

    render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={vi.fn()} />);

    // Click Voided tab
    const voidedTab = (await screen.findAllByRole('button', { name: /^Voided/ }))[0];
    expect(voidedTab).toBeInTheDocument();
    await user.click(voidedTab);

    const row = screen.getByText('Cisco Switch').closest('tr')!;
    expect(within(row).getByText('Voided')).toBeInTheDocument();
    expect(within(row).getByText(/^by Dept Head · 22 Oct/)).toBeInTheDocument();
    expect(within(row).getByText('Procurement cancelled by ministry directive.')).toBeInTheDocument();
  });
});

describe('Approvals: correct a small mistake instead of rejecting', () => {
  it('opens the request in its record, for correction, on the Assets page', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const opened = vi.fn();
    window.addEventListener(OPEN_CORRECTION_EVENT, opened);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={onNavigate} />);
    const row = (await screen.findByText('MOA-D')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onNavigate).toHaveBeenCalledWith('assets');
    expect(opened).toHaveBeenCalled();
    expect(takePendingCorrection(() => true)).toEqual({ itemId: 'item-D', requestId: undefined });
    window.removeEventListener(OPEN_CORRECTION_EVENT, opened);
  });

  it('is not offered on the approver\'s own request', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([receiptLine('D', 'Scanner', { requestedById: 'leader' })] as any);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-D')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Endorse/ }));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('allows Stage 1 Team Leader to click Edit Request from the 3-dot menu', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const opened = vi.fn();
    window.addEventListener(OPEN_CORRECTION_EVENT, opened);
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={onNavigate} />);
    const row = (await screen.findByText('MOA-D')).closest('tr')!;

    // Open kebab 3-dot menu
    await user.click(within(row).getByRole('button', { name: /Actions for/i }));
    const editBtn = screen.getByRole('menuitem', { name: /Edit Request/i });
    expect(editBtn).toBeInTheDocument();
    expect(editBtn).not.toBeDisabled();

    await user.click(editBtn);
    expect(onNavigate).toHaveBeenCalledWith('assets');
    expect(opened).toHaveBeenCalled();
    expect(takePendingCorrection(() => true)).toEqual({ itemId: 'item-D', requestId: undefined });
    window.removeEventListener(OPEN_CORRECTION_EVENT, opened);
  });

  it('allows Stage 2 Department Head to click Edit Request from the 3-dot menu', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const opened = vi.fn();
    window.addEventListener(OPEN_CORRECTION_EVENT, opened);
    auth.role = 'DEPARTMENT_HEAD';
    auth.user.permissions = ['approvals.authorize'];
    vi.mocked(api.getApprovals).mockResolvedValue([
      receiptLine('STAGE2', 'Server Rack', { currentStage: 2, status: 'PENDING', requestedById: 'other-user' }),
    ] as any);

    render(<ApprovalsPage currentRole={UserRole.DEPARTMENT_HEAD} onNavigate={onNavigate} />);
    const row = (await screen.findByText('MOA-STAGE2')).closest('tr')!;

    await user.click(within(row).getByRole('button', { name: /Actions for/i }));
    const editBtn = screen.getByRole('menuitem', { name: /Edit Request/i });
    expect(editBtn).toBeInTheDocument();
    expect(editBtn).not.toBeDisabled();

    await user.click(editBtn);
    expect(onNavigate).toHaveBeenCalledWith('assets');
    expect(opened).toHaveBeenCalled();
    expect(takePendingCorrection(() => true)).toEqual({ itemId: 'item-STAGE2', requestId: undefined });
    window.removeEventListener(OPEN_CORRECTION_EVENT, opened);

    auth.role = 'TEAM_LEADER';
    auth.user.permissions = ['approvals.endorse'];
  });
});

describe('Approvals: table polish and batch valuation', () => {
  it('renders Total (ETB) column, queue summary strip, and expands batch lines', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);

    // Total column header exists
    expect(await screen.findByRole('columnheader', { name: /Total \(ETB\)/i })).toBeInTheDocument();

    // Queue summary strip shows valuation
    expect(screen.getByText(/Queue Valuation:/i)).toBeInTheDocument();

    // Batch lines can be expanded inline
    const expandBtn = screen.getByRole('button', { name: /Batch · 3 lines/i });
    expect(screen.queryByText('Line 1')).toBeNull();
    await user.click(expandBtn);
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
    expect(screen.getByText('Line 3')).toBeInTheDocument();

    // Clicking again collapses the lines
    await user.click(expandBtn);
    expect(screen.queryByText('Line 1')).toBeNull();
  });

  it('shows cumulative valuation in the floating batch action bar when requests are selected', async () => {
    const user = userEvent.setup();
    render(<ApprovalsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);

    await screen.findByText('3 lines');
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is select-all or row checkbox
    await user.click(checkboxes[1]);

    expect(screen.getByText(/Selected Requests/i)).toBeInTheDocument();
    expect(screen.getByText(/Total: ETB/i)).toBeInTheDocument();
  });
});
