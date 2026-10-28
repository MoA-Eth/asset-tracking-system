import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockOutForm, buildModel22Voucher } from './IssueForm';
import { api } from '../../api/client';
import { loadSystemSettings } from '../../utils/system-settings';
import { readPdfPages } from '../../utils/slip-reader';

// The PDF is read in the browser; here its rows are given, and the real reader parses them
vi.mock('../../utils/slip-reader', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../utils/slip-reader')>()), readPdfPages: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'encoder', fullNameEn: 'Store Encoder' } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../../api/client', () => ({ api: { registerStockOut: vi.fn(), uploadSlip: vi.fn(), getStores: vi.fn(), getSystemSettings: vi.fn(), getOrganizations: vi.fn(async () => []), createOrganization: vi.fn() } }));

const store = (storeKeepers: any[]) => ({
  id: 'S1', name: 'Kality store', address: '', isActive: true, locations: [{ id: 'LOC-1', storeId: 'S1', name: 'Shelf A', isActive: true }], storeKeepers,
});
const keeper = (id: string, name: string) => ({ employeeId: id, fullNameEn: name, fullNameAm: '', payrollId: `000${id}`, isActive: true });
beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(api.getSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'OPTIONAL' });
  await loadSystemSettings();
  vi.mocked(api.getStores).mockResolvedValue([store([keeper('1', 'Abebe Store Man')])] as any);
});

const item = (extra: Record<string, unknown> = {}) =>
  ({ id: 'item-1', itemCode: 'MOA-AG-0001', name: 'Fertilizer', quantity: 40, uom: 'BAG', unitCostETB: 3200, status: 'AVAILABLE', storeLocationId: 'LOC-1', storeLocation: { storeId: 'S1' }, ...extra }) as any;

const renderWith = (stock: any) =>
  render(<StockOutForm availableItems={[stock]} departments={[]} employees={[]} initialItemId={stock.id} onCancel={vi.fn()} onSuccess={vi.fn()} />);

describe('Issue items (Model 22): unit of measure', () => {
  it("shows the unit the item was received in, and it can't be edited or cleared", () => {
    renderWith(item());
    // The Unit column of the item's row: shown, not typed
    const cells = screen.getByLabelText('Quantity to issue').closest('tr')!.querySelectorAll('td');
    const unit = cells[[...screen.getAllByRole('columnheader')].findIndex((h) => h.textContent === 'Unit')];
    expect(unit).toHaveTextContent('BAG');
    expect(unit.querySelector('input')).toBeNull();
    expect(screen.getAllByText(/40 BAG in store/).length).toBeGreaterThan(0);
  });

  it('counts items saved before units were recorded in EA, as the server does', () => {
    renderWith(item({ uom: undefined }));
    expect(screen.getAllByText(/40 EA in store/).length).toBeGreaterThan(0);
  });
});

