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
router.put('/stores/:id/store-men', requirePermission('references.manage'), controller.setStoreKeepers);
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
router.put('/employees/:id/access', requirePermission('roles.assign'), controller.grantAccess);
router.delete('/employees/:id/access', requirePermission('roles.assign'), controller.removeAccess);
router.post('/employees/:id/password', requirePermission('roles.assign'), controller.resetPassword);

// Outside organizations: anyone who issues items may add one from the issue form; changing them is for administrators
router.get('/organizations', requirePermission('references.read'), controller.getOrganizations);
router.post('/organizations', requirePermission('references.manage', 'stock-out.write'), controller.createOrganization);
router.put('/organizations/:id', requirePermission('references.manage'), controller.updateOrganization);
router.patch('/organizations/:id/status', requirePermission('references.manage'), controller.setOrganizationStatus);

// Programs & projects: anyone who records receipts may add one from the receipt form; changing them is for administrators
router.get('/programs', requirePermission('references.read'), controller.getPrograms);
router.post('/programs', requirePermission('references.manage', 'stock-in.write'), controller.createProgram);
router.put('/programs/:id', requirePermission('references.manage'), controller.updateProgram);
router.patch('/programs/:id/status', requirePermission('references.manage'), controller.setProgramStatus);
router.delete('/programs/:id', requirePermission('references.manage'), controller.deleteProgram);

export default router;

