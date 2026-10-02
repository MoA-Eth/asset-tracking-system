import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileNavigation } from './MobileNavigation';

const session = vi.hoisted(() => ({
  user: { allowedTabs: [] as string[], fullNameEn: 'Test User', email: 'test@example.test' },
  logout: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => session }));

describe('Mobile navigation access', () => {
  it('keeps overflow destinations reachable without expanding the five-slot bar', async () => {
    session.user.allowedTabs = ['dashboard', 'stock-in', 'stock-out', 'transfer-asset', 'approvals', 'reports', 'audit', 'settings-employees'];
    const open = vi.fn();
    render(<MobileBottomNav activeTab="reports" setActiveTab={vi.fn()} onOpenNavigation={open} />);
    const bar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(bar).getAllByRole('button')).toHaveLength(5);
    await userEvent.click(within(bar).getByRole('button', { name: 'More pages' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('provides every allowed destination and sign-out, closes after navigation, and hides forbidden pages', async () => {
    session.user.allowedTabs = ['stock-in', 'stock-out', 'transfer-asset', 'settings-employees', 'settings-stores'];
    const navigate = vi.fn();
    const close = vi.fn();
    render(<MobileNavigation isOpen onClose={close} activeTab="stock-in" onNavigate={navigate} />);
    const nav = screen.getByRole('navigation', { name: 'All pages' });
    expect(within(nav).queryByRole('button', { name: 'Roles' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Users' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Stock-In' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('button', { name: 'Stores' }));
    expect(navigate).toHaveBeenCalledWith('settings-stores');
    expect(close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
