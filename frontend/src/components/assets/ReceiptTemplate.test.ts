import { describe, expect, it } from 'vitest';
import { templateFromItem, templateFromVoucher } from './ReceiptForm';

describe('duplicate as new receipt', () => {
  it('keeps what the item is and where it comes from, and drops its number, serial, quantity and slip', () => {
    const template = templateFromItem({
      id: 'i1', itemCode: 'MOA-IT-2026-0007', name: 'Dell Latitude', category: 'IT_EQUIPMENT', itemType: 'FIXED', uom: 'EA', condition: 'NEW',
      unitCostETB: 85000, serialNumber: 'SN-1', quantity: 10, ifmisSlipNumber: '0000044', ifmisSlipDateGc: '2026-09-01', ifmisSlipAttachmentUrl: '/slips/a.pdf',
      transactionType: 'PO Receipt', source: 'Tech Supplies', buyer: 'Meron', programName: 'Digital', storeLocationId: 'LOC-1', lotBatchNo: 'LOT-9', remark: 'x',
    } as any);
    expect(template).toEqual({
      transactionType: 'PO Receipt', source: 'Tech Supplies', buyer: 'Meron', programName: 'Digital', storeLocationId: 'LOC-1',
      name: 'Dell Latitude', category: 'IT_EQUIPMENT', itemType: 'FIXED', uom: 'EA', condition: 'NEW', unitCostETB: 85000,
    });
    expect(template).not.toHaveProperty('ifmisSlipNumber');
    expect(template).not.toHaveProperty('serialNumber');
    expect(template).not.toHaveProperty('quantity');
  });

  it('treats an item without a type as a fixed asset', () => {
    expect(templateFromItem({ id: 'i1', name: 'Desk', category: 'OFFICE_FURNITURE' } as any).itemType).toBe('FIXED');
  });
});

describe('add another item on this slip', () => {
  it('keeps the slip header and none of the item', () => {
    const template = templateFromVoucher({
      invModel19No: '0000044', receivedDateGc: '2026-10-01', transactionType: 'Direct Delivery', source: 'Tech Supplies', buyer: '—',
      programName: '', poNumber: '—', deliveredByName: 'Courier', storeLocationId: 'LOC-1', items: [{ itemDescription: 'Laptop' }],
    } as any);
    expect(template).toEqual({
      ifmisSlipNumber: '0000044', ifmisSlipDateGc: '2026-10-01', transactionType: 'Direct Delivery', source: 'Tech Supplies',
      buyer: undefined, programName: undefined, poNumber: undefined, deliveredBy: 'Courier', storeLocationId: 'LOC-1',
    });
    expect(template).not.toHaveProperty('name');
  });
});
