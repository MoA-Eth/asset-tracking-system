import { useEffect, useRef } from 'react';

export const REALTIME_EVENT = 'moa_approvals_updated';
export const REALTIME_STORAGE_KEY = 'moa_approvals_updated_ts';
export const REALTIME_CHANNEL_NAME = 'moa_realtime_sync';

// Singleton cross-tab broadcast channel
let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    channel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === REALTIME_EVENT) {
        window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: event.data }));
      }
    };
  } catch (err) {
    console.warn('BroadcastChannel initialization failed, falling back to storage events:', err);
  }
}

// Fallback for environments where BroadcastChannel is unavailable or across windows
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === REALTIME_STORAGE_KEY && event.newValue) {
      window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { timestamp: Number(event.newValue) } }));
    }
  });
}

/**
 * Broadcasts an approvals / inventory update event across all tabs and components.
 */
export function broadcastApprovalsUpdated(details?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  const payload = { type: REALTIME_EVENT, timestamp: Date.now(), ...(details || {}) };

  // 1. Dispatch locally in current window
  window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: payload }));

  // 2. Broadcast to other open tabs via BroadcastChannel
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {}
  }

  // 3. Update localStorage timestamp to notify other tabs via storage event
  try {
    localStorage.setItem(REALTIME_STORAGE_KEY, String(payload.timestamp));
  } catch {}
}

export interface RealtimeSyncOptions {
  /** Periodic polling interval in ms (default: 30000ms = 30s). Set to 0 to disable periodic polling */
  intervalMs?: number;
  /** Whether auto-refresh is enabled (e.g. set to false while actively editing a form modal) */
  enabled?: boolean;
  /** Minimum delay between focus/visibility refetches in ms (default: 4000ms) */
  throttleMs?: number;
}

/**
 * Hook to automatically keep components fresh:
 * 1. Responds to local & cross-tab `moa_approvals_updated` events
 * 2. Refetches when tab becomes visible again (`visibilitychange` / `focus`)
 * 3. Periodically polls in the background while the tab is active
 */
export function useRealtimeSync(
  onUpdate: () => void,
  options: RealtimeSyncOptions = {}
): void {
  const {
    intervalMs = 30000,
    enabled = true,
    throttleMs = 4000,
  } = options;

  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    const trigger = () => {
      lastUpdateRef.current = Date.now();
      callbackRef.current();
    };

    // 1. Listen for local & broadcasted updates
    const handleEvent = () => {
      trigger();
    };
    window.addEventListener(REALTIME_EVENT, handleEvent);

    // 2. Listen for tab visibility / focus changes
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (!enabled) return;
      const now = Date.now();
      if (now - lastUpdateRef.current >= throttleMs) {
        trigger();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 3. Periodic background polling while tab is open and enabled
    let timer: number | null = null;
    if (intervalMs > 0 && enabled) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible' && enabled) {
          trigger();
        }
      }, intervalMs);
    }

    return () => {
      window.removeEventListener(REALTIME_EVENT, handleEvent);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [intervalMs, enabled, throttleMs]);
}
