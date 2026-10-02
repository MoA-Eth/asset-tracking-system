import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

/** A window with a small form, like the Stock-In form */
const Demo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [name, setName] = useState('');
  return (
    <Modal isOpen onClose={onClose} title="Register item">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </Modal>
  );
};

describe('Modal: closing a window that holds typed data', () => {
  it('closes straight away when nothing was typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before discarding once something was typed, on Escape and on the X', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    await user.type(screen.getByLabelText('Name'), 'Laptop');

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard what you entered?');

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('Laptop');

    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a click outside once something was typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    await user.type(screen.getByLabelText('Name'), 'Laptop');
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
