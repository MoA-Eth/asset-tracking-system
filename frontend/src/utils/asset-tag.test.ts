import { describe, expect, it } from 'vitest';
import { findByTag, printedTag, tagKey } from './asset-tag';

const asset = (id: string, itemCode: string, extra: object = {}) => ({ id, itemCode, name: id, ...extra }) as any;

describe('finding an asset by the tag an IFMIS form names', () => {
  const items = [
    asset('a', 'MOA-VEH-2026-0001', { ifmisTagNumber: 'MOA-016341' }),
    asset('b', 'MOA-072351'),
    asset('c', 'MOA-IT-2020-0007', { serialNumber: 'SN 77' }),
  ];

  it('matches the IFMIS tag first, then the record code, then the serial number, ignoring case and spaces', () => {
    expect(findByTag(items, ' moa-016341 ')?.id).toBe('a');
    expect(findByTag(items, 'MOA-072351')?.id).toBe('b');
    expect(findByTag(items, 'sn77')?.id).toBe('c');
    expect(findByTag(items, 'MOA-999999')).toBeUndefined();
    expect(findByTag(items, '')).toBeUndefined();
  });

  it('prefers an asset whose IFMIS tag it is over one whose record code it is', () => {
    const clash = [asset('x', 'MOA-016341'), asset('y', 'MOA-VEH-2026-0002', { ifmisTagNumber: 'MOA-016341' })];
    expect(findByTag(clash, 'MOA-016341')?.id).toBe('y');
  });

  it('uses tags recorded on the open form before the list has them', () => {
    expect(findByTag(items, 'MOA-016400', new Map([['b', 'MOA-016400']]))?.id).toBe('b');
  });

  it('prints the IFMIS tag when there is one, else the record code', () => {
    expect(printedTag(items[0])).toBe('MOA-016341');
    expect(printedTag(items[1])).toBe('MOA-072351');
    expect(printedTag(undefined)).toBe('');
    expect(tagKey(' Moa 01 ')).toBe('moa01');
  });
});
