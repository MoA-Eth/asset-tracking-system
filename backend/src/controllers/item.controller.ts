import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { discardUnusedSlip } from '../lib/slip-cleanup';
import {
  AssetCategory,
  ItemStatus,
  ApprovalStatus,
  CreateStockInRequest,
  UpdateStockInRequest,
  UpdateStockOutRequest,
  UpdateTransferRequest,
  UpdateReturnRequest,
  CreateStockOutRequest,
  CreateTransferRequest,
  ApprovalActionRequest,
  UserRole,
} from '../types/asset-management';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } from '../errors/app-error';

import { hasPermission, Permission } from '../security/role-policy';

function assertPermission(req: Request, permission: Permission) {
  if (!req.user) throw new UnauthorizedError('Authentication is required.');
  if (!hasPermission(req.user.role, permission)) throw new ForbiddenError('Your role does not permit this action.');
}

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
    assertPermission(req, 'stock-in.write');
    const payload: CreateStockInRequest = req.body;
    // Authenticated user identity strictly claims the registration activity
    if (req.user) {
      payload.registeredById = req.user.id;
    }
    if (payload.items && payload.items.length > 0) {
      if (!payload.name) payload.name = payload.items[0].name;
      if (!payload.category) payload.category = payload.items[0].category || AssetCategory.IT_EQUIPMENT;
      if (payload.unitCostETB === undefined) payload.unitCostETB = payload.items[0].unitCostETB || 0;
    }
    if (!payload.name || !payload.category) {
      throw new BadRequestError('Item name and asset category are mandatory fields.');
    }
    if (!payload.isHistoricalData && !payload.ifmisSlipNumber) {
      throw new BadRequestError('IFMIS receiving voucher slip number is required for new stock-in.');
    }
    if (!payload.registeredById) {
      throw new BadRequestError('User identity is required to register stock-in.');
    }
    const result = await this.store.registerStockIn(payload).catch(async (err) => {
      await discardUnusedSlip(payload.ifmisSlipAttachmentUrl);
      throw err;
    });
    return sendSuccess(res, result, 'Stock-In registered successfully', 201);
  });

  /**
   * PUT /api/items/:id/stock-in
   * Corrects a Stock-In registration while it still waits for Stage 1 endorsement.
   */
  public updateStockIn = asyncHandler(async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload: UpdateStockInRequest = req.body;
    const item = await this.store.updateStockIn(id, payload, req.user!.id);
    return sendSuccess(res, { item }, 'Stock-In registration updated');
  });

  /**
   * POST /api/items/stock-out
   * Scenario 2.2: Outbound store issue mirrored from IFMIS Model 20/22.
   */
  public registerStockOut = asyncHandler(async (req: Request, res: Response) => {
    assertPermission(req, 'stock-out.write');
    const payload: CreateStockOutRequest = req.body;
    // Authenticated user identity strictly claims the requisition activity
    if (req.user) {
      payload.registeredById = req.user.id;
    }
    if (!payload.itemId || !payload.recipientEmployeeId || !payload.ifmisSlipNumber) {
      throw new BadRequestError('Asset Item, Recipient Staff, and IFMIS Issue Voucher are required.');
    }
    if (!payload.registeredById) {
      throw new BadRequestError('User identity is required to register stock-out.');
    }
    const result = await this.store.registerStockOut(payload).catch(async (err) => {
      await discardUnusedSlip(payload.ifmisSlipAttachmentUrl);
      throw err;
    });
    return sendSuccess(res, result, 'Stock-out submitted for Department Head approval', 201);
  });

  /**
   * PUT /api/items/stock-out/:approvalId
   * Corrects a Stock-Out request while it still waits for Stage 1 endorsement.
   */
  public updateStockOut = asyncHandler(async (req: Request, res: Response) => {
    const approvalId = Array.isArray(req.params.approvalId) ? req.params.approvalId[0] : req.params.approvalId;
    const payload: UpdateStockOutRequest = req.body;
    const approval = await this.store.updateStockOut(approvalId, payload, req.user!.id);
    return sendSuccess(res, { approval }, 'Stock-Out request updated');
  });

  /**
   * POST /api/items/return-to-store
   * Scenario 2.3: Model 22 Return Slip (Issued item returned to central store).
   */
  public registerReturn = asyncHandler(async (req: Request, res: Response) => {
    assertPermission(req, 'transfers.write');
    const payload = req.body;
    // Authenticated user identity strictly claims the return activity
    if (req.user) {
      payload.registeredById = req.user.id;
    }
    if (!payload.itemId || !payload.ifmisSlipNumber || !payload.condition) {
      throw new BadRequestError('Item ID, IFMIS Return Slip Number (Model 22), and Condition are mandatory.');
    }
    if (!payload.registeredById) {
      throw new BadRequestError('User identity is required to register return.');
    }
    const result = await this.store.registerReturn(payload).catch(async (err) => {
      await discardUnusedSlip(payload.ifmisSlipAttachmentUrl);
      throw err;
    });
    return sendSuccess(res, result, 'Model 22 Return-to-Store registered and sent for approval', 201);
  });

  /**
   * PUT /api/items/return-to-store/:approvalId
   * Corrects a Model 21 return request while it still waits for Stage 1 endorsement.
   */
  public updateReturn = asyncHandler(async (req: Request, res: Response) => {
    const approvalId = Array.isArray(req.params.approvalId) ? req.params.approvalId[0] : req.params.approvalId;
    const payload: UpdateReturnRequest = req.body;
    const approval = await this.store.updateReturn(approvalId, payload, req.user!.id);
    return sendSuccess(res, { approval }, 'Return request updated');
  });

  /**
   * PUT /api/items/transfer/:approvalId
   * Corrects a Model 21 transfer request while it still waits for Stage 1 endorsement.
   */
  public updateTransfer = asyncHandler(async (req: Request, res: Response) => {
    const approvalId = Array.isArray(req.params.approvalId) ? req.params.approvalId[0] : req.params.approvalId;
    const payload: UpdateTransferRequest = req.body;
    const approval = await this.store.updateTransfer(approvalId, payload, req.user!.id);
    return sendSuccess(res, { approval }, 'Transfer request updated');
  });

  /**
   * POST /api/items/transfer
   * Reassignment / transfer between custodians or physical store depots.
   */
  public transferItem = asyncHandler(async (req: Request, res: Response) => {
    assertPermission(req, 'transfers.write');
    const payload: CreateTransferRequest = req.body;
    // Authenticated user identity strictly claims the transfer activity
    if (req.user) {
      payload.performedById = req.user.id;
    }
    if (!payload.itemId || !payload.reason) {
      throw new BadRequestError('Item ID and transfer reason are mandatory.');
    }
    if (!payload.performedById) {
      throw new BadRequestError('User identity is required to transfer item.');
    }
    const result = await this.store.transferItem(payload);
    return sendSuccess(res, result, 'Transfer request submitted for approval');
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
    
    if (!['ENDORSE', 'APPROVE', 'REJECT'].includes(payload.action)) throw new BadRequestError('Invalid approval action.');
    if (!req.user) throw new UnauthorizedError('Authentication is required.');
    if (payload.action === 'ENDORSE') assertPermission(req, 'approvals.endorse');
    else if (payload.action === 'APPROVE') assertPermission(req, 'approvals.authorize');
    else if (!hasPermission(req.user.role, 'approvals.endorse') && !hasPermission(req.user.role, 'approvals.authorize')) {
      throw new ForbiddenError('Your role cannot reject requests.');
    }
    payload.reviewedById = req.user.id;

    if (!payload.approvalId || !payload.action || !payload.reviewedById) {
      throw new BadRequestError('Approval ID, Action, and Reviewing Officer are required.');
    }
    const result = await this.store.handleApproval(payload);
    const done = { ENDORSE: 'endorsed', APPROVE: 'approved', REJECT: 'rejected' }[payload.action];
    return sendSuccess(res, result, `Request ${done}`);
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
