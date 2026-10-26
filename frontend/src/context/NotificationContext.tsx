import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { api } from '../api/client';
import { ApprovalStatus, TransactionApproval, TransactionType, UserRole } from '../types/asset-management';
import { approvalRows, needsChiefDirector, slipNames } from '../components/assets/slip-groups';
import { playNotificationChime } from '../utils/notification-sound';
import {
  getDesktopNotificationPermission,
  isDesktopNotificationSupported,
  requestDesktopNotificationPermission,
  sendDesktopNotification,
} from '../utils/desktop-notifications';
import { ArrivalBottomSnackbar } from '../components/ui/ArrivalBottomSnackbar';

export interface NotificationContextValue {
  notifications: TransactionApproval[];
  unreadCount: number;
  loading: boolean;
  hasNewArrival: boolean;
  clearNewArrival: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  desktopPermission: NotificationPermission | 'unsupported';
  desktopEnabled: boolean;
  requestDesktopPermission: () => Promise<void>;
  toggleDesktop: () => void;
  readIds: string[];
  isRead: (id: string) => boolean;
  markAsRead: (id: string, e?: React.MouseEvent) => void;
  markAllAsRead: (e?: React.MouseEvent) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

// Polling interval in ms (25 seconds for responsive, near-real-time push updates)
const POLL_INTERVAL_MS = 25000;

interface ArrivalAlertItem {
  id: string;
  title: string;
  message: string;
  count: number;
}

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigateToApprovals?: () => void;
}> = ({ children, onNavigateToApprovals }) => {
  const { user, role, isAuthenticated } = useAuth();
  const { success, warning } = useToast();

  const [notifications, setNotifications] = useState<TransactionApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNewArrival, setHasNewArrival] = useState(false);
  const [arrivalAlert, setArrivalAlert] = useState<ArrivalAlertItem | null>(null);

  // Sound preference: on by default
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('moa_notif_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('moa_notif_sound_enabled', String(next));
      } catch {}
      if (next) playNotificationChime();
      return next;
    });
  }, []);

  // Desktop push preference & permission
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getDesktopNotificationPermission()
  );

  const [desktopEnabled, setDesktopEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('moa_notif_desktop_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleDesktop = useCallback(() => {
    setDesktopEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('moa_notif_desktop_enabled', String(next));
      } catch {}
      return next;
    });
  }, []);

  const requestDesktopPermission = useCallback(async () => {
    if (!isDesktopNotificationSupported()) return;
    const res = await requestDesktopNotificationPermission();
    setDesktopPermission(res);
    if (res === 'granted') {
      setDesktopEnabled(true);
      try {
        localStorage.setItem('moa_notif_desktop_enabled', 'true');
      } catch {}
      sendDesktopNotification('Ministry of Agriculture — MoA-ATS', {
        body: 'Desktop notifications for pending voucher approvals are now active.',
      });
      success('Desktop notifications enabled', 'You will receive desktop alerts when vouchers require your review.');
    } else if (res === 'denied') {
      warning('Desktop notifications blocked', 'Notifications are blocked in your browser settings. You can re-enable them in site permissions.');
    }
  }, [success, warning]);

  // Read notification IDs stored per user
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const key = `moa_read_notifs_${user?.id || 'default'}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const key = `moa_read_notifs_${user?.id || 'default'}`;
      const stored = localStorage.getItem(key);
      setReadIds(stored ? JSON.parse(stored) : []);
    } catch {
      setReadIds([]);
    }
  }, [user?.id]);

  const markAsRead = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setReadIds((prev) => {
        if (prev.includes(id)) return prev;
        const updated = [...prev, id];
        try {
          localStorage.setItem(`moa_read_notifs_${user?.id || 'default'}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [user?.id]
  );

  const markAllAsRead = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const allIds = notifications.map((n) => n.id);
      setReadIds((prev) => {
        const merged = Array.from(new Set([...prev, ...allIds]));
        try {
          localStorage.setItem(`moa_read_notifs_${user?.id || 'default'}`, JSON.stringify(merged));
        } catch {}
        return merged;
      });
      setHasNewArrival(false);
      setArrivalAlert(null);
    },
    [notifications, user?.id]
  );

  const clearNewArrival = useCallback(() => {
    setHasNewArrival(false);
    setArrivalAlert(null);
  }, []);

  // Approver authority flags
  const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
  const canAuthorize = user?.permissions?.includes('approvals.authorize') ?? (role === UserRole.DEPARTMENT_HEAD || role === UserRole.CHIEF_DIRECTOR);
  const isApprover = canEndorse || canAuthorize;

  // Track known approval IDs to detect genuinely NEW arrivals
  const knownApprovalIdsRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef<boolean>(true);

  // Core fetch & diffing engine
  const fetchAndDiffNotifications = useCallback(async () => {
    if (!isAuthenticated || !isApprover) {
      setNotifications([]);
      return;
    }

    try {
      const data = await api.getApprovals(ApprovalStatus.PENDING);
      let rows = approvalRows(data);

      if (canEndorse && !canAuthorize) {
        rows = rows.filter((r) => (r.lead.currentStage ?? 1) === 1);
      } else if (canAuthorize && !canEndorse) {
        rows = rows.filter((r) => r.lead.currentStage === 2);
        if (role === UserRole.CHIEF_DIRECTOR) rows = rows.filter((r) => needsChiefDirector(r.total));
        else if (role === UserRole.DEPARTMENT_HEAD) rows = rows.filter((r) => !needsChiefDirector(r.total));
      } else if (!canEndorse && !canAuthorize) {
        rows = [];
      }

      const formattedNotifications: TransactionApproval[] = rows.map((r) =>
        r.members.length > 1
          ? { ...r.lead, itemName: `${slipNames(r.members.map((m) => m.itemName))} (${r.members.length} items)` }
          : r.lead
      );

      const currentIds = new Set(formattedNotifications.map((n) => n.id));

      // Detect genuinely new items if this is NOT the initial load
      if (!isFirstFetchRef.current) {
        const newArrivals = formattedNotifications.filter((n) => !knownApprovalIdsRef.current.has(n.id));

        if (newArrivals.length > 0) {
          setHasNewArrival(true);

          // Audio chime
          if (soundEnabled) {
            playNotificationChime();
          }

          // In-App Telegram/Gmail Style Bottom Alert
          if (newArrivals.length === 1) {
            const item = newArrivals[0];
            const typeLabel =
              item.transactionType === TransactionType.STOCK_IN
                ? 'Model 19 (Receipt)'
                : item.transactionType === TransactionType.STOCK_OUT
                ? 'Model 22 (Issue)'
                : item.transactionType === TransactionType.RETURN
                ? 'Model 21 (Return)'
                : item.transactionType === TransactionType.DISPOSAL
                ? 'Disposal Form'
                : 'Model 21 (Transfer)';
            const stageText = (item.currentStage ?? 1) === 1 ? 'Endorsement' : 'Authorization';

            setArrivalAlert({
              id: item.id,
              title: `New ${typeLabel} Pending ${stageText}`,
              message: `Voucher #${item.ifmisSlipNumber} (${item.itemName}) requires your review.`,
              count: 1,
            });

            const navigateAction = onNavigateToApprovals ?? (() => {
              window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'approvals' }));
            });

            // Desktop push notification
            if (desktopEnabled && desktopPermission === 'granted') {
              sendDesktopNotification(
                `MoA-ATS: New ${typeLabel} Pending Review`,
                {
                  body: `Slip #${item.ifmisSlipNumber} (${item.itemName}) awaits your ${stageText.toLowerCase()}.`,
                  tag: item.id,
                },
                navigateAction
              );
            }
          } else {
            const count = newArrivals.length;
            setArrivalAlert({
              id: newArrivals[0].id,
              title: `${count} New Requests Pending Approval`,
              message: 'New vouchers have arrived in your queue awaiting review.',
              count,
            });

            const navigateAction = onNavigateToApprovals ?? (() => {
              window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'approvals' }));
            });

            if (desktopEnabled && desktopPermission === 'granted') {
              sendDesktopNotification(
                `MoA-ATS: ${count} New Approvals Pending`,
                {
                  body: `${count} new vouchers arrived awaiting your review.`,
                  tag: 'multiple-approvals',
                },
                navigateAction
              );
            }
          }
        }
      }

      // Update refs
      knownApprovalIdsRef.current = currentIds;
      isFirstFetchRef.current = false;
      setNotifications(formattedNotifications);
    } catch {
      // Background poll silently fails on temporary network hiccups
    }
  }, [
    isAuthenticated,
    isApprover,
    canEndorse,
    canAuthorize,
    role,
    soundEnabled,
    desktopEnabled,
    desktopPermission,
    onNavigateToApprovals,
  ]);

  // Reset when user logs in or switches
  useEffect(() => {
    isFirstFetchRef.current = true;
    knownApprovalIdsRef.current = new Set();
    setHasNewArrival(false);

    if (isAuthenticated && isApprover) {
      setLoading(true);
      fetchAndDiffNotifications().finally(() => setLoading(false));
    } else {
      setNotifications([]);
    }
  }, [user?.id, role, isAuthenticated, isApprover, fetchAndDiffNotifications]);

  // Active polling timer & tab visibility listeners
  useEffect(() => {
    if (!isAuthenticated || !isApprover) return;

    // Periodic polling
    const intervalId = setInterval(() => {
      fetchAndDiffNotifications();
    }, POLL_INTERVAL_MS);

    // Immediate check when window regains focus
    const handleFocus = () => {
      fetchAndDiffNotifications();
    };

    // Immediate check when document visibility becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAndDiffNotifications();
      }
    };

    // Custom internal mutation events
    const handleCustomUpdate = () => {
      fetchAndDiffNotifications();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('moa_approvals_updated', handleCustomUpdate);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('moa_approvals_updated', handleCustomUpdate);
    };
  }, [isAuthenticated, isApprover, fetchAndDiffNotifications]);

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        hasNewArrival,
        clearNewArrival,
        soundEnabled,
        toggleSound,
        desktopPermission,
        desktopEnabled,
        requestDesktopPermission,
        toggleDesktop,
        readIds,
        isRead: (id: string) => readIds.includes(id),
        markAsRead,
        markAllAsRead,
        refreshNotifications: fetchAndDiffNotifications,
      }}
    >
      {children}
      {arrivalAlert && (
        <ArrivalBottomSnackbar
          id={arrivalAlert.id}
          title={arrivalAlert.title}
          message={arrivalAlert.message}
          count={arrivalAlert.count}
          duration={8000}
          onReview={() => {
            setArrivalAlert(null);
            const navigateAction = onNavigateToApprovals ?? (() => {
              window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'approvals' }));
            });
            navigateAction();
          }}
          onClose={() => setArrivalAlert(null)}
        />
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
