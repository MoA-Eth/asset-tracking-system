import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toast, ToastType } from './Toast';

describe('<Toast /> UI Component', () => {
  it('renders title and message correctly', () => {
    const handleClose = vi.fn();
    render(
      <Toast
        title="Asset Registered"
        message="Model 19 GRN generated: MOA-M19-2016-0042"
        type="success"
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Asset Registered')).toBeInTheDocument();
    expect(
      screen.getByText('Model 19 GRN generated: MOA-M19-2016-0042')
    ).toBeInTheDocument();
  });

  it.each([
    ['success', 'Success Toast'],
    ['warning', 'Warning Toast'],
    ['error', 'Error Toast'],
    ['info', 'Info Toast'],
  ] as [ToastType, string][])('renders %s toast type correctly', (type, title) => {
    const handleClose = vi.fn();
    const { container } = render(
      <Toast title={title} type={type} onClose={handleClose} />
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('triggers onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(
      <Toast
        title="Dismissable Toast"
        type="info"
        onClose={handleClose}
      />
    );

    const user = userEvent.setup();
    const closeBtn = screen.getByRole('button');
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when timer completes', () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();

    render(
      <Toast
        title="Timed Toast"
        duration={1000}
        onClose={handleClose}
      />
    );

    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
