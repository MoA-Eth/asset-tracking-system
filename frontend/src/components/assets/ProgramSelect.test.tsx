import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgramSelect } from './ProgramSelect';
import { PROGRAMS } from './receipt-options';

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
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['None', ...PROGRAMS, '+ Other (type the name)…']);
    await user.selectOptions(field, 'Food System Resilience Program (FSRP)');
    expect(screen.getByRole('status')).toHaveTextContent('Food System Resilience Program (FSRP)');
  });

  it('takes a typed name when the program is not on the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Program / project'), '+ Other (type the name)…');
    await user.type(screen.getByLabelText('Program / project'), 'New donor project');
    expect(screen.getByRole('status')).toHaveTextContent('New donor project');
    // Back to the list keeps the typed name as a choice
    await user.click(screen.getByRole('button', { name: 'Back to the list of programs' }));
    expect(screen.getByLabelText('Program / project')).toHaveValue('New donor project');
  });

  it('shows a name read from a slip or saved earlier as it is', () => {
    render(<Harness start="Office renewal" />);
    expect(screen.getByLabelText('Program / project')).toHaveValue('Office renewal');
  });
});
