export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  DATA_ENCODER = 'DATA_ENCODER',
  DEPARTMENT_HEAD = 'DEPARTMENT_HEAD',
  TOP_MANAGEMENT = 'TOP_MANAGEMENT', // Minister / Directors
}

export enum ItemStatus {
  PENDING_STOCK_IN = 'PENDING_STOCK_IN', // Registered by Data Encoder, waiting for Dept Head approval
  AVAILABLE = 'AVAILABLE',               // In Store, ready to be issued
  PENDING_STOCK_OUT = 'PENDING_STOCK_OUT', // Stock out registered, waiting for approval
  ISSUED = 'ISSUED',                     // Issued/In-Use by an employee or department
  IN_REPAIR = 'IN_REPAIR',               // Under technical repair / maintenance
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
  
  // Status
  status: ApprovalStatus;
  reviewedById?: string;
  reviewRemarks?: string;
  createdAtGc: string;
  createdAtEc: string;
  reviewedAtGc?: string;
  reviewedAtEc?: string;
}

export interface AuditLogEntry {
  id: string;
  timestampGc: string;
  timestampEc: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: 'ITEM' | 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'APPROVAL';
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
}

export interface ApprovalActionRequest {
  approvalId: string;
  action: 'APPROVE' | 'REJECT';
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
