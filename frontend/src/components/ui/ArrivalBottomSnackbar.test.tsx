import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrivalBottomSnackbar } from './ArrivalBottomSnackbar';

describe('ArrivalBottomSnackbar', () => {
  it('renders title, message, and review button in the bottom snackbar', () => {
    const onReview = vi.fn();
    const onClose = vi.fn();

    render(
      <ArrivalBottomSnackbar
        id="appr-1"
        title="New Model 19 (Receipt) Pending Endorsement"
        message="Voucher #S-101 (HP Laptops) requires your review."
        count={1}
        onReview={onReview}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('New Model 19 (Receipt) Pending Endorsement')).toBeInTheDocument();
    expect(screen.getByText(/Voucher #S-101/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeInTheDocument();
  });

  it('triggers onReview callback when Review button or text is clicked', async () => {
    const onReview = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ArrivalBottomSnackbar
        id="appr-1"
        title="New Model 22 Pending Authorization"
        message="Voucher #M22-99 requires your review."
        count={1}
        onReview={onReview}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('triggers exit animation and onClose callback when Dismiss button is clicked', async () => {
    vi.useFakeTimers();
    const onReview = vi.fn();
    const onClose = vi.fn();

    render(
      <ArrivalBottomSnackbar
        id="appr-1"
        title="New Voucher Arrived"
        message="Pending review."
        count={1}
        onReview={onReview}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i });
    act(() => {
      closeBtn.click();
    });

    // Advance 200ms exit animation
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
