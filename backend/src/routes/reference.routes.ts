import { Router } from 'express';
import { ReferenceController } from '../controllers/reference.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const controller = new ReferenceController();

router.use(requireAuth);
router.get('/departments', requirePermission('references.read'), controller.getDepartments);
router.get('/locations', requirePermission('references.read'), controller.getLocations);
router.get('/employees', requirePermission('references.read'), controller.getEmployees);
router.put('/employees/:id/role', requirePermission('roles.assign'), controller.updateEmployeeRole);

export default router;
