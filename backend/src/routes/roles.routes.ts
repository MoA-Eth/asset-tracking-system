import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/async-handler';
import { getRoleDirectory, updateRolePermissions, resetRolePermissionsToDefault } from '../services/roles.service';
import { sendSuccess } from '../utils/api-response';

const router = Router();
router.get('/', requireAuth, requirePermission('roles.read'), asyncHandler(async (_req, res) => {
  sendSuccess(res, await getRoleDirectory());
}));

router.put('/:role/permissions', requireAuth, requirePermission('roles.assign'), asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { permissions } = req.body;
  const actorId = (req as any).user?.id;
  const updated = await updateRolePermissions(role, permissions, actorId);
  sendSuccess(res, updated);
}));

router.post('/:role/permissions/reset', requireAuth, requirePermission('roles.assign'), asyncHandler(async (req, res) => {
  const { role } = req.params;
  const actorId = (req as any).user?.id;
  const updated = await resetRolePermissionsToDefault(role, actorId);
  sendSuccess(res, updated);
}));

export default router;

