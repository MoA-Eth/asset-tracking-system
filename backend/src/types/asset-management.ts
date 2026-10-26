export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  DATA_ENCODER = 'DATA_ENCODER',
  TEAM_LEADER = 'TEAM_LEADER',
  DEPARTMENT_HEAD = 'DEPARTMENT_HEAD',
  CHIEF_DIRECTOR = 'CHIEF_DIRECTOR',
  MANAGER = 'MANAGER', // General Manager
  EMPLOYEE = 'EMPLOYEE', // Sees only the assets assigned to them
}

export enum ItemStatus {
  PENDING_STOCK_IN = 'PENDING_STOCK_IN', // Registered by Data Encoder, waiting for Dept Head approval
  AVAILABLE = 'AVAILABLE',               // In Store, ready to be issued
  PENDING_STOCK_OUT = 'PENDING_STOCK_OUT', // Stock out registered, waiting for approval
  ISSUED = 'ISSUED',                     // Issued to an employee or department
  UNDER_TRANSFER = 'UNDER_TRANSFER',     // In transit between locations/employees
  PENDING_DISPOSAL = 'PENDING_DISPOSAL', // Disposal requested, waiting for approval (still in store)
  DISPOSED = 'DISPOSED',                 // Disposed of through an approved disposal
  REJECTED = 'REJECTED',                 // Receipt (Stock-In) rejected
}

export enum TransactionType {
  STOCK_IN = 'STOCK_IN',
  STOCK_OUT = 'STOCK_OUT',
  TRANSFER = 'TRANSFER',
  RETURN = 'RETURN',
  DISPOSAL = 'DISPOSAL',
}

export enum ItemCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  DAMAGED = 'DAMAGED',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  /** Rejected by an approver and with its requester: still open, corrected and resubmitted, or cancelled */
  REJECTED = 'REJECTED',
  /** Withdrawn by its requester after it was rejected; closed, its record released */
  CANCELLED = 'CANCELLED',
  /** Formally voided after approval; inventory movements reversed with full audit trail */
  VOIDED = 'VOIDED',
}

export enum AssetCategory {
  VEHICLE = 'VEHICLE',
  AGRI_MACHINERY = 'AGRI_MACHINERY',
  IT_EQUIPMENT = 'IT_EQUIPMENT',
  OFFICE_FURNITURE = 'OFFICE_FURNITURE',
  LAB_EQUIPMENT = 'LAB_EQUIPMENT',
  FIELD_GEAR = 'FIELD_GEAR',
  OFFICE_SUPPLIES = 'OFFICE_SUPPLIES',
  FUEL_LUBRICANTS = 'FUEL_LUBRICANTS',
  OTHER_SUPPLIES = 'OTHER_SUPPLIES',
}

export interface Department {
  id: string;
  code: string;
  nameEn: string;
  nameAm: string;
  headEmployeeId?: string;
}

/** A store receives and issues stock; it contains one or more locations */
export interface Store {
  id: string;
  name: string;
  /** Building or address */
  address: string;
  isActive: boolean;
}

/** A room, section or shelf inside a store */
export interface Location {
  id: string;
  storeId: string;
  name: string;
  storeName: string;
  /** False when the location or its store has been deactivated */
  isActive: boolean;
  /** Kept for screens and slips that show "store · location": the store's name, its address, and the location's name */
  siteName: string;
  building: string;
  roomNumber: string;
  isCentralStore?: boolean;
}

export interface Employee {
  id: string;
  payrollId: string;
  fullNameEn: string;
  fullNameAm: string;
  departmentId: string;
  jobTitle?: string | null;
  /** Team inside the department */
  unit?: string | null;
  /** Gender and contact details are only sent to people who manage employees */
  gender?: 'MALE' | 'FEMALE' | null;
  email?: string | null;
  phone?: string | null;
  /** System role; null when the employee can't sign in */
  role: UserRole | null;
  isActive: boolean;
  /** Their password is temporary (only sent to people who manage employees) */
  mustChangePassword?: boolean;
}

export interface ItemMovementHistory {
  id: string;
  dateGc: string;
  dateEc: string;
  action: string;
  fromEntity?: string;
  toEntity?: string;
  performedBy: string;
  performedByRole: UserRole;
  approvedBy?: string;
  ifmisSlipNumber?: string;
  notes?: string;
}

