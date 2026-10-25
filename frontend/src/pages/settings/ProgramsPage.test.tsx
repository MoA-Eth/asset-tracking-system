import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgramsPage } from './ProgramsPage';
import { api } from '../../api/client';

const auth = vi.hoisted(() => ({
  user: { id: 'admin', permissions: ['references.manage'] as string[] },
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: {
    getPrograms: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    setProgramStatus: vi.fn(),
    deleteProgram: vi.fn(),
  },
}));

const mockPrograms = [
  {
    id: 'PRG-1',
    name: 'Food System Resilience Program (FSRP)',
    code: 'FSRP',
    description: 'World Bank agriculture initiative',
    isActive: true,
  },
  {
    id: 'PRG-2',
    name: 'Productive Safety Net Programme (PSNP)',
    code: 'PSNP',
    description: 'Safety net program',
    isActive: true,
  },
  {
    id: 'PRG-3',
    name: 'Old Closed Project',
    code: 'OCP',
    description: '',
    isActive: false,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['references.manage'];
  vi.mocked(api.getPrograms).mockResolvedValue(mockPrograms as any);
  vi.mocked(api.createProgram).mockImplementation(async (input: any) => ({
    id: 'PRG-NEW',
    ...input,
    isActive: true,
  }));
  vi.mocked(api.updateProgram).mockImplementation(async (id: string, input: any) => ({
    id,
    ...input,
    isActive: true,
  }));
  vi.mocked(api.setProgramStatus).mockImplementation(async (id: string, active: boolean) => ({
    id,
    name: 'Test Program',
    code: 'TP',
    description: '',
    isActive: active,
  }));
  vi.mocked(api.deleteProgram).mockResolvedValue(null as any);
});

describe('ProgramsPage', () => {
  it('renders programs and filters by active status and search text', async () => {
    const user = userEvent.setup();
    render(<ProgramsPage />);

    expect(await screen.findByText('Food System Resilience Program (FSRP)')).toBeInTheDocument();
    expect(screen.getByText('Productive Safety Net Programme (PSNP)')).toBeInTheDocument();
    expect(screen.getByText('FSRP')).toBeInTheDocument();
    // Inactive program should be hidden when StatusFilter is ACTIVE
    expect(screen.queryByText('Old Closed Project')).not.toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByLabelText('Search programs');
    await user.type(searchInput, 'PSNP');
    expect(screen.queryByText('Food System Resilience Program (FSRP)')).not.toBeInTheDocument();
    expect(screen.getByText('Productive Safety Net Programme (PSNP)')).toBeInTheDocument();
  });

  it('allows adding a new program', async () => {
    const user = userEvent.setup();
    render(<ProgramsPage />);

    await user.click(await screen.findByRole('button', { name: /Add program/i }));
    expect(screen.getByRole('heading', { name: 'Add program / project' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Program \/ project name/i), 'National Wheat Program');
    await user.type(screen.getByLabelText(/Code \/ abbreviation/i), 'NWP');
    await user.type(screen.getByLabelText(/Description \/ donor/i), 'National wheat development initiative');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add program' }));

    await waitFor(() => {
      expect(api.createProgram).toHaveBeenCalledWith({
        name: 'National Wheat Program',
        code: 'NWP',
        description: 'National wheat development initiative',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Program added', 'National Wheat Program');
  });

  it('allows editing an existing program', async () => {
    const user = userEvent.setup();
    render(<ProgramsPage />);

    expect(await screen.findByText('Food System Resilience Program (FSRP)')).toBeInTheDocument();

    const menuButtons = screen.getAllByRole('button', { name: /Actions for/i });
    await user.click(menuButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Edit program' }));

    expect(screen.getByRole('heading', { name: /Edit Food System Resilience Program/i })).toBeInTheDocument();
    const codeInput = screen.getByLabelText(/Code \/ abbreviation/i);
    await user.clear(codeInput);
    await user.type(codeInput, 'FSRP-II');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(api.updateProgram).toHaveBeenCalledWith('PRG-1', {
        name: 'Food System Resilience Program (FSRP)',
        code: 'FSRP-II',
        description: 'World Bank agriculture initiative',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Program updated', 'Food System Resilience Program (FSRP)');
  });

  it('allows deactivating and reactivating a program', async () => {
    const user = userEvent.setup();
    render(<ProgramsPage />);

    expect(await screen.findByText('Food System Resilience Program (FSRP)')).toBeInTheDocument();

    const menuButtons = screen.getAllByRole('button', { name: /Actions for/i });
    await user.click(menuButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));

    expect(screen.getByText(/Deactivate Food System Resilience Program \(FSRP\)\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(api.setProgramStatus).toHaveBeenCalledWith('PRG-1', false);
    });
  });

  it('allows deleting a program', async () => {
    const user = userEvent.setup();
    render(<ProgramsPage />);

    expect(await screen.findByText('Food System Resilience Program (FSRP)')).toBeInTheDocument();

    const menuButtons = screen.getAllByRole('button', { name: /Actions for/i });
    await user.click(menuButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Delete program' }));

    expect(screen.getByText(/Delete Food System Resilience Program \(FSRP\)\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete program' }));

    await waitFor(() => {
      expect(api.deleteProgram).toHaveBeenCalledWith('PRG-1');
    });
    expect(toast.success).toHaveBeenCalledWith('Program deleted', 'Food System Resilience Program (FSRP)');
  });
});
