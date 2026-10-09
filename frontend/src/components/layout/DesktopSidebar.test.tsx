import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DesktopSidebar } from './DesktopSidebar';
import { UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER', allowedTabs: ['assets', 'reports', 'settings-employees', 'settings-stores'] } as any,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, role: auth.user.role, logout: vi.fn(), canAccessTab: (tab: string) => auth.user.allowedTabs.includes(tab) }),
}));

const renderSidebar = () =>
  render(<DesktopSidebar activeTab="assets" setActiveTab={vi.fn()} currentRole={UserRole.DATA_ENCODER} collapsed={false} onToggleCollapse={vi.fn()} />);

describe('Side menu', () => {
  it('lists Documentation last, below Settings', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const names = within(nav).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(names[names.length - 1]).toBe('Documentation');
    expect(names.indexOf('Settings')).toBeGreaterThan(-1);
    expect(names.indexOf('Settings')).toBeLessThan(names.indexOf('Documentation'));
    // The working pages come first
    expect(names.indexOf('Assets')).toBeLessThan(names.indexOf('Reports'));
    expect(names.indexOf('Reports')).toBeLessThan(names.indexOf('Settings'));
  });

  it('keeps Documentation last for an employee with no Settings', () => {
    auth.user = { id: 'u2', fullNameEn: 'Almaz Ayana', role: 'EMPLOYEE', allowedTabs: ['my-assets'] };
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['My assets', 'Documentation']);
  });
});
