import { describe, expect, it } from 'vitest';
import { buildModel19Voucher } from './ReceiptForm';

const item = (status: string, extra: object = {}) => ({
  id: 'R1', itemCode: 'MOA-R1', name: 'Scanner', status, quantity: 1, uom: 'EA', unitCostETB: 1000, category: 'IT_EQUIPMENT',
  itemType: 'FIXED', ifmisSlipNumber: '0000051', ifmisSlipDateGc: '2026-10-01', deliveredBy: 'Abebe', receivedBy: 'Bikila Desta', ...extra,
}) as any;
const approval = (status: string, currentStage: number, extra: object = {}) => ({
  id: 'A1', transactionType: 'STOCK_IN', itemId: 'R1', status, currentStage, createdAtGc: '2026-10-01T08:00:00Z', ...extra,
}) as any;
const signed = (voucher: ReturnType<typeof buildModel19Voucher>) =>
  (voucher.signatories ?? []).map((s) => `${s.label}${s.signatureUrl ? ' ✓' : ''}`);

describe('signatures on the printed Model 19', () => {
  it('carries the Team Leader and Department Head signatures once the receipt is approved', () => {
    const r = item('AVAILABLE');
    const v = buildModel19Voucher(r, [r], 'Encoder', approval('APPROVED', 2, { reviewedAtGc: '2026-10-03' }));
    expect(signed(v)).toEqual(['Delivered By', 'Received By', 'Endorsed By (Team Leader) ✓', 'Approved By (Department Head) ✓']);
    expect(v.signatories?.[3].date).toBe('2026-10-03');
  });

  it('carries only the Team Leader while it waits for the Department Head', () => {
    const r = item('PENDING_STOCK_IN');
    const v = buildModel19Voucher(r, [r], 'Encoder', approval('PENDING', 2));
    expect(signed(v)).toEqual(['Delivered By', 'Received By', 'Endorsed By (Team Leader) ✓', 'Approved By (Department Head)']);
    expect(v.approvalState).toBe('PENDING');
  });

  it('carries no approver signature before the Team Leader endorses it, nor on a rejected receipt', () => {
    const r = item('PENDING_STOCK_IN');
    expect(signed(buildModel19Voucher(r, [r], 'Encoder', approval('PENDING', 1)))).toEqual(['Delivered By', 'Received By', 'Endorsed By (Team Leader)', 'Approved By (Department Head)']);
    const x = item('REJECTED');
    expect(signed(buildModel19Voucher(x, [x], 'Encoder', approval('REJECTED', 2)))).toEqual(['Delivered By', 'Received By', 'Endorsed By (Team Leader)', 'Approved By (Department Head)']);
  });

  it("is signed by the Chief Executive Officer above 10 million birr", () => {
    const r = item('AVAILABLE', { unitCostETB: 12_000_000 });
    const v = buildModel19Voucher(r, [r], 'Encoder', approval('APPROVED', 2));
    expect(signed(v)[3]).toBe('Approved By (Chief Executive Officer) ✓');
  });
});

describe('the lines and amounts on the printed Model 19', () => {
  const line = (id: string, extra: object = {}) =>
    item('PENDING_STOCK_IN', { id, itemCode: `MOA-${id}`, name: `Item ${id}`, poNumber: 'PO-1', ifmisItemCode: `30510110${id.slice(-1)}.0001`, ...extra });

  it('is signed by the Chief Executive Officer when the grand total is above 10 million, though no line is', () => {
    const a = line('L1', { status: 'AVAILABLE', unitCostETB: 6_000_000, createdAt: '2026-10-01T08:00:00Z' });
    const b = line('L2', { status: 'AVAILABLE', unitCostETB: 6_000_000, createdAt: '2026-10-01T08:00:01Z' });
    const v = buildModel19Voucher(a, [a, b], 'Encoder', approval('APPROVED', 2));
    expect(v.grandTotal).toBe(12_000_000);
    expect(signed(v)[3]).toBe('Approved By (Chief Executive Officer) ✓');
  });

  it('prints the lines of this receipt only, in the order entered, by their IFMIS item codes', () => {
    const first = line('L1', { createdAt: '2026-10-01T08:00:00Z' });
    const second = line('L2', { createdAt: '2026-10-01T08:00:01Z', itemType: 'CONSUMABLE' });
    const otherPo = line('L3', { poNumber: 'PO-2', createdAt: '2026-10-01T08:00:02Z' });
    const rejectedTry = line('L4', { status: 'REJECTED', createdAt: '2026-09-30T08:00:00Z' });
    // The list comes newest first, as the server sends it
    const v = buildModel19Voucher(first, [rejectedTry, otherPo, second, first], 'Encoder');
    expect(v.items.map((i) => i.itemDescription)).toEqual(['Item L1', 'Item L2']);
    expect(v.items.map((i) => i.itemCode)).toEqual(['305101101.0001', '305101102.0001']);
  });

  it('keeps a line’s total with its VAT or charges, for the voucher to show them', () => {
    const vat = line('L1', { quantity: 3, unitCostETB: 1799.99, vatApplicable: true, totalAmount: 6209.97 });
    const v = buildModel19Voucher(vat, [vat], 'Encoder');
    expect(v.items[0]).toMatchObject({ quantity: 3, unitPrice: 1799.99, vatApplicable: true, totalAmount: 6209.97 });
  });
});
