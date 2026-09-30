export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  DATA_ENCODER = 'DATA_ENCODER',
  TEAM_LEADER = 'TEAM_LEADER',
  DEPARTMENT_HEAD = 'DEPARTMENT_HEAD',
  MANAGER = 'MANAGER', // General Manager
}

export enum ItemStatus {
  PENDING_STOCK_IN = 'PENDING_STOCK_IN', // Registered by Data Encoder, waiting for Dept Head approval
  AVAILABLE = 'AVAILABLE',               // In Store, ready to be issued
  PENDING_STOCK_OUT = 'PENDING_STOCK_OUT', // Stock out registered, waiting for approval
  ISSUED = 'ISSUED',                     // Issued to an employee or department
  UNDER_TRANSFER = 'UNDER_TRANSFER',     // In transit between locations/employees
  DISPOSED = 'DISPOSED',                 // Delisted
}

export enum TransactionType {
  STOCK_IN = 'STOCK_IN',
  STOCK_OUT = 'STOCK_OUT',
  TRANSFER = 'TRANSFER',
  RETURN = 'RETURN',
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
  REJECTED = 'REJECTED',
}

export enum AssetCategory {
  VEHICLE = 'VEHICLE',
  AGRI_MACHINERY = 'AGRI_MACHINERY',
  IT_EQUIPMENT = 'IT_EQUIPMENT',
  OFFICE_FURNITURE = 'OFFICE_FURNITURE',
  LAB_EQUIPMENT = 'LAB_EQUIPMENT',
  FIELD_GEAR = 'FIELD_GEAR',
}

export interface Department {
  id: string;
  code: string;
  nameEn: string;
  nameAm: string;
  headEmployeeId?: string;
}

export interface Location {
  id: string;
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
  email: string;
  phone: string;
  role: UserRole;
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

export interface Item {
  id: string;
  itemCode: string;          // e.g. MOA-IT-2024-0001
  name: string;
  category: AssetCategory;
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
  history: ItemMovementHistory[];

  // Extended Model 19 (IFMIS Receiving) Fields
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
  totalAmount: number;
  remark?: string;
}

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

export interface ItemWithRelations extends Item {
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
  ifmisSlipDateGc: string;
  ifmisSlipDateEc: string;
  ifmisSlipAttachmentUrl?: string;
  
  // Parties
  requestedById: string;
  recipientEmployeeId?: string;
  targetDepartmentId?: string;
  targetLocationId?: string;
  purposeOrRemarks: string;
  
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
  reviewedAtGc?: string;
  reviewedAtEc?: string;
  reviewedBy?: Employee;
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
  entityType: 'ITEM' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'RETURN' | 'APPROVAL';
  entityId: string;
  ifmisSlipNumber?: string;
  details: string;
  previousState?: any;
  newState?: any;
}

export interface CreateStockInRequest {
  name: string;
  category: AssetCategory;
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
  poNumber?: string;
  transactionType?: string;
  source?: string;
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
  deliveredBy?: string;
  receivedBy?: string;
  remark?: string;

  // Multi-item batch registration support
  items?: Array<{
    itemCode?: string;
    name: string;
    category?: AssetCategory;
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
    remark?: string;
  }>;
}

export interface CreateStockOutRequest {
  itemId: string;
  recipientEmployeeId: string;
  targetDepartmentId: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  ifmisSlipAttachmentUrl?: string;
  purpose: string;
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
}

export interface CreateReturnRequest {
  itemId: string;
  ifmisSlipNumber: string;
  ifmisSlipDateGc: string;
  ifmisSlipAttachmentUrl?: string;
  returnReason: string;
  condition: ItemCondition;
  returningEmployeeId?: string;
  targetStoreLocationId?: string;
  registeredById: string;
}

export interface CreateTransferRequest {
  itemId: string;
  toEmployeeId?: string;
  toDepartmentId?: string;
  toLocationId?: string;
  reason: string;
  performedById: string;

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

export interface ApprovalActionRequest {
  approvalId: string;
  action: 'ENDORSE' | 'APPROVE' | 'REJECT';
  reviewedById: string;
  reviewRemarks?: string;
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
}

export interface LoginRequest {
  usernameOrEmail: string;
  password?: string;
  personaRole?: UserRole;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
