import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepartmentsPage } from './DepartmentsPage';
import { App } from '../App';
import { api } from '../api/client';
import {
  AssetCategory,
  Department,
  Employee,
  ItemCondition,
  ItemStatus,
  ItemWithRelations,
  UserRole,
} from '../types/asset-management';

vi.mock('../api/client', () => ({
  api: {
    getDepartments: vi.fn(),
    getEmployees: vi.fn(),
    getItems: vi.fn(),
    getMe: vi.fn(),
    getApprovals: vi.fn(),
  },
}));

const departments: Department[] = [
  {
    id: 'EXT',
    code: 'EXT',
    nameEn: 'Agricultural Extension',
    nameAm: 'የግብርና ኤክስቴንሽን',
    headEmployeeId: 'EMP-1',
  },
  {
    id: 'ICT',
    code: 'ICT',
    nameEn: 'Digital Agriculture',
    nameAm: 'ዲጂታል ግብርና',
    headEmployeeId: 'missing',
  },
  { id: 'HORT', code: 'HORT', nameEn: 'Horticulture', nameAm: 'ሆርቲካልቸር' },
];
const employee: Employee = {
  id: 'EMP-1',
  payrollId: 'MOA/001',
  fullNameEn: 'Tigist Haile',
  fullNameAm: 'ትዕግስት ኃይሌ',
  departmentId: 'EXT',
  email: 'tigist@moa.gov.et',
  phone: '+251911000000',
  role: UserRole.DEPARTMENT_HEAD,
};
const item: ItemWithRelations = {
  id: 'ITEM-1',
  itemCode: 'MOA-IT-001',
  name: 'Field laptop',
  category: AssetCategory.IT_EQUIPMENT,
  serialNumber: 'SN-001',
  unitCostETB: 1000,
  status: ItemStatus.ISSUED,
  condition: ItemCondition.GOOD,
  storeLocationId: 'LOC-1',
  assignedDepartmentId: 'EXT',
  currentCustodianId: employee.id,
  currentCustodian: employee,
  ifmisSlipNumber: 'IFMIS-001',
  ifmisSlipDateGc: '2026-09-30',
  ifmisSlipDateEc: '2019-01-20',
  registeredById: employee.id,
  createdAtGc: '2026-09-30',
  createdAtEc: '2019-01-20',
  history: [],
};
const items: ItemWithRelations[] = [
  item,
  {
    ...item,
    id: 'ITEM-2',
    name: 'Pending tractor',
    itemCode: 'MOA-AGR-002',
    ifmisSlipNumber: 'IFMIS-002',
    status: ItemStatus.PENDING_STOCK_OUT,
    unitCostETB: 2000,
    currentCustodian: null,
    currentCustodianId: null,
  },
  {
    ...item,
    id: 'ITEM-3',
    name: 'Disposed server',
    assignedDepartmentId: 'ICT',
    status: ItemStatus.DISPOSED,
    unitCostETB: 99999,
  },
  {
    ...item,
    id: 'ITEM-4',
    name: 'Store stock',
    assignedDepartmentId: null,
    status: ItemStatus.AVAILABLE,
    unitCostETB: 500,
  },
  {
    ...item,
    id: 'ITEM-5',
    name: 'Unknown department asset',
    assignedDepartmentId: 'UNKNOWN',
    unitCostETB: 600,
  },
];

beforeEach(() => {
  Object.values(api).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockReset();
  });
  vi.mocked(api.getDepartments).mockResolvedValue(departments);
  vi.mocked(api.getEmployees).mockResolvedValue([employee]);
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getApprovals).mockResolvedValue([]);
  vi.mocked(api.getMe).mockResolvedValue({
    ...employee,
    role: UserRole.SYSTEM_ADMIN,
  });
});

