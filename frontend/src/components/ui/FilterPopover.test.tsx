import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPopover } from './FilterPopover';

describe('FilterPopover clear button', () => {
  it('shows Clear beside the trigger while filters are active, and clears without opening the popover', () => {
    const onReset = vi.fn();
    render(
      <FilterPopover activeCount={2} onReset={onReset}>
        <div>filters</div>
      </FilterPopover>
    );

    const trigger = screen.getByRole('button', { name: /Filter \(2 active\)/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides Clear when no filter is active', () => {
    render(
      <FilterPopover activeCount={0} onReset={vi.fn()}>
        <div>filters</div>
      </FilterPopover>
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('uses the page’s own clear action and visibility when given (e.g. to also clear search)', () => {
    const onReset = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterPopover activeCount={0} onReset={onReset} onClear={onClear} showClear>
        <div>filters</div>
      </FilterPopover>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
  });
});
