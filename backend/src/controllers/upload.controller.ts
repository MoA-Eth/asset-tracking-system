import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { BadRequestError } from '../errors/app-error';
import { SLIP_FORMATS, SLIP_PUBLIC_PATH, SLIP_UPLOAD_DIR, toSafeBaseName } from '../lib/uploads';

export class UploadController {
  /**
   * POST /api/uploads/slips
   * Body: raw file bytes. Headers: Content-Type (pdf/png/jpeg/webp), X-File-Name (URI-encoded).
   * Stores a scanned IFMIS slip and returns the URL to save as ifmisSlipAttachmentUrl.
   */
  public uploadSlip = asyncHandler(async (req: Request, res: Response) => {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const format = SLIP_FORMATS[contentType];
    if (!format) {
      throw new BadRequestError('Only PDF, PNG, JPEG or WEBP slip files are accepted.');
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestError('Slip file is empty.');
    }
    if (!format.matches(body)) {
      throw new BadRequestError(`File content does not match its declared type (${contentType}).`);
    }

    let originalName = 'slip';
    try {
      originalName = decodeURIComponent(String(req.headers['x-file-name'] || 'slip'));
    } catch {
      // keep default for malformed encodings
    }

    const fileName = `${randomUUID()}-${toSafeBaseName(originalName)}${format.ext}`;
    await fs.mkdir(SLIP_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(SLIP_UPLOAD_DIR, fileName), body);

    return sendSuccess(
      res,
      {
        url: `${SLIP_PUBLIC_PATH}/${fileName}`,
        fileName: originalName,
        contentType,
        size: body.length,
      },
      'Slip uploaded',
      201
    );
  });
}
