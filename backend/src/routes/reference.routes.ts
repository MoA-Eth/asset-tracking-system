import { Router } from 'express';
import { ReferenceController } from '../controllers/reference.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/asset-management';

const router = Router();
const controller = new ReferenceController();
// Reference lookups support inventory, reports, allocations, and approval screens.
router.use(requireAuth);

router.get('/departments', controller.getDepartments);
router.get('/locations', controller.getLocations);
router.post('/locations', requireRole(UserRole.SYSTEM_ADMIN), controller.createLocation);
router.put('/locations/:id', requireRole(UserRole.SYSTEM_ADMIN), controller.updateLocation);
router.delete('/locations/:id', requireRole(UserRole.SYSTEM_ADMIN), controller.deleteLocation);
router.get('/employees', controller.getEmployees);
router.put(
  '/employees/:id/role',
  requireRole(UserRole.SYSTEM_ADMIN),
  controller.updateEmployeeRole
);

export default router;