describe('Issue items (Model 22): one picker for an employee or an organization', () => {
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const oromia = { id: 'ORG-1', name: 'Oromia Bureau of Agriculture', shortName: 'Oromia BoA', contactPerson: 'Mantegbosh Mirku', isActive: true };
  const renderIssue = (onSuccess = vi.fn()) =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={onSuccess} />);
  const submit = () => screen.getByRole('button', { name: /Submit for approval/ });
  const pick = async (user: ReturnType<typeof userEvent.setup>, search: string) => {
    await user.click(screen.getByRole('combobox', { name: /Received by/ }));
    await user.type(screen.getByRole('textbox', { name: 'Search the list' }), search);
  };

  beforeEach(() => {
    vi.mocked(api.getOrganizations).mockResolvedValue([oromia] as any);
  });

  it('lists employees and organizations together: no Internal / External choice', async () => {
    const user = userEvent.setup();
    renderIssue();
    expect(screen.queryByRole('radio', { name: /Internal|External/ })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: /Received by/ }));
    expect(await screen.findByRole('group', { name: 'Organizations' })).toHaveTextContent('Oromia Bureau of Agriculture');
    expect(screen.getByRole('group', { name: 'Employees' })).toHaveTextContent('Abebe Kebede (00000001)');

    // An employee: their directorate is asked (and filled in); no contact person
    await user.click(screen.getByRole('option', { name: /Abebe Kebede/ }));
    expect(screen.getByLabelText(/Destination directorate/)).toHaveValue('DEP-1');
    expect(screen.queryByLabelText(/Contact person/)).toBeNull();

    // An organization, found by its short name: its usual contact person is offered; no directorate
    await pick(user, 'Oromia BoA');
    await user.click(screen.getByRole('option', { name: /Oromia Bureau of Agriculture/ }));
    expect(screen.getByLabelText(/Contact person/)).toHaveValue('Mantegbosh Mirku');
    expect(screen.queryByLabelText(/Destination directorate/)).toBeNull();
  });

  it('sends the organization from the list, with its contact person, and no employee or directorate', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const onSuccess = vi.fn();
    renderIssue(onSuccess);
    await screen.findByText('Abebe Store Man');

    await user.type(screen.getByPlaceholderText('e.g. 0004653/A Inventory'), 'M22-001');
    expect(submit()).toBeEnabled();
    await pick(user, 'Oromia');
    await user.click(screen.getByRole('option', { name: /Oromia Bureau of Agriculture/ }));
    expect(submit()).toBeEnabled();
    await user.click(submit());

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    expect(payload).toMatchObject({ itemId: 'item-1', issuedByEmployeeId: '1', recipientType: 'EXTERNAL', organizationId: 'ORG-1', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku', destination: 'Oromia Bureau of Agriculture' });
    expect(payload).not.toHaveProperty('recipientEmployeeId');
    expect(payload).not.toHaveProperty('targetDepartmentId');
    // The printed voucher names the person who signs and their organization
    expect(onSuccess.mock.calls[0][1]).toMatchObject({
      destination: 'Oromia Bureau of Agriculture', receivedByName: 'Mantegbosh Mirku, Oromia Bureau of Agriculture', issuedByName: 'Abebe Store Man',
    });
  });

  it('adds a new organization to the list from the picker, and chooses it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createOrganization).mockResolvedValue({ id: 'ORG-9', name: 'Amhara Bureau of Agriculture', shortName: '', contactPerson: '', isActive: true } as any);
    renderIssue();
    await pick(user, 'Amhara Bureau of Agriculture');
    await user.click(screen.getByRole('button', { name: 'Add "Amhara Bureau of Agriculture" as an organization' }));
    expect(api.createOrganization).toHaveBeenCalledWith({ name: 'Amhara Bureau of Agriculture' });
    expect(await screen.findByRole('combobox', { name: /Received by/ })).toHaveTextContent('Amhara Bureau of Agriculture');
    expect(screen.getByLabelText(/Contact person/)).toHaveValue('');
  });

  it('does not offer to add a name that is already in the list', async () => {
    const user = userEvent.setup();
    renderIssue();
    await pick(user, 'oromia bureau of agriculture');
    expect(await screen.findByRole('option', { name: /Oromia Bureau of Agriculture/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /as an organization/ })).toBeNull();
  });
});

describe('Issue items (Model 22): remembered values and used numbers', () => {
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const renderIssue = () =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);

  it('starts from the transaction type used last time, and leaves the voucher number to be typed from the slip', () => {
    window.localStorage.setItem('moa_form_encoder_issue', JSON.stringify({ model22No: 'M22-009', transactionType: 'Direct Store Issue' }));
    renderIssue();
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Direct Store Issue');
    expect(screen.getByPlaceholderText('e.g. 0004653/A Inventory')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Use M22/ })).toBeNull();
  });

  it('never starts a new issue as a disposal, even if the last one was', () => {
    window.localStorage.setItem('moa_form_encoder_issue', JSON.stringify({ transactionType: 'Disposal' }));
    renderIssue();
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Move Order Issue');
  });

  it('warns, without blocking, when the number is already used by another request', async () => {
    (api as any).getApprovals = vi.fn().mockResolvedValue([
      { id: 'a1', transactionType: 'STOCK_OUT', itemCode: 'MOA-IT-2026-0007', ifmisSlipNumber: 'M22-050', status: 'PENDING' },
      { id: 'a2', transactionType: 'STOCK_OUT', itemCode: 'MOA-IT-2026-0008', ifmisSlipNumber: 'M22-060', status: 'REJECTED' },
    ]);
    const user = userEvent.setup();
    renderIssue();
    const number = screen.getByPlaceholderText('e.g. 0004653/A Inventory');
    await user.type(number, 'm22-050');
    expect(await screen.findByText(/already used for MOA-IT-2026-0007 \(issue, pending\)/)).toBeInTheDocument();
    // A rejected request frees its number
    await user.clear(number);
    await user.type(number, 'M22-060');
    expect(screen.queryByText(/already used for/)).toBeNull();
  });
});

