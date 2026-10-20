import { describe, expect, it } from 'vitest';
import { groupBySlip, isSlipGroup, slipKey, slipNames } from './slip-groups';

describe('one receipt per Model 19 and PO', () => {
  it('keys lines by Model 19 No. and PO, ignoring case and spaces', () => {
    expect(slipKey('0000051', 'PO-14')).toBe(slipKey(' 0000051 ', 'po-14'));
    expect(slipKey('0000051', 'PO-14')).not.toBe(slipKey('0000051', 'PO-15'));
    // No PO on both is the same receipt (petty cash)
    expect(slipKey('0000051', undefined)).toBe(slipKey('0000051', ''));
    expect(slipKey('0000051', undefined)).toBe(slipKey('0000051', '—'));
  });

  it('never groups lines without a real slip number', () => {
    expect(slipKey(undefined, 'PO-1')).toBeUndefined();
    expect(slipKey('—', 'PO-1')).toBeUndefined();
    expect(slipKey('PENDING-1760000000000', 'PO-1')).toBeUndefined();
  });

  it('puts the lines of one receipt together where the first appears; one line stays single', () => {
    const lines = [
      { id: 'a', slip: '51', po: 'P1' },
      { id: 'b', slip: '52', po: 'P1' },
      { id: 'c', slip: '51', po: 'P1' },
      { id: 'd', slip: '51', po: 'P2' },
      { id: 'e', slip: undefined, po: undefined },
    ];
    const out = groupBySlip(lines, (l) => slipKey(l.slip, l.po));
    expect(out.map((g) => (isSlipGroup(g) ? g.members.map((m) => m.id).join('+') : g.single.id))).toEqual(['a+c', 'b', 'd', 'e']);
  });

  it('names a receipt by its first items', () => {
    expect(slipNames(['Laptop', 'Printer', 'Toner', 'Laptop', 'Mouse'])).toBe('Laptop, Printer +2');
    expect(slipNames(['Laptop', 'Printer'])).toBe('Laptop, Printer');
  });
});