/** Fixed asset (ቋሚ ዕቃ) or consumable item (አላቂ ዕቃ) */
export type ItemType = 'FIXED' | 'CONSUMABLE';

export interface Item {
  id: string;
  itemCode: string;          // e.g. MOA-IT-2024-0001
  /** A fixed asset's tag number in IFMIS (e.g. MOA-016341), by which its Model 21 and disposal form name it */
  ifmisTagNumber?: string;
  name: string;
  category: AssetCategory;
  /** Chosen when the item is received; items from before this existed are FIXED */
  itemType: ItemType;
  serialNumber: string;
  unitCostETB: number;
  status: ItemStatus;
  condition: ItemCondition;
  
  // Storage & Assignment
  storeLocationId: string;
  currentCustodianId?: string | null;
  assignedDepartmentId?: string | null;
  
  // IFMIS Reference
  ifmisSlipNumber: string;    // Mandatory IFMIS slip reference
  ifmisSlipDateGc: string;
  ifmisSlipDateEc: string;
  ifmisSlipAttachmentUrl?: string; // File/Image reference
  isHistoricalData?: boolean;
  notes?: string;

  // Metadata
  registeredById: string;
  approvedById?: string;
  createdAtGc: string;
  createdAtEc: string;
  createdAt?: string;
  updatedAt?: string;
  history: ItemMovementHistory[];

  // Extended Model 19 (IFMIS Receiving) Fields
  /** Bought, or donated: a donation has no PO, supplier, buyer or price */
  /** A consumable's IFMIS inventory item code, e.g. 108101101.0021 (shared by every delivery of it) */
  ifmisItemCode?: string;
  provisionType?: ProvisionType;
  poNumber?: string;
  transactionType?: string;
  source?: string;
  buyer?: string;
  programName?: string;
  uom?: string;
  subInventory?: string;
  itemCategoryDisplay?: string;
  lotBatchNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity?: number;
  totalAmount?: number;
  vatApplicable?: boolean;
  additionalCharges?: number;
  /** What one unit cost: the Model 19 total ÷ quantity, VAT and additional charges in (set by the server) */
  costPerUnit?: number;
  deliveredBy?: string;
  receivedBy?: string;
  remark?: string;
}

export interface Model19LineItem {
  id?: string;
  sNo: number;
  itemCode?: string;
  itemDescription: string;
  uom: string;
  subInventory?: string;
  itemCategory: string;
  lotBatchNo?: string;
  serialNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity: number;
  unitPrice: number;
  vatApplicable?: boolean;
  additionalCharges?: number;
  totalAmount: number;
  remark?: string;
}

/** How goods on a Model 19 were provided: bought on a PO, or donated (no PO, supplier, buyer or price) */
export type ProvisionType = 'PURCHASE' | 'DONATION';
export const PROVISION_TYPES: ProvisionType[] = ['PURCHASE', 'DONATION'];

export interface Model19Voucher {
  invModel19No: string;
  poNumber: string;
  receivedDateGc: string;
  receivedDateEc?: string;
  transactionType: string;
  source: string;
  buyer: string;
  programName?: string;
  storeLocationId?: string;
  storeLocationName?: string;
  deliveredByName?: string;
  receivedByName?: string;
  reportTakenBy?: string;
  reportTakenDate?: string;
  items: Model19LineItem[];
  grandTotal: number;
}

export interface Model22LineItem {
  id?: string;
  sNo: number;
  itemCode: string;
  itemDescription: string;
  uom: string;
  subInventory?: string;
  itemCategory: string;
  lotBatchNo?: string;
  serialNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  remark?: string;
}

export interface Model22Voucher {
  model22No: string;
  issuedDateGc: string;
  issuedDateEc?: string;
  transactionType: string;
  destination: string;
  destinationDepartmentId?: string;
  subInventory?: string;
  issuedByName?: string;
  receivedByName?: string;
  receivedByEmployeeId?: string;
  items: Model22LineItem[];
  total: number;
  transportationCost?: number;
  grandTotal: number;
  reportPrintedBy?: string;
  reportPrintedDate?: string;
}

export interface Model21Accessory {
  name: string;
  quantity: number;
}

export interface Model21LineItem {
  id?: string;
  sNo: number;
  description: string;
  tagNumber: string;
  serialNumber?: string;
  chassisNumber?: string;
  uom?: string;
  unit: number;
  origCost: number;
  depreciation: number;
  bookValue: number;
  dateGc: string;
  dateEc?: string;
  fromLocation: string;
  toLocation: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  remark?: string;
}

