/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isDesktopNotificationSupported,
  requestDesktopNotificationPermission,
  sendDesktopNotification,
} from './desktop-notifications';

describe('desktop notifications utility', () => {
  const originalNotification = window.Notification;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (window as any).Notification = originalNotification;
  });

  it('detects desktop notification support correctly', () => {
    (window as any).Notification = class {};
    expect(isDesktopNotificationSupported()).toBe(true);

    delete (window as any).Notification;
    expect(isDesktopNotificationSupported()).toBe(false);
  });

  it('requests permission and returns granted result', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted');
    class MockNotification {
      static requestPermission = mockRequestPermission;
      static permission = 'default';
    }
    (window as any).Notification = MockNotification;

    const result = await requestDesktopNotificationPermission();
    expect(result).toBe('granted');
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('sends desktop notification with custom click handler when permission is granted', () => {
    const instances: any[] = [];
    const mockNotificationFn = vi.fn();

    class MockNotification {
      static permission = 'granted';
      title: string;
      options: any;
      onclick?: () => void;
      close = vi.fn();

      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        instances.push(this);
        mockNotificationFn(title, options);
      }
    }

    (window as any).Notification = MockNotification;

    const onClickMock = vi.fn();
    sendDesktopNotification('Test Title', { body: 'Test Body' }, onClickMock);

    expect(mockNotificationFn).toHaveBeenCalledWith('Test Title', expect.objectContaining({
      body: 'Test Body',
      silent: true,
    }));

    // Trigger notification click
    expect(instances.length).toBe(1);
    expect(instances[0].onclick).toBeDefined();
    instances[0].onclick();
    expect(onClickMock).toHaveBeenCalledTimes(1);
    expect(instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('does not send notification when permission is not granted', () => {
    const mockNotificationFn = vi.fn();

    class MockNotification {
      static permission = 'denied';
      constructor() {
        mockNotificationFn();
      }
    }

    (window as any).Notification = MockNotification;

    sendDesktopNotification('Test', { body: 'Denied' });
    expect(mockNotificationFn).not.toHaveBeenCalled();
  });
});
