import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockOutForm, buildModel22Voucher } from './IssueForm';
import { api } from '../../api/client';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'encoder', fullNameEn: 'Store Encoder' } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../../api/client', () => ({ api: { registerStockOut: vi.fn(), uploadSlip: vi.fn() } }));

const item = (extra: Record<string, unknown> = {}) =>
  ({ id: 'item-1', itemCode: 'MOA-AG-0001', name: 'Fertilizer', quantity: 40, uom: 'BAG', unitCostETB: 3200, status: 'AVAILABLE', ...extra }) as any;

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
    expect(payload).toMatchObject({ itemId: 'item-1', recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku', destination: 'Oromia Bureau of Agriculture' });
    expect(payload).not.toHaveProperty('recipientEmployeeId');
    expect(payload).not.toHaveProperty('targetDepartmentId');
    // The printed voucher names the person who signs and their organization
    expect(onSuccess.mock.calls[0][1]).toMatchObject({ destination: 'Oromia Bureau of Agriculture', receivedByName: 'Mantegbosh Mirku, Oromia Bureau of Agriculture' });
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
