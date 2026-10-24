import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackButton } from './BackButton';

describe('<BackButton /> Component', () => {
  it('renders with default accessible label and triggers onBack', async () => {
    const handleBack = vi.fn();
    const user = userEvent.setup();

    render(<BackButton onBack={handleBack} />);

    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Back (Esc)');

    await user.click(button);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('supports custom label and title', () => {
    render(<BackButton label="Back to assets" title="Return to asset list" />);
    const button = screen.getByRole('button', { name: 'Back to assets' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Return to asset list');
  });
});
