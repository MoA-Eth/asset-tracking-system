import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Eye, Pencil, Printer } from 'lucide-react';
import { RowActionsMenu } from './RowActionsMenu';

const setup = (onView = vi.fn(), onEdit = vi.fn()) => {
  render(
    <RowActionsMenu
      label="MOA-IT-2026-0078"
      actions={[
        { label: 'View details', icon: Eye, onClick: onView },
        { label: 'Edit registration', icon: Pencil, onClick: onEdit, disabled: true, reason: 'The Team Leader has endorsed it.' },
        { label: 'Print Model 19', icon: Printer, hidden: true },
      ]}
    />,
  );
  return { onView, onEdit };
};

describe('RowActionsMenu', () => {
  it('opens on click and shows only the visible actions', () => {
    setup();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for MOA-IT-2026-0078' }));
    expect(screen.getByRole('menuitem', { name: /View details/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Print Model 19/ })).toBeNull();
  });

  it('runs an action and closes', () => {
    const { onView } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Actions for/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /View details/ }));
    expect(onView).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows a locked action with its reason and does not run it', () => {
    const { onEdit } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Actions for/ }));
    const edit = screen.getByRole('menuitem', { name: /Edit registration/ }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.textContent).toContain('The Team Leader has endorsed it.');
    fireEvent.click(edit);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Actions for/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
