import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentsPage } from './DepartmentsPage';
import { api } from '../../api/client';
import { AssetCategory, ItemCondition, ItemStatus, UserRole } from '../../types/asset-management';

const auth = vi.hoisted(() => ({
  user: {
    role: 'SYSTEM_ADMIN',
    permissions: ['roles.assign', 'references.read'],
  },
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../../api/client', () => ({
  api: {
    getDepartments: vi.fn(),
    getEmployees: vi.fn(),
    getItems: vi.fn(),
  },
}));

const mockDepartments = [
  {
    id: 'DEP-01',
    code: 'EXT',
    nameEn: 'Agricultural Extension Directorate',
    nameAm: 'የግብርና ኤክስቴንሽን ዳይሬክቶሬት',
    headEmployeeId: 'EMP-01',
  },
  {
    id: 'DEP-02',
    code: 'ICT',
    nameEn: 'Digital Agriculture & ICT Directorate',
    nameAm: 'የኢንፎርሜሽን ቴክኖሎጂ ዳይሬክቶሬት',
    headEmployeeId: undefined,
  },
];

const mockEmployees = [
  {
    id: 'EMP-01',
    payrollId: 'PAY-100',
    fullNameEn: 'Abebe Kebede',
    fullNameAm: 'አበበ ከበደ',
    role: UserRole.DEPARTMENT_HEAD,
    departmentId: 'DEP-01',
    email: 'abebe@moa.gov.et',
    phone: '+251911000000',
  },
  {
    id: 'EMP-02',
    payrollId: 'PAY-101',
    fullNameEn: 'Chala Desta',
    fullNameAm: 'ጫላ ደስታ',
    role: UserRole.DATA_ENCODER,
    departmentId: 'DEP-02',
    email: 'chala@moa.gov.et',
  },
];

const mockItems = [
  {
    id: 'ITEM-01',
    itemCode: 'IT-1001',
    name: 'Dell Latitude 5440',
    category: AssetCategory.IT_EQUIPMENT,
    serialNumber: 'SN-99881',
    unitCostETB: 50000,
    condition: ItemCondition.NEW,
    status: ItemStatus.ISSUED,
    assignedDepartmentId: 'DEP-01',
    assignedEmployeeId: 'EMP-01',
    assignedEmployee: mockEmployees[0],
    quantity: 1,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getDepartments).mockResolvedValue(mockDepartments as any);
  vi.mocked(api.getEmployees).mockResolvedValue(mockEmployees as any);
  vi.mocked(api.getItems).mockResolvedValue(mockItems as any);
});

describe('DepartmentsPage', () => {
  it('renders directorates list, summary KPI cards and table rows', async () => {
    render(<DepartmentsPage />);

    expect(await screen.findByText('Agricultural Extension Directorate')).toBeInTheDocument();
    expect(screen.getByText('Digital Agriculture & ICT Directorate')).toBeInTheDocument();
    expect(screen.getByText('EXT')).toBeInTheDocument();
    expect(screen.getByText('ICT')).toBeInTheDocument();

    // Directorate head
    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    // Summary cards
    expect(screen.getByText('Active Directorates')).toBeInTheDocument();
    expect(screen.getByText('Allocated Valuation')).toBeInTheDocument();
  });

  it('filters directorates by search query', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);

    await screen.findByText('Agricultural Extension Directorate');

    const searchInput = screen.getByPlaceholderText(/Search by code, English name/i);
    await user.type(searchInput, 'ICT');

    expect(screen.getByText('Digital Agriculture & ICT Directorate')).toBeInTheDocument();
    expect(screen.queryByText('Agricultural Extension Directorate')).not.toBeInTheDocument();
  });

  it('opens department details modal with assigned assets and staff tabs', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);

    await screen.findByText('Agricultural Extension Directorate');

    // Click action menu for first row and select "View details"
    await user.click(await screen.findByRole('button', { name: 'Actions for Agricultural Extension Directorate' }));
    await user.click(screen.getByRole('menuitem', { name: /View details/i }));

    // Modal opens
    expect(screen.getByText(/Directorate Resource Overview/i)).toBeInTheDocument();
    expect(screen.getByText('Dell Latitude 5440')).toBeInTheDocument();
    expect(screen.getByText('IT-1001')).toBeInTheDocument();

    // Switch to Staff Directory tab
    const staffTabButton = screen.getByRole('button', { name: /Staff Directory/i });
    await user.click(staffTabButton);

    expect(screen.getAllByText('Abebe Kebede').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('PAY-100')).toBeInTheDocument();
  });

  it('allows registering a new directorate', async () => {
    const user = userEvent.setup();
    render(<DepartmentsPage />);

    await screen.findByText('Agricultural Extension Directorate');

    const topRegisterButton = screen.getAllByRole('button', { name: /Register Directorate/i })[0];
    await user.click(topRegisterButton);

    // Modal opens
    expect(screen.getByText('Register New Directorate')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g. ICT, EXT, HORT'), 'LIVESTOCK');
    await user.type(
      screen.getByPlaceholderText('e.g. Digital Agriculture & ICT Directorate'),
      'Livestock Development Directorate'
    );
    await user.type(
      screen.getByPlaceholderText('e.g. የኢንፎርሜሽን ቴክኖሎጂ ዳይሬክቶሬት'),
      'የእንስሳት ሀብት ልማት ዳይሬክቶሬት'
    );

    const submitButtons = screen.getAllByRole('button', { name: /Register Directorate/i });
    const modalSubmitButton = submitButtons[submitButtons.length - 1];
    await user.click(modalSubmitButton);

    // New directorate appears in banner and table
    expect(await screen.findByText('Livestock Development Directorate')).toBeInTheDocument();
    expect(screen.getAllByText('LIVESTOCK').length).toBeGreaterThanOrEqual(1);
  });
});
