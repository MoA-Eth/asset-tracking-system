import {
  ItemStatus,
  ItemWithRelations,
  Department,
  Location,
  Employee,
  TransactionApproval,
  AuditLogEntry,
  AssetCategory,
  ItemCondition,
  UserRole,
  TransactionType,
  ApprovalStatus,
  CreateStockInRequest,
  CreateStockOutRequest,
  CreateTransferRequest,
  CreateReturnRequest,
  ApprovalActionRequest,
} from '../types/asset-management';
import { prisma } from '../lib/prisma';
import { getTodayGcAndEc, formatGcToEc } from '../utils/eth-date';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapItem(raw: any): ItemWithRelations {
  let model19Meta: any = {};
  if (raw.notes) {
    try {
      model19Meta = JSON.parse(raw.notes);
    } catch {
      // not JSON format
    }
  }

  return {
    id: raw.id,
    itemCode: raw.itemCode,
    name: raw.name,
    category: raw.category as AssetCategory,
    serialNumber: raw.serialNumber,
    unitCostETB: raw.unitCostETB,
    status: raw.status as ItemStatus,
    condition: (raw.condition ?? ItemCondition.NEW) as ItemCondition,
    storeLocationId: raw.storeLocationId,
    currentCustodianId: raw.currentCustodianId ?? null,
    assignedDepartmentId: raw.assignedDepartmentId ?? null,
    ifmisSlipNumber: raw.ifmisSlipNumber,
    ifmisSlipDateGc: raw.ifmisSlipDateGc,
    ifmisSlipDateEc: raw.ifmisSlipDateEc,
    ifmisSlipAttachmentUrl: raw.ifmisSlipAttachmentUrl ?? undefined,
    isHistoricalData: raw.isHistoricalData,
    notes: (model19Meta.userNotes || (typeof model19Meta === 'object' && Object.keys(model19Meta).length > 0 ? (model19Meta.remark || raw.notes) : raw.notes)) || undefined,
    registeredById: raw.registeredById,
    approvedById: raw.approvedById ?? undefined,
    createdAtGc: raw.createdAtGc,
    createdAtEc: raw.createdAtEc,
    storeLocation: raw.storeLocation ?? undefined,
    currentCustodian: raw.currentCustodian ?? null,
    assignedDepartment: raw.assignedDepartment ?? null,
    registeredBy: raw.registeredBy ?? undefined,
    approvedBy: raw.approvedBy ?? undefined,

    // Model 19 fields
    poNumber: model19Meta.poNumber || raw.poNumber || undefined,
    transactionType: model19Meta.transactionType || raw.transactionType || undefined,
    source: model19Meta.source || raw.source || undefined,
    buyer: model19Meta.buyer || raw.buyer || undefined,
    programName: model19Meta.programName || raw.programName || undefined,
    uom: model19Meta.uom || raw.uom || undefined,
    subInventory: model19Meta.subInventory || raw.subInventory || undefined,
    itemCategoryDisplay: model19Meta.itemCategoryDisplay || undefined,
    lotBatchNo: model19Meta.lotBatchNo || raw.lotBatchNo || undefined,
    printedPadFrom: model19Meta.printedPadFrom || raw.printedPadFrom || undefined,
    printedPadTo: model19Meta.printedPadTo || raw.printedPadTo || undefined,
    quantity: model19Meta.quantity || raw.quantity || 1,
    totalAmount: model19Meta.totalAmount || raw.totalAmount || (raw.unitCostETB * (model19Meta.quantity || 1)),
    deliveredBy: model19Meta.deliveredBy || raw.deliveredBy || undefined,
    receivedBy: model19Meta.receivedBy || raw.receivedBy || undefined,
    remark: model19Meta.remark || raw.remark || undefined,

    history: (raw.history ?? []).map((h: any) => ({
      id: h.id,
      dateGc: h.dateGc,
      dateEc: h.dateEc,
      action: h.action,
      fromEntity: h.fromEntity ?? undefined,
      toEntity: h.toEntity ?? undefined,
      performedBy: h.performedBy,
      performedByRole: h.performedByRole as UserRole,
      approvedBy: h.approvedBy ?? undefined,
      ifmisSlipNumber: h.ifmisSlipNumber ?? undefined,
      notes: h.notes ?? undefined,
    })),
  };
}

const APPROVAL_INCLUDES = {
  requestedBy: true,
  endorsedBy: true,
  reviewedBy: true,
  recipientEmployee: true,
  targetDepartment: true,
};