describe('Issue items (Model 22): disposal', () => {
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;

  it('is a disposal when its box is ticked: the reason replaces the recipient, and no recipient is sent', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const onSuccess = vi.fn();
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={onSuccess} />);

    // An issue to begin with; the box makes it a disposal, and unticking it goes back to the issue's type
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Move Order Issue');
    await user.click(screen.getByRole('checkbox', { name: 'Mark as disposal' }));
    expect(screen.queryByLabelText(/Transaction type/)).toBeNull();
    expect(screen.queryByText('Received by')).toBeNull();
    expect(screen.queryByText('Destination directorate')).toBeNull();
    expect(screen.getByRole('region', { name: 'Reason and signatures' })).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Submit disposal for approval' });
    await user.type(screen.getByPlaceholderText('e.g. 0004653/A Inventory'), 'M22-009');
    expect(submit).toBeEnabled();
    await user.type(screen.getByPlaceholderText(/Expired, damaged beyond repair/), 'Expired');
    expect(submit).toBeEnabled();
    await user.click(submit);

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    expect(payload).toMatchObject({ itemId: 'item-1', disposal: true, transactionType: 'Disposal', purpose: 'Expired' });
    expect(payload).not.toHaveProperty('recipientEmployeeId');
    expect(payload).not.toHaveProperty('targetDepartmentId');
    expect(onSuccess.mock.calls[0][1]).toMatchObject({ transactionType: 'Disposal', destination: 'Disposal (write-off)', receivedByName: '—', disposalReason: 'Expired' });
  });

  it('goes back to the issue it was when the box is unticked', async () => {
    const user = userEvent.setup();
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/Transaction type/), 'Direct Store Issue');
    await user.click(screen.getByRole('checkbox', { name: 'Mark as disposal' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mark as disposal' }));
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Direct Store Issue');
    expect(screen.getByRole('combobox', { name: /Received by/ })).toBeInTheDocument();
  });

  it('allows specifying Sold / transferred / donated to when marked as disposal', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={onSuccess} />);
    await user.click(screen.getByRole('checkbox', { name: 'Mark as disposal' }));

    const recipientInput = screen.getByLabelText(/Sold \/ transferred \/ donated to/);
    expect(recipientInput).toBeInTheDocument();
    await user.type(recipientInput, 'East Shawa Zone Agriculture Office');

    const submit = screen.getByRole('button', { name: 'Submit disposal for approval' });
    await user.type(screen.getByPlaceholderText('e.g. 0004653/A Inventory'), 'M22-010');
    await user.type(screen.getByPlaceholderText(/Expired, damaged beyond repair/), 'Donated');
    expect(submit).toBeEnabled();
    await user.click(submit);

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    expect(payload).toMatchObject({
      itemId: 'item-1',
      disposal: true,
      transactionType: 'Disposal',
      purpose: 'Donated',
      recipientName: 'East Shawa Zone Agriculture Office',
      destination: 'Disposal: to East Shawa Zone Agriculture Office',
    });
    expect(onSuccess.mock.calls[0][1]).toMatchObject({
      transactionType: 'Disposal',
      destination: 'Disposal: to East Shawa Zone Agriculture Office',
      receivedByName: 'East Shawa Zone Agriculture Office',
      disposalReason: 'Donated',
    });
  });

  it('prints a recorded disposal as a Disposal, with no recipient', () => {
    const voucher = buildModel22Voucher(
      { id: 'a1', transactionType: 'STOCK_OUT', itemId: 'item-1', itemCode: 'MOA-1', itemName: 'Paper', ifmisSlipNumber: 'M22-009', status: 'PENDING', currentStage: 1, purposeOrRemarks: 'Expired', requestDetails: { quantity: 3, disposal: true } } as any,
      { employees: [], departments: [], item: undefined } as any,
    );
    expect(voucher).toMatchObject({ transactionType: 'Disposal', destination: 'Disposal (write-off)', receivedByName: '—' });
  });

  it('prints a recorded disposal with Sold/Transferred/Donated to recipient and signatory', () => {
    const voucher = buildModel22Voucher(
      {
        id: 'a1',
        transactionType: 'STOCK_OUT',
        itemId: 'item-1',
        itemCode: 'MOA-1',
        itemName: 'Paper',
        ifmisSlipNumber: 'M22-010',
        status: 'PENDING',
        currentStage: 1,
        purposeOrRemarks: 'Transferred',
        requestDetails: { quantity: 5, disposal: true, recipientName: 'East Shawa Zone Agriculture Office' },
      } as any,
      { employees: [], departments: [], item: undefined } as any,
    );
    expect(voucher).toMatchObject({
      transactionType: 'Disposal',
      destination: 'Disposal: to East Shawa Zone Agriculture Office',
      receivedByName: 'East Shawa Zone Agriculture Office',
    });
    expect(voucher.signatories).toEqual(
      expect.arrayContaining([{ label: 'Received By', name: 'East Shawa Zone Agriculture Office' }]),
    );
  });
});

