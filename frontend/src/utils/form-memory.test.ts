import { beforeEach, describe, expect, it } from 'vitest';
import { recallForm, rememberForm } from './form-memory';

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
