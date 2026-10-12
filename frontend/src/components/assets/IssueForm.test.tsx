import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockOutForm, buildModel22Voucher } from './IssueForm';
import { api } from '../../api/client';
import { loadSystemSettings } from '../../utils/system-settings';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'encoder', fullNameEn: 'Store Encoder' } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../../api/client', () => ({ api: { registerStockOut: vi.fn(), uploadSlip: vi.fn(), getStores: vi.fn(), getSystemSettings: vi.fn() } }));

const store = (storeKeepers: any[]) => ({
  id: 'S1', name: 'Kality store', address: '', isActive: true, locations: [{ id: 'LOC-1', storeId: 'S1', name: 'Shelf A', isActive: true }], storeKeepers,
});
const keeper = (id: string, name: string) => ({ employeeId: id, fullNameEn: name, fullNameAm: '', payrollId: `000${id}`, isActive: true });
beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(api.getSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'OPTIONAL', storeManPolicy: 'OPTIONAL' });
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
    const field = screen.getByText('Unit of measure').closest('label')!.parentElement!;
    expect(field).toHaveTextContent('BAG');
    expect(field.querySelector('input')).toBeNull();
    expect(screen.getAllByText(/40 BAG in store/).length).toBeGreaterThan(0);
  });

  it('counts items saved before units were recorded in EA, as the server does', () => {
    renderWith(item({ uom: undefined }));
    expect(screen.getAllByText(/40 EA in store/).length).toBeGreaterThan(0);
  });
});

describe('Issue items (Model 22): internal or external recipient', () => {
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const renderIssue = (onSuccess = vi.fn()) =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={onSuccess} />);
  const submit = () => screen.getByRole('button', { name: /Submit for approval/ });

  it('asks for an employee and directorate when internal, and for an organization and contact person when external', async () => {
    const user = userEvent.setup();
    renderIssue();
    expect(screen.getByRole('radio', { name: 'Internal (employee)' })).toBeChecked();
    expect(screen.getByText('Received by (recipient)')).toBeInTheDocument();
    expect(screen.getByText('Destination directorate')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Organization/)).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'External (organization)' }));
    expect(screen.getByLabelText(/Organization/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact person/)).toBeInTheDocument();
    expect(screen.queryByText('Received by (recipient)')).toBeNull();
    expect(screen.queryByText('Destination directorate')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Internal (employee)' }));
    expect(screen.getByText('Received by (recipient)')).toBeInTheDocument();
  });

  it('sends the organization and contact person, with no employee or directorate', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const onSuccess = vi.fn();
    renderIssue(onSuccess);

    await user.click(screen.getByRole('radio', { name: 'External (organization)' }));
    expect(submit()).toBeDisabled();
    await user.type(screen.getByPlaceholderText('e.g. 0004653/A Inventory'), 'M22-001');
    await user.type(screen.getByPlaceholderText('e.g. Move Order Issue for Agricultural Operations'), 'Programme support');
    // Everything but the organization is filled in: Submit is still off
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText(/Organization/), ' Oromia Bureau of Agriculture ');
    await user.type(screen.getByLabelText(/Contact person/), 'Mantegbosh Mirku');
    expect(submit()).toBeEnabled();
    await user.click(submit());

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    // The store's only store man issues it, and is named on the request
    expect(payload).toMatchObject({ issuedByEmployeeId: '1' });
    expect(payload).toMatchObject({ itemId: 'item-1', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku', destination: 'Oromia Bureau of Agriculture' });
    expect(payload).not.toHaveProperty('recipientEmployeeId');
    expect(payload).not.toHaveProperty('targetDepartmentId');
    // The printed voucher names the person who signs and their organization
    expect(onSuccess.mock.calls[0][1]).toMatchObject({
      destination: 'Oromia Bureau of Agriculture', receivedByName: 'Mantegbosh Mirku, Oromia Bureau of Agriculture', issuedByName: 'Abebe Store Man',
    });
  });
});

