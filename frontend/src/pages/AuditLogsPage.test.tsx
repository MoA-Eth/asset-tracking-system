import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogsPage, actionLabel, activityKind } from './AuditLogsPage';
import { withRoleNames } from '../utils/roles';
import { api } from '../api/client';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../api/client', () => ({ api: { getAuditLogs: vi.fn() } }));

const entry = (id: string, action: string, userName: string, userRole: string, details: string, extra: object = {}) => ({
  id, action, userName, userRole, details, userId: 'u', entityType: 'ITEM', entityId: 'i', timestampGc: '2026-10-02 17:10:11', timestampEc: '2019-01-22 17:10:11', ...extra,
});
const logs = [
  entry('a1', 'APPROVE_STOCK_IN', 'Tigist Haile', 'DEPARTMENT_HEAD', 'STOCK_IN APPROVED by Tigist Haile (DEPARTMENT_HEAD) for item MOA-IT-2026-0079.', { ifmisSlipNumber: 'M19-0044' }),
  entry('a2', 'REJECT_STOCK_OUT', 'Mulugeta Bekele', 'TEAM_LEADER', 'STOCK_OUT REJECTED. Remarks: Wrong recipient'),
  entry('a3', 'REGISTER_STOCK_IN', 'Store Encoder', 'DATA_ENCODER', 'Registered Dell Latitude.', { ifmisSlipNumber: 'M19-0045' }),
  entry('a4', 'UPDATE_SYSTEM_SETTINGS', 'Admin Person', 'SYSTEM_ADMIN', 'Scanned slip attachment is now required.', {
    previousState: { slipAttachmentPolicy: 'OPTIONAL' },
    newState: { slipAttachmentPolicy: 'REQUIRED' },
  }),
];
const dataRows = () => screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length === 6);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getAuditLogs).mockResolvedValue(logs as any);
});

describe('Audit log', () => {
  it('lists entries as a table with the date, person, action, slip number and description', async () => {
    render(<AuditLogsPage />);
    expect(await screen.findByRole('columnheader', { name: 'Date & time' })).toBeInTheDocument();
    for (const name of ['Who', 'Action', 'Slip no.', 'What happened']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    expect(dataRows()).toHaveLength(4);

    const first = dataRows()[0];
    expect(first).toHaveTextContent('2019-01-22 17:10');
    expect(first).toHaveTextContent('2026-10-02 G.C.');
    expect(first).toHaveTextContent('Tigist Haile');
    // Roles and actions are written out, not shown as codes
    expect(first).toHaveTextContent('Department Head');
    expect(first).toHaveTextContent('Approve receipt');
    expect(first).toHaveTextContent('M19-0044');
    expect(first).not.toHaveTextContent('DEPARTMENT_HEAD');
    expect(first).not.toHaveTextContent('APPROVE_STOCK_IN');
  });

  it('opens a row to show what changed, and closes it again', async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);
    await user.click(await screen.findByRole('button', { name: 'Show details of Update system settings by Admin Person' }));
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByText('OPTIONAL')).toBeInTheDocument();
    expect(screen.getByText('REQUIRED')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide details of Update system settings by Admin Person' }));
    expect(screen.queryByText('Before')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show details of Register receipt by Store Encoder' }));
    expect(screen.getByText('No before-and-after values were recorded for this entry.')).toBeInTheDocument();
  });

  it('filters by kind of activity, and an approval of a stock-in counts as an approval', async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);
    await screen.findByRole('columnheader', { name: 'Who' });
    await user.click(screen.getByRole('button', { name: 'Approvals' }));
    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0]).toHaveTextContent('Approve receipt');
    await user.click(screen.getByRole('button', { name: 'Receiving (M19)' }));
    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0]).toHaveTextContent('Register receipt');
    await user.click(screen.getByRole('button', { name: 'Users & settings' }));
    expect(dataRows()[0]).toHaveTextContent('Update system settings');
    await user.click(screen.getByRole('button', { name: 'Rejections' }));
    expect(dataRows()[0]).toHaveTextContent('Reject issue');
  });

  it('searches by person, slip number or description, and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);
    const search = await screen.findByRole('textbox', { name: 'Search the audit log' });
    await user.type(search, 'mulugeta');
    expect(dataRows()).toHaveLength(1);
    await user.clear(search);
    await user.type(search, 'M19-0045');
    expect(dataRows()[0]).toHaveTextContent('Store Encoder');
    await user.clear(search);
    await user.type(search, 'zzzz');
    expect(screen.getByText('No entries match')).toBeInTheDocument();
  });

  it('classifies and labels actions', () => {
    expect(activityKind('ENDORSE_TRANSFER')).toBe('APPROVAL');
    expect(activityKind('REJECT_RETURN')).toBe('REJECTION');
    expect(activityKind('REGISTER_RETURN')).toBe('TRANSFER');
    expect(activityKind('GRANT_ACCESS')).toBe('ADMIN');
    expect(activityKind('REGISTER_STOCK_OUT')).toBe('STOCK_OUT');
    expect(actionLabel('RESET_ROLE_PERMISSIONS')).toBe('Reset role permissions');
    expect(withRoleNames('Rejected by Abebe (TEAM_LEADER); permissions updated for role MANAGER. The MANAGER word alone stays.')).toBe(
      'Rejected by Abebe (Team Leader); permissions updated for role Manager. The MANAGER word alone stays.',
    );
  });
});