function mapApproval(raw: any): TransactionApproval {
  return {
    id: raw.id,
    transactionType: raw.transactionType as TransactionType,
    itemId: raw.itemId,
    itemCode: raw.itemCode,
    itemName: raw.itemName,
    ifmisSlipNumber: raw.ifmisSlipNumber,
    ifmisSlipDateGc: raw.ifmisSlipDateGc,
    ifmisSlipDateEc: raw.ifmisSlipDateEc,
    ifmisSlipAttachmentUrl: raw.ifmisSlipAttachmentUrl ?? undefined,
    requestedById: raw.requestedById,
    recipientEmployeeId: raw.recipientEmployeeId ?? undefined,
    targetDepartmentId: raw.targetDepartmentId ?? undefined,
    purposeOrRemarks: raw.purposeOrRemarks,
    status: raw.status as ApprovalStatus,
    currentStage: raw.currentStage ?? 1,
    endorsedById: raw.endorsedById ?? undefined,
    endorsementRemarks: raw.endorsementRemarks ?? undefined,
    endorsedAtGc: raw.endorsedAtGc ?? undefined,
    endorsedAtEc: raw.endorsedAtEc ?? undefined,
    endorsedBy: raw.endorsedBy ? mapEmployee(raw.endorsedBy) : undefined,
    reviewedById: raw.reviewedById ?? undefined,
    reviewRemarks: raw.reviewRemarks ?? undefined,
    createdAtGc: raw.createdAtGc,
    createdAtEc: raw.createdAtEc,
    reviewedAtGc: raw.reviewedAtGc ?? undefined,
    reviewedAtEc: raw.reviewedAtEc ?? undefined,
    reviewedBy: raw.reviewedBy ? mapEmployee(raw.reviewedBy) : undefined,
    requestedBy: raw.requestedBy ? mapEmployee(raw.requestedBy) : undefined,
    recipientEmployee: raw.recipientEmployee ? mapEmployee(raw.recipientEmployee) : undefined,
  };
}

function mapEmployee(e: any): Employee {
  return {
    id: e.id,
    payrollId: e.payrollId,
    fullNameEn: e.fullNameEn,
    fullNameAm: e.fullNameAm,
    departmentId: e.departmentId,
    email: e.email,
    phone: e.phone,
    role: e.role as UserRole,
  };
}

const ITEM_INCLUDES = {
  storeLocation: true,
  currentCustodian: true,
  assignedDepartment: true,
  registeredBy: true,
  approvedBy: true,
  history: { orderBy: { createdAt: 'desc' as const } },
};

// ─── Category Code ────────────────────────────────────────────────────────────

function getCategoryCode(cat: AssetCategory): string {
  switch (cat) {
    case AssetCategory.VEHICLE: return 'VEH';
    case AssetCategory.AGRI_MACHINERY: return 'AGR';
    case AssetCategory.IT_EQUIPMENT: return 'IT';
    case AssetCategory.OFFICE_FURNITURE: return 'FUR';
    case AssetCategory.LAB_EQUIPMENT: return 'LAB';
    case AssetCategory.FIELD_GEAR: return 'FLD';
    default: return 'GEN';
  }
}

