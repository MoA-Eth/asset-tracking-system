import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisposalPrintModal } from './DisposalPrintModal';
import { buildDisposalVoucher } from '../assets/DisposalForm';
import { DisposalVoucher, TransactionApproval } from '../../types/asset-management';

const voucher: DisposalVoucher = {
  approvalState: 'PENDING',
  disposalNo: 'DSP-0007',
  dateGc: '2026-10-04',
  dateEc: '2019-01-24',
  reason: 'Gift / donation',
  condition: 'FAIR',
  recipientName: 'Kality School',
  proceedsETB: 0,
  committeeRef: 'DC/12/2026',
  items: [{ sNo: 1, itemCode: 'MOA-FUR-1-2', description: 'Office chair', uom: 'EA', quantity: 3, unitPrice: 1500, bookValue: 1000 }],
  requestedByName: 'Bikila Desta',
  printedBy: 'Bikila Desta',
};

describe('Disposal voucher', () => {
  it("prints the Ministry form: the recipient, one line per asset with its cost and depreciation, and who signs", () => {
    render(<DisposalPrintModal isOpen onClose={vi.fn()} voucher={voucher} />);
    expect(screen.getAllByText("Fixed Asset Disposal Form").length).toBeGreaterThan(0);
    expect(screen.getByText("DSP-0007")).toBeInTheDocument();
    expect(screen.getByText("Kality School", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
    for (const heading of ["Tag Number", "Serial Number", "Chassis No", "Engine No", "Declaration Number", "Disposal Type", "Original Cost", "Accumulated Depreciation", "Book Value", "Remark"]) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("MOA-FUR-1-2")).toBeInTheDocument();
    // 3 chairs at 1,500 = 4,500 cost, all of it depreciated but the 1,000 book value: so 3,500
    expect(screen.getByText("3,500.00", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/correctly counted and received the items/i)).toBeInTheDocument();
    for (const role of ["Storekeeper", "Endorsed By (Team Leader)", "Approved By (Department Head)", "FAMU Accountant", "Recipient"]) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
  });

  it('marks a request that is not approved yet', () => {
    render(<DisposalPrintModal isOpen onClose={vi.fn()} voucher={voucher} />);
    expect(screen.getAllByText(/not yet approved/i).length).toBeGreaterThan(0);
  });
});

describe('buildDisposalVoucher', () => {
  const approval = {
    id: 'a1', transactionType: 'DISPOSAL', itemId: 'i1', itemCode: 'MOA-FUR-1', itemName: 'Office chair',
    ifmisSlipNumber: 'DSP-0007', ifmisSlipDateGc: '2026-10-04', ifmisSlipDateEc: '2019-01-24', status: 'APPROVED', currentStage: 2,
    requestedById: 'e1', requestedBy: { fullNameEn: 'Bikila Desta' }, endorsedBy: { fullNameEn: 'Mulugeta Berhanu' },
    reviewedBy: { fullNameEn: 'Kassahun Tolosa' }, createdAtGc: '2026-10-04', createdAtEc: '2019-01-24', purposeOrRemarks: '',
    requestDetails: { quantity: 3, uom: 'EA', reason: 'Gift / donation', bookValue: 4000, disposedItemCode: 'MOA-FUR-1-2' },
  } as unknown as TransactionApproval;

  it('files a partial disposal under the split-off record and names everyone who signed', () => {
    const v = buildDisposalVoucher(approval, { item: { unitCostETB: 1500, quantity: 7 } as any, employees: [] });
    expect(v.approvalState).toBeUndefined();
    expect(v.items[0]).toMatchObject({ itemCode: 'MOA-FUR-1-2', quantity: 3, unitPrice: 1500, bookValue: 4000 });
    expect(v).toMatchObject({ requestedByName: 'Bikila Desta', endorsedByName: 'Mulugeta Berhanu', approvedByName: 'Kassahun Tolosa' });
  });
});
