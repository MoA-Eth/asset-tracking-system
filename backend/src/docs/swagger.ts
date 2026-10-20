/**
 * OpenAPI 3.0 Specification for FDRE Ministry of Agriculture Asset Tracking System
 */
export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'FDRE Ministry of Agriculture - Fixed Asset & Store Management API',
    description: 'Executive Property Control, IFMIS Mirror, and Statutory Workflow System API for the Ministry of Agriculture (Ethiopia).',
    version: '1.0.0',
    contact: {
      name: 'Property Administration & Asset Control Directorate',
      email: 'support@moa.gov.et',
    },
    license: {
      name: 'Government of Ethiopia - MoA Internal License',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
    {
      url: '/api',
      description: 'Current Host Relative API Base',
    },
  ],
  tags: [
    { name: 'Health & Status', description: 'System health check and uptime diagnostics' },
    { name: 'Authentication & Session', description: 'User login, credentials, session verification, and password lifecycle' },
    { name: 'Inventory & Fixed Assets', description: 'Asset registry, Model 19 receiving, custody tracking, and search' },
    { name: 'Store Operations & Vouchers', description: 'Model 20 Issue, Model 21 Transfer, Return to Store, and Disposal' },
    { name: 'Approvals & Workflows', description: 'Multi-stage statutory review, endorsement, and rejection flows' },
    { name: 'Executive Dashboard & Reports', description: 'Aggregated analytics, financial value, and inventory movement' },
    { name: 'Reference & Directory Data', description: 'Stores, storage locations, departments, staff registry, and organizations' },
    { name: 'Roles & RBAC Permissions', description: 'Role definitions, granular matrix permissions, and overrides' },
    { name: 'System Settings', description: 'Global organization parameters, operational policies, and audit configurations' },
    { name: 'Document & Voucher Uploads', description: 'Signed IFMIS slips, voucher scans, and document attachments' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health & Status'],
        summary: 'System health and database connectivity check',
        description: 'Returns operational status, database connectivity, environment mode, and Git commit revision.',
        responses: {
          200: {
            description: 'System is healthy and responsive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    database: { type: 'string', example: 'connected' },
                    system: { type: 'string', example: 'MoA Fixed Asset & Store Management (IFMIS Mirror)' },
                    scope: { type: 'string', example: 'Store-level processing, tracking, and executive management dashboard' },
                    environment: { type: 'string', example: 'dev' },
                    version: { type: 'string', example: 'dev' },
                    commit: { type: 'string', example: 'dev' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          503: {
            description: 'Database unavailable or server error',
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication & Session'],
        summary: 'Authenticate employee and obtain JWT token',
        description: 'Authenticates via email or Payroll/Employee ID and password. Applies brute-force lockout and rate limiting.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', description: 'Email address or Employee/Payroll ID', example: 'admin@moa.gov.et' },
                  password: { type: 'string', format: 'password', example: 'Admin#2026' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string', description: 'Bearer JWT token' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        fullName: { type: 'string' },
                        email: { type: 'string' },
                        payrollId: { type: 'string' },
                        role: { type: 'string' },
                        storeId: { type: 'string', nullable: true },
                        mustChangePassword: { type: 'boolean' },
                      },
                    },
                    permissions: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          400: { description: 'Missing credentials' },
          401: { description: 'Invalid credentials or locked account' },
          429: { description: 'Rate limit exceeded (too many login attempts)' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication & Session'],
        summary: 'Verify current authenticated session and active permissions',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated employee profile and granted permissions' },
          401: { description: 'Unauthorized or token expired' },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Authentication & Session'],
        summary: 'Change employee password',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          400: { description: 'Invalid password format or current password incorrect' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/items': {
      get: {
        tags: ['Inventory & Fixed Assets'],
        summary: 'Query items and fixed asset register with filtering & pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'storeId', in: 'query', schema: { type: 'string' }, description: 'Filter by Store UUID' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by Category' },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by Lifecycle Status (e.g., IN_STORE, ISSUED, IN_TRANSIT)' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search name, serial number, or IFMIS tag' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 25 } },
        ],
        responses: {
          200: { description: 'Paginated list of assets and inventory records' },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Inventory & Fixed Assets'],
        summary: 'Record new goods receiving via Model 19 (Store Stock-In)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['storeId', 'items'],
                properties: {
                  storeId: { type: 'string' },
                  model19Number: { type: 'string' },
                  supplier: { type: 'string' },
                  deliveryOrderNumber: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['itemName', 'quantity', 'unitPrice'],
                      properties: {
                        itemName: { type: 'string' },
                        itemCode: { type: 'string' },
                        category: { type: 'string' },
                        quantity: { type: 'number' },
                        unitPrice: { type: 'number' },
                        serialNumbers: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Items received and entered into store stock' },
          400: { description: 'Validation failed' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden: Missing inventory write permission' },
        },
      },
    },
    '/api/items/{id}': {
      get: {
        tags: ['Inventory & Fixed Assets'],
        summary: 'Get asset detail record, chain of custody, and transaction history',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Comprehensive asset ledger details' },
          404: { description: 'Asset not found' },
        },
      },
    },
    '/api/items/stock-out': {
      post: {
        tags: ['Store Operations & Vouchers'],
        summary: 'Initiate asset issue via Model 20 store voucher',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['itemId', 'recipientEmployeeId', 'quantity'],
                properties: {
                  itemId: { type: 'string' },
                  recipientEmployeeId: { type: 'string' },
                  quantity: { type: 'number' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Issue request created for workflow approval' },
          400: { description: 'Validation failed' },
        },
      },
    },
    '/api/items/transfer': {
      post: {
        tags: ['Store Operations & Vouchers'],
        summary: 'Transfer asset between employees or departments via Model 21',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['itemId', 'toEmployeeId'],
                properties: {
                  itemId: { type: 'string' },
                  toEmployeeId: { type: 'string' },
                  voucherNumber: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Transfer request submitted' },
        },
      },
    },
    '/api/items/return-to-store': {
      post: {
        tags: ['Store Operations & Vouchers'],
        summary: 'Return assigned asset from employee custody back to store inventory',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['itemId', 'targetStoreId'],
                properties: {
                  itemId: { type: 'string' },
                  targetStoreId: { type: 'string' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Return request submitted' },
        },
      },
    },
    '/api/items/disposal': {
      post: {
        tags: ['Store Operations & Vouchers'],
        summary: 'Request asset decommissioning, auction, scrap, or donation',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['itemId', 'disposalMethod'],
                properties: {
                  itemId: { type: 'string' },
                  disposalMethod: { type: 'string', enum: ['AUCTION', 'SCRAP', 'DONATION', 'TRANSFER_OUT', 'DESTROYED'] },
                  justification: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Disposal request submitted for statutory approval' },
        },
      },
    },
    '/api/items/approvals/pending': {
      get: {
        tags: ['Approvals & Workflows'],
        summary: 'Get all pending approval requests actionable by current user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'List of actionable workflow requests' },
        },
      },
    },
    '/api/items/approvals/action': {
      post: {
        tags: ['Approvals & Workflows'],
        summary: 'Approve, endorse, or reject a pending property voucher workflow',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['approvalId', 'action'],
                properties: {
                  approvalId: { type: 'string' },
                  action: { type: 'string', enum: ['APPROVE', 'ENDORSE', 'REJECT'] },
                  comments: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Approval step recorded and workflow transitioned' },
        },
      },
    },
    '/api/items/approvals/slip-action': {
      post: {
        tags: ['Approvals & Workflows'],
        summary: 'Endorse, approve or reject every line of a Model 19 receipt (same slip and PO) at once; all lines or none',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['approvalIds', 'action'],
                properties: {
                  approvalIds: { type: 'array', items: { type: 'string' } },
                  action: { type: 'string', enum: ['APPROVE', 'ENDORSE', 'REJECT'] },
                  reviewRemarks: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Every line decided' },
          400: { description: 'Lines not on one Model 19 and PO, not receipts, or too many' },
          409: { description: 'A line was already decided, or the lines are at different stages' },
        },
      },
    },
    '/api/v1/assets-dashboard': {
      get: {
        tags: ['Integration (API key)'],
        summary: "The app's key figures for another system's dashboard: numbers only, no item lists or names",
        description:
          'Send the key in the X-API-Key header from your server. Same figures and filters as the executive dashboard. ' +
          'At most 60 calls a minute per key; 401 when the key is invalid, revoked or expired; 429 when calling too often.\n\n' +
          "Example: curl -H 'X-API-Key: ats_live_…' 'https://asset.moa.gov.et/api/v1/assets-dashboard?from=2026-07-08&to=2026-10-20'",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start of the period (YYYY-MM-DD, Gregorian)' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End of the period (YYYY-MM-DD)' },
          { name: 'storeId', in: 'query', schema: { type: 'string' }, description: 'Only one store' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Only one category, e.g. IT_EQUIPMENT' },
          { name: 'itemType', in: 'query', schema: { type: 'string', enum: ['FIXED', 'CONSUMABLE'] } },
        ],
        responses: {
          200: {
            description:
              '{ generatedAt, filter, assets: { total, inStore, issued, disposed, fixedAssets, consumables } (each { units, valueETB }), ' +
              'pending: { receipts, issues, transfers, disposals, total, valueETB, withTeamLeader, withDepartmentHead }, ' +
              'movement: [{ month, received, issued }], byCategory: [{ category, units, valueETB }], ' +
              'byStore: [{ store, units, valueETB, inStoreUnits, issuedUnits, pending }], byCondition: [{ condition, units, valueETB }], ' +
              'staleInStore: { thresholdDays, items, units, valueETB } }',
          },
          401: { description: 'Missing, invalid, revoked or expired key' },
          403: { description: 'The key is not allowed to read the key figures' },
          429: { description: 'More than 60 calls in a minute with this key' },
        },
      },
    },
    '/api/items/dashboard/executive': {
      get: {
        tags: ['Executive Dashboard & Reports'],
        summary: 'Executive property metrics, asset valuation, store throughput, and pending action counts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'storeId', in: 'query', schema: { type: 'string' } },
          { name: 'fiscalYear', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Comprehensive executive analytics dataset' },
        },
      },
    },
    '/api/roles': {
      get: {
        tags: ['Roles & RBAC Permissions'],
        summary: 'List system roles and their effective permission matrix',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Role configurations and permission grants' },
        },
      },
    },
    '/api/roles/{role}/permissions': {
      put: {
        tags: ['Roles & RBAC Permissions'],
        summary: 'Update granted permission keys for a system role',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['permissions'],
                properties: {
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Permissions updated successfully' },
        },
      },
    },
    '/api/reference/departments': {
      get: {
        tags: ['Reference & Directory Data'],
        summary: 'List organizational directorates and departments',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List of departments' } },
      },
    },
    '/api/reference/stores': {
      get: {
        tags: ['Reference & Directory Data'],
        summary: 'List MoA warehouses, custody stores, and assigned store keepers',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List of stores' } },
      },
    },
    '/api/reference/locations': {
      get: {
        tags: ['Reference & Directory Data'],
        summary: 'List warehouse physical locations (aisles, racks, shelves, bins)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List of physical storage locations' } },
      },
    },
    '/api/reference/employees': {
      get: {
        tags: ['Reference & Directory Data'],
        summary: 'List staff registry with department, payroll ID, and custody assignments',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Staff directory' } },
      },
    },
    '/api/settings': {
      get: {
        tags: ['System Settings'],
        summary: 'Get Ministry and system configuration parameters',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Current system settings' } },
      },
    },
    '/api/uploads/slips': {
      post: {
        tags: ['Document & Voucher Uploads'],
        summary: 'Upload signed Model 19/20/21/22 scan or IFMIS export PDF',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  type: { type: 'string', enum: ['MODEL19', 'MODEL20', 'MODEL21', 'MODEL22', 'DISPOSAL'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Slip uploaded and public URL returned' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Bearer JWT token from /api/auth/login',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'A key issued by an administrator (Settings → API keys), for another system\'s server. Keep it on the server; never put it in a web page.',
      },
    },
  },
};
