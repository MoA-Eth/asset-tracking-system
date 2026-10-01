// Mirrors backend/src/lib/uploads.ts — keep the accepted types and size limit in sync.
export const SLIP_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const SLIP_ACCEPT_ATTR = SLIP_ACCEPTED_TYPES.join(',');
export const MAX_SLIP_BYTES = 10 * 1024 * 1024;

/** Returns an error message when the file can't be uploaded as a slip, otherwise null. */
export function validateSlipFile(file: File): string | null {
  if (!SLIP_ACCEPTED_TYPES.includes(file.type)) {
    return 'Only PDF, PNG, JPEG or WEBP slip files are accepted.';
  }
  if (file.size > MAX_SLIP_BYTES) {
    return `Slip file exceeds the ${MAX_SLIP_BYTES / (1024 * 1024)} MB limit.`;
  }
  return null;
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** Human-readable name for a stored slip URL, e.g. "/api/uploads/slips/<uuid>-Model-19.pdf" → "Model-19.pdf". */
export function getSlipDisplayName(url: string): string {
  const last = url.split('/').pop() || url;
  return last.replace(UUID_PREFIX, '');
}
