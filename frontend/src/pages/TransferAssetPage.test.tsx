import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferAssetPage } from './TransferAssetPage';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: ['transfers.write'] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn(), getDepartments: vi.fn(), getEmployees: vi.fn(), getLocations: vi.fn(), getApprovals: vi.fn(),
    getItemById: vi.fn(), transferItem: vi.fn(), updateTransfer: vi.fn(), registerReturn: vi.fn(),
  },
}));

const store = { id: 'LOC-1', name: 'Central Store', storeId: 'S1', storeName: 'Head office', siteName: 'Head office', roomNumber: 'Central Store' };
const holder = { id: 'E1', fullNameEn: 'Bikila Desta', payrollId: 'MOA/1' };
const receiver = { id: 'E2', fullNameEn: 'Kebede Alemu', payrollId: 'MOA/2' };
const issued = (id: string, name: string, extra: object = {}) => ({
  id, itemCode: `MOA-${id}`, name, status: 'ISSUED', quantity: 1, uom: 'EA', unitCostETB: 1000, category: 'IT_EQUIPMENT',
  currentCustodianId: 'E1', currentCustodian: holder, storeLocationId: 'LOC-1', storeLocation: store, history: [], ...extra,
});
const request = (id: string, type: string, extra: object = {}) => ({
  id, transactionType: type, itemId: 'I1', itemCode: 'MOA-I1', itemName: 'Laptop', ifmisSlipNumber: `M21-${id}`,
  ifmisSlipDateGc: '2026-10-01', ifmisSlipDateEc: '2019-01-21', status: 'PENDING', currentStage: 1,
  createdAtGc: '2026-10-01T10:00:00Z', createdAtEc: '2019-01-21', purposeOrRemarks: '', requestedById: 'enc', ...extra,
});

const requests = [
  request('T1', 'TRANSFER', { recipientEmployeeId: 'E2', recipientEmployee: receiver }),
  request('R1', 'RETURN', { itemId: 'I2', itemCode: 'MOA-I2', itemName: 'Printer', currentStage: 2, createdAtGc: '2026-10-02T10:00:00Z', createdAtEc: '2019-01-22' }),
  request('S1', 'STOCK_OUT', { itemName: 'Toner' }),
];
const rows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['transfers.write'];
  vi.mocked(api.getItems).mockResolvedValue([issued('I1', 'Laptop'), issued('I2', 'Printer'), issued('I3', 'Desk')] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([]);
  vi.mocked(api.getEmployees).mockResolvedValue([holder, receiver] as any);
  vi.mocked(api.getLocations).mockResolvedValue([store] as any);
  vi.mocked(api.getApprovals).mockResolvedValue(requests as any);
});

describe('Transfers page', () => {
  it('lists transfer and return requests only, newest first, with where each asset goes', async () => {
    render(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    expect(await screen.findByText('Printer')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent('Printer');
    expect(rows()[0]).toHaveTextContent('Return');
    expect(rows()[0]).toHaveTextContent('Head office · Central Store');
    expect(rows()[0]).toHaveTextContent('With Dept. Head');
    expect(rows()[1]).toHaveTextContent('Transfer');
    expect(rows()[1]).toHaveTextContent('Kebede Alemu');
    expect(rows()[1]).toHaveTextContent('With Team Leader');
    expect(screen.queryByText('Toner')).not.toBeInTheDocument();
  });

  it('opens the transfer form in a pop-up from "New transfer"', async () => {
    const user = userEvent.setup();
    render(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /New transfer \(Model 21\)/ }));
    const dialog = screen.getByRole('dialog', { name: 'New transfer · Model 21' });
    expect(within(dialog).getByRole('button', { name: 'Submit transfer for approval' })).toBeInTheDocument();
    // Assets with an open request can't be chosen
    await user.click(within(dialog).getByRole('combobox', { name: /Issued asset/ }));
    const options = within(within(dialog).getByRole('listbox')).getAllByRole('option');
    expect(options.find((o) => o.textContent?.includes('Desk'))).not.toHaveAttribute('aria-disabled');
    expect(options.find((o) => o.textContent?.includes('Laptop'))).toHaveAttribute('aria-disabled', 'true');
  });

  it('starts a return by choosing the asset, then opens the return form', async () => {
    const user = userEvent.setup();
    render(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Return to store$/ }));
    const picker = screen.getByRole('dialog', { name: 'Return to store · Model 21' });
    await user.click(within(picker).getByRole('combobox', { name: /Issued asset/ }));
    await user.click(within(picker).getByRole('option', { name: /Desk/ }));
    const form = screen.getByRole('dialog', { name: /Return to store · Model 21 · MOA-I3/ });
    expect(within(form).getByRole('button', { name: 'Submit return for approval' })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: /Choose a different asset/ }));
    expect(screen.getByRole('dialog', { name: 'Return to store · Model 21' })).toBeInTheDocument();
  });

  it('offers Edit only while a request waits for the Team Leader', async () => {
    const user = userEvent.setup();
    render(<TransferAssetPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Actions for MOA-I1 transfer' }));
    expect(screen.getByRole('menuitem', { name: /Edit transfer/ })).not.toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Actions for MOA-I2 return' }));
    expect(screen.getByRole('menuitem', { name: /Edit return/ })).toBeDisabled();
  });

  it('is read-only without permission to request transfers', async () => {
    auth.user.permissions = ['inventory.read'];
    render(<TransferAssetPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    expect(await screen.findByText('Printer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New transfer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Return to store$/ })).not.toBeInTheDocument();
  });
});

describe('ReturnToStoreModal', () => {
  it('opens for an asset given after first rendering without one (as on the Issuing page)', () => {
    const props = { isOpen: false, onClose: vi.fn(), employees: [], onSuccess: vi.fn() };
    const { rerender } = render(<ReturnToStoreModal {...props} item={null} />);
    expect(() => rerender(<ReturnToStoreModal {...props} isOpen item={issued('I3', 'Desk') as any} />)).not.toThrow();
    expect(screen.getByRole('dialog', { name: /Return to store · Model 21 · MOA-I3/ })).toBeInTheDocument();
    // Opened for a given asset, there is no "choose a different asset"
    expect(screen.queryByRole('button', { name: /Choose a different asset/ })).not.toBeInTheDocument();
  });
});
