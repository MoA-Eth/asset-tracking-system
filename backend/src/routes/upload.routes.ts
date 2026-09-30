import express, { Router, Request, Response, NextFunction } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/asset-management';
import { MAX_SLIP_BYTES } from '../lib/uploads';
import { AppError } from '../errors/app-error';

const router = Router();
const controller = new UploadController();

// Slips are attached by the Data Encoder on Stock-In, Stock-Out and Return forms
router.post(
  '/slips',
  requireAuth,
  requireRole(UserRole.DATA_ENCODER),
  express.raw({ type: () => true, limit: MAX_SLIP_BYTES }),
  controller.uploadSlip
);

// Turn body-parser's size error into a readable 413 instead of a generic 500
router.use((err: any, _req: Request, _res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return next(new AppError(`Slip file exceeds the ${MAX_SLIP_BYTES / (1024 * 1024)} MB limit.`, 413));
  }
  next(err);
});

export default router;
