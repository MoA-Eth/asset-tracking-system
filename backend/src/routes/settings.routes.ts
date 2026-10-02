import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { getSystemSettings, updateSystemSettings } from '../services/settings.service';

const router = Router();

// Everyone signed in needs the rules to fill in the forms; only the System Administrator changes them
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
  sendSuccess(res, getSystemSettings());
}));

router.put('/', requireAuth, requirePermission('references.manage'), asyncHandler(async (req, res) => {
  sendSuccess(res, await updateSystemSettings(req.body ?? {}, (req as any).user.id), 'System settings updated');
}));

export default router;