export interface Model21Voucher {
  model21No: string;
  fromEmployeeName: string;
  fromEmployeeId: string;
  book: string;
  toEmployeeName: string;
  toEmployeeId: string;
  items: Model21LineItem[];
  famuAccountantName?: string;
  reportTakenBy?: string;
  reportTakenDate?: string;
}

/** Units of one registered item across the records split off it by partial Stock-Outs */
export interface ItemBalance {
  /** All units received, not counting rejected registrations */
  total: number;
  /** Units with a custodian (issued or being transferred) */
  issued: number;
  /** Units in store, including units requested by a pending Stock-Out */
  available: number;
  /** Units of a registration still waiting for approval */
  pending: number;
  /** Of the units in store, those a pending issue or disposal request is taking out: not free to issue */
  requested?: number;
}

/** One asset as its holder sees it on "My assets": no costs, notes or other people's names */
export interface MyAsset {
  id: string;
  itemCode: string;
  name: string;
  category: AssetCategory;
  serialNumber: string;
  condition: ItemCondition;
  quantity: number;
  uom: string;
  status: ItemStatus;
  /** When it was issued or transferred to this person (G.C.), and the slip it was done on */
  assignedOnGc?: string;
  voucherNo?: string;
  /** Where it comes from, the directorate it is assigned to, and what it was issued for */
  issuedFrom?: string;
  department?: string;
  purpose?: string;
  /** A transfer or return of it is waiting for approval */
  pendingRequest?: { type: 'TRANSFER' | 'RETURN'; stage: number };
}

export interface ItemWithRelations extends Item {
  /** Set while the record is issued to an outside organization instead of an employee */
  heldByOrganization?: string;
  heldByContact?: string;
  /** Set on a record split off a batch by a partial Stock-Out */
  parentItemId?: string;
  /** For a registration: totals across its split-off records. For a split-off record: its own units. */
  balance?: ItemBalance;
  storeLocation?: Location;
  currentCustodian?: Employee | null;
  assignedDepartment?: Department | null;
  registeredBy?: Employee;
  approvedBy?: Employee;
}

export interface TransactionApproval {
  id: string;
  transactionType: TransactionType;
  itemId: string;
  itemCode: string;
  itemName: string;
  
  // IFMIS attachment
  ifmisSlipNumber: string;
  /** A receipt's PO number (from its Model 19): lines with the same slip and PO are one receipt */
  poNumber?: string;
  ifmisSlipDateGc: string;
  ifmisSlipDateEc: string;
  ifmisSlipAttachmentUrl?: string;
  
  // Parties
  requestedById: string;
  recipientEmployeeId?: string;
  targetDepartmentId?: string;
  targetLocationId?: string;
  purposeOrRemarks: string;
  /** Model 21 particulars, for transfer and return requests */
  requestDetails?: Model21RequestDetails;
  /** Units currently on the request's item record, and their unit of measure */
  itemUnits?: number;
  itemUom?: string;
  /** Total transaction value in ETB */
  totalAmount?: number;
  /** Required role for Stage 2 authorization */
  requiredRole?: "DEPARTMENT_HEAD" | "CHIEF_DIRECTOR";
  
  // Multi-Stage Workflow Status
  status: ApprovalStatus;
  currentStage: number; // 1 = Team Leader Endorsement Pending, 2 = Dept Head Approval Pending
  
  // Stage 1: Team Leader Endorsement
  endorsedById?: string;
  endorsementRemarks?: string;
  endorsedAtGc?: string;
  endorsedAtEc?: string;
  endorsedBy?: Employee;
  
  // Stage 2: Department Head Final Approval
  reviewedById?: string;
  reviewRemarks?: string;
  createdAtGc: string;
  createdAtEc: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedAtGc?: string;
  reviewedAtEc?: string;
  reviewedBy?: Employee;
  /** Returned for correction: by whom, from which stage, why and when, and how many times so far */
  returnedById?: string;
  returnedBy?: Employee;
  returnRemarks?: string;
  returnedAtGc?: string;
  returnedAtEc?: string;
  returnedFromStage?: number;
  returnCount?: number;
  /** A final rejection: the voucher can't be entered again */
  rejectionFinal?: boolean;
  /** Set when an approved request is formally voided and reversed */
  voidDetails?: {
    voided: boolean;
    voidedAtGc?: string;
    voidedAtEc?: string;
    voidedById?: string;
    voidedByName?: string;
    voidReason?: string;
  };
  requestedBy?: Employee;
  recipientEmployee?: Employee;
}

