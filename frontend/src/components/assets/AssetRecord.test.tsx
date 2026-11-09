import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AssetRecord } from './AssetRecord';
import { AssetRow } from './asset-state';
import { AssetCategory, ItemType, UserRole } from '../../types/asset-management';

const baseItem = {
  id: 'ITEM-1',
  itemCode: 'MOA-IT-2024-0001',
  name: 'Dell Latitude 5540 Laptop',
  category: AssetCategory.IT_EQUIPMENT,
  itemType: ItemType.FIXED,
  registeredById: 'U1',
  createdAtGc: '2024-03-01T10:00:00Z',
  createdAtEc: '2016-06-22',
  storeLocationId: 'LOC-1',
  storeLocation: { id: 'LOC-1', name: 'Main ICT Store' },
  history: [],
};

describe('AssetRecord - Origin & Lifecycle History', () => {
  it('identifies an asset entered via Model 19 delivery voucher', () => {
    const row: AssetRow = {
      item: {
        ...baseItem,
        isHistoricalData: false,
        ifmisSlipNumber: 'M19-8822',
        poNumber: 'PO-2024-551',
        source: 'Techno Systems PLC',
        buyer: 'ICT Directorate',
        ifmisSlipDateGc: '2024-03-01',
        ifmisSlipDateEc: '2016-06-22',
        deliveredBy: 'Kassahun Tadesse',
        receivedBy: 'Alemayehu Storekeeper',
      } as any,
      state: 'IN_STORE',
      units: 1,
      where: 'Main ICT Store',
      activity: 'Received on M19-8822',
    };

    render(
      <AssetRecord
        row={row}
        units={[]}
        partly={false}
        requests={[]}
        actions={[]}
        onPrintRequest={vi.fn()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Header badge
    expect(screen.getByText('Model 19 #M19-8822')).toBeInTheDocument();

    // Section 1: Procurement Model 19
    expect(screen.getByText(/Procurement Model 19/i)).toBeInTheDocument();

    // Section 6: Asset history & lifecycle
    expect(screen.getByText('Asset history & lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Model 19 Delivery Voucher')).toBeInTheDocument();
    expect(screen.getAllByText('PO-2024-551').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Techno Systems PLC').length).toBeGreaterThanOrEqual(1);
  });

  it('identifies an asset entered via Physical Inventory Count (ቆጠራ)', () => {
    const row: AssetRow = {
      item: {
        ...baseItem,
        itemCode: 'MOA-COUNT-0042',
        name: 'HP LaserJet Managed MFP E82650',
        isHistoricalData: true,
        ifmisSlipNumber: 'count-sheet-042',
        ifmisSlipDateGc: '2024-01-15',
        ifmisSlipDateEc: '2016-05-06',
        registeredBy: { fullNameEn: 'Solomon Auditor' },
      } as any,
      state: 'IN_STORE',
      units: 1,
      where: 'Main ICT Store',
      activity: 'Baseline count entry',
    };

    render(
      <AssetRecord
        row={row}
        units={[]}
        partly={false}
        requests={[]}
        actions={[]}
        onPrintRequest={vi.fn()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Header badge & Section 6 badge
    expect(screen.getAllByText('ቆጠራ · Physical Count').length).toBe(2);

    // Section 1: Inventory count & intake
    expect(screen.getByText('Inventory count & intake')).toBeInTheDocument();
    expect(screen.getByText(/Physical Inventory Count/i)).toBeInTheDocument();

    // Section 6: Count reference
    expect(screen.getAllByText('count-sheet-042').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Solomon Auditor').length).toBeGreaterThanOrEqual(1);
  });

  it('renders chronological lifecycle movement milestones when present in history', () => {
    const row: AssetRow = {
      item: {
        ...baseItem,
        isHistoricalData: false,
        ifmisSlipNumber: 'M19-1005',
        history: [
          {
            id: 'H1',
            dateGc: '2024-04-10',
            dateEc: '2016-08-02',
            action: 'STOCK_OUT_APPROVED',
            fromEntity: 'Main Store',
            toEntity: 'Dr. Belayneh (Agronomy)',
            performedBy: 'Alemayehu Storekeeper',
            performedByRole: UserRole.DATA_ENCODER,
            ifmisSlipNumber: 'M22-4401',
            notes: 'Handed over with laptop bag and charger',
          },
          {
            id: 'H2',
            dateGc: '2024-03-02',
            dateEc: '2016-06-23',
            action: 'STOCK_IN_APPROVED',
            performedBy: 'Head of Stores',
            performedByRole: UserRole.DEPARTMENT_HEAD,
            ifmisSlipNumber: 'M19-1005',
          },
        ],
      } as any,
      state: 'ISSUED',
      units: 1,
      where: 'Dr. Belayneh (Agronomy)',
      activity: 'Issued on M22-4401',
    };

    render(
      <AssetRecord
        row={row}
        units={[]}
        partly={false}
        requests={[]}
        actions={[]}
        onPrintRequest={vi.fn()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Section 6 milestones
    expect(screen.getByText('Issued on Model 22 (ዕቃ ወጪ ተፈጽሟል)')).toBeInTheDocument();
    expect(screen.getByText('Model 19 Stock-In Approved (ዕቃ ገቢ ጸድቋል)')).toBeInTheDocument();
    expect(screen.getAllByText(/Dr\. Belayneh \(Agronomy\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Handed over with laptop bag and charger/i)).toBeInTheDocument();
    expect(screen.getByText(/Voucher \/ Slip: M22-4401/i)).toBeInTheDocument();
  });
});
