import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationProvider, useNotifications } from './NotificationContext';
import { ToastProvider } from './ToastContext';
import { UserRole, TransactionType, ApprovalStatus } from '../types/asset-management';
import { api } from '../api/client';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('./AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock api.client
vi.mock('../api/client', () => ({
  api: {
    getApprovals: vi.fn(),
  },
}));

// Mock notification sound
const mockPlayChime = vi.fn();
vi.mock('../utils/notification-sound', () => ({
  playNotificationChime: () => mockPlayChime(),
}));

// Mock desktop notifications
const mockSendDesktopNotification = vi.fn();
vi.mock('../utils/desktop-notifications', () => ({
  isDesktopNotificationSupported: () => true,
  getDesktopNotificationPermission: () => 'granted',
  requestDesktopNotificationPermission: vi.fn().mockResolvedValue('granted'),
  sendDesktopNotification: (...args: any[]) => mockSendDesktopNotification(...args),
}));

const TestConsumer: React.FC = () => {
  const {
    notifications,
    unreadCount,
    hasNewArrival,
    soundEnabled,
    toggleSound,
    desktopEnabled,
    toggleDesktop,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useNotifications();

  return (
    <div>
      <div data-testid="count">{notifications.length}</div>
      <div data-testid="unread">{unreadCount}</div>
      <div data-testid="has-new">{hasNewArrival ? 'YES' : 'NO'}</div>
      <div data-testid="sound">{soundEnabled ? 'SOUND_ON' : 'SOUND_OFF'}</div>
      <div data-testid="desktop">{desktopEnabled ? 'DESKTOP_ON' : 'DESKTOP_OFF'}</div>
      <button onClick={toggleSound}>Toggle Sound</button>
      <button onClick={toggleDesktop}>Toggle Desktop</button>
      <button onClick={() => markAllAsRead()}>Mark All Read</button>
      <button onClick={() => refreshNotifications()}>Refresh</button>
      {notifications.map((n) => (
        <div key={n.id}>
          <span>{n.itemName}</span>
          <button onClick={() => markAsRead(n.id)}>Read {n.id}</button>
        </div>
      ))}
    </div>
  );
};

describe('NotificationContext & Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', fullNameEn: 'Director', permissions: ['approvals.authorize'] },
      role: UserRole.DEPARTMENT_HEAD,
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads initial pending approvals for authorized stage', async () => {
    const mockApprovals = [
      {
        id: 'appr-1',
        transactionType: TransactionType.STOCK_IN,
        status: ApprovalStatus.PENDING,
        currentStage: 2,
        ifmisSlipNumber: 'S-101',
        itemName: 'HP Laptops',
        quantity: 5,
        totalCost: 150000,
      },
    ];

    (api.getApprovals as any).mockResolvedValue(mockApprovals);

    await act(async () => {
      render(
        <ToastProvider>
          <NotificationProvider>
            <TestConsumer />
          </NotificationProvider>
        </ToastProvider>
      );
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('unread')).toHaveTextContent('1');
    expect(screen.getByTestId('has-new')).toHaveTextContent('NO'); // Initial fetch does not trigger "new arrival" pulse
  });

  it('toggles sound preference and saves to localStorage', async () => {
    (api.getApprovals as any).mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      render(
        <ToastProvider>
          <NotificationProvider>
            <TestConsumer />
          </NotificationProvider>
        </ToastProvider>
      );
    });

    expect(screen.getByTestId('sound')).toHaveTextContent('SOUND_ON');

    await user.click(screen.getByText('Toggle Sound'));
    expect(screen.getByTestId('sound')).toHaveTextContent('SOUND_OFF');
    expect(localStorage.getItem('moa_notif_sound_enabled')).toBe('false');

    await user.click(screen.getByText('Toggle Sound'));
    expect(screen.getByTestId('sound')).toHaveTextContent('SOUND_ON');
    expect(localStorage.getItem('moa_notif_sound_enabled')).toBe('true');
  });

  it('triggers toast, sound chime, and desktop notification when a new voucher arrives on subsequent poll', async () => {
    // 1st poll: 1 approval
    const initialApprovals = [
      {
        id: 'appr-1',
        transactionType: TransactionType.STOCK_IN,
        status: ApprovalStatus.PENDING,
        currentStage: 2,
        ifmisSlipNumber: 'S-101',
        itemName: 'HP Laptops',
        quantity: 5,
        totalCost: 150000,
      },
    ];
    (api.getApprovals as any).mockResolvedValueOnce(initialApprovals);

    const user = userEvent.setup();

    await act(async () => {
      render(
        <ToastProvider>
          <NotificationProvider>
            <TestConsumer />
          </NotificationProvider>
        </ToastProvider>
      );
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(mockPlayChime).not.toHaveBeenCalled();

    // 2nd poll: a 2nd approval arrives
    const updatedApprovals = [
      ...initialApprovals,
      {
        id: 'appr-2',
        transactionType: TransactionType.STOCK_OUT,
        status: ApprovalStatus.PENDING,
        currentStage: 2,
        ifmisSlipNumber: 'M22-99',
        itemName: 'Toyota Land Cruiser',
        quantity: 1,
        totalCost: 2500000,
      },
    ];
    (api.getApprovals as any).mockResolvedValueOnce(updatedApprovals);

    await act(async () => {
      await user.click(screen.getByText('Refresh'));
    });

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('has-new')).toHaveTextContent('YES');
    expect(mockPlayChime).toHaveBeenCalledTimes(1);
    expect(mockSendDesktopNotification).toHaveBeenCalledWith(
      expect.stringContaining('Model 22 (Issue)'),
      expect.objectContaining({
        body: expect.stringContaining('M22-99'),
      }),
      expect.any(Function)
    );
  });

  it('marks notifications as read and marks all as read', async () => {
    const mockApprovals = [
      {
        id: 'appr-1',
        transactionType: TransactionType.STOCK_IN,
        status: ApprovalStatus.PENDING,
        currentStage: 2,
        ifmisSlipNumber: 'S-101',
        itemName: 'HP Laptops',
        quantity: 5,
        totalCost: 150000,
      },
      {
        id: 'appr-2',
        transactionType: TransactionType.STOCK_OUT,
        status: ApprovalStatus.PENDING,
        currentStage: 2,
        ifmisSlipNumber: 'M22-99',
        itemName: 'Vehicle',
        quantity: 1,
        totalCost: 2000000,
      },
    ];

    (api.getApprovals as any).mockResolvedValue(mockApprovals);
    const user = userEvent.setup();

    await act(async () => {
      render(
        <ToastProvider>
          <NotificationProvider>
            <TestConsumer />
          </NotificationProvider>
        </ToastProvider>
      );
    });

    expect(screen.getByTestId('unread')).toHaveTextContent('2');

    // Read single item
    await user.click(screen.getByText('Read appr-1'));
    expect(screen.getByTestId('unread')).toHaveTextContent('1');

    // Mark all read
    await user.click(screen.getByText('Mark All Read'));
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });
});
