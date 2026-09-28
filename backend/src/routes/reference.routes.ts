import { Router } from 'express';
import { ReferenceController } from '../controllers/reference.controller';

const router = Router();
const controller = new ReferenceController();

router.get('/departments', controller.getDepartments);
router.get('/locations', controller.getLocations);
router.get('/employees', controller.getEmployees);
router.put('/employees/:id/role', controller.updateEmployeeRole);

export default router;
