import { describe, expect, it } from 'vitest';
import { SLIP_FORMATS, toSafeBaseName } from './uploads';

describe('IFMIS slip upload rules', () => {
  describe('SLIP_FORMATS signature checks', () => {
    it('accepts genuine PDF, PNG, JPEG and WEBP headers', () => {
      expect(SLIP_FORMATS['application/pdf'].matches(Buffer.from('%PDF-1.7\n'))).toBe(true);
      expect(SLIP_FORMATS['image/png'].matches(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(true);
      expect(SLIP_FORMATS['image/jpeg'].matches(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
      expect(SLIP_FORMATS['image/webp'].matches(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe(true);
    });

    it('rejects content that does not match the declared type', () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      expect(SLIP_FORMATS['application/pdf'].matches(html)).toBe(false);
      expect(SLIP_FORMATS['image/png'].matches(html)).toBe(false);
      expect(SLIP_FORMATS['image/jpeg'].matches(html)).toBe(false);
      expect(SLIP_FORMATS['image/webp'].matches(html)).toBe(false);
    });

    it('does not accept other content types', () => {
      expect(SLIP_FORMATS['text/html']).toBeUndefined();
      expect(SLIP_FORMATS['image/svg+xml']).toBeUndefined();
    });
  });

  describe('toSafeBaseName', () => {
    it('strips the extension and unsafe characters', () => {
      expect(toSafeBaseName('Model 19 Slip (scan).pdf')).toBe('Model-19-Slip-scan');
      expect(toSafeBaseName('../../etc/passwd')).toBe('etc-passwd');
    });

    it('falls back to "slip" when nothing safe remains', () => {
      expect(toSafeBaseName('የዕቃ.pdf')).toBe('slip');
      expect(toSafeBaseName('')).toBe('slip');
    });

    it('caps the slug length', () => {
      expect(toSafeBaseName(`${'a'.repeat(200)}.png`)).toHaveLength(60);
    });
  });
});
