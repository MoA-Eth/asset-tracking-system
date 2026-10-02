import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { listEmployees, createEmployee, updateEmployee, setEmployeeActive, importEmployees } from '../services/employees.service';

const idParam = (req: Request) => String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

export class ReferenceController {
  private store = StoreService.getInstance();

  /**
   * GET /api/reference/departments
   * Retrieves active Ministry directorates and technical divisions.
   */
  public getDepartments = asyncHandler(async (_req: Request, res: Response) => {
    const departments = await this.store.getDepartments();
    return sendSuccess(res, departments, 'Departments list retrieved');
  });

  /**
   * GET /api/reference/locations
   * Retrieves registered central stores, depots, and regional research centers.
   */
  public getLocations = asyncHandler(async (_req: Request, res: Response) => {
    const locations = await this.store.getLocations();
    return sendSuccess(res, locations, 'Locations list retrieved');
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
