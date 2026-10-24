import {
  ItemStatus,
  ItemWithRelations,
  MyAsset,
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
  ItemType,
  CreateStockInRequest,
  UpdateStockInRequest,
  UpdateStockOutRequest,
  CreateStockOutRequest,
  CreateTransferRequest,
  CreateReturnRequest,
  CreateDisposalRequest,
  UpdateDisposalRequest,
  UpdateTransferRequest,
  UpdateReturnRequest,
  Model21RequestDetails,
  Model21Accessory,
  ItemBalance,
  ApprovalActionRequest,
  SlipApprovalActionRequest,
  PROVISION_TYPES,
} from '../types/asset-management';
import { prisma } from '../lib/prisma';
import { getTodayGcAndEc, formatGcToEc } from '../utils/eth-date';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '../errors/app-error';

import { assignEmployeeRole } from './roles.service';
import { hasPermission, ROLE_POLICY } from '../security/role-policy';
import { assertUsableLocation, locationView, requireStoreKeeper } from './reference.service';
import { requireOrganization } from './organizations.service';
import { isSlipRequired, SLIP_REQUIRED_MESSAGE } from './settings.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────


export function formatVoucherRemark(remark?: string | null): string | undefined {
  if (!remark) return undefined;
  const trimmed = String(remark).trim();
  if (!trimmed) return undefined;
  // Don't show voucher-level program name or source as a line remark
  if (/^program:\s*/i.test(trimmed)) return undefined;
  if (/^source:\s*/i.test(trimmed)) return undefined;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'object' && obj !== null) {
        if (obj.userNotes) return String(obj.userNotes).trim();
        if (obj.remark) return String(obj.remark).trim();
        if (obj.notes) return String(obj.notes).trim();
        if (obj.defectRemark) return String(obj.defectRemark).trim();
        if (obj.description) return String(obj.description).trim();
        return undefined;
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

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
    ifmisTagNumber: raw.ifmisTagNumber ?? undefined,
    name: raw.name,
    category: raw.category as AssetCategory,
    itemType: (raw.itemType ?? 'FIXED') as ItemType,
    serialNumber: raw.serialNumber,
    unitCostETB: raw.unitCostETB,
    status: raw.status as ItemStatus,
    condition: (raw.condition ?? ItemCondition.NEW) as ItemCondition,
    storeLocationId: raw.storeLocationId,
    currentCustodianId: raw.currentCustodianId ?? null,
    assignedDepartmentId: raw.assignedDepartmentId ?? null,
    heldByOrganization: raw.heldByOrganization ?? undefined,
    heldByContact: raw.heldByContact ?? undefined,
    ifmisSlipNumber: raw.ifmisSlipNumber,
    ifmisSlipDateGc: raw.ifmisSlipDateGc,
    ifmisSlipDateEc: raw.ifmisSlipDateEc,
    ifmisSlipAttachmentUrl: raw.ifmisSlipAttachmentUrl ?? undefined,
    isHistoricalData: raw.isHistoricalData,
    parentItemId: raw.parentItemId ?? undefined,
    notes: (model19Meta.userNotes || model19Meta.remark) || undefined,
    registeredById: raw.registeredById,
    approvedById: raw.approvedById ?? undefined,
    createdAtGc: raw.createdAtGc,
    createdAtEc: raw.createdAtEc,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : (raw.createdAt ? String(raw.createdAt) : undefined),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : (raw.updatedAt ? String(raw.updatedAt) : undefined),
    storeLocation: raw.storeLocation ? locationView(raw.storeLocation) : undefined,
    // Map employees explicitly so stored credentials never leave the API
    currentCustodian: raw.currentCustodian ? mapEmployee(raw.currentCustodian) : null,
    assignedDepartment: raw.assignedDepartment ?? null,
    registeredBy: raw.registeredBy ? mapEmployee(raw.registeredBy) : undefined,
    approvedBy: raw.approvedBy ? mapEmployee(raw.approvedBy) : undefined,

    // Model 19 fields
    provisionType: model19Meta.provisionType === 'DONATION' ? 'DONATION' : 'PURCHASE',
    ifmisItemCode: model19Meta.ifmisItemCode || undefined,
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
    vatApplicable: Boolean(model19Meta.vatApplicable),
    additionalCharges: Number(model19Meta.additionalCharges) || 0,
    // What a unit cost with VAT and charges: the value of the record's units once received (issue, transfer, disposal)
    costPerUnit: costPerUnit(raw),
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

export const HIGH_VALUE_APPROVAL_THRESHOLD = 10_000_000;
/**
 * Whether requests above HIGH_VALUE_APPROVAL_THRESHOLD go to the Chief Director at stage 2. Off for now (decided
 * 2026-10-21): every request is endorsed by the Team Leader and authorized by the Department Head, whatever its
 * amount. Turn it back on here (and CHIEF_DIRECTOR_APPROVAL_ON in the frontend's slip-groups.ts).
 */
export const approvalPolicy = { chiefDirectorAboveThreshold: false };
/** Whether a request (or a voucher, by its grand total) of this amount needs the Chief Director at stage 2 */
export const needsChiefDirector = (amount: number): boolean => approvalPolicy.chiefDirectorAboveThreshold && amount > HIGH_VALUE_APPROVAL_THRESHOLD;
/** Most lines one Model 19 decision covers */
export const MAX_SLIP_LINES = 200;

/**
 * Who authorizes the lines of a voucher waiting together (a Model 19 receipt: same slip and PO; a Model 22 issue:
 * same number): the CEO when the voucher's grand total is above 10 million birr, for every line of it, as the
 * decision does. A request on its own keeps the role its own amount gives it.
 */
type VoucherLine = { transactionType: string; status: string; currentStage?: number; ifmisSlipNumber?: string; poNumber?: string; totalAmount?: number };

/** What makes pending lines one voucher, decided together: a Model 19 (slip and PO) or a Model 22 (number), at one stage */
function voucherKey(a: VoucherLine): string | undefined {
  const slip = String(a.ifmisSlipNumber ?? '').trim().toLowerCase();
  if (a.status !== 'PENDING' || !['STOCK_IN', 'STOCK_OUT', 'DISPOSAL'].includes(a.transactionType) || !slip || slip.startsWith('pending-')) return undefined;
  const po = a.transactionType === 'STOCK_IN' ? String(a.poNumber ?? '').trim().toLowerCase() : '';
  return `${a.transactionType}|${slip}|${po}|${a.currentStage ?? 1}`;
}

/**
 * Pending requests as the approvals queue shows them: a voucher of several lines is one, with its grand total;
 * any other request is one on its own
 */
export function pendingVouchers<T extends VoucherLine>(list: T[]): { currentStage: number; total: number; lead: T }[] {
  const rows = new Map<string, { currentStage: number; total: number; lead: T }>();
  list.forEach((a, i) => {
    const key = voucherKey(a) ?? `single|${i}`;
    const row = rows.get(key) ?? { currentStage: a.currentStage ?? 1, total: 0, lead: a };
    rows.set(key, { ...row, total: row.total + (Number(a.totalAmount) || 0) });
  });
  return [...rows.values()];
}

export function withVoucherApprover<T extends VoucherLine & { requiredRole?: string }>(list: T[]): T[] {
  const keyOf = voucherKey;
  const totals = new Map<string, { sum: number; lines: number }>();
  for (const a of list) {
    const key = keyOf(a);
    if (!key) continue;
    const t = totals.get(key) ?? { sum: 0, lines: 0 };
    totals.set(key, { sum: t.sum + (Number(a.totalAmount) || 0), lines: t.lines + 1 });
  }
  return list.map((a) => {
    const t = totals.get(keyOf(a) ?? '');
    if (!t || t.lines < 2) return a;
    return { ...a, requiredRole: needsChiefDirector(t.sum) ? 'CHIEF_DIRECTOR' : 'DEPARTMENT_HEAD' };
  });
}

export function calculateApprovalTotalAmount(raw: any, itemObj?: any): number {
  let req = raw?.requestDetails;
  if (typeof req === 'string') {
    try {
      req = JSON.parse(req);
    } catch {
      req = null;
    }
  }
  if (req?.totalAmount && Number(req.totalAmount) > 0) {
    return Number(req.totalAmount);
  }
  // A disposal is weighed at its original cost (units × what a unit cost, VAT and charges in), not the book value typed on the
  // form: the requester can't lower it, and a fully depreciated asset can still be worth a lot. The book value still
  // prints on the form. (Agreed 2026-10-21, pending the property directive; to weigh by book value, drop this.)
  if (raw?.transactionType === 'DISPOSAL') {
    const original = itemObj ?? raw?.item;
    const units = Number(req?.quantity) || (original ? quantityOf(original) : 1);
    return original ? Math.round(costPerUnit(original) * units * 100) / 100 : 0;
  }
  if (req?.bookValue && Number(req.bookValue) > 0) {
    return Number(req.bookValue);
  }
  const item = itemObj ?? raw?.item;
  // An issue (or a disposal) of part of a record is worth what it takes out: the units asked for at what a unit cost,
  // with the Model 22's transport cost on the line that carries it; not the record's whole received total
  const asked = Number(req?.quantity);
  if (raw?.transactionType && raw.transactionType !== 'STOCK_IN' && Number.isFinite(asked) && asked > 0) {
    return Math.round(((item ? costPerUnit(item) : 0) * asked + (Number(req?.transportationCost) || 0)) * 100) / 100;
  }
  if (item?.notes) {
    const meta = readItemMeta(item.notes);
    if (meta?.totalAmount && Number(meta.totalAmount) > 0) {
      return Number(meta.totalAmount);
    }
  }
  const unitCost = Number(item?.unitCostETB) || 0;
  const qty = Number(req?.quantity) || (item ? quantityOf(item) : 1);
  return unitCost * qty;
}

const APPROVAL_INCLUDES = {
  requestedBy: true,
  endorsedBy: true,
  reviewedBy: true,
  returnedBy: true,
  recipientEmployee: true,
  targetDepartment: true,
  // Quantity lives in notes; unitCostETB enables threshold calculation
  item: { select: { notes: true, unitCostETB: true } },
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
    poNumber: raw.transactionType === 'STOCK_IN' ? readItemMeta(raw.item?.notes).poNumber || undefined : undefined,
    totalAmount: calculateApprovalTotalAmount(raw),
    requiredRole: needsChiefDirector(calculateApprovalTotalAmount(raw)) ? 'CHIEF_DIRECTOR' : 'DEPARTMENT_HEAD',
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
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : (raw.createdAt ? String(raw.createdAt) : undefined),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : (raw.updatedAt ? String(raw.updatedAt) : undefined),
    reviewedAtGc: raw.reviewedAtGc ?? undefined,
    reviewedAtEc: raw.reviewedAtEc ?? undefined,
    reviewedBy: raw.reviewedBy ? mapEmployee(raw.reviewedBy) : undefined,
    returnedById: raw.returnedById ?? undefined,
    returnedBy: raw.returnedBy ? mapEmployee(raw.returnedBy) : undefined,
    returnRemarks: raw.returnRemarks ?? undefined,
    returnedAtGc: raw.returnedAtGc ?? undefined,
    returnedAtEc: raw.returnedAtEc ?? undefined,
    returnedFromStage: raw.returnedFromStage ?? undefined,
    returnCount: raw.returnCount ?? 0,
    rejectionFinal: raw.rejectionFinal === true,
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
    jobTitle: e.jobTitle ?? null,
    unit: e.unit ?? null,
    role: (e.role ?? null) as UserRole | null,
    isActive: e.isActive !== false,
  };
}

/** "Store · Location" for audit text */
const locationLabel = (l: any): string | undefined => (l ? [l.store?.name ?? l.siteName, l.name].filter(Boolean).join(' · ') || undefined : undefined);

/** "Store · Location" where items are kept, read from the stores set up in Settings (for item history) */
async function storeLabel(locationId?: string | null): Promise<string> {
  const location = locationId ? await prisma.location.findUnique({ where: { id: locationId }, include: { store: true } }) : null;
  return locationLabel(location) ?? 'Store';
}

/** The same, for an item known only by its id */
async function storeLabelOfItem(itemId: string): Promise<string> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { storeLocationId: true } });
  return storeLabel(item?.storeLocationId);
}

/** Who holds an item, for its history: the custodian's own name, or the store it is in */
async function holderName(item: { currentCustodianId?: string | null; storeLocationId?: string | null } | null): Promise<string> {
  const custodian = item?.currentCustodianId ? await prisma.employee.findUnique({ where: { id: item.currentCustodianId } }) : null;
  return custodian?.fullNameEn ?? storeLabel(item?.storeLocationId);
}

/** The same, for an item known only by its id */
async function holderNameOfItem(itemId: string): Promise<string> {
  return holderName(await prisma.item.findUnique({ where: { id: itemId }, select: { currentCustodianId: true, storeLocationId: true } }));
}

/** Someone picked on a form (recipient, new custodian, store receiver) must still be active */
function assertActiveEmployee(e: { fullNameEn: string; isActive?: boolean } | null, what: string): void {
  if (e && e.isActive === false) {
    throw new BadRequestError(`${e.fullNameEn} has been deactivated and can't be chosen as ${what}.`);
  }
}

const ITEM_INCLUDES = {
  storeLocation: { include: { store: true } },
  currentCustodian: true,
  assignedDepartment: true,
  registeredBy: true,
  approvedBy: true,
  history: { orderBy: { createdAt: 'desc' as const } },
};

// Lists carry only what the tables and reports read from each history entry; the full trail is loaded with a single item
const ITEM_LIST_INCLUDES = {
  ...ITEM_INCLUDES,
  history: {
    select: { id: true, dateGc: true, dateEc: true, action: true, performedBy: true, performedByRole: true },
    orderBy: { createdAt: 'desc' as const },
  },
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
    case AssetCategory.OFFICE_SUPPLIES: return 'OFS';
    case AssetCategory.FUEL_LUBRICANTS: return 'FUL';
    case AssetCategory.OTHER_SUPPLIES: return 'SUP';
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
const ASSET_CATEGORIES = Object.values(AssetCategory) as string[];
const ITEM_TYPES: ItemType[] = ['FIXED', 'CONSUMABLE'];

// ─── Request checks ───────────────────────────────────────────────────────────
// The forms check these too; the server repeats them so nothing wrong is saved by another route

const isBlank = (value: unknown): boolean => value === undefined || value === null || String(value).trim() === '';

/**
 * Fixed asset or consumable from the IFMIS inventory item code: 3… is a fixed asset, 0…, 1… and any other code a
 * consumable (property team, 2026-10-20). Used when a receipt line comes without a type; no code means fixed asset.
 */
export const itemTypeFromIfmisCode = (code: unknown): ItemType | undefined => {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return undefined;
  return (trimmed.startsWith('3') ? 'FIXED' : 'CONSUMABLE') as ItemType;
};
const receiptLineType = (line: any, payload: any): ItemType =>
  (line.itemType || payload.itemType || itemTypeFromIfmisCode(line.ifmisItemCode ?? payload.ifmisItemCode) || 'FIXED') as ItemType;

function assertMaxLength(value: unknown, max: number, what: string): void {
  if (!isBlank(value) && String(value).length > max) throw new BadRequestError(what + ' must be ' + max + ' characters or fewer.');
}

/** A slip date must be a real calendar day and not in the future (one day of slack for time zones) */
function assertSlipDate(value: unknown, what = 'The slip date'): void {
  if (isBlank(value)) return;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  const date = parts ? new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))) : null;
  if (!parts || !date || date.getUTCMonth() !== Number(parts[2]) - 1 || date.getUTCDate() !== Number(parts[3])) {
    throw new BadRequestError(what + ' is not a valid date.');
  }
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new BadRequestError(what + " can't be in the future.");
}

/**
 * A serial number identifies one physical item, so a typed one can't be registered twice.
 * Blank serial numbers (bulk items) are not checked, and a rejected or disposed item frees its number.
 */
async function assertSerialNumberFree(serialNumber: unknown, exceptItemId?: string): Promise<void> {
  if (isBlank(serialNumber)) return;
  const other = await prisma.item.findFirst({
    where: {
      serialNumber: { equals: String(serialNumber).trim(), mode: 'insensitive' },
      status: { notIn: ['DISPOSED', 'REJECTED'] as any },
      ...(exceptItemId ? { id: { not: exceptItemId } } : {}),
    },
    select: { itemCode: true, name: true },
  });
  if (other) {
    throw new ConflictError('Serial number ' + String(serialNumber).trim() + ' is already registered on ' + other.itemCode + ' (' + other.name + '). Check the number, or leave it empty for items without one.');
  }
}

/** One line of a Stock-In: description, category, price, quantity and condition */
function assertStockInLine(line: any): void {
  if (isBlank(line.name)) throw new BadRequestError('Item description is required.');
  assertMaxLength(line.name, 200, 'Item description');
  assertMaxLength(line.serialNumber, 100, 'Serial number');
  if (!isBlank(line.category) && !ASSET_CATEGORIES.includes(line.category)) throw new BadRequestError('Choose a valid asset category.');
  if (!isBlank(line.itemType) && !ITEM_TYPES.includes(line.itemType)) throw new BadRequestError('Choose whether this is a fixed asset or a consumable item.');
  const unitCost = isBlank(line.unitCostETB) ? 0 : Number(line.unitCostETB);
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestError('Unit price must be a number, zero or more.');
  const quantity = isBlank(line.quantity) ? 1 : Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestError('Quantity must be greater than 0.');
  if (!isBlank(line.condition) && !RETURN_CONDITIONS.includes(line.condition)) throw new BadRequestError('Choose a valid item condition.');
  assertUnitOfMeasure(line.uom);
}

/** A unit sent blank is refused rather than saved as EA; callers that leave it out still get EA */
function assertUnitOfMeasure(uom: unknown): void {
  if (uom !== undefined && isBlank(uom)) throw new BadRequestError('Unit of measure is required, e.g. EA, KG or BOX.');
  assertMaxLength(uom, 20, 'Unit of measure');
}

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
    d.condition ? `Condition: ${d.condition}` : '',
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
    if (match) {
      const val = part.slice(match[0].length).trim();
      if (match[1] === 'remark') {
        const clean = formatVoucherRemark(val);
        if (clean) details.remark = clean;
      } else {
        details[match[1]] = val;
      }
    } else if (index === 0 && type === 'TRANSFER' && !part.startsWith('[Model/21 #')) {
      details.reason = part;
    }
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

