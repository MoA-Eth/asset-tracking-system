import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, MoneyInput, FormFooter } from './FormKit';

const Demo: React.FC<{ initial?: number }> = ({ initial = 0 }) => {
  const [amount, setAmount] = useState(initial);
  return (
    <>
      <label htmlFor="amount">Amount</label>
      <MoneyInput id="amount" value={amount} onChange={setAmount} />
      <output data-testid="saved">{amount}</output>
    </>
  );
};

describe('MoneyInput', () => {
  it('shows thousands separators and the currency when you are not typing', () => {
    render(<Demo initial={1250000.5} />);
    expect(screen.getByLabelText('Amount')).toHaveValue('1,250,000.5');
    expect(screen.getByText('ETB')).toBeInTheDocument();
  });

  it('shows the plain number while typing, drops anything but digits and one point, and saves a number', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const input = screen.getByLabelText('Amount');
    await user.click(input);
    await user.type(input, '12a,500.7.9');
    expect(input).toHaveValue('12500.79');
    expect(screen.getByTestId('saved')).toHaveTextContent('12500.79');
    await user.tab();
    expect(input).toHaveValue('12,500.79');
  });

  it('is empty, not 0, when there is no amount', () => {
    render(<Demo />);
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });
});

describe('Field error', () => {
  it('shows what is wrong in place of the hint', () => {
    render(
      <Field label="Book" required hint="Book the form comes from" error="Enter the book this form comes from.">
        <input aria-label="book" />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the book this form comes from.');
    expect(screen.queryByText('Book the form comes from')).toBeNull();
  });

  it('keeps showing the hint when there is no error', () => {
    render(
      <Field label="Book" hint="Book the form comes from">
        <input aria-label="book" />
      </Field>,
    );
    expect(screen.getByText('Book the form comes from')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('FormFooter', () => {
  it('names what is still needed, up to four, and how many more', () => {
    render(<FormFooter accent="emerald" submitting={false} submitLabel="Submit" onCancel={() => {}} missingFields={['asset', 'Model 21 No.', 'book', 'recipient', 'reason']} />);
    expect(screen.getByText('Fill in all required fields (*) to submit', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Still needed: asset, Model 21 No., book, recipient and 1 more')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });
});
