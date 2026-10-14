import { describe, it, expect } from 'vitest';
import { nameKey } from './useStoreKeepers';

describe('matching a name printed by IFMIS to a store man', () => {
  it('ignores word order, commas and case', () => {
    expect(nameKey('Tesfaye, Abel Girma')).toBe(nameKey('Abel Girma Tesfaye'));
    expect(nameKey('  ABEL   girma, tesfaye ')).toBe(nameKey('Abel Girma Tesfaye'));
  });

  it('still tells different people apart', () => {
    expect(nameKey('Abel Girma Tesfaye')).not.toBe(nameKey('Abel Tesfaye'));
  });
});
