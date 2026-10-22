import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from './AssetsPage';
import { applySystemSettings, resetSystemSettings } from '../utils/system-settings';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';
import { readPdfRows, readPdfPages, PdfRow } from '../utils/slip-reader';
import { ocrRows } from '../utils/slip-ocr';

/** Lines of PDF text as the reader returns them: cells two spaces apart, laid out left to right */
const asRows = (lines: string[]): PdfRow[] =>
  lines.map((line, i) => ({ top: i * 14, cells: line.split(/\s{2,}/).map((text, j) => ({ x: j * 100, text })) }));

const ENCODER = ['stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write', 'inventory.read'];
const auth = vi.hoisted(() => ({ user: { id: 'enc', payrollId: 'ENC-1', permissions: [] as string[] } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../utils/slip-reader', async (importOriginal) => {
  const readPdfRows = vi.fn();
  return {
    ...(await importOriginal<typeof import('../utils/slip-reader')>()),
    readPdfRows,
    // The receive form reads pages with their count; by default a one-page PDF with the rows above
    readPdfPages: vi.fn(async (file: File) => ({ rows: await readPdfRows(file), pages: 1, pagesRead: 1 })),
  };
});
// OCR runs in the browser with its own engine: here a scan reads as whatever a test says
vi.mock('../utils/slip-ocr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/slip-ocr')>()),
  ocrRows: vi.fn(async () => []),
}));
vi.mock('../api/client', () => ({
  api: {
    getOrganizations: vi.fn(async () => []), createOrganization: vi.fn(), getItems: vi.fn(), getDepartments: vi.fn(), getEmployees: vi.fn(), getLocations: vi.fn(), getStores: vi.fn(), getApprovals: vi.fn(),
    getItemById: vi.fn(), transferItem: vi.fn(), updateTransfer: vi.fn(), registerReturn: vi.fn(), registerStockOut: vi.fn(),
    registerStockIn: vi.fn(), updateStockIn: vi.fn(), uploadSlip: vi.fn(), registerDisposal: vi.fn(), updateDisposal: vi.fn(), setIfmisTag: vi.fn(),
    resubmitApprovals: vi.fn(), cancelApprovals: vi.fn(),
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
  applySystemSettings({ showScannedSlipField: true });
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

afterAll(() => {
  resetSystemSettings();
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
    expect(batch).toHaveTextContent('10 ea');
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

    // Viewing and printing are on the record, not in this menu
    expect(await menuFor(user, 'MOA-S1')).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Duplicate as new receipt', 'Dispose']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-I1')).toEqual(['Transfer (Model 21)', 'Duplicate as new receipt']);
    await user.keyboard('{Escape}');
    await user.click(within(rowOf('MOA-S1')).getByRole('button', { name: 'Show 1 issued record' }));
    // A piece split off a batch has no Duplicate: the registration it came from has
    expect(await menuFor(user, 'MOA-S1-1')).toEqual(['Transfer (Model 21)']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-B1')).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Duplicate as new receipt', 'Dispose']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-P1')).toEqual(['Edit transfer', 'Duplicate as new receipt']);
    await user.keyboard('{Escape}');
    // A record on a pending issue is still in store: another Model 22 can ask for it until the last approver approves
    expect(await menuFor(user, 'MOA-O1')).toEqual(['Edit issue', 'Issue (Model 22)', 'Duplicate as new receipt']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-X1')).toEqual(['Duplicate as new receipt']);
    await user.keyboard('{Escape}');
    // Its record offers it too: receiving it again is the one thing left to do
    await user.click(rowOf('MOA-X1').querySelector('td')!);
    expect(within(screen.getByRole('toolbar', { name: 'Asset actions' })).getByRole('button', { name: 'Duplicate as new receipt' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close record' }));
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-Q1')).toEqual(['Edit disposal', 'Duplicate as new receipt']);
    await user.keyboard('{Escape}');
    expect(await menuFor(user, 'MOA-D1')).toEqual(['Duplicate as new receipt']);
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
    expect(submitOf(record, 'stock-out-form')).toBeEnabled();
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
      // The Model 21 PDF goes in the box at the top of the form; there is no Import button
      expect(within(record).queryByRole('button', { name: /Import/ })).toBeNull();
      return record;
    };

    it('fills the voucher and the recipient when the asset is with the employee the form names', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(model21('MOA/1', 'MOA/2'));
      const record = await openTransfer(user);
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/Filled in from the Model 21: .*recipient \(Kebede Alemu\)/)).toBeInTheDocument();
      expect(within(record).getByDisplayValue('0004399')).toBeInTheDocument();
      expect(within(record).getByDisplayValue('MOA MC BOOK')).toBeInTheDocument();
    });

    it('fills the vehicle details printed under the table, and shows them', async () => {
      const user = userEvent.setup();
      const at = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
      vi.mocked(readPdfRows).mockResolvedValue([
        ...model21('MOA/1', 'MOA/2'),
        at(222, [262, 'Plate No'], [320, '4-23794'], [435, 'tire no']),
        at(231, [262, 'Engine No'], [300, '1HZ-0641864'], [435, 'R240514711'], [560, 'Remark']),
        at(240, [262, 'Accessory'], [435, 'R240504703'], [560, 'The right side mirror is missing.']),
        at(249, [262, 'jack with handle'], [360, '1'], [435, 'YY0219']),
        at(258, [262, 'key'], [360, '2']),
      ]);
      const record = await openTransfer(user);
      // A GPS is no vehicle: its details are tucked away until there are some
      expect(within(record).queryByRole('region', { name: 'Vehicle details' })).toBeNull();
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/vehicle details \(plate, engine, accessories, 3 tire numbers, remark\)/)).toBeInTheDocument();
      const vehicle = within(record).getByRole('region', { name: 'Vehicle details' });
      expect(within(vehicle).getByDisplayValue('4-23794')).toBeInTheDocument();
      expect(within(vehicle).getByDisplayValue('1HZ-0641864')).toBeInTheDocument();
      expect(within(vehicle).getByDisplayValue('R240514711, R240504703, YY0219')).toBeInTheDocument();
      expect(within(vehicle).getByLabelText(/Jack with handle/)).toHaveValue('1');
      expect(within(vehicle).getByLabelText(/Keys/)).toHaveValue('2');
      expect(within(record).getByDisplayValue('The right side mirror is missing.')).toBeInTheDocument();
    });

    it('keeps the order of operations: an asset held by someone else is not filled in', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(model21('MOA/2', 'MOA/1'));
      const record = await openTransfer(user);
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      expect(await within(record).findByText(/MOA-072351 is held by Bikila Desta, not by the employee the form transfers it from/)).toBeInTheDocument();
      expect(within(record).queryByText(/recipient \(/)).toBeNull();
    });

    it('reads only a Model 21: a Model 19 is sent to Receive items', async () => {
      const user = userEvent.setup();
      vi.mocked(readPdfRows).mockResolvedValue(asRows(['Print Model19 Report', 'INV Model 19 No. :  0000044']));
      const record = await openTransfer(user);
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

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
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      const others = await within(record).findByRole('region', { name: 'Other assets on this form' });
      expect(within(others).getByText('Will be transferred')).toBeInTheDocument();
      // An asset that was never received can't be transferred
      expect(within(others).getByText(/No asset here has the tag MOA-072353/)).toBeInTheDocument();

      // The IFMIS PDF is kept as the copy of every request on the form (until a signed copy is attached)
      vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/model21.pdf' } as any);
      await user.click(submitOf(record, 'transfer-form'));
      expect(api.transferItem).toHaveBeenCalledTimes(2);
      expect(api.transferItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemId: 'T1', toEmployeeId: 'E2', model21No: '0004399', ifmisSlipAttachmentUrl: '/api/uploads/slips/model21.pdf' }));
      expect(api.transferItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ itemId: 'T2', toEmployeeId: 'E2', model21No: '0004399', book: 'MOA MC BOOK', ifmisSlipAttachmentUrl: '/api/uploads/slips/model21.pdf' }),
      );
      // The PDF's depreciation and book value are not taken: they are left to be entered
      expect(vi.mocked(api.transferItem).mock.calls[1][0]).toMatchObject({ depreciation: undefined, bookValue: undefined });
    });

    it('reads a Model 21 to a store man as a return to his store, and returns every asset on it', async () => {
      const user = userEvent.setup();
      const second = item('T2', 'Laptop', 'ISSUED', { itemCode: 'MOA-072352' });
      vi.mocked(readPdfRows).mockResolvedValue(
        asRows([
          'Fixed Asset Internal Transfer Form',
          'Model/21',
          'Model # 0004400',
          'From Employee Name :  Desta, Bikila  To : Man, Abebe Store',
          // 0001: the store man of Head office
          'From Employee ID :  MOA/1  To : 0001',
          'Book :  MOA MC BOOK',
          '1  Handheld GPS  MOA-072351  1  624,285.50  322,547.54  301,738.01  05-OCT-26',
          '2  Laptop  MOA-072352  1  60,000.00  20,000.00  40,000.00  05-OCT-26',
        ]),
      );
      vi.mocked(api.registerReturn).mockResolvedValue({} as any);
      vi.mocked(api.getItems).mockResolvedValue([...items, gps, second] as any);
      render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
      await screen.findByText('MOA-S1');
      await menuFor(user, 'MOA-072351');
      await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
      const record = screen.getByRole('region', { name: 'Asset record MOA-072351' });
      await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

      // Not a transfer to the store man in person: back to his store, received by him
      expect(await within(record).findByText(/return to store \(Head office · Central Store\), received by \(Abebe Store Man\)/)).toBeInTheDocument();
      expect(within(record).queryByText(/recipient \(/)).toBeNull();
      const others = within(record).getByRole('region', { name: 'Other assets on this form' });
      expect(within(others).getByText('Will be returned')).toBeInTheDocument();

      await user.type(within(record).getByLabelText(/Reason for return/), 'Project ended');
      vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/model21.pdf' } as any);
      await user.click(within(record.querySelector('form#transfer-form') as HTMLElement).getByRole('button', { name: /Submit return to store/ }));
      expect(api.transferItem).not.toHaveBeenCalled();
      expect(api.registerReturn).toHaveBeenCalledTimes(2);
      expect(api.registerReturn).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemId: 'T1', model21No: '0004400', returnReason: 'Project ended' }));
      expect(api.registerReturn).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ itemId: 'T2', model21No: '0004400', storeRecipientId: 'SM1', ifmisSlipAttachmentUrl: '/api/uploads/slips/model21.pdf' }),
      );
      expect(vi.mocked(api.registerReturn).mock.calls[1][0]).toMatchObject({ depreciation: undefined, bookValue: undefined });
    });

    describe('an asset IFMIS knows by its own tag number', () => {
      // Received here under a system code; IFMIS names it MOA-016341 on its Model 21
      const truck = item('V1', 'Isuzu Truck', 'ISSUED', { itemCode: 'MOA-VEH-2026-0001' });
      const model21For = (tag: string) =>
        asRows([
          'Fixed Asset Internal Transfer Form',
          'Model/21',
          'Model # 0004400',
          'From Employee Name :  Desta, Bikila  To : Alemu, Kebede',
          'From Employee ID :  MOA/1  To : MOA/2',
          'Book :  MOA MC BOOK',
          `1  Isuzu Truck  ${tag}  1  624,285.50  322,547.54  301,738.01  05-OCT-26`,
        ]);
      const openTruck = async (user: ReturnType<typeof userEvent.setup>, asset: object) => {
        vi.mocked(api.getItems).mockResolvedValue([...items, asset] as any);
        render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
        await screen.findByText('MOA-S1');
        await menuFor(user, 'MOA-VEH-2026-0001');
        await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
        return screen.getByRole('region', { name: 'Asset record MOA-VEH-2026-0001' });
      };

      it('offers to record a tag no asset has on the asset, then reads the form again', async () => {
        const user = userEvent.setup();
        vi.mocked(readPdfRows).mockResolvedValue(model21For('MOA-016341'));
        vi.mocked(api.setIfmisTag).mockResolvedValue({ item: { ...truck, ifmisTagNumber: 'MOA-016341' } } as any);
        const record = await openTruck(user, truck);
        await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

        expect(await within(record).findByText(/No asset here has the tag MOA-016341/)).toBeInTheDocument();
        const prompt = within(record).getByRole('group', { name: 'Unknown IFMIS tag numbers' });
        // The asset the form is open for is offered first
        expect(within(prompt).getByText(/MOA-VEH-2026-0001 · Isuzu Truck/)).toBeInTheDocument();
        await user.click(within(prompt).getByRole('button', { name: 'Save as its IFMIS tag' }));

        expect(api.setIfmisTag).toHaveBeenCalledWith('V1', 'MOA-016341');
        expect(await within(record).findByText(/Filled in from the Model 21: .*recipient \(Kebede Alemu\)/)).toBeInTheDocument();
        expect(within(record).queryByRole('group', { name: 'Unknown IFMIS tag numbers' })).toBeNull();
      });

      it('finds the asset by its IFMIS tag once it has one', async () => {
        const user = userEvent.setup();
        vi.mocked(readPdfRows).mockResolvedValue(model21For('moa-016341'));
        const record = await openTruck(user, { ...truck, ifmisTagNumber: 'MOA-016341' });
        await user.upload(document.querySelector('#transfer-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model21.pdf', { type: 'application/pdf' }));

        expect(await within(record).findByText(/Filled in from the Model 21: .*recipient \(Kebede Alemu\)/)).toBeInTheDocument();
        expect(within(record).queryByRole('group', { name: 'Unknown IFMIS tag numbers' })).toBeNull();
        expect(api.setIfmisTag).not.toHaveBeenCalled();
      });
    });
  });

  it('records the IFMIS tag number on a fixed asset from its record', async () => {
    const user = userEvent.setup();
    const laptop = item('L1', 'Laptop', 'AVAILABLE', { itemCode: 'MOA-IT-2026-0001' });
    vi.mocked(api.getItems).mockResolvedValue([laptop] as any);
    vi.mocked(api.setIfmisTag).mockResolvedValue({ item: { ...laptop, ifmisTagNumber: 'MOA-016342' } } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await user.click(await screen.findByText('MOA-IT-2026-0001'));
    const record = screen.getByRole('region', { name: 'Asset record MOA-IT-2026-0001' });

    await user.click(within(record).getByRole('button', { name: 'Add' }));
    await user.type(within(record).getByRole('textbox', { name: 'IFMIS tag number' }), 'MOA-016342{Enter}');

    expect(api.setIfmisTag).toHaveBeenCalledWith('L1', 'MOA-016342');
    expect(await within(record).findByText('MOA-016342')).toBeInTheDocument();
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
    expect(submitOf(record, 'transfer-form')).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('transfers an issued asset typed in by hand, with no PDF', async () => {
    const user = userEvent.setup();
    vi.mocked(api.transferItem).mockResolvedValue({} as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-I1');
    await user.click(screen.getByRole('menuitem', { name: 'Transfer (Model 21)' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-I1' });

    await user.type(within(record).getByPlaceholderText('Number on the Model 21 form'), 'M21-55');
    await user.type(within(record).getByPlaceholderText('Book the form comes from'), 'Book 2');
    await user.click(within(record).getByRole('combobox', { name: /To employee/ }));
    await user.click(screen.getByRole('option', { name: /Kebede Alemu/ }));
    expect(submitOf(record, 'transfer-form')).toBeEnabled();
    await user.click(submitOf(record, 'transfer-form'));

    await vi.waitFor(() => expect(api.transferItem).toHaveBeenCalledTimes(1));
    expect(api.transferItem).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'I1', toEmployeeId: 'E2', model21No: 'M21-55', book: 'Book 2' }));
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
    expect(submitOf(record, 'transfer-form')).toBeEnabled();
    // A transfer to an employee: the return-only fields are not there
    expect(within(record).getByLabelText(/To employee/)).toBeInTheDocument();
    expect(within(record).queryByLabelText(/Condition on return/)).toBeNull();

    // Choosing a store turns it into a transfer to that store
    await user.selectOptions(within(record).getByLabelText(/Return to store/), 'LOC-1');
    expect(within(record).queryByText('To employee')).toBeNull();
    // Condition is not asked on a return
    expect(within(record).queryByLabelText(/Condition/)).toBeNull();
    expect(within(record).getByLabelText(/Reason for return/)).toBeInTheDocument();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Submit return to store for approval');

    await user.type(within(record).getByPlaceholderText('Number on the Model 21 form'), 'RET-77');
    await user.type(within(record).getByPlaceholderText('Book the form comes from'), 'Book 3');
    await user.type(within(record).getByLabelText(/Reason for return/), 'Work finished');
    await user.click(submitOf(record, 'transfer-form'));

    expect(api.registerReturn).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'I1', ifmisSlipNumber: 'RET-77', returnReason: 'Work finished',
    }));
    expect(vi.mocked(api.registerReturn).mock.calls[0][0].condition).toBeUndefined();
    expect(api.transferItem).not.toHaveBeenCalled();
  });

  it('starts a new receipt from an existing item, without its number, quantity or serial', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getItems).mockResolvedValue(items.map((i) => (i.id === 'S1' ? {
      ...i, transactionType: 'PO Receipt', poNumber: 'PO-2026-014', source: 'Abay Furniture', buyer: 'Kebede Alemu',
      programName: 'Office renewal', deliveredBy: 'Abay driver', vatApplicable: true,
    } : i)) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S1');
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate as new receipt' }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    // The title says what it was copied from; the item keeps its real name
    expect(within(panel).getByRole('heading', { name: 'Duplicate of MOA-S1 · Desk' })).toBeInTheDocument();
    // What the item is comes across
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Desk');
    // So does where it came from and who handed it over
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('PO-2026-014');
    expect(within(panel).getByLabelText(/Program/i)).toHaveValue('Office renewal');
    expect(within(panel).getByLabelText(/Delivered by/i)).toHaveValue('Abay driver');
    expect(within(panel).getByLabelText(/VAT applicable/i)).toBeChecked();
    expect(within(panel).getByLabelText(/Category/i)).not.toHaveValue('');
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Fixed asset');
    // What differs every time starts empty
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('');
    // Quantity is 1 and editable
    expect(within(panel).getByLabelText(/^Quantity/i)).toHaveValue('1');
    expect(within(panel).getByLabelText(/^Quantity/i)).not.toBeDisabled();
    // Serial number is no longer asked on a receipt
    expect(within(panel).queryByLabelText(/Serial number/i)).toBeNull();
    // No tag number is asked: the system gives the record its code
    expect(within(panel).queryByLabelText(/Tag number/i)).toBeNull();
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
    expect(submitOf(record, 'disposal-form')).toBeEnabled();

    await user.type(within(record).getByLabelText(/^No\./), 'DSP-0007');
    // Typed as IFMIS names it; saved in capitals as IFMIS prints it
    await user.type(within(record).getByLabelText(/Disposal type/), 'donation');
    await user.type(within(record).getByLabelText(/Sold \/ transferred \/ donated to/), 'Kality School');
    expect(submitOf(record, 'disposal-form')).toBeEnabled();
    await user.click(submitOf(record, 'disposal-form'));

    expect(api.registerDisposal).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'S2', quantity: 1, storekeeperEmployeeId: 'SM1', disposalNo: 'DSP-0007', reason: 'DONATION', recipientName: 'Kality School', bookValue: 1000,
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
    expect(within(record).queryByRole('button', { name: /Import/ })).toBeNull();
    await user.upload(document.querySelector('#disposal-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'disposal.pdf', { type: 'application/pdf' }));

    expect(await within(record).findByText(/Filled in from the disposal form/)).toBeInTheDocument();
    expect(within(record).getByDisplayValue('0000015/2013')).toBeInTheDocument();
    expect(within(record).getByDisplayValue('Test Region Office')).toBeInTheDocument();
    const others = within(record).getByRole('region', { name: 'Other assets on this form' });
    expect(within(others).getByText('Will be disposed of')).toBeInTheDocument();
    expect(within(others).getByText(/MOA-000345 is issued to someone; take it back to store first/)).toBeInTheDocument();

    // With no signed copy yet, the IFMIS PDF is kept as the copy of every request on the form
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/disposal.pdf' } as any);
    await user.click(submitOf(record, 'disposal-form'));
    await vi.waitFor(() => expect(api.registerDisposal).toHaveBeenCalledTimes(2));
    expect(api.registerDisposal).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemId: 'T43', disposalNo: '0000015/2013', reason: 'DONATION', recipientName: 'Test Region Office', ifmisSlipAttachmentUrl: '/api/uploads/slips/disposal.pdf' }));
    expect(api.registerDisposal).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemId: 'T44', disposalNo: '0000015/2013', disposalDateGc: '2021-11-26', ifmisSlipAttachmentUrl: '/api/uploads/slips/disposal.pdf' }));
    // The form's book value (15,640) is not taken from the PDF
    expect(vi.mocked(api.registerDisposal).mock.calls.map((c: any[]) => c[0].bookValue)).not.toContain(15640);
  });

  it('finds the item on a disposal form by its serial number when its IFMIS tag is not recorded yet', async () => {
    const user = userEvent.setup();
    const laptop = item('L9', 'Lap Top Computer', 'AVAILABLE', { itemCode: 'MOA-IT-2026-0009', serialNumber: '5CG1091THZ', unitCostETB: 80378 });
    vi.mocked(api.getItems).mockResolvedValue([laptop] as any);
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    // As IFMIS prints it: the type above the number, the description wrapped, the tag, serial and figures lower
    vi.mocked(readPdfRows).mockResolvedValue([
      r(132, [604, 'Fixed Asset Disposal Form']),
      r(180, [183, 'Sold /Transferred / Donated to :'], [361, 'East Shawa Zone Agriculture Office/Umer Ahmed'], [1018, 'No:'], [1048, '0001765/2018']),
      r(199, [1008, 'Date:'], [1036, '28-JUL-26']),
      r(233, [175, 'S.No'], [240, 'Asset Description'], [310, 'Tag Number'], [393, 'Serial Number'], [745, 'Disposal Type'], [830, 'Original Cost'], [1027, 'Book Value']),
      r(256, [742, 'TRANSFER']),
      r(257, [203, '1'], [221, 'Lap Top']),
      r(261, [304, 'MOA-004344']),
      r(263, [385, '5CG1091THZ']),
      r(267, [221, 'Computer'], [858, '80,378.00'], [948, '80,378.00'], [1083, '0.00']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-IT-2026-0009');
    await menuFor(user, 'MOA-IT-2026-0009');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-IT-2026-0009' });
    await user.upload(document.querySelector('#disposal-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'disposal.pdf', { type: 'application/pdf' }));

    expect(await within(record).findByText(/Filled in from the disposal form: .*disposal type/)).toBeInTheDocument();
    expect(within(record).queryByText(/Filled in from the disposal form: .*book value/)).toBeNull();
    expect(within(record).getByDisplayValue('0001765/2018')).toBeInTheDocument();
    expect(within(record).getByDisplayValue('TRANSFER')).toBeInTheDocument();
    expect(within(record).getByDisplayValue('East Shawa Zone Agriculture Office/Umer Ahmed')).toBeInTheDocument();
    // The book value stays the item's own cost from its Model 19 (the PDF's 0 is not taken), and can be edited
    expect(within(record).getByLabelText(/Book value/)).not.toHaveValue('0');
    // Found by its serial, so nothing to ask
    expect(within(record).queryByRole('group', { name: 'Unknown IFMIS tag numbers' })).toBeNull();
  });

  it('does not offer an asset the form already names for another line\'s unknown tag', async () => {
    const user = userEvent.setup();
    const laptop = item('L9', 'Lap Top Computer', 'AVAILABLE', { itemCode: 'MOA-IT-2026-0009', serialNumber: '5CG1091THZ' });
    const spare = item('L8', 'Spare Laptop', 'AVAILABLE', { itemCode: 'MOA-IT-2026-0008' });
    vi.mocked(api.getItems).mockResolvedValue([laptop, spare] as any);
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(132, [604, 'Fixed Asset Disposal Form']),
      r(180, [183, 'Sold /Transferred / Donated to :'], [361, 'East Shawa Zone Agriculture Office'], [1018, 'No:'], [1048, '0001765/2018']),
      r(233, [175, 'S.No'], [240, 'Asset Description'], [310, 'Tag Number'], [393, 'Serial Number'], [745, 'Disposal Type'], [830, 'Original Cost'], [1027, 'Book Value']),
      r(257, [203, '1'], [221, 'Lap Top Computer'], [304, 'MOA-004344'], [385, '5CG1091THZ'], [742, 'TRANSFER'], [858, '80,378.00'], [948, '80,378.00'], [1083, '0.00']),
      r(287, [203, '2'], [221, 'Lap Top Computer'], [304, 'MOA-004242'], [385, '5CG1093639'], [742, 'TRANSFER'], [858, '80,378.00'], [948, '80,378.00'], [1083, '0.00']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-IT-2026-0009');
    await menuFor(user, 'MOA-IT-2026-0009');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-IT-2026-0009' });
    await user.upload(document.querySelector('#disposal-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'disposal.pdf', { type: 'application/pdf' }));

    const prompt = await within(record).findByRole('group', { name: 'Unknown IFMIS tag numbers' });
    expect(within(prompt).getByText('MOA-004242')).toBeInTheDocument();
    // This laptop is line 1 (found by its serial), so only the other asset is offered, and none is picked for you
    await user.click(within(prompt).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /MOA-IT-2026-0009/ })).toBeNull();
    expect(screen.getByRole('option', { name: /MOA-IT-2026-0008/ })).toBeInTheDocument();
    expect(within(prompt).getByRole('button', { name: 'Save as its IFMIS tag' })).toBeDisabled();
  });

  it('takes a photo in the IFMIS PDF box: it is kept as the copy and nothing is read from it', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S2');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-S2' });
    const box = document.querySelector('#disposal-form input[type="file"]') as HTMLInputElement;
    expect(box.accept).toMatch(/image\/jpeg/);
    await user.upload(box, new File(['jpeg'], 'model22b-photo.jpg', { type: 'image/jpeg' }));

    expect(await within(record).findByText(/This is a photo\. It is attached .*Nothing was read from it/)).toBeInTheDocument();
    expect(readPdfRows).not.toHaveBeenCalled();
  });

  it('on a disposal form that names this item by an IFMIS tag it lacks, offers to record the tag on it', async () => {
    const user = userEvent.setup();
    const chair = item('C1', 'Office Chair', 'AVAILABLE', { itemCode: 'MOA-OF-2026-0001' });
    vi.mocked(api.getItems).mockResolvedValue([chair] as any);
    vi.mocked(api.setIfmisTag).mockResolvedValue({ item: { ...chair, ifmisTagNumber: 'MOA-000350' } } as any);
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(49, [444, 'Fixed Asset Disposal Form']),
      r(92, [60, 'Sold /Transferred / Donated to :'], [221, 'Test Region Office'], [821, 'No:'], [849, '0000016/2013']),
      r(143, [53, 'S.No'], [173, 'Tag Number'], [576, 'Disposal Type'], [653, 'Original Cost'], [830, 'Book Value']),
      r(159, [572, 'DONATION']),
      r(168, [79, '1'], [94, 'Office Chair'], [168, 'MOA-000350'], [679, '2,500.00'], [783, '0.00'], [859, '2,500.00']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-OF-2026-0001');
    await menuFor(user, 'MOA-OF-2026-0001');
    await user.click(screen.getByRole('menuitem', { name: 'Dispose' }));
    const record = screen.getByRole('region', { name: 'Asset record MOA-OF-2026-0001' });
    await user.upload(document.querySelector('#disposal-form input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'disposal.pdf', { type: 'application/pdf' }));

    expect(await within(record).findByText(/MOA-OF-2026-0001 isn't on this disposal form/)).toBeInTheDocument();
    const prompt = within(record).getByRole('group', { name: 'Unknown IFMIS tag numbers' });
    await user.click(within(prompt).getByRole('button', { name: 'Save as its IFMIS tag' }));

    expect(api.setIfmisTag).toHaveBeenCalledWith('C1', 'MOA-000350');
    // Read again with the tag known: the book value is still not taken from the PDF
    expect(await within(record).findByText(/The form was read|Filled in from the disposal form/)).toBeInTheDocument();
    expect(within(record).queryByText(/Filled in.*book value/)).toBeNull();
  });

  it('is read-only for approvers', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['inventory.read', 'approvals.read', 'approvals.endorse'];
    render(<AssetsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    expect(screen.queryByRole('button', { name: /Receive items/ })).not.toBeInTheDocument();
    // Nothing to do from a row: no menu. The record opens from the row and prints from there
    for (const code of ['MOA-S1', 'MOA-I1', 'MOA-P1']) expect(within(rowOf(code)).queryByRole('button', { name: `Actions for ${code}` })).toBeNull();
    await user.click(within(rowOf('MOA-S1')).getByText('MOA-S1'));
    expect(screen.getByRole('region', { name: 'Asset record MOA-S1' })).toBeInTheDocument();
  });
});

describe('Asset record', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
    await user.click(within(rowOf(code)).getByText(code));
    return screen.getByRole('region', { name: `Asset record ${code}` });
  };
  const toolbarOf = (record: HTMLElement) => within(within(record).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent?.trim());

  it('shows every issue waiting on a record: status, recipients, the record, and one Edit each', async () => {
    const user = userEvent.setup();
    const endale = { id: 'E3', fullNameEn: 'Endale Alebachew', payrollId: 'MOA/3' };
    // 45 inner tubes; two Model 22s of 5 each, both endorsed and with the Department Head, as on production
    vi.mocked(api.getItems).mockResolvedValue([item('T1', 'Inner Tube 7.50 X 16', 'PENDING_STOCK_OUT', { quantity: 45, itemType: 'CONSUMABLE', balance: { total: 45, issued: 0, available: 45, pending: 0, requested: 10 } })] as any);
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('M102', 'STOCK_OUT', 'T1', { ifmisSlipNumber: '0000102', currentStage: 2, createdAtGc: '2026-10-22T08:00:00Z', recipientEmployeeId: 'E2', recipientEmployee: receiver, requestDetails: { quantity: 5 } }),
      request('M195', 'STOCK_OUT', 'T1', { ifmisSlipNumber: '0000195', currentStage: 2, createdAtGc: '2026-10-22T09:00:00Z', recipientEmployeeId: 'E3', recipientEmployee: endale, requestDetails: { quantity: 5 } }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-T1')).closest('tr')!;
    expect(within(row).getByText('2 issues pending')).toBeInTheDocument();
    expect(within(row).getByText('With Dept. Head')).toBeInTheDocument();
    expect(within(row).getByText('→ Kebede Alemu · 5 ea, Endale Alebachew · 5 ea')).toBeInTheDocument();
    const record = await open(user, 'MOA-T1');
    expect(within(record).getByText('2 issue requests are waiting on this record')).toBeInTheDocument();
    expect(within(record).getAllByRole('listitem').find((li) => li.textContent?.startsWith('Model 22 0000195'))).toHaveTextContent('Model 22 0000195 · 5 ea → Endale Alebachew · With Dept. Head');
    // One Edit for each, locked once the Team Leader endorsed it; another Model 22 can still ask for units in store
    expect(toolbarOf(record)).toEqual(['Edit issue 0000102', 'Edit issue 0000195', 'Issue (Model 22)']);
    expect(within(within(record).getByRole('toolbar')).getByRole('button', { name: 'Edit issue 0000195' })).toBeDisabled();
    // The lock says which Model 22 it is about
    expect(within(record).getAllByText(/^Model 22 0000195: The Team Leader has endorsed it/).length).toBeGreaterThan(0);
  });

  it('two issues on one record, one with each approver, say where each one is', async () => {
    vi.mocked(api.getItems).mockResolvedValue([item('T1', 'Inner Tube', 'PENDING_STOCK_OUT', { quantity: 45 })] as any);
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('M1', 'STOCK_OUT', 'T1', { currentStage: 2, recipientEmployee: receiver, requestDetails: { quantity: 5 } }),
      request('M2', 'STOCK_OUT', 'T1', { currentStage: 1, recipientEmployee: holder, requestDetails: { quantity: 2 } }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-T1')).closest('tr')!;
    expect(within(row).getByText(/^1 with (Dept\. Head|Team Leader) · 1 with (Dept\. Head|Team Leader)$/)).toBeInTheDocument();
  });

  it("doesn't show an issue that lost to the one that issued the record", async () => {
    vi.mocked(api.getItems).mockResolvedValue([item('T2', 'Coupon', 'ISSUED')] as any);
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('WON', 'STOCK_OUT', 'T2', { status: 'APPROVED', reviewedAtGc: '2026-10-22' }),
      request('LOST', 'STOCK_OUT', 'T2', { status: 'CANCELLED', reviewedAtGc: '2026-10-22T12:00:00Z', reviewRemarks: 'Nothing left' }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-T2')).closest('tr')!;
    expect(within(row).getByText('Issued')).toBeInTheDocument();
    expect(within(row).queryByText(/cancelled|rejected/i)).toBeNull();
  });

  it('opens a row as a full-width record, with the next steps in the toolbar', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-S2');
    expect(toolbarOf(record)).toEqual(['Issue (Model 22)', 'Transfer (Model 21)', 'Dispose']);
    // The record has the whole page: no list squeezed in beside it
    expect(screen.queryByRole('complementary', { name: 'Asset list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The last rejection shows in Custody
    expect(within(record).getByText('Budget line closed')).toBeInTheDocument();
    // The record has continuous Custody and Requests sections with no tabs
    expect(within(record).getByText('Custody & location')).toBeInTheDocument();
    expect(within(record).getByText('Transaction requests')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close record' }));
    expect(screen.queryByRole('region', { name: /Asset record/ })).not.toBeInTheDocument();
    expect(rowOf('MOA-S2')).toBeInTheDocument();
  });

  it('does not allow editing a rejected batch or record and locks all modification actions', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-X1');

    // Nothing to edit or move: the one action is receiving it again
    expect(within(within(record).getByRole('toolbar', { name: 'Asset actions' })).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Duplicate as new receipt']);
    expect(within(record).queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
    expect(within(record).queryByRole('button', { name: /Add|Change/i })).not.toBeInTheDocument();

    // Clear archived lock banner
    expect(within(record).getByText('Rejected record · Archived')).toBeInTheDocument();
    expect(within(record).getByText(/Rejected batches and records cannot be edited/i)).toBeInTheDocument();
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

    // Closing it goes back to the list: the same search and the same single result
    expect(within(first).queryByRole('button', { name: 'Back to assets' })).toBeNull();
    await user.click(within(first).getByRole('button', { name: 'Close record' }));
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
    expect(toolbarOf(unit)).toEqual(['Transfer (Model 21)']);
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
    expect(toolbarOf(record)).toEqual(['Edit receipt']);
    expect(within(record).getByText('Receipt waiting for the Team Leader')).toBeInTheDocument();

    // Clicking Edit receipt enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit receipt' }));
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#stock-in-form')).not.toBeNull();
    expect(submitOf(record, 'stock-in-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'stock-in-form'));
    expect(toolbarOf(record)).toEqual(['Edit receipt']);
  });

  it('adds an item to a pending receipt while correcting it, on the same Model 19', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue(approvals.map((a) => (a.id === 'A-R1' ? { ...a, currentStage: 1 } : a)) as any);
    vi.mocked(api.updateStockIn).mockResolvedValue({ id: 'R1', itemCode: 'MOA-R1' } as any);
    vi.mocked(api.registerStockIn).mockResolvedValue({ item: { id: 'N1', itemCode: 'MOA-N1' }, items: [{ id: 'N1', itemCode: 'MOA-N1' }] } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    await user.click(within(record).getByRole('button', { name: 'Edit receipt' }));

    await user.click(within(record).getByRole('button', { name: 'Add item' }));
    await user.type(within(record).getByLabelText('Item 2 item code'), '108101101.0007');
    await user.type(within(record).getByLabelText('Item 2 description'), 'Printer toner');
    await user.selectOptions(within(record).getByLabelText('Item 2 category'), 'OFFICE_SUPPLIES');
    await user.type(within(record).getByLabelText('Item 2 unit price'), '4500');
    expect(submitOf(record, 'stock-in-form')).toHaveTextContent('Save changes and add 1 item');
    await user.click(submitOf(record, 'stock-in-form'));

    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    expect(api.updateStockIn).toHaveBeenCalled();
    const sent = vi.mocked(api.registerStockIn).mock.calls[0][0];
    expect(sent.ifmisSlipNumber).toBe(vi.mocked(api.updateStockIn).mock.calls[0][1].ifmisSlipNumber);
    expect(sent.items).toEqual([expect.objectContaining({ name: 'Printer toner', ifmisItemCode: '108101101.0007' })]);
  });

  it('opens a pending issue in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-O1');
    // Opens in view mode first with prominent Edit issue button
    expect(toolbarOf(record)).toEqual(['Edit issue', 'Issue (Model 22)']);
    expect(within(record).getByText('Issue request waiting for the Team Leader')).toBeInTheDocument();

    // Clicking Edit issue enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit issue' }));
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#stock-out-form')).not.toBeNull();
    expect(submitOf(record, 'stock-out-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'stock-out-form'));
    expect(toolbarOf(record)).toEqual(['Edit issue', 'Issue (Model 22)']);
    expect(within(record).getByText('Issue request waiting for the Team Leader')).toBeInTheDocument();
  });

  it('opens a pending transfer in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-P1');
    // Opens in view mode first with prominent Edit transfer button
    expect(toolbarOf(record)).toEqual(['Edit transfer']);
    expect(within(record).getByText('Transfer request waiting for the Team Leader')).toBeInTheDocument();

    // Clicking Edit transfer enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit transfer' }));
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'transfer-form'));
    expect(toolbarOf(record)).toEqual(['Edit transfer']);
    expect(within(record).getByText('Transfer request waiting for the Team Leader')).toBeInTheDocument();
  });

  it('opens a pending return in view mode, and allows editing with Save and Cancel', async () => {
    const user = userEvent.setup();
    // A pending return on MOA-I1, with the Team Leader
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('RET', 'RETURN', 'I1')] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-I1');
    // Opens in view mode first with prominent Edit button
    expect(toolbarOf(record)).toEqual(['Edit return to store']);
    expect(within(record).getByText('Return to store request waiting for the Team Leader')).toBeInTheDocument();

    // Clicking Edit enters edit mode with Save and Cancel
    await user.click(within(record).getByRole('button', { name: 'Edit return to store' }));
    // The form's own Submit and Cancel replace the toolbar while it is open
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(submitOf(record, 'transfer-form')).toHaveTextContent('Save changes');

    // Cancel exits edit mode back to view mode
    await user.click(cancelOf(record, 'transfer-form'));
    expect(toolbarOf(record)).toEqual(['Edit return to store']);
    expect(within(record).getByText('Return to store request waiting for the Team Leader')).toBeInTheDocument();
  });

  it('keeps the header to the name, code and status while a correction form is open', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('RET', 'RETURN', 'I1')] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-I1');
    // Viewing: where it is shown in the header
    expect(within(record).getByTitle(/^Location .* Custody:/)).toBeInTheDocument();
    await user.click(within(record).getByRole('button', { name: 'Edit return to store' }));
    expect(record.querySelector('form#transfer-form')).not.toBeNull();
    expect(within(record).queryByTitle(/^Location .* Custody:/)).toBeNull();
    // The name and code stay
    expect(within(record).getAllByText('MOA-I1').length).toBeGreaterThan(0);
  });

  it.each([
    [
      'a Model 21 transfer form',
      ['Fixed Asset Internal Transfer Form', 'Model/21', 'Model # 0004399', 'From Employee ID :  109870  To : 110347', '1  Handheld GPS  MOA-072351  2  624,285.50  322,547.54  301,738.01  05-OCT-26'],
      /This is a Model 21 transfer form\. Read it on the transfer form of the asset/,
    ],
    [
      'a disposal form',
      ['Fixed Asset Disposal Form', 'Model/22/B', 'No:  0000015/2013', '1  Tablet Computer  MOA-000343  15,640.00  0.00  15,640.00'],
      /This is a Fixed Asset Disposal Form \(Model 22\/B\)\. Read it on the disposal form of the asset/,
    ],
  ])('takes only a Model 19 on the receive form: %s is refused, not attached and fills nothing', async (_label, lines, message) => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValue(asRows(lines));
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.4'], 'other-form.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(message)).toBeInTheDocument();
    expect(within(panel).getByText(/so it was not attached and nothing was filled in/)).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith('Not a Model 19', expect.any(String));
    // Not kept as the receipt's scanned copy
    expect(within(panel).queryByText('other-form.pdf')).toBeNull();
    expect(within(panel).getByText('Click to choose the Model 19 PDF saved from IFMIS, or a photo')).toBeInTheDocument();
    expect(within(panel).getByText('Click to attach the signed Model 19, scanned')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('');
  });

  it('registers every line of a multi-line Model 19, each as its own record', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValue([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000044']),
      r(162, [714, 'PO Number :'], [812, '186']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
      r(208, [742, 'Source :'], [812, 'TEST TRADING']),
      r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [440, 'Sub'], [826, 'Qty']),
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

    // The first line fills the form; the second is row 2
    const others = await within(panel).findByRole('region', { name: 'Items (2)' });
    expect(within(others).getByLabelText('Item 2 description')).toHaveValue('Streptomycine');
    expect(within(others).getByLabelText('Item 2 category')).toHaveValue('AGRI_MACHINERY');
    expect(within(others).getByLabelText('Item 2 quantity')).toHaveValue('50');
    const submit = within(panel).getByRole('button', { name: 'Submit 2 items for approval' });

    // Item type comes from the IFMIS code (starting with 1: consumable)
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Consumable');
    expect(within(others).getByLabelText('Item 2 item type')).toHaveTextContent('Consumable');
    // All fields are optional: submit is enabled
    expect(submit).toBeEnabled();
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    // A fixed asset line (its code starts with 3) is one item: its quantity becomes 1 and is greyed out
    const code2 = within(others).getByLabelText('Item 2 item code');
    await user.clear(code2);
    await user.type(code2, '305101102.0415');
    expect(within(others).getByLabelText('Item 2 item type')).toHaveTextContent('Fixed asset');
    // Quantity remains editable and keeps slip quantity
    expect(within(others).getByLabelText('Item 2 quantity')).toHaveValue('50');
    expect(within(others).getByLabelText('Item 2 quantity')).not.toBeDisabled();
    // A fixed asset is received in the slip's quantity: no advice to split it
    expect(within(others).queryByText(/a fixed asset is one item/)).toBeNull();
    // Back to the slip's code: a consumable again
    await user.clear(code2);
    await user.type(code2, '105101102.0415');
    expect(within(others).getByLabelText('Item 2 item type')).toHaveTextContent('Consumable');
    await user.clear(within(others).getByLabelText('Item 2 quantity'));
    await user.type(within(others).getByLabelText('Item 2 quantity'), '50');
    expect(submit).toBeEnabled();
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/model19.pdf' } as any);
    await user.click(submit);

    // The attached PDF is uploaded first, then every line is registered in one go
    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    expect(api.registerStockIn).toHaveBeenCalledWith(
      expect.objectContaining({
        ifmisSlipNumber: '0000044',
        items: [
          // The sub inventory printed on the slip is kept for every line
          expect.objectContaining({ name: 'Sulfa Drug In Vial', quantity: 100, subInventory: 'AMedicine' }),
          expect.objectContaining({ name: 'Streptomycine', category: 'AGRI_MACHINERY', itemType: 'CONSUMABLE', condition: 'NEW', uom: 'EA', quantity: 50, unitCostETB: 341, ifmisItemCode: '105101102.0415', subInventory: 'AMedicine' }),
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

  it('fills the receipt from an IFMIS Model 19, with the IFMIS code as the item code of a consumable', async () => {
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

    expect(await within(panel).findByText(/This slip lists 2 items, one row each/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000044');
    expect(within(panel).getByLabelText(/Transaction type/i)).toHaveValue('PO Receipt');
    expect(within(panel).getByLabelText(/Source/i)).toHaveValue('TEST TRADING ONE MEMBER P.L.C');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Sulfa Drug In Vial');
    expect(within(panel).getByLabelText(/^Category/i)).toHaveValue('LAB_EQUIPMENT');
    expect(within(panel).getByLabelText(/Unit of measure/i)).toHaveValue('PKT');
    expect(within(panel).getByLabelText(/^Quantity/i)).toHaveValue('100');
    // The IFMIS code says what it is: 1… a consumable. A code starting with 3 would be a fixed asset
    const code = within(panel).getByLabelText(/IFMIS item code/i);
    expect(code).toHaveValue('107101102.4336');
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Consumable');
    expect(within(panel).queryByLabelText(/Tag number/i)).toBeNull();
    await user.clear(code);
    await user.type(code, '307101102.4336');
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Fixed asset');
    // No tag number is asked, even for a fixed asset
    expect(within(panel).queryByLabelText(/Tag number/i)).toBeNull();
  });

  it('attaches a photo of the signed slip without reading it: only PDFs saved from IFMIS are read', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    const signed = within(panel).getByRole('region', { name: 'Store and signatures' });
    await user.upload(signed.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'model19-photo.jpg', { type: 'image/jpeg' }));

    expect(await within(signed).findByText('model19-photo.jpg')).toBeInTheDocument();
    expect(readPdfRows).not.toHaveBeenCalled();
    expect(within(panel).queryByRole('status')).toBeNull();

    // The attached copy can be viewed before the receipt is saved, to check the fields against it
    await user.click(within(panel).getByRole('button', { name: 'View' }));
    const viewer = screen.getByRole('dialog', { name: 'IFMIS slip model19-photo.jpg' });
    expect(within(viewer).getByText('Attached, not saved yet')).toBeInTheDocument();
    expect(within(viewer).getByRole('img', { name: 'IFMIS slip model19-photo.jpg' })).toBeInTheDocument();
  });

  it('reads the IFMIS PDF at the top, then keeps what it filled in when the signed scan is attached', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    // One place to read the IFMIS PDF: the box at the top, no Import receipt button
    expect(screen.queryByRole('button', { name: 'Import receipt' })).toBeNull();
    await user.type(within(panel).getByLabelText(/Item description/i), 'Typed by hand');

    vi.mocked(readPdfRows).mockResolvedValueOnce([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000051']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
    ]);
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));
    expect(await within(panel).findByText(/Filled in from the slip/)).toBeInTheDocument();
    expect(within(panel).getByText('model19.pdf')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000051');
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Typed by hand');

    // The signed printout, scanned to a PDF (no text), is the copy: it is not read and clears nothing
    vi.mocked(readPdfRows).mockClear();
    const signed = within(panel).getByRole('region', { name: 'Store and signatures' });
    await user.upload(signed.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'signed-scan.pdf', { type: 'application/pdf' }));
    expect(await within(signed).findByText('signed-scan.pdf')).toBeInTheDocument();
    expect(readPdfRows).not.toHaveBeenCalled();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000051');
  });

  it('reads a scanned Model 19 with OCR: fills the header, says the items must be added, keeps the scan as the copy', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValue([]);
    // The scan's header reads well; its table did not
    vi.mocked(ocrRows).mockResolvedValueOnce(asRows(['Print Model19 Report', 'INV Model 19 No. :  0000070', 'PO Number :  104', 'Received By Name :  BAHIA']));
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await within(panel).findByText(/Filled in from the scan: Model 19 No\., PO number\. A scan can be misread, so check every value against the paper/)).toBeInTheDocument();
    expect(within(panel).getByText(/The item lines on this scan could not be read: add the items yourself\./)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000070');
    // The handwritten name by the signature isn't taken from a scan
    expect(within(panel).queryByText(/received by BAHIA/)).toBeNull();
    expect(within(within(panel).getByRole('region', { name: 'Store and signatures' })).getByText('scan.pdf')).toBeInTheDocument();
  });

  it("attaches a scan that can't be read as a Model 19, and keeps what was typed", async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValue([]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000077');
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await within(panel).findByText(/This scan or photo couldn't be read as a Model 19\. It is attached below as the signed copy/)).toBeInTheDocument();
    expect(within(within(panel).getByRole('region', { name: 'Store and signatures' })).getByText('scan.pdf')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000077');
    // It says how to get a file that can be read
    expect(within(panel).getByText(/ask whoever printed it from IFMIS to save it as a PDF and send you that file/)).toBeInTheDocument();
  });

  it('opens an endorsed stage-2 record in view mode with locked actions and accurate banner', async () => {
    const user = userEvent.setup();
    // MOA-R1 has currentStage: 2 (endorsed by Team Leader, awaiting Dept. Head)
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    // Does not auto-open in edit mode because stage 2 is locked
    expect(record.querySelector('form#stock-in-form')).toBeNull();
    expect(toolbarOf(record)).toEqual(['Edit receipt']);
    expect(within(record).getByRole('button', { name: 'Edit receipt' })).toBeDisabled();
    expect(within(record).getByText('Receipt endorsed · waiting for the Department Head')).toBeInTheDocument();
  });

  it.each([
    ['MOA-O1', 'Edit issue', 'stock-out-form'],
    ['MOA-P1', 'Edit transfer', 'transfer-form'],
    ['MOA-I1', 'Edit return to store', 'transfer-form'],
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

  it('prints each voucher from the list of requests, with no printer in the header', async () => {
    const user = userEvent.setup();
    // MOA-S1-1 was issued, then transferred: it has a Model 22 and a Model 21
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('T-S11', 'TRANSFER', 'S1-1', { status: 'APPROVED', reviewedAtGc: '2026-09-15' })] as any);
    vi.mocked(api.getItemById).mockResolvedValue(undefined as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const batch = await open(user, 'MOA-S1');
    await user.click(within(batch).getByRole('button', { name: /MOA-S1-1/ }));
    const unit = screen.getByRole('region', { name: 'Asset record MOA-S1-1' });

    // No printer in the header or the toolbar
    expect(within(unit).queryByRole('button', { name: 'Print a voucher' })).toBeNull();
    expect(toolbarOf(unit).some((b) => /print/i.test(b ?? ''))).toBe(false);
    const links = within(unit).getAllByRole('button', { name: /^Print Model/ }).map((b) => b.textContent?.trim());
    expect(links).toEqual(expect.arrayContaining(['Print Model 22', 'Print Model 21']));
    await user.click(within(unit).getByRole('button', { name: 'Print Model 21' }));
    expect((await screen.findAllByText('Fixed Asset Internal Transfer Form')).length).toBeGreaterThan(0);
  });

  it('prints the Model 19 of a receipt from its request', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    await user.click(within(record).getByRole('button', { name: 'Print Model 19' }));
    expect((await screen.findAllByText('Goods Receiving Report')).length).toBeGreaterThan(0);
  });

  it('locks the receipt once the Team Leader has endorsed it', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-R1');
    expect(within(within(record).getByRole('toolbar')).getByRole('button', { name: 'Edit receipt' })).toBeDisabled();
    expect(within(record).getByText(/The Team Leader has endorsed it, so it can no longer be changed/)).toBeInTheDocument();
  });

  it('is read-only for approvers: no actions, and vouchers print from the requests', async () => {
    const user = userEvent.setup();
    auth.user.permissions = ['inventory.read', 'approvals.read', 'approvals.endorse'];
    render(<AssetsPage currentRole={UserRole.TEAM_LEADER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const record = await open(user, 'MOA-I1');
    expect(within(record).queryByRole('toolbar')).toBeNull();
    expect(within(record).getAllByRole('button', { name: /^Print Model/ }).length).toBeGreaterThan(0);
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
    expect(within(record).getAllByText('IT Equipment & Accessories').length).toBeGreaterThanOrEqual(1);
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

    await user.click(screen.getByRole('button', { name: /asset export and print actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /Export CSV/i }));

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
    expect(within(panel).getByRole('button', { name: 'Close registration' })).toBeInTheDocument();

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

    // Nobody picks purchase or donation: the PO number decides, as on the Model 19
    expect(within(panel).queryByLabelText(/Type of provision/i)).toBeNull();
    const po = within(panel).getByLabelText(/PO number/i);
    // With a PO number: a purchase, with its supplier, buyer and price
    await user.type(po, '186');
    for (const label of [/Source/i, /Buyer/i, /Unit price/i]) expect(within(panel).getByLabelText(label)).toBeInTheDocument();
    // Clearing PO number: item fields like Unit price remain displayed without requiring PO Number
    await user.clear(po);
    expect(within(panel).getByLabelText(/Unit price/i)).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText(/Transaction type/i), 'Donation / Grant Receipt');
    for (const label of [/Source/i, /Buyer/i]) expect(within(panel).queryByLabelText(label)).toBeNull();
    await user.selectOptions(within(panel).getByLabelText(/Transaction type/i), 'Donation / Grant Receipt');

    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000777');
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    await user.type(within(panel).getByLabelText(/Item description/i), 'Donated tablet');
    await user.selectOptions(within(panel).getByLabelText(/^Category/i), 'IT_EQUIPMENT');
    // A code starting with 3: a fixed asset
    await user.type(within(panel).getByLabelText(/IFMIS item code/i), '305101101.0001');
    // A fixed asset: one item, quantity 1
    expect(within(panel).getByLabelText(/^Quantity/i)).toHaveValue('1');
    const submit = within(panel).getByRole('button', { name: /Submit for approval/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    const sent = vi.mocked(api.registerStockIn).mock.calls[0][0];
    expect(sent).toMatchObject({ provisionType: 'DONATION', unitCostETB: 0, transactionType: 'Donation / Grant Receipt' });
    expect(sent.poNumber).toBeUndefined();
    expect(sent.source).toBeUndefined();
    expect(sent.buyer).toBeUndefined();
    expect(sent.items?.[0]).toMatchObject({ quantity: 1, unitCostETB: 0, totalAmount: 0 });
    expect(sent.items?.[0].itemCode).toBeUndefined();
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

    // In unfulfilled mode, submit is allowed with partial data
    expect(submitBtn).toBeEnabled();
    expect(within(panel).queryByText(/Unfulfilled fields are optional/i)).toBeNull();
    // Who received the goods is a store man of the receiving store: nobody can be named before the store is chosen
    expect(within(panel).getByText('Pick the store first.')).toBeInTheDocument();

    // Fill form
    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000999');
    await user.selectOptions(within(panel).getByLabelText(/Transaction type/i), 'Direct Delivery');
    // A purchase: it has a PO number
    await user.type(within(panel).getByLabelText(/PO number/i), '186');
    await user.type(within(panel).getByLabelText(/Source/i), 'Tech Supplies Ltd');

    // Receiving store
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');
    // The store's only store man receives the goods
    expect(await within(panel).findByText('Abebe Store Man')).toBeInTheDocument();

    // Item details
    await user.type(within(panel).getByLabelText(/Item description/i), 'Precision Workstation');
    await user.selectOptions(within(panel).getByLabelText(/Category/i), 'IT_EQUIPMENT');
    // The IFMIS item code is optional in unfulfilled onboarding
    expect(submitBtn).toBeEnabled();
    await user.type(within(panel).getByLabelText(/IFMIS item code/i), '108101101.0021');
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Consumable');
    expect(submitBtn).toBeEnabled();

    // Unit price
    const unitPrice = within(panel).getByLabelText(/Unit price/i);
    await user.clear(unitPrice);
    await user.type(unitPrice, '75000');

    // The unit of measure
    const uom = within(panel).getByLabelText(/Unit of measure/i);
    expect(submitBtn).toBeEnabled();
    await user.selectOptions(uom, 'KG');

    // The quantity defaults to 1: it is editable, and any number is accepted as typed
    const quantity = within(panel).getByLabelText(/^Quantity/i);
    expect(quantity).toHaveValue('1');
    expect(quantity).toHaveAttribute('placeholder', '0');
    expect(submitBtn).toBeEnabled();
    await user.clear(quantity);
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
      items: [expect.objectContaining({ uom: 'KG', ifmisItemCode: '108101101.0021' })],
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

describe('Receiving form: Delivered by follows the buyer', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('fills Delivered by from the buyer until a different name is typed, and follows again when cleared', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    // A purchase: it has a PO number
    await user.type(within(panel).getByLabelText(/PO number/i), '186');

    const buyer = within(panel).getByLabelText(/Buyer/);
    const deliveredBy = within(panel).getByPlaceholderText(/Same as the buyer/);

    await user.type(buyer, 'Abebe Kebede');
    expect(deliveredBy).toHaveValue('Abebe Kebede');

    // Someone else delivered: their name sticks while the buyer changes
    await user.clear(deliveredBy);
    await user.type(deliveredBy, 'Driver Tesfaye');
    await user.type(buyer, ' Jr');
    expect(deliveredBy).toHaveValue('Driver Tesfaye');

    // Cleared: follows the buyer again
    await user.clear(deliveredBy);
    await user.type(buyer, '.');
    expect(deliveredBy).toHaveValue('Abebe Kebede Jr.');
  });
});

describe('Receiving form: replacing or racing slips', () => {
  const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
  const slip = (no: string, lines: [string, string][], extraHeader: PdfRow[] = []): PdfRow[] => [
    r(98, [640, 'Print Model19 Report']),
    r(146, [680, 'INV Model 19 No. :'], [812, no]),
    ...extraHeader,
    r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
    ...lines.map(([code, desc], i) => r(316 + i * 50, [88, String(i + 1)], [128, code], [270, desc], [403, 'EA'], [435, 'AMedicine'], [510, 'Medical'], [826, '10'], [960, '5'], [1050, '50'])),
  ];
  const openReceive = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    const upload = (name: string) => user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], name, { type: 'application/pdf' }));
    return { panel, upload };
  };

  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('replaces what a wrong slip filled in, including its extra item lines, when the right slip is attached', async () => {
    const user = userEvent.setup();
    const { panel, upload } = await openReceive(user);

    vi.mocked(readPdfRows).mockResolvedValueOnce(
      slip('WRONG-1', [['101.1', 'Wrong item'], ['101.2', 'Wrong extra A'], ['101.3', 'Wrong extra B']], [r(162, [714, 'PO Number :'], [812, '999'])])
    );
    await upload('wrong.pdf');
    expect(await within(panel).findByLabelText('Item 2 description')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('999');

    // The person types a source by hand: it must survive the swap
    await user.type(within(panel).getByLabelText(/Source/i), 'Typed supplier');

    vi.mocked(readPdfRows).mockResolvedValueOnce(slip('RIGHT-1', [['202.1', 'Right item']], [r(162, [714, 'PO Number :'], [812, '777'])]));
    await upload('right.pdf');
    await vi.waitFor(() => expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('RIGHT-1'));
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Right item');
    // The wrong slip's extra lines and its PO number are gone; what was typed is kept
    expect(within(panel).queryByLabelText('Item 2 description')).toBeNull();
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('777');
    expect(within(panel).getByLabelText(/Source/i)).toHaveValue('Typed supplier');
  });

  it('fills a duplicated receipt from the slip: what the duplicate copied is replaced, what the slip lacks is kept', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getItems).mockResolvedValue(items.map((i) => (i.id === 'S1' ? {
      ...i, poNumber: 'PO-OLD', source: 'Old supplier', programName: 'Office renewal', ifmisItemCode: '305101101.0001',
    } : i)) as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await menuFor(user, 'MOA-S1');
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate as new receipt' }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Desk');

    vi.mocked(readPdfRows).mockResolvedValueOnce(slip('NEW-19', [['101.1', 'Printer toner'], ['101.2', 'Stapler']], [r(162, [714, 'PO Number :'], [812, '555'])]));
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'new.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('NEW-19'));
    // The slip's first item and PO take the place of the duplicated ones, and its other items follow
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Printer toner');
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('555');
    expect(within(panel).getByLabelText('Item 2 description')).toHaveValue('Stapler');
    // The slip names no program: the duplicated one stays
    expect(within(panel).getByLabelText(/Program/i)).toHaveValue('Office renewal');
  });

  it('uses the slip chosen last when an earlier one finishes reading later', async () => {
    const user = userEvent.setup();
    const { panel, upload } = await openReceive(user);

    let finishFirst!: (rows: PdfRow[]) => void;
    vi.mocked(readPdfPages)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = (rows) => resolve({ rows, pages: 1, pagesRead: 1 }); }))
      .mockResolvedValueOnce({ rows: slip('SECOND-1', [['303.1', 'Second slip item']]), pages: 1, pagesRead: 1 });

    await upload('first.pdf');
    await upload('second.pdf');
    await vi.waitFor(() => expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('SECOND-1'));

    // The first, slower read arrives now and must not take over
    finishFirst(slip('FIRST-1', [['404.1', 'First slip item']]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('SECOND-1');
    expect(within(panel).getByText('second.pdf')).toBeInTheDocument();
    expect(within(panel).queryByText('first.pdf')).toBeNull();
  });

  it('warns when a slip has more pages than were read', async () => {
    const user = userEvent.setup();
    const { upload } = await openReceive(user);
    vi.mocked(readPdfPages).mockResolvedValueOnce({ rows: slip('LONG-1', [['505.1', 'Item']]), pages: 40, pagesRead: 30 });
    await upload('long.pdf');
    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('Slip only partly read', expect.stringMatching(/40 pages; only the first 30 were read/))
    );
  });
});

describe('Receiving form: store and signatures from the Model 19', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('fills Delivered by and, from the store man who received it, the receiving store', async () => {
    const user = userEvent.setup();
    const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
    vi.mocked(readPdfRows).mockResolvedValueOnce([
      r(63, [482, 'Print Model19 Report']),
      r(101, [515, 'INV Model 19 No. :'], [613, '0000006']),
      r(197, [59, 'S/No.'], [91, 'Item Code'], [203, 'Item Description'], [302, 'UOM'], [625, 'Qty']),
      r(219, [55, '1'], [85, '108101101.0021'], [198, 'Fuel Visa Card'], [305, 'EA'], [328, 'Stationery'], [387, 'Fuel and'], [621, '10'], [729, '1'], [783, '10']),
      r(410, [58, 'Delivered By : Name : Kebede, Tolosa Ayana'], [454, 'Received By : Name : Man, Abebe Store']),
    ]);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    expect(await within(panel).findByText(/Filled in from the slip:.*delivered by, receiving store, received by/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Receiving store/i)).toHaveValue('S1');
    expect(within(panel).getByPlaceholderText(/Same as the buyer/)).toHaveValue('Kebede, Tolosa Ayana');
  });
});

describe('Receiving form: the encoder’s own store', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('starts a new receipt in the store the signed-in person is store man of', async () => {
    const user = userEvent.setup();
    const kality = { id: 'LOC-2', name: 'Main', storeId: 'S2', storeName: 'Kality', siteName: 'Kality', roomNumber: 'Main' };
    vi.mocked(api.getLocations).mockResolvedValue([store, kality] as any);
    vi.mocked(api.getStores).mockResolvedValue([
      { id: 'S1', name: 'Head office', address: '', isActive: true, locations: [{ id: 'L1', storeId: 'S1', name: 'Main', isActive: true }],
        storeKeepers: [{ employeeId: 'SM1', fullNameEn: 'Abebe Store Man', fullNameAm: '', payrollId: '0001', isActive: true }] },
      { id: 'S2', name: 'Kality', address: '', isActive: true, locations: [{ id: 'L2', storeId: 'S2', name: 'Main', isActive: true }],
        storeKeepers: [{ employeeId: 'enc', fullNameEn: 'Store Encoder', fullNameAm: '', payrollId: 'ENC-1', isActive: true }] },
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await vi.waitFor(() => expect(within(panel).getByLabelText(/Receiving store/i)).toHaveValue('S2'));
  });
});

describe('Receiving form: item type from the IFMIS code, for PDFs and older records', () => {
  const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('registers a fixed asset read from a Model 19 (code starting with 3): no tag is asked and the IFMIS code is kept', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValueOnce([
      r(98, [640, 'Print Model19 Report']),
      r(146, [680, 'INV Model 19 No. :'], [812, '0000088']),
      r(193, [677, 'Transaction Type :'], [812, 'PO Receipt']),
      r(208, [742, 'Source :'], [812, 'TEST COMPUTERS PLC']),
      r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
      r(316, [88, '1'], [128, '305101101.0001'], [270, 'Dell Latitude Laptop'], [403, 'EA'], [435, 'AStore'], [510, 'Computer'], [826, '1'], [960, '50000'], [1050, '50000']),
      r(630, [910, 'Grand Total'], [1050, '50000']),
    ]);
    vi.mocked(api.registerStockIn).mockResolvedValue({ item: { id: 'N9', itemCode: 'MOA-099001' }, items: [{ id: 'N9', itemCode: 'MOA-099001' }] } as any);
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/model19.pdf' } as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));

    await vi.waitFor(() => expect(within(panel).getByLabelText(/IFMIS item code/i)).toHaveValue('305101101.0001'));
    expect(within(panel).getByLabelText('Item type')).toHaveTextContent('Fixed asset');
    // No tag is asked: only the store is left to choose
    expect(within(panel).queryByLabelText(/Tag number/i)).toBeNull();
    await user.selectOptions(within(panel).getByLabelText(/Receiving store/i), 'S1');

    const submit = within(panel).getByRole('button', { name: /Submit for approval/i });
    await vi.waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await vi.waitFor(() => expect(api.registerStockIn).toHaveBeenCalled());
    const sent = JSON.stringify(vi.mocked(api.registerStockIn).mock.calls[0][0]);
    expect(sent).toMatch(/"itemType":"FIXED"/);
    // The system gives the record its code
    expect(sent).not.toMatch(/"itemCode"/);
    expect(sent).toMatch(/"ifmisItemCode":"305101101.0001"/);
  });

  it('corrects an older fixed asset that has a tag but no IFMIS code: the missing code does not block it', async () => {
    const user = userEvent.setup();
    const legacy = item('L1', 'Old laptop', 'PENDING_STOCK_IN', {
      itemCode: 'MOA-001234', itemType: 'FIXED', transactionType: 'PO Receipt', source: 'Old vendor', condition: 'GOOD',
    });
    vi.mocked(api.getItems).mockResolvedValue([...items, legacy] as any);
    vi.mocked(api.getApprovals).mockResolvedValue([...approvals, request('A-L1', 'STOCK_IN', 'L1', { currentStage: 1 })] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-001234');
    await user.click(within(rowOf('MOA-001234')).getByText('MOA-001234'));
    const record = screen.getByRole('region', { name: 'Asset record MOA-001234' });
    await user.click(within(record).getByRole('button', { name: 'Edit receipt' }));

    // Still a fixed asset, known by its tag; the empty IFMIS code is not asked for
    expect(within(record).getByLabelText('Item type')).toHaveTextContent('Fixed asset');
    expect(within(record).getByLabelText(/IFMIS item code/i)).toHaveValue('');
    expect(within(record).queryByText(/Still needed:.*IFMIS item code/)).toBeNull();
    expect(submitOf(record, 'stock-in-form')).toBeEnabled();
  });
});

describe('Receiving form: one table for every item', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('adds items by hand as rows of the same table, and removes them', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });

    expect(within(panel).getByRole('region', { name: 'Items (1)' })).toBeInTheDocument();
    expect(within(panel).queryByLabelText('Item 2 description')).toBeNull();
    // No cards: the item is a row; one Remarks box for the whole receipt, none per item
    expect(within(panel).queryByText('Item received')).toBeNull();
    expect(within(panel).getAllByLabelText(/Remark/i)).toEqual([within(panel).getByRole('textbox', { name: 'Remarks' })]);
    // No tag number column, for any item
    expect(within(panel).queryByRole('columnheader', { name: 'Tag number' })).toBeNull();

    await user.click(within(panel).getByRole('button', { name: 'Add item' }));
    expect(within(panel).getByRole('region', { name: 'Items (2)' })).toBeInTheDocument();
    await user.type(within(panel).getByLabelText('Item 2 item code'), '305101101.0002');
    expect(within(panel).getByLabelText('Item 2 item type')).toHaveTextContent('Fixed asset');
    expect(within(panel).queryByLabelText('Item 2 tag number')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Submit 2 items for approval' })).toBeEnabled();

    await user.click(within(panel).getByRole('button', { name: 'Remove item 2' }));
    expect(within(panel).queryByLabelText('Item 2 description')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
  });
});

describe('Receiving form: footer notes', () => {
  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('does not display Still needed or unfulfilled note in receive form', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });

    expect(within(panel).queryByText(/Still needed/i)).toBeNull();
    expect(within(panel).queryByText(/Unfulfilled fields are optional/i)).toBeNull();
    expect(within(panel).getByRole('button', { name: /Submit for approval/i })).toBeEnabled();
  });

  it('on submit, lists what the items still need instead of saving made-up values', async () => {
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });

    await user.click(within(panel).getByRole('button', { name: /Submit for approval/i }));
    expect(within(panel).getByText('Still needed before submitting: item 1 (description, item code, category, item type).')).toBeInTheDocument();

    // Only the code typed: nothing like "Unspecified Item" or a default category is saved
    await user.type(within(panel).getByLabelText(/IFMIS item code/i), '108101101.0021');
    await user.click(within(panel).getByRole('button', { name: /Submit for approval/i }));
    expect(within(panel).getByText('Still needed before submitting: item 1 (description, category).')).toBeInTheDocument();
    expect(api.registerStockIn).not.toHaveBeenCalled();
  });
});