describe('Issue items (Model 22): remembered values and used numbers', () => {
  const department = { id: 'DEP-1', nameEn: 'Plant Protection', nameAm: '' } as any;
  const employee = { id: 'EMP-A', fullNameEn: 'Abebe Kebede', payrollId: '00000001', departmentId: 'DEP-1' } as any;
  const renderIssue = () =>
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={vi.fn()} />);

  it('offers the number after the last one this person used, and fills it in on request', async () => {
    window.localStorage.setItem('moa_form_encoder_issue', JSON.stringify({ model22No: 'M22-009', transactionType: 'Direct Store Issue' }));
    const user = userEvent.setup();
    renderIssue();
    // The transaction type is the one used last time
    expect(screen.getByLabelText(/Transaction type/)).toHaveValue('Direct Store Issue');
    await user.click(screen.getByRole('button', { name: /Use M22-010/ }));
    expect(screen.getByPlaceholderText('e.g. 0004653/A Inventory')).toHaveValue('M22-010');
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

  it('has a Disposal transaction type that replaces the recipient with a reason, and sends no recipient', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const onSuccess = vi.fn();
    render(<StockOutForm availableItems={[item()]} departments={[department]} employees={[employee]} initialItemId="item-1" onCancel={vi.fn()} onSuccess={onSuccess} />);

    await user.selectOptions(screen.getByLabelText(/Transaction type/), 'Disposal');
    expect(screen.queryByText('Received by (recipient)')).toBeNull();
    expect(screen.queryByText('Destination directorate')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'External (organization)' })).toBeNull();

    const submit = screen.getByRole('button', { name: /Submit for approval/ });
    await user.type(screen.getByPlaceholderText('e.g. 0004653/A Inventory'), 'M22-009');
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Expired, damaged beyond repair/), 'Expired');
    expect(submit).toBeEnabled();
    await user.click(submit);

    const payload = vi.mocked(api.registerStockOut).mock.calls[0][0];
    expect(payload).toMatchObject({ itemId: 'item-1', disposal: true, transactionType: 'Disposal', purpose: 'Expired' });
    expect(payload).not.toHaveProperty('recipientEmployeeId');
    expect(payload).not.toHaveProperty('targetDepartmentId');
    expect(onSuccess.mock.calls[0][1]).toMatchObject({ transactionType: 'Disposal', destination: 'Disposal (write-off)', receivedByName: '—' });
  });

  it('prints a recorded disposal as a Disposal, with no recipient', () => {
    const voucher = buildModel22Voucher(
      { id: 'a1', transactionType: 'STOCK_OUT', itemId: 'item-1', itemCode: 'MOA-1', itemName: 'Paper', ifmisSlipNumber: 'M22-009', status: 'PENDING', currentStage: 1, purposeOrRemarks: 'Expired', requestDetails: { quantity: 3, disposal: true } } as any,
      { employees: [], departments: [], item: undefined } as any,
    );
    expect(voucher).toMatchObject({ transactionType: 'Disposal', destination: 'Disposal (write-off)', receivedByName: '—' });
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
    expect(screen.getByRole('button', { name: /Submit for approval/ })).toBeDisabled();
  });

  it('says so, and cannot be submitted, when the store has no store man and the rule is on', async () => {
    vi.mocked(api.getSystemSettings).mockResolvedValue({ slipAttachmentPolicy: 'OPTIONAL', storeManPolicy: 'REQUIRED' });
    await loadSystemSettings();
    vi.mocked(api.getStores).mockResolvedValue([store([])] as any);
    renderIssue();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Kality store has no store man assigned.*Settings → Stores/);
    expect(screen.getByRole('button', { name: /Submit for approval/ })).toBeDisabled();
  });

  it('only notes that the store has none, and carries on, while the rule is off', async () => {
    vi.mocked(api.getStores).mockResolvedValue([store([])] as any);
    renderIssue();
    expect(await screen.findByText(/Kality store has no store man assigned yet, so none is named on the voucher/)).toBeInTheDocument();
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
    expect(screen.getByText('Enter the number printed on the Model 22 slip.')).toBeInTheDocument();
    await user.type(number, 'M22-001');
    expect(screen.queryByText('Enter the number printed on the Model 22 slip.')).toBeNull();
  });

  it('submits a complete form with Ctrl+Enter, and not an incomplete one', async () => {
    vi.mocked(api.registerStockOut).mockResolvedValue({ id: 'appr-1' } as any);
    const user = userEvent.setup();
    renderIssue();
    await user.selectOptions(screen.getByLabelText(/Transaction type/), 'Disposal');
    const number = screen.getByPlaceholderText('e.g. 0004653/A Inventory');
    await user.type(number, 'M22-020');
    // The reason is still missing
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(api.registerStockOut).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Expired, damaged beyond repair/), 'Expired');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(api.registerStockOut).toHaveBeenCalledTimes(1);
  });
});