async function generateItemCode(category: AssetCategory, year: number): Promise<string> {
  const prefix = `MOA-${getCategoryCode(category)}-${year}-`;
  const existing = await prisma.item.findMany({
    where: { itemCode: { startsWith: prefix } },
    select: { itemCode: true },
  });
  let max = 0;
  for (const item of existing) {
    const parts = item.itemCode.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ─── Audit Log Helper ─────────────────────────────────────────────────────────

async function addAuditLog(
  userId: string,
  action: string,
  entityType: 'ITEM' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'RETURN' | 'APPROVAL',
  entityId: string,
  details: string,
  ifmisSlipNumber?: string,
  previousState?: any,
  newState?: any,
) {
  const user = userId ? await prisma.employee.findUnique({ where: { id: userId } }) : null;
  const dateInfo = getTodayGcAndEc();
  await prisma.auditLog.create({
    data: {
      timestampGc: `${dateInfo.gc} ${new Date().toLocaleTimeString('en-US', { hour12: false })}`,
      timestampEc: `${dateInfo.ec} ${new Date().toLocaleTimeString('en-US', { hour12: false })}`,
      userId,
      userName: user ? user.fullNameEn : 'System',
      userRole: (user?.role ?? 'DATA_ENCODER') as any,
      action,
      entityType: entityType as any,
      entityId,
      ifmisSlipNumber,
      details,
      previousState: previousState ?? undefined,
      newState: newState ?? undefined,
    },
  });
}

// ─── StoreService ─────────────────────────────────────────────────────────────

export class StoreService {
  private static instance: StoreService;

  private constructor() {}

  public static getInstance(): StoreService {
    if (!StoreService.instance) {
      StoreService.instance = new StoreService();
    }
    return StoreService.instance;
  }

  // ── Item Queries ────────────────────────────────────────────────────────

  public async getItems(filter?: {
    status?: ItemStatus;
    category?: AssetCategory;
    departmentId?: string;
    locationId?: string;
    search?: string;
  }): Promise<ItemWithRelations[]> {
    const where: any = {};

    if (filter?.status) where.status = filter.status;
    if (filter?.category) where.category = filter.category;
    if (filter?.departmentId) where.assignedDepartmentId = filter.departmentId;
    if (filter?.locationId) where.storeLocationId = filter.locationId;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { itemCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { ifmisSlipNumber: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: ITEM_INCLUDES,
      orderBy: { createdAt: 'desc' },
    });

    return items.map(mapItem);
  }

  public async getItemById(id: string): Promise<ItemWithRelations | null> {
    const item = await prisma.item.findFirst({
      where: {
        OR: [
          { id },
          { itemCode: { equals: id, mode: 'insensitive' } },
          { serialNumber: { equals: id, mode: 'insensitive' } },
        ],
      },
      include: ITEM_INCLUDES,
    });
    return item ? mapItem(item) : null;
  }

  // ── Stock-In Registration ───────────────────────────────────────────────

  public async registerStockIn(
    payload: CreateStockInRequest,
  ): Promise<{ item: ItemWithRelations; items?: ItemWithRelations[]; approval?: TransactionApproval }> {
    if (!payload.ifmisSlipNumber.trim()) {
      throw new Error('IFMIS Slip Number is always mandatory.');
    }
    if (!payload.isHistoricalData && !payload.ifmisSlipAttachmentUrl) {
      throw new Error('A scanned IFMIS slip attachment is required for new (non-historical) registrations.');
    }

    const today = getTodayGcAndEc();
    const currentYear = new Date().getFullYear();
    const initialStatus = payload.isHistoricalData ? ItemStatus.AVAILABLE : ItemStatus.PENDING_STOCK_IN;
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const rawItems = (payload.items && payload.items.length > 0)
      ? payload.items
      : [{
          name: payload.name,
          category: payload.category,
          serialNumber: payload.serialNumber,
          unitCostETB: payload.unitCostETB,
          condition: payload.condition,
          itemCode: payload.itemCode,
          uom: payload.uom,
          subInventory: payload.subInventory,
          itemCategoryDisplay: payload.itemCategoryDisplay,
          lotBatchNo: payload.lotBatchNo,
          printedPadFrom: payload.printedPadFrom,
          printedPadTo: payload.printedPadTo,
          quantity: payload.quantity || 1,
          totalAmount: payload.totalAmount || (payload.unitCostETB * (payload.quantity || 1)),
          remark: payload.remark,
        }];

    const createdItems: ItemWithRelations[] = [];
    let primaryApproval: TransactionApproval | undefined;

    for (let i = 0; i < rawItems.length; i++) {
      const lineItem = rawItems[i];
      const category = (lineItem.category || payload.category || AssetCategory.IT_EQUIPMENT) as AssetCategory;
      const itemCode = lineItem.itemCode?.trim() || await generateItemCode(category, currentYear);
      const serialNumber = lineItem.serialNumber || (rawItems.length > 1 ? `SN-${Date.now()}-${i + 1}` : `SN-${Date.now()}`);
      const unitCost = Number(lineItem.unitCostETB) || 0;
      const quantity = Number(lineItem.quantity) || 1;
      const totalAmount = Number(lineItem.totalAmount) || (unitCost * quantity);

      const model19Meta = {
        poNumber: payload.poNumber,
        transactionType: payload.transactionType || 'PO Receipt',
        source: payload.source,
        buyer: payload.buyer,
        programName: payload.programName || 'MoA-Program to Build Resilience for Food and Nutrition Security in the Horn of Africa',
        uom: lineItem.uom || payload.uom || 'EA',
        subInventory: lineItem.subInventory || payload.subInventory,
        itemCategoryDisplay: lineItem.itemCategoryDisplay || payload.itemCategoryDisplay,
        lotBatchNo: lineItem.lotBatchNo || payload.lotBatchNo,
        printedPadFrom: lineItem.printedPadFrom || payload.printedPadFrom,
        printedPadTo: lineItem.printedPadTo || payload.printedPadTo,
        quantity,
        totalAmount,
        deliveredBy: payload.deliveredBy,
        receivedBy: payload.receivedBy || (user ? user.fullNameEn : undefined),
        remark: lineItem.remark || payload.remark,
        userNotes: payload.notes,
      };

      const newItem = await prisma.item.create({
        data: {
          itemCode,
          name: lineItem.name || payload.name,
          category: category as any,
          serialNumber,
          unitCostETB: unitCost,
          status: initialStatus as any,
          storeLocationId: payload.storeLocationId,
          ifmisSlipNumber: payload.ifmisSlipNumber,
          ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
          ifmisSlipDateEc: slipDateEc,
          ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl || '/slips/sample-ifmis-slip.png',
          isHistoricalData: payload.isHistoricalData || false,
          registeredById: payload.registeredById,
          createdAtGc: today.gc,
          createdAtEc: today.ec,
          notes: JSON.stringify(model19Meta),
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: payload.isHistoricalData ? 'HISTORICAL_STOCK_IN' : 'STOCK_IN_REGISTERED',
              fromEntity: `IFMIS Slip ${payload.ifmisSlipNumber}`,
              toEntity: payload.isHistoricalData ? 'Central Store (Available)' : 'Store (Pending Approval)',
              performedBy: user ? user.fullNameEn : payload.registeredById,
              performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: payload.ifmisSlipNumber,
              notes: lineItem.remark || payload.notes || 'Registered in mirror system from IFMIS Model 19 slip',
            },
          },
        },
        include: ITEM_INCLUDES,
      });

      if (!payload.isHistoricalData) {
        const createdApproval = await prisma.transactionApproval.create({
          data: {
            transactionType: 'STOCK_IN' as any,
            itemId: newItem.id,
            itemCode: newItem.itemCode,
            itemName: newItem.name,
            ifmisSlipNumber: payload.ifmisSlipNumber,
            ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
            ifmisSlipDateEc: slipDateEc,
            ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl,
            requestedById: payload.registeredById,
            purposeOrRemarks: lineItem.remark || payload.notes || `Stock-in inbound receipt (Model 19 #${payload.ifmisSlipNumber})`,
            status: 'PENDING' as any,
            createdAtGc: today.gc,
            createdAtEc: today.ec,
          },
        });
        if (!primaryApproval) {
          primaryApproval = mapApproval(createdApproval);
        }
      }

      await addAuditLog(
        payload.registeredById,
        payload.isHistoricalData ? 'REGISTER_HISTORICAL_ITEM' : 'REGISTER_STOCK_IN',
        'STOCK_IN',
        newItem.id,
        `Item ${newItem.itemCode} (${newItem.name}) registered via IFMIS Model 19 slip ${newItem.ifmisSlipNumber}`,
        newItem.ifmisSlipNumber,
      );

      createdItems.push(mapItem(newItem));
    }

    return { item: createdItems[0], items: createdItems, approval: primaryApproval };
  }

  // ── Stock-Out Registration ──────────────────────────────────────────────

  public async registerStockOut(payload: CreateStockOutRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new Error(`Item ${payload.itemId} not found.`);
    if (item.status !== 'AVAILABLE') {
      throw new Error(`Item ${item.itemCode} must be AVAILABLE to register Stock-Out. Current: ${item.status}`);
    }
    if (!payload.ifmisSlipNumber.trim()) throw new Error('IFMIS Slip Number is mandatory for Stock-Out.');

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const recipient = payload.recipientEmployeeId ? await prisma.employee.findUnique({ where: { id: payload.recipientEmployeeId } }) : null;
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const notesText = payload.remark
      ? `${payload.purpose} (Remark: ${payload.remark})`
      : payload.purpose;

    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: 'PENDING_STOCK_OUT' as any,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'STOCK_OUT_REQUESTED',
            fromEntity: 'Central Store (Available)',
            toEntity: recipient ? `${recipient.fullNameEn} (Pending Approval)` : 'Pending Staff Custodian',
            performedBy: user ? user.fullNameEn : payload.registeredById,
            performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
            ifmisSlipNumber: payload.ifmisSlipNumber,
            notes: notesText,
          },
        },
      },
    });

    const approval = await prisma.transactionApproval.create({
      data: {
        transactionType: 'STOCK_OUT' as any,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        ifmisSlipNumber: payload.ifmisSlipNumber,
        ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
        ifmisSlipDateEc: slipDateEc,
        ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl,
        requestedById: payload.registeredById,
        recipientEmployeeId: payload.recipientEmployeeId,
        targetDepartmentId: payload.targetDepartmentId,
        purposeOrRemarks: notesText,
        status: 'PENDING' as any,
        createdAtGc: today.gc,
        createdAtEc: today.ec,
      },
    });

    await addAuditLog(
      payload.registeredById,
      'REGISTER_STOCK_OUT',
      'STOCK_OUT',
      item.id,
      `Stock-Out requested for ${item.itemCode} to ${recipient?.fullNameEn || 'Staff'}. IFMIS: ${payload.ifmisSlipNumber}`,
      payload.ifmisSlipNumber,
    );

    return mapApproval(approval);
  }

  // ── Model 22 Return to Store ─────────────────────────────────────────────

  public async registerReturn(payload: CreateReturnRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new Error(`Item ${payload.itemId} not found.`);
    if (item.status !== 'ISSUED' && item.status !== 'AVAILABLE') {
      throw new Error(`Item ${item.itemCode} cannot be returned to store. Current status: ${item.status}`);
    }
    const pendingApproval = await prisma.transactionApproval.findFirst({
      where: { itemId: item.id, status: 'PENDING' },
    });
    if (pendingApproval) {
      throw new Error(`Item ${item.itemCode} already has a pending ${pendingApproval.transactionType} approval (${pendingApproval.ifmisSlipNumber}).`);
    }
    if (!payload.ifmisSlipNumber.trim()) throw new Error('IFMIS Return Slip Number (Model 22) is mandatory.');

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    await prisma.item.update({
      where: { id: item.id },
      data: {
        condition: payload.condition as any,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'RETURN_REQUESTED',
            fromEntity: 'Staff Custodian (Issued)',
            toEntity: 'Central Store (Pending Return Approval)',
            performedBy: user ? user.fullNameEn : payload.registeredById,
            performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
            ifmisSlipNumber: payload.ifmisSlipNumber,
            notes: `Return Reason: ${payload.returnReason}. Condition: ${payload.condition}`,
          },
        },
      },
    });

    const approval = await prisma.transactionApproval.create({
      data: {
        transactionType: 'RETURN' as any,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        ifmisSlipNumber: payload.ifmisSlipNumber,
        ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
        ifmisSlipDateEc: slipDateEc,
        ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl,
        requestedById: payload.registeredById,
        recipientEmployeeId: payload.returningEmployeeId || item.currentCustodianId || undefined,
        purposeOrRemarks: `[Model 22 Return - Condition: ${payload.condition}] ${payload.returnReason}`,
        status: 'PENDING' as any,
        createdAtGc: today.gc,
        createdAtEc: today.ec,
      },
    });

    await addAuditLog(
      payload.registeredById,
      'REGISTER_RETURN',
      'RETURN',
      item.id,
      `Model 22 Return requested for ${item.itemCode}. Condition: ${payload.condition}. IFMIS: ${payload.ifmisSlipNumber}`,
      payload.ifmisSlipNumber,
    );

    return mapApproval(approval);
  }

  // ── Approval Handling ───────────────────────────────────────────────────

  public async handleApproval(payload: ApprovalActionRequest): Promise<TransactionApproval> {
    const approval = await prisma.transactionApproval.findUnique({ where: { id: payload.approvalId } });
    if (!approval) throw new Error(`Approval record ${payload.approvalId} not found.`);
    if (approval.status !== 'PENDING') throw new Error(`This transaction is already ${approval.status}.`);

    const today = getTodayGcAndEc();
    const reviewer = payload.reviewedById ? await prisma.employee.findUnique({ where: { id: payload.reviewedById } }) : null;
    const reviewerName = reviewer ? `${reviewer.fullNameEn} (${reviewer.role})` : 'Reviewer';

    // ── STAGE 1 ACTION: ENDORSE (Team Leader) ──────────────────────────────
    if (payload.action === 'ENDORSE') {
      if (approval.currentStage !== 1) {
        throw new Error(`Transaction ${approval.itemCode} has already completed Stage 1 endorsement.`);
      }

      const updatedApproval = await prisma.transactionApproval.update({
        where: { id: payload.approvalId },
        data: {
          currentStage: 2, // Advance to Stage 2 Department Head Final Approval
          endorsedById: payload.reviewedById,
          endorsementRemarks: payload.reviewRemarks || 'Endorsed by Team Leader (Stage 1)',
          endorsedAtGc: today.gc,
          endorsedAtEc: today.ec,
        },
        include: APPROVAL_INCLUDES,
      });

      await prisma.item.update({
        where: { id: approval.itemId },
        data: {
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: `STAGE_1_ENDORSED_${approval.transactionType}`,
              fromEntity: 'Team Leader Review',
              toEntity: 'Directorate Head Authorization (Stage 2)',
              performedBy: reviewerName,
              performedByRole: (reviewer ? reviewer.role : 'TEAM_LEADER') as any,
              ifmisSlipNumber: approval.ifmisSlipNumber,
              notes: payload.reviewRemarks || 'Stage 1 Endorsement granted by Team Leader',
            },
          },
        },
      });

      await addAuditLog(
        payload.reviewedById,
        `ENDORSE_${approval.transactionType}`,
        'APPROVAL',
        approval.itemId,
        `${approval.transactionType} ENDORSED by Team Leader ${reviewerName} for item ${approval.itemCode}. Advanced to Stage 2 Dept Head Approval. Remarks: ${updatedApproval.endorsementRemarks}`,
        approval.ifmisSlipNumber,
      );

      return mapApproval(updatedApproval);
    }

    // ── STAGE 2 ACTION: APPROVE / REJECT (Dept Head / Admin) ──────────────
    const isApprove = payload.action === 'APPROVE';
    if (isApprove && approval.currentStage === 1) {
      throw new Error(`Transaction ${approval.itemCode} must be endorsed by a Team Leader (Stage 1) before final approval can be granted.`);
    }

    const item = await prisma.item.findUnique({ where: { id: approval.itemId } });
    if (!item) throw new Error(`Target item ${approval.itemId} not found.`);

    const newStatus = isApprove ? 'APPROVED' : 'REJECTED';

    // Update approval record
    const updatedApproval = await prisma.transactionApproval.update({
      where: { id: payload.approvalId },
      data: {
        status: newStatus as any,
        reviewedById: payload.reviewedById,
        reviewRemarks: payload.reviewRemarks || (isApprove ? 'Approved by Department Head (Stage 2)' : 'Rejected'),
        reviewedAtGc: today.gc,
        reviewedAtEc: today.ec,
      },
      include: APPROVAL_INCLUDES,
    });

    // Determine new item status and history entry
    let newItemStatus: string;
    let historyAction: string;
    let fromEntity: string;
    let toEntity: string;
    let histNote: string;
    let custodianId: string | null = item.currentCustodianId;
    let departmentId: string | null = item.assignedDepartmentId;
    let approvedById: string | null = item.approvedById;

    if (isApprove) {
      if (approval.transactionType === 'STOCK_IN') {
        newItemStatus = 'AVAILABLE';
        historyAction = 'STOCK_IN_APPROVED';
        fromEntity = 'Pending Approval';
        toEntity = 'Central Store (AVAILABLE)';
        histNote = payload.reviewRemarks || 'Stock-in approved. Item available for issuance.';
        approvedById = payload.reviewedById;
      } else if (approval.transactionType === 'RETURN') {
        newItemStatus = 'AVAILABLE';
        historyAction = 'RETURN_APPROVED';
        fromEntity = 'Staff Custodian (Issued)';
        toEntity = 'Central Store (AVAILABLE)';
        histNote = payload.reviewRemarks || 'Model 22 Return approved. Item returned to Central Store (AVAILABLE).';
        custodianId = null;
        departmentId = null;
        approvedById = payload.reviewedById;
      } else {
        newItemStatus = 'ISSUED';
        historyAction = 'STOCK_OUT_APPROVED';
        fromEntity = 'Central Store';
        const recipient = approval.recipientEmployeeId
          ? await prisma.employee.findUnique({ where: { id: approval.recipientEmployeeId } })
          : null;
        toEntity = recipient ? recipient.fullNameEn : 'Assigned Custodian';
        histNote = `Stock-out authorized for: ${approval.purposeOrRemarks}`;
        custodianId = approval.recipientEmployeeId ?? null;
        departmentId = approval.targetDepartmentId ?? null;
        approvedById = payload.reviewedById;
      }
    } else {
      if (approval.transactionType === 'STOCK_IN') {
        newItemStatus = 'DISPOSED';
        historyAction = 'STOCK_IN_REJECTED';
        fromEntity = 'Pending Approval';
        toEntity = 'Rejected / Returned to Supplier';
        histNote = payload.reviewRemarks || 'Rejected by Department Head';
      } else if (approval.transactionType === 'RETURN') {
        newItemStatus = 'ISSUED';
        historyAction = 'RETURN_REJECTED';
        fromEntity = 'Pending Return';
        toEntity = 'Staff Custodian (Retained)';
        histNote = payload.reviewRemarks || 'Model 22 Return request rejected by Department Head';
      } else {
        newItemStatus = 'AVAILABLE';
        historyAction = 'STOCK_OUT_REJECTED';
        fromEntity = 'Pending Stock-Out';
        toEntity = 'Central Store (AVAILABLE)';
        histNote = payload.reviewRemarks || 'Stock-out request rejected by Department Head';
      }
    }

    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: newItemStatus as any,
        currentCustodianId: custodianId,
        assignedDepartmentId: departmentId,
        approvedById,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: historyAction,
            fromEntity,
            toEntity,
            performedBy: reviewerName,
            performedByRole: (reviewer ? reviewer.role : 'DEPARTMENT_HEAD') as any,
            approvedBy: reviewerName,
            ifmisSlipNumber: approval.ifmisSlipNumber,
            notes: histNote,
          },
        },
      },
    });

    await addAuditLog(
      payload.reviewedById,
      isApprove ? `APPROVE_${approval.transactionType}` : `REJECT_${approval.transactionType}`,
      'APPROVAL',
      item.id,
      `${approval.transactionType} ${payload.action}D by ${reviewerName} for item ${item.itemCode}. Remarks: ${updatedApproval.reviewRemarks}`,
      approval.ifmisSlipNumber,
    );

    return mapApproval(updatedApproval);
  }

  // ── Transfer ────────────────────────────────────────────────────────────

  public async transferItem(payload: CreateTransferRequest): Promise<ItemWithRelations> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new Error(`Item ${payload.itemId} not found.`);
    if (item.status === 'DISPOSED') {
      throw new Error(`Item ${item.itemCode} is DISPOSED and cannot be transferred.`);
    }
    if (item.status === 'PENDING_STOCK_IN') {
      throw new Error(`Item ${item.itemCode} is pending Stock-In approval and cannot be transferred.`);
    }
    if (item.status === 'PENDING_STOCK_OUT') {
      throw new Error(`Item ${item.itemCode} is pending Stock-Out approval and cannot be transferred.`);
    }

    const today = getTodayGcAndEc();
    const prevCustodian = item.currentCustodianId
      ? (await prisma.employee.findUnique({ where: { id: item.currentCustodianId } }))?.fullNameEn
      : 'None';
    const newCustodian = payload.toEmployeeId
      ? (await prisma.employee.findUnique({ where: { id: payload.toEmployeeId } }))?.fullNameEn
      : prevCustodian;
    const performer = payload.performedById ? await prisma.employee.findUnique({ where: { id: payload.performedById } }) : null;

    const updated = await prisma.item.update({
      where: { id: item.id },
      data: {
        currentCustodianId: payload.toEmployeeId ?? item.currentCustodianId,
        assignedDepartmentId: payload.toDepartmentId ?? item.assignedDepartmentId,
        storeLocationId: payload.toLocationId ?? item.storeLocationId,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'ITEM_TRANSFERRED',
            fromEntity: prevCustodian || 'Store',
            toEntity: newCustodian || 'New Location',
            performedBy: performer ? performer.fullNameEn : payload.performedById,
            performedByRole: (performer?.role ?? 'DATA_ENCODER') as any,
            notes: payload.reason,
          },
        },
      },
      include: ITEM_INCLUDES,
    });

    await addAuditLog(
      payload.performedById,
      'TRANSFER_ITEM',
      'TRANSFER',
      item.id,
      `Item ${item.itemCode} transferred from ${prevCustodian} to ${newCustodian}. Reason: ${payload.reason}`,
    );

    return mapItem(updated);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  public async getApprovals(status?: ApprovalStatus): Promise<TransactionApproval[]> {
    const where: any = status ? { status } : {};
    const rows = await prisma.transactionApproval.findMany({
      where,
      include: APPROVAL_INCLUDES,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapApproval);
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      timestampGc: r.timestampGc,
      timestampEc: r.timestampEc,
      userId: r.userId,
      userName: r.userName,
      userRole: r.userRole as UserRole,
      action: r.action,
      entityType: r.entityType as any,
      entityId: r.entityId,
      ifmisSlipNumber: r.ifmisSlipNumber ?? undefined,
      details: r.details,
      previousState: r.previousState ?? undefined,
      newState: r.newState ?? undefined,
    }));
  }

  public async getDepartments(): Promise<Department[]> {
    const rows = await prisma.department.findMany({ orderBy: { code: 'asc' } });
    return rows.map((d) => ({
      id: d.id,
      code: d.code,
      nameEn: d.nameEn,
      nameAm: d.nameAm,
      headEmployeeId: d.headEmployeeId ?? undefined,
    }));
  }

  public async getLocations(): Promise<Location[]> {
    const rows = await prisma.location.findMany({ orderBy: { siteName: 'asc' } });
    return rows.map((l) => ({
      id: l.id,
      siteName: l.siteName,
      building: l.building,
      roomNumber: l.roomNumber,
      isCentralStore: l.isCentralStore,
    }));
  }

  public async getEmployees(departmentId?: string): Promise<Employee[]> {
    const where: any = departmentId ? { departmentId } : {};
    const rows = await prisma.employee.findMany({ where, orderBy: { fullNameEn: 'asc' } });
    return rows.map(mapEmployee);
  }

  public async updateEmployeeRole(id: string, role: UserRole, actorId?: string): Promise<Employee> {
    const prev = await prisma.employee.findUnique({ where: { id } });
    const updated = await prisma.employee.update({
      where: { id },
      data: { role: role as any },
    });
    if (actorId) {
      await addAuditLog(
        actorId,
        'UPDATE_STAFF_ROLE',
        'APPROVAL',
        id,
        `Role for ${prev?.fullNameEn || id} updated from ${prev?.role || 'N/A'} to ${role}`
      );
    }
    return mapEmployee(updated);
  }

  // ── Executive Dashboard ─────────────────────────────────────────────────

  public async getExecutiveDashboard() {
    const [allItemsRaw, departments, locations, pendingApprovals, recentLogs] = await Promise.all([
      prisma.item.findMany({
        include: ITEM_INCLUDES,
        orderBy: { unitCostETB: 'desc' },
      }),
      prisma.department.findMany({ orderBy: { code: 'asc' } }),
      prisma.location.findMany({ orderBy: { siteName: 'asc' } }),
      prisma.transactionApproval.count({ where: { status: 'PENDING' } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);

    const allItems = allItemsRaw.map(mapItem);

    const available = allItems.filter((i) => i.status === 'AVAILABLE');
    const issued = allItems.filter((i) => i.status === 'ISSUED');
    const pendingIn = allItems.filter((i) => i.status === 'PENDING_STOCK_IN');
    const pendingOut = allItems.filter((i) => i.status === 'PENDING_STOCK_OUT');
    const active = allItems.filter((i) => i.status !== 'DISPOSED');

    const sum = (arr: typeof allItems) => arr.reduce((s, i) => s + (i.unitCostETB || 0), 0);

    const departmentDistribution = departments.map((dept) => {
      const deptItems = allItems.filter((i) => i.assignedDepartmentId === dept.id);
      return {
        departmentId: dept.id,
        departmentCode: dept.code,
        nameEn: dept.nameEn,
        nameAm: dept.nameAm,
        itemCount: deptItems.length,
        totalValueETB: sum(deptItems),
        availableCount: deptItems.filter((i) => i.status === 'AVAILABLE').length,
        issuedCount: deptItems.filter((i) => i.status === 'ISSUED').length,
        otherStatusCount: deptItems.filter((i) => !['AVAILABLE', 'ISSUED'].includes(i.status)).length,
        items: deptItems,
      };
    });

    const unassignedItems = allItems.filter((i) => !i.assignedDepartmentId);

    const conditionDistribution = ['NEW', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((cond) => {
      const matching = allItems.filter((i) => i.condition === cond);
      return {
        condition: cond,
        count: matching.length,
        totalValueETB: sum(matching),
      };
    });

    const locationUtilization = locations.map((loc) => {
      const locItems = allItems.filter((i) => i.storeLocationId === loc.id);
      return {
        id: loc.id,
        siteName: loc.siteName,
        building: loc.building,
        roomNumber: loc.roomNumber,
        isCentralStore: loc.isCentralStore,
        itemCount: locItems.length,
        totalValueETB: sum(locItems),
      };
    });

    const categoryBreakdown = Object.values(AssetCategory).map((cat) => {
      const matching = allItems.filter((i) => i.category === cat);
      return { category: cat, count: matching.length, totalValueETB: sum(matching) };
    });

    const topValuationAssets = allItems
      .slice()
      .sort((a, b) => (b.unitCostETB || 0) - (a.unitCostETB || 0))
      .slice(0, 8);

    return {
      totalItems: allItems.length,
      availableCount: available.length,
      availableValuationETB: sum(available),
      issuedCount: issued.length,
      issuedValuationETB: sum(issued),
      pendingStockInCount: pendingIn.length,
      pendingStockOutCount: pendingOut.length,
      pendingApprovalsCount: pendingApprovals,
      totalValuationETB: sum(active),
      unassignedItemsCount: unassignedItems.length,
      unassignedValuationETB: sum(unassignedItems),
      unassignedItems,
      departmentDistribution,
      conditionDistribution,
      locationUtilization,
      categoryBreakdown,
      topValuationAssets,
      recentAuditLogs: recentLogs.map((r) => ({
        id: r.id,
        timestampGc: r.timestampGc,
        timestampEc: r.timestampEc,
        userId: r.userId,
        userName: r.userName,
        userRole: r.userRole as UserRole,
        action: r.action,
        entityType: r.entityType as any,
        entityId: r.entityId,
        ifmisSlipNumber: r.ifmisSlipNumber ?? undefined,
        details: r.details,
      })),
      today: getTodayGcAndEc(),
    };
  }
}
