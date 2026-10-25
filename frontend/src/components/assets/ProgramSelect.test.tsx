import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgramSelect } from './ProgramSelect';
import { PROGRAMS } from './receipt-options';
import { api } from '../../api/client';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));

const Harness: React.FC<{ start?: string }> = ({ start = '' }) => {
  const [value, setValue] = useState(start);
  return (
    <>
      <label htmlFor="p">Program / project</label>
      <ProgramSelect id="p" value={value} onChange={setValue} className="" />
      <output>{value}</output>
    </>
  );
};

describe('Program / project', () => {
  it("offers the ministry's programs", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByLabelText('Program / project');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'None',
      ...PROGRAMS,
      '+ Add new program / project…',
    ]);
    await user.selectOptions(field, 'Food System Resilience Program (FSRP)');
    expect(screen.getByRole('status')).toHaveTextContent('Food System Resilience Program (FSRP)');
    await user.selectOptions(field, 'MoA');
    expect(screen.getByRole('status')).toHaveTextContent('MoA');
  });

  it('opens quick-add modal when choosing "+ Add new program" or clicking "+" button', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, 'createProgram').mockResolvedValueOnce({
      id: 'PRG-99',
      name: 'New Donor Project',
      code: 'NDP',
      description: 'Donor funded',
      isActive: true,
    } as any);

    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Program / project'), '+ Add new program / project…');

    expect(screen.getByRole('heading', { name: 'Add program / project' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Program \/ project name/i), 'New Donor Project');
    await user.type(screen.getByLabelText(/Code \/ abbreviation/i), 'NDP');
    await user.type(screen.getByLabelText(/Description \/ donor/i), 'Donor funded');

    await user.click(screen.getByRole('button', { name: 'Add and select program' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'New Donor Project',
        code: 'NDP',
        description: 'Donor funded',
      });
      expect(screen.getByRole('status')).toHaveTextContent('New Donor Project');
    });

    createSpy.mockRestore();
  });

  it('shows a name read from a slip or saved earlier as unregistered choice', () => {
    render(<Harness start="Office renewal" />);
    expect(screen.getByLabelText('Program / project')).toHaveValue('Office renewal');
    expect(screen.getByRole('option', { name: 'Office renewal (unregistered)' })).toBeInTheDocument();
  });

  it('lists RED&FS, and shows one saved as "(REDFS)" as that entry, not a second one', () => {
    render(<Harness start="Rural Economic Development and Food Security (REDFS)" />);
    expect(screen.getByLabelText('Program / project')).toHaveValue('Rural Economic Development and Food Security (RED&FS)');
    expect(screen.queryByRole('option', { name: /\(REDFS\)/ })).toBeNull();
  });

  it('loads dynamic programs from API when available', async () => {
    const spy = vi.spyOn(api, 'getPrograms').mockResolvedValueOnce([
      { id: 'PRG-1', name: 'Custom Dynamic Project', isActive: true },
      { id: 'PRG-2', name: 'Another Project', isActive: true },
    ] as any);

    render(<Harness />);
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.textContent)).toContain('Custom Dynamic Project');
      expect(options.map((o) => o.textContent)).toContain('Another Project');
    });
    spy.mockRestore();
  });
});
