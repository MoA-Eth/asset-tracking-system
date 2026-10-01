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
  UpdateStockInRequest,
  UpdateStockOutRequest,
  CreateStockOutRequest,
  CreateTransferRequest,
  CreateReturnRequest,
  UpdateTransferRequest,
  UpdateReturnRequest,
  Model21RequestDetails,
  Model21Accessory,
  ItemBalance,
  ApprovalActionRequest,
} from '../types/asset-management';
import { prisma } from '../lib/prisma';
import { getTodayGcAndEc, formatGcToEc } from '../utils/eth-date';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '../errors/app-error';

import { assignEmployeeRole } from './roles.service';
import { hasPermission } from '../security/role-policy';

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
    parentItemId: raw.parentItemId ?? undefined,
    notes: (model19Meta.userNotes || (typeof model19Meta === 'object' && Object.keys(model19Meta).length > 0 ? (model19Meta.remark || raw.notes) : raw.notes)) || undefined,
    registeredById: raw.registeredById,
    approvedById: raw.approvedById ?? undefined,
    createdAtGc: raw.createdAtGc,
    createdAtEc: raw.createdAtEc,
    storeLocation: raw.storeLocation ?? undefined,
    // Map employees explicitly so stored credentials never leave the API
    currentCustodian: raw.currentCustodian ? mapEmployee(raw.currentCustodian) : null,
    assignedDepartment: raw.assignedDepartment ?? null,
    registeredBy: raw.registeredBy ? mapEmployee(raw.registeredBy) : undefined,
    approvedBy: raw.approvedBy ? mapEmployee(raw.approvedBy) : undefined,

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
  // Quantity lives in the item's Model 19 details
  item: { select: { notes: true } },
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
    targetLocationId: raw.targetLocationId ?? undefined,
    purposeOrRemarks: raw.purposeOrRemarks,
    requestDetails: requestDetailsOf(raw),
    itemUnits: raw.item ? quantityOf(raw.item) : undefined,
    itemUom: raw.item ? uomOf(raw.item) : undefined,
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

const RETURN_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'];

/** Transfer summary shown to approvers, e.g. "Reassignment | [Model/21 # 0004386] | Book: MOA MC BOOK" */
function formatTransferNotes(slipNo: string, d: Model21RequestDetails): string {
  return [
    d.reason,
    `[Model/21 # ${slipNo}]`,
    d.book ? `Book: ${d.book}` : '',
    d.chassisNumber ? `Chassis: ${d.chassisNumber}` : '',
    d.plateNo ? `Plate: ${d.plateNo}` : '',
    d.engineNo ? `Engine: ${d.engineNo}` : '',
    d.remark ? `Remark: ${d.remark}` : '',
  ].filter(Boolean).join(' | ');
}

/** Return summary shown to approvers, e.g. "Return Reason: … | Condition: GOOD | [Model/21 # …]" */
function formatReturnNotes(slipNo: string, d: Model21RequestDetails): string {
  return [
    `Return Reason: ${d.reason}`,
    `Condition: ${d.condition}`,
    slipNo ? `[Model/21 # ${slipNo}]` : '',
    d.book ? `Book: ${d.book}` : '',
    d.chassisNumber ? `Chassis: ${d.chassisNumber}` : '',
    d.plateNo ? `Plate: ${d.plateNo}` : '',
    d.engineNo ? `Engine: ${d.engineNo}` : '',
    d.remark ? `Defects: ${d.remark}` : '',
  ].filter(Boolean).join(' | ');
}

/**
 * Requests made before requestDetails existed only kept the joined summary text,
 * so read the particulars back out of it.
 */
function parseLegacyModel21Notes(type: string, text: string): Model21RequestDetails {
  const body = type === 'TRANSFER' ? text.replace(/^Transfer from .*? to .*?\. /, '') : text;
  const prefixes: [string, keyof Model21RequestDetails][] = [
    ['Return Reason: ', 'reason'],
    ['Condition: ', 'condition'],
    ['Book: ', 'book'],
    ['Chassis: ', 'chassisNumber'],
    ['Plate: ', 'plateNo'],
    ['Engine: ', 'engineNo'],
    ['Remark: ', 'remark'],
    ['Defects: ', 'remark'],
  ];
  const details: Record<string, string> = {};
  body.split(' | ').forEach((part, index) => {
    const match = prefixes.find(([prefix]) => part.startsWith(prefix));
    if (match) details[match[1]] = part.slice(match[0].length);
    else if (index === 0 && type === 'TRANSFER' && !part.startsWith('[Model/21 #')) details.reason = part;
  });
  return details as Model21RequestDetails;
}

function requestDetailsOf(raw: any): Model21RequestDetails | undefined {
  if (raw.requestDetails) return raw.requestDetails as Model21RequestDetails;
  if (raw.transactionType === 'TRANSFER' || raw.transactionType === 'RETURN') {
    return parseLegacyModel21Notes(raw.transactionType, raw.purposeOrRemarks || '');
  }
  return undefined;
}

const formatAccessories = (list?: Model21Accessory[]): string | undefined =>
  list && list.length ? list.map((a) => `${a.name} ×${a.quantity}`).join(', ') : undefined;

/** "field old → new" for every value that changed, comparing two labelled snapshots */
function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));
  return Object.keys(after)
    .filter((key) => show(before[key]) !== show(after[key]))
    .map((key) => `${key} ${show(before[key])} → ${show(after[key])}`);
}

/** Stock-Out purpose and remark share one column: "purpose (Remark: remark)" */
function formatStockOutNotes(purpose: string, remark?: string): string {
  return remark ? `${purpose} (Remark: ${remark})` : purpose;
}

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

// ─── Workflow Guards ──────────────────────────────────────────────────────────

/** An item may only have one open request at a time (stock-out, return or transfer). */
/** Model 19 details are kept as JSON in item.notes; older items may hold plain text there */
function readItemMeta(notes: string | null | undefined): Record<string, any> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : { userNotes: notes };
  } catch {
    return { userNotes: notes };
  }
}

