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
  EmployeeInput,
  LocationInput,
  Store,
  StoreInput,
  EmployeeImportResult,
  Location,
  CreateStockInRequest,
  UpdateStockInRequest,
  CreateStockOutRequest,
  UpdateStockOutRequest,
  CreateDisposalRequest,
  UpdateDisposalRequest,
  UpdateTransferRequest,
  UpdateReturnRequest,
  CreateReturnRequest,
  CreateTransferRequest,
  ApprovalActionRequest,
  LoginRequest,
  AuthResponse,
  AuthUser,
  UserRole,
  RoleDirectory,
} from '../types/asset-management';

const BASE_URL = '/api';
// Generous enough for a 10 MB slip upload on a slow connection
const REQUEST_TIMEOUT_MS = 30000;

/** HTTP status of a failed ATS request, or undefined when the server could not be reached */
export const getErrorStatus = (err: unknown): number | undefined => {
  // Read the field rather than using instanceof: Vite can load this module twice in development
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = localStorage.getItem('moa_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = options?.signal || controller.signal;

  try {
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, signal });
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      throw new Error(
        controller.signal.aborted
          ? 'The ATS server took too long to respond. Check your connection and try again.'
          : 'Cannot reach the ATS server. Check your connection and that the app is running.'
      );
    }

    if (!response.ok) {
      if (token === localStorage.getItem('moa_token')) {
        if (response.status === 401 && endpoint !== '/auth/login') window.dispatchEvent(new Event('moa_session_expired'));
        if (response.status === 403) window.dispatchEvent(new Event('moa_access_changed'));
      }
      let errorMsg = `ATS server returned HTTP ${response.status}.`;
      try {
        const errorJson = await response.json();
        errorMsg = errorJson.message || errorJson.error?.message || errorMsg;
      } catch {
        // A disconnected development proxy or gateway may return non-JSON errors
      }
      const error = new Error(errorMsg) as any;
      error.status = response.status;
      throw error;
    }

    let json: ApiResponse<T>;
    try {
      json = await response.json();
    } catch {
      throw new Error('The ATS server returned an invalid response. Check that you opened the correct app address.');
    }
    return json.data;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  getRoles: () => request<RoleDirectory>('/roles'),
  updateRolePermissions: (role: UserRole, permissions: string[]) =>
    request<RoleDirectory>(`/roles/${role}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
  resetRolePermissions: (role: UserRole) =>
    request<RoleDirectory>(`/roles/${role}/permissions/reset`, {
      method: 'POST',
    }),
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

  /** Replace your own password (also clears a temporary one) */
  changePassword: (currentPassword: string, newPassword: string) => {
    return request<null>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
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
  // System-wide rules; anyone signed in reads them, the System Administrator changes them
  getSystemSettings: () => request<{ slipAttachmentPolicy: 'REQUIRED' | 'OPTIONAL' }>('/settings'),
  updateSystemSettings: (settings: { slipAttachmentPolicy?: 'REQUIRED' | 'OPTIONAL' }) =>
    request<{ slipAttachmentPolicy: 'REQUIRED' | 'OPTIONAL' }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Uploads a scanned IFMIS slip; the returned url is saved as ifmisSlipAttachmentUrl
  uploadSlip: (file: File) => {
    return request<{ url: string; fileName: string; contentType: string; size: number }>('/uploads/slips', {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
  },

  // Allowed only while the item waits for Stage 1 endorsement
  updateStockIn: (itemId: string, payload: UpdateStockInRequest) => {
    return request<{ item: ItemWithRelations }>(`/items/${encodeURIComponent(itemId)}/stock-in`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  updateTransfer: (approvalId: string, payload: UpdateTransferRequest) => {
    return request<{ approval: TransactionApproval }>(`/items/transfer/${encodeURIComponent(approvalId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  updateReturn: (approvalId: string, payload: UpdateReturnRequest) => {
    return request<{ approval: TransactionApproval }>(`/items/return-to-store/${encodeURIComponent(approvalId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  updateStockOut: (approvalId: string, payload: UpdateStockOutRequest) => {
    return request<{ approval: TransactionApproval }>(`/items/stock-out/${encodeURIComponent(approvalId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

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

  registerDisposal: (payload: CreateDisposalRequest) => {
    return request<TransactionApproval>('/items/disposal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateDisposal: (approvalId: string, payload: UpdateDisposalRequest) => {
    return request<{ approval: TransactionApproval }>(`/items/disposal/${encodeURIComponent(approvalId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  registerReturn: (payload: CreateReturnRequest) => {
    return request<TransactionApproval>('/items/return-to-store', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Creates a TRANSFER approval; custody changes only after Stage 2 sign-off
  transferItem: (payload: CreateTransferRequest) => {
    return request<TransactionApproval>('/items/transfer', {
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
  /** Departments come from employee data (HR's import, or a new name on the employee form) */
  getDepartments: () => {
    return request<Department[]>('/reference/departments');
  },

  /** Stores with their locations; with includeInactive, administrators also get deactivated ones */
  getStores: (opts: { includeInactive?: boolean } = {}) => {
    return request<Store[]>(`/reference/stores${opts.includeInactive ? '?includeInactive=true' : ''}`);
  },

  createStore: (input: StoreInput) => {
    return request<Store>('/reference/stores', { method: 'POST', body: JSON.stringify(input) });
  },

  updateStore: (id: string, input: StoreInput) => {
    return request<Store>(`/reference/stores/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  },

  setStoreActive: (id: string, active: boolean) => {
    return request<Store>(`/reference/stores/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
  },

  deleteStore: (id: string) => {
    return request<null>(`/reference/stores/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** Every active location in an active store, as a flat list for the forms */
  getLocations: () => {
    return request<Location[]>('/reference/locations');
  },

  createLocation: (storeId: string, input: LocationInput) => {
    return request<Location>(`/reference/stores/${encodeURIComponent(storeId)}/locations`, { method: 'POST', body: JSON.stringify(input) });
  },

  updateLocation: (id: string, input: LocationInput) => {
    return request<Location>(`/reference/locations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  },

  setLocationActive: (id: string, active: boolean) => {
    return request<Location>(`/reference/locations/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
  },

  deleteLocation: (id: string) => {
    return request<null>(`/reference/locations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** Active staff; with includeInactive, administrators also get deactivated staff */
  getEmployees: (departmentId?: string, opts: { includeInactive?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (departmentId) params.set('departmentId', departmentId);
    if (opts.includeInactive) params.set('includeInactive', 'true');
    const query = params.toString();
    return request<Employee[]>(`/reference/employees${query ? `?${query}` : ''}`);
  },

  createEmployee: (input: EmployeeInput) => {
    return request<Employee>('/reference/employees', { method: 'POST', body: JSON.stringify(input) });
  },

  updateEmployee: (id: string, input: EmployeeInput) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  },

  /** Checks HR spreadsheet rows; with apply, saves them */
  importEmployees: (rows: object[], apply: boolean) => {
    return request<EmployeeImportResult>('/reference/employees/import', {
      method: 'POST',
      body: JSON.stringify({ rows, apply }),
    });
  },

  setEmployeeActive: (id: string, active: boolean) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  },

  /** Give an employee sign-in with a role and a temporary password */
  grantAccess: (id: string, role: UserRole, password: string) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/access`, { method: 'PUT', body: JSON.stringify({ role, password }) });
  },

  /** Take sign-in away; the employee stays on the staff list */
  removeAccess: (id: string) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/access`, { method: 'DELETE' });
  },

  /** Set a new temporary password */
  resetEmployeePassword: (id: string, password: string) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/password`, { method: 'POST', body: JSON.stringify({ password }) });
  },

  updateEmployeeRole: (id: string, role: UserRole) => {
    return request<Employee>(`/reference/employees/${encodeURIComponent(id)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
};
