import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage, homeView } from './HomePage';
import { api } from '../api/client';
import { UserRole } from '../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'me', departmentId: 'DEP-1', permissions: [] as string[] } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../api/client', () => ({ api: { getApprovals: vi.fn(), getItems: vi.fn(), getEmployees: vi.fn(), getAuditLogs: vi.fn() } }));

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const request = (id: string, extra: object = {}) => ({
  id, transactionType: 'STOCK_OUT', itemId: `item-${id}`, itemCode: `MOA-${id}`, itemName: `Item ${id}`, ifmisSlipNumber: `M22-${id}`,
  status: 'PENDING', currentStage: 1, requestedById: 'someone', createdAtGc: daysAgo(1), totalAmount: 1000, ...extra,
});
const item = (id: string, extra: object = {}) => ({
  id, itemCode: `MOA-${id}`, name: `Item ${id}`, status: 'AVAILABLE', quantity: 1, itemType: 'FIXED', ifmisSlipDateGc: daysAgo(5), history: [], ...extra,
});

const cardOf = (label: string) => screen.getByText(label).parentElement!;
const renderAs = (role: UserRole, permissions: string[]) => {
  auth.user.permissions = permissions;
  const onNavigate = vi.fn();
  render(<HomePage currentRole={role} onNavigate={onNavigate} />);
  return onNavigate;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getItems).mockResolvedValue([] as any);
});

describe('which dashboard a person gets', () => {
  it('goes by what they may do', () => {
    expect(homeView(UserRole.TEAM_LEADER, ['approvals.endorse'])).toBe('team-leader');
    expect(homeView(UserRole.DEPARTMENT_HEAD, ['approvals.authorize'])).toBe('department-head');
    expect(homeView(UserRole.DATA_ENCODER, ['stock-in.write'])).toBe('encoder');
    expect(homeView(UserRole.SYSTEM_ADMIN, ['roles.assign'])).toBe('admin');
    expect(homeView(UserRole.MANAGER, ['dashboard.read', 'reports.read'])).toBeUndefined();
  });
});

describe('System Administrator', () => {
  it('shows who can sign in, temporary passwords, deactivated people and recent access changes', async () => {
    const person = (id: string, extra: object = {}) => ({ id, fullNameEn: id, payrollId: id, departmentId: 'D', role: null, isActive: true, ...extra });
    vi.mocked(api.getEmployees).mockResolvedValue([
      person('enc', { role: 'DATA_ENCODER' }),
      person('enc2', { role: 'DATA_ENCODER', mustChangePassword: true }),
      person('tl', { role: 'TEAM_LEADER' }),
      person('custodian'),
      person('left', { role: 'TEAM_LEADER', isActive: false }),
    ] as any);
    vi.mocked(api.getAuditLogs).mockResolvedValue([
      { id: 'l1', action: 'UPDATE_STAFF_ROLE', entityType: 'USER', details: 'enc2 given Data Encoder', userName: 'Admin', timestampGc: daysAgo(1) },
      { id: 'l2', action: 'APPROVE_STOCK_IN', entityType: 'APPROVAL', details: 'Receipt approved', userName: 'Head', timestampGc: daysAgo(1) },
      { id: 'l3', action: 'UPDATE_ROLE_PERMISSIONS', entityType: 'ROLE', details: 'Manager permissions changed', userName: 'Admin', timestampGc: daysAgo(20) },
    ] as any);
    const onNavigate = renderAs(UserRole.SYSTEM_ADMIN, ['roles.assign', 'roles.read', 'audit.read']);

    expect(await screen.findByText('Can sign in')).toBeInTheDocument();
    expect(cardOf('Can sign in')).toHaveTextContent('3 people');
    expect(cardOf('Can sign in')).toHaveTextContent('Of 5 employees');
    expect(cardOf('Temporary password')).toHaveTextContent('1');
    expect(cardOf('Deactivated')).toHaveTextContent('1 employee');
    // Access changes only, this week
    expect(cardOf('Access changes this week')).toHaveTextContent('1');
    const byRole = screen.getByText('Who can sign in, by role').closest('section')!;
    expect(within(byRole).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Data Encoder2', 'Team Leader1']);
    const changes = screen.getByText('Recent access changes').closest('section')!;
    expect(changes).toHaveTextContent('enc2 given Data Encoder');
    expect(changes).not.toHaveTextContent('Receipt approved');
    expect(api.getApprovals).not.toHaveBeenCalled();

    await userEvent.click(within(cardOf('Temporary password')).getByRole('button', { name: /See who/ }));
    expect(onNavigate).toHaveBeenCalledWith('settings-users');
  });
});

describe('Team Leader', () => {
  it('shows the requests waiting for endorsement, a voucher of several lines once, oldest first', async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('A', { createdAtGc: daysAgo(1) }),
      // Two lines of one Model 22: one request
      request('B1', { ifmisSlipNumber: 'M22-B', createdAtGc: daysAgo(6) }),
      request('B2', { ifmisSlipNumber: 'M22-B', createdAtGc: daysAgo(6) }),
      request('R', { transactionType: 'STOCK_IN', ifmisSlipNumber: 'M19-R' }),
      // At the Department Head already, and one this Team Leader endorsed and one sent back this week
      request('S2', { currentStage: 2, endorsedById: 'me', endorsedAtGc: daysAgo(2) }),
      request('BACK', { status: 'REJECTED', returnedById: 'me', returnedAtGc: daysAgo(3) }),
    ] as any);
    const onNavigate = renderAs(UserRole.TEAM_LEADER, ['approvals.endorse']);

    expect(await screen.findByText('Waiting for my endorsement')).toBeInTheDocument();
    expect(cardOf('Waiting for my endorsement')).toHaveTextContent('3');
    expect(cardOf('Waiting for my endorsement')).toHaveTextContent('2 issues · 1 receipt');
    expect(cardOf('Oldest waiting')).toHaveTextContent('6 days');
    expect(cardOf('This week')).toHaveTextContent('1 endorsed');
    expect(cardOf('This week')).toHaveTextContent('1 sent back');

    const list = screen.getByText('Waiting for my endorsement, oldest first').closest('section')!;
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('2 items');
    expect(api.getItems).not.toHaveBeenCalled();

    await userEvent.click(within(cardOf('Waiting for my endorsement')).getByRole('button', { name: /Review/ }));
    expect(onNavigate).toHaveBeenCalledWith('approvals');
  });
});

