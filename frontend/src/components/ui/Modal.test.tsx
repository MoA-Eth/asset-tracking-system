import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal keyboard navigation', () => {
  it('keeps focus in the dialog, preserves it during edits, and restores it on close', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender, unmount } = render(
      <Modal isOpen onClose={close} title="Edit record"><input aria-label="Description" /></Modal>
    );
    expect(screen.getByRole('button', { name: 'Close modal' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByLabelText('Description')).toHaveFocus();
    await user.type(screen.getByLabelText('Description'), 'Updated');
    rerender(<Modal isOpen onClose={() => close()} title="Edit record"><input aria-label="Description" /></Modal>);
    expect(screen.getByLabelText('Description')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close modal' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
