import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortableHeader } from './SortableHeader';

describe('SortableHeader component', () => {
  it('renders with label and unsorted aria-sort attribute', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Full Name" columnKey="name" onSort={onSort} />
          </tr>
        </thead>
      </table>
    );

    const th = screen.getByRole('columnheader', { name: /Full Name/i });
    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('button', { name: /Full Name/i })).toBeInTheDocument();
  });

  it('renders ascending and descending sort states correctly', () => {
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Full Name"
              columnKey="name"
              currentSortColumn="name"
              currentSortDirection="asc"
              onSort={() => {}}
            />
          </tr>
        </thead>
      </table>
    );

    expect(screen.getByRole('columnheader', { name: /Full Name/i })).toHaveAttribute('aria-sort', 'ascending');

    rerender(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Full Name"
              columnKey="name"
              currentSortColumn="name"
              currentSortDirection="desc"
              onSort={() => {}}
            />
          </tr>
        </thead>
      </table>
    );

    expect(screen.getByRole('columnheader', { name: /Full Name/i })).toHaveAttribute('aria-sort', 'descending');
  });

  it('triggers onSort when clicked', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Status" columnKey="status" onSort={onSort} />
          </tr>
        </thead>
      </table>
    );

    await user.click(screen.getByRole('button', { name: /Status/i }));
    expect(onSort).toHaveBeenCalledWith('status');
  });
});