describe('Departments page', () => {
  it('calculates recorded allocations and distinguishes disposed, unallocated, and unknown departments', async () => {
    render(<DepartmentsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading departments');
    await screen.findByRole('table', {
      name: 'Directorate staff and active asset allocations',
    });
    const totals = screen.getByLabelText('Ministry allocation totals');
    expect(
      within(
        within(totals).getByText('Allocated assets').parentElement!
      ).getByText('2')
    ).toBeInTheDocument();
    expect(within(totals).getByText(/ETB\s+3,000/)).toBeInTheDocument();
    expect(
      screen.getByText('Unallocated active assets: 1')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Active assets with an unavailable department: 1/)
    ).toBeInTheDocument();
    const extRow = screen
      .getByRole('button', { name: 'View EXT allocation' })
      .closest('tr')!;
    const cells = within(extRow).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('2');
    expect(cells[3]).toHaveTextContent('1');
    expect(screen.getByText('Head record unavailable')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
  });

  it('searches bilingual names and heads, combines allocation filters, and clears empty results', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);
    await screen.findByRole('button', { name: 'View EXT allocation' });
    await user.type(screen.getByLabelText('Search departments'), 'ሆርቲ');
    expect(
      screen.getByRole('button', { name: 'View HORT allocation' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View EXT allocation' })
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText('Allocation filter'),
      'allocated'
    );
    expect(screen.getByText('No matching departments')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.type(screen.getByLabelText('Search departments'), 'Tigist');
    expect(
      screen.getByRole('button', { name: 'View EXT allocation' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View ICT allocation' })
    ).not.toBeInTheDocument();
  });

  it('opens staff and asset details, filters pending and issued items, and handles a department with no assets', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'View EXT allocation' })
    );
    const details = screen.getByRole('region', {
      name: 'Agricultural Extension',
    });
    expect(within(details).getByText('Field laptop')).toBeInTheDocument();
    expect(within(details).getByText('Pending Stock-Out')).toBeInTheDocument();
    expect(
      within(details).queryByText('Disposed server')
    ).not.toBeInTheDocument();
    await user.click(within(details).getByText('Staff directory (1)'));
    expect(within(details).getByText(employee.email)).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText('Asset status'),
      ItemStatus.ISSUED
    );
    expect(
      within(details).queryByText('Pending tractor')
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Search allocated assets'),
      'not-found'
    );
    expect(
      within(details).getByText('No allocated assets match these filters.')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Close department details' })
    );
    expect(
      screen.getByRole('button', { name: 'View EXT allocation' })
    ).toHaveFocus();
    await user.click(
      screen.getByRole('button', { name: 'View ICT allocation' })
    );
    expect(
      screen.getByText('No active assets allocated to this department.')
    ).toBeInTheDocument();
  });

  it('retries an initial load failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getDepartments).mockRejectedValueOnce(
      new Error('Connection unavailable')
    );
    render(<DepartmentsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connection unavailable'
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('button', { name: 'View EXT allocation' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the previous registry on refresh failure and updates it on retry', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);
    await screen.findByRole('button', { name: 'View EXT allocation' });
    vi.mocked(api.getItems).mockRejectedValueOnce(
      new Error('Network unavailable')
    );
    await user.click(
      screen.getByRole('button', { name: 'Refresh departments' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Showing the last loaded data.'
    );
    expect(
      screen.getByRole('button', { name: 'View EXT allocation' })
    ).toBeInTheDocument();
    vi.mocked(api.getItems).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await within(
        screen.getByLabelText('Ministry allocation totals')
      ).findByText(/ETB\s+0/)
    ).toBeInTheDocument();
  });

  it('shows an empty registry without inventing departments or values', async () => {
    vi.mocked(api.getDepartments).mockResolvedValue([]);
    vi.mocked(api.getEmployees).mockResolvedValue([]);
    vi.mocked(api.getItems).mockResolvedValue([]);
    render(<DepartmentsPage />);
    expect(
      await screen.findByText('No departments registered')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Ministry allocation totals')).getByText(
        /ETB\s+0/
      )
    ).toBeInTheDocument();
  });

  it.each([0, 1])(
    'opens the dedicated page through navigation button %s and persists the selected tab',
    async (index) => {
      const user = userEvent.setup();
      localStorage.setItem('moa_token', 'test-token');
      localStorage.setItem(
        'moa_user',
        JSON.stringify({ ...employee, role: UserRole.SYSTEM_ADMIN })
      );
      localStorage.setItem('moa_active_tab', 'settings');
      render(<App />);
      await screen.findByRole('heading', { name: 'Employees', level: 2 });
      if (index === 1) await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(
        screen.getAllByRole('button', { name: 'Departments' })[
          index
        ]
      );
      expect(
        await screen.findByRole('heading', {
          name: 'Departments & asset allocation',
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Employees', level: 2 })
      ).not.toBeInTheDocument();
      expect(localStorage.getItem('moa_active_tab')).toBe(
        'settings-departments'
      );
      await screen.findByRole('button', { name: 'View EXT allocation' });
    }
  );
});
