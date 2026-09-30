import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast, ToastType, TOAST_EXIT_MS } from './Toast';

describe('<Toast /> UI Component', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    ['success', 'Success Toast', 'Success'],
    ['warning', 'Warning Toast', 'Warning'],
    ['error', 'Error Toast', 'Error'],
    ['info', 'Info Toast', 'Information'],
  ] as [ToastType, string, string][])('renders %s toast type with its icon and screen-reader label', (type, title, label) => {
    const handleClose = vi.fn();
    const { container } = render(
      <Toast title={title} type={type} onClose={handleClose} />
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(`${label}:`)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('announces errors assertively and other types politely', () => {
    const { unmount } = render(<Toast title="Failed" type="error" onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    unmount();

    render(<Toast title="Saved" type="success" onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('triggers onClose after the exit animation when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(
      <Toast
        title="Dismissable Toast"
        type="info"
        onClose={handleClose}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /close notification/i }));

    await waitFor(() => expect(handleClose).toHaveBeenCalledTimes(1));
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

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TOAST_EXIT_MS);
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('pauses the countdown while hovered and resumes with the remaining time', () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();

    render(<Toast title="Hover Toast" duration={1000} onClose={handleClose} />);
    const toast = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(handleClose).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_EXIT_MS);
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
