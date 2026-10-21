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
  it('prints the IFMIS form: the recipient, one line per asset with its cost and depreciation, and its three signatures', () => {
    render(<DisposalPrintModal isOpen onClose={vi.fn()} voucher={voucher} />);
    expect(screen.getAllByText("Fixed Asset Disposal Form").length).toBeGreaterThan(0);
    expect(screen.getByText("DSP-0007")).toBeInTheDocument();
    expect(screen.getByText("Kality School", { selector: "dd" })).toBeInTheDocument();
    // Not on the IFMIS form, though an older request recorded them
    for (const gone of ["Fair", "DC/12/2026", "Committee Decision Ref. :", "Proceeds (ETB) :", "Condition :"]) expect(screen.queryByText(gone)).toBeNull();
    for (const heading of ["Tag Number", "Serial Number", "Chassis No", "Engine No", "Declaration Number", "Disposal Type", "Original Cost", "Accumulated Depreciation", "Book Value", "Remark"]) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("MOA-FUR-1-2")).toBeInTheDocument();
    // 3 chairs at 1,500 = 4,500 cost, all of it depreciated but the 1,000 book value: so 3,500
    expect(screen.getByText("3,500.00", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/correctly counted and received the items/i)).toBeInTheDocument();
    for (const role of ["Storekeeper", "FAMU Accountant", "Recipient"]) expect(screen.getByText(role)).toBeInTheDocument();
    // IFMIS has no approver lines and no totals
    expect(screen.queryByText("Endorsed By (Team Leader)")).toBeNull();
    expect(screen.queryByText("Approved By (Department Head)")).toBeNull();
    expect(screen.getAllByText("Book Value")).toHaveLength(1);
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

describe('a disposal form of several assets', () => {
  const request = (id: string, itemId: string, name: string, bookValue: number, extra: object = {}) => ({
    id, transactionType: 'DISPOSAL', itemId, itemCode: `MOA-${itemId}`, itemName: name, status: 'PENDING', currentStage: 1,
    ifmisSlipNumber: '0001765/2018', ifmisSlipDateGc: '2026-07-28', createdAtGc: '2026-10-21', requestedById: 'e1',
    requestDetails: { quantity: 1, uom: 'EA', reason: 'TRANSFER', bookValue }, ...extra,
  }) as unknown as TransactionApproval;
  const items = [
    { id: 'D1', unitCostETB: 85_000, quantity: 1, serialNumber: 'SN-DELL' },
    { id: 'P1', unitCostETB: 12_500, quantity: 1, serialNumber: 'SLIP-TEST-01' },
    { id: 'S1', unitCostETB: 8_400, quantity: 1, serialNumber: 'SLIP-TEST-02' },
  ] as any[];

  it('lists every asset filed on the form, in the order filed, with its own figures', () => {
    // Newest first, as the server sends them; another form and a rejected one are left out
    const requests = [
      request('R3', 'S1', 'Scanner', 0),
      request('R2', 'P1', 'Printer', 2_500),
      request('R1', 'D1', 'Laptop', 0),
      request('X1', 'D1', 'Old try', 0, { status: 'REJECTED' }),
      request('Y1', 'P1', 'Other form', 0, { ifmisSlipNumber: '0001766/2018' }),
    ];
    const v = buildDisposalVoucher(requests[2], { item: items[0], employees: [], requests, items });
    expect(v.items.map((i) => [i.description, i.unitPrice, i.bookValue, i.serialNo])).toEqual([
      ['Laptop', 85_000, 0, 'SN-DELL'],
      ['Printer', 12_500, 2_500, 'SLIP-TEST-01'],
      ['Scanner', 8_400, 0, 'SLIP-TEST-02'],
    ]);
    // Opened from any of its assets, it is the same form
    expect(buildDisposalVoucher(requests[0], { item: items[2], employees: [], requests, items }).items).toHaveLength(3);
  });
});
