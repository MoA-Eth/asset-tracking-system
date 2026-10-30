import { describe, expect, it } from 'vitest';
import { slipStatusSummary } from './SlipRecord';
import { AssetRow } from './asset-state';

const row = (id: string, state: string, request?: object) => ({ item: { id }, state, request }) as unknown as AssetRow;

describe('where the items of a Model 19 stand', () => {
  it('says an item is partly issued when some of its units are out', () => {
    const laptops = row('laptops', 'IN_STORE');
    const printers = row('printers', 'REQUEST_PENDING', { transactionType: 'STOCK_OUT', status: 'PENDING' });
    expect(slipStatusSummary([laptops, printers], new Set(['laptops']))).toBe('1 partly issued · 1 issue pending');
    // None of its units out: in store
    expect(slipStatusSummary([laptops, printers])).toBe('1 in store · 1 issue pending');
  });
});
