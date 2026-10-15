import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalVoucherModal } from './ApprovalVoucherModal';
import { api } from '../../api/client';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', fullNameEn: 'Team Leader' } }) }));
vi.mock('./RecordDetailModal', () => ({ RecordDetailModal: () => <div>Full record and history</div> }));
vi.mock('../../api/client', () => ({
  api: { getItemById: vi.fn(), getItems: vi.fn(), getApprovals: vi.fn(), getDepartments: vi.fn(), getEmployees: vi.fn(), getLocations: vi.fn() },
}));

const item = { id: 'i1', itemCode: 'MOA-IT-2026-0007', name: 'Dell Latitude', category: 'IT_EQUIPMENT', uom: 'EA', unitCostETB: 1000, quantity: 5, storeLocationId: 'L1', storeLocation: { id: 'L1', siteName: 'Kality', roomNumber: 'Shelf A' } };

const issue: any = {
  id: 'a1', transactionType: 'STOCK_OUT', itemId: 'i1', itemCode: 'MOA-IT-2026-0007', itemName: 'Dell Latitude', ifmisSlipNumber: 'M22-050',
  status: 'PENDING', currentStage: 1, createdAtGc: '2026-10-10T08:00:00Z', purposeOrRemarks: 'Field work', recipientEmployeeId: 'E1',
  requestDetails: { quantity: 2, issuedByName: 'Abebe Store Man' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getItemById).mockResolvedValue(item as any);
  vi.mocked(api.getItems).mockResolvedValue([item] as any);
  vi.mocked(api.getDepartments).mockResolvedValue([{ id: 'D1', nameEn: 'Plant Protection' }] as any);
  vi.mocked(api.getEmployees).mockResolvedValue([{ id: 'E1', fullNameEn: 'Abebe Kebede', payrollId: '1' }] as any);
  vi.mocked(api.getLocations).mockResolvedValue([] as any);
  vi.mocked(api.getApprovals).mockResolvedValue([issue] as any);
});

describe('A request seen from Approvals', () => {
  it('opens as the Model 22 voucher it belongs to, saying it is still pending', async () => {
    render(<ApprovalVoucherModal approval={issue} onClose={vi.fn()} />);
    expect(await screen.findByText('Issued By')).toBeInTheDocument();
    expect(screen.getByText('Received By')).toBeInTheDocument();
    expect(screen.getByText('Abebe Store Man')).toBeInTheDocument();
    expect(screen.getByText(/M22-050/)).toBeInTheDocument();
  });

  it('lists the other lines saved on the same Model 22', async () => {
    const other = { ...issue, id: 'a2', itemId: 'i2', itemCode: 'MOA-IT-2026-0008', itemName: 'HP Monitor' };
    vi.mocked(api.getApprovals).mockResolvedValue([other, issue] as any);
    render(<ApprovalVoucherModal approval={issue} onClose={vi.fn()} />);
    expect(await screen.findByText('HP Monitor')).toBeInTheDocument();
    expect(screen.getByText('Dell Latitude')).toBeInTheDocument();
  });

  it('falls back to the record when no voucher can be built', async () => {
    vi.mocked(api.getEmployees).mockRejectedValue(new Error('down'));
    render(<ApprovalVoucherModal approval={issue} onClose={vi.fn()} />);
    expect(await screen.findByText('Full record and history')).toBeInTheDocument();
  });
});
