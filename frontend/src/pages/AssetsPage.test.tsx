import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from './AssetsPage';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

const ENCODER = ['stock-in.write', 'stock-out.write', 'transfers.write', 'inventory.read'];
const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: [] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn(), getDepartments: vi.fn(), getEmployees: vi.fn(), getLocations: vi.fn(), getApprovals: vi.fn(),
    getItemById: vi.fn(), transferItem: vi.fn(), updateTransfer: vi.fn(), registerReturn: vi.fn(), registerStockOut: vi.fn(),
    registerStockIn: vi.fn(), updateStockIn: vi.fn(),
  },
}));

const store = { id: 'LOC-1', name: 'Central Store', storeId: 'S1', storeName: 'Head office', siteName: 'Head office', roomNumber: 'Central Store' };
const holder = { id: 'E1', fullNameEn: 'Bikila Desta', payrollId: 'MOA/1' };
const receiver = { id: 'E2', fullNameEn: 'Kebede Alemu', payrollId: 'MOA/2' };
const item = (id: string, name: string, status: string, extra: object = {}) => ({
  id, itemCode: `MOA-${id}`, name, status, quantity: 1, uom: 'EA', unitCostETB: 1000, category: 'IT_EQUIPMENT',
  ifmisSlipNumber: `M19-${id}`, ifmisSlipDateGc: '2026-09-01', createdAtGc: '2026-09-01T08:00:00Z',
  storeLocationId: 'LOC-1', storeLocation: store, history: [],
  ...(status === 'ISSUED' ? { currentCustodianId: 'E1', currentCustodian: holder } : {}),
  ...extra,
});
const request = (id: string, type: string, itemId: string, extra: object = {}) => ({
  id, transactionType: type, itemId, itemCode: `MOA-${itemId}`, itemName: itemId, ifmisSlipNumber: `REQ-${id}`,
  ifmisSlipDateGc: '2026-10-01', ifmisSlipDateEc: '2019-01-21', status: 'PENDING', currentStage: 1,
  createdAtGc: '2026-10-01T10:00:00Z', createdAtEc: '2019-01-21', purposeOrRemarks: '', requestedById: 'enc', ...extra,
});

// One record in each state an asset passes through
const items = [
  item('R1', 'Scanner', 'PENDING_STOCK_IN'),
  item('S1', 'Desk', 'AVAILABLE', { quantity: 7 }),
  item('S1-1', 'Desk', 'ISSUED', { quantity: 3, parentItemId: 'S1' }),
  item('I1', 'Laptop', 'ISSUED'),
  item('P1', 'Printer', 'ISSUED'),
  item('O1', 'Chair', 'PENDING_STOCK_OUT'),
  item('X1', 'Broken tablet', 'DISPOSED'),
  item('S2', 'Generator', 'AVAILABLE'),
  item('B1', 'Camera', 'AVAILABLE'),
];
const approvals = [
  request('A-R1', 'STOCK_IN', 'R1', { currentStage: 2 }),
  request('A-P1', 'TRANSFER', 'P1', { recipientEmployeeId: 'E2', recipientEmployee: receiver }),
  request('A-O1', 'STOCK_OUT', 'O1', { recipientEmployeeId: 'E2', recipientEmployee: receiver }),
  request('OLD', 'TRANSFER', 'I1', { status: 'APPROVED', reviewedAtGc: '2026-09-20' }),
  // A rejected issue from the batch, then an approved partial issue filed under the unit it created
  request('NO-S1', 'STOCK_OUT', 'S1', { status: 'REJECTED', reviewedAtGc: '2026-09-05', reviewRemarks: 'Wrong slip' }),
  request('ISS', 'STOCK_OUT', 'S1', { status: 'APPROVED', reviewedAtGc: '2026-09-10', requestDetails: { quantity: 3, issuedItemCode: 'MOA-S1-1' } }),
  request('NO', 'STOCK_OUT', 'S2', { status: 'REJECTED', reviewedAtGc: '2026-09-30', reviewRemarks: 'Budget line closed' }),
  request('BACK', 'RETURN', 'B1', { status: 'APPROVED', reviewedAtGc: '2026-09-25' }),
];

const rowOf = (code: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(code, { exact: true }))!;
const menuFor = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
  await user.click(screen.getByRole('button', { name: `Actions for ${code}` }));
  return screen.getAllByRole('menuitem').map((m) => m.textContent?.trim());
};

