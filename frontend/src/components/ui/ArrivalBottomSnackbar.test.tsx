import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrivalBottomSnackbar } from './ArrivalBottomSnackbar';

describe('ArrivalBottomSnackbar', () => {
  it('renders title, message, and review action', async () => {
    const onReview = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ArrivalBottomSnackbar
        id="notif-1"
        title="New Model 19 (Receipt) Pending Endorsement"
        message="Voucher #S-101 (Laptops) requires your review."
        count={1}
        duration={5000}
        onReview={onReview}
        onClose={onClose}
      />
    );

    expect(screen.getByText('New Model 19 (Receipt) Pending Endorsement')).toBeInTheDocument();
    expect(screen.getByText('Voucher #S-101 (Laptops) requires your review.')).toBeInTheDocument();

    const reviewBtn = screen.getByRole('button', { name: /review/i });
    await user.click(reviewBtn);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('renders multi-voucher badge when count is greater than 1', () => {
    render(
      <ArrivalBottomSnackbar
        id="notif-2"
        title="3 New Requests Pending Approval"
        message="New vouchers have arrived in your queue."
        count={3}
        onReview={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('3 vouchers')).toBeInTheDocument();
  });

  it('triggers dismiss when the close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ArrivalBottomSnackbar
        id="notif-3"
        title="Title"
        message="Message"
        onReview={vi.fn()}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByLabelText('Dismiss notification');
    await user.click(closeBtn);
    // After exit animation (200ms)
    await new Promise((r) => setTimeout(r, 250));
    expect(onClose).toHaveBeenCalled();
  });
});
