import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormFooter } from './FormKit';

const footer = (props: Partial<React.ComponentProps<typeof FormFooter>> = {}) =>
  render(
    <form>
      <FormFooter accent="emerald" submitting={false} submitLabel="Submit for approval" onCancel={vi.fn()} {...props} />
    </form>,
  );

describe('FormFooter', () => {
  it('is ready to submit when nothing required is missing', () => {
    footer({ missingFields: [] });
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled();
    expect(screen.queryByText(/Fill in all required fields/)).toBeNull();
  });

  it('keeps Submit off and says why while a required field is missing', () => {
    footer({ missingFields: ['Model 22 No.', 'recipient'] });
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    expect(screen.getByText('Fill in all required fields (*) to submit')).toBeInTheDocument();
  });

  it('keeps Submit off while saving, and Cancel stays available', () => {
    footer({ submitting: true });
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