/** Units held by one item record */
function quantityOf(item: { notes?: string | null }): number {
  const quantity = Number(readItemMeta(item.notes).quantity);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

function uomOf(item: { notes?: string | null }): string {
  return readItemMeta(item.notes).uom || 'EA';
}

/** item.notes with a new quantity (and the matching line total) */
function notesWithQuantity(notes: string | null | undefined, quantity: number, unitCost: number): string {
  return JSON.stringify({ ...readItemMeta(notes), quantity, totalAmount: unitCost * quantity });
}

/** Units still in store: available, or requested by a Stock-Out that isn't approved yet */
const IN_STORE_STATUSES = ['AVAILABLE', 'PENDING_STOCK_OUT'];
/** Units with a custodian: issued, or being transferred to someone else */
const WITH_CUSTODIAN_STATUSES = ['ISSUED', 'UNDER_TRANSFER'];

/** Items should be distributed within this many days of arriving in store */
export const STALE_IN_STORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date a record's units arrived in store: the latest approved return if it came back,
 * otherwise the Model 19 receiving date (when the goods physically arrived).
 */
function inStoreSince(item: { history?: { action: string; dateGc: string }[]; ifmisSlipDateGc?: string; createdAtGc?: string }): string | undefined {
  const returned = (item.history ?? [])
    .filter((h) => h.action === 'RETURN_APPROVED')
    .map((h) => h.dateGc)
    .sort();
  return returned[returned.length - 1] ?? item.ifmisSlipDateGc ?? item.createdAtGc;
}

/** Adds up units by where they are: in store, with a custodian, or awaiting registration approval */
function computeBalance(records: { status: string; notes?: string | null }[]): ItemBalance {
  const balance: ItemBalance = { total: 0, issued: 0, available: 0, pending: 0 };
  for (const record of records) {
    const units = quantityOf(record);
    if (IN_STORE_STATUSES.includes(record.status)) balance.available += units;
    else if (WITH_CUSTODIAN_STATUSES.includes(record.status)) balance.issued += units;
    else if (record.status === 'PENDING_STOCK_IN') balance.pending += units;
    else continue; // disposed units are not part of the balance
    balance.total += units;
  }
  return balance;
}

/** A registration's balance covers the records split off it; a split-off record reports only itself */
async function attachBalances(items: ItemWithRelations[], rawItems: any[]): Promise<ItemWithRelations[]> {
  const rootIds = rawItems.filter((raw) => !raw.parentItemId).map((raw) => raw.id);
  const splits = rootIds.length
    ? await prisma.item.findMany({
        where: { parentItemId: { in: rootIds } },
        select: { parentItemId: true, status: true, notes: true },
      })
    : [];
  return items.map((item, index) => {
    const raw = rawItems[index];
    const records = raw.parentItemId ? [raw] : [raw, ...splits.filter((split) => split.parentItemId === raw.id)];
    return { ...item, balance: computeBalance(records) };
  });
}

async function assertNoPendingApproval(item: { id: string; itemCode: string }) {
  const pending = await prisma.transactionApproval.findFirst({
    where: { itemId: item.id, status: 'PENDING' },
  });
  if (pending) {
    throw new Error(`Item ${item.itemCode} already has a pending ${pending.transactionType} approval (${pending.ifmisSlipNumber}).`);
  }
}

/** Resting status for an item once no request is in flight. */
function statusForCustodian(custodianId: string | null): 'ISSUED' | 'AVAILABLE' {
  return custodianId ? 'ISSUED' : 'AVAILABLE';
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

    return attachBalances(items.map(mapItem), items);
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
    if (!item) return null;
    const [withBalance] = await attachBalances([mapItem(item)], [item]);
    return withBalance;
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
    // Every registration, historical or not, waits for Stage 1/2 approval before becoming AVAILABLE.
    // isHistoricalData only waives the slip attachment requirement above.
    const initialStatus = ItemStatus.PENDING_STOCK_IN;
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
          ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl || null,
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
              toEntity: 'Store (Pending Approval)',
              performedBy: user ? user.fullNameEn : payload.registeredById,
              performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: payload.ifmisSlipNumber,
              notes: lineItem.remark || payload.notes || 'Registered in mirror system from IFMIS Model 19 slip',
            },
          },
        },
        include: ITEM_INCLUDES,
      });

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

  // ── Stock-In Correction (before Stage 1 endorsement) ────────────────────

  public async updateStockIn(itemId: string, payload: UpdateStockInRequest, actorId: string): Promise<ItemWithRelations> {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError(`Item ${itemId} not found.`);

    const approval = await prisma.transactionApproval.findFirst({
      where: { itemId, transactionType: 'STOCK_IN', status: 'PENDING' },
    });
    // Once the Team Leader has endorsed (or the request is decided) the registration is locked
    if (item.status !== 'PENDING_STOCK_IN' || !approval || approval.currentStage !== 1) {
      throw new ConflictError(
        `Item ${item.itemCode} can only be edited while it is waiting for Team Leader endorsement. Ask an approver to reject it and register it again.`
      );
    }

    const slipNo = (payload.ifmisSlipNumber || '').trim();
    const name = (payload.name || '').trim();
    const unitCost = Number(payload.unitCostETB);
    const quantity = Number(payload.quantity ?? 1);
    if (!slipNo) throw new BadRequestError('IFMIS Slip Number is always mandatory.');
    if (!name) throw new BadRequestError('Item description is required.');
    if (!payload.storeLocationId) throw new BadRequestError('Receiving store is required.');
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestError('Unit price cannot be negative.');
    if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestError('Quantity must be at least 1.');

    const attachmentUrl = payload.ifmisSlipAttachmentUrl || item.ifmisSlipAttachmentUrl;
    if (!item.isHistoricalData && !attachmentUrl) {
      throw new BadRequestError('A scanned IFMIS slip attachment is required for new (non-historical) registrations.');
    }

    let previousMeta: any = {};
    try {
      previousMeta = item.notes ? JSON.parse(item.notes) : {};
    } catch {
      previousMeta = {};
    }
    const remark = payload.remark?.trim() || undefined;
    const meta = {
      ...previousMeta,
      poNumber: payload.poNumber?.trim() || undefined,
      transactionType: payload.transactionType || previousMeta.transactionType || 'PO Receipt',
      source: payload.source?.trim() || undefined,
      buyer: payload.buyer?.trim() || undefined,
      programName: payload.programName?.trim() || previousMeta.programName,
      uom: payload.uom?.trim() || 'EA',
      subInventory: payload.subInventory?.trim() || undefined,
      itemCategoryDisplay: payload.itemCategoryDisplay || previousMeta.itemCategoryDisplay,
      lotBatchNo: payload.lotBatchNo?.trim() || undefined,
      printedPadFrom: payload.printedPadFrom?.trim() || undefined,
      printedPadTo: payload.printedPadTo?.trim() || undefined,
      quantity,
      totalAmount: unitCost * quantity,
      deliveredBy: payload.deliveredBy?.trim() || undefined,
      receivedBy: payload.receivedBy?.trim() || previousMeta.receivedBy,
      remark,
      userNotes: remark,
    };

    const slipDateGc = payload.ifmisSlipDateGc || item.ifmisSlipDateGc;
    const before = {
      name: item.name,
      category: item.category,
      serialNumber: item.serialNumber,
      unitCostETB: item.unitCostETB,
      condition: item.condition,
      storeLocationId: item.storeLocationId,
      ifmisSlipNumber: item.ifmisSlipNumber,
      ifmisSlipDateGc: item.ifmisSlipDateGc,
      ifmisSlipAttachmentUrl: item.ifmisSlipAttachmentUrl,
      quantity: previousMeta.quantity ?? 1,
    };
    const after = {
      name,
      category: payload.category || item.category,
      serialNumber: payload.serialNumber?.trim() || item.serialNumber,
      unitCostETB: unitCost,
      condition: payload.condition || item.condition,
      storeLocationId: payload.storeLocationId,
      ifmisSlipNumber: slipNo,
      ifmisSlipDateGc: slipDateGc,
      ifmisSlipAttachmentUrl: attachmentUrl,
      quantity,
    };
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''));
    const metaChanged = JSON.stringify(previousMeta) !== JSON.stringify(meta);
    if (changed.length === 0 && !metaChanged) {
      const unchanged = await prisma.item.findUnique({ where: { id: itemId }, include: ITEM_INCLUDES });
      return mapItem(unchanged);
    }

    const actor = await prisma.employee.findUnique({ where: { id: actorId } });
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const summary = changed.length
      ? `Corrected before endorsement: ${changed.map((k) => `${k} ${before[k] ?? '—'} → ${after[k] ?? '—'}`).join('; ')}`
      : 'Corrected voucher details before endorsement';

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.item.update({
        where: { id: itemId },
        data: {
          name: after.name,
          category: after.category as any,
          serialNumber: after.serialNumber,
          unitCostETB: after.unitCostETB,
          condition: after.condition as any,
          storeLocationId: after.storeLocationId,
          ifmisSlipNumber: after.ifmisSlipNumber,
          ifmisSlipDateGc: after.ifmisSlipDateGc,
          ifmisSlipDateEc: formatGcToEc(after.ifmisSlipDateGc),
          ifmisSlipAttachmentUrl: after.ifmisSlipAttachmentUrl,
          notes: JSON.stringify(meta),
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: 'STOCK_IN_EDITED',
              fromEntity: 'Store (Pending Approval)',
              toEntity: 'Store (Pending Approval)',
              performedBy: actor ? actor.fullNameEn : actorId,
              performedByRole: (actor?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: after.ifmisSlipNumber,
              notes: summary,
            },
          },
        },
        include: ITEM_INCLUDES,
      });

      // Keep the approval request showing the corrected details
      await tx.transactionApproval.update({
        where: { id: approval.id },
        data: {
          itemName: after.name,
          ifmisSlipNumber: after.ifmisSlipNumber,
          ifmisSlipDateGc: after.ifmisSlipDateGc,
          ifmisSlipDateEc: formatGcToEc(after.ifmisSlipDateGc),
          ifmisSlipAttachmentUrl: after.ifmisSlipAttachmentUrl,
          purposeOrRemarks: remark || `Stock-in inbound receipt (Model 19 #${after.ifmisSlipNumber})`,
        },
      });

      await tx.auditLog.create({
        data: {
          timestampGc: `${today.gc} ${time}`,
          timestampEc: `${today.ec} ${time}`,
          userId: actorId,
          userName: actor ? actor.fullNameEn : 'System',
          userRole: (actor?.role ?? 'DATA_ENCODER') as any,
          action: 'EDIT_STOCK_IN',
          entityType: 'STOCK_IN' as any,
          entityId: itemId,
          ifmisSlipNumber: after.ifmisSlipNumber,
          details: `Item ${item.itemCode}: ${summary}`,
          previousState: before as any,
          newState: after as any,
        },
      });

      return saved;
    });

    return mapItem(updated);
  }

  /**
   * Corrects a Stock-Out request while it still waits for Stage 1 endorsement.
   * The item being issued stays the same; the voucher, recipient and purpose can change.
   */
  public async updateStockOut(approvalId: string, payload: UpdateStockOutRequest, actorId: string): Promise<TransactionApproval> {
    const approval = await prisma.transactionApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.transactionType !== 'STOCK_OUT') {
      throw new NotFoundError(`Stock-Out request ${approvalId} not found.`);
    }
    // Once the Team Leader has endorsed (or the request is decided) the request is locked
    if (approval.status !== 'PENDING' || approval.currentStage !== 1) {
      throw new ConflictError(
        `The Stock-Out request for ${approval.itemCode} can only be edited while it is waiting for Team Leader endorsement. Ask an approver to reject it and submit it again.`
      );
    }

    const slipNo = (payload.ifmisSlipNumber || '').trim();
    const purpose = (payload.purpose || '').trim();
    if (!slipNo) throw new BadRequestError('IFMIS Slip Number is mandatory for Stock-Out.');
    if (!purpose) throw new BadRequestError('Purpose of issue is required.');
    if (!payload.recipientEmployeeId) throw new BadRequestError('Recipient staff member is required.');
    if (!payload.targetDepartmentId) throw new BadRequestError('Destination directorate is required.');

    const [recipient, department] = await Promise.all([
      prisma.employee.findUnique({ where: { id: payload.recipientEmployeeId } }),
      prisma.department.findUnique({ where: { id: payload.targetDepartmentId } }),
    ]);
    if (!recipient) throw new BadRequestError('The selected recipient no longer exists.');
    if (!department) throw new BadRequestError('The selected directorate no longer exists.');

    const item = await prisma.item.findUnique({ where: { id: approval.itemId } });
    if (!item) throw new NotFoundError(`Item ${approval.itemId} not found.`);
    const inStore = quantityOf(item);
    const uom = uomOf(item);
    const previousDetails = (approval.requestDetails ?? {}) as Record<string, any>;
    const previousQuantity = Number(previousDetails.quantity) || inStore;
    const quantity = payload.quantity === undefined || payload.quantity === null ? previousQuantity : Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      throw new BadRequestError(`Quantity must be a whole number from 1 to ${inStore} (${uom} in store).`);
    }

    const before = {
      quantity: previousQuantity,
      recipientEmployeeId: approval.recipientEmployeeId,
      targetDepartmentId: approval.targetDepartmentId,
      ifmisSlipNumber: approval.ifmisSlipNumber,
      ifmisSlipDateGc: approval.ifmisSlipDateGc,
      ifmisSlipAttachmentUrl: approval.ifmisSlipAttachmentUrl,
      purposeOrRemarks: approval.purposeOrRemarks,
    };
    const after = {
      quantity,
      recipientEmployeeId: recipient.id,
      targetDepartmentId: department.id,
      ifmisSlipNumber: slipNo,
      ifmisSlipDateGc: payload.ifmisSlipDateGc || approval.ifmisSlipDateGc,
      ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl || approval.ifmisSlipAttachmentUrl,
      purposeOrRemarks: formatStockOutNotes(purpose, payload.remark?.trim() || undefined),
    };
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''));
    if (changed.length === 0) {
      const unchanged = await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES });
      return mapApproval(unchanged);
    }

    // Show names rather than ids in the history and audit summary
    const previousRecipient = before.recipientEmployeeId && before.recipientEmployeeId !== recipient.id
      ? await prisma.employee.findUnique({ where: { id: before.recipientEmployeeId } })
      : recipient;
    const previousDepartment = before.targetDepartmentId && before.targetDepartmentId !== department.id
      ? await prisma.department.findUnique({ where: { id: before.targetDepartmentId } })
      : department;
    const describe = (k: keyof typeof after): string => {
      if (k === 'recipientEmployeeId') return `recipient ${previousRecipient?.fullNameEn ?? '—'} → ${recipient.fullNameEn}`;
      if (k === 'targetDepartmentId') return `directorate ${previousDepartment?.nameEn ?? '—'} → ${department.nameEn}`;
      if (k === 'ifmisSlipAttachmentUrl') return 'slip attachment replaced';
      return `${k} ${before[k] ?? '—'} → ${after[k] ?? '—'}`;
    };
    const summary = `Corrected before endorsement: ${changed.map(describe).join('; ')}`;

    const actor = await prisma.employee.findUnique({ where: { id: actorId } });
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.transactionApproval.update({
        where: { id: approvalId },
        data: {
          recipientEmployeeId: after.recipientEmployeeId,
          targetDepartmentId: after.targetDepartmentId,
          ifmisSlipNumber: after.ifmisSlipNumber,
          ifmisSlipDateGc: after.ifmisSlipDateGc,
          ifmisSlipDateEc: formatGcToEc(after.ifmisSlipDateGc),
          ifmisSlipAttachmentUrl: after.ifmisSlipAttachmentUrl,
          purposeOrRemarks: after.purposeOrRemarks,
          requestDetails: { ...previousDetails, quantity, uom } as any,
        },
        include: APPROVAL_INCLUDES,
      });

      await tx.item.update({
        where: { id: approval.itemId },
        data: {
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: 'STOCK_OUT_EDITED',
              fromEntity: 'Central Store (Available)',
              toEntity: `${recipient.fullNameEn} (Pending Approval)`,
              performedBy: actor ? actor.fullNameEn : actorId,
              performedByRole: (actor?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: after.ifmisSlipNumber,
              notes: summary,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          timestampGc: `${today.gc} ${time}`,
          timestampEc: `${today.ec} ${time}`,
          userId: actorId,
          userName: actor ? actor.fullNameEn : 'System',
          userRole: (actor?.role ?? 'DATA_ENCODER') as any,
          action: 'EDIT_STOCK_OUT',
          entityType: 'STOCK_OUT' as any,
          entityId: approval.itemId,
          ifmisSlipNumber: after.ifmisSlipNumber,
          details: `Item ${approval.itemCode}: ${summary}`,
          previousState: before as any,
          newState: after as any,
        },
      });

      return saved;
    });

    return mapApproval(updated);
  }

  // ── Stock-Out Registration ──────────────────────────────────────────────

  public async registerStockOut(payload: CreateStockOutRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new Error(`Item ${payload.itemId} not found.`);
    if (item.status !== 'AVAILABLE') {
      throw new Error(`Item ${item.itemCode} must be AVAILABLE to register Stock-Out. Current: ${item.status}`);
    }
    await assertNoPendingApproval(item);
    if (!payload.ifmisSlipNumber.trim()) throw new Error('IFMIS Slip Number is mandatory for Stock-Out.');

    // Issue the whole record unless fewer units are requested
    const inStore = quantityOf(item);
    const uom = uomOf(item);
    const quantity = payload.quantity === undefined || payload.quantity === null ? inStore : Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      throw new BadRequestError(`Quantity must be a whole number from 1 to ${inStore} (${uom} in store).`);
    }

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const recipient = payload.recipientEmployeeId ? await prisma.employee.findUnique({ where: { id: payload.recipientEmployeeId } }) : null;
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const notesText = formatStockOutNotes(payload.purpose, payload.remark);

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
            notes: quantity < inStore ? `Partial issue: ${quantity} of ${inStore} ${uom}. ${notesText}` : notesText,
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
        requestDetails: { quantity, uom } as any,
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
    await assertNoPendingApproval(item);
    const effectiveSlipNo = (payload.model21No || payload.ifmisSlipNumber).trim();
    if (!effectiveSlipNo) throw new Error('Return Voucher (Model 21 / 22) Slip Number is mandatory.');

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const returnDetails: Model21RequestDetails = {
      reason: payload.returnReason,
      condition: payload.condition,
      remark: payload.defectRemark,
      book: payload.book,
      chassisNumber: payload.chassisNumber,
      plateNo: payload.plateNo,
      engineNo: payload.engineNo,
      accessories: payload.accessories,
      tireNos: payload.tireNos,
      origCost: payload.origCost,
      depreciation: payload.depreciation,
      bookValue: payload.bookValue,
      storeRecipientId: payload.storeRecipientId,
    };
    const model21Details = formatReturnNotes(payload.model21No ? effectiveSlipNo : '', returnDetails);

    // The item keeps its current condition until the return is approved
    await prisma.item.update({
      where: { id: item.id },
      data: {
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'RETURN_REQUESTED',
            fromEntity: 'Staff Custodian (Issued)',
            toEntity: 'Central Store (Pending Return Approval)',
            performedBy: user ? user.fullNameEn : payload.registeredById,
            performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
            ifmisSlipNumber: effectiveSlipNo,
            notes: model21Details,
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
        ifmisSlipNumber: effectiveSlipNo,
        ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
        ifmisSlipDateEc: slipDateEc,
        ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl,
        requestedById: payload.registeredById,
        recipientEmployeeId: payload.returningEmployeeId || item.currentCustodianId || undefined,
        purposeOrRemarks: model21Details,
        requestDetails: returnDetails as any,
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
      `Return to store requested for ${item.itemCode}. ${model21Details}. Slip: ${effectiveSlipNo}`,
      effectiveSlipNo,
    );

    return mapApproval(approval);
  }

  /** A transfer or return can only be corrected while it waits for Team Leader endorsement */
  private async loadEditableModel21Request(approvalId: string, type: 'TRANSFER' | 'RETURN') {
    const label = type === 'TRANSFER' ? 'Transfer' : 'Return';
    const approval = await prisma.transactionApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.transactionType !== type) {
      throw new NotFoundError(`${label} request ${approvalId} not found.`);
    }
    if (approval.status !== 'PENDING' || approval.currentStage !== 1) {
      throw new ConflictError(
        `The ${label.toLowerCase()} request for ${approval.itemCode} can only be edited while it is waiting for Team Leader endorsement. Ask an approver to reject it and submit it again.`
      );
    }
    return approval;
  }

  /** Saves a corrected transfer/return with its history entry and audit log in one transaction */
  private async saveModel21Edit(opts: {
    approval: { id: string; itemId: string; itemCode: string };
    data: Record<string, unknown>;
    historyAction: 'TRANSFER_EDITED' | 'RETURN_EDITED';
    auditAction: 'EDIT_TRANSFER' | 'EDIT_RETURN';
    entityType: 'TRANSFER' | 'RETURN';
    fromEntity: string;
    toEntity: string;
    slipNo: string;
    changes: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    actorId: string;
  }): Promise<TransactionApproval> {
    const actor = await prisma.employee.findUnique({ where: { id: opts.actorId } });
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const summary = `Corrected before endorsement: ${opts.changes.join('; ')}`;

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.transactionApproval.update({
        where: { id: opts.approval.id },
        data: opts.data as any,
        include: APPROVAL_INCLUDES,
      });

      await tx.item.update({
        where: { id: opts.approval.itemId },
        data: {
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: opts.historyAction,
              fromEntity: opts.fromEntity,
              toEntity: opts.toEntity,
              performedBy: actor ? actor.fullNameEn : opts.actorId,
              performedByRole: (actor?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: opts.slipNo,
              notes: summary,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          timestampGc: `${today.gc} ${time}`,
          timestampEc: `${today.ec} ${time}`,
          userId: opts.actorId,
          userName: actor ? actor.fullNameEn : 'System',
          userRole: (actor?.role ?? 'DATA_ENCODER') as any,
          action: opts.auditAction,
          entityType: opts.entityType as any,
          entityId: opts.approval.itemId,
          ifmisSlipNumber: opts.slipNo,
          details: `Item ${opts.approval.itemCode}: ${summary}`,
          previousState: opts.before as any,
          newState: opts.after as any,
        },
      });

      return saved;
    });

    return mapApproval(updated);
  }

  /**
   * Corrects a Model 21 transfer request while it still waits for Stage 1 endorsement.
   * The asset stays the same; the voucher, new custodian, destination and particulars can change.
   */
  public async updateTransfer(approvalId: string, payload: UpdateTransferRequest, actorId: string): Promise<TransactionApproval> {
    const approval = await this.loadEditableModel21Request(approvalId, 'TRANSFER');

    const slipNo = (payload.model21No || '').trim();
    const reason = (payload.reason || '').trim();
    if (!slipNo) throw new BadRequestError('Transfer Voucher (Model 21) number is mandatory.');
    if (!reason) throw new BadRequestError('Reason for transfer is required.');
    if (!payload.toEmployeeId) throw new BadRequestError('The new custodian is required.');

    const [item, recipient, department, location] = await Promise.all([
      prisma.item.findUnique({ where: { id: approval.itemId } }),
      prisma.employee.findUnique({ where: { id: payload.toEmployeeId } }),
      payload.toDepartmentId ? prisma.department.findUnique({ where: { id: payload.toDepartmentId } }) : null,
      payload.toLocationId ? prisma.location.findUnique({ where: { id: payload.toLocationId } }) : null,
    ]);
    if (!item) throw new NotFoundError(`Item ${approval.itemId} not found.`);
    if (!recipient) throw new BadRequestError('The selected new custodian no longer exists.');
    if (payload.toDepartmentId && !department) throw new BadRequestError('The selected directorate no longer exists.');
    if (payload.toLocationId && !location) throw new BadRequestError('The selected location no longer exists.');

    const previous = requestDetailsOf(approval) ?? {};
    const details: Model21RequestDetails = {
      ...previous,
      reason,
      remark: payload.remark?.trim() || undefined,
      book: payload.book?.trim() || undefined,
      chassisNumber: payload.chassisNumber?.trim() || undefined,
      plateNo: payload.plateNo?.trim() || undefined,
      engineNo: payload.engineNo?.trim() || undefined,
      accessories: payload.accessories ?? previous.accessories,
      tireNos: payload.tireNos ?? previous.tireNos,
      depreciation: payload.depreciation ?? previous.depreciation,
      bookValue: payload.bookValue ?? previous.bookValue,
      origCost: previous.origCost ?? item.unitCostETB,
    };

    const [previousRecipient, previousDepartment, previousLocation, custodian] = await Promise.all([
      approval.recipientEmployeeId ? prisma.employee.findUnique({ where: { id: approval.recipientEmployeeId } }) : null,
      approval.targetDepartmentId ? prisma.department.findUnique({ where: { id: approval.targetDepartmentId } }) : null,
      approval.targetLocationId ? prisma.location.findUnique({ where: { id: approval.targetLocationId } }) : null,
      item.currentCustodianId ? prisma.employee.findUnique({ where: { id: item.currentCustodianId } }) : null,
    ]);
    const view = (slip: string, to: string | undefined, dept: string | undefined, loc: string | undefined, d: Model21RequestDetails) => ({
      'Model 21 no.': slip,
      'new custodian': to,
      directorate: dept ?? 'current',
      location: loc ?? 'current',
      reason: d.reason,
      remark: d.remark,
      book: d.book,
      chassis: d.chassisNumber,
      plate: d.plateNo,
      engine: d.engineNo,
      accessories: formatAccessories(d.accessories),
      'tire nos.': d.tireNos?.join(', '),
      depreciation: d.depreciation,
      'book value': d.bookValue,
    });
    const before = view(approval.ifmisSlipNumber, previousRecipient?.fullNameEn, previousDepartment?.nameEn, previousLocation?.siteName, previous);
    const after = view(slipNo, recipient.fullNameEn, department?.nameEn, location?.siteName, details);
    const changes = describeChanges(before, after);
    if (changes.length === 0) {
      return mapApproval(await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES }));
    }

    const fromName = custodian?.fullNameEn ?? 'None';
    return this.saveModel21Edit({
      approval,
      data: {
        ifmisSlipNumber: slipNo,
        recipientEmployeeId: recipient.id,
        targetDepartmentId: department?.id ?? null,
        targetLocationId: location?.id ?? null,
        purposeOrRemarks: `Transfer from ${fromName} to ${recipient.fullNameEn}. ${formatTransferNotes(slipNo, details)}`,
        requestDetails: details,
      },
      historyAction: 'TRANSFER_EDITED',
      auditAction: 'EDIT_TRANSFER',
      entityType: 'TRANSFER',
      fromEntity: fromName,
      toEntity: `${recipient.fullNameEn} (Pending Approval)`,
      slipNo,
      changes,
      before,
      after,
      actorId,
    });
  }

  /**
   * Corrects a Model 21 return request while it still waits for Stage 1 endorsement.
   * The asset stays the same; the voucher, condition, reason and particulars can change.
   */
  public async updateReturn(approvalId: string, payload: UpdateReturnRequest, actorId: string): Promise<TransactionApproval> {
    const approval = await this.loadEditableModel21Request(approvalId, 'RETURN');

    const slipNo = (payload.model21No || '').trim();
    const reason = (payload.returnReason || '').trim();
    if (!slipNo) throw new BadRequestError('Return Voucher (Model 21) number is mandatory.');
    if (!reason) throw new BadRequestError('Reason for return is required.');
    if (!RETURN_CONDITIONS.includes(payload.condition)) throw new BadRequestError('Choose the condition of the returned item.');

    const storeRecipient = payload.storeRecipientId
      ? await prisma.employee.findUnique({ where: { id: payload.storeRecipientId } })
      : null;
    if (payload.storeRecipientId && !storeRecipient) throw new BadRequestError('The selected store receiver no longer exists.');

    const previous = requestDetailsOf(approval) ?? {};
    const details: Model21RequestDetails = {
      ...previous,
      reason,
      condition: payload.condition,
      remark: payload.defectRemark?.trim() || undefined,
      book: payload.book?.trim() || undefined,
      chassisNumber: payload.chassisNumber?.trim() || undefined,
      plateNo: payload.plateNo?.trim() || undefined,
      engineNo: payload.engineNo?.trim() || undefined,
      accessories: payload.accessories ?? previous.accessories,
      tireNos: payload.tireNos ?? previous.tireNos,
      depreciation: payload.depreciation ?? previous.depreciation,
      bookValue: payload.bookValue ?? previous.bookValue,
      storeRecipientId: storeRecipient?.id,
    };
    const slipDateGc = payload.ifmisSlipDateGc || approval.ifmisSlipDateGc;
    const attachmentUrl = payload.ifmisSlipAttachmentUrl || approval.ifmisSlipAttachmentUrl;

    const previousReceiver = previous.storeRecipientId
      ? await prisma.employee.findUnique({ where: { id: previous.storeRecipientId } })
      : null;
    const fileName = (url?: string | null) => (url ? url.split('/').pop() : undefined);
    const view = (slip: string, date: string, url: string | null | undefined, receiver: string | undefined, d: Model21RequestDetails) => ({
      'Model 21 no.': slip,
      'return date': date,
      'slip file': fileName(url),
      condition: d.condition,
      reason: d.reason,
      defects: d.remark,
      book: d.book,
      chassis: d.chassisNumber,
      plate: d.plateNo,
      engine: d.engineNo,
      accessories: formatAccessories(d.accessories),
      'tire nos.': d.tireNos?.join(', '),
      depreciation: d.depreciation,
      'book value': d.bookValue,
      'store receiver': receiver ?? 'central store custodian',
    });
    const before = view(approval.ifmisSlipNumber, approval.ifmisSlipDateGc, approval.ifmisSlipAttachmentUrl, previousReceiver?.fullNameEn, previous);
    const after = view(slipNo, slipDateGc, attachmentUrl, storeRecipient?.fullNameEn, details);
    const changes = describeChanges(before, after);
    if (changes.length === 0) {
      return mapApproval(await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES }));
    }

    return this.saveModel21Edit({
      approval,
      data: {
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc: slipDateGc,
        ifmisSlipDateEc: formatGcToEc(slipDateGc),
        ifmisSlipAttachmentUrl: attachmentUrl,
        purposeOrRemarks: formatReturnNotes(slipNo, details),
        requestDetails: details,
      },
      historyAction: 'RETURN_EDITED',
      auditAction: 'EDIT_RETURN',
      entityType: 'RETURN',
      fromEntity: 'Staff Custodian (Issued)',
      toEntity: 'Central Store (Pending Return Approval)',
      slipNo,
      changes,
      before,
      after,
      actorId,
    });
  }

  // ── Approval Handling ───────────────────────────────────────────────────

  public async handleApproval(payload: ApprovalActionRequest): Promise<TransactionApproval> {
    const approval = await prisma.transactionApproval.findUnique({ where: { id: payload.approvalId } });
    if (!approval) throw new Error(`Approval record ${payload.approvalId} not found.`);
    if (approval.status !== 'PENDING') throw new Error(`This transaction is already ${approval.status}.`);

    const today = getTodayGcAndEc();
    const reviewer = payload.reviewedById ? await prisma.employee.findUnique({ where: { id: payload.reviewedById } }) : null;
    if (!['ENDORSE', 'APPROVE', 'REJECT'].includes(payload.action)) throw new BadRequestError('Invalid approval action.');
    const permission = approval.currentStage === 1 ? 'approvals.endorse' : 'approvals.authorize';
    if (!hasPermission(reviewer?.role, permission)) throw new ForbiddenError('Your role cannot review this approval stage.');
    // Segregation of duties: whoever submitted a request can't endorse, approve or reject it
    if (approval.requestedById && approval.requestedById === payload.reviewedById) {
      throw new ForbiddenError("You can't endorse, approve or reject a request you submitted.");
    }
    if ((payload.action === 'ENDORSE' && approval.currentStage !== 1) ||
        (payload.action === 'APPROVE' && approval.currentStage !== 2)) {
      throw new BadRequestError('This action does not match the current approval stage.');
    }
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
    let locationId: string = item.storeLocationId;
    let approvedById: string | null = item.approvedById;
    let approvedCondition: string | undefined;
    // Set when a Stock-Out issues only part of the record's units
    let partialIssue: { quantity: number; remaining: number; uom: string; code: string; recipientName: string } | null = null;

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
        // Older returns set the condition when submitted and have no requestDetails
        approvedCondition = (approval.requestDetails as Model21RequestDetails | null)?.condition;
        custodianId = null;
        departmentId = null;
        approvedById = payload.reviewedById;
      } else if (approval.transactionType === 'TRANSFER') {
        // Apply the custody / department / location change only now, after Stage 2 sign-off
        custodianId = approval.recipientEmployeeId ?? item.currentCustodianId;
        departmentId = approval.targetDepartmentId ?? item.assignedDepartmentId;
        locationId = approval.targetLocationId ?? item.storeLocationId;
        newItemStatus = statusForCustodian(custodianId);
        historyAction = 'TRANSFER_APPROVED';
        const [fromEmp, toEmp] = await Promise.all([
          item.currentCustodianId ? prisma.employee.findUnique({ where: { id: item.currentCustodianId } }) : null,
          custodianId ? prisma.employee.findUnique({ where: { id: custodianId } }) : null,
        ]);
        fromEntity = fromEmp ? fromEmp.fullNameEn : 'Store';
        toEntity = toEmp ? toEmp.fullNameEn : 'Store';
        histNote = payload.reviewRemarks || `Model 21 transfer approved: ${approval.purposeOrRemarks}`;
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

        const requested = Number((approval.requestDetails as Record<string, any> | null)?.quantity);
        const inStore = quantityOf(item);
        if (Number.isInteger(requested) && requested > 0 && requested < inStore) {
          // The rest stays in store on this record; the issued units get their own record
          const rootId = item.parentItemId ?? item.id;
          const root = item.parentItemId ? await prisma.item.findUnique({ where: { id: rootId } }) : item;
          const rootCode = root?.itemCode ?? item.itemCode;
          let next = (await prisma.item.count({ where: { parentItemId: rootId } })) + 1;
          while (await prisma.item.findUnique({ where: { itemCode: `${rootCode}-${next}` } })) next += 1;
          partialIssue = {
            quantity: requested,
            remaining: inStore - requested,
            uom: uomOf(item),
            code: `${rootCode}-${next}`,
            recipientName: toEntity,
          };
          newItemStatus = 'AVAILABLE';
          custodianId = item.currentCustodianId;
          departmentId = item.assignedDepartmentId;
          approvedById = item.approvedById;
          fromEntity = 'Pending Stock-Out';
          toEntity = 'Central Store (AVAILABLE)';
          histNote = `Issued ${requested} of ${inStore} ${partialIssue.uom} as ${partialIssue.code} to ${partialIssue.recipientName}; ${partialIssue.remaining} ${partialIssue.uom} remain in store. Purpose: ${approval.purposeOrRemarks}`;
        }
      }
    } else {
      if (approval.transactionType === 'STOCK_IN') {
        newItemStatus = 'DISPOSED';
        historyAction = 'STOCK_IN_REJECTED';
        fromEntity = 'Pending Approval';
        toEntity = 'Rejected / Returned to Supplier';
        histNote = payload.reviewRemarks || 'Rejected by Department Head';
      } else if (approval.transactionType === 'RETURN') {
        // Returns can be raised for AVAILABLE items too, so fall back to the item's actual custody
        newItemStatus = statusForCustodian(item.currentCustodianId);
        historyAction = 'RETURN_REJECTED';
        fromEntity = 'Pending Return';
        toEntity = 'Staff Custodian (Retained)';
        histNote = payload.reviewRemarks || 'Model 22 Return request rejected by Department Head';
      } else if (approval.transactionType === 'TRANSFER') {
        // Nothing was moved while pending, so the item simply keeps its current custody
        newItemStatus = statusForCustodian(item.currentCustodianId);
        historyAction = 'TRANSFER_REJECTED';
        fromEntity = 'Pending Transfer';
        toEntity = 'Current Custodian (Retained)';
        histNote = payload.reviewRemarks || 'Model 21 transfer request rejected by Department Head';
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
        storeLocationId: locationId,
        approvedById,
        ...(approvedCondition ? { condition: approvedCondition as any } : {}),
        ...(partialIssue ? { notes: notesWithQuantity(item.notes, partialIssue.remaining, item.unitCostETB) } : {}),
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

    let finalApproval = updatedApproval;
    if (partialIssue) {
      await prisma.item.create({
        data: {
          itemCode: partialIssue.code,
          name: item.name,
          category: item.category,
          unitCostETB: item.unitCostETB,
          status: 'ISSUED' as any,
          condition: item.condition,
          storeLocationId: item.storeLocationId,
          currentCustodianId: approval.recipientEmployeeId,
          assignedDepartmentId: approval.targetDepartmentId,
          ifmisSlipNumber: item.ifmisSlipNumber,
          ifmisSlipDateGc: item.ifmisSlipDateGc,
          ifmisSlipDateEc: item.ifmisSlipDateEc,
          ifmisSlipAttachmentUrl: item.ifmisSlipAttachmentUrl,
          isHistoricalData: item.isHistoricalData,
          notes: notesWithQuantity(item.notes, partialIssue.quantity, item.unitCostETB),
          parentItemId: item.parentItemId ?? item.id,
          registeredById: item.registeredById,
          approvedById: payload.reviewedById,
          createdAtGc: today.gc,
          createdAtEc: today.ec,
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: 'STOCK_OUT_APPROVED',
              fromEntity: `Central Store (${item.itemCode})`,
              toEntity: partialIssue.recipientName,
              performedBy: reviewerName,
              performedByRole: (reviewer ? reviewer.role : 'DEPARTMENT_HEAD') as any,
              approvedBy: reviewerName,
              ifmisSlipNumber: approval.ifmisSlipNumber,
              notes: `${partialIssue.quantity} ${partialIssue.uom} issued from ${item.itemCode} (Model 22 ${approval.ifmisSlipNumber}). Purpose: ${approval.purposeOrRemarks}`,
            },
          },
        },
      });
      // Remember which record holds the issued units
      finalApproval = await prisma.transactionApproval.update({
        where: { id: approval.id },
        data: {
          requestDetails: { ...((approval.requestDetails ?? {}) as Record<string, any>), issuedItemCode: partialIssue.code } as any,
        },
        include: APPROVAL_INCLUDES,
      });
    }

    await addAuditLog(
      payload.reviewedById,
      isApprove ? `APPROVE_${approval.transactionType}` : `REJECT_${approval.transactionType}`,
      'APPROVAL',
      item.id,
      `${approval.transactionType} ${payload.action}D by ${reviewerName} for item ${item.itemCode}.${partialIssue ? ` Partial issue: ${partialIssue.quantity} ${partialIssue.uom} as ${partialIssue.code}.` : ''} Remarks: ${updatedApproval.reviewRemarks}`,
      approval.ifmisSlipNumber,
    );

    return mapApproval(finalApproval);
  }

  // ── Transfer ────────────────────────────────────────────────────────────

  public async transferItem(payload: CreateTransferRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new Error(`Item ${payload.itemId} not found.`);
    if (item.status !== 'ISSUED' && item.status !== 'AVAILABLE') {
      throw new Error(`Item ${item.itemCode} cannot be transferred. Current status: ${item.status}`);
    }
    await assertNoPendingApproval(item);
    const slipNo = (payload.model21No || '').trim();
    if (!slipNo) throw new Error('Transfer Voucher (Model 21) number is mandatory.');

    const today = getTodayGcAndEc();
    const prevCustodian = item.currentCustodianId
      ? (await prisma.employee.findUnique({ where: { id: item.currentCustodianId } }))?.fullNameEn
      : 'None';
    const newCustodian = payload.toEmployeeId
      ? (await prisma.employee.findUnique({ where: { id: payload.toEmployeeId } }))?.fullNameEn
      : prevCustodian;
    const performer = payload.performedById ? await prisma.employee.findUnique({ where: { id: payload.performedById } }) : null;

    const transferDetails: Model21RequestDetails = {
      reason: payload.reason,
      remark: payload.remark,
      book: payload.book,
      chassisNumber: payload.chassisNumber,
      plateNo: payload.plateNo,
      engineNo: payload.engineNo,
      accessories: payload.accessories,
      tireNos: payload.tireNos,
      origCost: payload.origCost,
      depreciation: payload.depreciation,
      bookValue: payload.bookValue,
    };
    const model21Details = formatTransferNotes(slipNo, transferDetails);

    // Nothing moves yet: the item is held UNDER_TRANSFER until Stage 2 approval applies the change
    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: 'UNDER_TRANSFER' as any,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'TRANSFER_REQUESTED',
            fromEntity: prevCustodian || 'Store',
            toEntity: `${newCustodian || 'New Location'} (Pending Approval)`,
            performedBy: performer ? performer.fullNameEn : payload.performedById,
            performedByRole: (performer?.role ?? 'DATA_ENCODER') as any,
            ifmisSlipNumber: slipNo,
            notes: model21Details,
          },
        },
      },
    });

    const approval = await prisma.transactionApproval.create({
      data: {
        transactionType: 'TRANSFER' as any,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc: today.gc,
        ifmisSlipDateEc: today.ec,
        requestedById: payload.performedById,
        recipientEmployeeId: payload.toEmployeeId,
        targetDepartmentId: payload.toDepartmentId,
        targetLocationId: payload.toLocationId,
        purposeOrRemarks: `Transfer from ${prevCustodian} to ${newCustodian}. ${model21Details}`,
        requestDetails: transferDetails as any,
        status: 'PENDING' as any,
        createdAtGc: today.gc,
        createdAtEc: today.ec,
      },
    });

    await addAuditLog(
      payload.performedById,
      'REGISTER_TRANSFER',
      'TRANSFER',
      item.id,
      `Transfer requested for ${item.itemCode} from ${prevCustodian} to ${newCustodian}. ${model21Details}`,
      slipNo,
    );

    return mapApproval(approval);
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
    return mapEmployee(await assignEmployeeRole(id, role, actorId));
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

    // Count units, not records: a partial Stock-Out splits one registration into several records,
    // so record counts would change while the stock did not. Values are unit price × units.
    const unitsOf = (i: { quantity?: number }) => Number(i.quantity) || 1;
    const units = (arr: typeof allItems) => arr.reduce((s, i) => s + unitsOf(i), 0);

    // Same buckets as item balances, so the dashboard, Reports and the lists agree
    const available = allItems.filter((i) => IN_STORE_STATUSES.includes(i.status));
    const issued = allItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status));
    const pendingIn = allItems.filter((i) => i.status === 'PENDING_STOCK_IN');
    const pendingOut = allItems.filter((i) => i.status === 'PENDING_STOCK_OUT');
    const inTransfer = allItems.filter((i) => i.status === 'UNDER_TRANSFER');
    const active = allItems.filter((i) => i.status !== 'DISPOSED');

    const sum = (arr: typeof allItems) => arr.reduce((s, i) => s + (i.unitCostETB || 0) * unitsOf(i), 0);

    const departmentDistribution = departments.map((dept) => {
      const deptItems = allItems.filter((i) => i.assignedDepartmentId === dept.id);
      return {
        departmentId: dept.id,
        departmentCode: dept.code,
        nameEn: dept.nameEn,
        nameAm: dept.nameAm,
        itemCount: units(deptItems),
        totalValueETB: sum(deptItems),
        availableCount: units(deptItems.filter((i) => IN_STORE_STATUSES.includes(i.status))),
        issuedCount: units(deptItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status))),
        otherStatusCount: units(deptItems.filter((i) => i.status === 'PENDING_STOCK_IN')),
        items: deptItems,
      };
    });

    const unassignedItems = allItems.filter((i) => !i.assignedDepartmentId);

    // Units that have stayed in store longer than the distribution limit, oldest first
    const todayMs = Date.parse(getTodayGcAndEc().gc);
    const staleItems = available
      .map((i) => {
        const since = inStoreSince(i);
        const sinceMs = since ? Date.parse(since.slice(0, 10)) : NaN;
        const daysInStore = Number.isFinite(sinceMs) ? Math.floor((todayMs - sinceMs) / DAY_MS) : 0;
        return {
          id: i.id,
          itemCode: i.itemCode,
          name: i.name,
          unitsInStore: unitsOf(i),
          uom: i.uom || 'EA',
          inStoreSinceGc: since?.slice(0, 10),
          daysInStore,
          valueETB: (i.unitCostETB || 0) * unitsOf(i),
          issuePending: i.status === 'PENDING_STOCK_OUT',
        };
      })
      .filter((i) => i.daysInStore > STALE_IN_STORE_DAYS)
      .sort((a, b) => b.daysInStore - a.daysInStore);

    const conditionDistribution = ['NEW', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((cond) => {
      const matching = allItems.filter((i) => i.condition === cond);
      return {
        condition: cond,
        count: units(matching),
        totalValueETB: sum(matching),
      };
    });

    const locationUtilization = locations.map((loc) => {
      const locItems = allItems.filter((i) => i.storeLocationId === loc.id);
      const locAvailable = locItems.filter((i) => IN_STORE_STATUSES.includes(i.status));
      const locIssued    = locItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status));
      const locPending   = locItems.filter((i) => i.status === 'PENDING_STOCK_IN');
      // category breakdown per location
      const locCategoryBreakdown = Object.values(AssetCategory).map((cat) => {
        const matching = locItems.filter((i) => i.category === cat);
        return { category: cat, count: units(matching), totalValueETB: sum(matching) };
      }).filter((c) => c.count > 0);

      return {
        id: loc.id,
        siteName: loc.siteName,
        building: loc.building,
        roomNumber: loc.roomNumber,
        isCentralStore: loc.isCentralStore,
        itemCount: units(locItems),
        totalValueETB: sum(locItems),
        availableCount: units(locAvailable),
        availableValueETB: sum(locAvailable),
        issuedCount: units(locIssued),
        issuedValueETB: sum(locIssued),
        pendingCount: units(locPending),
        categoryBreakdown: locCategoryBreakdown,
      };
    });


    const categoryBreakdown = Object.values(AssetCategory).map((cat) => {
      const matching = allItems.filter((i) => i.category === cat);
      return { category: cat, count: units(matching), totalValueETB: sum(matching) };
    });

    const topValuationAssets = allItems
      .slice()
      .sort((a, b) => (b.unitCostETB || 0) * unitsOf(b) - (a.unitCostETB || 0) * unitsOf(a))
      .slice(0, 8);

    return {
      // Units on record, not counting rejected registrations
      totalItems: units(active),
      availableCount: units(available),
      availableValuationETB: sum(available),
      issuedCount: units(issued),
      issuedValuationETB: sum(issued),
      pendingStockInCount: pendingIn.length,
      pendingStockOutCount: pendingOut.length,
      pendingTransferCount: inTransfer.length,
      pendingApprovalsCount: pendingApprovals,
      totalValuationETB: sum(active),
      unassignedItemsCount: units(unassignedItems),
      unassignedValuationETB: sum(unassignedItems),
      unassignedItems,
      staleInStore: {
        thresholdDays: STALE_IN_STORE_DAYS,
        itemCount: staleItems.length,
        units: staleItems.reduce((sum, i) => sum + i.unitsInStore, 0),
        valueETB: staleItems.reduce((sum, i) => sum + i.valueETB, 0),
        items: staleItems,
      },
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
