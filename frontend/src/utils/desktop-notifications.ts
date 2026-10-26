/**
 * Browser Desktop Notifications using Web Notifications API.
 */
export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDesktopNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isDesktopNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function sendDesktopNotification(
  title: string,
  options?: NotificationOptions,
  onClick?: () => void
): void {
  if (!isDesktopNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      silent: true, // We trigger our customized gentle chime
      ...options,
    });

    if (onClick) {
      notif.onclick = () => {
        try {
          window.focus();
        } catch {}
        onClick();
        notif.close();
      };
    }
  } catch {
    // Fail silently if browser blocks or sandboxed
  }
}
