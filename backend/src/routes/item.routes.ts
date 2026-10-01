import { Router } from 'express';
import { ItemController } from '../controllers/item.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const controller = new ItemController();

router.use(requireAuth);

router.get('/dashboard/executive', requirePermission('dashboard.read'), controller.getExecutiveDashboard);
router.get('/approvals/pending', requirePermission('approvals.read'), controller.getApprovals);
router.get('/audit/logs', requirePermission('audit.read'), controller.getAuditLogs);
router.get('/', requirePermission('inventory.read'), controller.getItems);
router.get('/:id', requirePermission('inventory.read'), controller.getItemById);

router.post('/stock-in', requirePermission('stock-in.write'), controller.registerStockIn);
router.put('/:id/stock-in', requirePermission('stock-in.write'), controller.updateStockIn);
router.post('/stock-out', requirePermission('stock-out.write'), controller.registerStockOut);
router.put('/stock-out/:approvalId', requirePermission('stock-out.write'), controller.updateStockOut);
router.post('/return-to-store', requirePermission('transfers.write'), controller.registerReturn);
router.put('/return-to-store/:approvalId', requirePermission('transfers.write'), controller.updateReturn);
router.post('/transfer', requirePermission('transfers.write'), controller.transferItem);
router.put('/transfer/:approvalId', requirePermission('transfers.write'), controller.updateTransfer);

router.post('/approvals/action', requirePermission('approvals.endorse', 'approvals.authorize'), controller.handleApproval);

export default router;