export interface AuditLogEntry {
  id: string;
  timestampGc: string;
  timestampEc: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: 'USER' | 'ITEM' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'RETURN' | 'DISPOSAL' | 'APPROVAL';
  entityId: string;
  ifmisSlipNumber?: string;
  details: string;
  previousState?: any;
  newState?: any;
}

export interface CreateStockInRequest {
  /** The store man of the receiving store who receives the goods (the store's only one, when there is one) */
  receivedByEmployeeId?: string;
  name: string;
  category: AssetCategory;
  /** FIXED when left out */
  itemType?: ItemType;
  serialNumber: string;
  unitCostETB: number;
  storeLocationId: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  ifmisSlipAttachmentUrl?: string;
  isHistoricalData?: boolean;
  condition?: ItemCondition;
  registeredById: string;
  notes?: string;

  // Extended Model 19 fields
  ifmisItemCode?: string;
  provisionType?: ProvisionType;
  poNumber?: string;
  transactionType?: string;
  source?: string;
  donor?: string;
  buyer?: string;
  programName?: string;
  itemCode?: string;
  uom?: string;
  subInventory?: string;
  itemCategoryDisplay?: string;
  lotBatchNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity?: number;
  totalAmount?: number;
  vatApplicable?: boolean;
  additionalCharges?: number;
  deliveredBy?: string;
  receivedBy?: string;
  remark?: string;

  // Multi-item batch registration support
  items?: Array<{
    ifmisItemCode?: string;
    itemCode?: string;
    name: string;
    category?: AssetCategory;
    itemType?: ItemType;
    serialNumber?: string;
    unitCostETB: number;
    condition?: ItemCondition;
    uom?: string;
    subInventory?: string;
    itemCategoryDisplay?: string;
    lotBatchNo?: string;
    printedPadFrom?: string;
    printedPadTo?: string;
    quantity: number;
    totalAmount?: number;
    vatApplicable?: boolean;
    additionalCharges?: number;
    remark?: string;
  }>;
}

/** Corrections to a Stock-In registration while it still waits for Stage 1 endorsement. */
export interface UpdateStockInRequest {
  receivedByEmployeeId?: string;
  name: string;
  category: AssetCategory;
  /** Kept as it is when left out */
  itemType?: ItemType;
  serialNumber?: string;
  unitCostETB: number;
  vatApplicable?: boolean;
  additionalCharges?: number;
  condition?: ItemCondition;
  storeLocationId: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  /** New slip upload; omit to keep the current attachment */
  ifmisSlipAttachmentUrl?: string;

  ifmisItemCode?: string;
  provisionType?: ProvisionType;
  poNumber?: string;
  transactionType?: string;
  source?: string;
  donor?: string;
  buyer?: string;
  programName?: string;
  uom?: string;
  subInventory?: string;
  itemCategoryDisplay?: string;
  lotBatchNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity?: number;
  deliveredBy?: string;
  receivedBy?: string;
  remark?: string;
}

export interface CreateStockOutRequest {
  /** Dispose of the units through Model 22: no recipient, the purpose is the reason */
  disposal?: boolean;
  itemId: string;
  /** The store man of the item's store who issues it (the store's only one, when there is one) */
  issuedByEmployeeId?: string;
  /** INTERNAL (default): an employee receives it. EXTERNAL: an outside organization, typed as text. */
  recipientType?: 'INTERNAL' | 'EXTERNAL';
  recipientEmployeeId?: string;
  targetDepartmentId?: string;
  /** EXTERNAL: the organization that receives it (required) */
  /** EXTERNAL: the organization from the list; its name and usual contact person come from it */
  organizationId?: string;
  organizationName?: string;
  /** EXTERNAL: the person who signs for the organization (optional) */
  contactPerson?: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  ifmisSlipAttachmentUrl?: string;
  /** Purpose of the issue (optional: it is not on the IFMIS Model 22); for a disposal, the reason (required) */
  purpose?: string;
  /** For disposal through Model 22: the entity/person it was sold, transferred, or donated to */
  recipientName?: string;
  registeredById: string;

