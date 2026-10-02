import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportCharts } from './ReportCharts';

const item = (id: string, category: string, unitCostETB: number, balance: object, extra: object = {}) =>
  ({ id, category, unitCostETB, balance: { total: 0, issued: 0, available: 0, pending: 0, ...balance }, quantity: 1, ...extra }) as any;

const departments = [
  { id: 'D1', code: 'EXT', nameEn: 'Agricultural Extension', nameAm: '' },
  { id: 'D2', code: 'PROP', nameEn: 'Property Administration', nameAm: '' },
] as any;

const items = [
  item('i1', 'VEHICLE', 1_000_000, { total: 1, issued: 1 }, { currentCustodianId: 'E1', assignedDepartmentId: 'D1', quantity: 1 }),
  item('i2', 'IT_EQUIPMENT', 500, { total: 50, issued: 10, available: 40 }),
  item('i3', 'IT_EQUIPMENT', 8_000, { total: 1, pending: 1 }),
];
// 10 of i2's units were issued in part: they live on a split record
const splits = new Map([['i2', [item('i2-1', 'IT_EQUIPMENT', 500, {}, { currentCustodianId: 'E2', assignedDepartmentId: 'D2', quantity: 10, parentItemId: 'i2' })]]]);
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;
const show = (list = items) => render(<ReportCharts items={list} splitsByRoot={splits} departments={departments} unitsOf={(i) => i.balance.total} />);

describe('ReportCharts', () => {
  it('shows where the units are, with a total and shares that add up', () => {
    show();
    const donut = card('Where the units are');
    expect(within(donut).getByRole('img')).toHaveAccessibleName('Units by where they are: In store 40, Issued 11, Awaiting approval 1');
    const rows = within(donut).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['In store4077%', 'Issued1121%', 'Awaiting approval12%']);
    expect(donut).toHaveTextContent('52');
  });

  it('ranks categories by value, largest first', () => {
    show();
    const rows = within(card('Value by category')).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['VehiclesETB 1.00M', 'IT equipmentETB 33K']);
  });

  it('counts issued units by the directorate that holds them, including units issued in part', () => {
    show();
    const rows = within(card('Issued units by directorate')).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toMatch(/Property Administration.*10 units$/);
    expect(rows[1]).toMatch(/Agricultural Extension.*1 unit$/);
  });

  it('says so when the filters leave nothing to draw', () => {
    show([]);
    expect(screen.getByText('No units match these filters.')).toBeInTheDocument();
    expect(screen.getByText('No value to show for these filters.')).toBeInTheDocument();
    expect(screen.getByText('Nothing in this report is issued.')).toBeInTheDocument();
  });

  it('can be folded away', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Summary/ }));
    expect(screen.queryByRole('heading', { name: 'Value by category' })).not.toBeInTheDocument();
  });
});
