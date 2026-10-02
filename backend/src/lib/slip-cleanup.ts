import fs from 'fs/promises';
import path from 'path';
import { prisma } from './prisma';
import { SLIP_PUBLIC_PATH, SLIP_UPLOAD_DIR } from './uploads';

/**
 * Deletes an uploaded slip that no item or request refers to.
 * Called when a request is refused after its slip was already uploaded. Never throws: it is only a tidy-up.
 */
export async function discardUnusedSlip(url: unknown): Promise<void> {
  if (typeof url !== 'string' || !url.startsWith(SLIP_PUBLIC_PATH + '/')) return;
  const name = path.basename(url);
  // Only a plain file name directly under the slips folder
  if (SLIP_PUBLIC_PATH + '/' + name !== url) return;
  try {
    const used =
      (await prisma.item.count({ where: { ifmisSlipAttachmentUrl: url } })) +
      (await prisma.transactionApproval.count({ where: { ifmisSlipAttachmentUrl: url } }));
    if (used === 0) await fs.unlink(path.join(SLIP_UPLOAD_DIR, name));
  } catch {
    // The file may already be gone, or the database unreachable: leave it
  }
}
