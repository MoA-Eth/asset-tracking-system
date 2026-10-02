import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { listEmployees, createEmployee, updateEmployee, setEmployeeActive, importEmployees } from '../services/employees.service';
import {
  listDepartments,
  listStores, createStore, updateStore, setStoreActive, deleteStore,
  listLocations, createLocation, updateLocation, setLocationActive, deleteLocation,
} from '../services/reference.service';

const idParam = (req: Request) => String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

export class ReferenceController {
  private store = StoreService.getInstance();

  /**
   * GET /api/reference/departments
   * Retrieves active Ministry directorates and technical divisions.
   */
  public getDepartments = asyncHandler(async (_req: Request, res: Response) => {
    const departments = await listDepartments();
    return sendSuccess(res, departments, 'Departments list retrieved');
  });

  /**
   * GET /api/reference/stores?includeInactive=true
   * Stores with their locations, for Settings and for the store / location pickers.
   */
  public getStores = asyncHandler(async (req: Request, res: Response) => {
    const stores = await listStores(req.user?.role, { includeInactive: req.query.includeInactive === 'true' });
    return sendSuccess(res, stores, 'Stores list retrieved');
  });

  /** POST /api/reference/stores  { name, address, locationName } */
  public createStore = asyncHandler(async (req: Request, res: Response) => {
    const created = await createStore(req.body ?? {}, req.user!.id);
    return sendSuccess(res, created, `${created.name} added`, 201);
  });

  /** PUT /api/reference/stores/:id */
  public updateStore = asyncHandler(async (req: Request, res: Response) => {
    const updated = await updateStore(idParam(req), req.body ?? {}, req.user!.id);
    return sendSuccess(res, updated, `${updated.name} updated`);
  });

  /** PATCH /api/reference/stores/:id/status  { active: boolean } */
  public setStoreStatus = asyncHandler(async (req: Request, res: Response) => {
    const updated = await setStoreActive(idParam(req), req.body?.active, req.user!.id);
    return sendSuccess(res, updated, `${updated.name} ${updated.isActive ? 'reactivated' : 'deactivated'}`);
  });

  /** DELETE /api/reference/stores/:id — only when nothing has used the store */
  public deleteStore = asyncHandler(async (req: Request, res: Response) => {
    await deleteStore(idParam(req), req.user!.id);
    return sendSuccess(res, null, 'Store deleted');
  });

  /**
   * GET /api/reference/locations
   * Every active location in an active store, as a flat list for the forms.
   */
  public getLocations = asyncHandler(async (_req: Request, res: Response) => {
    const locations = await listLocations();
    return sendSuccess(res, locations, 'Locations list retrieved');
  });

  /** POST /api/reference/stores/:id/locations  { name } */
  public createLocation = asyncHandler(async (req: Request, res: Response) => {
    const created = await createLocation(idParam(req), req.body ?? {}, req.user!.id);
    return sendSuccess(res, created, `${created.name} added to ${created.storeName}`, 201);
  });

  /** PUT /api/reference/locations/:id  { name } */
  public updateLocation = asyncHandler(async (req: Request, res: Response) => {
    const updated = await updateLocation(idParam(req), req.body ?? {}, req.user!.id);
    return sendSuccess(res, updated, `${updated.name} updated`);
  });

  /** PATCH /api/reference/locations/:id/status  { active: boolean } */
  public setLocationStatus = asyncHandler(async (req: Request, res: Response) => {
    const updated = await setLocationActive(idParam(req), req.body?.active, req.user!.id);
    return sendSuccess(res, updated, `${updated.name} ${updated.isActive ? 'reactivated' : 'deactivated'}`);
  });

  /** DELETE /api/reference/locations/:id — only when nothing has used it */
  public deleteLocation = asyncHandler(async (req: Request, res: Response) => {
    await deleteLocation(idParam(req), req.user!.id);
    return sendSuccess(res, null, 'Location deleted');
  });

  /**
   * GET /api/reference/employees?departmentId=&includeInactive=true
   * Active staff for the pickers; people who manage employees also get contact details and deactivated staff.
   */
  public getEmployees = asyncHandler(async (req: Request, res: Response) => {
    const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
    const employees = await listEmployees(req.user?.role, { departmentId, includeInactive: req.query.includeInactive === 'true' });
    return sendSuccess(res, employees, 'Employees list retrieved');
  });

  /** POST /api/reference/employees */
  public createEmployee = asyncHandler(async (req: Request, res: Response) => {
    const created = await createEmployee(req.body ?? {}, req.user!.id);
    return sendSuccess(res, created, `${created.fullNameEn} added`, 201);
  });

  /** POST /api/reference/employees/import  { rows, apply } — checks the rows, and saves them when apply is true */
  public importEmployees = asyncHandler(async (req: Request, res: Response) => {
    const result = await importEmployees(req.body?.rows, req.body?.apply, req.user!.id);
    const { create, update, error } = result.counts;
    const message = result.applied
      ? `Imported: ${create} added, ${update} updated`
      : `Checked: ${create} to add, ${update} to update, ${error} with problems`;
    return sendSuccess(res, result, message);
  });

  /** PUT /api/reference/employees/:id */
  public updateEmployee = asyncHandler(async (req: Request, res: Response) => {
    const updated = await updateEmployee(idParam(req), req.body ?? {}, req.user!.id);
    return sendSuccess(res, updated, `${updated.fullNameEn} updated`);
  });

  /** PATCH /api/reference/employees/:id/status  { active: boolean } */
  public setEmployeeStatus = asyncHandler(async (req: Request, res: Response) => {
    const updated = await setEmployeeActive(idParam(req), req.body?.active, req.user!.id);
    return sendSuccess(res, updated, `${updated.fullNameEn} ${updated.isActive ? 'reactivated' : 'deactivated'}`);
  });

  /**
   * PUT /api/reference/employees/:id/role
   * Updates staff member system authorization role.
   */
  public updateEmployeeRole = asyncHandler(async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { role } = req.body;
    const actorId = req.user?.id;
    const updated = await this.store.updateEmployeeRole(id as string, role, actorId);
    return sendSuccess(res, updated, 'Employee role updated successfully');
  });
}
