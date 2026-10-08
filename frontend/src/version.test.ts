import { describe, expect, it } from 'vitest';
import { formatVersion } from './version';

describe('formatVersion', () => {
  it('shows a release tag on its own', () => {
    expect(formatVersion('v2.1.0', '8ce3fb2')).toBe('v2.1.0');
  });

  it('adds the commit to builds of a branch', () => {
    expect(formatVersion('main', '8ce3fb2')).toBe('main · 8ce3fb2');
  });

  it('falls back to "dev" when the build sets nothing', () => {
    expect(formatVersion(undefined, undefined)).toBe('dev');
    expect(formatVersion('', '')).toBe('dev');
  });

  it('shows the version alone when there is no commit', () => {
    expect(formatVersion('main', '')).toBe('main');
  });
});