describe('Model 22 voucher for an issue to an organization', () => {
  it('prints the organization as the destination and the contact person as who received it', () => {
    const approval = {
      id: 'a1', transactionType: 'STOCK_OUT', itemId: 'item-1', itemCode: 'MOA-AG-0001', itemName: 'Fertilizer', ifmisSlipNumber: 'M22-001',
      status: 'APPROVED', requestedById: 'e1', createdAtGc: '2026-10-01',
      requestDetails: { quantity: 4, uom: 'BAG', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku' },
    } as any;
    const voucher = buildModel22Voucher(approval, { item: item(), departments: [], employees: [] });
    expect(voucher).toMatchObject({ destination: 'Oromia Bureau of Agriculture', receivedByName: 'Mantegbosh Mirku, Oromia Bureau of Agriculture' });
  });
});

describe('Reprinting a Model 22 saved with several lines', () => {
  const line = (id: string, code: string, name: string, extra: object = {}) =>
    ({
      id, transactionType: 'STOCK_OUT', itemId: `item-${id}`, itemCode: code, itemName: name, ifmisSlipNumber: '0000201/A',
      status: 'PENDING', currentStage: 1, createdAtGc: '2026-10-14', requestDetails: { quantity: 2 }, ...extra,
    }) as any;
  // As the server lists them: newest first. The first line saved carries the transport cost.
  const requests = [
    line('c', 'MOA-3', 'Toner', { status: 'REJECTED' }),
    line('b', 'MOA-2', 'Pens'),
    line('a', 'MOA-1', 'Paper', { requestDetails: { quantity: 2, transportationCost: 150 } }),
    line('x', 'MOA-9', 'Other voucher', { ifmisSlipNumber: '0000202/A' }),
  ];
  const items = [item({ id: 'item-a', unitCostETB: 100 }), item({ id: 'item-b', unitCostETB: 10 })];

  it('prints every line saved with the same Model 22 No., in the order saved, from whichever line it is opened', () => {
    const voucher = buildModel22Voucher(requests[1], { item: items[1], departments: [], employees: [], requests, items });
    expect(voucher.items.map((l) => [l.sNo, l.itemDescription, l.totalAmount])).toEqual([
      [1, 'Paper', 200],
      [2, 'Pens', 20],
    ]);
    expect(voucher).toMatchObject({ total: 220, transportationCost: 150, grandTotal: 370 });
  });

  it('prints a rejected line on its own', () => {
    const voucher = buildModel22Voucher(requests[0], { departments: [], employees: [], requests, items });
    expect(voucher.items.map((l) => l.itemDescription)).toEqual(['Toner']);
  });
});

describe('Issue items (Model 22): the store man', () => {
  const renderIssue = () =>
    render(<StockOutForm availableItems={[item()]} departments={[]} employees={[]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);

  it('names the only store man of the store as who issues it', async () => {
    renderIssue();
    expect(await screen.findByText('Abebe Store Man')).toBeInTheDocument();
    expect(screen.getByText('Issued by (store man)')).toBeInTheDocument();
  });

  it('asks which store man when the store has several', async () => {
    vi.mocked(api.getStores).mockResolvedValue([store([keeper('1', 'Abebe Store Man'), keeper('2', 'Sara Tesfaye')])] as any);
    renderIssue();
    const choice = await screen.findByLabelText(/Issued by \(store man\)/);
    expect(within(choice).getByRole('option', { name: /Sara Tesfaye/ })).toBeInTheDocument();
    expect(within(choice).getByRole('option', { name: /Abebe Store Man/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for approval/ })).toBeEnabled();
  });

  it('only notes that the store has none, says who can fix it, and lets the request go ahead', async () => {
    vi.mocked(api.getStores).mockResolvedValue([store([])] as any);
    renderIssue();
    expect(await screen.findByText(/Kality store has no store man assigned yet, so none is named on the voucher\. Ask the System Administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Issue items (Model 22): inline errors and keyboard', () => {
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const renderIssue = () =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);

  it('starts on the voucher number and says what is wrong once the field has been left empty', async () => {
    const user = userEvent.setup();
    renderIssue();
    const number = screen.getByPlaceholderText('e.g. 0004653/A Inventory');
    expect(number).toHaveFocus();
    expect(screen.queryByText('Enter the number printed on the Model 22 slip.')).toBeNull();
    await user.tab();
    expect(screen.queryByText('Enter the number printed on the Model 22 slip.')).toBeNull();
    await user.type(number, 'M22-001');
    expect(screen.queryByText('Enter the number printed on the Model 22 slip.')).toBeNull();
  });

  it('submits a complete form with Ctrl+Enter', async () => {
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const user = userEvent.setup();
    renderIssue();
    await user.click(screen.getByRole('checkbox', { name: 'Mark as disposal' }));
    const number = screen.getByPlaceholderText('e.g. 0004653/A Inventory');
    await user.type(number, 'M22-020');
    await user.type(screen.getByPlaceholderText(/Expired, damaged beyond repair/), 'Expired');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(api.registerStockOut).toHaveBeenCalledTimes(1);
  });
});

describe('Issue items (Model 22): read from the IFMIS PDF', () => {
  const row = (top: number, ...cells: [number, string][]) => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
  // A Model 22 with the same umbrella on two lines, gloves, and soap that is not in this store
  const MODEL22 = [
    row(64, [297, 'Receipt For Articles Or Property Issued']),
    row(118, [500, 'Model 22 No. :'], [579, '0000031/A Inventory']),
    row(130, [506, 'Issued Date :'], [579, '07-Oct-2026']),
    row(141, [479, 'Transaction Type :'], [579, 'Miscellaneous issue']),
    row(197, [534, 'Qty'], [574, 'Unit Price'], [660, 'Total Amount'], [732, 'Remark']),
    row(205, [24, 'S/No.'], [57, 'Item'], [124, 'Item Description'], [197, 'UOM'], [220, 'Inventory'], [263, 'Item Category']),
    row(216, [29, '1'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms'], [263, 'Other materials'], [534, '1'], [607, '168.75'], [683, '168.75']),
    row(235, [29, '2'], [51, '101102101.0027'], [119, 'Plastic Glove'], [201, 'EA'], [218, 'Uniforms'], [263, 'Office supplies'], [534, '6'], [611, '34.90'], [683, '209.40']),
    row(254, [29, '3'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms'], [263, 'Other materials'], [534, '1'], [607, '168.75'], [683, '168.75']),
    row(273, [29, '4'], [51, '101102101.0028'], [119, 'Powder Soap'], [201, 'EA'], [218, 'Stationery'], [263, 'Office supplies'], [534, '3'], [611, '12.36'], [683, '37.08']),
    row(804, [30, 'Issued By : Name'], [111, ':'], [124, '_____'], [426, 'Received By : Name'], [513, ':'], [530, 'Kebede, Abebe']),
  ];
  const umbrellas = item({ id: 'item-U', itemCode: 'MOA-SUP-0001', name: 'Umbrella', quantity: 10, uom: 'EA', unitCostETB: 168.75, ifmisItemCode: '111101102.0010' });
  const gloves = item({ id: 'item-G', itemCode: 'MOA-SUP-0002', name: 'Plastic glove', quantity: 20, uom: 'EA', unitCostETB: 34.9, ifmisItemCode: '101102101.0027' });
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  // The chosen PDF is shown under the form from a link the browser makes
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:m22');
    URL.revokeObjectURL = vi.fn();
  });

  it('fills the voucher, matches each line to a store item by its IFMIS code, combines repeated codes, and submits the lines together', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValue({ rows: MODEL22, pages: 1, pagesRead: 1 } as any);
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/m22.pdf' } as any);
    vi.mocked(api.registerStockOut).mockResolvedValue({ approval: { id: 'appr-1', itemId: 'item-U' }, approvals: [] } as any);
    const onSuccess = vi.fn();
    render(<StockOutForm availableItems={[umbrellas, gloves]} departments={[department]} employees={[employee]} onCancel={vi.fn()} onSuccess={onSuccess} />);

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'm22.pdf', { type: 'application/pdf' }));
    const note = await screen.findByText(/Filled in from the slip/);
    expect(screen.getByPlaceholderText('e.g. 0004653/A Inventory')).toHaveValue('0000031/A Inventory');
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Miscellaneous issue');
    // The two umbrella lines are one row; soap is not in this store
    expect(note).toHaveTextContent('lines with the same item code are combined: 2 × 111101102.0010');
    expect(note).toHaveTextContent('1 line is not in store under its item code');
    expect(screen.getByLabelText('Quantity to issue')).toHaveValue('2');
    expect(screen.getByLabelText('Item 2 quantity')).toHaveValue('6');
    expect(screen.getByText(/Not in store under this code:/)).toHaveTextContent('101102101.0028 Powder Soap');
    // The employee named on the slip receives them
    expect(screen.getByText('Abebe Kebede (00000001)')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Submit 3 items for approval' });
    expect(submit).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove item 3' }));
    const submit2 = screen.getByRole('button', { name: 'Submit 2 items for approval' });
    expect(submit2).toBeEnabled();
    await user.click(submit2);

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    expect(payload).toMatchObject({
      ifmisSlipNumber: '0000031/A Inventory',
      ifmisSlipDateGc: '2026-10-07',
      transactionType: 'Miscellaneous issue',
      recipientEmployeeId: 'EMP-A',
      targetDepartmentId: 'DEP-1',
      ifmisSlipAttachmentUrl: '/api/uploads/slips/m22.pdf',
      lines: [{ itemId: 'item-U', quantity: 2 }, { itemId: 'item-G', quantity: 6 }],
    });
    // The printed voucher lists both lines, by their IFMIS item code as IFMIS prints them
    expect(onSuccess.mock.calls[0][1].items.map((l: any) => [l.itemCode, l.quantity])).toEqual([['111101102.0010', 2], ['101102101.0027', 6]]);
  });

  // The same umbrella received on two Model 19s: two store records, the older one issued first
  const fromOld = item({ id: 'item-U1', itemCode: 'MOA-SUP-0011', name: 'Umbrella', quantity: 1, uom: 'EA', unitCostETB: 168.75, ifmisItemCode: '111101102.0010', ifmisSlipNumber: '0000044', ifmisSlipDateGc: '2026-08-01' });
  const fromNew = item({ id: 'item-U2', itemCode: 'MOA-SUP-0012', name: 'Umbrella', quantity: 1, uom: 'EA', unitCostETB: 168.75, ifmisItemCode: '111101102.0010', ifmisSlipNumber: '0000051', ifmisSlipDateGc: '2026-09-15' });

  it('takes an item the Model 22 issues from as many receipts as it needs, oldest first', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValue({ rows: MODEL22.filter((r) => !/Plastic Glove|Powder Soap/.test(JSON.stringify(r))), pages: 1, pagesRead: 1 } as any);
    vi.mocked(api.uploadSlip).mockResolvedValue({ url: '/api/uploads/slips/m22.pdf' } as any);
    vi.mocked(api.registerStockOut).mockResolvedValue({ approval: { id: 'appr-1', itemId: 'item-U1' }, approvals: [] } as any);
    render(<StockOutForm availableItems={[fromNew, fromOld]} departments={[department]} employees={[employee]} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'm22.pdf', { type: 'application/pdf' }));

    const note = await screen.findByText(/Filled in from the slip/);
    expect(note).toHaveTextContent('Taken from more than one receipt: 111101102.0010 from 2 receipts (oldest first)');
    expect(screen.getByLabelText('Quantity to issue')).toHaveValue('1');
    expect(screen.getByLabelText('Item 2 quantity')).toHaveValue('1');
    expect(screen.getByText(/part from Model 19 0000044/)).toBeInTheDocument();
    expect(screen.getByText(/part from Model 19 0000051/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit 2 items for approval' }));
    expect(vi.mocked(api.registerStockOut).mock.calls[0][0]).toMatchObject({ lines: [{ itemId: 'item-U1', quantity: 1 }, { itemId: 'item-U2', quantity: 1 }] });
  });

  it('says when the store holds less than the Model 22 issues, and never sends fewer quietly', async () => {
    const user = userEvent.setup();
    // Three umbrellas on the slip; one in store
    const three = MODEL22.filter((r) => !/Plastic Glove|Powder Soap/.test(JSON.stringify(r)))
      .concat([row(240, [29, '3'], [51, '111101102.0010'], [119, 'Umberella'], [201, 'EA'], [218, 'Uniforms'], [263, 'Other materials'], [534, '1'], [607, '168.75'], [683, '168.75'])]);
    vi.mocked(readPdfPages).mockResolvedValue({ rows: three, pages: 1, pagesRead: 1 } as any);
    render(<StockOutForm availableItems={[fromOld]} departments={[department]} employees={[employee]} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'm22.pdf', { type: 'application/pdf' }));

    const note = await screen.findByText(/Filled in from the slip/);
    expect(note).toHaveTextContent('Not enough in store: 111101102.0010 Umberella: the slip issues 3, only 1 in store');
    expect(screen.getByLabelText('Quantity to issue')).toHaveValue('3');
    expect(screen.getByText('Only 1 EA in store')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Submit/ }));
    expect(api.registerStockOut).not.toHaveBeenCalled();
    expect(screen.getAllByText(/More than is in store \(item 1: only 1 EA in store\)/).length).toBeGreaterThan(0);
  });

  it('shows which receipt each store record came from when choosing by hand', async () => {
    const user = userEvent.setup();
    render(<StockOutForm availableItems={[fromOld, fromNew]} departments={[department]} employees={[employee]} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByLabelText('Store item'));
    expect(await screen.findByText(/Model 19 0000044/)).toBeInTheDocument();
    expect(screen.getByText(/Model 19 0000051/)).toBeInTheDocument();
  });

  it('refuses a Model 19 here: it is not attached and fills nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValue({ rows: [row(98, [640, 'Print Model19 Report']), row(146, [680, 'INV Model 19 No. :'], [812, '0000044'])], pages: 1, pagesRead: 1 } as any);
    render(<StockOutForm availableItems={[umbrellas]} departments={[department]} employees={[employee]} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'm19.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/This is a Model 19 receipt/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 0004653/A Inventory')).toHaveValue('');
    expect(screen.queryByText('m19.pdf')).toBeNull();
  });
});