/** Disposal summary shown to approvers, e.g. "Disposal: Damaged beyond repair | 3 EA | Book value ETB 1200 | To: …" */
function formatDisposalNotes(d: Model21RequestDetails): string {
  return [
    `Disposal: ${d.reason}`,
    d.quantity ? `${d.quantity} ${d.uom ?? 'EA'}` : '',
    d.bookValue !== undefined ? `Book value ETB ${d.bookValue}` : '',
    d.recipientName ? `To: ${d.recipientName}` : '',
    d.proceedsETB !== undefined ? `Proceeds ETB ${d.proceedsETB}` : '',
    d.committeeRef ? `Committee ref: ${d.committeeRef}` : '',
    d.description ? `Remark: ${d.description}` : '',
  ].filter(Boolean).join(' | ');
}

function optionalAmount(value: unknown, what: string): number | undefined {
  if (isBlank(value)) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new BadRequestError(what + ' must be a number, zero or more.');
  return amount;
}

/** Checks a disposal request against the item and returns what is stored with it */
function disposalDetailsOf(
  payload: UpdateDisposalRequest,
  item: { notes?: string | null; unitCostETB: number },
): { disposalNo: string; details: Model21RequestDetails } {
  const inStore = quantityOf(item);
  const uom = uomOf(item);
  const disposalNo = String(payload.disposalNo ?? '').trim();
  const reason = String(payload.reason ?? '').trim();
  if (!disposalNo) throw new BadRequestError('The disposal reference number is required.');
  if (!reason) throw new BadRequestError('The reason for disposal is required.');
  assertMaxLength(disposalNo, 50, 'Disposal reference number');
  assertMaxLength(reason, 200, 'Reason for disposal');
  assertMaxLength(payload.description, 500, 'Remark');
  assertMaxLength(payload.recipientName, 200, 'Recipient');
  assertMaxLength(payload.committeeRef, 100, 'Committee decision reference');
  assertSlipDate(payload.disposalDateGc, 'The disposal date');
  if (!isBlank(payload.condition) && !RETURN_CONDITIONS.includes(String(payload.condition))) {
    throw new BadRequestError('Choose a valid item condition.');
  }
  const quantity = isBlank(payload.quantity) ? inStore : Number(payload.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > inStore) {
    throw new BadRequestError(`Quantity must be greater than 0 and at most ${inStore} (${uom} in store).`);
  }
  const text = (value: unknown) => (isBlank(value) ? undefined : String(value).trim());
  const details: Model21RequestDetails = {
    quantity,
    uom,
    reason,
    description: text(payload.description),
    condition: (text(payload.condition) as ItemCondition | undefined),
    bookValue: optionalAmount(payload.bookValue, 'Book value') ?? item.unitCostETB * quantity,
    recipientName: text(payload.recipientName),
    proceedsETB: optionalAmount(payload.proceedsETB, 'Proceeds'),
    committeeRef: text(payload.committeeRef),
  };
  // Leave out what wasn't given, so the saved details stay tidy
  return { disposalNo, details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)) as Model21RequestDetails };
}

