import { describe, expect, it } from 'vitest';
import { isSameAsset, usedMessage } from './useSlipRegister';
import { TransactionApproval } from '../types/asset-management';

const request = (over: Partial<TransactionApproval>): TransactionApproval =>
  ({ id: 'a1', itemId: 'I1', itemCode: 'MOA-IT-2026-0007', transactionType: 'STOCK_OUT', status: 'PENDING', ifmisSlipNumber: '0000202/A', ...over }) as TransactionApproval;

describe('a voucher number already used', () => {
  it('for another asset: a note to check the number', () => {
    expect(usedMessage('0000202/A', request({}), ['I2'])).toBe('0000202/A is already used for MOA-IT-2026-0007 (issue, pending). Check the number on the slip.');
  });

  it('for the same asset, waiting: correct that request instead', () => {
    expect(isSameAsset(request({}), ['I1'])).toBe(true);
    expect(usedMessage('0000202/A', request({}), ['I1'])).toBe(
      'MOA-IT-2026-0007 is already on 0000202/A (issue, waiting for approval). Correct that request instead of entering it again.',
    );
  });

  it('for the same asset, rejected and with its requester: resubmit or cancel that one', () => {
    expect(usedMessage('M21-3', request({ transactionType: 'TRANSFER', status: 'REJECTED', ifmisSlipNumber: 'M21-3' } as any), ['I1'])).toBe(
      'MOA-IT-2026-0007 is already on M21-3 (transfer, rejected and with its requester). Correct and resubmit that request, or cancel it, instead of entering it again.',
    );
  });

  it('a decided request for the same asset is no duplicate', () => {
    expect(isSameAsset(request({ status: 'APPROVED' } as any), ['I1'])).toBe(false);
  });
});