describe('Receiving form: provision from the PO number on the Model 19', () => {
  const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
  const model19 = (header: PdfRow[]): PdfRow[] => [
    r(98, [640, 'Print Model19 Report']),
    r(146, [680, 'INV Model 19 No. :'], [812, '0000321']),
    ...header,
    r(283, [95, 'S/No.'], [135, 'Item Code'], [278, 'Item Description'], [403, 'UOM'], [826, 'Qty']),
    r(316, [88, '1'], [128, '108101101.0021'], [270, 'Printer paper'], [403, 'PKT'], [435, 'AStore'], [510, 'Stationery'], [826, '10'], [960, '450'], [1050, '4500']),
  ];
  const readSlip = async (header: PdfRow[]) => {
    const user = userEvent.setup();
    vi.mocked(readPdfRows).mockResolvedValueOnce(model19(header));
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('0000321'));
    return panel;
  };

  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('is a purchase when the slip has a PO number', async () => {
    const panel = await readSlip([r(162, [714, 'PO Number :'], [812, '186']), r(193, [677, 'Transaction Type :'], [812, 'PO Receipt'])]);
    expect(within(panel).getByLabelText(/Unit price/i)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('186');
  });

  it('is a donation when the slip has no PO number', async () => {
    const panel = await readSlip([]);
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('');
    expect(within(panel).getByLabelText(/Transaction type/i)).toHaveValue('Donation / Grant Receipt');
    // A donation has no supplier or price
    expect(within(panel).queryByLabelText(/Source/i)).toBeNull();
    expect(within(panel).queryByLabelText(/Unit price/i)).toBeNull();
  });

  it('displays pricing columns without requiring a PO number for non-donation transaction types', async () => {
    const panel = await readSlip([r(193, [677, 'Transaction Type :'], [812, 'Petty Cash Purchase Receipt'])]);
    expect(within(panel).getByLabelText(/Unit price/i)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Transaction type/i)).toHaveValue('Petty Cash Purchase Receipt');
  });
});

