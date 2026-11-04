import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { slipStatusSummary, SlipStatus, SlipUnitCost } from './SlipRecord';
import { AssetRow } from './asset-state';

const row = (id: string, state: string, request?: object, cost = 0) =>
  ({
    item: { id, name: `Item ${id}`, unitCostETB: cost },
    state,
    request,
    units: 1,
  }) as unknown as AssetRow;

describe('where the items of a Model 19 stand', () => {
  it('says an item is partly issued when some of its units are out', () => {
    const laptops = row('laptops', 'IN_STORE');
    const printers = row('printers', 'REQUEST_PENDING', { transactionType: 'STOCK_OUT', status: 'PENDING' });
    expect(slipStatusSummary([laptops, printers], new Set(['laptops']))).toBe('1 partly issued · 1 issue pending');
    // None of its units out: in store
    expect(slipStatusSummary([laptops, printers])).toBe('1 in store · 1 issue pending');
  });

  it('renders single status when all items share the same state', () => {
    const item1 = row('1', 'IN_STORE');
    const item2 = row('2', 'IN_STORE');
    render(<SlipStatus rows={[item1, item2]} />);
    expect(screen.getByText('In store')).toBeInTheDocument();
    expect(screen.queryByLabelText('View status breakdown')).not.toBeInTheDocument();
  });

  it('renders a single primary status chip for mixed items with full breakdown in tooltip', () => {
    const item1 = row('1', 'IN_STORE');
    const item2 = row('2', 'IN_STORE');
    const item3 = row('3', 'REQUEST_PENDING', { transactionType: 'DISPOSAL', status: 'PENDING' });
    const item4 = row('4', 'REQUEST_PENDING', { transactionType: 'STOCK_OUT', status: 'PENDING' });

    render(<SlipStatus rows={[item1, item2, item3, item4]} />);

    // Single primary status chip (priority: pending over in-store)
    const chip = screen.getByText('2 Pending');
    expect(chip).toBeInTheDocument();
    expect(screen.queryByText('2 In store')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('View status breakdown')).not.toBeInTheDocument();
  });
});

describe('SlipUnitCost', () => {
  it('renders identical cost formatted for all items with the same price', () => {
    const item1 = row('1', 'IN_STORE', undefined, 120000);
    const item2 = row('2', 'IN_STORE', undefined, 120000);
    render(<SlipUnitCost rows={[item1, item2]} />);
    expect(screen.getByText('ETB 120,000.00')).toBeInTheDocument();
    expect(screen.queryByLabelText('View unit cost details')).not.toBeInTheDocument();
  });

  it('renders compact types chip and opens Unit Cost Details popover on button click', () => {
    const item1 = row('1', 'IN_STORE', undefined, 0); // Varies / unpriced
    const item2 = row('2', 'IN_STORE', undefined, 120000);
    const item3 = row('3', 'IN_STORE', undefined, 120000);
    const item4 = row('4', 'IN_STORE', undefined, 120000);
    const onViewDetails = vi.fn();

    render(<SlipUnitCost rows={[item1, item2, item3, item4]} onViewDetails={onViewDetails} />);

    // Compact badge
    expect(screen.getByText('2 types')).toBeInTheDocument();

    // Trigger button
    const btn = screen.getByLabelText('View unit cost details');
    expect(btn).toBeInTheDocument();

    // Click to open Unit Cost Details popover
    fireEvent.click(btn);
    expect(screen.getByText('Unit Cost Details')).toBeInTheDocument();
    expect(screen.getByText('Varies')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByText('ETB 120,000.00')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();

    // Click View all details
    const viewBtn = screen.getByText('View all details');
    fireEvent.click(viewBtn);
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
