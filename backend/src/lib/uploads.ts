import path from 'path';

// backend/uploads/slips — resolves the same from src/ (tsx) and dist/ (compiled)
export const SLIP_UPLOAD_DIR = path.join(__dirname, '../../uploads/slips');
export const SLIP_PUBLIC_PATH = '/api/uploads/slips';
export const MAX_SLIP_BYTES = 10 * 1024 * 1024;

interface SlipFormat {
  ext: string;
  // Leading bytes every genuine file of this type starts with
  matches: (buf: Buffer) => boolean;
}

export const SLIP_FORMATS: Record<string, SlipFormat> = {
  'application/pdf': {
    ext: '.pdf',
    matches: (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  },
  'image/png': {
    ext: '.png',
    matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  },
  'image/jpeg': {
    ext: '.jpg',
    matches: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  'image/webp': {
    ext: '.webp',
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
};

/** Reduce a client-supplied file name to a short, filesystem-safe slug (no extension). */
export function toSafeBaseName(originalName: string): string {
  const withoutExt = originalName.replace(/\.[a-zA-Z0-9]{1,8}$/, '');
  const slug = withoutExt
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'slip';
}
