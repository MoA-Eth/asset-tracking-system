import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreManReminder } from './StoreManReminder';
import { api } from '../../api/client';

const auth = vi.hoisted(() => ({ permissions: ['references.manage'] as string[] }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', permissions: auth.permissions } }) }));
vi.mock('../../api/client', () => ({ api: { getStores: vi.fn() } }));

const keeper = { employeeId: 'E1', fullNameEn: 'Abebe', payrollId: '1', isActive: true };
const store = (id: string, name: string, keepers: object[] = [], isActive = true) => ({ id, name, isActive, locations: [], storeKeepers: keepers });

beforeEach(() => {
  vi.resetAllMocks();
  auth.permissions = ['references.manage'];
});

describe('Store man reminder', () => {
  it('names the active stores that have no store man, and leads to the Stores page', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    vi.mocked(api.getStores).mockResolvedValue([
      store('S1', 'Kality', [keeper]),
      store('S2', 'Saris'),
      store('S3', 'Bole'),
      store('S4', 'Closed depot', [], false),
    ] as any);
    render(<StoreManReminder onAssign={onAssign} />);
    expect(await screen.findByText('2 stores have no store man assigned')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('(Saris, Bole)');
    expect(screen.getByRole('status')).not.toHaveTextContent('Closed depot');
    await user.click(screen.getByRole('button', { name: 'Assign store men' }));
    expect(onAssign).toHaveBeenCalled();
  });

  it('says nothing once every active store has one, or a store man has left', () => {
    render(<StoreManReminder stores={[store('S1', 'Kality', [keeper])] as any} />);
    expect(screen.queryByRole('status')).toBeNull();
    render(<StoreManReminder stores={[store('S2', 'Saris', [{ ...keeper, isActive: false }])] as any} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 store has no store man assigned');
  });

  it('is not shown to someone who cannot assign store men', () => {
    auth.permissions = ['inventory.read'];
    render(<StoreManReminder stores={[store('S2', 'Saris')] as any} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(api.getStores).not.toHaveBeenCalled();
  });
});
