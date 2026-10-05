import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeesPage } from './EmployeesPage';
import { api } from '../../api/client';
import { UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({ user: { id: 'admin', permissions: ['employees.manage'] as string[] }, refreshSession: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../api/client', () => ({
  api: { getEmployees: vi.fn(), getDepartments: vi.fn(), createEmployee: vi.fn(), updateEmployee: vi.fn(), setEmployeeActive: vi.fn(), importEmployees: vi.fn() },
}));

const custodian = {
  id: 'staff', payrollId: 'MOA/100', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ ከበደ', departmentId: 'DEP-01',
  jobTitle: 'Driver', email: null, phone: '+251911000000', role: null, isActive: true, heldItemCount: 2,
};
const former = { ...custodian, id: 'former', payrollId: 'MOA/101', fullNameEn: 'Former Officer', isActive: false, heldItemCount: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.permissions = ['employees.manage'];
  vi.mocked(api.getEmployees).mockResolvedValue([custodian, former] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([{ id: 'DEP-01', code: 'PROP', nameEn: 'Procurement & Property' }] as any);
});

describe('Employees page', () => {
  it('shows active staff by default, with deactivated staff one click away', async () => {
    const user = userEvent.setup();
    render(<EmployeesPage />);
    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('No sign-in')).toBeInTheDocument();
    expect(screen.queryByText('Former Officer')).not.toBeInTheDocument();
    expect(api.getEmployees).toHaveBeenCalledWith(undefined, { includeInactive: true });
    await user.click(screen.getByRole('button', { name: /^Filter employees/i }));
    await user.click(screen.getByRole('button', { name: /Deactivated/ }));
    expect(screen.getByText('Former Officer')).toBeInTheDocument();
  });

  it("locks Deactivate for someone who still holds items", async () => {
    const user = userEvent.setup();
    render(<EmployeesPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Abebe Kebede' }));
    const item = screen.getByRole('menuitem', { name: /Deactivate/ }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain('Holds 2 items');
  });

  it('adds a staff member from their details alone, with no sign-in fields', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createEmployee).mockResolvedValue({ ...custodian, id: 'new', fullNameEn: 'Hana Tesfaye', heldItemCount: 0 } as any);
    render(<EmployeesPage />);
    await user.click(await screen.findByRole('button', { name: 'Add employee' }));
    expect(screen.queryByLabelText(/Sign-in role/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Full name .English./), 'Hana Tesfaye');
    await user.type(screen.getByLabelText(/Full name .Amharic./), 'ሐና');
    await user.type(screen.getByLabelText(/Employee ID/), 'MOA/200');
    await user.type(screen.getByLabelText(/^Department/), 'New Desk');
    expect(screen.getByText('New department. It will be added when you save.')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add employee' }));
    const sent = vi.mocked(api.createEmployee).mock.calls[0][0];
    expect(sent).toMatchObject({ payrollId: 'MOA/200', fullNameEn: 'Hana Tesfaye', departmentName: 'New Desk' });
    expect(sent).not.toHaveProperty('role');
    expect(sent).not.toHaveProperty('password');
    expect(await screen.findByText('Hana Tesfaye')).toBeInTheDocument();
  });

  it('validates and restricts Full name (Amharic) to Ethiopic script', async () => {
    const user = userEvent.setup();
    render(<EmployeesPage />);
    await user.click(await screen.findByRole('button', { name: 'Add employee' }));

    const amharicInput = screen.getByLabelText(/Full name .Amharic./);
    await user.type(screen.getByLabelText(/Full name .English./), 'Abebe Kebede');
    await user.type(screen.getByLabelText(/Employee ID/), 'MOA/999');
    await user.type(screen.getByLabelText(/^Department/), 'Procurement');

    // Type Latin characters into Amharic field
    await user.type(amharicInput, 'Abebe');
    expect(screen.getByText(/Ethiopic script only/i)).toBeInTheDocument();
    expect(amharicInput).toHaveAttribute('aria-invalid', 'true');

    // Attempt to submit with Latin characters
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add employee' }));
    expect(api.createEmployee).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Latin letters are not allowed/i).length).toBeGreaterThanOrEqual(1);

    // Clear and type valid Ethiopic characters
    await user.clear(amharicInput);
    await user.type(amharicInput, 'አበበ');
    expect(screen.queryByText(/Latin letters are not allowed/i)).not.toBeInTheDocument();
    expect(amharicInput).not.toHaveAttribute('aria-invalid', 'true');

    vi.mocked(api.createEmployee).mockResolvedValue({ ...custodian, id: 'emp-999', fullNameAm: 'አበበ' } as any);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add employee' }));
    expect(api.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ fullNameAm: 'አበበ' }));
  });

  it('checks an HR file, shows what will happen, and imports on confirmation', async () => {
    const user = userEvent.setup();
    const preview = {
      applied: false,
      counts: { create: 1, update: 0, unchanged: 0, error: 1 },
      newDepartments: ['Finance'],
      rows: [
        { row: 2, payrollId: 'MOA/300', fullNameEn: 'Sara Ali', department: 'PROP — Procurement & Property', action: 'create' },
        { row: 3, payrollId: 'MOA/301', fullNameEn: 'No Dept', department: 'Finance', action: 'error', message: 'Gender must be Male or Female.' },
      ],
    };
    vi.mocked(api.importEmployees).mockResolvedValueOnce(preview as any).mockResolvedValueOnce({ ...preview, applied: true } as any);
    render(<EmployeesPage />);
    await user.click(await screen.findByRole('button', { name: 'Import from Excel' }));
    const csv = 'Payroll ID,Full name (English),Full name (Amharic),Department\nMOA/300,Sara Ali,ሳራ,PROP\nMOA/301,No Dept,ሀ,Finance\n';
    await user.upload(screen.getByLabelText(/Choose an Excel/), new File([csv], 'hr.csv', { type: 'text/csv' }));

    expect(await screen.findByText('Gender must be Male or Female.')).toBeInTheDocument();
    expect(screen.getByText(/1 new department/)).toBeInTheDocument();
    expect(vi.mocked(api.importEmployees).mock.calls[0]).toEqual([
      [
        expect.objectContaining({ row: 2, payrollId: 'MOA/300', fullNameEn: 'Sara Ali', department: 'PROP' }),
        expect.objectContaining({ row: 3, payrollId: 'MOA/301', department: 'Finance' }),
      ],
      false,
    ]);
    // Before importing, the window says the bad row will be skipped and the rest still imported
    expect(screen.getByText(/1 row has problems and will be skipped; the rest will still be imported\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 1 employee' }));
    expect(vi.mocked(api.importEmployees).mock.calls[1][1]).toBe(true);
    expect(api.getEmployees).toHaveBeenCalledTimes(2);

    // The good row is saved; the window stays open on the skipped row and its reason
    expect(toast.warning).toHaveBeenCalledWith('Imported, with rows skipped', '1 added, 0 updated, 1 department created. 1 row was skipped.');
    expect(toast.success).not.toHaveBeenCalled();
    const summary = await screen.findByRole('status');
    expect(summary).toHaveTextContent('1 added and 0 updated. 1 row was skipped and is listed below with the reason.');
    expect(screen.getByText('Gender must be Male or Female.')).toBeInTheDocument();
    expect(screen.queryByText('Sara Ali')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import \d/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with a plain confirmation when every row was imported', async () => {
    const user = userEvent.setup();
    const preview = {
      applied: false,
      counts: { create: 1, update: 1, unchanged: 0, error: 0 },
      newDepartments: [],
      rows: [
        { row: 2, payrollId: 'MOA/300', fullNameEn: 'Sara Ali', department: 'PROP', action: 'create' },
        { row: 3, payrollId: 'MOA/301', fullNameEn: 'Dawit Bekele', department: 'PROP', action: 'update' },
      ],
    };
    vi.mocked(api.importEmployees).mockResolvedValueOnce(preview as any).mockResolvedValueOnce({ ...preview, applied: true } as any);
    render(<EmployeesPage />);
    await user.click(await screen.findByRole('button', { name: 'Import from Excel' }));
    const csv = 'Payroll ID,Full name (English),Department\nMOA/300,Sara Ali,PROP\nMOA/301,Dawit Bekele,PROP\n';
    await user.upload(screen.getByLabelText(/Choose an Excel/), new File([csv], 'hr.csv', { type: 'text/csv' }));
    await user.click(await screen.findByRole('button', { name: 'Import 2 employees' }));

    expect(toast.success).toHaveBeenCalledWith('Employees imported', '1 added, 1 updated');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is read-only without permission to manage employees', async () => {
    auth.user.permissions = ['references.read'];
    vi.mocked(api.getEmployees).mockResolvedValue([{ ...custodian, phone: undefined, heldItemCount: undefined }] as any);
    render(<EmployeesPage />);
    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add employee' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Contact')).not.toBeInTheDocument();
    expect(api.getEmployees).toHaveBeenCalledWith(undefined, { includeInactive: false });
  });
});
