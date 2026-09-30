import { describe, expect, it } from 'vitest';
import { MAX_SLIP_BYTES, getSlipDisplayName, validateSlipFile } from './slip-upload';

const makeFile = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

describe('slip-upload helpers', () => {
  describe('validateSlipFile', () => {
    it.each(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
      expect(validateSlipFile(makeFile('slip', type))).toBeNull();
    });

    it('rejects unsupported types', () => {
      expect(validateSlipFile(makeFile('slip.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toMatch(/Only PDF/);
      expect(validateSlipFile(makeFile('slip.svg', 'image/svg+xml'))).toMatch(/Only PDF/);
    });

    it('rejects files over the size limit', () => {
      expect(validateSlipFile(makeFile('big.pdf', 'application/pdf', MAX_SLIP_BYTES + 1))).toMatch(/10 MB/);
    });
  });

  describe('getSlipDisplayName', () => {
    it('strips the storage UUID prefix', () => {
      expect(getSlipDisplayName('/api/uploads/slips/f10839f2-8d8b-4213-b801-a9ab7c3cfcca-Model-19-slip.pdf')).toBe('Model-19-slip.pdf');
    });

    it('keeps legacy file names as they are', () => {
      expect(getSlipDisplayName('/slips/sample-ifmis-slip.png')).toBe('sample-ifmis-slip.png');
    });
  });
});
