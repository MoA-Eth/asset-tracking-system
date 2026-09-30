import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ToastProvider, useToast } from './ToastContext';

// Helper component to trigger various toasts
const TestToastConsumer: React.FC = () => {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Operation Successful', 'Asset has been verified in store.')}>
        Trigger Success
      </button>
      <button onClick={() => toast.error('Approval Rejected', 'Missing mandatory invoice document.')}>
        Trigger Error
      </button>
      <button onClick={() => toast.warning('Low Stock Alert', 'Consumables inventory is below threshold.')}>
        Trigger Warning
      </button>
      <button onClick={() => toast.info('System Sync', 'Background data sync completed.')}>
        Trigger Info
      </button>
      <button onClick={() => toast.success('Quick Dismiss', 'Dismisses quickly', 500)}>
        Trigger Short Toast
      </button>
    </div>
  );
};

describe('ToastContext & ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws an error when useToast is used outside of ToastProvider', () => {
    // Suppress console.error for expected thrown error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestToastConsumer />)).toThrow(
      'useToast must be used within a ToastProvider'
    );

    spy.mockRestore();
  });

  it('renders and displays a success toast when triggered', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /trigger success/i }));

    expect(screen.getByText('Operation Successful')).toBeInTheDocument();
    expect(screen.getByText('Asset has been verified in store.')).toBeInTheDocument();
  });

  it('renders an error toast when triggered', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /trigger error/i }));

    expect(screen.getByText('Approval Rejected')).toBeInTheDocument();
    expect(screen.getByText('Missing mandatory invoice document.')).toBeInTheDocument();
  });

  it('renders warning and info toasts with appropriate content', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /trigger warning/i }));
    await user.click(screen.getByRole('button', { name: /trigger info/i }));

    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
    expect(screen.getByText('System Sync')).toBeInTheDocument();
  });

  it('allows manual dismissal of a toast via close button', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /trigger success/i }));

    const toastTitle = screen.getByText('Operation Successful');
    expect(toastTitle).toBeInTheDocument();

    // Click close button on the toast
    const closeButtons = screen.getAllByRole('button');
    const toastCloseBtn = closeButtons.find((btn) => btn.querySelector('svg'));
    if (toastCloseBtn) {
      await user.click(toastCloseBtn);
      await waitFor(() => expect(screen.queryByText('Operation Successful')).not.toBeInTheDocument());
    }
  });

  it('automatically dismisses toast when duration timer elapses', async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    // Trigger toast with 500ms duration
    const btn = screen.getByRole('button', { name: /trigger short toast/i });
    act(() => {
      btn.click();
    });

    expect(screen.getByText('Quick Dismiss')).toBeInTheDocument();

    // Advance timers past duration plus the exit animation
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Quick Dismiss')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows newest first and keeps at most four toasts', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /trigger success/i }));
    await user.click(screen.getByRole('button', { name: /trigger error/i }));
    await user.click(screen.getByRole('button', { name: /trigger warning/i }));
    await user.click(screen.getByRole('button', { name: /trigger info/i }));
    await user.click(screen.getByRole('button', { name: /trigger short toast/i }));

    const region = screen.getByRole('region', { name: /notifications/i });
    const titles = [...region.querySelectorAll('p.font-semibold')].map((p) => p.textContent);
    expect(titles).toEqual(['Quick Dismiss', 'System Sync', 'Low Stock Alert', 'Approval Rejected']);
    expect(screen.queryByText('Operation Successful')).not.toBeInTheDocument();
  });
});
