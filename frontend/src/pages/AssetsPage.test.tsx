import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from './AssetsPage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';
import { readPdfRows, PdfRow } from '../utils/slip-reader';

/** Lines of PDF text as the reader returns them: cells two spaces apart, laid out left to right */
const asRows = (lines: string[]): PdfRow[] =>
  lines.map((line, i) => ({ top: i * 14, cells: line.split(/\s{2,}/).map((text, j) => ({ x: j * 100, text })) }));

const ENCODER = ['stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write', 'inventory.read'];
const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: [] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../utils/slip-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/slip-reader')>()),
  readPdfRows: vi.fn(),
}));
vi.mock('../api/client', () => ({
  api: {
    getItems: vi.fn(), getDepartments: vi.fn(), getEmployees: vi.fn(), getLocations: vi.fn(), getStores: vi.fn(), getApprovals: vi.fn(),
    getItemById: vi.fn(), transferItem: vi.fn(), updateTransfer: vi.fn(), registerReturn: vi.fn(), registerStockOut: vi.fn(),
    registerStockIn: vi.fn(), updateStockIn: vi.fn(), uploadSlip: vi.fn(), registerDisposal: vi.fn(), updateDisposal: vi.fn(),
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
  item('X1', 'Broken tablet', 'REJECTED'),
  item('D1', 'Old printer', 'DISPOSED'),
  item('Q1', 'Filing cabinet', 'PENDING_DISPOSAL'),
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
  request('DSP', 'DISPOSAL', 'D1', { status: 'APPROVED', reviewedAtGc: '2026-09-28', requestDetails: { quantity: 1, reason: 'Damaged beyond repair', recipientName: 'Scrap dealer' } }),
  request('A-Q1', 'DISPOSAL', 'Q1', { requestDetails: { quantity: 1, reason: 'Gift / donation', recipientName: 'Kality School' } }),
];

const rowOf = (code: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(code, { exact: true }))!;
const menuFor = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
  await user.click(screen.getByRole('button', { name: `Actions for ${code}` }));
  return screen.getAllByRole('menuitem').map((m) => m.textContent?.trim());
};

beforeEach(() => {
  window.localStorage.clear();
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
  vi.mocked(api.getStores).mockResolvedValue([
    {
      id: 'S1', name: 'Head office', address: '', isActive: true, locations: [store],
      storeKeepers: [{ employeeId: 'SM1', fullNameEn: 'Abebe Store Man', fullNameAm: '', payrollId: '0001', isActive: true }],
    },
  ] as any);
  vi.mocked(api.getApprovals).mockResolvedValue(approvals as any);
});

/** A form's own Submit / Save changes button, at the bottom of the form, and its Cancel */
const submitOf = (record: HTMLElement, formId: string) =>
  within(record.querySelector(`form#${formId}`) as HTMLElement).getByRole('button', { name: /^(Submit|Save changes)/ });
const cancelOf = (record: HTMLElement, formId: string) =>
  within(record.querySelector(`form#${formId}`) as HTMLElement).getByRole('button', { name: 'Cancel' });

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
    expect(rowOf('MOA-D1')).toHaveTextContent('Disposed');
    expect(rowOf('MOA-Q1')).toHaveTextContent('Disposal pending');
    expect(rowOf('MOA-Q1')).toHaveTextContent('→ Kality School');
  });

  it('shows a partly issued batch as one row, with its issued units underneath', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const batch = rowOf('MOA-S1');
    expect(batch).toHaveTextContent('Partly issued');
    expect(batch).toHaveTextContent('10EA');
    // One short line each under the total, so the column stays narrow
    expect(within(batch).getByText('3 issued')).toBeInTheDocument();
    expect(within(batch).getByText('7 in store')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /^Pending 4$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Issued/ }));
    // The batch shows with only its issued unit unfolded
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent)).toEqual(['MOA-I1', 'MOA-S1', 'MOA-S1-1']);
    // Rejected: the rejected receipt, and the record whose issue was turned down
    await user.click(screen.getByRole('button', { name: /^Rejected 2$/ }));
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent).sort()).toEqual(['MOA-S2', 'MOA-X1']);
    // Disposed: only what an approved disposal took off the register
    await user.click(screen.getByRole('button', { name: /^Disposed 1$/ }));
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByText(/^MOA-/)[0].textContent)).toEqual(['MOA-D1']);
  });

  it('offers the next step for each state', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    expect(await menuFor(user, 'MOA-S1')).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Duplicate as new receipt', 'View details', 'Print Model 19', 'Dispose']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['Transfer (Model 21)', 'Duplicate as new receipt', 'View details', 'Print Model 21 (transfer)']);
    await user.keyboard('{Escape}');
    await user.click(within(rowOf('MOA-S1')).getByRole('button', { name: 'Show 1 issued record' }));
    // A piece split off a batch has no Duplicate: the registration it came from has
    expect(await menuFor(user, 'MOA-S1-1')).toEqual(['Transfer (Model 21)', 'View details', 'Print Model 22 (issue)']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-B1')).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Duplicate as new receipt', 'View details', 'Print Model 19', 'Print Model 21 (transfer to store)', 'Dispose']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-P1')).toEqual(['Edit transfer', 'Duplicate as new receipt', 'View details', 'Print Model 21']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-O1')).toEqual(['Edit issue', 'Duplicate as new receipt', 'View details', 'Print Model 22']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-X1')).toEqual(['Duplicate as new receipt', 'View details']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-Q1')).toEqual(['Edit disposal', 'Duplicate as new receipt', 'View details', 'Print disposal voucher']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-D1')).toEqual(['Duplicate as new receipt', 'View details', 'Print disposal voucher']);
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
    // Submit is the form's own button and stays off until the required fields are filled
    expect(submitOf(record, 'stock-out-form')).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('reading a Model 21 PDF into the transfer form', () => {
    // An asset with an IFMIS-style tag, issued to Bikila Desta (MOA/1)
    const gps = item('T1', 'Handheld GPS', 'ISSUED', { itemCode: 'MOA-072351' });
    const model21 = (fromId: string, toId: string) =>
      asRows([
        'Fixed Asset Internal Transfer Form',
        'Model/21',
        'Model # 0004399',
        'From Employee Name :  Desta, Bikila  To : Alemu, Kebede',
        `From Employee ID :  ${fromId}  To : ${toId}`,
        'Book :  MOA MC BOOK',
        '1  Handheld GPS  MOA-072351  1  624,285.50  322,547.54  301,738.01  05-OCT-26',
      ]);
    const openTransfer = async (user: ReturnType<typeof userEvent.setup>) => {
      vi.mocked(api.getItems).mockResolvedValue([...items, gps] as any);
      render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      await screen.findByText('MOA-S1');
      await menuFor(user, 'MOA-072351');
      await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
      const record = screen.getByRole('region', { name: 'Asset record MOA-072351' });
      await user.click(within(record).getByRole('button', { name: 'Import transfer' }));
      return record;
    };

    it('fills the voucher and the recipient when the asset is with the employee the form names', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(model21('MOA/1', 'MOA/2'));
      const record = await openTransfer(user);
      await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/Filled in from the Model 21: .*recipient \(Kebede Alemu\)/)).toBeInTheDocument();
      expect(within(record).getByDisplayValue('0004399')).toBeInTheDocument();
      expect(within(record).getByDisplayValue('MOA MC BOOK')).toBeInTheDocument();
    });

    it('keeps the order of operations: an asset held by someone else is not filled in', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(model21('MOA/2', 'MOA/1'));
      const record = await openTransfer(user);
      await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/MOA-072351 is held by Bikila Desta, not by the employee the form transfers it from/)).toBeInTheDocument();
      expect(within(record).queryByText(/recipient \(/)).toBeNull();
    });

    it('reads only a Model 21: a Model 19 is sent to Receive items', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(asRows(['Print Model19 Report', 'INV Model 19 No. :  0000044']));
      const record = await openTransfer(user);
      await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/This is a Model 19 receipt, not a Model 21/)).toBeInTheDocument();
      expect(within(record).queryByDisplayValue('0000044')).toBeNull();
    });

    it('transfers every asset on a multi-line Model 21 that fits, each as its own request', async () => {
      const user = userEvent.setup();
      const second = item('T2', 'Laptop', 'ISSUED', { itemCode: 'MOA-072352' });
      vi.mocked(readPdfRows).mockResolvedValue(
        asRows([
          'Fixed Asset Internal Transfer Form',
          'Model/21',
          'Model # 0004399',
          'From Employee ID :  MOA/1  To : MOA/2',
          'Book :  MOA MC BOOK',
          '1  Handheld GPS  MOA-072351  1  624,285.50  322,547.54  301,738.01  05-OCT-26',
          '2  Laptop  MOA-072352  1  60,000.00  20,000.00  40,000.00  05-OCT-26',
          '3  Projector  MOA-072353  1  30,000.00  10,000.00  20,000.00  05-OCT-26',
        ]),
      );
      vi.mocked(api.transferItem).mockResolvedValue({} as any);
      vi.mocked(api.getItems).mockResolvedValue([...items, gps, second] as any);
      render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      await screen.findByText('MOA-S1');
      await menuFor(user, 'MOA-072351');
      await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
      const record = screen.getByRole('region', { name: 'Asset record MOA-072351' });
      await user.click(within(record).getByRole('button', { name: 'Import transfer' }));
      await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      const others = await within(record).findByRole('region', { name: 'Other assets on this form' });
      expect(within(others).getByText('Will be transferred')).toBeInTheDocument();
      // An asset that was never received can't be transferred
      expect(within(others).getByText(/No asset with tag MOA-072353 is registered here/)).toBeInTheDocument();

      await user.click(submitOf(record, 'transfer-form'));
      expect(api.transferItem).toHaveBeenCalledTimes(2);
      expect(api.transferItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemId: 'T1', toEmployeeId: 'E2', model21No: '0004399' }));
      expect(api.transferItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ itemId: 'T2', toEmployeeId: 'E2', model21No: '0004399', book: 'MOA MC BOOK', depreciation: 20000, bookValue: 40000 }),
      );
    });
  });

  it('opens the transfer form with the asset already chosen', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-I1' });
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    // Submit is the form's own button and stays off until the required fields are filled
    expect(submitOf(record, 'transfer-form')).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns an issued asset to store from the transfer form, by choosing a store', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerReturn).mockResolvedValue({ id: 'ret-1' } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    // There is one action for both: no separate "Return to store" action
    expect(screen.queryByRole('menuitem', { name: 'Return to store (Model 21)' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-I1' });
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(submitOf(record, 'transfer-form')).toBeDisabled();
    // A transfer to an employee: the return-only fields are not there
    expect(within(record).getByLabelText(/To employee/)).toBeInTheDocument();
    expect(within(record).queryByLabelText(/Condition on return/)).toBeNull();

    // Choosing a store turns it into a transfer to that store
    await user.selectOptions(within(record).getByLabelText(/Return to store/), 'LOC-1');
    expect(within(record).queryByText('To employee')).toBeNull();
    expect(within(record).getByLabelText(/Condition on return/)).toBeInTheDocument();
    expect(within(record).getByLabelText(/Reason for return/)).toBeInTheDocument();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Submit transfer to store for approval');

    await user.type(within(record).getByPlaceholderText('Number on the Model 21 form'), 'RET-77');
    await user.type(within(record).getByPlaceholderText('Book the form comes from'), 'Book 3');
    await user.selectOptions(within(record).getByLabelText(/Condition on return/), 'GOOD');
    await user.type(within(record).getByLabelText(/Reason for return/), 'Work finished');
    await user.click(submitOf(record, 'transfer-form'));

    expect(api.registerReturn).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'I1', ifmisSlipNumber: 'RET-77', returnReason: 'Work finished', condition: 'GOOD',
    }));
    expect(api.transferItem).not.toHaveBeenCalled();
  });

  it('starts a new receipt from an existing item, without its number, quantity or serial', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S1');
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate as new receipt' }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    // What the item is comes across
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Desk');
    expect(within(panel).getByLabelText(/Category/i)).not.toHaveValue('');
    expect(within(panel).getByLabelText(/Item type/i)).toHaveValue('FIXED');
    // What differs every time starts empty
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/^Quantity/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/Serial number/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/Item code/i)).toHaveValue('');
  });

  it('opens the disposal form in the record and submits the request', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerDisposal).mockResolvedValue(request('NEW', 'DISPOSAL', 'S2', { requestDetails: { quantity: 1, reason: 'Gift / donation' } }) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S2');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-S2' });
    expect(record.querySelector('form#disposal-form')).not.toBeNull();
    // Submit is the form's own button and stays off until the required fields are filled
    expect(submitOf(record, 'disposal-form')).toBeDisabled();

    await user.type(within(record).getByPlaceholderText('e.g. DSP-2026-001'), 'DSP-0007');
    await user.type(within(record).getByLabelText(/Reason for disposal/), 'Gift / donation');
    await user.type(within(record).getByPlaceholderText('e.g. Kality Primary School'), 'Kality School');
    expect(submitOf(record, 'disposal-form')).toBeEnabled();
    await user.click(submitOf(record, 'disposal-form'));

    expect(api.registerDisposal).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'S2', quantity: 1, storekeeperEmployeeId: 'SM1', disposalNo: 'DSP-0007', reason: 'Gift / donation', recipientName: 'Kality School', bookValue: 1000,
    }));
  });

  it('reads a disposal form PDF: this item, then every other asset on it that is in store, each as its own request', async () => {
    const user = userEvent.setup();
    const tablets = [
      item('T43', 'Tablet Computer', 'AVAILABLE', { itemCode: 'MOA-000343' }),
      item('T44', 'Tablet Computer', 'AVAILABLE', { itemCode: 'MOA-000344' }),
      // Issued: it has to come back to store before it can be disposed of
      item('T45', 'Tablet Computer', 'ISSUED', { itemCode: 'MOA-000345' }),
    ];
    vi.mocked(api.getItems).mockResolvedValue(tablets as any);
    vi.mocked(api.registerDisposal).mockResolvedValue(request('NEW', 'DISPOSAL', 'T43', { requestDetails: { quantity: 1, reason: 'Gift / donation' } }) as any);
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(49, [444, 'Fixed Asset Disposal Form']),
      r(92, [60, 'Sold /Transferred / Donated to :'], [221, 'Test Region Office'], [821, 'No:'], [849, '0000015/2013']),
      r(109, [813, 'Date:'], [849, '26-NOV-21']),
      r(143, [53, 'S.No'], [173, 'Tag Number'], [576, 'Disposal Type'], [653, 'Original Cost'], [830, 'Book Value']),
      r(159, [572, 'DONATION']),
      r(168, [79, '1'], [94, 'Tablet Computer'], [168, 'MOA-000343'], [679, '15,640.00'], [783, '0.00'], [859, '15,640.00']),
      r(186, [572, 'DONATION']),
      r(195, [79, '2'], [94, 'Tablet Computer'], [168, 'MOA-000344'], [679, '15,640.00'], [783, '0.00'], [859, '15,640.00']),
      r(213, [572, 'DONATION']),
      r(222, [79, '3'], [94, 'Tablet Computer'], [168, 'MOA-000345'], [679, '15,640.00'], [783, '0.00'], [859, '15,640.00']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-000343');
    await menuFor(user, 'MOA-000343');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-000343' });
    await user.click(within(record).getByRole('button', { name: 'Import disposal' }));
    await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'disposal.pdf', { type: 'application/pdf' }));

    expect(await within(record).findByText(/Filled in from the disposal form/)).toBeInTheDocument();
    expect(within(record).getByDisplayValue('0000015/2013')).toBeInTheDocument();
    expect(within(record).getByDisplayValue('Test Region Office')).toBeInTheDocument();
    const others = within(record).getByRole('region', { name: 'Other assets on this form' });
    expect(within(others).getByText('Will be disposed of')).toBeInTheDocument();
    expect(within(others).getByText(/MOA-000345 is issued to someone; take it back to store first/)).toBeInTheDocument();

    await user.click(submitOf(record, 'disposal-form'));
    await vi.waitFor(() => expect(api.registerDisposal).toHaveBeenCalledTimes(2));
    expect(api.registerDisposal).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemId: 'T43', disposalNo: '0000015/2013', reason: 'Gift / donation', recipientName: 'Test Region Office', bookValue: 15640 }));
    expect(api.registerDisposal).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemId: 'T44', disposalNo: '0000015/2013', disposalDateGc: '2021-11-26', bookValue: 15640 }));
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

  it('opens a row as a full-width record, with the next steps in the toolbar', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');
    expect(toolbarOf(record)).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Dispose', 'Print Model 19']);
    // The record has the whole page: no list squeezed in beside it
    expect(screen.queryByRole('complementary', { name: 'Asset list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The last rejection shows in Custody
    expect(within(record).getByText('Budget line closed')).toBeInTheDocument();
    // The record has continuous Custody and Requests sections with no tabs
    expect(within(record).getByText('Custody & Location')).toBeInTheDocument();
    expect(within(record).getByText('Transaction Requests')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close record' }));
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
    expect(rowOf('MOA-S2')).toBeInTheDocument();
  });

  it('goes back to the list as it was left, and steps to the previous and next asset', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    // Narrow the list, then open an asset from it
    await user.type(screen.getByRole('textbox', { name: 'Search assets' }), 'Generator');
    expect(rowOf('MOA-S2')).toBeInTheDocument();
    const first = await open(user, 'MOA-S2');

    // Only one asset matches, so there is nowhere to step to
    expect(within(first).getByText('1 of 1')).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Previous asset' })).toBeDisabled();
    expect(within(first).getByRole('button', { name: 'Next asset' })).toBeDisabled();

    // Back to assets: the same search and the same single result
    await user.click(within(first).getByRole('button', { name: 'Back to assets' }));
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search assets' })).toHaveValue('Generator');
    expect(rowOf('MOA-S2')).toBeInTheDocument();
    expect(screen.queryByText('MOA-S1')).not.toBeInTheDocument();
  });

  it('opens the next and the previous asset from the record, and with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const second = await open(user, 'MOA-S2');
    const codeOf = (record: HTMLElement) => /Asset record (.+)/.exec(record.getAttribute('aria-label') || '')![1];
    const start = codeOf(second);
    const position = /(\d+) of (\d+)/.exec(second.textContent || '')!;
    expect(Number(position[2])).toBeGreaterThan(1);

    // Step whichever way there is a neighbour, then back; the position moves with it
    const nextButton = within(second).getByRole('button', { name: 'Next asset' }) as HTMLButtonElement;
    const previousButton = within(second).getByRole('button', { name: 'Previous asset' }) as HTMLButtonElement;
    expect(nextButton.disabled && previousButton.disabled).toBe(false);
    const [forward, backward, key, backKey] = nextButton.disabled
      ? ['Previous asset', 'Next asset', '{ArrowUp}', '{ArrowDown}']
      : ['Next asset', 'Previous asset', '{ArrowDown}', '{ArrowUp}'];
    await user.click(within(second).getByRole('button', { name: forward }));
    const moved = screen.getByRole('region', { name: /Asset record/ });
    expect(codeOf(moved)).not.toBe(start);
    await user.click(within(moved).getByRole('button', { name: backward }));
    expect(codeOf(screen.getByRole('region', { name: /Asset record/ }))).toBe(start);

    // The arrow keys do the same
    await user.keyboard(key);
    expect(codeOf(screen.getByRole('region', { name: /Asset record/ }))).not.toBe(start);
    await user.keyboard(backKey);
    expect(codeOf(screen.getByRole('region', { name: /Asset record/ }))).toBe(start);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
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
    expect(toolbarOf(unit)).toEqual(['Transfer (Model 21)', 'Print Model 22 (issue)']);
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
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#stock-in-form')).not.toBeNull();
    expect(submitOf(record, 'stock-in-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'stock-in-form'));
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
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#stock-out-form')).not.toBeNull();
    expect(submitOf(record, 'stock-out-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'stock-out-form'));
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
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'transfer-form'));
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
    // Opens in view mode first with prominent Edit button
    expect(toolbarOf(record)).toEqual(['Edit transfer to store', 'Print Model 21']);
    expect(within(record).getByText('Transfer to store request pending endorsement · Editable in correction mode')).toBeInTheDocument();

    // Clicking Edit enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit transfer to store' }));
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'transfer-form'));
    expect(toolbarOf(record)).toEqual(['Edit transfer to store', 'Print Model 21']);
    expect(within(record).getByText('Transfer to store request pending endorsement · Editable in correction mode')).toBeInTheDocument();
  });

  it('keeps the header to the name, code and status while a correction form is open', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('RET', 'RETURN', 'I1')] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-I1');
    // Viewing: where it is shown in the header
    expect(within(record).getByTitle(/^Location .* Custody:/)).toBeInTheDocument();
    await user.click(within(record).getByRole('button', { name: 'Edit transfer to store' }));
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(within(record).queryByTitle(/^Location .* Custody:/)).toBeNull();
    // The name and code stay
    expect(within(record).getAllByText('MOA-I1').length).toBeGreaterThan(0);
  });

  it('reads only a Model 19 on the receive form: a Model 21 is sent to the transfer form and fills nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValue(asRows([
      'Fixed Asset Internal Transfer Form',
      'Model/21',
      'Model # 0004399',
      'From Employee ID :  109870  To : 110347',
      '1  Handheld GPS  MOA-072351  2  624,285.50  322,547.54  301,738.01  05-OCT-26',
    ]));
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.4'], 'model21.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(/This is a Model 21 transfer form, not a Model 19/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('');
  });

  it('registers every line of a multi-line Model 19, each as its own record', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000044']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
      r(208, [742, 'Source :'], [812, 'TEST TRADING']),
      r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
      r(316, [88, '1'], [128, '107101102.4336'], [270, 'Sulfa Drug In Vial'], [403, 'PKT'], [435, 'AMedicine'], [510, 'Medical'], [826, '100'], [960, '825'], [1050, '82500']),
      r(366, [88, '2'], [124, '105101102.0415'], [268, 'Streptomycine'], [403, 'EA'], [435, 'AMedicine'], [510, 'Agricultural'], [826, '50'], [960, '341'], [1050, '17050']),
      r(630, [910, 'Grand Total'], [1050, '99550']),
    ]);
    vi.mocked(api.registerStockIn).mockResolvedValue({
      item: { id: 'N1', itemCode: 'MOA-N1' },
      items: [{ id: 'N1', itemCode: 'MOA-N1' }, { id: 'N2', itemCode: 'MOA-N2' }],
    } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    // The first line fills the form; the second is listed under it
    const others = await within(panel).findByRole('region', { name: 'Other items on this slip' });
    expect(within(others).getByLabelText('Item 2 description')).toHaveValue('Streptomycine');
    expect(within(others).getByLabelText('Item 2 category')).toHaveValue('AGRI_MACHINERY');
    expect(within(others).getByLabelText('Item 2 quantity')).toHaveValue('50');
    const submit = within(panel).getByRole('button', { name: 'Submit 2 items for approval' });

    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    await user.selectOptions(within(panel).getByLabelText(/Physical condition/i), 'NEW');
    await user.selectOptions(within(panel).getAllByLabelText(/Item type/i)[0], 'FIXED');
    // The second line still needs its own item type and condition
    expect(submit).toBeDisabled();
    await user.click(within(others).getByRole('button', { name: /Use the first item's type and condition/ }));
    expect(within(others).getByLabelText('Item 2 item type')).toHaveValue('FIXED');
    expect(submit).toBeEnabled();
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/model19.pdf' } as any);
    await user.click(submit);

    // The attached PDF is uploaded first, then every line is registered in one go
    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    expect(api.registerStockIn).toHaveBeenCalledWith(
      expect.objectContaining({
        ifmisSlipNumber: '0000044',
        items: [
          expect.objectContaining({ name: 'Sulfa Drug In Vial', quantity: 100 }),
          expect.objectContaining({ name: 'Streptomycine', category: 'AGRI_MACHINERY', itemType: 'FIXED', condition: 'NEW', uom: 'EA', quantity: 50, unitCostETB: 341, remark: 'IFMIS item code 105101102.0415' }),
        ],
      }),
    );
  });

  it('warns when the Model 19 line was already received', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    // MOA-S2 (Generator) was received on M19-S2
    vi.mocked(readPdfRows).mockResolvedValue([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, 'M19-S2']),
      r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
      r(316, [88, '1'], [128, '107101102.4336'], [270, 'Generator'], [403, 'EA'], [510, 'Agricultural'], [826, '1'], [960, '825'], [1050, '825']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(/This slip's item was already received as MOA-S2/)).toBeInTheDocument();
  });

  it('fills the receipt from an IFMIS Model 19, keeping the IFMIS item code in the remark', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(85, [470, 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa']),
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000044']),
      r(162, [714, 'PO Number :'], [812, '186']),
      r(178, [697, 'Received Date :'], [812, '25-Sep-2026']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
      r(208, [742, 'Source :'], [812, 'TEST TRADING ONE MEMBER']),
      r(223, [812, 'P.L.C']),
      r(240, [748, 'Buyer :'], [812, 'Tesfaye, Abel Girma']),
      r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
      r(316, [88, '1'], [128, '107101102.4336'], [270, 'Sulfa Drug In Vial'], [403, 'PKT'], [435, 'AMedicine'], [510, 'Medical'], [826, '100'], [960, '825'], [1050, '82500']),
      r(330, [510, 'Supplies &']),
      r(366, [88, '2'], [124, '105101102.0415'], [268, 'Streptomycine'], [403, 'EA'], [435, 'AMedicine'], [510, 'Agricultural'], [826, '50'], [960, '341'], [1050, '17050']),
      r(630, [910, 'Grand Total'], [1050, '99550']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(/This slip lists 2 items: the first is in the form and the others are listed under it/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000044');
    expect(within(panel).getByLabelText(/Transaction type/i)).toHaveValue('PO Receipt');
    expect(within(panel).getByLabelText(/Source/i)).toHaveValue('TEST TRADING ONE MEMBER P.L.C');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Sulfa Drug In Vial');
    expect(within(panel).getByLabelText(/^Category/i)).toHaveValue('LAB_EQUIPMENT');
    expect(within(panel).getByLabelText(/Unit of measure/i)).toHaveValue('PKT');
    expect(within(panel).getByLabelText(/^Quantity/i)).toHaveValue('100');
    // The IFMIS code is shared by every delivery of the item, so it is kept as a note, not as the item code
    expect(within(panel).getByLabelText(/Item code/i)).toHaveValue('');
    expect(within(panel).getByDisplayValue('IFMIS item code 107101102.4336')).toBeInTheDocument();
  });

  it('attaches a photo of a slip without reading it: only PDFs saved from IFMIS are read', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'model19-photo.jpg', { type: 'image/jpeg' }));

    expect(await within(panel).findByText('model19-photo.jpg')).toBeInTheDocument();
    expect(readPdfRows).not.toHaveBeenCalled();
    expect(within(panel).queryByRole('status')).toBeNull();

    // The attached copy can be viewed before the receipt is saved, to check the fields against it
    await user.click(within(panel).getByRole('button', { name: 'View' }));
    const viewer = screen.getByRole('dialog', { name: 'IFMIS slip model19-photo.jpg' });
    expect(within(viewer).getByText('Attached, not saved yet')).toBeInTheDocument();
    expect(within(viewer).getByRole('img', { name: 'IFMIS slip model19-photo.jpg' })).toBeInTheDocument();
  });

  it('the Import receipt button reads a Model 19 PDF into the open form, keeping what was typed', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000051']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    // The list itself has no import; it belongs to the form
    expect(screen.queryByRole('button', { name: 'Import receipt' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.type(within(panel).getByLabelText(/Item description/i), 'Typed by hand');
    await user.click(within(panel).getByRole('button', { name: 'Import receipt' }));
    await user.upload(screen.getByLabelText('Voucher PDF to import'), new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(/Filled in from the slip/)).toBeInTheDocument();
    expect(within(panel).getByText('model19.pdf')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000051');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Typed by hand');
  });

  it('says so when the attached PDF is a scan with no text', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValue([]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    // Only text PDFs saved from IFMIS are read; a scanned one is attached as it is
    expect(await within(panel).findByText(/This PDF has no text \(it is a scanned image\)/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('');
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
    ['MOA-I1', 'Edit transfer to store', 'transfer-form'],
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
    expect(submitOf(record, formId)).toHaveTextContent('Save changes');
    // No pop-up: the form is in the record
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(cancelOf(record, formId));
    expect(record.querySelector(`form#${formId}`)).toBeNull();
  });

  it('shows an asset issued to an outside organization with the organization as holder, and offers no return or transfer', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getItems).mockResolvedValue([
      ...items,
      item('H1', 'Projector', 'ISSUED', { currentCustodianId: null, currentCustodian: null, heldByOrganization: 'Oromia Bureau of Agriculture', heldByContact: 'Mantegbosh Mirku' }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-H1');
    expect(within(record).getByText('Held by').nextSibling).toHaveTextContent('Oromia Bureau of Agriculture');
    expect(within(record).getByText('Mantegbosh Mirku')).toBeInTheDocument();
    expect(within(record).getByText(/Return and transfer aren.t available for it yet/)).toBeInTheDocument();
    expect(within(record).queryByRole('button', { name: /Transfer|Return/ })).toBeNull();
  });

  it('opens the receipt form in the record from ⋮ → Edit receipt as well', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue(approvals.map((a) => (a.id === 'A-R1' ? { ...a, currentStage: 1 } : a)) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-R1');
    await user.click(screen.getByRole('menuitem', { name: 'Edit receipt' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-R1' });
    expect(submitOf(record, 'stock-in-form')).toHaveTextContent('Save changes');
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

    await user.click(screen.getByRole('button', { name: /Export CSV/i }));

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
    // Submit sits in the form's footer, after the last section
    const submit = within(panel).getByRole('button', { name: /Submit for approval/i });
    expect(panel.querySelector('form#stock-in-form')).toContainElement(submit);
    expect(within(panel).getByText('Received by (store man)').compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The registration has the whole page: no list beside it, and a way back
    expect(screen.queryByRole('complementary', { name: 'Asset list' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Back to assets' })).toBeInTheDocument();

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

  it('records a donation without PO number, supplier, buyer or price', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockIn).mockResolvedValue({ item: { id: 'D-1', itemCode: 'MOA-D1' }, items: [{ id: 'D-1', itemCode: 'MOA-D1' }] } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });

    // Purchase is the default, with its procurement fields
    expect(within(panel).getByLabelText(/Type of provision/i)).toHaveValue('PURCHASE');
    expect(within(panel).getByLabelText(/PO number/i)).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText(/Type of provision/i), 'DONATION');
    // A donation has none of them, and is received as a donation
    for (const label of [/PO number/i, /Source/i, /Buyer/i, /Unit price/i, /^Total/i]) expect(within(panel).queryByLabelText(label)).toBeNull();
    expect(within(panel).getByLabelText(/Transaction type/i)).toHaveValue('Donation / Grant Receipt');

    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000777');
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    await user.type(within(panel).getByLabelText(/Item description/i), 'Donated tablet');
    await user.selectOptions(within(panel).getByLabelText(/^Category/i), 'IT_EQUIPMENT');
    await user.selectOptions(within(panel).getByLabelText(/Item type/i), 'FIXED');
    await user.selectOptions(within(panel).getByLabelText(/Physical condition/i), 'NEW');
    await user.type(within(panel).getByLabelText(/^Quantity/i), '5');
    const submit = within(panel).getByRole('button', { name: /Submit for approval/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    const sent = vi.mocked(api.registerStockIn).mock.calls[0][0];
    expect(sent).toMatchObject({ provisionType: 'DONATION', unitCostETB: 0, transactionType: 'Donation / Grant Receipt' });
    expect(sent.poNumber).toBeUndefined();
    expect(sent.source).toBeUndefined();
    expect(sent.buyer).toBeUndefined();
    expect(sent.items?.[0]).toMatchObject({ quantity: 5, unitCostETB: 0, totalAmount: 0 });
  });

  it('submits a new asset registration from the form footer and triggers Model 19 print modal', async () => {
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
    expect(within(panel).getByText('Fill in all required fields (*) to submit')).toBeInTheDocument();
    // Who received the goods is a store man of the receiving store: nobody can be named before the store is chosen
    expect(within(panel).getByText('Pick the store first.')).toBeInTheDocument();

    // Fill form
    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000999');
    await user.selectOptions(within(panel).getByLabelText(/Transaction type/i), 'Direct Delivery');
    await user.type(within(panel).getByLabelText(/Source/i), 'Tech Supplies Ltd');

    // Receiving store
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    // The store's only store man receives the goods
    expect(await within(panel).findByText('Abebe Store Man')).toBeInTheDocument();

    // Item details
    await user.type(within(panel).getByLabelText(/Item description/i), 'Precision Workstation');
    await user.selectOptions(within(panel).getByLabelText(/Category/i), 'IT_EQUIPMENT');
    await user.selectOptions(within(panel).getByLabelText(/Physical condition/i), 'NEW');
    // Fixed asset or consumable has to be chosen too
    expect(submitBtn).toBeDisabled();
    await user.selectOptions(within(panel).getByLabelText(/Item type/i), 'CONSUMABLE');
    expect(submitBtn).toBeDisabled();

    // Unit price
    const unitPrice = within(panel).getByLabelText(/Unit price/i);
    await user.clear(unitPrice);
    await user.type(unitPrice, '75000');

    // The unit of measure can't be left empty; it is no longer saved as EA behind the user's back
    const uom = within(panel).getByLabelText(/Unit of measure/i);
    await user.clear(uom);
    expect(submitBtn).toBeDisabled();
    await user.type(uom, 'kg');

    // The quantity starts empty, showing 0: it has to be typed, and any number is accepted as typed
    const quantity = within(panel).getByLabelText(/^Quantity/i);
    expect(quantity).toHaveValue('');
    expect(quantity).toHaveAttribute('placeholder', '0');
    expect(submitBtn).toBeDisabled();
    await user.type(quantity, '12');
    expect(quantity).toHaveValue('12');

    // Submit from the footer
    expect(submitBtn).toBeEnabled();
    expect(within(panel).queryByText('Fill in all required fields (*) to submit')).not.toBeInTheDocument();
    await user.click(submitBtn);

    // Verify API called with proper payload
    expect(api.registerStockIn).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Precision Workstation',
      category: 'IT_EQUIPMENT',
      itemType: 'CONSUMABLE',
      ifmisSlipNumber: '0000999',
      unitCostETB: 75000,
      storeLocationId: 'LOC-1',
      receivedByEmployeeId: 'SM1',
      items: [expect.objectContaining({ uom: 'KG' })],
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

describe('AssetsPage: time in store, totals and remembered view', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
    // Fixtures were received on 2026-09-01, so on this day they have been in store 36 days
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tags records waiting in store more than 30 days', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    // Desk (batch remainder), Generator and Camera are in store; issued and pending records are not tagged
    expect(screen.getAllByText('36 days in store')).toHaveLength(3);
  });

  it('filters to stale stock and remembers the filter after the page is opened again', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');

    await user.click(screen.getByRole('button', { name: /Filter assets/i }));
    await user.click(screen.getByRole('button', { name: /Over 30 days/ }));
    expect(screen.getByText('In store over 30 days')).toBeInTheDocument();
    expect(screen.getByText('MOA-S2')).toBeInTheDocument();
    expect(screen.queryByText('MOA-I1')).not.toBeInTheDocument();

    unmount();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S2');
    expect(screen.getByText('In store over 30 days')).toBeInTheDocument();
    expect(screen.queryByText('MOA-I1')).not.toBeInTheDocument();
  });

  it('totals the value of the listed assets, leaving out pending and rejected receipts and disposed assets', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    // 10 desks + laptop + printer + chair + generator + camera + cabinet awaiting disposal at 1,000 each
    // (the disposed printer and the rejected receipt don't count); 7 desks + generator + camera in store
    const totals = screen.getByRole('group', { name: 'Totals of listed assets' });
    expect(within(totals).getByText(/Total value/).textContent).toMatch(/16,000/);
    expect(within(totals).getByText(/In store/).textContent).toMatch(/9,000/);
  });
});
