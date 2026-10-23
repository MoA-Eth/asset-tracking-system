/**
 * Strips raw internal JSON metadata (such as PO Receipt metadata stored in item notes)
 * and extracts the real user remark or defect notes.
 * Voucher-level metadata like Program Name and Source are shown in the header,
 * not repeated inside line remarks.
 */
export function formatVoucherRemark(remark?: string | null): string | undefined {
  if (!remark) return undefined;
  const trimmed = String(remark).trim();
  if (!trimmed) return undefined;
  // Don't show voucher-level program name or source as a line remark
  if (/^program:\s*/i.test(trimmed)) return undefined;
  if (/^source:\s*/i.test(trimmed)) return undefined;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'object' && obj !== null) {
        if (obj.userNotes) return String(obj.userNotes).trim();
        if (obj.remark) return String(obj.remark).trim();
        if (obj.notes) return String(obj.notes).trim();
        if (obj.defectRemark) return String(obj.defectRemark).trim();
        if (obj.description) return String(obj.description).trim();
        return undefined; // Hide raw internal JSON system payloads
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
