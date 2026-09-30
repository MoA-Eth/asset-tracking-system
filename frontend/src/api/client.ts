import {
  ApiResponse,
  AssetCategory,
  ItemStatus,
  ItemWithRelations,
  TransactionApproval,
  ApprovalStatus,
  AuditLogEntry,
  Department,
  Employee,
  Location,
  CreateStockInRequest,
  CreateStockOutRequest,
  CreateReturnRequest,
  CreateTransferRequest,
  ApprovalActionRequest,
  LoginRequest,
  AuthResponse,
  AuthUser,
  UserRole,
} from '../types/asset-management';

const BASE_URL = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = localStorage.getItem('moa_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.message || errorJson.error || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const json: ApiResponse<T> = await response.json();
  return json.data;
}

export const api = {
  // Authentication
  login: (payload: LoginRequest) => {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMe: () => {
    return request<AuthUser>('/auth/me');
  },

  getPersonas: () => {
    return request<AuthUser[]>('/auth/personas');
  },

  // Executive Dashboard
  getExecutiveDashboard: () => {
    return request<any>('/items/dashboard/executive');
  },

  // Items Inventory
  getItems: (params?: {
    status?: ItemStatus;
    category?: AssetCategory;
    departmentId?: string;
    locationId?: string;
    search?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.category) q.append('category', params.category);
    if (params?.departmentId) q.append('departmentId', params.departmentId);
    if (params?.locationId) q.append('locationId', params.locationId);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString();
    return request<ItemWithRelations[]>(`/items${queryString ? `?${queryString}` : ''}`);
  },

  getItemById: (id: string) => {
    return request<ItemWithRelations>(`/items/${encodeURIComponent(id)}`);
  },

  // Workflows
  registerStockIn: (payload: CreateStockInRequest) => {
    return request<{ item: ItemWithRelations; items?: ItemWithRelations[]; approval?: TransactionApproval }>(
      '/items/stock-in',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  registerStockOut: (payload: CreateStockOutRequest) => {
    return request<TransactionApproval>('/items/stock-out', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  registerReturn: (payload: CreateReturnRequest) => {
    return request<TransactionApproval>('/items/return-to-store', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  transferItem: (payload: CreateTransferRequest) => {
    return request<ItemWithRelations>('/items/transfer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Approvals Workflow
  getApprovals: (status?: ApprovalStatus) => {
    return request<TransactionApproval[]>(
      `/items/approvals/pending${status ? `?status=${status}` : ''}`
    );
  },

  handleApproval: (payload: ApprovalActionRequest) => {
    return request<TransactionApproval>('/items/approvals/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Audit Logs
  getAuditLogs: () => {
    return request<AuditLogEntry[]>('/items/audit/logs');
  },

  // Reference Data
  getDepartments: () => {
    return request<Department[]>('/reference/departments');
  },

  getLocations: () => {
    return request<Location[]>('/reference/locations');
  },

  getEmployees: (departmentId?: string) => {
    return request<Employee[]>(
      `/reference/employees${departmentId ? `?departmentId=${departmentId}` : ''}`
    );
  },

  updateEmployeeRole: (id: string, role: UserRole) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
};
