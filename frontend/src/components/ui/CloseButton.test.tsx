import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CloseButton } from './CloseButton';

describe('<CloseButton /> Component', () => {
  it('renders with default accessible label and triggers onClose and onClick', () => {
    const handleClose = vi.fn();
    const handleClick = vi.fn();
    render(<CloseButton onClose={handleClose} onClick={handleClick} />);

    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Close');

    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('supports custom label and title for specific modals (e.g. Close record, Close modal)', () => {
    render(<CloseButton label="Close record" title="Close (Esc)" />);
    const btn = screen.getByRole('button', { name: 'Close record' });
    expect(btn).toHaveAttribute('title', 'Close (Esc)');
  });

  it('renders different size and tone variants', () => {
    const { rerender } = render(<CloseButton size="sm" tone="dark" />);
    let btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.className).toContain('h-7');
    expect(btn.className).toContain('bg-slate-800');

    rerender(<CloseButton size="lg" tone="ghost" />);
    btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.className).toContain('h-9');
    expect(btn.className).toContain('hover:bg-slate-100');
  });

  it('renders the authentic Fishbowl vector cross SVG icon', () => {
    const { container } = render(<CloseButton />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 18 17');
    const path = svg?.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('d')).toContain('M10.4094 8.28024L17.8394');
  });
});
