import express, { Router } from 'express';
import { ReferenceController } from '../controllers/reference.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const controller = new ReferenceController();

router.use(requireAuth);
router.get('/departments', requirePermission('references.read'), controller.getDepartments);
router.get('/locations', requirePermission('references.read'), controller.getLocations);
router.get('/employees', requirePermission('references.read'), controller.getEmployees);
router.post('/employees', requirePermission('employees.manage'), controller.createEmployee);
// HR spreadsheets can hold thousands of rows
router.post('/employees/import', express.json({ limit: '5mb' }), requirePermission('employees.manage'), controller.importEmployees);
router.put('/employees/:id', requirePermission('employees.manage'), controller.updateEmployee);
router.patch('/employees/:id/status', requirePermission('employees.manage'), controller.setEmployeeStatus);
router.put('/employees/:id/role', requirePermission('roles.assign'), controller.updateEmployeeRole);

export default router;