describe('Department Head', () => {
  it('shows the endorsed requests waiting for approval, and what the directorate holds', async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('E1', { currentStage: 2, createdAtGc: daysAgo(4) }),
      request('E2', { currentStage: 2 }),
      request('NEW', { currentStage: 1 }),
    ] as any);
    vi.mocked(api.getItems).mockResolvedValue([
      item('LAPTOP', { status: 'ISSUED', assignedDepartmentId: 'DEP-1', quantity: 3 }),
      item('LAPTOP-1', { status: 'ISSUED', assignedDepartmentId: 'DEP-1', quantity: 2, parentItemId: 'LAPTOP' }),
      item('SOAP', { status: 'ISSUED', assignedDepartmentId: 'DEP-1', itemType: 'CONSUMABLE', quantity: 500 }),
      item('OTHER', { status: 'ISSUED', assignedDepartmentId: 'DEP-2', quantity: 9 }),
    ] as any);
    renderAs(UserRole.DEPARTMENT_HEAD, ['approvals.authorize']);

    expect(await screen.findByText('Waiting for my approval')).toBeInTheDocument();
    expect(cardOf('Waiting for my approval')).toHaveTextContent('2');
    expect(cardOf('Waiting for my approval')).toHaveTextContent('Oldest waiting 4 days');
    expect(cardOf('With the Team Leader')).toHaveTextContent('1');
    // The laptops are one item (with the piece issued from them); units are fixed assets only
    expect(cardOf('My directorate holds')).toHaveTextContent('2 items');
    expect(cardOf('My directorate holds')).toHaveTextContent('5 fixed-asset units');
  });
});

describe('Data Encoder', () => {
  it('shows what was sent back to them, their requests waiting, and items in store too long', async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([
      request('MINE', { requestedById: 'me', createdAtGc: daysAgo(2) }),
      request('FIX', { requestedById: 'me', status: 'REJECTED', returnRemarks: 'Wrong quantity', returnedAtGc: daysAgo(1), createdAtGc: daysAgo(9) }),
      request('THEIRS', { requestedById: 'someone' }),
    ] as any);
    vi.mocked(api.getItems).mockResolvedValue([
      item('OLD', { ifmisSlipDateGc: daysAgo(45) }),
      item('NEW', { ifmisSlipDateGc: daysAgo(3) }),
      item('GONE', { status: 'ISSUED', ifmisSlipDateGc: daysAgo(90) }),
    ] as any);
    const onNavigate = renderAs(UserRole.DATA_ENCODER, ['stock-in.write', 'stock-out.write']);

    expect(await screen.findByText('Sent back to me', { selector: 'p' })).toBeInTheDocument();
    expect(cardOf('My requests waiting')).toHaveTextContent('1');
    expect(cardOf('In store over 30 days')).toHaveTextContent('1 item');
    expect(cardOf('Entered this week')).toHaveTextContent('1 request');
    const list = screen.getByText('Sent back to me', { selector: 'h2' }).closest('section')!;
    expect(list).toHaveTextContent('Wrong quantity');

    await userEvent.click(screen.getByRole('button', { name: /Correct/ }));
    expect(onNavigate).toHaveBeenCalledWith('assets');
  });
});
