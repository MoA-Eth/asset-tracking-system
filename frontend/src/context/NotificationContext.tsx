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
  actionLabel?: string;
  targetTab?: 'approvals' | 'assets';
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
    },
    [notifications, user?.id]
  );

  const clearNewArrival = useCallback(() => {
    setHasNewArrival(false);
    setArrivalAlert(null);
  }, []);

  // Authority & Role flags
  const canEndorse = user?.permissions?.includes('approvals.endorse') ?? (role === UserRole.TEAM_LEADER);
  const canAuthorize = user?.permissions?.includes('approvals.authorize') ?? (role === UserRole.DEPARTMENT_HEAD || role === UserRole.CHIEF_DIRECTOR);
  const isApprover = canEndorse || canAuthorize;
  const isRequester = user?.permissions?.some((p) =>
    ['stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write'].includes(p)
  ) ?? (role === UserRole.DATA_ENCODER || role === UserRole.SUPER_ADMIN);
  const hasNotificationAccess = isApprover || isRequester;

  // Track known approval IDs to detect genuinely NEW arrivals (Approvers)
  const knownApprovalIdsRef = useRef<Set<string>>(new Set());
  // Track known status & stage to detect decisions on submitted requests (Requesters)
  const knownRequesterMapRef = useRef<Map<string, { status: ApprovalStatus; stage: number }>>(new Map());
  const isFirstFetchRef = useRef<boolean>(true);

  // Core fetch & diffing engine
  const fetchAndDiffNotifications = useCallback(async () => {
    if (!isAuthenticated || !hasNotificationAccess) {
      setNotifications([]);
      return;
    }

    try {
      let finalNotifications: TransactionApproval[] = [];

      // ── 1. Approver Notifications (Pending Vouchers in Queue) ────────────────
      if (isApprover) {
        const pendingData = await api.getApprovals(ApprovalStatus.PENDING);
        let rows = approvalRows(pendingData);

        if (canEndorse && !canAuthorize) {
          rows = rows.filter((r) => (r.lead.currentStage ?? 1) === 1);
        } else if (canAuthorize && !canEndorse) {
          rows = rows.filter((r) => r.lead.currentStage === 2);
          if (role === UserRole.CHIEF_DIRECTOR) rows = rows.filter((r) => needsChiefDirector(r.total));
          else if (role === UserRole.DEPARTMENT_HEAD) rows = rows.filter((r) => !needsChiefDirector(r.total));
        } else if (!canEndorse && !canAuthorize) {
          rows = [];
        }

        const approverList: TransactionApproval[] = rows.map((r) =>
          r.members.length > 1
            ? { ...r.lead, itemName: `${slipNames(r.members.map((m) => m.itemName))} (${r.members.length} items)` }
            : r.lead
        );

        const currentPendingIds = new Set(approverList.map((n) => n.id));

        // Detect genuinely new pending arrivals
        if (!isFirstFetchRef.current) {
          const newArrivals = approverList.filter((n) => !knownApprovalIdsRef.current.has(n.id));

          if (newArrivals.length > 0) {
            setHasNewArrival(true);

            if (soundEnabled) {
              playNotificationChime();
            }

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
                actionLabel: 'Review',
                targetTab: 'approvals',
              });

              const navigateAction = onNavigateToApprovals ?? (() => {
                window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'approvals' }));
              });

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
                actionLabel: 'Review',
                targetTab: 'approvals',
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

        knownApprovalIdsRef.current = currentPendingIds;
        finalNotifications = approverList;
      }

      // ── 2. Requester Notifications (Approval / Rejection / Void Decisions) ──
      if (isRequester && user?.id) {
        const requesterData = await api.getApprovals(undefined, user.id);
        const reqRows = approvalRows(requesterData);
        const requesterList: TransactionApproval[] = reqRows.map((r) =>
          r.members.length > 1
            ? { ...r.lead, itemName: `${slipNames(r.members.map((m) => m.itemName))} (${r.members.length} items)` }
            : r.lead
        );

        if (!isFirstFetchRef.current) {
          for (const item of requesterList) {
            const prev = knownRequesterMapRef.current.get(item.id);
            if (prev) {
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

              let title = '';
              let message = '';
              let actionLabel = 'View';

              if (prev.status === ApprovalStatus.PENDING && item.status === ApprovalStatus.APPROVED) {
                title = `${typeLabel} Approved`;
                message = `Voucher #${item.ifmisSlipNumber} (${item.itemName}) was fully approved.`;
                actionLabel = 'View';
              } else if (prev.status === ApprovalStatus.PENDING && item.status === ApprovalStatus.REJECTED) {
                const reason = item.returnRemarks || item.reviewRemarks || 'Returned for correction.';
                title = `${typeLabel} Returned / Rejected`;
                message = `Slip #${item.ifmisSlipNumber} was returned: "${reason}"`;
                actionLabel = 'Correct';
              } else if (prev.status !== ApprovalStatus.VOIDED && item.status === ApprovalStatus.VOIDED) {
                const reason = item.voidDetails?.voidReason || 'Reversed by Administrator.';
                title = `${typeLabel} Voided`;
                message = `Approved voucher #${item.ifmisSlipNumber} was voided: "${reason}"`;
                actionLabel = 'View';
              } else if (prev.stage === 1 && item.currentStage === 2 && item.status === ApprovalStatus.PENDING) {
                title = `${typeLabel} Endorsed (Stage 1 Passed)`;
                message = `Slip #${item.ifmisSlipNumber} was endorsed by Team Leader and forwarded for final approval.`;
                actionLabel = 'View';
              }

              if (title) {
                setHasNewArrival(true);
                if (soundEnabled) {
                  playNotificationChime();
                }

                setArrivalAlert({
                  id: item.id,
                  title,
                  message,
                  count: 1,
                  actionLabel,
                  targetTab: 'assets',
                });

                const navigateAction = () => {
                  window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'assets' }));
                };

                if (desktopEnabled && desktopPermission === 'granted') {
                  sendDesktopNotification(
                    `MoA-ATS: ${title}`,
                    { body: message, tag: item.id },
                    navigateAction
                  );
                }
                break; // One snackbar alert per poll cycle to prevent visual flooding
              }
            }
          }
        }

        // Update requester map
        const nextReqMap = new Map<string, { status: ApprovalStatus; stage: number }>();
        for (const item of requesterList) {
          nextReqMap.set(item.id, { status: item.status, stage: item.currentStage ?? 1 });
        }
        knownRequesterMapRef.current = nextReqMap;

        // If user is requester only, notifications feed shows their recent requests
        if (!isApprover) {
          finalNotifications = requesterList.slice(0, 30);
        }
      }

      isFirstFetchRef.current = false;
      setNotifications(finalNotifications);
    } catch {
      // Background poll silently fails on temporary network hiccups
    }
  }, [
    isAuthenticated,
    hasNotificationAccess,
    isApprover,
    isRequester,
    user?.id,
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
    knownRequesterMapRef.current = new Map();
    setHasNewArrival(false);

    if (isAuthenticated && hasNotificationAccess) {
      setLoading(true);
      fetchAndDiffNotifications().finally(() => setLoading(false));
    } else {
      setNotifications([]);
    }
  }, [user?.id, role, isAuthenticated, hasNotificationAccess, fetchAndDiffNotifications]);

  // Active polling timer & tab visibility listeners
  useEffect(() => {
    if (!isAuthenticated || !hasNotificationAccess) return;

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
  }, [isAuthenticated, hasNotificationAccess, fetchAndDiffNotifications]);

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
          actionLabel={arrivalAlert.actionLabel}
          onReview={() => {
            setArrivalAlert(null);
            setHasNewArrival(false);
            const target = arrivalAlert.targetTab ?? 'approvals';
            if (target === 'approvals') {
              const navigateAction = onNavigateToApprovals ?? (() => {
                window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'approvals' }));
              });
              navigateAction();
            } else {
              window.dispatchEvent(new CustomEvent('moa_navigate_tab', { detail: 'assets' }));
            }
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
