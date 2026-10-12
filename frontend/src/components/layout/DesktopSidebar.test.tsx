import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesktopSidebar } from './DesktopSidebar';
import { UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER', allowedTabs: ['assets', 'reports', 'settings-employees', 'settings-stores'] } as any,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, role: auth.user.role, logout: vi.fn(), canAccessTab: (tab: string) => auth.user.allowedTabs.includes(tab) }),
}));

const setActiveTab = vi.fn();
const renderSidebar = () =>
  render(<DesktopSidebar activeTab="assets" setActiveTab={setActiveTab} currentRole={UserRole.DATA_ENCODER} collapsed={false} onToggleCollapse={vi.fn()} />);

describe('Side menu', () => {
  it('does not list Help among the pages: it is in the account menu', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const names = within(nav).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(names).not.toContain('Help');
    expect(names).not.toContain('Documentation');
    expect(names.indexOf('Assets')).toBeLessThan(names.indexOf('Reports'));
  });

  it('has Help in the account menu, right under Profile, and opens the manual', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: /Account menu for Store Encoder/ }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent?.trim());
    expect(items[0]).toBe('Profile');
    expect(items[1]).toBe('Help');

    await user.click(screen.getByRole('menuitem', { name: 'Help' }));
    expect(setActiveTab).toHaveBeenCalledWith('docs');
  });

  it('gives an employee the same Help entry, with only My assets as a page', async () => {
    const user = userEvent.setup();
    auth.user = { id: 'u2', fullNameEn: 'Almaz Ayana', role: 'EMPLOYEE', allowedTabs: ['my-assets'] };
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['My assets']);
    await user.click(screen.getByRole('button', { name: /Account menu for Almaz Ayana/ }));
    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument();
  });
});
