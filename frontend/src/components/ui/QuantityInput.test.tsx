import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantityInput } from './FormKit';

/** Parent form that holds the quantity as a number, like the voucher forms */
const Demo: React.FC<{ initial?: number; min?: number; max?: number }> = ({ initial = 1, min, max }) => {
  const [qty, setQty] = useState(initial);
  return (
    <>
      <label>
        Quantity
        <QuantityInput value={qty} onChange={setQty} min={min} max={max} />
      </label>
      <output data-testid="saved">{qty}</output>
      <button type="button" onClick={() => setQty(1)}>Reset</button>
    </>
  );
};

describe('QuantityInput', () => {
  it('lets the user clear the field and type a larger number', async () => {
    render(<Demo initial={1} min={1} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    expect(field).toHaveValue('');

    await userEvent.type(field, '250');
    expect(field).toHaveValue('250');
    expect(screen.getByTestId('saved')).toHaveTextContent('250');
  });

  it('ignores anything that is not a digit', async () => {
    render(<Demo initial={0} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    await userEvent.type(field, '1a-2.e3');
    expect(field).toHaveValue('123');
    expect(screen.getByTestId('saved')).toHaveTextContent('123');
  });

  it('caps the value at max while typing', async () => {
    render(<Demo initial={1} min={1} max={40} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    await userEvent.type(field, '99');
    expect(field).toHaveValue('40');
    expect(screen.getByTestId('saved')).toHaveTextContent('40');
  });

  it('restores the last valid value when left empty or below min', async () => {
    render(<Demo initial={7} min={1} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    await userEvent.tab();
    expect(field).toHaveValue('7');

    await userEvent.clear(field);
    await userEvent.type(field, '0');
    expect(screen.getByTestId('saved')).toHaveTextContent('7');
    await userEvent.tab();
    expect(field).toHaveValue('7');
  });

  it('follows value changes made by the parent', async () => {
    render(<Demo initial={12} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue('1');
  });
});
