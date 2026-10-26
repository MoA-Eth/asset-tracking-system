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

  it('ignores anything that is not a digit or decimal point, accepting float numbers', async () => {
    render(<Demo initial={0} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.type(field, '1a-2.e3');
    expect(field).toHaveValue('12.3');
    expect(screen.getByTestId('saved')).toHaveTextContent('12.3');
  });

  it('allows typing float numbers with decimals', async () => {
    render(<Demo initial={0} />);
    const field = screen.getByLabelText('Quantity');

    await userEvent.type(field, '2.5');
    expect(field).toHaveValue('2.5');
    expect(screen.getByTestId('saved')).toHaveTextContent('2.5');
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

  it('displays available in store when availableInStore is provided', () => {
    render(<QuantityInput value={5} onChange={() => {}} availableInStore={25} uom="EA" />);
    expect(screen.getByTestId('quantity-available-hint')).toHaveTextContent('25 EA in store');
    expect(screen.getByRole('textbox')).toHaveAttribute('title', '25 EA in store');
  });

  it('highlights available in store while editing (focused)', async () => {
    render(<QuantityInput value={5} onChange={() => {}} availableInStore={25} uom="EA" />);
    const field = screen.getByRole('textbox');
    const hint = screen.getByTestId('quantity-available-hint');

    await userEvent.click(field);
    expect(hint).toHaveTextContent('25 EA available in store');
    expect(hint.className).toContain('text-emerald-700');

    await userEvent.tab();
    expect(hint).toHaveTextContent('25 EA in store');
    expect(hint.className).toContain('text-slate-500');
  });

  it('shows warning in red when quantity exceeds available in store', async () => {
    const Component = () => {
      const [val, setVal] = useState(5);
      return <QuantityInput value={val} onChange={setVal} availableInStore={10} uom="BAG" />;
    };
    render(<Component />);
    const field = screen.getByRole('textbox');
    const hint = screen.getByTestId('quantity-available-hint');

    await userEvent.clear(field);
    await userEvent.type(field, '15');

    expect(hint).toHaveTextContent('Only 10 BAG in store');
    expect(hint.className).toContain('text-rose-700');
  });

  it('displays out of stock message when availableInStore is 0', () => {
    render(<QuantityInput value={0} onChange={() => {}} availableInStore={0} uom="PCS" />);
    const hint = screen.getByTestId('quantity-available-hint');
    expect(hint).toHaveTextContent('0 PCS in store (out of stock)');
    expect(hint.className).toContain('text-rose-700');
  });
});
