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
];
const approvals = [
  request('A-R1', 'STOCK_IN', 'R1', { currentStage: 2 }),
  request('A-P1', 'TRANSFER', 'P1', { recipientEmployeeId: 'E2', recipientEmployee: receiver }),
  request('A-O1', 'STOCK_OUT', 'O1', { recipientEmployeeId: 'E2', recipientEmployee: receiver }),
  request('OLD', 'TRANSFER', 'I1', { status: 'APPROVED' }),
];

const rowOf = (code: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(code, { exact: true }))!;
const menuFor = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
  await user.click(screen.getByRole('button', { name: `Actions for ${code}` }));
  return screen.getAllByRole('menuitem').map((m) => m.textContent?.trim());
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = [...ENCODER];
  vi.mocked(api.getItems).mockResolvedValue(items as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getEmployees).mockResolvedValue([holder, receiver] as any);
  vi.mocked(api.getLocations).mockResolvedValue([store] as any);
  vi.mocked(api.getApprovals).mockResolvedValue(approvals as any);
});

describe('Assets page', () => {
  it('lists every record once, with where it is and what it waits for', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    expect(await screen.findByText('MOA-S1')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(items.length);
    expect(rowOf('MOA-R1')).toHaveTextContent('Receipt pending');
    expect(rowOf('MOA-R1')).toHaveTextContent('With Dept. Head');
    expect(rowOf('MOA-S1')).toHaveTextContent('In store');
    expect(rowOf('MOA-S1')).toHaveTextContent('Head office · Central Store');
    expect(rowOf('MOA-S1-1')).toHaveTextContent('Part of MOA-S1');
    expect(rowOf('MOA-S1-1')).toHaveTextContent('Bikila Desta');
    expect(rowOf('MOA-P1')).toHaveTextContent('Transfer pending');
    expect(rowOf('MOA-P1')).toHaveTextContent('→ Kebede Alemu');
    expect(rowOf('MOA-O1')).toHaveTextContent('Issue pending');
    expect(rowOf('MOA-I1')).toHaveTextContent('Issued');
    expect(rowOf('MOA-X1')).toHaveTextContent('Rejected');
  });

  it('filters by state and counts each filter', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(screen.getByRole('button', { name: /^Pending 3$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Issued/ }));
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent)).toEqual(['MOA-I1', 'MOA-S1-1']);
    await user.click(screen.getByRole('button', { name: /^Rejected/ }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('offers the next step for each state', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    expect(await menuFor(user, 'MOA-S1')).toEqual(['Issue (Model 22)', 'View details', 'Print Model 19']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['Transfer (Model 21)', 'Return to store (Model 21)', 'View details']);
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
    const dialog = screen.getByRole('dialog', { name: 'Issue from store · Model 22' });
    expect(within(dialog).getByRole('combobox', { name: /item/i })).toHaveTextContent('MOA-S1');
  });

  it('opens the transfer form with the asset already chosen', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
    const dialog = screen.getByRole('dialog', { name: 'Transfer · Model 21' });
    expect(within(dialog).getByRole('combobox', { name: /Issued asset/ })).toHaveTextContent('MOA-I1');
  });

  it('opens the return form for the chosen asset', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Return to store (Model 21)' }));
    const dialog = screen.getByRole('dialog', { name: /Return to store · Model 21 · MOA-I1/ });
    expect(within(dialog).getByRole('button', { name: 'Submit return for approval' })).toBeInTheDocument();
  });

  it('is read-only for approvers', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['inventory.read', 'approvals.read', 'approvals.endorse'];
    render(<AssetsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(screen.queryByRole('button', { name: /Receive items/ })).not.toBeInTheDocument();
    expect(await menuFor(user, 'MOA-S1')).toEqual(['View details', 'Print Model 19']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['View details']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-P1')).toEqual(['View details', 'Print Model 21']);
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