beforeEach(() => {
  vi.resetAllMocks();
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(vi.fn());
  }
  auth.user.permissions = [...ENCODER];
  vi.mocked(api.getItems).mockResolvedValue(items as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getEmployees).mockResolvedValue([holder, receiver] as any);
  vi.mocked(api.getLocations).mockResolvedValue([store] as any);
  vi.mocked(api.getApprovals).mockResolvedValue(approvals as any);
});

describe('Assets page', () => {
  it('lists each asset with where it is and what it waits for', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    expect(await screen.findByText('MOA-S1')).toBeInTheDocument();
    // The unit issued from MOA-S1 is folded under its batch
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(items.length - 1);
    expect(rowOf('MOA-R1')).toHaveTextContent('Receipt pending');
    expect(rowOf('MOA-R1')).toHaveTextContent('With Dept. Head');
    expect(rowOf('MOA-S2')).toHaveTextContent('In store');
    expect(rowOf('MOA-S2')).toHaveTextContent('Head office · Central Store');
    expect(rowOf('MOA-P1')).toHaveTextContent('Transfer pending');
    expect(rowOf('MOA-P1')).toHaveTextContent('→ Kebede Alemu');
    expect(rowOf('MOA-O1')).toHaveTextContent('Issue pending');
    expect(rowOf('MOA-I1')).toHaveTextContent('Issued');
    expect(rowOf('MOA-X1')).toHaveTextContent('Rejected');
  });

  it('shows a partly issued batch as one row, with its issued units underneath', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const batch = rowOf('MOA-S1');
    expect(batch).toHaveTextContent('Partly issued');
    expect(batch).toHaveTextContent('10EA');
    expect(batch).toHaveTextContent('3 issued · 7 in store');
    expect(batch).toHaveTextContent('3 with Bikila Desta');
    expect(screen.queryByText('MOA-S1-1')).not.toBeInTheDocument();

    await user.click(within(batch).getByRole('button', { name: 'Show 1 issued record' }));
    expect(rowOf('MOA-S1-1')).toHaveTextContent('Issued');
    expect(rowOf('MOA-S1-1')).toHaveTextContent('Bikila Desta');
    await user.click(within(rowOf('MOA-S1')).getByRole('button', { name: 'Hide 1 issued record' }));
    expect(screen.queryByText('MOA-S1-1')).not.toBeInTheDocument();
  });

  it('unfolds a batch when a search finds one of its units', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.type(screen.getByRole('textbox', { name: 'Search assets' }), 'MOA-S1-1');
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent)).toEqual(['MOA-S1', 'MOA-S1-1']);
  });

  it('says why the last request was rejected, until a new one is made', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(rowOf('MOA-S2')).toHaveTextContent('In store');
    expect(rowOf('MOA-S2')).toHaveTextContent('Issue rejected · 30 Sept 2026');
    expect(rowOf('MOA-S2')).toHaveTextContent('Budget line closed');
    // Approved requests leave no note
    expect(rowOf('MOA-I1')).not.toHaveTextContent('rejected');
    // The batch's later issue was approved (its record is the unit it created), so the old rejection is gone
    expect(rowOf('MOA-S1')).not.toHaveTextContent('rejected');
  });

  it('filters by state and counts each filter', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const filterBtn = screen.getByRole('button', { name: /Filter assets/i });
    await user.click(filterBtn);
    expect(screen.getByRole('button', { name: /^Pending 3$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Issued/ }));
    // The batch shows with only its issued unit unfolded
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent)).toEqual(['MOA-I1', 'MOA-S1', 'MOA-S1-1']);
    // Rejected: the rejected receipt, and the record whose issue was turned down
    await user.click(screen.getByRole('button', { name: /^Rejected 2$/ }));
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent).sort()).toEqual(['MOA-S2', 'MOA-X1']);
  });

  it('offers the next step for each state', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    expect(await menuFor(user, 'MOA-S1')).toEqual(['Issue (Model 22)', 'View details', 'Print Model 19']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['Transfer (Model 21)', 'Return to store (Model 21)', 'View details', 'Print Model 21 (transfer)']);
    await user.keyboard('{Escape}');
    await user.click(within(rowOf('MOA-S1')).getByRole('button', { name: 'Show 1 issued record' }));
    expect(await menuFor(user, 'MOA-S1-1')).toEqual(['Transfer (Model 21)', 'Return to store (Model 21)', 'View details', 'Print Model 22 (issue)']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-B1')).toEqual(['Issue (Model 22)', 'View details', 'Print Model 19', 'Print Model 21 (return)']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-P1')).toEqual(['Edit transfer', 'View details', 'Print Model 21']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-O1')).toEqual(['Edit issue', 'View details', 'Print Model 22']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-X1')).toEqual(['View details']);
    await user.keyboard('{Escape}');
    // Endorsed by the Team Leader: the receipt can no longer be edited here
    await menuFor(user, 'MOA-R1');
    expect(screen.getByRole('menuitem', { name: /Edit receipt/ })).toBeDisabled();
  });

  it('opens the issue form with the record already chosen', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S1');
    await user.click(screen.getByRole('menuitem', { name: 'Issue (Model 22)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-S1' });
    expect(record.querySelector('form#stock-out-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'stock-out-form');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the transfer form with the asset already chosen', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-I1' });
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'transfer-form');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the return form for the chosen asset', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Return to store (Model 21)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-I1' });
    expect(record.querySelector('form#return-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'return-form');
    // No pop-up dialog: the form is in the record
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is read-only for approvers', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['inventory.read', 'approvals.read', 'approvals.endorse'];
    render(<AssetsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(screen.queryByRole('button', { name: /Receive items/ })).not.toBeInTheDocument();
    expect(await menuFor(user, 'MOA-S1')).toEqual(['View details', 'Print Model 19']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['View details', 'Print Model 21 (transfer)']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-P1')).toEqual(['View details', 'Print Model 21']);
  });
});

describe('Asset record', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
    await user.click(within(rowOf(code)).getByText(code));
    return screen.getByRole('region', { name: `Asset record ${code}` });
  };
  const toolbarOf = (record: HTMLElement) => within(within(record).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent?.trim());

  it('opens a row as a record beside the list, with the next steps in the toolbar', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');
    expect(toolbarOf(record)).toEqual(['Issue (Model 22)', 'Print Model 19']);
    expect(screen.getByRole('complementary', { name: 'Asset list' })).toBeInTheDocument();
    // The last rejection shows in Custody
    expect(within(record).getByText('Budget line closed')).toBeInTheDocument();
    // The record has continuous Custody and Requests sections with no tabs
    expect(within(record).getByText('Custody & Location')).toBeInTheDocument();
    expect(within(record).getByText('Transaction Requests')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close record' }));
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
    expect(rowOf('MOA-S2')).toBeInTheDocument();
  });

  it('shows a batch with its totals and opens an issued unit from Custody', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const batch = await open(user, 'MOA-S1');
    expect(within(batch).getByText('Partly issued')).toBeInTheDocument();
    expect(within(batch).getByText('Received').previousSibling).toHaveTextContent('10');
    await user.click(within(batch).getByRole('button', { name: /MOA-S1-1/ }));

    const unit = screen.getByRole('region', { name: 'Asset record MOA-S1-1' });
    expect(toolbarOf(unit)).toEqual(['Transfer (Model 21)', 'Return to store (Model 21)', 'Print Model 22 (issue)']);
    expect(within(unit).getByRole('button', { name: 'MOA-S1' })).toBeInTheDocument();
    expect(within(unit).getByText('Approved')).toBeInTheDocument();
  });

  it('corrects a receipt in place while it waits for the Team Leader', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue(approvals.map((a) => (a.id === 'A-R1' ? { ...a, currentStage: 1 } : a)) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    // Opens in view mode first with prominent Edit receipt button
    expect(toolbarOf(record)).toEqual(['Edit receipt', 'Print Model 19']);
    expect(within(record).getByText('Receipt pending endorsement · Editable in correction mode')).toBeInTheDocument();

    // Clicking Edit receipt enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit receipt' }));
    expect(toolbarOf(record)).toEqual(['Save', 'Cancel']);
    expect(record.querySelector('form#stock-in-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'stock-in-form');

    // Cancel exits edit mode back to view mode
    await user.click(within(record).getByRole('button', { name: 'Cancel' }));
    expect(toolbarOf(record)).toEqual(['Edit receipt', 'Print Model 19']);
  });

  it('opens a pending issue in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-O1');
    // Opens in view mode first with prominent Edit issue button
    expect(toolbarOf(record)).toEqual(['Edit issue', 'Print Model 22']);
    expect(within(record).getByText('Issue request pending endorsement · Editable in correction mode')).toBeInTheDocument();

    // Clicking Edit issue enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit issue' }));
    expect(toolbarOf(record)).toEqual(['Save', 'Cancel']);
    expect(record.querySelector('form#stock-out-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'stock-out-form');

    // Cancel exits edit mode back to view mode
    await user.click(within(record).getByRole('button', { name: 'Cancel' }));
    expect(toolbarOf(record)).toEqual(['Edit issue', 'Print Model 22']);
    expect(within(record).getByText('Issue request pending endorsement · Editable in correction mode')).toBeInTheDocument();
  });

  it('opens a pending transfer in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-P1');
    // Opens in view mode first with prominent Edit transfer button
    expect(toolbarOf(record)).toEqual(['Edit transfer', 'Print Model 21']);
    expect(within(record).getByText('Transfer request pending endorsement · Editable in correction mode')).toBeInTheDocument();

    // Clicking Edit transfer enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit transfer' }));
    expect(toolbarOf(record)).toEqual(['Save', 'Cancel']);
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'transfer-form');

    // Cancel exits edit mode back to view mode
    await user.click(within(record).getByRole('button', { name: 'Cancel' }));
    expect(toolbarOf(record)).toEqual(['Edit transfer', 'Print Model 21']);
    expect(within(record).getByText('Transfer request pending endorsement · Editable in correction mode')).toBeInTheDocument();
  });

  it('opens a pending return in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    // A pending return on MOA-I1, with the Team Leader
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('RET', 'RETURN', 'I1')] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-I1');
    // Opens in view mode first with prominent Edit return button
    expect(toolbarOf(record)).toEqual(['Edit return', 'Print Model 21']);
    expect(within(record).getByText('Return request pending endorsement · Editable in correction mode')).toBeInTheDocument();

    // Clicking Edit return enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit return' }));
    expect(toolbarOf(record)).toEqual(['Save', 'Cancel']);
    expect(record.querySelector('form#return-form')).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'return-form');

    // Cancel exits edit mode back to view mode
    await user.click(within(record).getByRole('button', { name: 'Cancel' }));
    expect(toolbarOf(record)).toEqual(['Edit return', 'Print Model 21']);
    expect(within(record).getByText('Return request pending endorsement · Editable in correction mode')).toBeInTheDocument();
  });

  it('opens an endorsed stage-2 record in view mode with locked actions and accurate banner', async () => {
    const user = userEvent.setup();
    // MOA-R1 has currentStage: 2 (endorsed by Team Leader, awaiting Dept. Head)
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    // Does not auto-open in edit mode because stage 2 is locked
    expect(record.querySelector('form#stock-in-form')).toBeNull();
    expect(toolbarOf(record)).toEqual(['Edit receipt', 'Print Model 19']);
    expect(within(record).getByRole('button', { name: 'Edit receipt' })).toBeDisabled();
    expect(within(record).getByText('Receipt endorsed · Awaiting Dept. Head approval')).toBeInTheDocument();
  });

  it.each([
    ['MOA-O1', 'Edit issue', 'stock-out-form'],
    ['MOA-P1', 'Edit transfer', 'transfer-form'],
    ['MOA-I1', 'Edit return', 'return-form'],
  ])('⋮ → Edit on %s opens its record with the request form in place', async (code, label, formId) => {
    const user = userEvent.setup();
    // A pending return on MOA-I1, with the Team Leader
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('RET', 'RETURN', 'I1')] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, code);
    await user.click(screen.getByRole('menuitem', { name: label }));

    const record = screen.getByRole('region', { name: `Asset record ${code}` });
    expect(record.querySelector(`form#${formId}`)).not.toBeNull();
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', formId);
    // No pop-up: the form is in the record
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(record).getByRole('button', { name: 'Cancel' }));
    expect(record.querySelector(`form#${formId}`)).toBeNull();
  });

  it('opens the receipt form in the record from ⋮ → Edit receipt as well', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue(approvals.map((a) => (a.id === 'A-R1' ? { ...a, currentStage: 1 } : a)) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-R1');
    await user.click(screen.getByRole('menuitem', { name: 'Edit receipt' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-R1' });
    expect(within(record).getByRole('button', { name: 'Save' })).toHaveAttribute('form', 'stock-in-form');
  });

  it('prints from one icon, listing the vouchers when there are several', async () => {
    const user = userEvent.setup();
    // MOA-S1-1 was issued, then transferred: it has a Model 22 and a Model 21
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('T-S11', 'TRANSFER', 'S1-1', { status: 'APPROVED', reviewedAtGc: '2026-09-15' })] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const batch = await open(user, 'MOA-S1');
    await user.click(within(batch).getByRole('button', { name: /MOA-S1-1/ }));
    const unit = screen.getByRole('region', { name: 'Asset record MOA-S1-1' });

    const print = within(unit).getByRole('button', { name: 'Print a voucher' });
    expect(print).toHaveTextContent('');
    await user.click(print);
    expect(within(within(unit).getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Print Model 22 (issue)',
      'Print Model 21 (transfer)',
    ]);
    await user.keyboard('{Escape}');
    expect(within(unit).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('locks the receipt once the Team Leader has endorsed it', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    expect(within(within(record).getByRole('toolbar')).getByRole('button', { name: 'Edit receipt' })).toBeDisabled();
    expect(within(record).getByText(/The Team Leader has endorsed it/)).toBeInTheDocument();
  });

  it('is read-only for approvers: only printing', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['inventory.read', 'approvals.read', 'approvals.endorse'];
    render(<AssetsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(toolbarOf(await open(user, 'MOA-I1'))).toEqual(['Print Model 21 (transfer)']);
  });

  it('navigates through records with arrow keys and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');
    expect(record).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('region', { name: /Asset record MOA-X1/ })).toBeInTheDocument();

    await user.keyboard('{ArrowUp}');
    expect(await screen.findByRole('region', { name: /Asset record MOA-S2/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
  });

  it('filters by store location and asset category', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    const filterBtn = screen.getByRole('button', { name: /Filter assets/i });
    await user.click(filterBtn);

    const locSelect = screen.getByRole('combobox', { name: 'Filter by store location' });
    const catSelect = screen.getByRole('combobox', { name: 'Filter by asset category' });

    await user.selectOptions(locSelect, 'LOC-1');
    expect(screen.getByText('MOA-S1')).toBeInTheDocument();

    await user.selectOptions(catSelect, 'IT_EQUIPMENT');
    expect(screen.getByText('MOA-S1')).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: /Clear filters/ });
    await user.click(resetBtn);
    expect(locSelect).toHaveValue('ALL');
    expect(catSelect).toHaveValue('ALL');
  });

  it('renders copy buttons and quick action badges on asset record', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');

    const copyBtn = within(record).getByRole('button', { name: 'Copy item code' });
    expect(copyBtn).toBeInTheDocument();
    expect(within(record).getAllByText('IT EQUIPMENT').length).toBeGreaterThanOrEqual(1);
  });

  it('sorts table columns when column headers are clicked and resets', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    // Click Asset column header to sort
    const assetHeader = screen.getByRole('button', { name: 'Asset' });
    await user.click(assetHeader);

    // Click Unit cost header
    const costHeader = screen.getByRole('button', { name: 'Unit cost' });
    await user.click(costHeader);

    // Click again to reverse sort direction
    await user.click(costHeader);

    // Reset sort via clear filters
    const resetBtn = screen.getByRole('button', { name: /Clear filters/ });
    expect(resetBtn).toBeInTheDocument();
    await user.click(resetBtn);
    expect(screen.queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();
  });

  it('exports filtered assets to CSV when Export CSV is clicked', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    expect(exportBtn).toBeInTheDocument();
    await user.click(exportBtn);

    expect(toast.success).toHaveBeenCalledWith(
      'CSV Exported',
      expect.stringMatching(/Exported \d+ asset records/)
    );
  });

  it('displays Clear all filters in the empty state when no assets match and resets on click', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    const searchInput = screen.getByRole('textbox', { name: 'Search assets' });
    await user.type(searchInput, 'NON_EXISTENT_ASSET_XYZ');

    expect(screen.getByText('No assets match')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: 'Clear all filters' });
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);
    expect(await screen.findByText('MOA-S1')).toBeInTheDocument();
    expect(searchInput).toHaveValue('');
  });

  it('displays computed Total valuation in the asset record item details', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');

    expect(within(record).getByText('Total valuation')).toBeInTheDocument();
    expect(within(record).getAllByText(/ETB 1,000/).length).toBeGreaterThanOrEqual(2);
  });

  it('opens sliding panel when "+ Receive items (Model 19)" is clicked, and closes on Cancel, CloseButton, and Escape', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    // Click "+ Receive items (Model 19)" in header
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));

    // Region opens with Fishbowl TitleBar
    const panel = screen.getByRole('region', { name: 'Receive items' });
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText('Receive items · Model 19')).toBeInTheDocument();
    expect(within(panel).getByText('New Delivery')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Submit for approval/i })).toHaveAttribute('form', 'stock-in-form');

    // In split view, the left sidebar renders an icon-only plus button with no inner text
    const sidebar = screen.getByRole('complementary', { name: 'Asset list' });
    const sidebarPlusBtn = within(sidebar).getByRole('button', { name: 'Receive items (Model 19)' });
    expect(sidebarPlusBtn).toBeInTheDocument();
    expect(sidebarPlusBtn.textContent).toBe('');

    // 1. Cancel button closes it
    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Receive items' })).not.toBeInTheDocument();

    // 2. CloseButton closes it
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel2 = screen.getByRole('region', { name: 'Receive items' });
    await user.click(within(panel2).getByRole('button', { name: 'Close registration' }));
    expect(screen.queryByRole('region', { name: 'Receive items' })).not.toBeInTheDocument();

    // 3. Escape key closes it
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    expect(screen.getByRole('region', { name: 'Receive items' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Receive items' })).not.toBeInTheDocument();
  });

  it('submits a new asset registration via the top action bar and triggers Model 19 print modal', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockIn).mockResolvedValue({
      item: { id: 'NEW-ITEM-1', itemCode: 'MOA-NEW-1', name: 'Precision Workstation' } as any,
      items: [{ id: 'NEW-ITEM-1', itemCode: 'MOA-NEW-1', name: 'Precision Workstation' } as any],
    });

    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    const submitBtn = within(panel).getByRole('button', { name: /Submit for approval/i });

    // Submit stays off until every required field is filled
    expect(submitBtn).toBeDisabled();
    expect(within(panel).getByText('8 required fields left')).toBeInTheDocument();
    // The encoder isn't assumed to be the person who received the goods
    expect(within(panel).getByLabelText(/Received by/i)).toHaveValue('');

    // Fill form
    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000999');
    await user.selectOptions(within(panel).getByLabelText(/Transaction type/i), 'Direct Delivery');
    await user.type(within(panel).getByLabelText(/Source/i), 'Tech Supplies Ltd');

    // Receiving store
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');

    // Item details
    await user.type(within(panel).getByLabelText(/Item description/i), 'Precision Workstation');
    await user.selectOptions(within(panel).getByLabelText(/Category/i), 'IT_EQUIPMENT');
    await user.selectOptions(within(panel).getByLabelText(/Physical condition/i), 'NEW');
    expect(submitBtn).toBeDisabled();
    expect(within(panel).getByText('1 required field left')).toHaveAttribute('title', 'Still needed: unit price');

    // Unit price
    const unitPrice = within(panel).getByLabelText(/Unit price/i);
    await user.clear(unitPrice);
    await user.type(unitPrice, '75000');

    // Submit via top toolbar button
    expect(submitBtn).toBeEnabled();
    expect(within(panel).queryByText(/required fields? left/)).not.toBeInTheDocument();
    await user.click(submitBtn);

    // Verify API called with proper payload
    expect(api.registerStockIn).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Precision Workstation',
      category: 'IT_EQUIPMENT',
      ifmisSlipNumber: '0000999',
      unitCostETB: 75000,
      storeLocationId: 'LOC-1',
    }));

    // Success toast shown
    expect(toast.success).toHaveBeenCalledWith(
      'Receipt registered',
      expect.stringContaining('Precision Workstation')
    );

    // Panel is closed
    expect(screen.queryByRole('region', { name: 'Receive items' })).not.toBeInTheDocument();
  });
});

describe('ReturnToStoreModal', () => {
  it('opens for an asset given after first rendering without one', () => {
    const props = { isOpen: false, onClose: vi.fn(), employees: [], onSuccess: vi.fn() };
    const { rerender } = render(<ReturnToStoreModal {...props} item={null} />);
    expect(() => rerender(<ReturnToStoreModal {...props} isOpen item={item('I3', 'Desk', 'ISSUED') as any} />)).not.toThrow();
    expect(screen.getByRole('dialog', { name: /Return to store · Model 21 · MOA-I3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose a different asset/ })).not.toBeInTheDocument();
  });
});
