import { Router } from 'express';
import { ItemController } from '../controllers/item.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/asset-management';

const router = Router();
const controller = new ItemController();
router.use(requireAuth);
const encoderOnly = requireRole(UserRole.DATA_ENCODER);
const reviewersOnly = requireRole(
  UserRole.TEAM_LEADER,
  UserRole.DEPARTMENT_HEAD
);
const oversightOnly = requireRole(
  UserRole.TEAM_LEADER,
  UserRole.DEPARTMENT_HEAD,
  UserRole.MANAGER,
  UserRole.SYSTEM_ADMIN
);

// Management visibility
router.get(
  '/dashboard/executive',
  requireRole(
    UserRole.DEPARTMENT_HEAD,
    UserRole.MANAGER,
    UserRole.SYSTEM_ADMIN
  ),
  controller.getExecutiveDashboard
);

// Items inventory & movements
router.get('/', controller.getItems);
router.get('/:id', controller.getItemById);

// Operational entry belongs only to the encoder.
router.post('/stock-in', encoderOnly, controller.registerStockIn);
router.post('/stock-out', encoderOnly, controller.registerStockOut);
router.post('/return-to-store', encoderOnly, controller.registerReturn);
router.post('/transfer', encoderOnly, controller.transferItem);

// Encoders can track their own submissions in Stock-Out, but cannot review them.
router.get(
  '/approvals/pending',
  requireRole(
    UserRole.DATA_ENCODER,
    UserRole.TEAM_LEADER,
    UserRole.DEPARTMENT_HEAD
  ),
  controller.getApprovals
);
router.post('/approvals/action', reviewersOnly, controller.handleApproval);

// Audit logs
router.get('/audit/logs', oversightOnly, controller.getAuditLogs);

export default router;
