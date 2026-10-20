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
