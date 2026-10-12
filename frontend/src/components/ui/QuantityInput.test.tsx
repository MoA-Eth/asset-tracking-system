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
  it('lets the user clear the field and type any number', async () => {
    render(<Demo initial={1} min={1} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    expect(field).toHaveValue('');

    await userEvent.type(field, '250');
    expect(field).toHaveValue('250');
    expect(screen.getByTestId('saved')).toHaveTextContent('250');
  });

  it('shows 0 as the placeholder when empty, and counts an empty field as 0', async () => {
    render(<Demo initial={5} min={1} />);
    const field = screen.getByLabelText('Quantity');
    await userEvent.clear(field);
    expect(field).toHaveAttribute('placeholder', '0');
    expect(field).toHaveValue('');
    expect(screen.getByTestId('saved')).toHaveTextContent('0');
  });

  it('starts empty, with the 0 placeholder, when the value is 0', () => {
    render(<Demo initial={0} />);
    const field = screen.getByLabelText('Quantity');
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', '0');
  });

  it('ignores anything that is not a digit', async () => {
    render(<Demo initial={0} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.type(field, '1a-2.e3');
    expect(field).toHaveValue('123');
    expect(screen.getByTestId('saved')).toHaveTextContent('123');
  });

  it('does not cap or rewrite a number above max: it is marked as wrong instead', async () => {
    render(<Demo initial={1} min={1} max={40} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    await userEvent.type(field, '99');
    expect(field).toHaveValue('99');
    expect(screen.getByTestId('saved')).toHaveTextContent('99');
    expect(field).toHaveAttribute('aria-invalid', 'true');

    // Back within range: no longer marked
    await userEvent.clear(field);
    await userEvent.type(field, '12');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('marks 0 as wrong when the smallest allowed is 1, and leaves it as typed', async () => {
    render(<Demo initial={7} min={1} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.clear(field);
    await userEvent.type(field, '0');
    expect(field).toHaveValue('0');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await userEvent.tab();
    expect(field).toHaveValue('0');
    expect(screen.getByTestId('saved')).toHaveTextContent('0');
  });

  it('keeps an empty field empty when it is left', async () => {
    render(<Demo initial={7} min={1} />);
    const field = screen.getByLabelText('Quantity');
    await userEvent.clear(field);
    await userEvent.tab();
    expect(field).toHaveValue('');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('follows value changes made by the parent', async () => {
    render(<Demo initial={12} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue('1');
  });
});
