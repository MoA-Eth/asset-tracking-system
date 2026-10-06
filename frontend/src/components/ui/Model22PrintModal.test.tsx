import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Model22PrintModal } from './Model22PrintModal';
import { Model22Voucher } from '../../types/asset-management';

const mockModel22Voucher: Model22Voucher = {
  model22No: '0004653/A Inventory',
  issuedDateGc: '17-Jun-2026',
  issuedDateEc: '10-Sene-2018',
  transactionType: 'Move Order Issue',
  destination: 'Agricultural Engineering Directorate',
  subInventory: 'Spareparts',
  issuedByName: 'Mulugeta Tesfaye',
  receivedByName: 'Kassaye, Tesfaye Tadesse',
  items: [
    {
      sNo: 1,
      itemCode: '103108101.0004',
      itemDescription: 'Battery 12v - 70 Amp',
      uom: 'EA',
      subInventory: 'Spareparts',
      itemCategory: 'Spare parts',
      lotBatchNo: 'LOT-BAT-2026',
      serialNo: 'BAT-70A-9921',
      printedPadFrom: '',
      printedPadTo: '',
      quantity: 1,
      unitPrice: 18963.50,
      totalAmount: 18963.50,
      remark: 'Central pool maintenance issue',
    },
  ],
  total: 18963.50,
  transportationCost: 0,
  grandTotal: 18963.50,
  printedBy: 'lidlyats',
};

describe('Model22PrintModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <Model22PrintModal isOpen={false} onClose={vi.fn()} voucher={mockModel22Voucher} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders official Ethiopian Model 22 headers and document metadata matching official form', () => {
    render(<Model22PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel22Voucher} />);

    expect(screen.getByText(/The Federal Democratic Republic of Ethiopia/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ministry of Agriculture/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Receipt For Articles Or Property Issued/i)).toBeInTheDocument();
    expect(screen.getByText('0004653/A Inventory')).toBeInTheDocument();
    expect(screen.getByText(/Move Order Issue/i)).toBeInTheDocument();
    expect(screen.getByText(/Agricultural Engineering Directorate/i)).toBeInTheDocument();
  });

  it('renders table columns and line item matching provided document image', () => {
    render(<Model22PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel22Voucher} />);

    // Item details from user photo
    expect(screen.getByText('103108101.0004')).toBeInTheDocument();
    expect(screen.getByText('Battery 12v - 70 Amp')).toBeInTheDocument();
    expect(screen.getAllByText('Spareparts').length).toBeGreaterThan(0);
    expect(screen.getByText('Spare parts')).toBeInTheDocument();
    expect(screen.getAllByText('18,963.50').length).toBeGreaterThan(0);

    // Signatures
    expect(screen.getByText('Issued By')).toBeInTheDocument();
    expect(screen.getByText('Received By')).toBeInTheDocument();
    expect(screen.getByText('Mulugeta Tesfaye')).toBeInTheDocument();
    expect(screen.getByText('Kassaye, Tesfaye Tadesse')).toBeInTheDocument();

    // Footer
    expect(screen.getByText('lidlyats')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/i)).toBeInTheDocument();
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Model22PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel22Voucher} />);

    const printButton = screen.getByRole('button', { name: /Print Model 22 \/ PDF/i });
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Model22PrintModal isOpen={true} onClose={handleClose} voucher={mockModel22Voucher} />);

    const closeButton = screen.getByTitle('Close Preview');
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalled();
  });
});
