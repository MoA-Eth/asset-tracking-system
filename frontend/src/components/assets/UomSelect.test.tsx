import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UomSelect } from './UomSelect';
import { COMMON_UOMS } from './receipt-options';

describe('UomSelect: unit of measure selection and custom entry', () => {
  it('renders a select dropdown with all standard units', () => {
    render(<UomSelect value="EA" onChange={vi.fn()} />);

    const select = screen.getByLabelText('Unit of measure') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('EA');

    // All standard units should be present in the dropdown options
    for (const uom of COMMON_UOMS) {
      expect(screen.getByRole('option', { name: uom })).toBeInTheDocument();
    }
  });

  it('selects another unit from the dropdown', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<UomSelect value="EA" onChange={handleChange} />);

    const select = screen.getByLabelText('Unit of measure');
    await user.selectOptions(select, 'KG');

    expect(handleChange).toHaveBeenCalledWith('KG');
  });

  it('includes non-standard unit read from slip as an option', () => {
    render(<UomSelect value="TON" onChange={vi.fn()} />);

    const select = screen.getByLabelText('Unit of measure') as HTMLSelectElement;
    expect(select.value).toBe('TON');
    expect(screen.getByRole('option', { name: 'TON' })).toBeInTheDocument();
  });

  it('switches to custom text input when Other is selected', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [uom, setUom] = useState('EA');
      return <UomSelect value={uom} onChange={setUom} />;
    };
    render(<Wrapper />);

    const select = screen.getByLabelText('Unit of measure');
    await user.selectOptions(select, '__OTHER__');

    // Input appears
    const input = screen.getByLabelText('Unit of measure') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');

    await user.type(input, 'bundle');
    expect(input.value).toBe('BUNDLE');

    // Clicking close button returns to standard select
    const backBtn = screen.getByLabelText('Back to standard units');
    await user.click(backBtn);

    const selectAgain = screen.getByLabelText('Unit of measure');
    expect(selectAgain.tagName).toBe('SELECT');
  });
});
