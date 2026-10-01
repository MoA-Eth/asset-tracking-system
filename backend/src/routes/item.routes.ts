import { Router } from 'express';
import { ItemController } from '../controllers/item.controller';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/asset-management';

const router = Router();
const controller = new ItemController();

// Management visibility
router.get('/dashboard/executive', optionalAuth, controller.getExecutiveDashboard);

// Items inventory & movements
router.get('/', optionalAuth, controller.getItems);
router.get('/:id', optionalAuth, controller.getItemById);

// Workflows (Stock operations require authenticated encoder or leadership role)
router.post(
  '/stock-in',
  optionalAuth, // allows backward compatibility while enforcing if user provided
  controller.registerStockIn
);
// Corrections are only for the encoder, and only before Stage 1 endorsement (checked in the service)
router.put(
  '/:id/stock-in',
  requireAuth,
  requireRole(UserRole.DATA_ENCODER),
  controller.updateStockIn
);
router.post(
  '/stock-out',
  optionalAuth,
  controller.registerStockOut
);
router.put(
  '/stock-out/:approvalId',
  requireAuth,
  requireRole(UserRole.DATA_ENCODER),
  controller.updateStockOut
);
router.post(
  '/return-to-store',
  optionalAuth,
  controller.registerReturn
);
router.put(
  '/return-to-store/:approvalId',
  requireAuth,
  requireRole(UserRole.DATA_ENCODER),
  controller.updateReturn
);
router.post(
  '/transfer',
  optionalAuth,
  controller.transferItem
);
router.put(
  '/transfer/:approvalId',
  requireAuth,
  requireRole(UserRole.DATA_ENCODER),
  controller.updateTransfer
);

// Approvals (Executive / Department Head sign-off only)
router.get('/approvals/pending', optionalAuth, controller.getApprovals);
router.post(
  '/approvals/action',
  optionalAuth,
  controller.handleApproval
);

// Audit logs
router.get('/audit/logs', optionalAuth, controller.getAuditLogs);

export default router;