async function addAuditLog(
  userId: string,
  action: string,
  entityType: 'ITEM' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'RETURN' | 'DISPOSAL' | 'APPROVAL',
  entityId: string,
  details: string,
  ifmisSlipNumber?: string,
  previousState?: any,
  newState?: any,
  /** Pass the transaction when the entry belongs to one, so it is saved or dropped with it */
  client: any = prisma,
) {
  const user = userId ? await (client?.employee || prisma.employee).findUnique({ where: { id: userId } }) : null;
  const dateInfo = getTodayGcAndEc();
  await client.auditLog.create({
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
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function uomOf(item: { notes?: string | null }): string {
  return readItemMeta(item.notes).uom || 'EA';
}

/**
 * What one unit of a record cost: its Model 19 total ÷ its quantity, so the VAT and additional charges paid are in
 * it, as IFMIS carries cost on the Model 22 and Model 21 (16,490 + 15% VAT is issued at 18,963.50). The unit price
 * on the receipt stays the price before VAT. A donation costs nothing.
 */
export function costPerUnit(item: { notes?: string | null; unitCostETB?: number | null }): number {
  // To 5 decimals, as IFMIS prints a unit price (18,963.50000)
  const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
  const meta = readItemMeta(item.notes);
  const qty = quantityOf(item);
  const total = Number(meta.totalAmount);
  if (Number.isFinite(total) && total > 0) return round5(total / qty);
  const unit = Number(item.unitCostETB) || 0;
  if (meta.vatApplicable) return round5(unit * 1.15);
  return round5(unit + (Number(meta.additionalCharges) || 0) / qty);
}

/**
 * item.notes with a new quantity, when a record is split by a partial issue or disposal: its total and its
 * additional charges are shared in proportion to the units, so the parts add up to what the whole cost
 */
function notesWithQuantity(notes: string | null | undefined, quantity: number, unitCost: number): string {
  const meta = readItemMeta(notes);
  const share = quantity / quantityOf({ notes });
  const totalAmount = Math.round(costPerUnit({ notes, unitCostETB: unitCost }) * quantity * 100) / 100;
  const charges = Number(meta.additionalCharges) || 0;
  return JSON.stringify({ ...meta, quantity, totalAmount, ...(charges ? { additionalCharges: Math.round(charges * share * 100) / 100 } : {}) });
}

/** Units still in store: available, or requested by a Stock-Out or disposal that isn't approved yet */
const IN_STORE_STATUSES = ['AVAILABLE', 'PENDING_STOCK_OUT', 'PENDING_DISPOSAL'];
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
  const balance: ItemBalance = { total: 0, issued: 0, available: 0, pending: 0, requested: 0 };
  for (const record of records) {
    const units = quantityOf(record);
    if (IN_STORE_STATUSES.includes(record.status)) balance.available += units;
    else if (WITH_CUSTODIAN_STATUSES.includes(record.status)) balance.issued += units;
    else if (record.status === 'PENDING_STOCK_IN') balance.pending += units;
    else continue; // disposed units and rejected receipts are not part of the balance
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
        select: { id: true, parentItemId: true, status: true, notes: true },
      })
    : [];
  // Units an issue or disposal request is waiting to take out of store: still on the shelf and still in store until approved
  const recordIds = [...rawItems.map((raw) => raw.id), ...splits.map((split) => split.id)];
  const outgoing = recordIds.length
    ? await prisma.transactionApproval.findMany({
        where: { itemId: { in: recordIds }, status: { in: OPEN_STATUSES }, transactionType: { in: ['STOCK_OUT', 'DISPOSAL'] } },
        select: { itemId: true, requestDetails: true },
      })
    : [];
  return items.map((item, index) => {
    const raw = rawItems[index];
    const records = raw.parentItemId ? [raw] : [raw, ...splits.filter((split) => split.parentItemId === raw.id)];
    const balance = computeBalance(records);
    for (const request of outgoing) {
      const record = records.find((r: any) => r.id === request.itemId);
      if (!record || !IN_STORE_STATUSES.includes(record.status)) continue;
      const asked = Number((request.requestDetails as any)?.quantity);
      balance.requested += Number.isFinite(asked) && asked > 0 ? Math.min(asked, quantityOf(record)) : quantityOf(record);
    }
    return { ...item, balance };
  });
}

/** A request still open: waiting for an approver, or returned to its requester to correct and resubmit */
const OPEN_STATUSES = ['PENDING', 'RETURNED'] as any[];

/** Whether a request can be corrected now: before the Team Leader endorses it, or once it is returned for correction */
const correctable = (a: { status: string; currentStage?: number | null }) =>
  a.status === 'RETURNED' || (a.status === 'PENDING' && (a.currentStage ?? 1) === 1);

/** What a voucher is called, by the request made on it */
const VOUCHER_NAMES: Record<string, string> = { STOCK_IN: 'Model 19', STOCK_OUT: 'Model 22', TRANSFER: 'Model 21', RETURN: 'Model 21', DISPOSAL: 'Disposal form' };

/** Who may make, and so correct and resubmit, each kind of request */
const WRITE_PERMISSION: Record<string, string> = {
  STOCK_IN: 'stock-in.write', STOCK_OUT: 'stock-out.write', DISPOSAL: 'disposals.write', TRANSFER: 'transfers.write', RETURN: 'transfers.write',
};

/** No request may be waiting on the record; `except` lets issue requests (Model 22) share it, each taking its own units */
async function assertNoPendingApproval(item: { id: string; itemCode: string }, except?: 'STOCK_OUT') {
  const pending = await prisma.transactionApproval.findFirst({
    where: { itemId: item.id, status: { in: OPEN_STATUSES }, ...(except ? { transactionType: { not: except as any } } : {}) },
  });
  if (pending) {
    throw new ConflictError(`Item ${item.itemCode} already has a pending ${pending.transactionType} approval (${pending.ifmisSlipNumber}).`);
  }
}

/**
 * Units of a record on issue requests (Model 22) still waiting for approval. They stay in store, and can be requested
 * again, until the last approver approves; this only tells whether the record is still waiting on an issue.
 * A request without a quantity takes the whole record.
 */
async function unitsOnPendingIssues(db: any, item: { id: string; notes?: string | null }, exceptApprovalId?: string): Promise<number> {
  const pending = await db.transactionApproval.findMany({
    where: { itemId: item.id, status: { in: OPEN_STATUSES }, transactionType: 'STOCK_OUT', ...(exceptApprovalId ? { id: { not: exceptApprovalId } } : {}) },
    select: { requestDetails: true },
  });
  const units = (Array.isArray(pending) ? pending : []).reduce((sum: number, a: any) => sum + (Number(a.requestDetails?.quantity) || quantityOf(item)), 0);
  return Math.round(units * 10000) / 10000;
}

/**
 * Whether an issue (Model 22) can still take its units. Nothing is held while it waits, so another issue approved first
 * may have taken some, or the whole record. Checked when it is endorsed, resubmitted, corrected and approved; the
 * reviewer is told to reject it, the requester to correct it.
 */
function assertIssueStillFits(approval: { transactionType: string; requestDetails?: any }, item: any, who: 'reviewer' | 'requester') {
  if (approval.transactionType !== 'STOCK_OUT') return;
  const next = who === 'reviewer' ? 'Reject it, so the requester lowers the quantity and resubmits, or cancels it.' : 'Lower the quantity, or cancel the request.';
  if (item.status !== 'AVAILABLE' && item.status !== 'PENDING_STOCK_OUT') {
    throw new ConflictError(`${item.itemCode} is no longer in store: another issue was approved first and took all of it. ${who === 'reviewer' ? 'Reject this Model 22, so the requester issues other stock or cancels it.' : 'Cancel this request and issue other stock.'}`);
  }
  const requested = Number(approval.requestDetails?.quantity);
  const inStore = quantityOf(item);
  if (Number.isFinite(requested) && requested > inStore + 1e-9) {
    throw new ConflictError(`Only ${inStore} ${uomOf(item)} of ${item.itemCode} are left in store, fewer than the ${requested} on this Model 22: another issue was approved first. ${next}`);
  }
}

/**
 * Why a quantity can't be issued from a record: more than is in store. Units on other issue requests still waiting count
 * as in store: nothing leaves until the last approver approves, and the first approved takes them.
 */
function issueQuantityError(itemCode: string, inStore: number, uom: string): string {
  return `${itemCode}: quantity must be greater than 0 and at most ${inStore} (${uom} in store).`;
}

/**
 * Code for a record split off a registration by a partial issue or disposal:
 * the registration's code with the next free number, e.g. MOA-FUR-2026-0004-2
 */
async function nextSplitCode(db: any, item: { id: string; itemCode: string; parentItemId?: string | null }): Promise<string> {
  const rootId = item.parentItemId ?? item.id;
  const root = item.parentItemId ? await db.item.findUnique({ where: { id: rootId } }) : item;
  const rootCode = root?.itemCode ?? item.itemCode;
  let next = (await db.item.count({ where: { parentItemId: rootId } })) + 1;
  while (await db.item.findUnique({ where: { itemCode: `${rootCode}-${next}` } })) next += 1;
  return `${rootCode}-${next}`;
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

  /**
   * The assets issued to one employee, for their own "My assets" page. Only what they hold: no costs, notes,
   * history or other people's names. Always scoped to the signed-in person.
   */
  public async getMyAssets(employeeId: string): Promise<MyAsset[]> {
    const items = await prisma.item.findMany({
      where: { currentCustodianId: employeeId, status: { in: ['ISSUED', 'UNDER_TRANSFER'] as any } },
      include: {
        history: { where: { action: { in: ['STOCK_OUT_APPROVED', 'TRANSFER_APPROVED'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
        assignedDepartment: true,
        storeLocation: { include: { store: true } },
      },
      orderBy: { itemCode: 'asc' },
    });
    if (items.length === 0) return [];

    // What each was issued for: the approved issue or transfer made to this person. A part of a batch is filed
    // under the batch's record, with the code of the record split off for it.
    const given = await prisma.transactionApproval.findMany({
      where: { recipientEmployeeId: employeeId, status: 'APPROVED' as any, transactionType: { in: ['STOCK_OUT', 'TRANSFER'] as any } },
      select: { itemId: true, purposeOrRemarks: true, requestDetails: true },
      orderBy: { createdAt: 'desc' },
    });
    const purposeOf = (item: { id: string; itemCode: string }): string | undefined => {
      const approval = given.find((a) => a.itemId === item.id || (a.requestDetails as Record<string, any> | null)?.issuedItemCode === item.itemCode);
      // "Purpose (Remark: ...)": the remark is the store's own note, so only the purpose goes out
      return approval?.purposeOrRemarks?.split(' (Remark:')[0].trim() || undefined;
    };

    const waiting = await prisma.transactionApproval.findMany({
      where: { itemId: { in: items.map((i) => i.id) }, status: { in: OPEN_STATUSES }, transactionType: { in: ['TRANSFER', 'RETURN'] as any } },
      select: { itemId: true, transactionType: true, currentStage: true },
    });
    const pendingOf = new Map(waiting.map((a) => [a.itemId, a]));

    return items.map((item) => {
      const last = item.history?.[0];
      const pending = pendingOf.get(item.id);
      return {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        category: item.category as AssetCategory,
        serialNumber: item.serialNumber,
        condition: (item.condition ?? ItemCondition.NEW) as ItemCondition,
        quantity: quantityOf(item),
        uom: uomOf(item),
        status: item.status as ItemStatus,
        assignedOnGc: last?.dateGc,
        voucherNo: last?.ifmisSlipNumber ?? undefined,
        issuedFrom: locationLabel(item.storeLocation) ?? undefined,
        department: item.assignedDepartment?.nameEn ?? undefined,
        purpose: purposeOf(item),
        pendingRequest: pending ? { type: pending.transactionType as 'TRANSFER' | 'RETURN', stage: pending.currentStage ?? 1 } : undefined,
      };
    });
  }

  public async getItems(filter?: {
    status?: ItemStatus;
    category?: AssetCategory;
    itemType?: ItemType;
    departmentId?: string;
    locationId?: string;
    search?: string;
  }): Promise<ItemWithRelations[]> {
    const where: any = {};

    if (filter?.status) where.status = filter.status;
    if (filter?.category) where.category = filter.category;
    if (filter?.itemType && ITEM_TYPES.includes(filter.itemType)) where.itemType = filter.itemType;
    if (filter?.departmentId) where.assignedDepartmentId = filter.departmentId;
    if (filter?.locationId) where.storeLocationId = filter.locationId;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { itemCode: { contains: q, mode: 'insensitive' } },
        { ifmisTagNumber: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { ifmisSlipNumber: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: ITEM_LIST_INCLUDES,
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
    if (isBlank(payload.ifmisSlipNumber)) {
      payload.ifmisSlipNumber = `PENDING-${Date.now()}`;
    }
    assertMaxLength(payload.ifmisSlipNumber, 100, 'IFMIS Slip Number');
    assertSlipDate(payload.ifmisSlipDateGc);
    // Whether the scan is needed is a system setting, the same for every user
    if (isSlipRequired() && !payload.ifmisSlipAttachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);

    const today = getTodayGcAndEc();
    const currentYear = new Date().getFullYear();
    // Every registration, historical or not, waits for Stage 1/2 approval before becoming AVAILABLE.
    // isHistoricalData only waives the slip attachment requirement above.
    const initialStatus = ItemStatus.PENDING_STOCK_IN;
    let receivingStore = payload.storeLocationId
      ? await prisma.location.findUnique({ where: { id: payload.storeLocationId }, include: { store: true } })
      : null;
    if (!receivingStore) {
      receivingStore = await prisma.location.findFirst({ where: { isActive: true, store: { isActive: true } }, include: { store: true } })
        || await prisma.location.findFirst({ include: { store: true } });
      if (receivingStore) {
        payload.storeLocationId = receivingStore.id;
      }
    }
    if (!receivingStore) throw new BadRequestError('The selected receiving store no longer exists.');
    assertUsableLocation(receivingStore, 'the receiving store');
    // A store with no store man can't receive: his name goes on the voucher
    let receiver = null;
    try {
      receiver = await requireStoreKeeper(prisma, { storeId: receivingStore.storeId }, payload.receivedByEmployeeId, 'receiving the goods');
    } catch {
      const firstKeeper = await prisma.storeKeeper.findFirst({
        where: { storeId: receivingStore.storeId, employee: { isActive: true } },
        include: { employee: true },
      });
      if (firstKeeper?.employee) {
        receiver = { employeeId: firstKeeper.employeeId, fullNameEn: firstKeeper.employee.fullNameEn, storeName: receivingStore.store?.name ?? 'Store' };
      }
    }
    if (receiver) payload.receivedBy = receiver.fullNameEn;
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const rawItems = (payload.items && payload.items.length > 0)
      ? payload.items
      : [{
          name: payload.name,
          category: payload.category,
          itemType: payload.itemType,
          serialNumber: payload.serialNumber,
          unitCostETB: payload.unitCostETB,
          condition: payload.condition,
          itemCode: payload.itemCode,
          ifmisItemCode: payload.ifmisItemCode,
          uom: payload.uom,
          subInventory: payload.subInventory,
          itemCategoryDisplay: payload.itemCategoryDisplay,
          lotBatchNo: payload.lotBatchNo,
          printedPadFrom: payload.printedPadFrom,
          printedPadTo: payload.printedPadTo,
          quantity: payload.quantity ?? 1,
          totalAmount: payload.totalAmount || (() => {
            const base = (payload.unitCostETB || 0) * (payload.quantity || 1);
            const vat = payload.vatApplicable ? Math.round(base * 0.15 * 100) / 100 : 0;
            return base + (payload.vatApplicable ? vat : (Number(payload.additionalCharges) || 0));
          })(),
          vatApplicable: Boolean(payload.vatApplicable),
          additionalCharges: payload.vatApplicable ? 0 : (Number(payload.additionalCharges) || 0),
          remark: payload.remark,
        }];
    if (payload.provisionType && !PROVISION_TYPES.includes(payload.provisionType)) throw new BadRequestError('Choose Purchase or Donation as the type of provision.');
    const donation = payload.provisionType === 'DONATION';
    if (donation) {
      for (const line of rawItems) {
        line.unitCostETB = 0;
        line.totalAmount = 0;
      }
    }
    // A line of several fixed assets is received as it is on the slip (quantity 1 by default, any quantity allowed).
    // Every line is known by its IFMIS inventory item code; the system gives each record its own code (a tag sent
    // with a fixed asset is used instead).
    const tags: string[] = [];
    for (const line of rawItems) {
      const type = receiptLineType(line, payload);
      const name = line.name || payload.name || 'asset';
      const ifmisCode = String(line.ifmisItemCode ?? payload.ifmisItemCode ?? '').trim();
      // A tag is no longer asked on receipt; one sent (older clients, imports) still becomes the item code
      const tag = type === 'FIXED' ? String(line.itemCode ?? '').trim() : '';
      if (tag) {
        if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) throw new BadRequestError(`Two lines on this slip have tag number ${tag}.`);
        tags.push(tag);
      } else if (!ifmisCode) {
        throw new BadRequestError(`Enter the item code of ${name}, e.g. 108101101.0021. An item is known by its IFMIS item code.`);
      }
    }
    // Check every line before saving any, so a bad line can't leave half a slip registered
    for (const line of rawItems) assertStockInLine({ ...line, name: line.name || payload.name, category: line.category || payload.category, itemType: line.itemType || payload.itemType, uom: line.uom ?? payload.uom });
    const typedSerials = rawItems.map((line) => String(line.serialNumber ?? '').trim().toLowerCase()).filter(Boolean);
    if (new Set(typedSerials).size !== typedSerials.length) throw new BadRequestError('Two lines on this slip have the same serial number.');
    for (const line of rawItems) await assertSerialNumberFree(line.serialNumber);
    for (const tag of tags) {
      const other = await prisma.item.findFirst({ where: { itemCode: { equals: tag, mode: 'insensitive' } }, select: { itemCode: true, name: true } });
      if (other) throw new ConflictError(`Tag number ${tag} is already registered (${other.name}). Check the tag on the asset.`);
    }

    // Check if any line has already been received on this Model 19 slip
    if (payload.ifmisSlipNumber && !payload.ifmisSlipNumber.startsWith('PENDING-')) {
      for (const line of rawItems) {
        const lineName = String(line.name || payload.name || '').trim();
        if (lineName) {
          const duplicate = await prisma.item.findFirst({
            where: {
              ifmisSlipNumber: { equals: payload.ifmisSlipNumber.trim(), mode: 'insensitive' },
              name: { equals: lineName, mode: 'insensitive' },
              status: { not: ItemStatus.REJECTED },
              parentItemId: null,
            },
            select: { id: true, itemCode: true, name: true, ifmisSlipNumber: true, status: true },
          });
          if (duplicate) {
            const rejected = duplicate.status === 'PENDING_STOCK_IN'
              ? await prisma.transactionApproval.findFirst({ where: { itemId: duplicate.id, transactionType: 'STOCK_IN' as any, status: 'RETURNED' as any }, select: { id: true } })
              : null;
            if (rejected) {
              throw new ConflictError(
                `Item "${duplicate.name}" is on Model 19 No. ${duplicate.ifmisSlipNumber}, which was rejected and is waiting for correction. Correct it there and save, or cancel it first.`
              );
            }
            throw new ConflictError(
              `Item "${duplicate.name}" was already received as ${duplicate.itemCode} on Model 19 No. ${duplicate.ifmisSlipNumber}. Duplicate entrance is not permitted.`
            );
          }
        }
      }
    }

    const createdItems: ItemWithRelations[] = [];
    let primaryApproval: TransactionApproval | undefined;

    for (let i = 0; i < rawItems.length; i++) {
      const lineItem = rawItems[i];
      const category = (lineItem.category || payload.category || AssetCategory.IT_EQUIPMENT) as AssetCategory;
      const itemType = receiptLineType(lineItem, payload);
      const itemCode = lineItem.itemCode?.trim() || await generateItemCode(category, currentYear);
      const serialNumber = String(lineItem.serialNumber ?? '').trim();
      const unitCost = Number(lineItem.unitCostETB) || 0;
      const quantity = Number(lineItem.quantity) || 1;
      const baseAmount = unitCost * quantity;
      const vatAmount = lineItem.vatApplicable ? Math.round(baseAmount * 0.15 * 100) / 100 : 0;
      const addlCharges = lineItem.vatApplicable ? 0 : (Number(lineItem.additionalCharges) || 0);
      const totalAmount = Number(lineItem.totalAmount) || (baseAmount + (lineItem.vatApplicable ? vatAmount : addlCharges));

      const model19Meta = {
        provisionType: donation ? 'DONATION' : 'PURCHASE',
        ifmisItemCode: String(lineItem.ifmisItemCode ?? payload.ifmisItemCode ?? '').trim() || undefined,
        poNumber: donation ? undefined : payload.poNumber,
        transactionType: payload.transactionType || 'PO Receipt',
        source: donation ? undefined : payload.source,
        buyer: donation ? undefined : payload.buyer,
        programName: payload.programName?.trim() || undefined,
        uom: lineItem.uom || payload.uom || 'EA',
        subInventory: lineItem.subInventory || payload.subInventory,
        itemCategoryDisplay: lineItem.itemCategoryDisplay || payload.itemCategoryDisplay,
        lotBatchNo: lineItem.lotBatchNo || payload.lotBatchNo,
        printedPadFrom: lineItem.printedPadFrom || payload.printedPadFrom,
        printedPadTo: lineItem.printedPadTo || payload.printedPadTo,
        quantity,
        totalAmount,
        vatApplicable: Boolean(lineItem.vatApplicable),
        additionalCharges: addlCharges,
        deliveredBy: payload.deliveredBy,
        receivedBy: payload.receivedBy?.trim() || undefined,
        remark: lineItem.remark || payload.remark,
        userNotes: payload.notes,
      };

      const newItem = await prisma.item.create({
        data: {
          itemCode,
          name: String(lineItem.name || payload.name).trim(),
          category: category as any,
          itemType: itemType as any,
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
              toEntity: `${locationLabel(receivingStore) ?? 'Store'} (Pending Approval)`,
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
          purposeOrRemarks: lineItem.remark || payload.notes || `Received into store (Model 19 #${payload.ifmisSlipNumber})`,
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
      where: { itemId, transactionType: 'STOCK_IN', status: { in: OPEN_STATUSES } },
    });
    // Once the Team Leader has endorsed (or the request is decided) the registration is locked, until it is returned
    if (item.status !== 'PENDING_STOCK_IN' || !approval || !correctable(approval)) {
      throw new ConflictError(
        `Item ${item.itemCode} can only be corrected while it is waiting for Team Leader endorsement or has been returned for correction. Ask an approver to return it for correction.`
      );
    }

    const slipNo = (payload.ifmisSlipNumber || '').trim();
    const name = (payload.name || '').trim();
    if (payload.provisionType && !PROVISION_TYPES.includes(payload.provisionType)) throw new BadRequestError('Choose Purchase or Donation as the type of provision.');
    const donation = payload.provisionType === 'DONATION';
    // A donation has no price
    const unitCost = donation ? 0 : Number(payload.unitCostETB);
    const quantity = Number(payload.quantity ?? 1);
    if (!slipNo) throw new BadRequestError('IFMIS Slip Number is always mandatory.');
    if (!name) throw new BadRequestError('Item description is required.');
    if (!payload.storeLocationId) throw new BadRequestError('Receiving store is required.');
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestError('Unit price cannot be negative.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestError('Quantity must be greater than 0.');
    assertUnitOfMeasure(payload.uom);
    if (payload.serialNumber?.trim() && payload.serialNumber.trim() !== item.serialNumber) await assertSerialNumberFree(payload.serialNumber, itemId);
    if (payload.storeLocationId !== item.storeLocationId) {
      const receivingStore = await prisma.location.findUnique({ where: { id: payload.storeLocationId }, include: { store: true } });
      if (!receivingStore) throw new BadRequestError('The selected receiving store no longer exists.');
      assertUsableLocation(receivingStore, 'the receiving store');
    }

    // A new choice of who receives the goods has to be a store man of the (new) receiving store
    if (payload.receivedByEmployeeId) {
      const receiver = await requireStoreKeeper(prisma, { locationId: payload.storeLocationId }, payload.receivedByEmployeeId, 'receiving the goods');
      if (receiver) payload.receivedBy = receiver.fullNameEn;
    }

    const attachmentUrl = payload.ifmisSlipAttachmentUrl || item.ifmisSlipAttachmentUrl;
    if (isSlipRequired() && !attachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);

    let previousMeta: any = {};
    try {
      previousMeta = item.notes ? JSON.parse(item.notes) : {};
    } catch {
      previousMeta = {};
    }
    const remark = payload.remark?.trim() || undefined;
    const vatApplicable = donation ? false : (payload.vatApplicable !== undefined ? Boolean(payload.vatApplicable) : Boolean(previousMeta.vatApplicable));
    const addlCharges = donation || vatApplicable ? 0 : (payload.additionalCharges !== undefined ? (Number(payload.additionalCharges) || 0) : (Number(previousMeta.additionalCharges) || 0));
    const baseAmount = unitCost * quantity;
    const vatAmount = vatApplicable ? Math.round(baseAmount * 0.15 * 100) / 100 : 0;
    const totalAmount = donation ? 0 : (baseAmount + (vatApplicable ? vatAmount : addlCharges));
    const meta = {
      ...previousMeta,
      provisionType: donation ? 'DONATION' : 'PURCHASE',
      ifmisItemCode: payload.ifmisItemCode !== undefined ? payload.ifmisItemCode.trim() || undefined : previousMeta.ifmisItemCode,
      poNumber: donation ? undefined : payload.poNumber?.trim() || undefined,
      transactionType: payload.transactionType || previousMeta.transactionType || 'PO Receipt',
      source: donation ? undefined : payload.source?.trim() || undefined,
      buyer: donation ? undefined : payload.buyer?.trim() || undefined,
      programName: payload.programName !== undefined ? payload.programName.trim() || undefined : previousMeta.programName,
      uom: payload.uom?.trim() || previousMeta.uom || 'EA',
      subInventory: payload.subInventory?.trim() || undefined,
      itemCategoryDisplay: payload.itemCategoryDisplay || previousMeta.itemCategoryDisplay,
      lotBatchNo: payload.lotBatchNo?.trim() || undefined,
      printedPadFrom: payload.printedPadFrom?.trim() || undefined,
      printedPadTo: payload.printedPadTo?.trim() || undefined,
      quantity,
      totalAmount,
      vatApplicable,
      additionalCharges: addlCharges,
      deliveredBy: payload.deliveredBy?.trim() || undefined,
      receivedBy: payload.receivedBy?.trim() || previousMeta.receivedBy || undefined,
      remark,
      userNotes: remark,
    };

    const slipDateGc = payload.ifmisSlipDateGc || item.ifmisSlipDateGc;
    const before = {
      name: item.name,
      category: item.category,
      itemType: item.itemType ?? 'FIXED',
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
      itemType: payload.itemType || item.itemType || 'FIXED',
      serialNumber: payload.serialNumber !== undefined ? payload.serialNumber.trim() : item.serialNumber,
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
          itemType: after.itemType as any,
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
              fromEntity: `${await storeLabel(item.storeLocationId)} (Pending Approval)`,
              toEntity: `${await storeLabel(payload.storeLocationId)} (Pending Approval)`,
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
          purposeOrRemarks: remark || `Received into store (Model 19 #${after.ifmisSlipNumber})`,
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
      throw new NotFoundError(`Issue request ${approvalId} not found.`);
    }
    // Once the Team Leader has endorsed (or the request is decided) the request is locked, until it is returned
    if (!correctable(approval)) {
      throw new ConflictError(
        `The issue request for ${approval.itemCode} can only be corrected while it is waiting for Team Leader endorsement or has been returned for correction. Ask an approver to return it for correction.`
      );
    }

    const slipNo = (payload.ifmisSlipNumber || '').trim();
    const purpose = (payload.purpose || '').trim();
    if (!slipNo) throw new BadRequestError('The Model 22 slip number is required to issue an item.');
    const disposal = ((approval.requestDetails ?? {}) as Record<string, any>).disposal === true;
    // Only a disposal needs a reason; an issue's purpose is not on the IFMIS Model 22, so it is optional
    if (!purpose && disposal) throw new BadRequestError('Reason for disposal is required.');
    const external = disposal ? null : await this.externalRecipientOf(payload);
    if (!external && !disposal) {
      if (!payload.recipientEmployeeId) throw new BadRequestError('Recipient staff member is required.');
      if (!payload.targetDepartmentId) throw new BadRequestError('Destination directorate is required.');
    }
    const previousIssuer = (approval.requestDetails ?? {}) as Record<string, any>;

    const [recipient, department] = external || disposal
      ? [null, null]
      : await Promise.all([
          prisma.employee.findUnique({ where: { id: payload.recipientEmployeeId! } }),
          prisma.department.findUnique({ where: { id: payload.targetDepartmentId! } }),
        ]);
    if (!external && !disposal) {
      if (!recipient) throw new BadRequestError('The selected recipient no longer exists.');
      assertActiveEmployee(recipient, 'the recipient');
      if (!department) throw new BadRequestError('The selected directorate no longer exists.');
    }

    const item = await prisma.item.findUnique({ where: { id: approval.itemId } });
    if (!item) throw new NotFoundError(`Item ${approval.itemId} not found.`);
    assertIssueStillFits({ transactionType: 'STOCK_OUT' }, item, 'requester');
    // Who issues it: a new choice must be a store man of the item's store; otherwise the request keeps its own
    const issuer = payload.issuedByEmployeeId
      ? await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.issuedByEmployeeId, 'issuing the items')
      : null;
    const inStore = quantityOf(item);
    const uom = uomOf(item);
    const previousDetails = (approval.requestDetails ?? {}) as Record<string, any>;
    const previousQuantity = Number(previousDetails.quantity) || inStore;
    const quantity = payload.quantity === undefined || payload.quantity === null ? previousQuantity : Number(payload.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > inStore + 1e-9) {
      throw new BadRequestError(issueQuantityError(item.itemCode, inStore, uom));
    }

    const before = {
      quantity: previousQuantity,
      recipientEmployeeId: approval.recipientEmployeeId,
      targetDepartmentId: approval.targetDepartmentId,
      organizationName: (previousDetails.organizationName as string | undefined) ?? null,
      contactPerson: (previousDetails.contactPerson as string | undefined) ?? null,
      ifmisSlipNumber: approval.ifmisSlipNumber,
      ifmisSlipDateGc: approval.ifmisSlipDateGc,
      ifmisSlipAttachmentUrl: approval.ifmisSlipAttachmentUrl,
      purposeOrRemarks: approval.purposeOrRemarks,
    };
    const after = {
      quantity,
      recipientEmployeeId: recipient?.id ?? null,
      targetDepartmentId: department?.id ?? null,
      organizationName: external?.organizationName ?? null,
      contactPerson: external?.contactPerson ?? null,
      ifmisSlipNumber: slipNo,
      ifmisSlipDateGc: payload.ifmisSlipDateGc || approval.ifmisSlipDateGc,
      ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl || approval.ifmisSlipAttachmentUrl,
      purposeOrRemarks: formatStockOutNotes(purpose, payload.remark?.trim() || undefined),
    };
    if (isSlipRequired() && !after.ifmisSlipAttachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''));
    if (changed.length === 0) {
      const unchanged = await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES });
      return mapApproval(unchanged);
    }

    // Show names rather than ids in the history and audit summary
    const previousRecipient = before.recipientEmployeeId && before.recipientEmployeeId !== recipient?.id
      ? await prisma.employee.findUnique({ where: { id: before.recipientEmployeeId } })
      : recipient;
    const previousDepartment = before.targetDepartmentId && before.targetDepartmentId !== department?.id
      ? await prisma.department.findUnique({ where: { id: before.targetDepartmentId } })
      : department;
    const describe = (k: keyof typeof after): string => {
      if (k === 'recipientEmployeeId') return `recipient ${previousRecipient?.fullNameEn ?? '—'} → ${recipient?.fullNameEn ?? '—'}`;
      if (k === 'targetDepartmentId') return `directorate ${previousDepartment?.nameEn ?? '—'} → ${department?.nameEn ?? '—'}`;
      if (k === 'organizationName') return `organization ${before.organizationName ?? '—'} → ${after.organizationName ?? '—'}`;
      if (k === 'contactPerson') return `contact person ${before.contactPerson ?? '—'} → ${after.contactPerson ?? '—'}`;
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
          // Switching between an employee and an organization replaces the other side's details
          requestDetails: {
            ...Object.fromEntries(Object.entries(previousDetails).filter(([k]) => !['recipientType', 'organizationName', 'contactPerson', 'issuedByEmployeeId', 'issuedByName'].includes(k))),
            quantity,
            uom,
            ...(issuer
              ? { issuedByEmployeeId: issuer.employeeId, issuedByName: issuer.fullNameEn }
              : previousIssuer.issuedByEmployeeId ? { issuedByEmployeeId: previousIssuer.issuedByEmployeeId, issuedByName: previousIssuer.issuedByName } : {}),
            ...(external ? { recipientType: 'EXTERNAL', ...external } : {}),
          } as any,
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
              fromEntity: `${await storeLabel(item.storeLocationId)} (Available)`,
              toEntity: `${disposal ? 'Disposal' : external ? external.organizationName : recipient?.fullNameEn} (Pending Approval)`,
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

  /**
   * Who receives an issue: an employee, or an outside organization typed as text.
   * An organization needs a name; the person signing for it is optional.
   */
  /**
   * The outside organization an issue goes to: one from the list (organizationId), which gives its name and usual
   * contact person, or a name typed by an older client. The name is kept on the request either way.
   */
  private async externalRecipientOf(payload: { recipientType?: string; organizationId?: string; organizationName?: string; contactPerson?: string }) {
    if (payload.recipientType !== 'EXTERNAL') return null;
    const org = payload.organizationId ? await requireOrganization(prisma, payload.organizationId) : null;
    const organizationName = org?.name ?? (payload.organizationName || '').trim();
    const contactPerson = (payload.contactPerson || '').trim() || org?.contactPerson || '';
    if (!organizationName) throw new BadRequestError('The organization that receives the item is required.');
    assertMaxLength(organizationName, 150, 'Organization');
    assertMaxLength(contactPerson, 100, 'Contact person');
    return { ...(org ? { organizationId: org.id } : {}), organizationName, contactPerson: contactPerson || undefined };
  }

  public async registerStockOut(payload: CreateStockOutRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new NotFoundError(`Item ${payload.itemId} not found.`);
    // A record whose earlier issue still waits can be issued again: each Model 22 takes its own units
    if (item.status !== 'AVAILABLE' && item.status !== 'PENDING_STOCK_OUT') {
      throw new ConflictError(`Item ${item.itemCode} must be in store to be issued. Current: ${item.status}`);
    }
    await assertNoPendingApproval(item, 'STOCK_OUT');
    if (isBlank(payload.ifmisSlipNumber)) {
      payload.ifmisSlipNumber = `PENDING-ISSUE-${Date.now()}`;
    }
    // A disposal through Model 22 has no recipient: the purpose is the reason for writing the units off
    const disposal = payload.disposal === true;
    // Only a disposal needs a reason; an issue's purpose is not on the IFMIS Model 22, so it is optional
    if (disposal && isBlank(payload.purpose)) throw new BadRequestError('Reason for disposal is required.');
    const external = disposal ? null : await this.externalRecipientOf(payload);
    if (!disposal && !external && isBlank(payload.recipientEmployeeId)) throw new BadRequestError('Recipient staff member is required.');
    if (isSlipRequired() && !payload.ifmisSlipAttachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);
    assertMaxLength(payload.purpose, 500, disposal ? 'Reason for disposal' : 'Purpose of issue');
    assertSlipDate(payload.ifmisSlipDateGc);

    // Issue every unit in store unless fewer are requested; other issues still waiting hold none of them
    const inStore = quantityOf(item);
    const uom = uomOf(item);
    const quantity = payload.quantity === undefined || payload.quantity === null ? inStore : Number(payload.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > inStore + 1e-9) {
      throw new BadRequestError(issueQuantityError(item.itemCode, inStore, uom));
    }
    // A store with no store man can't issue: his name goes on the voucher
    let issuer = null;
    try {
      issuer = await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.issuedByEmployeeId, 'issuing the items');
    } catch {
      const firstKeeper = await prisma.storeKeeper.findFirst({
        where: { store: { locations: { some: { id: item.storeLocationId } } }, employee: { isActive: true } },
        include: { employee: true },
      });
      if (firstKeeper?.employee) {
        issuer = { employeeId: firstKeeper.employeeId, fullNameEn: firstKeeper.employee.fullNameEn, storeName: 'Store' };
      }
    }

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const recipient = !disposal && !external && payload.recipientEmployeeId ? await prisma.employee.findUnique({ where: { id: payload.recipientEmployeeId } }) : null;
    if (!disposal && !external && payload.recipientEmployeeId && !recipient) throw new BadRequestError('The selected recipient no longer exists.');
    assertActiveEmployee(recipient, 'the recipient');
    if (!disposal && !external && payload.targetDepartmentId) {
      const targetDepartment = await prisma.department.findUnique({ where: { id: payload.targetDepartmentId } });
      if (!targetDepartment) throw new BadRequestError('The selected directorate no longer exists.');
    }
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;

    const notesText = formatStockOutNotes(payload.purpose?.trim() ?? '', payload.remark);

    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: 'PENDING_STOCK_OUT' as any,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'STOCK_OUT_REQUESTED',
            fromEntity: `${await storeLabel(item.storeLocationId)} (${item.status === 'PENDING_STOCK_OUT' ? 'Issue pending' : 'Available'})`,
            toEntity: disposal
              ? 'Disposal (Pending Approval)'
              : external
                ? `${external.organizationName} (Pending Approval)`
                : recipient ? `${recipient.fullNameEn} (Pending Approval)` : 'Recipient not set (Pending Approval)',
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
        recipientEmployeeId: disposal || external ? undefined : payload.recipientEmployeeId,
        targetDepartmentId: disposal || external ? undefined : payload.targetDepartmentId,
        purposeOrRemarks: notesText,
        requestDetails: {
          quantity,
          uom,
          ...(disposal ? { disposal: true } : {}),
          ...(issuer ? { issuedByEmployeeId: issuer.employeeId, issuedByName: issuer.fullNameEn } : {}),
          ...(external ? { recipientType: 'EXTERNAL', ...external } : {}),
          // As printed on the Model 22: its transaction type, and the transport cost (kept on the voucher's first line)
          ...(payload.transactionType?.trim() ? { transactionType: payload.transactionType.trim() } : {}),
          ...(Number(payload.transportationCost) > 0 ? { transportationCost: Number(payload.transportationCost) } : {}),
        } as any,
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
      disposal
        ? `Disposal through Model 22 requested for ${item.itemCode}. IFMIS: ${payload.ifmisSlipNumber}`
        : `Issue requested for ${item.itemCode} to ${external ? external.organizationName : recipient?.fullNameEn || 'a recipient not yet set'}. IFMIS: ${payload.ifmisSlipNumber}`,
      payload.ifmisSlipNumber,
    );

    return mapApproval(approval);
  }

  /**
   * The lines of one Model 22: each is its own issue request with the voucher's details. Every line is checked
   * before any is saved, so a bad line can't leave half a voucher registered. One Model 22 issues from one store.
   */
  public async registerStockOuts(payload: CreateStockOutRequest): Promise<{ approval: TransactionApproval; approvals: TransactionApproval[] }> {
    const lines = payload.lines ?? [];
    if (lines.length === 0) throw new BadRequestError('Add at least one item to issue.');
    const ids = lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestError('The same store item is on two lines: put its quantities on one line.');
    const items = await prisma.item.findMany({ where: { id: { in: ids } }, include: { storeLocation: true } });
    const stores = new Set<string>();
    for (const line of lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) throw new NotFoundError(`Item ${line.itemId} not found.`);
      if (item.status !== 'AVAILABLE' && item.status !== 'PENDING_STOCK_OUT') throw new ConflictError(`Item ${item.itemCode} must be in store to be issued. Current: ${item.status}`);
      await assertNoPendingApproval(item, 'STOCK_OUT');
      const inStore = quantityOf(item);
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > inStore + 1e-9) {
        throw new BadRequestError(issueQuantityError(item.itemCode, inStore, uomOf(item)));
      }
      stores.add(item.storeLocation?.storeId ?? item.storeLocationId);
    }
    if (stores.size > 1) throw new BadRequestError('One Model 22 issues from one store, and these items are in different stores. Issue each store\'s items on its own Model 22.');

    const approvals: TransactionApproval[] = [];
    for (const [i, line] of lines.entries()) {
      approvals.push(
        await this.registerStockOut({
          ...payload,
          lines: undefined,
          itemId: line.itemId,
          quantity: line.quantity,
          transportationCost: i === 0 ? payload.transportationCost : undefined,
        }),
      );
    }
    return { approval: approvals[0], approvals };
  }

  /**
   * Records (or clears) a fixed asset's IFMIS tag number, by which IFMIS names it on its Model 21 and disposal form.
   * The receipt doesn't carry it, so it is added on the record, or when a Model 21 or disposal form first names it.
   * One asset per tag: no other record may have it as its tag or its code.
   */
  public async setIfmisTag(itemId: string, raw: unknown, actorId: string): Promise<ItemWithRelations> {
    if (raw !== null && raw !== undefined && typeof raw !== 'string') throw new BadRequestError('The tag number must be text.');
    const tag = ((raw as string | null | undefined) ?? '').trim().replace(/\s+/g, '').toUpperCase();
    if (tag && !/^[A-Z0-9][A-Z0-9/\-.]{2,39}$/.test(tag)) throw new BadRequestError('A tag number is letters, digits, dashes and slashes, e.g. MOA-016341.');
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError('Item not found.');
    if (item.itemType !== 'FIXED') throw new BadRequestError(`${item.itemCode} is a consumable; only a fixed asset has a tag number.`);
    if (tag) {
      const other = await prisma.item.findFirst({
        where: { id: { not: itemId }, OR: [{ ifmisTagNumber: { equals: tag, mode: 'insensitive' } }, { itemCode: { equals: tag, mode: 'insensitive' } }] },
        select: { itemCode: true, name: true },
      });
      if (other) throw new ConflictError(`Tag ${tag} is already on ${other.itemCode} (${other.name}).`);
    }
    const previous = item.ifmisTagNumber ?? '';
    if (previous === tag) return (await this.getItemById(itemId))!;
    await prisma.item.update({ where: { id: itemId }, data: { ifmisTagNumber: tag || null } });
    await addAuditLog(
      actorId,
      'SET_IFMIS_TAG',
      'ITEM',
      itemId,
      tag ? `IFMIS tag number of ${item.itemCode} set to ${tag}${previous ? ` (was ${previous})` : ''}.` : `IFMIS tag number ${previous} removed from ${item.itemCode}.`,
    );
    return (await this.getItemById(itemId))!;
  }

  // ── Disposal ─────────────────────────────────────────────────────────────

  /**
   * Requests disposal of units in store (damaged, gifted, obsolete, sold…).
   * They leave the register only when a Department Head approves; until then they stay in store.
   */
  public async registerDisposal(payload: CreateDisposalRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new NotFoundError(`Item ${payload.itemId} not found.`);
    if (item.status !== 'AVAILABLE') {
      throw new ConflictError(`Item ${item.itemCode} must be in store to be disposed of; return it to store first. Current: ${item.status}`);
    }
    await assertNoPendingApproval(item);
    const { disposalNo, details } = disposalDetailsOf(payload, item);
    if (isSlipRequired() && !payload.ifmisSlipAttachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);
    // A store with no store man can't dispose: his name goes on the disposal form
    const keeper = await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.storekeeperEmployeeId, 'the disposal');
    if (keeper) {
      details.storekeeperEmployeeId = keeper.employeeId;
      details.storekeeperName = keeper.fullNameEn;
    }

    const today = getTodayGcAndEc();
    const dateGc = payload.disposalDateGc || today.gc;
    const inStore = quantityOf(item);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;
    const notesText = formatDisposalNotes(details);

    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: 'PENDING_DISPOSAL' as any,
        history: {
          create: {
            dateGc: today.gc,
            dateEc: today.ec,
            action: 'DISPOSAL_REQUESTED',
            fromEntity: `${await storeLabel(item.storeLocationId)} (Available)`,
            toEntity: 'Disposal (Pending Approval)',
            performedBy: user ? user.fullNameEn : payload.registeredById,
            performedByRole: (user?.role ?? 'DATA_ENCODER') as any,
            ifmisSlipNumber: disposalNo,
            notes: details.quantity! < inStore ? `Partial disposal: ${details.quantity} of ${inStore} ${details.uom}. ${notesText}` : notesText,
          },
        },
      },
    });

    const approval = await prisma.transactionApproval.create({
      data: {
        transactionType: 'DISPOSAL' as any,
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        ifmisSlipNumber: disposalNo,
        ifmisSlipDateGc: dateGc,
        ifmisSlipDateEc: formatGcToEc(dateGc),
        ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl,
        requestedById: payload.registeredById,
        purposeOrRemarks: notesText,
        requestDetails: details as any,
        status: 'PENDING' as any,
        createdAtGc: today.gc,
        createdAtEc: today.ec,
      },
    });

    await addAuditLog(
      payload.registeredById,
      'REGISTER_DISPOSAL',
      'DISPOSAL',
      item.id,
      `Disposal requested for ${item.itemCode}: ${details.quantity} ${details.uom}, reason: ${details.reason}. Ref: ${disposalNo}`,
      disposalNo,
    );

    return mapApproval(approval);
  }

  /** Corrects a disposal request while it still waits for Stage 1 endorsement. The item can't change. */
  public async updateDisposal(approvalId: string, payload: UpdateDisposalRequest, actorId: string): Promise<TransactionApproval> {
    const approval = await prisma.transactionApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.transactionType !== ('DISPOSAL' as any)) {
      throw new NotFoundError(`Disposal request ${approvalId} not found.`);
    }
    if (!correctable(approval)) {
      throw new ConflictError(
        `The disposal request for ${approval.itemCode} can only be corrected while it is waiting for Team Leader endorsement or has been returned for correction. Ask an approver to return it for correction.`
      );
    }
    const item = await prisma.item.findUnique({ where: { id: approval.itemId } });
    if (!item) throw new NotFoundError(`Item ${approval.itemId} not found.`);

    const { disposalNo, details } = disposalDetailsOf(payload, item);
    const attachment = payload.ifmisSlipAttachmentUrl || approval.ifmisSlipAttachmentUrl || undefined;
    if (isSlipRequired() && !attachment) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);
    const dateGc = payload.disposalDateGc || approval.ifmisSlipDateGc;
    const previous = (approval.requestDetails ?? {}) as Model21RequestDetails;
    if (payload.storekeeperEmployeeId) {
      const keeper = await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.storekeeperEmployeeId, 'the disposal');
      if (keeper) {
        details.storekeeperEmployeeId = keeper.employeeId;
        details.storekeeperName = keeper.fullNameEn;
      }
    } else if (previous.storekeeperEmployeeId) {
      details.storekeeperEmployeeId = previous.storekeeperEmployeeId;
      details.storekeeperName = previous.storekeeperName;
    }

    const snapshot = (no: string, date: string, file: string | null | undefined, d: Model21RequestDetails) => ({
      'reference no.': no,
      date,
      document: file,
      quantity: d.quantity,
      reason: d.reason,
      remark: d.description,
      condition: d.condition,
      'book value': d.bookValue,
      recipient: d.recipientName,
      proceeds: d.proceedsETB,
      'committee ref': d.committeeRef,
      storekeeper: d.storekeeperName,
    });
    const before = snapshot(approval.ifmisSlipNumber, approval.ifmisSlipDateGc, approval.ifmisSlipAttachmentUrl, previous);
    const after = snapshot(disposalNo, dateGc, attachment, details);
    const changes = describeChanges(before, after).map((c) => (c.startsWith('document ') ? 'supporting document replaced' : c));
    if (changes.length === 0) {
      const unchanged = await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES });
      return mapApproval(unchanged);
    }
    const summary = `Corrected before endorsement: ${changes.join('; ')}`;

    const actor = await prisma.employee.findUnique({ where: { id: actorId } });
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const store = await storeLabel(item.storeLocationId);

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.transactionApproval.update({
        where: { id: approvalId },
        data: {
          ifmisSlipNumber: disposalNo,
          ifmisSlipDateGc: dateGc,
          ifmisSlipDateEc: formatGcToEc(dateGc),
          ifmisSlipAttachmentUrl: attachment,
          purposeOrRemarks: formatDisposalNotes(details),
          requestDetails: details as any,
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
              action: 'DISPOSAL_EDITED',
              fromEntity: `${store} (Available)`,
              toEntity: 'Disposal (Pending Approval)',
              performedBy: actor ? actor.fullNameEn : actorId,
              performedByRole: (actor?.role ?? 'DATA_ENCODER') as any,
              ifmisSlipNumber: disposalNo,
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
          action: 'EDIT_DISPOSAL',
          entityType: 'DISPOSAL' as any,
          entityId: approval.itemId,
          ifmisSlipNumber: disposalNo,
          details: `Item ${approval.itemCode}: ${summary}`,
          previousState: before as any,
          newState: after as any,
        },
      });

      return saved;
    });

    return mapApproval(updated);
  }

  // ── Model 22 Return to Store ─────────────────────────────────────────────

  public async registerReturn(payload: CreateReturnRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new NotFoundError(`Item ${payload.itemId} not found.`);
    // Only what someone holds can come back; an item in store never left it
    if (item.status === 'AVAILABLE') {
      throw new ConflictError(`${item.itemCode} is already in store. Only an issued item can be returned.`);
    }
    if (item.status !== 'ISSUED') {
      throw new ConflictError(`Item ${item.itemCode} cannot be returned to store. Current status: ${item.status}`);
    }
    if (item.heldByOrganization) {
      throw new ConflictError(`${item.itemCode} was issued to ${item.heldByOrganization}. Returning an item issued to an outside organization isn't supported yet.`);
    }
    await assertNoPendingApproval(item);
    const effectiveSlipNo = String(payload.model21No || payload.ifmisSlipNumber || '').trim();
    if (!effectiveSlipNo) throw new BadRequestError('Return Voucher (Model 21 / 22) Slip Number is mandatory.');
    if (isBlank(payload.returnReason)) throw new BadRequestError('Reason for return is required.');
    if (isSlipRequired() && !payload.ifmisSlipAttachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);
    assertMaxLength(payload.returnReason, 500, 'Reason for return');
    if (payload.condition && !RETURN_CONDITIONS.includes(payload.condition)) throw new BadRequestError('Choose a valid item condition.');
    assertSlipDate(payload.ifmisSlipDateGc);
    if (payload.returningEmployeeId && item.currentCustodianId && payload.returningEmployeeId !== item.currentCustodianId) {
      throw new BadRequestError('Only the person who holds this item can return it.');
    }
    if (payload.targetStoreLocationId) {
      const returnStore = await prisma.location.findUnique({ where: { id: payload.targetStoreLocationId }, include: { store: true } });
      if (!returnStore) throw new BadRequestError('The selected store no longer exists.');
      assertUsableLocation(returnStore, 'the receiving store');
    }

    const today = getTodayGcAndEc();
    const slipDateEc = formatGcToEc(payload.ifmisSlipDateGc || today.gc);
    const user = payload.registeredById ? await prisma.employee.findUnique({ where: { id: payload.registeredById } }) : null;
    // The store it goes back to (the one chosen, else the item's own) must have a store man to take it
    const receiver = await requireStoreKeeper(
      prisma,
      { locationId: payload.targetStoreLocationId || item.storeLocationId },
      payload.storeRecipientId,
      'receiving the returned item',
    );
    if (receiver) {
      payload.storeRecipientId = receiver.employeeId;
    } else if (payload.storeRecipientId) {
      const named = await prisma.employee.findUnique({ where: { id: payload.storeRecipientId } });
      if (!named) throw new BadRequestError('The selected store receiver no longer exists.');
      assertActiveEmployee(named, 'the store receiver');
    }

    const returnDetails: Model21RequestDetails = {
      reason: payload.returnReason,
      // No condition given: the item keeps the one it has
      condition: (payload.condition || item.condition || 'GOOD') as ItemCondition,
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
      storeRecipientName: receiver?.fullNameEn,
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
            fromEntity: await holderName(item),
            toEntity: `${await storeLabel(payload.targetStoreLocationId || item.storeLocationId)} (Pending Return Approval)`,
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
        // Only a store other than the one it came from is recorded
        targetLocationId: payload.targetStoreLocationId && payload.targetStoreLocationId !== item.storeLocationId ? payload.targetStoreLocationId : undefined,
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

  /** A transfer or return can only be corrected while it waits for Team Leader endorsement, or once it is returned */
  private async loadEditableModel21Request(approvalId: string, type: 'TRANSFER' | 'RETURN') {
    const label = type === 'TRANSFER' ? 'Transfer' : 'Return';
    const approval = await prisma.transactionApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.transactionType !== type) {
      throw new NotFoundError(`${label} request ${approvalId} not found.`);
    }
    if (!correctable(approval)) {
      throw new ConflictError(
        `The ${label.toLowerCase()} request for ${approval.itemCode} can only be corrected while it is waiting for Team Leader endorsement or has been returned for correction. Ask an approver to return it for correction.`
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
    assertMaxLength(reason, 500, 'Reason for transfer');
    if (!payload.toEmployeeId) throw new BadRequestError('The new custodian is required.');
    assertSlipDate(payload.ifmisSlipDateGc, 'The transfer date');
    const dateGc = payload.ifmisSlipDateGc || approval.ifmisSlipDateGc;

    const [item, recipient, department, location] = await Promise.all([
      prisma.item.findUnique({ where: { id: approval.itemId } }),
      prisma.employee.findUnique({ where: { id: payload.toEmployeeId } }),
      payload.toDepartmentId ? prisma.department.findUnique({ where: { id: payload.toDepartmentId } }) : null,
      payload.toLocationId ? prisma.location.findUnique({ where: { id: payload.toLocationId }, include: { store: true } }) : null,
    ]);
    if (!item) throw new NotFoundError(`Item ${approval.itemId} not found.`);
    if (!recipient) throw new BadRequestError('The selected new custodian no longer exists.');
    assertActiveEmployee(recipient, 'the new custodian');
    if (payload.toDepartmentId && !department) throw new BadRequestError('The selected directorate no longer exists.');
    if (payload.toLocationId && !location) throw new BadRequestError('The selected location no longer exists.');
    if (location && location.id !== approval.targetLocationId) assertUsableLocation(location, 'the destination location');

    const previous = requestDetailsOf(approval) ?? {};
    // A new choice must be a store man of the item's store; otherwise the one already named stays
    const transferrer =
      payload.transferredByEmployeeId && item.storeLocationId
        ? await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.transferredByEmployeeId, 'the transfer')
        : null;
    const inStore = quantityOf(item);
    const requested = Number(payload.quantity);
    const quantity = Number.isFinite(requested) && requested > 0 ? requested : (Number(previous.quantity) || inStore);
    if (quantity > inStore) {
      throw new BadRequestError(`Cannot transfer ${quantity} ${uomOf(item)}. Only ${inStore} are held.`);
    }
    const details: Model21RequestDetails = {
      ...previous,
      ...(transferrer ? { transferredByEmployeeId: transferrer.employeeId, transferredByName: transferrer.fullNameEn } : {}),
      quantity,
      uom: uomOf(item),
      reason: reason || undefined,
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
      approval.targetLocationId ? prisma.location.findUnique({ where: { id: approval.targetLocationId }, include: { store: true } }) : null,
      item.currentCustodianId ? prisma.employee.findUnique({ where: { id: item.currentCustodianId } }) : null,
    ]);
    const view = (slip: string, to: string | undefined, dept: string | undefined, loc: string | undefined, d: Model21RequestDetails, date: string) => ({
      'Model 21 no.': slip,
      date,
      'new custodian': to,
      directorate: dept ?? 'current',
      location: loc ?? 'current',
      'store man': d.transferredByName,
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
    const before = view(approval.ifmisSlipNumber, previousRecipient?.fullNameEn, previousDepartment?.nameEn, locationLabel(previousLocation), previous, approval.ifmisSlipDateGc);
    const after = view(slipNo, recipient.fullNameEn, department?.nameEn, locationLabel(location), details, dateGc);
    const changes = describeChanges(before, after);
    if (changes.length === 0) {
      return mapApproval(await prisma.transactionApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDES }));
    }

    const fromName = custodian?.fullNameEn ?? (await storeLabelOfItem(approval.itemId));
    return this.saveModel21Edit({
      approval,
      data: {
        ifmisSlipNumber: slipNo,
        ifmisSlipDateGc: dateGc,
        ifmisSlipDateEc: formatGcToEc(dateGc),
        ...(payload.ifmisSlipAttachmentUrl ? { ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl } : {}),
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
    if (payload.condition && !RETURN_CONDITIONS.includes(payload.condition)) throw new BadRequestError('Choose a valid item condition.');

    const storeRecipient = payload.storeRecipientId
      ? await prisma.employee.findUnique({ where: { id: payload.storeRecipientId } })
      : null;
    if (payload.storeRecipientId && !storeRecipient) throw new BadRequestError('The selected store receiver no longer exists.');
    assertActiveEmployee(storeRecipient, 'the store receiver');
    // The store it goes back to: the one chosen now, else the one the request already has, else the item's own
    const returning = await prisma.item.findUnique({ where: { id: approval.itemId }, select: { storeLocationId: true } });
    const targetId: string | null =
      payload.targetStoreLocationId === undefined
        ? approval.targetLocationId
        : payload.targetStoreLocationId && payload.targetStoreLocationId !== returning?.storeLocationId
          ? payload.targetStoreLocationId
          : null;
    const targetChanged = targetId !== approval.targetLocationId;
    if (targetId && targetChanged) {
      const returnStore = await prisma.location.findUnique({ where: { id: targetId }, include: { store: true } });
      if (!returnStore) throw new BadRequestError('The selected store no longer exists.');
      assertUsableLocation(returnStore, 'the receiving store');
    }
    // Its store man takes it back; a different store means choosing again
    const keeper =
      payload.storeRecipientId || targetChanged
        ? await requireStoreKeeper(prisma, { locationId: targetId ?? returning?.storeLocationId }, payload.storeRecipientId, 'receiving the returned item')
        : null;

    const previous = requestDetailsOf(approval) ?? {};
    const details: Model21RequestDetails = {
      ...previous,
      reason,
      condition: payload.condition || previous.condition,
      remark: payload.defectRemark?.trim() || undefined,
      book: payload.book?.trim() || undefined,
      chassisNumber: payload.chassisNumber?.trim() || undefined,
      plateNo: payload.plateNo?.trim() || undefined,
      engineNo: payload.engineNo?.trim() || undefined,
      accessories: payload.accessories ?? previous.accessories,
      tireNos: payload.tireNos ?? previous.tireNos,
      depreciation: payload.depreciation ?? previous.depreciation,
      bookValue: payload.bookValue ?? previous.bookValue,
      // A new store drops the old store man unless one of the new store is chosen
      storeRecipientId: storeRecipient?.id ?? keeper?.employeeId ?? (targetChanged ? undefined : previous.storeRecipientId),
      storeRecipientName: storeRecipient?.fullNameEn ?? keeper?.fullNameEn ?? (targetChanged ? undefined : previous.storeRecipientName),
    };
    const slipDateGc = payload.ifmisSlipDateGc || approval.ifmisSlipDateGc;
    const attachmentUrl = payload.ifmisSlipAttachmentUrl || approval.ifmisSlipAttachmentUrl;
    if (isSlipRequired() && !attachmentUrl) throw new BadRequestError(SLIP_REQUIRED_MESSAGE);

    const previousReceiver = previous.storeRecipientId
      ? await prisma.employee.findUnique({ where: { id: previous.storeRecipientId } })
      : null;
    const fileName = (url?: string | null) => (url ? url.split('/').pop() : undefined);
    const view = (slip: string, date: string, url: string | null | undefined, receiver: string | undefined, d: Model21RequestDetails, store: string) => ({
      'Model 21 no.': slip,
      'returns to': store,
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
    const storeBefore = await storeLabel(approval.targetLocationId ?? returning?.storeLocationId);
    const storeAfter = targetChanged ? await storeLabel(targetId ?? returning?.storeLocationId) : storeBefore;
    const before = view(approval.ifmisSlipNumber, approval.ifmisSlipDateGc, approval.ifmisSlipAttachmentUrl, previousReceiver?.fullNameEn, previous, storeBefore);
    const after = view(slipNo, slipDateGc, attachmentUrl, details.storeRecipientName, details, storeAfter);
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
        targetLocationId: targetId,
        purposeOrRemarks: formatReturnNotes(slipNo, details),
        requestDetails: details,
      },
      historyAction: 'RETURN_EDITED',
      auditAction: 'EDIT_RETURN',
      entityType: 'RETURN',
      fromEntity: await holderNameOfItem(approval.itemId),
      toEntity: `${storeAfter} (Pending Return Approval)`,
      slipNo,
      changes,
      before,
      after,
      actorId,
    });
  }

  // ── Approval Handling ───────────────────────────────────────────────────

  /**
   * Endorse, approve or reject a request.
   * The request, the item, any split item and the audit entry are saved together or not at all,
   * so a failure part-way can't leave the request decided and the item unchanged.
   */
  public async handleApproval(payload: ApprovalActionRequest): Promise<TransactionApproval> {
    return prisma.$transaction((db: any) => this.applyDecision(payload, db), { timeout: 20000 });
  }

  /**
   * One decision for a whole voucher: every line of a Model 19 receipt (same slip and PO), or of a Model 22 issue
   * (same Model 22 No.), all waiting at the same stage. Each line goes through the same checks as on its own
   * (permissions, stage, the CEO above 10 million birr); if any line fails, none is changed.
   */
  public async handleSlipApproval(payload: SlipApprovalActionRequest): Promise<TransactionApproval[]> {
    const ids = [...new Set((Array.isArray(payload.approvalIds) ? payload.approvalIds : []).filter((id) => typeof id === 'string' && id))];
    if (ids.length === 0) throw new BadRequestError('Choose the voucher to review.');
    if (ids.length > MAX_SLIP_LINES) throw new BadRequestError(`A voucher can be reviewed ${MAX_SLIP_LINES} lines at a time.`);
    const timeout = Math.min(20000 + ids.length * 1500, 120000);
    return prisma.$transaction(async (db: any) => {
      const approvals = await db.transactionApproval.findMany({ where: { id: { in: ids } }, include: { item: { select: { notes: true, unitCostETB: true } } } });
      if (approvals.length !== ids.length) throw new NotFoundError('Part of this voucher no longer exists. Refresh the list.');
      const types = new Set(approvals.map((a: any) => a.transactionType));
      if (types.size > 1 || !(types.has('STOCK_IN') || types.has('STOCK_OUT') || types.has('DISPOSAL'))) {
        throw new BadRequestError('Only the lines of one receipt (Model 19), one issue (Model 22) or one disposal form are reviewed together.');
      }
      // A receipt is its slip and PO; an issue or a disposal form is its number alone
      const issue = types.has('STOCK_OUT') || types.has('DISPOSAL');
      const voucher = types.has('STOCK_OUT') ? 'Model 22' : types.has('DISPOSAL') ? 'disposal form' : 'Model 19';
      if (approvals.some((a: any) => a.status !== 'PENDING')) throw new ConflictError(`Part of this ${voucher} has already been decided. Refresh the list.`);
      if (new Set(approvals.map((a: any) => a.currentStage ?? 1)).size > 1) throw new ConflictError(`The lines of this ${voucher} are at different stages. Review them one by one.`);
      const keyOf = (a: any) => `${String(a.ifmisSlipNumber ?? '').trim().toLowerCase()}|${issue ? '' : String(readItemMeta(a.item?.notes).poNumber ?? '').trim().toLowerCase()}`;
      if (new Set(approvals.map(keyOf)).size > 1) throw new BadRequestError(issue ? `These lines are not on the same ${voucher}.` : 'These lines are not on the same Model 19 and PO.');
      // The voucher is signed as a whole, so its grand total decides whether the CEO must authorize it
      const grandTotal = approvals.reduce((sum: number, a: any) => sum + calculateApprovalTotalAmount(a, a.item), 0);
      const decided: TransactionApproval[] = [];
      // In slip order, so the history and audit read like the voucher
      for (const id of ids) decided.push(await this.applyDecision({ ...payload, approvalId: id }, db, grandTotal));
      return decided;
    }, { timeout });
  }

  /**
   * The grand total of the voucher a line is on, while its lines wait together at the same stage: a Model 19 receipt
   * (same slip and PO) or a Model 22 issue (same number). A line decided on its own still counts its whole voucher,
   * so splitting a voucher into lines never takes it under the CEO's threshold. Other requests have none.
   */
  private async voucherTotalOf(approval: any, db: any): Promise<number | undefined> {
    const type = approval.transactionType;
    const slip = String(approval.ifmisSlipNumber ?? '').trim();
    if (!['STOCK_IN', 'STOCK_OUT', 'DISPOSAL'].includes(type) || !slip || slip.toUpperCase().startsWith('PENDING-')) return undefined;
    const lines = await db.transactionApproval.findMany({
      where: { transactionType: type, status: 'PENDING', currentStage: approval.currentStage, ifmisSlipNumber: { equals: slip, mode: 'insensitive' } },
      include: { item: { select: { notes: true, unitCostETB: true } } },
    });
    if (!Array.isArray(lines) || lines.length < 2) return undefined;
    const poOf = (a: any) => String(readItemMeta(a.item?.notes).poNumber ?? '').trim().toLowerCase();
    const own = lines.find((l: any) => l.id === approval.id);
    const same = type === 'STOCK_IN' && own ? lines.filter((l: any) => poOf(l) === poOf(own)) : lines;
    return same.length < 2 ? undefined : same.reduce((sum: number, l: any) => sum + calculateApprovalTotalAmount(l, l.item), 0);
  }

  /**
   * Sends requests returned for correction back to the Team Leader: a whole voucher at once (the lines of one Model 19,
   * Model 22 or disposal form; a Model 21 request on its own). Whoever may make that kind of request may resubmit it.
   */
  public async resubmitReturned(payload: { approvalIds?: unknown }, actorId: string): Promise<TransactionApproval[]> {
    const ids = [...new Set((Array.isArray(payload.approvalIds) ? payload.approvalIds : []).filter((id): id is string => typeof id === 'string' && !!id))];
    if (ids.length === 0) throw new BadRequestError('Choose the request to resubmit.');
    if (ids.length > MAX_SLIP_LINES) throw new BadRequestError(`A voucher can be resubmitted ${MAX_SLIP_LINES} lines at a time.`);
    const actor = await prisma.employee.findUnique({ where: { id: actorId } });
    const today = getTodayGcAndEc();
    return prisma.$transaction(async (db: any) => {
      const approvals = await db.transactionApproval.findMany({ where: { id: { in: ids } }, include: { item: { select: { notes: true, status: true, itemCode: true } } } });
      if (approvals.length !== ids.length) throw new NotFoundError('Part of this request no longer exists. Refresh the list.');
      if (approvals.some((a: any) => a.status !== 'RETURNED')) throw new ConflictError('Only a request returned for correction can be resubmitted. Refresh the list.');
      const types = new Set(approvals.map((a: any) => a.transactionType));
      if (types.size > 1) throw new BadRequestError('Resubmit one voucher at a time.');
      const type = String(approvals[0].transactionType);
      const keyOf = (a: any) => `${String(a.ifmisSlipNumber ?? '').trim().toLowerCase()}|${type === 'STOCK_IN' ? String(readItemMeta(a.item?.notes).poNumber ?? '').trim().toLowerCase() : ''}`;
      if (new Set(approvals.map(keyOf)).size > 1) throw new BadRequestError(`These requests are not on the same ${VOUCHER_NAMES[type] ?? 'voucher'}.`);
      if (!hasPermission(actor?.role, WRITE_PERMISSION[type] as any)) throw new ForbiddenError('Your role cannot resubmit this request.');
      for (const a of approvals) if (a.item) assertIssueStillFits(a, a.item, 'requester');

      const resubmitted: TransactionApproval[] = [];
      for (const id of ids) {
        const a = approvals.find((x: any) => x.id === id);
        const saved = await db.transactionApproval.update({
          where: { id, status: 'RETURNED' as any },
          data: { status: 'PENDING' as any, currentStage: 1 },
          include: APPROVAL_INCLUDES,
        }).catch((err: any) => { throw err?.code === 'P2025' ? new ConflictError('Someone else has just acted on this request. Refresh the list.') : err; });
        await db.item.update({
          where: { id: a.itemId },
          data: {
            history: {
              create: {
                dateGc: today.gc,
                dateEc: today.ec,
                action: `RESUBMITTED_${type}`,
                fromEntity: 'Requester (Correction)',
                toEntity: 'Team Leader Review (Stage 1)',
                performedBy: actor ? actor.fullNameEn : actorId,
                performedByRole: (actor?.role ?? 'DATA_ENCODER') as any,
                ifmisSlipNumber: a.ifmisSlipNumber,
                notes: `Corrected and resubmitted after: ${a.returnRemarks ?? 'return for correction'}`,
              },
            },
          },
        });
        await addAuditLog(actorId, `RESUBMIT_${type}`, 'APPROVAL', a.itemId, `${type} for item ${a.itemCode} corrected and resubmitted to the Team Leader.`, a.ifmisSlipNumber, undefined, undefined, db);
        resubmitted.push(mapApproval(saved));
      }
      return resubmitted;
    }, { timeout: Math.min(20000 + ids.length * 1500, 120000) });
  }

  /**
   * A rejected request its requester withdraws: closed, and its record put back as it was before the request (a
   * receipt's record is then rejected, an issue's units free again…). A whole voucher at once, like a resubmit;
   * whoever may make that kind of request may cancel it.
   */
  public async cancelRejected(payload: { approvalIds?: unknown; reason?: unknown }, actorId: string): Promise<TransactionApproval[]> {
    const ids = [...new Set((Array.isArray(payload.approvalIds) ? payload.approvalIds : []).filter((id): id is string => typeof id === 'string' && !!id))];
    if (ids.length === 0) throw new BadRequestError('Choose the request to cancel.');
    if (ids.length > MAX_SLIP_LINES) throw new BadRequestError(`A voucher can be cancelled ${MAX_SLIP_LINES} lines at a time.`);
    if (payload.reason != null && typeof payload.reason !== 'string') throw new BadRequestError('The reason must be text.');
    const reason = (payload.reason as string | undefined)?.trim() || undefined;
    if ((reason?.length ?? 0) > 500) throw new BadRequestError('The reason must be 500 characters or fewer.');
    const actor = await prisma.employee.findUnique({ where: { id: actorId } });
    return prisma.$transaction(async (db: any) => {
      const approvals = await db.transactionApproval.findMany({ where: { id: { in: ids } }, include: { item: { select: { notes: true } } } });
      if (approvals.length !== ids.length) throw new NotFoundError('Part of this request no longer exists. Refresh the list.');
      if (approvals.some((a: any) => a.status !== 'RETURNED')) throw new ConflictError('Only a rejected request can be cancelled. Refresh the list.');
      const types = new Set(approvals.map((a: any) => a.transactionType));
      if (types.size > 1) throw new BadRequestError('Cancel one voucher at a time.');
      const type = String(approvals[0].transactionType);
      const keyOf = (a: any) => `${String(a.ifmisSlipNumber ?? '').trim().toLowerCase()}|${type === 'STOCK_IN' ? String(readItemMeta(a.item?.notes).poNumber ?? '').trim().toLowerCase() : ''}`;
      if (new Set(approvals.map(keyOf)).size > 1) throw new BadRequestError(`These requests are not on the same ${VOUCHER_NAMES[type] ?? 'voucher'}.`);
      if (!hasPermission(actor?.role, WRITE_PERMISSION[type] as any)) throw new ForbiddenError('Your role cannot cancel this request.');
      const cancelled: TransactionApproval[] = [];
      for (const id of ids) cancelled.push(await this.applyDecision({ approvalId: id, action: 'REJECT', reviewedById: actorId, reviewRemarks: reason }, db, undefined, true));
      return cancelled;
    }, { timeout: Math.min(20000 + ids.length * 1500, 120000) });
  }

  /**
   * A request returned for correction goes back to the Team Leader once it is corrected, with the rest of its voucher
   * still returned (the other lines of its Model 19, Model 22 or disposal form). Nothing happens to a request that
   * wasn't returned. `ref` is the request, or for a receipt the record it registers.
   */
  public async resubmitAfterCorrection(ref: { approvalId: string } | { itemId: string; transactionType: 'STOCK_IN' }, actorId: string): Promise<TransactionApproval[]> {
    const include = { item: { select: { notes: true } } };
    const approval: any = 'approvalId' in ref
      ? await prisma.transactionApproval.findUnique({ where: { id: ref.approvalId }, include })
      : await prisma.transactionApproval.findFirst({ where: { itemId: ref.itemId, transactionType: ref.transactionType as any, status: 'RETURNED' as any }, include });
    if (!approval || approval.status !== 'RETURNED') return [];
    const type = String(approval.transactionType);
    const keyOf = (a: any) => `${String(a.ifmisSlipNumber ?? '').trim().toLowerCase()}|${type === 'STOCK_IN' ? String(readItemMeta(a.item?.notes).poNumber ?? '').trim().toLowerCase() : ''}`;
    const slip = String(approval.ifmisSlipNumber ?? '').trim();
    const voucherOfLines = ['STOCK_IN', 'STOCK_OUT', 'DISPOSAL'].includes(type) && slip && !slip.toUpperCase().startsWith('PENDING-');
    const siblings: any[] = voucherOfLines
      ? await prisma.transactionApproval.findMany({ where: { transactionType: type as any, status: 'RETURNED' as any, ifmisSlipNumber: { equals: slip, mode: 'insensitive' } }, include })
      : [];
    const ids = [approval.id, ...(Array.isArray(siblings) ? siblings : []).filter((a) => a.id !== approval.id && keyOf(a) === keyOf(approval)).map((a) => a.id)];
    return this.resubmitReturned({ approvalIds: ids }, actorId);
  }

  /**
   * An approver's decision; or, with `cancel`, a rejected request withdrawn by its requester (its permission is checked
   * by cancelRejected): it closes, and its record is put back as it was before the request.
   */
  private async applyDecision(payload: ApprovalActionRequest, db: any, voucherTotal?: number, cancel = false): Promise<TransactionApproval> {
    const approval = await db.transactionApproval.findUnique({ where: { id: payload.approvalId } });
    if (!approval) throw new NotFoundError('This request no longer exists. Refresh the list.');
    // A rejected request is with its requester: corrected and resubmitted, or cancelled by them
    const returned = approval.status === 'RETURNED';
    if (cancel ? !returned : approval.status !== 'PENDING') {
      throw new ConflictError(
        returned
          ? 'This request was rejected and is with its requester to correct or cancel. It can be reviewed again once it is resubmitted.'
          : `This request is ${String(approval.status).toLowerCase()}. Refresh the list.`,
      );
    }

    const today = getTodayGcAndEc();
    const reviewer = payload.reviewedById ? await db.employee.findUnique({ where: { id: payload.reviewedById } }) : null;
    if (!['ENDORSE', 'APPROVE', 'REJECT', 'RETURN'].includes(payload.action)) throw new BadRequestError('Invalid approval action.');
    const permission = approval.currentStage === 1 ? 'approvals.endorse' : 'approvals.authorize';
    if (!cancel && !hasPermission(reviewer?.role, permission)) throw new ForbiddenError('Your role cannot review this approval stage.');
    // Segregation of duties: whoever submitted a request can't endorse, approve or reject it
    if (!cancel && reviewer?.role !== UserRole.SUPER_ADMIN && approval.requestedById && approval.requestedById === payload.reviewedById) {
      throw new ForbiddenError("You can't endorse, approve or reject a request you submitted.");
    }
    // Rejecting sends the request back to its requester ("RETURN" is the older name of it)
    const sendBack = !cancel && (payload.action === 'REJECT' || payload.action === 'RETURN');
    if ((payload.action === 'ENDORSE' && approval.currentStage !== 1) ||
        (payload.action === 'APPROVE' && approval.currentStage !== 2)) {
      throw new BadRequestError('This action does not match the current approval stage.');
    }
    const reviewerName = reviewer ? `${reviewer.fullNameEn} (${(reviewer.role && ROLE_POLICY[reviewer.role as UserRole]?.name) || reviewer.role})` : 'Reviewer';

    if (payload.reviewRemarks != null && typeof payload.reviewRemarks !== 'string') throw new BadRequestError('Remarks must be text.');
    payload.reviewRemarks = payload.reviewRemarks?.trim() || undefined;
    if ((payload.reviewRemarks?.length ?? 0) > 500) throw new BadRequestError('Remarks must be 500 characters or fewer.');
    // A rejection must say why, so the requester knows what to correct; a cancellation may
    const rejectionReason = payload.reviewRemarks ?? (cancel ? 'Cancelled by the requester' : '');
    if (sendBack && !rejectionReason) {
      throw new BadRequestError('Give a reason for rejecting, so the requester knows what to correct.');
    }
    // Two reviewers can act at the same moment: the update only goes through while the request is still
    // pending at the stage this reviewer saw, so the second one is refused instead of recorded twice
    const stillWaiting = { id: payload.approvalId, status: approval.status as any, currentStage: approval.currentStage };
    const decidedMeanwhile = (err: any) =>
      err?.code === 'P2025' ? new ConflictError('Someone else has just acted on this request. Refresh the list.') : err;
    // Either stage can reject: the history names the stage and the person who did
    const rejectionNote = cancel
      ? `Cancelled by ${reviewer?.fullNameEn ?? 'the requester'} after it was rejected: ${rejectionReason}`
      : `Rejected at Stage ${approval.currentStage ?? 1} (${(approval.currentStage ?? 1) === 1 ? 'Team Leader' : 'Department Head'}) by ${reviewer?.fullNameEn ?? 'the reviewer'}: ${rejectionReason}`;

    // ── STAGE 1 ACTION: ENDORSE (Team Leader) ──────────────────────────────
    if (payload.action === 'ENDORSE') {
      if (approval.currentStage !== 1) {
        throw new ConflictError(`Transaction ${approval.itemCode} has already completed Stage 1 endorsement.`);
      }
      if (approval.transactionType === 'STOCK_OUT') {
        const onRecord = await db.item.findUnique({ where: { id: approval.itemId } });
        if (onRecord) assertIssueStillFits(approval, onRecord, 'reviewer');
      }

      const updatedApproval = await db.transactionApproval.update({
        where: stillWaiting,
        data: {
          currentStage: 2, // Advance to Stage 2 Department Head Final Approval
          endorsedById: payload.reviewedById,
          endorsementRemarks: payload.reviewRemarks || 'Endorsed by Team Leader (Stage 1)',
          endorsedAtGc: today.gc,
          endorsedAtEc: today.ec,
        },
        include: APPROVAL_INCLUDES,
      }).catch((err) => { throw decidedMeanwhile(err); });

      await db.item.update({
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
        undefined,
        undefined,
        db,
      );

      return mapApproval(updatedApproval);
    }

    // ── EITHER STAGE: REJECT ─────────────────────────────────────────────
    // The request goes back to its requester with the reason: still open (an issue keeps its units), corrected in place
    // and resubmitted to the Team Leader, or cancelled by the requester. Nothing on the record moves.
    if (sendBack) {
      const stage = approval.currentStage ?? 1;
      const stageName = stage === 1 ? 'Team Leader' : 'Department Head';
      const updatedApproval = await db.transactionApproval.update({
        where: stillWaiting,
        data: {
          status: 'RETURNED' as any,
          currentStage: 1,
          returnedById: payload.reviewedById,
          returnRemarks: rejectionReason,
          returnedAtGc: today.gc,
          returnedAtEc: today.ec,
          returnedFromStage: stage,
          returnCount: { increment: 1 },
          // Endorsed again once corrected: the endorsement was of what is being changed
          endorsedById: null,
          endorsementRemarks: null,
          endorsedAtGc: null,
          endorsedAtEc: null,
        },
        include: APPROVAL_INCLUDES,
      }).catch((err) => { throw decidedMeanwhile(err); });

      await db.item.update({
        where: { id: approval.itemId },
        data: {
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: `${approval.transactionType}_REJECTED`,
              fromEntity: `${stageName} Review (Stage ${stage})`,
              toEntity: 'Requester (Correction)',
              performedBy: reviewerName,
              performedByRole: (reviewer ? reviewer.role : 'TEAM_LEADER') as any,
              ifmisSlipNumber: approval.ifmisSlipNumber,
              notes: `Rejected at Stage ${stage} (${stageName}) by ${reviewer?.fullNameEn ?? 'the reviewer'}, back to the requester to correct or cancel: ${rejectionReason}`,
            },
          },
        },
      });

      await addAuditLog(
        payload.reviewedById,
        `REJECT_${approval.transactionType}`,
        'APPROVAL',
        approval.itemId,
        `${approval.transactionType} for item ${approval.itemCode} REJECTED at Stage ${stage} by ${reviewerName}, back to the requester to correct or cancel. Reason: ${rejectionReason}`,
        approval.ifmisSlipNumber,
        undefined,
        undefined,
        db,
      );

      return mapApproval(updatedApproval);
    }

    // ── STAGE 2 ACTION: APPROVE (Dept Head / Admin), or the requester's CANCEL ──
    const isApprove = !cancel && payload.action === 'APPROVE';
    if (isApprove && approval.currentStage === 1) {
      throw new ConflictError(`Transaction ${approval.itemCode} must be endorsed by a Team Leader (Stage 1) before final approval can be granted.`);
    }

    const item = await db.item.findUnique({ where: { id: approval.itemId } });
    if (!item) throw new NotFoundError(`Target item ${approval.itemId} not found.`);
    if (isApprove) assertIssueStillFits(approval, item, 'reviewer');

    // A line of a voucher of several lines goes by the voucher's grand total; anything else by its own amount
    const ownAmount = calculateApprovalTotalAmount(approval, item);
    const totalAmount = voucherTotal ?? (await this.voucherTotalOf(approval, db)) ?? ownAmount;
    const isHighValue = needsChiefDirector(totalAmount);

    // High-Value routing rule: Transactions > 10,000,000 ETB require Chief Director authorization at Stage 2
    if (!cancel && approval.currentStage === 2) {
      if (isHighValue) {
        if (reviewer?.role !== UserRole.CHIEF_DIRECTOR && reviewer?.role !== UserRole.SYSTEM_ADMIN && reviewer?.role !== UserRole.SUPER_ADMIN) {
          throw new ForbiddenError(
            `High-value transactions exceeding 10,000,000 ETB (${totalAmount.toLocaleString()} ETB${totalAmount !== ownAmount ? ' for the whole voucher' : ''}) require authorization by the Chief Director.`
          );
        }
      } else {
        if (reviewer?.role !== UserRole.DEPARTMENT_HEAD && reviewer?.role !== UserRole.CHIEF_DIRECTOR && reviewer?.role !== UserRole.SYSTEM_ADMIN && reviewer?.role !== UserRole.SUPER_ADMIN) {
          throw new ForbiddenError('Your role cannot authorize this approval stage.');
        }
      }
    }

    const newStatus = isApprove ? 'APPROVED' : 'CANCELLED';

    // Update approval record
    const updatedApproval = await db.transactionApproval.update({
      where: stillWaiting,
      data: {
        status: newStatus as any,
        reviewedById: payload.reviewedById,
        reviewRemarks: isApprove
          ? payload.reviewRemarks || (isHighValue ? 'Approved by Chief Director (High-Value Stage 2)' : 'Approved by Department Head (Stage 2)')
          : rejectionReason,
        reviewedAtGc: today.gc,
        reviewedAtEc: today.ec,
      },
      include: APPROVAL_INCLUDES,
    }).catch((err) => { throw decidedMeanwhile(err); });

    // Determine new item status and history entry
    let newItemStatus: string;
    let historyAction: string;
    let fromEntity: string;
    let toEntity: string;
    let histNote: string;
    let custodianId: string | null = item.currentCustodianId;
    let departmentId: string | null = item.assignedDepartmentId;
    // Set while the record is issued to an outside organization instead of an employee
    let heldByOrganization: string | null = item.heldByOrganization ?? null;
    let heldByContact: string | null = item.heldByContact ?? null;
    let locationId: string = item.storeLocationId;
    // The item's own store, for its history
    const storeName = await storeLabel(item.storeLocationId);
    let approvedById: string | null = item.approvedById;
    let approvedCondition: string | undefined;
    // Set when a Stock-Out, transfer or disposal covers only part of the record's units: those units get their own record
    let split: {
      quantity: number;
      remaining: number;
      uom: string;
      code: string;
      status: 'ISSUED' | 'DISPOSED' | 'AVAILABLE';
      custodianId: string | null;
      departmentId: string | null;
      locationId?: string | null;
      /** Issued to an outside organization instead of an employee */
      heldByOrganization?: string | null;
      heldByContact?: string | null;
      condition?: string;
      historyAction: string;
      toEntity: string;
      notes: string;
      /** Where the approval remembers the split-off record's code */
      detailsKey: 'issuedItemCode' | 'disposedItemCode' | 'transferredItemCode';
    } | null = null;

    if (isApprove) {
      if (approval.transactionType === 'STOCK_IN') {
        newItemStatus = 'AVAILABLE';
        historyAction = 'STOCK_IN_APPROVED';
        fromEntity = 'Pending Approval';
        toEntity = `${storeName} (AVAILABLE)`;
        histNote = payload.reviewRemarks || 'Receipt approved. The item is in store and can be issued.';
        approvedById = payload.reviewedById;
      } else if (approval.transactionType === 'RETURN') {
        newItemStatus = 'AVAILABLE';
        historyAction = 'RETURN_APPROVED';
        fromEntity = await holderName(item);
        // It goes back to the store chosen on the request, else the one it came from
        locationId = approval.targetLocationId ?? item.storeLocationId;
        const returnStoreName = approval.targetLocationId ? await storeLabel(approval.targetLocationId) : storeName;
        toEntity = `${returnStoreName} (AVAILABLE)`;
        histNote = payload.reviewRemarks || `Model 22 Return approved. Item returned to ${returnStoreName} (AVAILABLE).`;
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
          item.currentCustodianId ? db.employee.findUnique({ where: { id: item.currentCustodianId } }) : null,
          custodianId ? db.employee.findUnique({ where: { id: custodianId } }) : null,
        ]);
        fromEntity = fromEmp ? fromEmp.fullNameEn : 'Store';
        toEntity = toEmp ? toEmp.fullNameEn : 'Store';
        histNote = payload.reviewRemarks || `Model 21 transfer approved: ${approval.purposeOrRemarks}`;
        approvedById = payload.reviewedById;

        const requested = Number((approval.requestDetails as Record<string, any> | null)?.quantity);
        const inStore = quantityOf(item);
        if (Number.isFinite(requested) && requested > 0 && requested < inStore) {
          // The rest stays with the original custodian (or store) on this record; the transferred units get their own record
          const uom = uomOf(item);
          const code = await nextSplitCode(db, item);
          const recipientName = toEntity;
          split = {
            quantity: requested,
            remaining: Math.round((inStore - requested) * 10000) / 10000,
            uom,
            code,
            status: newItemStatus as 'ISSUED' | 'AVAILABLE',
            custodianId,
            departmentId,
            locationId,
            heldByOrganization: null,
            heldByContact: null,
            historyAction: 'TRANSFER_APPROVED',
            toEntity: recipientName,
            notes: `${requested} ${uom} transferred from ${item.itemCode} (Model 21 ${approval.ifmisSlipNumber}). ${approval.purposeOrRemarks}`,
            detailsKey: 'transferredItemCode',
          };
          newItemStatus = statusForCustodian(item.currentCustodianId);
          custodianId = item.currentCustodianId;
          departmentId = item.assignedDepartmentId;
          locationId = item.storeLocationId;
          heldByOrganization = item.heldByOrganization ?? null;
          heldByContact = item.heldByContact ?? null;
          approvedById = item.approvedById;
          toEntity = `${fromEntity} (${newItemStatus})`;
          histNote = `Transferred ${requested} of ${inStore} ${uom} as ${code} to ${recipientName}; ${inStore - requested} ${uom} retained. ${approval.purposeOrRemarks}`;
        }
      } else if (approval.transactionType === 'DISPOSAL') {
        const details = (approval.requestDetails ?? {}) as Model21RequestDetails;
        const disposedTo = details.recipientName ? `Disposed: to ${details.recipientName}` : 'Disposed';
        newItemStatus = 'DISPOSED';
        historyAction = 'DISPOSAL_APPROVED';
        fromEntity = storeName;
        toEntity = disposedTo;
        histNote = `Disposal approved. ${approval.purposeOrRemarks}`;
        approvedCondition = details.condition;
        custodianId = null;
        departmentId = null;
        approvedById = payload.reviewedById;

        const requested = Number(details.quantity);
        const inStore = quantityOf(item);
        if (Number.isFinite(requested) && requested > 0 && requested < inStore) {
          // The rest stays in store on this record; the disposed units get their own record
          const uom = uomOf(item);
          const code = await nextSplitCode(db, item);
          split = {
            quantity: requested,
            remaining: Math.round((inStore - requested) * 10000) / 10000,
            uom,
            code,
            status: 'DISPOSED',
            custodianId: null,
            departmentId: null,
            condition: details.condition,
            historyAction: 'DISPOSAL_APPROVED',
            toEntity: disposedTo,
            notes: `${requested} ${uom} disposed of from ${item.itemCode} (ref ${approval.ifmisSlipNumber}). ${approval.purposeOrRemarks}`,
            detailsKey: 'disposedItemCode',
          };
          newItemStatus = 'AVAILABLE';
          approvedCondition = undefined;
          custodianId = item.currentCustodianId;
          departmentId = item.assignedDepartmentId;
          approvedById = item.approvedById;
          fromEntity = 'Disposal pending';
          toEntity = `${storeName} (AVAILABLE)`;
          histNote = `Disposed of ${requested} of ${inStore} ${uom} as ${code}; ${inStore - requested} ${uom} remain in store. ${approval.purposeOrRemarks}`;
        }
      } else if (approval.transactionType === 'STOCK_OUT' && (approval.requestDetails as Record<string, any> | null)?.disposal === true) {
        // Disposal through Model 22: the units leave the register as disposed, like a disposal-form disposal
        newItemStatus = 'DISPOSED';
        historyAction = 'DISPOSAL_APPROVED';
        fromEntity = storeName;
        toEntity = 'Disposed (Model 22)';
        histNote = `Disposal approved. ${approval.purposeOrRemarks}`;
        custodianId = null;
        departmentId = null;
        approvedById = payload.reviewedById;

        const requested = Number((approval.requestDetails as Record<string, any> | null)?.quantity);
        const inStore = quantityOf(item);
        if (Number.isFinite(requested) && requested > 0 && requested < inStore) {
          // The rest stays in store on this record; the disposed units get their own record
          const uom = uomOf(item);
          const code = await nextSplitCode(db, item);
          split = {
            quantity: requested,
            remaining: Math.round((inStore - requested) * 10000) / 10000,
            uom,
            code,
            status: 'DISPOSED',
            custodianId: null,
            departmentId: null,
            historyAction: 'DISPOSAL_APPROVED',
            toEntity: 'Disposed (Model 22)',
            notes: `${requested} ${uom} disposed of from ${item.itemCode} (Model 22 ${approval.ifmisSlipNumber}). ${approval.purposeOrRemarks}`,
            detailsKey: 'disposedItemCode',
          };
          newItemStatus = 'AVAILABLE';
          custodianId = item.currentCustodianId;
          departmentId = item.assignedDepartmentId;
          approvedById = item.approvedById;
          fromEntity = 'Disposal pending';
          toEntity = `${storeName} (AVAILABLE)`;
          histNote = `Disposed of ${requested} of ${inStore} ${uom} as ${code}; ${inStore - requested} ${uom} remain in store. ${approval.purposeOrRemarks}`;
        }
      } else if (approval.transactionType === 'STOCK_OUT') {
        newItemStatus = 'ISSUED';
        historyAction = 'STOCK_OUT_APPROVED';
        fromEntity = storeName;
        const recipient = approval.recipientEmployeeId
          ? await db.employee.findUnique({ where: { id: approval.recipientEmployeeId } })
          : null;
        const details = (approval.requestDetails ?? {}) as Record<string, any>;
        const outsideOrganization: string | null = details.recipientType === 'EXTERNAL' ? String(details.organizationName || '') || null : null;
        const outsideContact: string | null = outsideOrganization ? String(details.contactPerson || '') || null : null;
        toEntity = outsideOrganization ?? (recipient ? recipient.fullNameEn : 'Assigned Custodian');
        histNote = `Issue approved for: ${approval.purposeOrRemarks}`;
        custodianId = approval.recipientEmployeeId ?? null;
        departmentId = approval.targetDepartmentId ?? null;
        heldByOrganization = outsideOrganization;
        heldByContact = outsideContact;
        approvedById = payload.reviewedById;

        const requested = Number((approval.requestDetails as Record<string, any> | null)?.quantity);
        const inStore = quantityOf(item);
        if (Number.isFinite(requested) && requested > 0 && requested < inStore) {
          // The rest stays in store on this record; the issued units get their own record
          const uom = uomOf(item);
          const code = await nextSplitCode(db, item);
          const recipientName = toEntity;
          split = {
            quantity: requested,
            remaining: Math.round((inStore - requested) * 10000) / 10000,
            uom,
            code,
            status: 'ISSUED',
            custodianId: approval.recipientEmployeeId ?? null,
            departmentId: approval.targetDepartmentId ?? null,
            heldByOrganization: outsideOrganization,
            heldByContact: outsideContact,
            historyAction: 'STOCK_OUT_APPROVED',
            toEntity: recipientName,
            notes: `${requested} ${uom} issued from ${item.itemCode} (Model 22 ${approval.ifmisSlipNumber}). Purpose: ${approval.purposeOrRemarks}`,
            detailsKey: 'issuedItemCode',
          };
          newItemStatus = 'AVAILABLE';
          custodianId = item.currentCustodianId;
          departmentId = item.assignedDepartmentId;
          heldByOrganization = item.heldByOrganization ?? null;
          heldByContact = item.heldByContact ?? null;
          approvedById = item.approvedById;
          fromEntity = 'Issue pending';
          toEntity = `${storeName} (AVAILABLE)`;
          histNote = `Issued ${requested} of ${inStore} ${uom} as ${code} to ${recipientName}; ${inStore - requested} ${uom} remain in store. Purpose: ${approval.purposeOrRemarks}`;
        }
      } else {
        throw new BadRequestError(`Unknown request type ${approval.transactionType}.`);
      }
    } else {
      if (approval.transactionType === 'STOCK_IN') {
        newItemStatus = 'REJECTED';
        historyAction = 'STOCK_IN_REJECTED';
        fromEntity = 'Pending Approval';
        toEntity = 'Rejected / Returned to Supplier';
        histNote = rejectionNote;
      } else if (approval.transactionType === 'RETURN') {
        // Nothing moved while the return was pending: the item stays with whoever holds it
        newItemStatus = statusForCustodian(item.currentCustodianId);
        historyAction = 'RETURN_REJECTED';
        fromEntity = 'Pending Return';
        toEntity = `${await holderName(item)} (Retained)`;
        histNote = rejectionNote;
      } else if (approval.transactionType === 'TRANSFER') {
        // Nothing was moved while pending, so the item simply keeps its current custody
        newItemStatus = statusForCustodian(item.currentCustodianId);
        historyAction = 'TRANSFER_REJECTED';
        fromEntity = 'Pending Transfer';
        toEntity = 'Current Custodian (Retained)';
        histNote = rejectionNote;
      } else if (approval.transactionType === 'DISPOSAL') {
        // Nothing left the store while the disposal was pending
        newItemStatus = 'AVAILABLE';
        historyAction = 'DISPOSAL_REJECTED';
        fromEntity = 'Disposal pending';
        toEntity = `${storeName} (AVAILABLE)`;
        histNote = rejectionNote;
      } else if (approval.transactionType === 'STOCK_OUT') {
        // A record another issue took meanwhile stays as that issue left it
        const stillInStore = item.status === 'AVAILABLE' || item.status === 'PENDING_STOCK_OUT';
        newItemStatus = stillInStore ? 'AVAILABLE' : item.status;
        historyAction = 'STOCK_OUT_REJECTED';
        fromEntity = 'Issue pending';
        toEntity = stillInStore ? `${storeName} (AVAILABLE)` : `${await holderName(item)} (Retained)`;
        histNote = rejectionNote;
      } else {
        throw new BadRequestError(`Unknown request type ${approval.transactionType}.`);
      }
    }

    if (newItemStatus === 'AVAILABLE' && approval.transactionType === 'STOCK_OUT' && (await unitsOnPendingIssues(db, item, approval.id)) > 0) {
      newItemStatus = 'PENDING_STOCK_OUT';
    }

    if (cancel) historyAction = historyAction.replace(/_REJECTED$/, '_CANCELLED');

    await db.item.update({
      where: { id: item.id },
      data: {
        status: newItemStatus as any,
        currentCustodianId: custodianId,
        assignedDepartmentId: departmentId,
        heldByOrganization,
        heldByContact,
        storeLocationId: locationId,
        approvedById,
        ...(approvedCondition ? { condition: approvedCondition as any } : {}),
        ...(split ? { notes: notesWithQuantity(item.notes, split.remaining, item.unitCostETB) } : {}),
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
    if (split) {
      await db.item.create({
        data: {
          itemCode: split.code,
          name: item.name,
          category: item.category,
          unitCostETB: item.unitCostETB,
          status: split.status as any,
          condition: (split.condition ?? item.condition) as any,
          itemType: (item.itemType ?? 'FIXED') as any,
          storeLocationId: split.locationId !== undefined ? (split.locationId ?? item.storeLocationId) : item.storeLocationId,
          currentCustodianId: split.custodianId,
          assignedDepartmentId: split.departmentId,
          heldByOrganization: split.heldByOrganization ?? null,
          heldByContact: split.heldByContact ?? null,
          ifmisSlipNumber: item.ifmisSlipNumber,
          ifmisSlipDateGc: item.ifmisSlipDateGc,
          ifmisSlipDateEc: item.ifmisSlipDateEc,
          ifmisSlipAttachmentUrl: item.ifmisSlipAttachmentUrl,
          isHistoricalData: item.isHistoricalData,
          notes: notesWithQuantity(item.notes, split.quantity, item.unitCostETB),
          parentItemId: item.parentItemId ?? item.id,
          registeredById: item.registeredById,
          approvedById: payload.reviewedById,
          createdAtGc: today.gc,
          createdAtEc: today.ec,
          history: {
            create: {
              dateGc: today.gc,
              dateEc: today.ec,
              action: split.historyAction,
              fromEntity: `${storeName} (${item.itemCode})`,
              toEntity: split.toEntity,
              performedBy: reviewerName,
              performedByRole: (reviewer ? reviewer.role : 'DEPARTMENT_HEAD') as any,
              approvedBy: reviewerName,
              ifmisSlipNumber: approval.ifmisSlipNumber,
              notes: split.notes,
            },
          },
        },
      });
      // Remember which record holds the issued or disposed units
      finalApproval = await db.transactionApproval.update({
        where: { id: approval.id },
        data: {
          requestDetails: { ...((approval.requestDetails ?? {}) as Record<string, any>), [split.detailsKey]: split.code } as any,
        },
        include: APPROVAL_INCLUDES,
      });
    }

    await addAuditLog(
      payload.reviewedById,
      isApprove ? `APPROVE_${approval.transactionType}` : `CANCEL_${approval.transactionType}`,
      'APPROVAL',
      item.id,
      `${approval.transactionType} ${isApprove ? 'APPROVED' : 'CANCELLED'} by ${reviewerName} for item ${item.itemCode}.${split ? ` Partial ${split.status === 'ISSUED' ? (approval.transactionType === 'TRANSFER' ? 'transfer' : 'issue') : split.status === 'AVAILABLE' ? 'transfer' : 'disposal'}: ${split.quantity} ${split.uom} as ${split.code}.` : ''} Remarks: ${updatedApproval.reviewRemarks}`,
      approval.ifmisSlipNumber,
      undefined,
      undefined,
      db,
    );

    return mapApproval(finalApproval);
  }

  // ── Transfer ────────────────────────────────────────────────────────────

  public async transferItem(payload: CreateTransferRequest): Promise<TransactionApproval> {
    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
    if (!item) throw new NotFoundError(`Item ${payload.itemId} not found.`);
    // A consumable is issued (Model 22) and used up; it is never transferred
    if (item.itemType === 'CONSUMABLE') {
      throw new ConflictError(`${item.itemCode} is a consumable item. Consumables are issued (Model 22) and can't be transferred.`);
    }
    // A fixed asset can be transferred from the store to an employee, or from one holder to another
    if (item.status !== 'AVAILABLE' && item.status !== 'ISSUED') {
      throw new ConflictError(`Item ${item.itemCode} cannot be transferred. Current status: ${item.status}`);
    }
    if (item.heldByOrganization) {
      throw new ConflictError(`${item.itemCode} was issued to ${item.heldByOrganization}. Transferring an item issued to an outside organization isn't supported yet.`);
    }
    await assertNoPendingApproval(item);
    const slipNo = String(payload.model21No || '').trim();
    if (!slipNo) throw new BadRequestError('Transfer Voucher (Model 21) number is mandatory.');
    // The reason is optional on a transfer
    const reason = String(payload.reason ?? '').trim() || undefined;
    assertMaxLength(reason, 500, 'Reason for transfer');
    assertSlipDate(payload.ifmisSlipDateGc, 'The transfer date');
    // An empty choice means "not chosen"
    payload.toEmployeeId = payload.toEmployeeId || undefined;
    payload.toDepartmentId = payload.toDepartmentId || undefined;
    payload.toLocationId = payload.toLocationId || undefined;
    if (!payload.toEmployeeId && !payload.toLocationId) throw new BadRequestError('Choose the new custodian or the new location.');
    const sameCustodian = !!payload.toEmployeeId && payload.toEmployeeId === item.currentCustodianId;
    const sameLocation = !payload.toLocationId || payload.toLocationId === item.storeLocationId;
    if (sameCustodian && sameLocation) throw new BadRequestError('This person already holds the item. Choose a different custodian.');
    if (!payload.toEmployeeId && sameLocation) throw new BadRequestError('The item is already in this location. Choose a new custodian or a different location.');

    // The store man of the store the item came from is named on the voucher
    const transferrer = item.storeLocationId
      ? await requireStoreKeeper(prisma, { locationId: item.storeLocationId }, payload.transferredByEmployeeId, 'the transfer')
      : null;

    const today = getTodayGcAndEc();
    // The current custodian, or the store the item is in
    const prevCustodian = await holderName(item);
    // Where the item goes when only its location changes
    let destinationLabel: string | undefined;
    const newCustodianRecord = payload.toEmployeeId ? await prisma.employee.findUnique({ where: { id: payload.toEmployeeId } }) : null;
    if (payload.toEmployeeId && !newCustodianRecord) throw new BadRequestError('The selected new custodian no longer exists.');
    assertActiveEmployee(newCustodianRecord, 'the new custodian');
    if (payload.toDepartmentId) {
      const toDepartment = await prisma.department.findUnique({ where: { id: payload.toDepartmentId } });
      if (!toDepartment) throw new BadRequestError('The selected directorate no longer exists.');
    }
    if (payload.toLocationId) {
      const toLocation = await prisma.location.findUnique({ where: { id: payload.toLocationId }, include: { store: true } });
      if (!toLocation) throw new BadRequestError('The selected location no longer exists.');
      assertUsableLocation(toLocation, 'the destination location');
      destinationLabel = locationLabel(toLocation);
    }
    const newCustodian = payload.toEmployeeId ? newCustodianRecord?.fullNameEn : prevCustodian;
    const performer = payload.performedById ? await prisma.employee.findUnique({ where: { id: payload.performedById } }) : null;

    const inStore = quantityOf(item);
    const requested = Number(payload.quantity);
    const quantity = Number.isFinite(requested) && requested > 0 ? requested : inStore;
    if (quantity > inStore) {
      throw new BadRequestError(`Cannot transfer ${quantity} ${uomOf(item)}. Only ${inStore} are held.`);
    }

    const transferDetails: Model21RequestDetails = {
      ...(item.status === 'AVAILABLE' ? { fromStore: true } : {}),
      ...(transferrer ? { transferredByEmployeeId: transferrer.employeeId, transferredByName: transferrer.fullNameEn } : {}),
      quantity,
      uom: uomOf(item),
      reason,
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
            fromEntity: prevCustodian,
            toEntity: `${(payload.toEmployeeId ? newCustodian : destinationLabel) || newCustodian} (Pending Approval)`,
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
        ifmisSlipDateGc: payload.ifmisSlipDateGc || today.gc,
        ifmisSlipDateEc: payload.ifmisSlipDateGc ? formatGcToEc(payload.ifmisSlipDateGc) : today.ec,
        // The signed Model 21, when one was attached (optional for a transfer)
        ifmisSlipAttachmentUrl: payload.ifmisSlipAttachmentUrl || undefined,
        requestedById: payload.performedById,
        recipientEmployeeId: payload.toEmployeeId,
        targetDepartmentId: payload.toDepartmentId,
        targetLocationId: payload.toLocationId,
        purposeOrRemarks: `Transfer from ${prevCustodian} to ${newCustodian}. ${quantity < inStore ? `(${quantity} of ${inStore} ${uomOf(item)}) ` : ''}${model21Details}`,
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
    return withVoucherApprover(rows.map(mapApproval));
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

  public async updateEmployeeRole(id: string, role: UserRole, actorId?: string): Promise<Employee> {
    return mapEmployee(await assignEmployeeRole(id, role, actorId));
  }

  // ── Executive Dashboard ─────────────────────────────────────────────────

  /**
   * Everything on the dashboard, optionally for one store, one category and/or one item type, and for a period.
   * - Store, category and item type narrow the items, so every figure follows them.
   * - A period (from–to, G.C. dates) narrows activity: the totals and charts cover assets received in it (shown where
   *   they are now), pending requests made in it, and movement month by month across it. Stock in store longer than the
   *   limit stays "as of today". Recent activity is the system log and is not narrowed.
   */
  public async getExecutiveDashboard(filter: { storeId?: unknown; category?: unknown; itemType?: unknown; from?: unknown; to?: unknown } = {}) {
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const storeId = text(filter.storeId);
    const category = text(filter.category);
    const itemType = text(filter.itemType);
    if (category && !(Object.values(AssetCategory) as string[]).includes(category)) throw new BadRequestError('Unknown category.');
    if (itemType && itemType !== 'FIXED' && itemType !== 'CONSUMABLE') throw new BadRequestError('Item type is FIXED or CONSUMABLE.');
    const filtered = !!(storeId || category || itemType);
    const day = (v: unknown, name: string) => {
      const d = text(v);
      if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) throw new BadRequestError(`${name} must be a date (YYYY-MM-DD).`);
      return d;
    };
    const from = day(filter.from, 'From');
    const to = day(filter.to, 'To');
    if (from && to && from > to) throw new BadRequestError('The period starts after it ends.');
    const inPeriod = (date?: string | null) => {
      const d = (date || '').slice(0, 10);
      return !!d && (!from || d >= from) && (!to || d <= to);
    };
    const periodSet = !!(from || to);

    const [allItemsRaw, departments, allLocations, pendingRequests, recentLogs, approvedStockOuts] = await Promise.all([
      prisma.item.findMany({
        include: ITEM_INCLUDES,
        orderBy: { unitCostETB: 'desc' },
      }),
      prisma.department.findMany({ orderBy: { code: 'asc' } }),
      prisma.location.findMany({ include: { store: true }, orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }] }),
      prisma.transactionApproval.findMany({
        where: { status: 'PENDING' },
        select: { itemId: true, createdAtGc: true, currentStage: true, transactionType: true, status: true, ifmisSlipNumber: true, requestDetails: true },
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.transactionApproval.findMany({
        where: { transactionType: 'STOCK_OUT' as any, status: 'APPROVED' as any },
        select: { itemId: true, reviewedAtGc: true, createdAtGc: true, requestDetails: true },
      }),
    ]);

    // The items the filters keep: an item belongs to the store of its location (issued ones to the store they left)
    const scopedItems = allItemsRaw.map(mapItem).filter(
      (i) =>
        (!storeId || i.storeLocation?.storeId === storeId) &&
        (!category || i.category === category) &&
        (!itemType || (itemType === 'CONSUMABLE' ? i.itemType === 'CONSUMABLE' : i.itemType !== 'CONSUMABLE')),
    );
    const keptIds = new Set(scopedItems.map((i) => i.id));
    // Received in the period: by the receipt (Model 19) date; a record split off a batch by the date of its batch
    const scopedById = new Map(scopedItems.map((i) => [i.id, i]));
    const receivedOn = (i: (typeof scopedItems)[number]) => {
      const reg = (i.parentItemId && scopedById.get(i.parentItemId)) || i;
      return reg.ifmisSlipDateGc || reg.createdAtGc;
    };
    const allItems = periodSet ? scopedItems.filter((i) => inPeriod(receivedOn(i))) : scopedItems;
    const locations = storeId ? allLocations.filter((l) => l.storeId === storeId) : allLocations;
    const pendingApprovalsList = pendingRequests.filter((r) => (!filtered || keptIds.has(r.itemId)) && (!periodSet || inPeriod(r.createdAtGc)));
    // Counted as the approvals queue shows them: a voucher of several lines once, by its grand total
    const itemById = new Map(allItemsRaw.map((i: any) => [i.id, i]));
    const rejectedRows = await prisma.transactionApproval.findMany({
      where: { status: 'RETURNED' as any },
      select: { id: true, itemId: true, createdAtGc: true, transactionType: true, ifmisSlipNumber: true },
    });
    const rejectedWaiting = new Set(
      (Array.isArray(rejectedRows) ? rejectedRows : [])
        .filter((r: any) => (!filtered || keptIds.has(r.itemId)) && (!periodSet || inPeriod(r.createdAtGc)))
        .map((r: any) => {
          const slip = String(r.ifmisSlipNumber ?? '').trim().toLowerCase();
          if (!slip || slip.startsWith('pending-')) return r.id;
          const po = r.transactionType === 'STOCK_IN' ? String(readItemMeta((itemById.get(r.itemId) as any)?.notes).poNumber ?? '').trim().toLowerCase() : '';
          return `${r.transactionType}|${slip}|${po}`;
        }),
    ).size;
    const pendingRows = pendingVouchers(
      pendingApprovalsList.map((r) => {
        const item: any = itemById.get(r.itemId);
        return {
          transactionType: r.transactionType,
          status: r.status,
          currentStage: r.currentStage,
          ifmisSlipNumber: r.ifmisSlipNumber,
          poNumber: readItemMeta(item?.notes).poNumber,
          totalAmount: calculateApprovalTotalAmount(r, item),
          disposal: r.transactionType === 'DISPOSAL' || (r.requestDetails as any)?.disposal === true,
        };
      }),
    );
    const pendingApprovals = pendingRows.length;
    // What the pending requests are worth, as the approvers see them: an issue by the units it takes, not its whole record
    const pendingApprovalsValuationETB = pendingApprovalsList.reduce((s, r) => {
      const it: any = itemById.get(r.itemId);
      return s + (it ? calculateApprovalTotalAmount(r, it) : 0);
    }, 0);
    const stage2Rows = pendingRows.filter((r) => r.currentStage === 2);
    const pendingStageCounts = {
      stage1: pendingRows.filter((r) => r.currentStage === 1).length,
      stage2: stage2Rows.length,
      // Stage 2 by who authorizes it: the Chief Director above 10 million birr, the Department Head otherwise
      departmentHead: stage2Rows.filter((r) => !needsChiefDirector(r.total)).length,
      executive: stage2Rows.filter((r) => needsChiefDirector(r.total)).length,
    };

    // Count units, not records: a partial Stock-Out splits one registration into several records,
    // so record counts would change while the stock did not. Values are unit price × units.
    const unitsOf = (i: { quantity?: number }) => Number(i.quantity) || 1;
    const units = (arr: typeof allItems) => arr.reduce((s, i) => s + unitsOf(i), 0);

    // Same buckets as item balances, so the dashboard, Reports and the lists agree
    const available = allItems.filter((i) => IN_STORE_STATUSES.includes(i.status));
    const issued = allItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status));
    const pendingIn = allItems.filter((i) => i.status === 'PENDING_STOCK_IN');
    const pendingDisposal = allItems.filter((i) => i.status === ItemStatus.PENDING_DISPOSAL);
    const disposed = allItems.filter((i) => i.status === ItemStatus.DISPOSED);
    // Assets on record: approved and in store or with a custodian. Receipts still awaiting endorsement or
    // approval, and rejected or disposed ones, are left out; pending receipts are counted on their own.
    const onRecord = [...available, ...issued];

    // Valued at what a unit cost, VAT and additional charges in, as IFMIS carries it
    const sum = (arr: typeof allItems) => arr.reduce((s, i) => s + (i.costPerUnit ?? i.unitCostETB ?? 0) * unitsOf(i), 0);

    const departmentDistribution = departments.map((dept) => {
      const deptItems = onRecord.filter((i) => i.assignedDepartmentId === dept.id);
      return {
        departmentId: dept.id,
        departmentCode: dept.code,
        nameEn: dept.nameEn,
        nameAm: dept.nameAm,
        itemCount: units(deptItems),
        totalValueETB: sum(deptItems),
        availableCount: units(deptItems.filter((i) => IN_STORE_STATUSES.includes(i.status))),
        issuedCount: units(deptItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status))),
        otherStatusCount: units(pendingIn.filter((i) => i.assignedDepartmentId === dept.id)),
        items: deptItems,
      };
    });

    const unassignedItems = onRecord.filter((i) => !i.assignedDepartmentId);

    // Fixed capital assets vs operational consumables split
    const fixedItems = onRecord.filter((i) => (i.itemType ?? 'FIXED') !== 'CONSUMABLE');
    const consumableItems = onRecord.filter((i) => i.itemType === 'CONSUMABLE');
    const fixedAssetsCount = units(fixedItems);
    const fixedAssetsValuationETB = sum(fixedItems);
    const consumableCount = units(consumableItems);
    const consumableValuationETB = sum(consumableItems);

    // Capital pending disposal
    const pendingDisposalValuationETB = sum(pendingDisposal);

    // High-risk fleet & agricultural machinery stats
    const vehicles = onRecord.filter((i) => i.category === 'VEHICLE');
    const machinery = onRecord.filter((i) => i.category === 'AGRI_MACHINERY');
    const fleetStats = {
      totalVehicles: units(vehicles),
      vehicleValuationETB: sum(vehicles),
      activeVehicles: units(vehicles.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status))),
      inStoreVehicles: units(vehicles.filter((i) => IN_STORE_STATUSES.includes(i.status))),
      totalMachinery: units(machinery),
      machineryValuationETB: sum(machinery),
      activeMachinery: units(machinery.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status))),
      inStoreMachinery: units(machinery.filter((i) => IN_STORE_STATUSES.includes(i.status))),
    };

    // Units that have stayed in store longer than the distribution limit, oldest first
    const todayMs = Date.parse(getTodayGcAndEc().gc);
    const staleItems = scopedItems
      .filter((i) => IN_STORE_STATUSES.includes(i.status))
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
          disposalPending: i.status === ItemStatus.PENDING_DISPOSAL,
        };
      })
      .filter((i) => i.daysInStore > STALE_IN_STORE_DAYS)
      .sort((a, b) => b.daysInStore - a.daysInStore);

    // Units received and issued per month, for the last 6 months including this one
    const [thisYear, thisMonth] = getTodayGcAndEc().gc.split('-').map(Number);
    const monthsBetween = (a: string, b: string) => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      return (by - ay) * 12 + (bm - am);
    };
    const lastMonth = (to ?? getTodayGcAndEc().gc).slice(0, 7);
    const spanMonths = from ? Math.min(Math.max(monthsBetween(from.slice(0, 7), lastMonth) + 1, 1), 24) : 6;
    const [endYear, endMonth] = from || to ? lastMonth.split('-').map(Number) : [thisYear, thisMonth];
    const movementMonths = Array.from({ length: spanMonths }, (_, k) =>
      new Date(Date.UTC(endYear, endMonth - 1 - (spanMonths - 1 - k), 1)).toISOString().slice(0, 7)
    );
    const receivedByMonth = new Map<string, number>();
    const issuedByMonth = new Map<string, number>();
    // Received: each approved registration with the units split off it, by its receiving (Model 19) month.
    // Units disposed of later were still received; rejected receipts never were.
    for (const reg of scopedItems.filter((i) => !i.parentItemId && i.status !== 'PENDING_STOCK_IN' && i.status !== ItemStatus.REJECTED)) {
      if (periodSet && !inPeriod(reg.ifmisSlipDateGc || reg.createdAtGc)) continue;
      const month = (reg.ifmisSlipDateGc || reg.createdAtGc || '').slice(0, 7);
      const unitsReceived = unitsOf(reg) + units(scopedItems.filter((c) => c.parentItemId === reg.id && c.status !== ItemStatus.REJECTED));
      receivedByMonth.set(month, (receivedByMonth.get(month) ?? 0) + unitsReceived);
    }
    // Issued: each approved Stock-Out by the month it was approved (a partial issue counts its own units)
    const itemsById = scopedById;
    for (const so of approvedStockOuts) {
      if (filtered && !keptIds.has(so.itemId)) continue;
      if (periodSet && !inPeriod(so.reviewedAtGc || so.createdAtGc)) continue;
      const month = (so.reviewedAtGc || so.createdAtGc || '').slice(0, 7);
      const requested = Number((so.requestDetails as Record<string, any> | null)?.quantity);
      const item = itemsById.get(so.itemId);
      const unitsIssued = Number.isFinite(requested) && requested > 0 ? requested : item ? unitsOf(item) : 1;
      issuedByMonth.set(month, (issuedByMonth.get(month) ?? 0) + unitsIssued);
    }
    const stockMovement = movementMonths.map((month) => ({
      month,
      received: receivedByMonth.get(month) ?? 0,
      issued: issuedByMonth.get(month) ?? 0,
    }));

    const conditionDistribution = ['NEW', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((cond) => {
      const matching = onRecord.filter((i) => i.condition === cond);
      return {
        condition: cond,
        count: units(matching),
        totalValueETB: sum(matching),
      };
    });

    const locationUtilization = locations.map((loc) => {
      const locItems = onRecord.filter((i) => i.storeLocationId === loc.id);
      const locAvailable = locItems.filter((i) => IN_STORE_STATUSES.includes(i.status));
      const locIssued    = locItems.filter((i) => WITH_CUSTODIAN_STATUSES.includes(i.status));
      const locPending   = pendingIn.filter((i) => i.storeLocationId === loc.id);
      // category breakdown per location
      const locCategoryBreakdown = Object.values(AssetCategory).map((cat) => {
        const matching = locItems.filter((i) => i.category === cat);
        return { category: cat, count: units(matching), totalValueETB: sum(matching) };
      }).filter((c) => c.count > 0);

      return {
        id: loc.id,
        siteName: locationView(loc).siteName,
        building: locationView(loc).building,
        roomNumber: locationView(loc).roomNumber,
        isCentralStore: true,
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
      const matching = onRecord.filter((i) => i.category === cat);
      return { category: cat, count: units(matching), totalValueETB: sum(matching) };
    });

    const topValuationAssets = onRecord
      .filter((i) => i.itemType !== 'CONSUMABLE')
      .sort((a, b) => (b.costPerUnit ?? b.unitCostETB ?? 0) * unitsOf(b) - (a.costPerUnit ?? a.unitCostETB ?? 0) * unitsOf(a))
      .slice(0, 8);

    return {
      // Approved units only; pending receipts are in pendingStockInCount
      totalItems: units(onRecord),
      totalRecords: onRecord.length,
      availableCount: units(available),
      availableRecords: available.length,
      availableValuationETB: sum(available),
      issuedCount: units(issued),
      issuedRecords: issued.length,
      issuedValuationETB: sum(issued),
      // Requests waiting for approval, by kind, counted as the approvals queue shows them (they add up to pendingApprovalsCount)
      pendingStockInCount: pendingRows.filter((r) => r.lead.transactionType === 'STOCK_IN').length,
      pendingStockOutCount: pendingRows.filter((r) => r.lead.transactionType === 'STOCK_OUT' && !r.lead.disposal).length,
      pendingTransferCount: pendingRows.filter((r) => r.lead.transactionType === 'TRANSFER' || r.lead.transactionType === 'RETURN').length,
      pendingDisposalCount: pendingRows.filter((r) => r.lead.disposal).length,
      // Units disposed of through approved disposals, and their value at unit price
      disposedCount: units(disposed),
      disposedValuationETB: sum(disposed),
      pendingApprovalsCount: pendingApprovals,
      pendingApprovalsValuationETB,
      // Rejected requests back with their requesters, to correct and resubmit or cancel (vouchers, not lines)
      rejectedWaitingCount: rejectedWaiting,
      pendingStageCounts,
      totalValuationETB: sum(onRecord),
      fixedAssetsCount,
      fixedAssetsValuationETB,
      consumableCount,
      consumableValuationETB,
      pendingDisposalValuationETB,
      fleetStats,
      unassignedItemsCount: units(unassignedItems),
      unassignedValuationETB: sum(unassignedItems),
      unassignedItems,
      stockMovement,
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
