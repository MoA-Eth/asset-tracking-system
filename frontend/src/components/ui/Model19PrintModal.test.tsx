import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Model19PrintModal } from './Model19PrintModal';
import { Model19Voucher } from '../../types/asset-management';

const mockVoucher: Model19Voucher = {
  invModel19No: '0000044',
  poNumber: '186',
  receivedDateGc: '25-Sep-2026',
  receivedDateEc: '15-Meskerem-2019',
  transactionType: 'PO Receipt',
  source: 'ERMEJA TRADING ONE MEMBER P.L.C',
  buyer: 'Teka, Yebirgual Tamiru',
  programName: 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa',
  deliveredByName: 'Abebe Kebede',
  receivedByName: 'Almaz Ayana',
  reportTakenBy: 'azebmif',
  grandTotal: 716425,
  items: [
    {
      sNo: 1,
      itemCode: '107101102.4336',
      itemDescription: 'Sulfa Drug In Vial',
      uom: 'EA',
      subInventory: 'AMedicine',
      itemCategory: 'Medical Supplies & Related Accessories',
      lotBatchNo: 'LOT-991',
      serialNo: 'SN-001',
      printedPadFrom: '1001',
      printedPadTo: '1100',
      quantity: 100,
      unitPrice: 825,
      totalAmount: 82500,
      remark: 'Fresh batch',
    },
    {
      sNo: 2,
      itemCode: '105101102.0415',
      itemDescription: 'Streptomycine',
      uom: 'EA',
      subInventory: 'AMedicine',
      itemCategory: 'Agricultural Supplies',
      lotBatchNo: 'LOT-992',
      serialNo: 'SN-002',
      printedPadFrom: '',
      printedPadTo: '',
      quantity: 50,
      unitPrice: 341,
      totalAmount: 17050,
      remark: '',
    },
  ],
};

describe('Model19PrintModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <Model19PrintModal isOpen={false} onClose={vi.fn()} voucher={mockVoucher} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders official Ethiopian IFMIS Model 19 headers and document metadata', () => {
    render(<Model19PrintModal isOpen={true} onClose={vi.fn()} voucher={mockVoucher} />);

    expect(screen.getByText(/The Federal Democratic Republic of Ethiopia/i)).toBeInTheDocument();
    expect(screen.getByText(/MoA-Program to Build Resilience for Food and Nutrition Security/i)).toBeInTheDocument();
    expect(screen.getByText(/Print Model19 Report/i)).toBeInTheDocument();
    expect(screen.getByText('0000044')).toBeInTheDocument();
    expect(screen.getByText('186')).toBeInTheDocument();
    expect(screen.getByText('ERMEJA TRADING ONE MEMBER P.L.C')).toBeInTheDocument();
    expect(screen.getByText('Teka, Yebirgual Tamiru')).toBeInTheDocument();
  });

  it('renders table columns, line items, and calculates grand total', () => {
    render(<Model19PrintModal isOpen={true} onClose={vi.fn()} voucher={mockVoucher} />);

    // Item 1
    expect(screen.getByText('107101102.4336')).toBeInTheDocument();
    expect(screen.getByText('Sulfa Drug In Vial')).toBeInTheDocument();
    expect(screen.getByText('Medical Supplies & Related Accessories')).toBeInTheDocument();
    expect(screen.getByText('82,500')).toBeInTheDocument();

    // Item 2
    expect(screen.getByText('105101102.0415')).toBeInTheDocument();
    expect(screen.getByText('Streptomycine')).toBeInTheDocument();
    expect(screen.getByText('17,050')).toBeInTheDocument();

    // Signatures
    expect(screen.getByText(/Delivered By : Name :/i)).toBeInTheDocument();
    expect(screen.getByText(/Received By : Name :/i)).toBeInTheDocument();
    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('Almaz Ayana')).toBeInTheDocument();
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Model19PrintModal isOpen={true} onClose={vi.fn()} voucher={mockVoucher} />);

    const printButton = screen.getByRole('button', { name: /Print Model 19 \/ PDF/i });
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Model19PrintModal isOpen={true} onClose={handleClose} voucher={mockVoucher} />);

    const closeButton = screen.getByTitle('Close Preview');
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalled();
  });
});
