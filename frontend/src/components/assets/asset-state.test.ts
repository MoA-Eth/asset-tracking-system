import { describe, it, expect } from 'vitest';
import { daysInStore } from './asset-state';

const today = new Date(2026, 9, 7); // 7 Oct 2026

describe('daysInStore', () => {
  it('counts from the Model 19 receiving date', () => {
    expect(daysInStore({ ifmisSlipDateGc: '2026-09-01', history: [] } as any, today)).toBe(36);
  });

  it('counts from the latest approved return when the item came back', () => {
    const item = {
      ifmisSlipDateGc: '2026-01-10',
      history: [
        { action: 'RETURN_APPROVED', dateGc: '2026-05-01' },
        { action: 'STOCK_OUT_APPROVED', dateGc: '2026-06-01' },
        { action: 'RETURN_APPROVED', dateGc: '2026-09-27' },
      ],
    };
    expect(daysInStore(item as any, today)).toBe(10);
  });

  it('falls back to the registration date, and gives up on an unreadable date', () => {
    expect(daysInStore({ createdAtGc: '2026-10-01T08:00:00Z', history: [] } as any, today)).toBe(6);
    expect(daysInStore({ ifmisSlipDateGc: 'not a date', history: [] } as any, today)).toBeUndefined();
  });
});
