import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Model19PrintModal } from './Model19PrintModal';
import { Model21PrintModal } from './Model21PrintModal';
import { Model22PrintModal } from './Model22PrintModal';
import { DisposalPrintModal } from './DisposalPrintModal';
import { DisposalVoucher, Model19Voucher, Model21Voucher, Model22Voucher } from '../../types/asset-management';

const model19: Model19Voucher = {
  invModel19No: 'R-19', poNumber: '—', receivedDateGc: '2026-10-01', transactionType: 'PO Receipt', source: 'Supplier', buyer: 'Buyer',
  printedBy: 'Hana Tesfaye', grandTotal: 1500,
  items: [{ sNo: 1, itemCode: 'IT-1', itemDescription: 'Laptop', uom: 'EA', itemCategory: 'IT', quantity: 1, unitPrice: 1500, totalAmount: 1500 }],
};
const model22: Model22Voucher = {
  model22No: 'I-22', issuedDateGc: '2026-10-02', transactionType: 'Move Order Issue', destination: 'Planning Directorate',
  printedBy: 'Hana Tesfaye', total: 1500, grandTotal: 1500,
  items: [{ sNo: 1, itemCode: 'IT-1', itemDescription: 'Laptop', uom: 'EA', itemCategory: 'IT', quantity: 1, unitPrice: 1500, totalAmount: 1500 }],
};
const model21: Model21Voucher = {
  model21No: 'T-21', fromEmployeeName: 'Abebe Kebede', fromEmployeeId: '00000001', book: 'MOA BOOK', toEmployeeName: 'Almaz Ayana', toEmployeeId: '00000002',
  printedBy: 'Hana Tesfaye',
  items: [{ sNo: 1, description: 'Laptop', tagNumber: 'IT-1', uom: 'EA', unit: 1, origCost: 1500, depreciation: 0, bookValue: 1500, dateGc: '2026-10-03', fromLocation: 'Store A', toLocation: 'Office 12' }],
};

const disposal: DisposalVoucher = {
  disposalNo: 'D-01', dateGc: '2026-10-04', reason: 'Damaged beyond repair', printedBy: 'Hana Tesfaye',
  items: [{ sNo: 1, itemCode: 'IT-1', description: 'Laptop', uom: 'EA', quantity: 1, unitPrice: 1500, bookValue: 1500 }],
};

const vouchers = [
  ['Model 19', () => <Model19PrintModal isOpen onClose={vi.fn()} voucher={model19} />, 'R-19'],
  ['Model 21', () => <Model21PrintModal isOpen onClose={vi.fn()} voucher={model21} />, 'T-21'],
  ['Model 22', () => <Model22PrintModal isOpen onClose={vi.fn()} voucher={model22} />, 'I-22'],
  ['Disposal', () => <DisposalPrintModal isOpen onClose={vi.fn()} voucher={disposal} />, 'D-01'],
] as const;

describe('Printed vouchers share one format', () => {
  it.each(vouchers)('%s has the common letterhead, signature lines and footer', (model, renderVoucher, number) => {
    render(renderVoucher());

    expect(screen.getByText('The Federal Democratic Republic of Ethiopia')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Agriculture')).toBeInTheDocument();
    expect(screen.getByText(model)).toBeInTheDocument();
    expect(screen.getByText(number)).toBeInTheDocument();
    expect(screen.getByText('MOA-ATS')).toBeInTheDocument();

    // Every signatory gets a name line and a signature line
    const names = screen.getAllByText('Name :');
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Signature :')).toHaveLength(names.length);

    // Same footer, naming the person who printed
    const footer = screen.getByText(/from the MoA Asset Tracking System on/);
    expect(within(footer).getByText('Hana Tesfaye')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();

    // Amounts always carry two decimals
    expect(screen.getAllByText('1,500.00').length).toBeGreaterThan(0);
  });

  it('leaves the FAMU accountant line blank for a handwritten name instead of printing a placeholder', () => {
    render(<Model21PrintModal isOpen onClose={vi.fn()} voucher={model21} />);
    expect(screen.queryByText(/FAMU Reviewer/)).toBeNull();
    expect(screen.queryByText(/✓/)).toBeNull();
  });
});
