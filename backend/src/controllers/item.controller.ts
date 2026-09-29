import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import {
  AssetCategory,
  ItemStatus,
  ApprovalStatus,
  CreateStockInRequest,
  CreateStockOutRequest,
  CreateTransferRequest,
  ApprovalActionRequest,
  UserRole,
} from '../types/asset-management';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../errors/app-error';

export class ItemController {
  private store = StoreService.getInstance();

  /**
   * GET /api/items/dashboard/executive
   * Retrieves aggregated KPI cards, valuation, and category distribution for leadership.
   */
  public getExecutiveDashboard = asyncHandler(async (_req: Request, res: Response) => {
    const data = await this.store.getExecutiveDashboard();
    return sendSuccess(res, data, 'Executive dashboard data retrieved');
  });

  /**
   * GET /api/items
   * Retrieves items with optional status, category, location, and search filters.
   */
  public getItems = asyncHandler(async (req: Request, res: Response) => {
    const { status, category, departmentId, locationId, search } = req.query;
    const items = await this.store.getItems({
      status: status as ItemStatus,
      category: category as AssetCategory,
      departmentId: departmentId as string,
      locationId: locationId as string,
      search: search as string,
    });
    return sendSuccess(res, items, 'Items list retrieved');
  });

  /**
   * GET /api/items/:id
   * Retrieves detailed single item record with relations and movement timeline.
   */
  public getItemById = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const item = await this.store.getItemById(id);
    if (!item) {
      throw new NotFoundError(`Asset item with ID "${id}" was not found.`);
    }
    return sendSuccess(res, item, 'Item details retrieved');
  });

  /**
   * POST /api/items/stock-in
   * Scenario 2.1: Inbound goods registration mirrored from IFMIS Model 19.
   */
  public registerStockIn = asyncHandler(async (req: Request, res: Response) => {
    if (req.user && req.user.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenError('System Administrators are restricted from operational store transactions under Segregation of Duties.');
    }
    const payload: CreateStockInRequest = req.body;
    if (!payload.name || !payload.category) {
      throw new BadRequestError('Item name and asset category are mandatory fields.');
    }
    if (!payload.isHistoricalData && !payload.ifmisSlipNumber) {
      throw new BadRequestError('IFMIS receiving voucher slip number is required for new stock-in.');
    }
    const result = await this.store.registerStockIn(payload);
    return sendSuccess(res, result, 'Stock-In registered successfully', 201);
  });

  /**
   * POST /api/items/stock-out
   * Scenario 2.2: Outbound store issue mirrored from IFMIS Model 20/22.
   */
  public registerStockOut = asyncHandler(async (req: Request, res: Response) => {
    if (req.user && req.user.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenError('System Administrators are restricted from operational store transactions under Segregation of Duties.');
    }
    const payload: CreateStockOutRequest = req.body;
    if (!payload.itemId || !payload.recipientEmployeeId || !payload.ifmisSlipNumber) {
      throw new BadRequestError('Asset Item, Recipient Staff, and IFMIS Issue Voucher are required.');
    }
    const result = await this.store.registerStockOut(payload);
    return sendSuccess(res, result, 'Stock-out submitted for Department Head approval', 201);
  });

  /**
   * POST /api/items/return-to-store
   * Scenario 2.3: Model 22 Return Slip (Issued item returned to central store).
   */
  public registerReturn = asyncHandler(async (req: Request, res: Response) => {
    if (req.user && req.user.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenError('System Administrators are restricted from operational store transactions under Segregation of Duties.');
    }
    const payload = req.body;
    if (!payload.itemId || !payload.ifmisSlipNumber || !payload.condition) {
      throw new BadRequestError('Item ID, IFMIS Return Slip Number (Model 22), and Condition are mandatory.');
    }
    const result = await this.store.registerReturn(payload);
    return sendSuccess(res, result, 'Model 22 Return-to-Store registered and sent for approval', 201);
  });

  /**
   * POST /api/items/transfer
   * Reassignment / transfer between custodians or physical store depots.
   */
  public transferItem = asyncHandler(async (req: Request, res: Response) => {
    if (req.user && req.user.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenError('System Administrators are restricted from operational store transactions under Segregation of Duties.');
    }
    const payload: CreateTransferRequest = req.body;
    if (!payload.itemId || !payload.reason) {
      throw new BadRequestError('Item ID and transfer reason are mandatory.');
    }
    const result = await this.store.transferItem(payload);
    return sendSuccess(res, result, 'Item transferred successfully');
  });

  /**
   * GET /api/items/approvals/pending
   * Retrieves pending or filtered workflow authorization queue.
   */
  public getApprovals = asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.query;
    const approvals = await this.store.getApprovals(status as ApprovalStatus);
    return sendSuccess(res, approvals, 'Approvals list retrieved');
  });

  /**
   * POST /api/items/approvals/action
   * Department Head review action (APPROVE or REJECT).
   */
  public handleApproval = asyncHandler(async (req: Request, res: Response) => {
    const payload: ApprovalActionRequest = req.body;
    
    // Auto-populate reviewing officer if authenticated
    if (req.user) {
      if (req.user.role === UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenError('System Administrators are restricted from signing off approval workflows to maintain Segregation of Duties.');
      }
      if (!payload.reviewedById) {
        payload.reviewedById = req.user.id;
      }
      // Enforce role clearance based on 2-stage approval action
      if (payload.action === 'ENDORSE') {
        if (
          req.user.role !== UserRole.TEAM_LEADER &&
          req.user.role !== UserRole.DEPARTMENT_HEAD
        ) {
          throw new BadRequestError('Only Team Leaders can endorse Stage 1 requests.');
        }
      } else if (payload.action === 'APPROVE') {
        if (
          req.user.role !== UserRole.DEPARTMENT_HEAD &&
          req.user.role !== UserRole.TOP_MANAGEMENT
        ) {
          throw new BadRequestError('Only Department Heads or Executive Management can grant Stage 2 final approval.');
        }
      } else if (payload.action === 'REJECT') {
        if (
          req.user.role !== UserRole.TEAM_LEADER &&
          req.user.role !== UserRole.DEPARTMENT_HEAD &&
          req.user.role !== UserRole.TOP_MANAGEMENT
        ) {
          throw new BadRequestError('You do not have authorization to reject this approval workflow.');
        }
      }
    }

    if (!payload.approvalId || !payload.action || !payload.reviewedById) {
      throw new BadRequestError('Approval ID, Action, and Reviewing Officer are required.');
    }
    const result = await this.store.handleApproval(payload);
    return sendSuccess(res, result, `Approval request ${payload.action.toLowerCase()}d successfully`);
  });

  /**
   * GET /api/items/audit/logs
   * Immutable statutory audit trail of all store operations.
   */
  public getAuditLogs = asyncHandler(async (_req: Request, res: Response) => {
    const logs = await this.store.getAuditLogs();
    return sendSuccess(res, logs, 'Audit logs retrieved');
  });
}
