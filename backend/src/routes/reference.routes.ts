import express, { Router } from 'express';
import { ReferenceController } from '../controllers/reference.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const controller = new ReferenceController();

router.use(requireAuth);
router.get('/departments', requirePermission('references.read'), controller.getDepartments);
router.get('/stores', requirePermission('references.read'), controller.getStores);
router.post('/stores', requirePermission('references.manage'), controller.createStore);
router.put('/stores/:id', requirePermission('references.manage'), controller.updateStore);
router.patch('/stores/:id/status', requirePermission('references.manage'), controller.setStoreStatus);
router.delete('/stores/:id', requirePermission('references.manage'), controller.deleteStore);
router.post('/stores/:id/locations', requirePermission('references.manage'), controller.createLocation);
router.get('/locations', requirePermission('references.read'), controller.getLocations);
router.put('/locations/:id', requirePermission('references.manage'), controller.updateLocation);
router.patch('/locations/:id/status', requirePermission('references.manage'), controller.setLocationStatus);
router.delete('/locations/:id', requirePermission('references.manage'), controller.deleteLocation);
router.get('/employees', requirePermission('references.read'), controller.getEmployees);
router.post('/employees', requirePermission('employees.manage'), controller.createEmployee);
// HR spreadsheets can hold thousands of rows
router.post('/employees/import', express.json({ limit: '5mb' }), requirePermission('employees.manage'), controller.importEmployees);
router.put('/employees/:id', requirePermission('employees.manage'), controller.updateEmployee);
router.patch('/employees/:id/status', requirePermission('employees.manage'), controller.setEmployeeStatus);
router.put('/employees/:id/role', requirePermission('roles.assign'), controller.updateEmployeeRole);

export default router;
