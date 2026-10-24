import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  broadcastApprovalsUpdated,
  useRealtimeSync,
  REALTIME_EVENT,
  REALTIME_STORAGE_KEY,
} from './realtime-sync';

describe('realtime-sync utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('broadcastApprovalsUpdated dispatches a window event and updates localStorage', () => {
    const listener = vi.fn();
    window.addEventListener(REALTIME_EVENT, listener);

    broadcastApprovalsUpdated({ testId: 'abc' });

    expect(listener).toHaveBeenCalled();
    const eventDetail = listener.mock.calls[0][0].detail;
    expect(eventDetail.testId).toBe('abc');
    expect(eventDetail.type).toBe(REALTIME_EVENT);
    expect(localStorage.getItem(REALTIME_STORAGE_KEY)).toBeTruthy();

    window.removeEventListener(REALTIME_EVENT, listener);
  });

  it('useRealtimeSync responds to REALTIME_EVENT', () => {
    const onUpdate = vi.fn();
    renderHook(() => useRealtimeSync(onUpdate, { intervalMs: 0 }));

    expect(onUpdate).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent(REALTIME_EVENT));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('useRealtimeSync periodically polls when enabled', () => {
    const onUpdate = vi.fn();
    renderHook(() => useRealtimeSync(onUpdate, { intervalMs: 30000, enabled: true }));

    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30000);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('useRealtimeSync pauses periodic polling when enabled is false', () => {
    const onUpdate = vi.fn();
    renderHook(() => useRealtimeSync(onUpdate, { intervalMs: 30000, enabled: false }));

    vi.advanceTimersByTime(60000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('useRealtimeSync triggers on tab visibility change to visible after throttle delay', () => {
    const onUpdate = vi.fn();
    renderHook(() => useRealtimeSync(onUpdate, { intervalMs: 0, throttleMs: 2000 }));

    vi.advanceTimersByTime(2500);

    // Simulate tab focus
    window.dispatchEvent(new Event('focus'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
