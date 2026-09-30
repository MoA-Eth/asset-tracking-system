import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Model21PrintModal } from './Model21PrintModal';
import { Model21Voucher } from '../../types/asset-management';

const mockModel21Voucher: Model21Voucher = {
  model21No: '0004386',
  fromEmployeeName: 'Mekonnen, Abayneh Belachew',
  fromEmployeeId: '110895',
  book: 'MOA MC BOOK',
  toEmployeeName: 'Ayele, Marta Mekete',
  toEmployeeId: '109856',
  items: [
    {
      sNo: 1,
      description: 'Station Wagon - Diesel',
      tagNumber: 'MOA-016341',
      serialNumber: '',
      chassisNumber: 'JTEBB71JX07008920',
      uom: 'EA',
      unit: 1,
      origCost: 530450.88,
      depreciation: 530450.88,
      bookValue: 0.0,
      dateGc: '28-SEP-26',
      fromLocation: 'MoA Gurd Sholla',
      toLocation: 'MoA Gurd Sholla',
      plateNo: '4-23794',
      engineNo: '1HZ-0641864',
      accessories: [
        { name: 'jack with handle', quantity: 1 },
        { name: 'tire wrench', quantity: 1 },
        { name: 'key', quantity: 2 },
      ],
      tireNos: ['R240514711', 'R240504703', 'R240504594', 'R240504595', 'YY0219'],
      remark: 'The right side mirror is missing.\nBoth rear lights are broken.',
    },
  ],
  famuAccountantName: 'FAMU Reviewer',
  reportTakenBy: 'lidlyats',
  reportTakenDate: '28-Sep-2026 @ 02:37 pm',
};

describe('Model21PrintModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <Model21PrintModal isOpen={false} onClose={vi.fn()} voucher={mockModel21Voucher} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders official FDRE MoA Model 21 titles, Model #, and From/To details matching document image', () => {
    render(<Model21PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel21Voucher} />);

    expect(screen.getByText(/The Federal Democratic Republic of Ethiopia/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ministry of Agriculture/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fixed Asset Internal Transfer Form/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Model/21')).toBeInTheDocument();
    expect(screen.getByText('0004386')).toBeInTheDocument();

    // From and To Employee info
    expect(screen.getAllByText(/Mekonnen, Abayneh Belachew/i).length).toBeGreaterThan(0);
    expect(screen.getByText('110895')).toBeInTheDocument();
    expect(screen.getByText('MOA MC BOOK')).toBeInTheDocument();
    expect(screen.getAllByText(/Ayele, Marta Mekete/i).length).toBeGreaterThan(0);
    expect(screen.getByText('109856')).toBeInTheDocument();
  });

  it('renders asset line items and vehicle technical breakdown matching photo', () => {
    render(<Model21PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel21Voucher} />);

    // Item line
    expect(screen.getByText('Station Wagon - Diesel')).toBeInTheDocument();
    expect(screen.getByText('MOA-016341')).toBeInTheDocument();
    expect(screen.getByText('JTEBB71JX07008920')).toBeInTheDocument();
    expect(screen.getAllByText('530,450.88').length).toBeGreaterThan(0);

    // Vehicle details
    expect(screen.getByText('4-23794')).toBeInTheDocument();
    expect(screen.getByText('1HZ-0641864')).toBeInTheDocument();
    expect(screen.getByText('jack with handle')).toBeInTheDocument();
    expect(screen.getByText('tire wrench')).toBeInTheDocument();
    expect(screen.getByText('R240514711')).toBeInTheDocument();
    expect(screen.getAllByText(/The right side mirror is missing/i).length).toBeGreaterThan(0);

    // Certification statement
    expect(
      screen.getByText(/I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above/i)
    ).toBeInTheDocument();

    // Signatures
    expect(screen.getByText(/Transferor Name and Signature/i)).toBeInTheDocument();
    expect(screen.getByText(/FAMU Accountant Name and Signature/i)).toBeInTheDocument();
    expect(screen.getByText(/Recipient's Name and Signature/i)).toBeInTheDocument();

    // Footer
    expect(screen.getByText('lidlyats')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/i)).toBeInTheDocument();
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Model21PrintModal isOpen={true} onClose={vi.fn()} voucher={mockModel21Voucher} />);

    const printButton = screen.getByRole('button', { name: /Print Model 21 \/ PDF/i });
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Model21PrintModal isOpen={true} onClose={handleClose} voucher={mockModel21Voucher} />);

    const closeButton = screen.getByTitle('Close Preview');
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalled();
  });
});