describe('Receiving form: the uploaded slip is shown open under the form', () => {
  const r = (top: number, ...cells: [number, string][]): PdfRow => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });

  beforeEach(() => {
    auth.user.permissions = ENCODER;
  });

  it('previews the IFMIS PDF as soon as it is chosen, and switches to the signed copy', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    // Nothing chosen: no preview
    expect(within(panel).queryByRole('region', { name: 'Slip preview' })).toBeNull();

    vi.mocked(readPdfRows).mockResolvedValueOnce([r(98, [640, 'Print Model19 Report']), r(146, [680, 'INV Model 19 No. :'], [812, '0000061'])]);
    await user.upload(panel.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'model19.pdf', { type: 'application/pdf' }));
    const preview = await within(panel).findByRole('region', { name: 'Slip preview' });
    // Open straight away, with no button to press
    expect(within(preview).getByTitle('IFMIS slip model19.pdf')).toBeInTheDocument();

    // With the signed copy too, both can be shown; the IFMIS PDF stays first
    const signed = within(panel).getByRole('region', { name: 'Store and signatures' });
    await user.upload(signed.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'signed.jpg', { type: 'image/jpeg' }));
    expect(within(preview).getByTitle('IFMIS slip model19.pdf')).toBeInTheDocument();
    await user.click(within(preview).getByRole('button', { name: 'Signed copy' }));
    expect(within(preview).getByRole('img', { name: 'IFMIS slip signed.jpg' })).toBeInTheDocument();

    // It can be put away and brought back
    await user.click(within(preview).getByRole('button', { name: 'Hide' }));
    expect(within(preview).queryByRole('img')).toBeNull();
    await user.click(within(preview).getByRole('button', { name: 'Show' }));
    expect(within(preview).getByRole('img', { name: 'IFMIS slip signed.jpg' })).toBeInTheDocument();
  });
  it('shows only one file uploader for the IFMIS PDF when showScannedSlipField is false', async () => {
    applySystemSettings({ showScannedSlipField: false });
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-S1');
    await user.click(screen.getByRole('button', { name: /Receive items \(Model 19\)/i }));
    const panel = screen.getByRole('region', { name: 'Receive items' });
    expect(within(panel).getByText('Click to choose the Model 19 PDF saved from IFMIS, or a photo')).toBeInTheDocument();
    expect(within(panel).queryByText('Click to attach the signed Model 19, scanned')).toBeNull();
  });

  it('places newly received items at the top of the asset table', async () => {
    const existing = [
      { id: 'item-old-1', itemCode: 'MOA-AG-0001', name: 'Old Tractor', createdAt: '2026-10-19T08:00:00.000Z', createdAtGc: '2026-10-19', status: 'AVAILABLE', quantity: 1, unitCostETB: 100 },
      { id: 'item-old-2', itemCode: 'MOA-IT-0001', name: 'Old Monitor', createdAt: '2026-10-20T08:00:00.000Z', createdAtGc: '2026-10-20', status: 'AVAILABLE', quantity: 1, unitCostETB: 200 },
    ];
    const newlyReceived = {
      id: 'item-new-1',
      itemCode: 'MOA-OF-0099',
      name: 'Newly Received Desk',
      createdAt: '2026-10-20T12:00:00.000Z',
      createdAtGc: '2026-10-20',
      status: 'PENDING_STOCK_IN',
      quantity: 1,
      unitCostETB: 300,
    };

    vi.mocked(api.getItems).mockResolvedValueOnce([...existing] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('Old Tractor');

    // Simulate after submit: newly received item is present
    vi.mocked(api.getItems).mockResolvedValue([newlyReceived, ...existing] as any);
    act(() => {
      window.dispatchEvent(new CustomEvent('moa_approvals_updated'));
    });

    await screen.findByText('Newly Received Desk');
    const tableRows = screen.getAllByRole('row');
    // First data row (index 1 after the thead row) is the newly received item
    expect(within(tableRows[1]).getByText('Newly Received Desk')).toBeInTheDocument();
  });
});

