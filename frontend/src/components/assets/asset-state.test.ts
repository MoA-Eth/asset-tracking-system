import { describe, it, expect } from 'vitest';
import { daysInStore, itemTypeLabel, stageLabel } from './asset-state';

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

  it('counts from the registration date when the slip year is impossible, as the dashboard does', () => {
    expect(daysInStore({ ifmisSlipDateGc: '0026-05-12', createdAtGc: '2026-10-01T08:00:00Z', history: [] } as any, today)).toBe(6);
  });
});

describe('itemTypeLabel', () => {
  it('names both types in English and Amharic, and treats an item with no type as a fixed asset', () => {
    expect(itemTypeLabel('FIXED')).toBe('Fixed asset (ቋሚ ዕቃ)');
    expect(itemTypeLabel('CONSUMABLE')).toBe('Consumable item (አላቂ ዕቃ)');
    expect(itemTypeLabel(undefined)).toBe('Fixed asset (ቋሚ ዕቃ)');
  });
});

describe('who a pending request waits for', () => {
  it('names the Chief Director at stage 2 when the server says the voucher is theirs', () => {
    expect(stageLabel({ currentStage: 1, requiredRole: 'CHIEF_DIRECTOR' })).toBe('With Team Leader');
    expect(stageLabel({ currentStage: 2, requiredRole: 'DEPARTMENT_HEAD' })).toBe('With Dept. Head');
    expect(stageLabel({ currentStage: 2, requiredRole: 'CHIEF_DIRECTOR' })).toBe('With Chief Director');
    expect(stageLabel({ currentStage: 2 })).toBe('With Dept. Head');
  });
});
