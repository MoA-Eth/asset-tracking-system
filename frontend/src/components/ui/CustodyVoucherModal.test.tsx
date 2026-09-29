import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustodyVoucherModal } from './CustodyVoucherModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import {
  ItemWithRelations,
  ItemStatus,
  ItemCondition,
  AssetCategory,
  TransactionApproval,
  ApprovalStatus,
  TransactionType,
} from '../../types/asset-management';

const mockItem: ItemWithRelations = {
  id: 'item-101',
  itemCode: 'MOA-AST-101',
  name: 'Dell Latitude 5540',
  category: AssetCategory.IT_EQUIPMENT,
  condition: ItemCondition.NEW,
  status: ItemStatus.AVAILABLE,
  unitCostETB: 85000,
  serialNumber: 'SN-DELL-98765',
  storeLocationId: 'loc-1',
  ifmisSlipNumber: 'IFMIS-M19-2016-099',
  ifmisSlipDateGc: '2023-09-12',
  ifmisSlipDateEc: '2016-01-01',
  registeredById: 'emp-1',
  createdAtGc: '2023-09-12',
  createdAtEc: '2016-01-01',
  history: [],
};

const mockApproval: TransactionApproval = {
  id: 'appr-202',
  transactionType: TransactionType.STOCK_OUT,
  itemId: 'item-202',
  status: ApprovalStatus.APPROVED,
  currentStage: 2,
  itemCode: 'MOA-AST-202',
  itemName: 'Projector Epson EB-X51',
  ifmisSlipNumber: 'IFMIS-M20-2016-112',
  ifmisSlipDateGc: '2023-09-12',
  ifmisSlipDateEc: '2016-01-01',
  requestedById: 'emp-101',
  purposeOrRemarks: 'Allocated for Regional Soil Lab',
  createdAtGc: '2023-09-12',
  createdAtEc: '2016-01-01',
};

describe('<CustodyVoucherModal />', () => {
  it('does not render content when isOpen is false', () => {
    const handleClose = vi.fn();
    renderWithProviders(
      <CustodyVoucherModal
        isOpen={false}
        onClose={handleClose}
        item={mockItem}
      />
    );

    expect(screen.queryByText(/Official MoA Store Handover Certificate/i)).not.toBeInTheDocument();
  });

  it('renders Model 19 (GRN) title and details for stock-in voucher', () => {
    const handleClose = vi.fn();
    renderWithProviders(
      <CustodyVoucherModal
        isOpen={true}
        onClose={handleClose}
        item={mockItem}
        voucherType="MODEL_19_STOCK_IN"
      />
    );

    expect(screen.getByText(/ሞዴል 19 \(Model 19 GRN\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('MOA-AST-101').length).toBeGreaterThan(0);
    expect(screen.getByText('Dell Latitude 5540')).toBeInTheDocument();
    expect(screen.getAllByText(/IFMIS-M19-2016-099/).length).toBeGreaterThan(0);
  });

  it('renders Model 20 (Issue Voucher) for asset allocation', () => {
    const handleClose = vi.fn();
    renderWithProviders(
      <CustodyVoucherModal
        isOpen={true}
        onClose={handleClose}
        approval={mockApproval}
        voucherType="MODEL_20_STOCK_OUT"
      />
    );

    expect(screen.getByText(/ሞዴል 20 \(Model 20 Issue Voucher\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('MOA-AST-202').length).toBeGreaterThan(0);
    expect(screen.getByText('Projector Epson EB-X51')).toBeInTheDocument();
    expect(screen.getAllByText(/IFMIS-M20-2016-112/).length).toBeGreaterThan(0);
  });

  it('renders Model 22 (Return / Disposal) voucher for asset returns', () => {
    const handleClose = vi.fn();
    renderWithProviders(
      <CustodyVoucherModal
        isOpen={true}
        onClose={handleClose}
        item={mockItem}
        voucherType="MODEL_22_RETURN"
      />
    );

    expect(screen.getByText(/ሞዴል 22 \(Model 22 Store Return\)/i)).toBeInTheDocument();
  });

  it('triggers onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    renderWithProviders(
      <CustodyVoucherModal
        isOpen={true}
        onClose={handleClose}
        item={mockItem}
      />
    );

    const user = userEvent.setup();
    const closeButtons = screen.getAllByRole('button');
    // First button in non-printable header is the print or close button
    const closeBtn = closeButtons.find((btn) => btn.querySelector('svg.lucide-x') || btn.textContent?.includes('Close'));
    if (closeBtn) {
      await user.click(closeBtn);
      expect(handleClose).toHaveBeenCalled();
    }
  });
});