describe('Issue items (Model 22): an organization named on the slip', () => {
  const row = (top: number, ...cells: [number, string][]) => ({ top, cells: cells.map(([x, text]) => ({ x, text })) });
  const slip = (receivedBy: string) => [
    row(64, [297, 'Receipt For Articles Or Property Issued']),
    row(118, [500, 'Model 22 No. :'], [579, '0000040/A Inventory']),
    row(540, [30, 'Issued By : Name'], [111, ':'], [124, '_____'], [426, 'Received By : Name'], [513, ':'], [530, receivedBy]),
  ];
  const renderIssue = () =>
    render(<StockOutForm availableItems={[item()]} departments={[]} employees={[{ id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '1' } as any]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);
  const upload = (user: ReturnType<typeof userEvent.setup>) =>
    user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'm22.pdf', { type: 'application/pdf' }));

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:m22');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(api.getOrganizations).mockResolvedValue([{ id: 'ORG-1', name: 'Oromia Bureau of Agriculture', shortName: 'Oromia BoA', contactPerson: '', isActive: true }] as any);
  });

  it('chooses the listed organization the slip names, by its name or short name', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValue({ rows: slip('Oromia BoA'), pages: 1, pagesRead: 1 } as any);
    renderIssue();
    await screen.findByRole('combobox', { name: /Received by/ });
    await upload(user);
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: /Received by/ })).toHaveTextContent('Oromia Bureau of Agriculture'));
  });

  it('offers to add a name that is neither an employee nor listed, as an organization', async () => {
    const user = userEvent.setup();
    vi.mocked(readPdfPages).mockResolvedValue({ rows: slip('Sidama Bureau of Agriculture'), pages: 1, pagesRead: 1 } as any);
    vi.mocked(api.createOrganization).mockResolvedValue({ id: 'ORG-7', name: 'Sidama Bureau of Agriculture', shortName: '', contactPerson: '', isActive: true } as any);
    renderIssue();
    await upload(user);
    expect(await screen.findByText(/The slip names “Sidama Bureau of Agriculture”, who is not an employee/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add as an organization' }));
    expect(api.createOrganization).toHaveBeenCalledWith({ name: 'Sidama Bureau of Agriculture' });
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: /Received by/ })).toHaveTextContent('Sidama Bureau of Agriculture'));
  });
});