  // Extended Model 22 fields
  transactionType?: string;
  destination?: string;
  subInventory?: string;
  lotBatchNo?: string;
  printedPadFrom?: string;
  printedPadTo?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  transportationCost?: number;
  remark?: string;
  /** Several lines of one Model 22: each is its own request with the details above (itemId and quantity are then per line) */
  lines?: { itemId: string; quantity: number }[];
}

/** Corrections to a Stock-Out request while it still waits for Stage 1 endorsement. The item itself can't change. */
export interface UpdateStockOutRequest {
  issuedByEmployeeId?: string;
  recipientType?: 'INTERNAL' | 'EXTERNAL';
  recipientEmployeeId?: string;
  targetDepartmentId?: string;
  organizationId?: string;
  organizationName?: string;
  contactPerson?: string;
  /** For disposal through Model 22: the entity/person it was sold, transferred, or donated to */
  recipientName?: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  /** New slip upload; omit to keep the current attachment */
  ifmisSlipAttachmentUrl?: string;
  /** Purpose of the issue (optional: it is not on the IFMIS Model 22); for a disposal, the reason (required) */
  purpose?: string;
  remark?: string;
  /** Units to issue; omit to keep the current quantity */
  quantity?: number;
}

/** A request to dispose of units in store (damaged, gifted, obsolete, sold…) */
export interface CreateDisposalRequest {
  /** The store man of the item's store named as storekeeper on the disposal form */
  storekeeperEmployeeId?: string;
  itemId: string;
  /** Units to dispose of; omit for all units in store */
  quantity?: number;
  /** Disposal reference number, printed as the voucher number */
  disposalNo: string;
  disposalDateGc?: string;
  /** Supporting document (e.g. committee minutes) */
  ifmisSlipAttachmentUrl?: string;
  /** Why the asset is disposed of, in the requester's own words */
  reason: string;
  description?: string;
  condition?: ItemCondition;
  /** Value written off; defaults to unit price × units */
  bookValue?: number;
  /** Who receives the asset (gift, sale, transfer to another body) */
  recipientName?: string;
  /** Money received for a sale, in ETB */
  proceedsETB?: number;
  committeeRef?: string;
  registeredById: string;
}

/** Corrections to a disposal request while it still waits for Stage 1 endorsement. The item can't change. */
export type UpdateDisposalRequest = Omit<CreateDisposalRequest, 'itemId' | 'registeredById'>;

export interface CreateReturnRequest {
  itemId: string;
  quantity?: number;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  ifmisSlipAttachmentUrl?: string;
  returnReason: string;
  condition: ItemCondition;
  returningEmployeeId?: string;
  targetStoreLocationId?: string;
  registeredById: string;

  // Extended Model 21 Return fields
  model21No?: string;
  book?: string;
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  origCost?: number;
  depreciation?: number;
  bookValue?: number;
  defectRemark?: string;
  storeRecipientId?: string;
}

export interface CreateTransferRequest {
  itemId: string;
  /** The store man named on the voucher; needed only when the item's store has several */
  transferredByEmployeeId?: string;
  /** Transfer date (YYYY-MM-DD); today when left out */
  ifmisSlipDateGc?: string;
  /** The signed Model 21, scanned (optional for a transfer) */
  ifmisSlipAttachmentUrl?: string;
  toEmployeeId?: string;
  toDepartmentId?: string;
  toLocationId?: string;
  reason?: string;
  performedById: string;
  /** Units to transfer; defaults to all units of the asset record */
  quantity?: number;

  // Extended Model 21 fields
  model21No?: string;
  book?: string;
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  origCost?: number;
  depreciation?: number;
  bookValue?: number;
  remark?: string;
}