describe('One row per Model 19', () => {
  beforeEach(() => {
    auth.user.permissions = [...ENCODER];
    vi.mocked(api.getItems).mockResolvedValue([
      item('L1', 'Dell Latitude', 'AVAILABLE', { ifmisSlipNumber: '0000051', poNumber: 'PO-14', totalAmount: 50000 }),
      item('L2', 'HP Printer', 'ISSUED', { ifmisSlipNumber: '0000051', poNumber: 'PO-14', totalAmount: 20000 }),
      item('L3', 'Toner', 'AVAILABLE', { ifmisSlipNumber: '0000051', poNumber: 'PO-14', itemType: 'CONSUMABLE', quantity: 10, totalAmount: 5000 }),
      // Same slip number, another PO: another receipt
      item('L4', 'Scanner', 'AVAILABLE', { ifmisSlipNumber: '0000051', poNumber: 'PO-15' }),
    ] as any);
  });

  it('shows the items of one Model 19 and PO as one row, and opens the receipt with its items', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const slipRow = await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    expect(within(slipRow).getByText('Dell Latitude, HP Printer +1')).toBeInTheDocument();
    // A badge per state, with how many items are in it
    expect(within(slipRow).getByText('2 In store')).toBeInTheDocument();
    expect(within(slipRow).getByText('1 Issued')).toBeInTheDocument();
    expect(within(slipRow).getByText('PO PO-14')).toBeInTheDocument();
    // Its items are not rows of their own; the other PO is
    expect(screen.queryByText('MOA-L1')).toBeNull();
    expect(screen.getByText('MOA-L4')).toBeInTheDocument();

    await user.click(within(slipRow).getByText('Dell Latitude, HP Printer +1'));
    const receipt = screen.getByRole('region', { name: 'Model 19 0000051' });
    expect(within(receipt).getByText('3 items · PO PO-14')).toBeInTheDocument();
    expect(within(receipt).getByText('2 In store')).toBeInTheDocument();
    expect(within(receipt).getByText('1 Issued')).toBeInTheDocument();
    const lines = within(receipt).getByRole('table', { name: 'Items on this Model 19' });
    expect(within(lines).getAllByRole('row')).toHaveLength(4); // header and 3 items

    // An item opens its own record, which leads back to the receipt
    await user.click(within(lines).getByText('HP Printer'));
    const record = screen.getByRole('region', { name: 'Asset record MOA-L2' });
    await user.click(within(record).getByRole('button', { name: /Model 19 #0000051/ }));
    expect(screen.getByRole('region', { name: 'Model 19 0000051' })).toBeInTheDocument();
  });

  it('shows the usual single badge when every item of the receipt stands the same way', async () => {
    vi.mocked(api.getItems).mockResolvedValue([
      item('L1', 'Dell Latitude', 'AVAILABLE', { ifmisSlipNumber: '0000051', poNumber: 'PO-14' }),
      item('L2', 'HP Printer', 'AVAILABLE', { ifmisSlipNumber: '0000051', poNumber: 'PO-14' }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const slipRow = await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    expect(within(slipRow).getByText('In store')).toBeInTheDocument();
    expect(within(slipRow).queryByText(/^d+ In store/)).toBeNull();
  });

  it('receives a rejected Model 19 again: every item comes across, and the same slip is not refused', async () => {
    const user = userEvent.setup();
    const rejected = { ifmisSlipNumber: '0000051', poNumber: 'PO-14', source: 'Abay Trading' };
    vi.mocked(api.getItems).mockResolvedValue([
      item('L1', 'Dell Latitude', 'REJECTED', { ...rejected, ifmisItemCode: '301101101.0001', unitCostETB: 50000 }),
      item('L2', 'HP Printer', 'REJECTED', { ...rejected, ifmisItemCode: '301101101.0002', unitCostETB: 20000 }),
      item('L3', 'Toner', 'REJECTED', { ...rejected, ifmisItemCode: '101101101.0003', itemType: 'CONSUMABLE', quantity: 10, unitCostETB: 500 }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const slipRow = await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    await user.click(within(slipRow).getByRole('button', { name: 'Actions for Model 19 0000051' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Duplicate as new receipt', 'Print Model 19']);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate as new receipt' }));

    const panel = screen.getByRole('region', { name: 'Receive items' });
    expect(within(panel).getByRole('heading', { name: 'Duplicate of Model 19 #0000051 · 3 items' })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Item description/i)).toHaveValue('Dell Latitude');
    expect(within(panel).getByLabelText('Item 2 description')).toHaveValue('HP Printer');
    expect(within(panel).getByLabelText('Item 3 description')).toHaveValue('Toner');
    expect(within(panel).getByLabelText('Item 3 item code')).toHaveValue('101101101.0003');
    expect(within(panel).getByLabelText('Item 3 quantity')).toHaveValue('10');
    expect(within(panel).getByLabelText(/PO number/i)).toHaveValue('PO-14');
    expect(within(panel).getByLabelText(/Model 19 No/i)).toHaveValue('');

    // The rejected receipt doesn't count as received: typing its number again raises no duplicate warning
    await user.type(within(panel).getByLabelText(/Model 19 No/i), '0000051');
    expect(within(panel).queryByText(/Duplicate entrance is not permitted/)).toBeNull();
  });

  it('offers the duplicate on the open receipt too, but not to someone who cannot receive', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await user.click(within(await screen.findByRole('row', { name: 'Open Model 19 0000051' })).getByText('Dell Latitude, HP Printer +1'));
    await user.click(within(screen.getByRole('region', { name: 'Model 19 0000051' })).getByRole('button', { name: 'Duplicate as new receipt' }));
    expect(within(screen.getByRole('region', { name: 'Receive items' })).getByLabelText('Item 3 description')).toHaveValue('Toner');
  });

  it('issues the items of a Model 19 on one Model 22, from its row menu or the open receipt', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const slipRow = await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    await user.click(within(slipRow).getByRole('button', { name: 'Actions for Model 19 0000051' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Issue (Model 22)', 'Duplicate as new receipt', 'Print Model 19']);
    await user.click(screen.getByRole('menuitem', { name: 'Issue (Model 22)' }));

    // The receipt opens with the Model 22 in place of its details: the two items still in store, the issued one left out
    const receipt = screen.getByRole('region', { name: 'Model 19 0000051' });
    expect(within(receipt).queryByRole('toolbar', { name: 'Receipt actions' })).toBeNull();
    const chosen = within(receipt).getAllByRole('combobox', { name: /store item/i }).map((c) => (c as HTMLSelectElement).value || c.textContent);
    expect(chosen).toHaveLength(2);
    // The one left out is named, with why
    expect(within(receipt).getByText('Not on this Model 22: HP Printer (it is issued).')).toBeInTheDocument();
    await user.click(within(receipt).getByRole('button', { name: 'Cancel' }));
    expect(within(receipt).getByRole('toolbar', { name: 'Receipt actions' })).toBeInTheDocument();
    expect(within(within(receipt).getByRole('toolbar', { name: 'Receipt actions' })).getByRole('button', { name: 'Issue (Model 22)' })).toBeInTheDocument();
  });

  it('keeps the units on a pending issue in store, and shows them as requested, until the last approver approves', async () => {
    vi.mocked(api.getItems).mockResolvedValue([
      item('P1', 'Ballpoint pen', 'PENDING_STOCK_OUT', { ifmisSlipNumber: '0000090', itemType: 'CONSUMABLE', quantity: 50, balance: { total: 50, issued: 0, available: 50, pending: 0, requested: 10 } }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-P1')).closest('tr')!;
    expect(within(row).getByText('10 requested')).toBeInTheDocument();
    expect(within(row).getByText('50 in store')).toBeInTheDocument();
  });

  it('offers no issue when nothing on the receipt is in store', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getItems).mockResolvedValue([
      item('L1', 'Dell Latitude', 'ISSUED', { ifmisSlipNumber: '0000051', poNumber: 'PO-14' }),
      item('L2', 'HP Printer', 'ISSUED', { ifmisSlipNumber: '0000051', poNumber: 'PO-14' }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const slipRow = await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    await user.click(within(slipRow).getByRole('button', { name: 'Actions for Model 19 0000051' }));
    expect(screen.queryByRole('menuitem', { name: 'Issue (Model 22)' })).toBeNull();
  });

  it('finds a receipt by the name of one of its items', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByRole('row', { name: 'Open Model 19 0000051' });
    await user.type(screen.getByPlaceholderText(/search/i), 'toner');
    const slipRow = screen.getByRole('row', { name: 'Open Model 19 0000051' });
    // The item searched for leads the row's name instead of hiding behind "+1"
    expect(within(slipRow).getByText('Toner, Dell Latitude +1')).toBeInTheDocument();
    expect(screen.queryByText('MOA-L4')).toBeNull();
  });
});

describe('Assets: a rejected request', () => {
  const rejectedReceipt = request('A-R1', 'STOCK_IN', 'R1', {
    status: 'RETURNED', currentStage: 1, returnedFromStage: 2, returnRemarks: 'Price is entered as USD.',
    returnedBy: { fullNameEn: 'Getnet Taye' }, returnedAtGc: '2026-10-21',
  });

  it('says so with the reason, and is resubmitted or cancelled from its row', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([rejectedReceipt, ...approvals.filter((a) => a.id !== 'A-R1')] as any);
    vi.mocked(api.resubmitApprovals).mockResolvedValue([] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-R1')).closest('tr')!;
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
    // Who rejected it (by stage) and why; the name and date are on hover
    expect(within(row).getByText('by Department Head:')).toBeInTheDocument();
    expect(within(row).getByText('Price is entered as USD.')).toBeInTheDocument();

    expect(await menuFor(user, 'MOA-R1')).toEqual(['Edit receipt', 'Resubmit Model 19', 'Duplicate as new receipt', 'Cancel request']);
    await user.click(screen.getByRole('menuitem', { name: 'Resubmit Model 19' }));
    expect(api.resubmitApprovals).toHaveBeenCalledWith(['A-R1']);
    expect(toast.success).toHaveBeenCalledWith('Resubmitted for approval', 'Model 19 REQ-A-R1 went back to the Team Leader.');
  });

  it('is cancelled only once confirmed, with an optional reason', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([rejectedReceipt, ...approvals.filter((a) => a.id !== 'A-R1')] as any);
    vi.mocked(api.cancelApprovals).mockResolvedValue([] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-R1');
    await menuFor(user, 'MOA-R1');
    await user.click(screen.getByRole('menuitem', { name: 'Cancel request' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Cancel Model 19 REQ-A-R1?')).toBeInTheDocument();
    expect(within(dialog).getByText('Rejected because: Price is entered as USD.')).toBeInTheDocument();
    // Keep it: nothing is cancelled
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(api.cancelApprovals).not.toHaveBeenCalled();

    await menuFor(user, 'MOA-R1');
    await user.click(screen.getByRole('menuitem', { name: 'Cancel request' }));
    await user.type(within(screen.getByRole('dialog')).getByPlaceholderText(/Entered twice/), 'Entered twice');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel request' }));
    expect(api.cancelApprovals).toHaveBeenCalledWith(['A-R1'], 'Entered twice');
    expect(toast.success).toHaveBeenCalledWith('Request cancelled', 'Model 19 REQ-A-R1 is cancelled and its records are released.');
  });

  it('a request still waiting for approval has neither Resubmit nor Cancel', async () => {
    const user = userEvent.setup();
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    await screen.findByText('MOA-R1');
    const menu = await menuFor(user, 'MOA-R1');
    expect(menu).not.toContain('Resubmit Model 19');
    expect(menu).not.toContain('Cancel request');
  });

  it('a cancelled receipt reads as cancelled, and can be received again as a copy', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getApprovals).mockResolvedValue([
      ...approvals,
      request('NO-X1', 'STOCK_IN', 'X1', { status: 'CANCELLED', reviewedAtGc: '2026-10-22', reviewRemarks: 'Entered twice' }),
    ] as any);
    render(<AssetsPage currentRole={UserRole.DATA_ENCODER} onNavigate={vi.fn()} />);
    const row = (await screen.findByText('MOA-X1')).closest('tr')!;
    expect(within(row).getByText('Cancelled')).toBeInTheDocument();
    expect(within(row).getByText(/Receipt cancelled/)).toBeInTheDocument();
    expect(await menuFor(user, 'MOA-X1')).toEqual(['Duplicate as new receipt']);
  });
});