describe('Issue items (Model 22): the unit price, as IFMIS issues it', () => {
  it('is what a unit cost on its Model 19, VAT included: the battery bought at 16,490 + VAT is issued at 18,963.50', () => {
    renderWith(item({ name: 'Battery 12v - 70 Amp', quantity: 2, uom: 'EA', unitCostETB: 16_490, vatApplicable: true, totalAmount: 37_927, costPerUnit: 18_963.5 }));
    const cells = [...screen.getByLabelText('Quantity to issue').closest('tr')!.querySelectorAll('td')].map((td) => td.textContent);
    expect(cells).toContain('18,963.5');
    // Both batteries: the receipt's total
    expect(cells).toContain('37,927');
    expect(screen.getByText(/Grand total/).parentElement).toHaveTextContent('ETB 37,927.00');
  });
});

describe('Issue items (Model 22): what stops Submit, said once by the button', () => {
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const renderIssue = (onCancel = vi.fn()) =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={onCancel} onSuccess={vi.fn()} />);
  const submit = () => screen.getByRole('button', { name: /Submit for approval/ });

  it('stops without a recipient and opens the Received by field, instead of failing on the server', async () => {
    const user = userEvent.setup();
    renderIssue();
    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Still needed before submitting: who receives it (Received by).');
    expect(screen.getByRole('combobox', { name: /Received by/ })).toHaveFocus();
    expect(api.registerStockOut).not.toHaveBeenCalled();
    // No red asterisk on the field
    expect(screen.getByText('Received by').textContent).toBe('Received by');
  });

  it('says once when more is asked than is in store, and opens that quantity', async () => {
    const user = userEvent.setup();
    renderIssue();
    await user.click(screen.getByRole('combobox', { name: /Received by/ }));
    await user.click(await screen.findByRole('option', { name: /Abebe Kebede/ }));
    const qty = screen.getByLabelText('Quantity to issue');
    await user.clear(qty);
    await user.type(qty, '50');
    await user.click(submit());
    const alerts = screen.getAllByText(/More than is in store \(item 1: only 40 BAG in store\)/);
    expect(alerts).toHaveLength(1);
    expect(qty).toHaveFocus();
    expect(api.registerStockOut).not.toHaveBeenCalled();
  });

  it('shows the In store column as a number; the unit is in its own column', () => {
    renderIssue();
    const cells = screen.getByLabelText('Quantity to issue').closest('tr')!.querySelectorAll('td');
    const inStore = cells[[...screen.getAllByRole('columnheader')].findIndex((h) => h.textContent === 'In store')];
    expect(inStore.textContent).toBe('40');
  });

  it('asks before Cancel throws away what was entered', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderIssue(onCancel);
    // Nothing typed yet: Cancel just closes
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText(/Model 22 No/), '0004653/A');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText("Close the form? What you entered won't be saved.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
