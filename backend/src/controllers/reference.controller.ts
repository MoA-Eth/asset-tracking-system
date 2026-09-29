import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';

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
   * GET /api/reference/employees
   * Retrieves staff registry with optional department filter.
   */
  public getEmployees = asyncHandler(async (req: Request, res: Response) => {
    const { departmentId } = req.query;
    const employees = await this.store.getEmployees(departmentId as string);
    return sendSuccess(res, employees, 'Employees list retrieved');
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
