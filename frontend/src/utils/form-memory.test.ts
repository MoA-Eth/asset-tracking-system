import { beforeEach, describe, expect, it } from 'vitest';
import { nextNumberAfter, recallForm, rememberForm } from './form-memory';

describe('nextNumberAfter', () => {
  it('counts up the last number, keeping its zero padding, prefix and suffix', () => {
    expect(nextNumberAfter('0004653')).toBe('0004654');
    expect(nextNumberAfter('M22-009')).toBe('M22-010');
    expect(nextNumberAfter('0004653/A Inventory')).toBe('0004654/A Inventory');
    expect(nextNumberAfter('0000999')).toBe('0001000');
    expect(nextNumberAfter('99')).toBe('100');
  });

  it('gives nothing when there is no number to count from', () => {
    expect(nextNumberAfter('')).toBeUndefined();
    expect(nextNumberAfter(undefined)).toBeUndefined();
    expect(nextNumberAfter('Book one')).toBeUndefined();
  });
});

describe('form memory', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps what was last used for each person and form, merging newer values', () => {
    rememberForm('u1', 'transfer', { book: 'Book 3', model21No: 'M21-001' });
    rememberForm('u1', 'transfer', { model21No: 'M21-002' });
    expect(recallForm('u1', 'transfer')).toEqual({ book: 'Book 3', model21No: 'M21-002' });
    expect(recallForm('u2', 'transfer')).toEqual({});
    expect(recallForm('u1', 'issue')).toEqual({});
  });

  it('starts empty when storage holds something unreadable', () => {
    window.localStorage.setItem('moa_form_u1_transfer', '{not json');
    expect(recallForm('u1', 'transfer')).toEqual({});
  });
});