/** Model 21 particulars of a transfer or return request, or the quantity of a Stock-Out */
export interface Model21RequestDetails {
  /** Stock-Out: the store man who issued the items, as named on the voucher */
  issuedByEmployeeId?: string;
  issuedByName?: string;
  /** Disposal: the store man named as storekeeper on the disposal form */
  storekeeperEmployeeId?: string;
  storekeeperName?: string;
  /** Stock-Out: the units are written off (disposal through Model 22) instead of going to a recipient */
  disposal?: boolean;
  /** Transfer of an item that was still in store: the store man is the transferor on the voucher */
  fromStore?: boolean;
  /** Transfer: the store man named on the voucher */
  transferredByEmployeeId?: string;
  transferredByName?: string;
  /** Return: the name of the store man who takes the item back */
  storeRecipientName?: string;
  /** Stock-Out: INTERNAL (an employee) or EXTERNAL (an outside organization) */
  recipientType?: 'INTERNAL' | 'EXTERNAL';
  /** Stock-Out to an outside organization: its name, and the person who signs for it */
  /** The organization's record, when it was chosen from the list */
  organizationId?: string;
  organizationName?: string;
  contactPerson?: string;
  /** Stock-Out: units requested */
  quantity?: number;
  /** Stock-Out: unit of measure of the requested units */
  uom?: string;
  /** Stock-Out: code of the record split off for a partial issue, set on approval */
  issuedItemCode?: string;
  /** Disposal: code of the record split off for a partial disposal, set on approval */
  disposedItemCode?: string;
  /** Transfer: code of the record split off for a partial transfer, set on approval */
  transferredItemCode?: string;
  /** Transfer, return or disposal reason */
  reason?: string;
  /** Disposal: justification */
  description?: string;
  /** Disposal: who receives the asset (gift, sale, another body) */
  recipientName?: string;
  /** Disposal: money received, in ETB */
  proceedsETB?: number;
  /** Disposal: disposal committee decision reference */
  committeeRef?: string;
  /** Transfer remark or return defects / missing parts */
  remark?: string;
  /** Condition on return (applied to the item when the return is approved) */
  condition?: ItemCondition;
  book?: string;
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  origCost?: number;
  depreciation?: number;
  bookValue?: number;
  storeRecipientId?: string;
}

/** Corrections to a transfer request while it still waits for Stage 1 endorsement. The item can't change. */
export interface UpdateTransferRequest {
  model21No: string;
  transferredByEmployeeId?: string;
  ifmisSlipDateGc?: string;
  /** A new signed copy; left out, the one saved is kept */
  ifmisSlipAttachmentUrl?: string;
  toEmployeeId: string;
  toDepartmentId?: string;
  toLocationId?: string;
  reason?: string;
  quantity?: number;
  book?: string;
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  depreciation?: number;
  bookValue?: number;
  remark?: string;
}

/** Corrections to a return request while it still waits for Stage 1 endorsement. The item can't change. */
export interface UpdateReturnRequest {
  quantity?: number;
  model21No: string;
  ifmisSlipDateGc: string;
  /** New slip upload; omit to keep the current attachment */
  ifmisSlipAttachmentUrl?: string;
  returnReason: string;
  condition: ItemCondition;
  /** The store (location) it goes back to; omit to keep what the request has */
  targetStoreLocationId?: string;
  book?: string;
  chassisNumber?: string;
  plateNo?: string;
  engineNo?: string;
  accessories?: Model21Accessory[];
  tireNos?: string[];
  depreciation?: number;
  bookValue?: number;
  defectRemark?: string;
  storeRecipientId?: string;
}

export interface ApprovalActionRequest {
  approvalId: string;
  /** REJECT sends the request back to its requester, still open (RETURN is the older name of it) */
  action: 'ENDORSE' | 'APPROVE' | 'REJECT' | 'RETURN';
  reviewedById: string;
  reviewRemarks?: string;
}

/** One decision for every line of a Model 19 receipt (same slip and PO), all or nothing */
export interface SlipApprovalActionRequest {
  approvalIds: string[];
  action: 'ENDORSE' | 'APPROVE' | 'REJECT' | 'RETURN';
  reviewedById: string;
  reviewRemarks?: string;
}

/** Rejected requests, sent back to the Team Leader once corrected: one voucher's lines, or one request */
export interface ResubmitRequest {
  approvalIds: string[];
}

/** Rejected requests their requester withdraws: one voucher's lines, or one request; the reason is optional */
export interface CancelRequest {
  approvalIds: string[];
  reason?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

export interface AuthUser {
  id: string;
  payrollId: string;
  fullNameEn: string;
  fullNameAm: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string;
  permissions?: string[];
  allowedTabs?: string[];
  landingTab?: string;
  /** Their password is temporary: nothing else is allowed until they choose their own */
  mustChangePassword?: boolean;
}

export interface LoginRequest {
  usernameOrEmail: string;
  password?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
