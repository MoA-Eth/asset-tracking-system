import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyAssetsPage } from './MyAssetsPage';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: { getMyAssets: vi.fn() } }));

const asset = (extra: Record<string, unknown> = {}) => ({
  id: 'item-1', itemCode: 'MOA-IT-2024-0002', name: 'HP ProBook 450 Laptop', category: 'IT_EQUIPMENT', serialNumber: 'SN-HP-1',
  condition: 'GOOD', quantity: 1, uom: 'EA', status: 'ISSUED', assignedOnGc: '2026-09-01', voucherNo: 'M22-77',
  department: 'Agricultural Extension', issuedFrom: 'Head office · Central Store', purpose: 'Crop surveys', ...extra,
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('My assets', () => {
  it('lists what is assigned to the signed-in employee, with serial number, date and slip', async () => {
    vi.mocked(api.getMyAssets).mockResolvedValue([asset(), asset({ id: 'item-2', itemCode: 'MOA-FUR-1', name: 'Office chair', serialNumber: '', quantity: 3, uom: 'EA', condition: 'FAIR', voucherNo: undefined })]);
    render(<MyAssetsPage />);

    expect(await screen.findByText('2 assets are assigned to you.')).toBeInTheDocument();
    const table = screen.getByRole('table');
    const laptop = within(table).getByText('MOA-IT-2024-0002').closest('tr')!;
    expect(within(laptop).getByText('HP ProBook 450 Laptop')).toBeInTheDocument();
    expect(within(laptop).getByText('SN-HP-1')).toBeInTheDocument();
    expect(within(laptop).getByText('2026-09-01')).toBeInTheDocument();
    expect(within(laptop).getByText('M22-77')).toBeInTheDocument();
    expect(within(laptop).getByText('Assigned to you')).toBeInTheDocument();
    const chair = within(table).getByText('MOA-FUR-1').closest('tr')!;
    expect(within(chair).getByText('3 EA')).toBeInTheDocument();
    expect(within(chair).getByText('Fair')).toBeInTheDocument();
  });

  it('says so, in the singular, for one asset', async () => {
    vi.mocked(api.getMyAssets).mockResolvedValue([asset()]);
    render(<MyAssetsPage />);
    expect(await screen.findByText('1 asset is assigned to you.')).toBeInTheDocument();
  });

  it('shows a waiting return or transfer and who it is waiting for', async () => {
    vi.mocked(api.getMyAssets).mockResolvedValue([
      asset({ pendingRequest: { type: 'RETURN', stage: 1 } }),
      asset({ id: 'item-3', itemCode: 'MOA-VEH-1', name: 'Pick-up', status: 'UNDER_TRANSFER', pendingRequest: { type: 'TRANSFER', stage: 2 } }),
    ]);
    render(<MyAssetsPage />);
    await screen.findByText('2 assets are assigned to you.');
    const table = screen.getByRole('table');
    const back = within(table).getByText('MOA-IT-2024-0002').closest('tr')!;
    expect(within(back).getByText('Return pending')).toBeInTheDocument();
    expect(within(back).getByText('Waiting for the Team Leader')).toBeInTheDocument();
    const moving = within(table).getByText('MOA-VEH-1').closest('tr')!;
    expect(within(moving).getByText('Transfer pending')).toBeInTheDocument();
    expect(within(moving).getByText('Waiting for final approval')).toBeInTheDocument();
  });

  it('opens the details of an asset when its row is clicked, and closes them again', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getMyAssets).mockResolvedValue([asset(), asset({ id: 'item-2', itemCode: 'MOA-FUR-1', name: 'Office chair', serialNumber: '', purpose: undefined })]);
    render(<MyAssetsPage />);
    await screen.findByText('2 assets are assigned to you.');

    await user.click(within(screen.getByRole('table')).getByRole('row', { name: 'Open MOA-IT-2024-0002' }));
    const details = await screen.findByRole('dialog');
    expect(within(details).getByText('HP ProBook 450 Laptop')).toBeInTheDocument();
    expect(within(details).getByText('SN-HP-1')).toBeInTheDocument();
    expect(within(details).getByText('Agricultural Extension')).toBeInTheDocument();
    expect(within(details).getByText('Head office · Central Store')).toBeInTheDocument();
    expect(within(details).getByText('Crop surveys')).toBeInTheDocument();
    expect(within(details).getByText('M22-77')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    // With the keyboard, and a missing detail shows a dash
    const chair = within(screen.getByRole('table')).getByRole('row', { name: 'Open MOA-FUR-1' });
    chair.focus();
    await user.keyboard('{Enter}');
    const second = await screen.findByRole('dialog');
    expect(within(second).getByText('Purpose').nextSibling).toHaveTextContent('—');
  });

  it('has a friendly empty state when nothing is assigned', async () => {
    vi.mocked(api.getMyAssets).mockResolvedValue([]);
    render(<MyAssetsPage />);
    expect(await screen.findByText('Nothing is assigned to you')).toBeInTheDocument();
    expect(screen.getByText(/If you think an asset should be assigned to you, contact the store/)).toBeInTheDocument();
    // The message is said once, not twice
    expect(screen.queryByText(/no assets are assigned to you/i)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the problem and can try again', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getMyAssets).mockRejectedValueOnce(new Error('The server is not reachable.')).mockResolvedValueOnce([asset()]);
    render(<MyAssetsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is not reachable.');
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText('1 asset is assigned to you.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
