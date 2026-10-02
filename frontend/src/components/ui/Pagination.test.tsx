import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, pageWindow, usePagination } from './Pagination';

const people = Array.from({ length: 47 }, (_, i) => `Person ${String(i + 1).padStart(2, '0')}`);

/** A small list with a search box, paged like the real tables */
const Demo: React.FC<{ items?: string[] }> = ({ items = people }) => {
  const [search, setSearch] = useState('');
  const filtered = items.filter((p) => p.toLowerCase().includes(search.toLowerCase()));
  const pager = usePagination(filtered, { resetKey: search });
  return (
    <div>
      <input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {pager.pageItems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <Pagination pager={pager} label="people" />
    </div>
  );
};

const shownRows = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('Pagination', () => {
  it('shows the first page and says how many rows there are', () => {
    render(<Demo />);
    expect(shownRows()).toHaveLength(10);
    expect(shownRows()[0]).toBe('Person 01');
    expect(screen.getByText(/Showing/).textContent).toBe('Showing 1–10 of 47 people');
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('moves between pages with next, last and the page numbers', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(shownRows()[0]).toBe('Person 11');
    expect(screen.getByText(/Showing/).textContent).toBe('Showing 11–20 of 47 people');

    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(shownRows()).toEqual(['Person 41', 'Person 42', 'Person 43', 'Person 44', 'Person 45', 'Person 46', 'Person 47']);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(shownRows()[0]).toBe('Person 21');
  });

  it('changes how many rows a page holds, and goes back to page 1', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Page 4' }));
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25');
    expect(shownRows()).toHaveLength(25);
    expect(screen.getByText(/Showing/).textContent).toBe('Showing 1–25 of 47 people');
    expect(screen.getAllByRole('button', { name: /^Page \d+$/ })).toHaveLength(2);
  });

  it('returns to page 1 when the search changes, so a narrower list never lands on an empty page', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    await user.type(screen.getByLabelText('Search'), 'Person 0');
    expect(shownRows()).toEqual(['Person 01', 'Person 02', 'Person 03', 'Person 04', 'Person 05', 'Person 06', 'Person 07', 'Person 08', 'Person 09']);
    expect(screen.getByText(/Showing/).textContent).toBe('Showing 1–9 of 9 people');
    // One page: the controls stay visible, with nothing left to move to
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Page \d+$/ })).toHaveLength(1);
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
  });

  it('shows nothing when there are no rows', () => {
    render(<Demo items={[]} />);
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('keeps long page lists short, always with the first and last page', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 85)).toEqual([1, 2, 3, 4, 'gap', 85]);
    expect(pageWindow(40, 85)).toEqual([1, 'gap', 39, 40, 41, 'gap', 85]);
    expect(pageWindow(85, 85)).toEqual([1, 'gap', 82, 83, 84, 85]);
  });
});
