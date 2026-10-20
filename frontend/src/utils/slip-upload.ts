// Mirrors backend/src/lib/uploads.ts — keep the accepted types and size limit in sync.
export const SLIP_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
/** Specific file accept for IFMIS PDF auto-fill fields: forces mobile browsers to open document picker instead of camera/photo picker */
export const SLIP_PDF_ACCEPT_ATTR = '.pdf,application/pdf';
/** Generic file accept for signed slip scans/photos and PDFs */
export const SLIP_ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
export const MAX_SLIP_BYTES = 10 * 1024 * 1024;
/** What to do when a scan or photo was chosen: only the PDF saved from IFMIS carries text the form can read */
export const SCAN_HINT =
  'To fill the form in automatically, ask whoever printed it from IFMIS to save it as a PDF and send you that file (by Telegram or email), then choose it here.';

/** Returns true if the file is an accepted PDF or image, based on MIME type or filename extension (handles mobile file picker fallbacks). */
export function isAcceptedSlipFile(file: File): boolean {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  const isPdf = mime === 'application/pdf' || mime === 'application/x-pdf' || name.endsWith('.pdf');
  const isImage = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/jpg' ||
                  /.(png|jpe?g|webp)$/i.test(name);

  return isPdf || isImage;
}

/** Returns an error message when the file can't be uploaded as a slip, otherwise null. */
export function validateSlipFile(file: File): string | null {
  if (!isAcceptedSlipFile(file)) {
    return 'Only PDF, PNG, JPEG or WEBP slip files are accepted.';
  }
  if (file.size > MAX_SLIP_BYTES) {
    return `Slip file exceeds the ${MAX_SLIP_BYTES / (1024 * 1024)} MB limit.`;
  }
  return null;
}

/** Loads a stored slip. Slips are only served to signed-in people, so the session token goes with the request. */
export function fetchSlip(url: string): Promise<Response> {
  const token = localStorage.getItem('moa_token');
  return fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
}

/** Opens a stored slip in a new tab (a plain link can't send the session token) */
export async function openSlipInNewTab(url: string): Promise<boolean> {
  try {
    const res = await fetchSlip(url);
    if (!res.ok) return false;
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
    return true;
  } catch {
    return false;
  }
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** Human-readable name for a stored slip URL, e.g. "/api/uploads/slips/<uuid>-Model-19.pdf" → "Model-19.pdf". */
export function getSlipDisplayName(url: string): string {
  const last = url.split('/').pop() || url;
  return last.replace(UUID_PREFIX, '');
}
