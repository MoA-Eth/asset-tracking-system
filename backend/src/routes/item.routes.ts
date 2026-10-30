import { Router } from 'express';
import { ItemController } from '../controllers/item.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const controller = new ItemController();

router.use(requireAuth);

router.get('/dashboard/executive', requirePermission('dashboard.read'), controller.getExecutiveDashboard);
router.get(
  '/approvals/pending',
  requirePermission('approvals.read', 'stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write'),
  controller.getApprovals
);
router.get('/audit/logs', requirePermission('audit.read'), controller.getAuditLogs);
router.get('/', requirePermission('inventory.read'), controller.getItems);
// Before '/:id', so "mine" isn't read as an item id
router.get('/mine', requirePermission('assets.own'), controller.getMyAssets);
router.get('/:id', requirePermission('inventory.read'), controller.getItemById);

router.post('/stock-in', requirePermission('stock-in.write'), controller.registerStockIn);
// Approvers may also correct a request waiting for them (the service checks it is theirs to decide)
router.put('/:id/stock-in', requirePermission('stock-in.write', 'approvals.endorse', 'approvals.authorize'), controller.updateStockIn);
// Whoever records receipts, transfers or disposals may record the IFMIS tag those forms name the asset by
router.patch('/:id/ifmis-tag', requirePermission('stock-in.write', 'transfers.write', 'disposals.write'), controller.setIfmisTag);
router.post('/stock-out', requirePermission('stock-out.write'), controller.registerStockOut);
router.put('/stock-out/:approvalId', requirePermission('stock-out.write', 'approvals.endorse', 'approvals.authorize'), controller.updateStockOut);
router.post('/disposal', requirePermission('disposals.write'), controller.registerDisposal);
router.put('/disposal/:approvalId', requirePermission('disposals.write', 'approvals.endorse', 'approvals.authorize'), controller.updateDisposal);
router.post('/return-to-store', requirePermission('transfers.write'), controller.registerReturn);
router.put('/return-to-store/:approvalId', requirePermission('transfers.write', 'approvals.endorse', 'approvals.authorize'), controller.updateReturn);
router.post('/transfer', requirePermission('transfers.write'), controller.transferItem);
router.put('/transfer/:approvalId', requirePermission('transfers.write', 'approvals.endorse', 'approvals.authorize'), controller.updateTransfer);

router.post('/approvals/action', requirePermission('approvals.endorse', 'approvals.authorize'), controller.handleApproval);
router.post('/approvals/slip-action', requirePermission('approvals.endorse', 'approvals.authorize'), controller.handleSlipApproval);
router.post('/approvals/resubmit', requirePermission('stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write'), controller.resubmitReturned);
router.post('/approvals/cancel', requirePermission('stock-in.write', 'stock-out.write', 'transfers.write', 'disposals.write'), controller.cancelRejected);
router.post('/approvals/void', requirePermission('approvals.void'), controller.voidApproved);

export default router;
