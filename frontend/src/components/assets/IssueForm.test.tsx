import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockOutForm } from './IssueForm';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'encoder', fullNameEn: 'Store Encoder' } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('../../api/client', () => ({ api: {} }));

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
