import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import app from './app';
import { AuthService } from './services/auth.service';
import { StoreService } from './services/store.service';
import { LocationService } from './services/location.service';
import { UserRole } from './types/asset-management';
import { UnauthorizedError } from './errors/app-error';

let server: Server;
let baseUrl: string;
const store = StoreService.getInstance();
const {
  SYSTEM_ADMIN: admin,
  DATA_ENCODER: encoder,
  TEAM_LEADER: leader,
  DEPARTMENT_HEAD: head,
  MANAGER: manager,
} = UserRole;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  for (const method of ['create', 'update', 'remove'] as const) {
    vi.spyOn(LocationService.prototype, method).mockResolvedValue({ id: 'LOC-NEW' } as any);
  }
  vi.spyOn(AuthService.getInstance(), 'verifyToken').mockImplementation(
    async (token) => {
      if (!Object.values(UserRole).includes(token as UserRole))
        throw new UnauthorizedError();
      return { id: `ACTOR-${token}`, role: token as UserRole } as any;
    }
  );
  for (const method of [
    'getExecutiveDashboard',
    'getAuditLogs',
    'getApprovals',
    'getDepartments',
    'getLocations',
    'getEmployees',
    'getItems',
    'getItemById',
  ] as const) {
    vi.spyOn(store, method).mockResolvedValue([] as any);
  }
  for (const method of [
    'registerStockIn',
    'registerStockOut',
    'registerReturn',
    'transferItem',
    'handleApproval',
    'updateEmployeeRole',
  ] as const) {
    vi.spyOn(store, method).mockResolvedValue({ id: 'result' } as any);
  }
});

const request = (path: string, role?: string, method = 'GET', body?: object) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { Authorization: `Bearer ${role}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe('HTTP authorization for the approved role map', () => {
  it.each(Object.values(UserRole))('restricts location management to the administrator (%s)', async role => {
    const payload = { siteName: 'New site', building: 'Main', roomNumber: 'Room 1', isCentralStore: false, actorId: 'SPOOFED' };
    for (const [method, path, serviceMethod] of [
      ['POST', '/reference/locations', 'create'],
      ['PUT', '/reference/locations/LOC-1', 'update'],
      ['DELETE', '/reference/locations/LOC-1', 'remove'],
    ] as const) {
      const result = await request(path, role, method, method === 'DELETE' ? undefined : payload);
      expect(result.status).toBe(role === admin ? method === 'POST' ? 201 : 200 : 403);
      if (role !== admin) expect(LocationService.prototype[serviceMethod]).not.toHaveBeenCalled();
    }
    if (role === admin) {
      expect(LocationService.prototype.create).toHaveBeenCalledWith(payload, `ACTOR-${admin}`);
      expect(LocationService.prototype.update).toHaveBeenCalledWith('LOC-1', payload, `ACTOR-${admin}`);
      expect(LocationService.prototype.remove).toHaveBeenCalledWith('LOC-1', `ACTOR-${admin}`);
    }
  });

  it('rejects anonymous location writes before accessing the service', async () => {
    expect((await request('/reference/locations', undefined, 'POST', {})).status).toBe(401);
    expect((await request('/reference/locations/LOC-1', undefined, 'PUT', {})).status).toBe(401);
    expect((await request('/reference/locations/LOC-1', undefined, 'DELETE')).status).toBe(401);
    expect(LocationService.prototype.create).not.toHaveBeenCalled();
    expect(LocationService.prototype.update).not.toHaveBeenCalled();
    expect(LocationService.prototype.remove).not.toHaveBeenCalled();
  });
  it.each(Object.values(UserRole))(
    'enforces read access for %s',
    async (role) => {
      const cases: [string, UserRole[]][] = [
        ['/items/dashboard/executive', [head, manager, admin]],
        ['/items/audit/logs', [leader, head, manager, admin]],
        ['/items/approvals/pending', [encoder, leader, head]],
        ['/items', Object.values(UserRole)],
        ['/reference/departments', Object.values(UserRole)],
        ['/reference/locations', Object.values(UserRole)],
        ['/reference/employees', Object.values(UserRole)],
      ];
      for (const [path, allowed] of cases) {
        expect((await request(path, role)).status, path).toBe(
          allowed.includes(role) ? 200 : 403
        );
      }
    }
  );

  it.each(Object.values(UserRole))(
    'allows only the encoder to submit movements (%s)',
    async (role) => {
      const body = {
        name: 'Asset',
        category: 'IT_EQUIPMENT',
        ifmisSlipNumber: 'M19-TEST',
        itemId: 'ITEM-1',
        recipientEmployeeId: 'EMP-1',
        purpose: 'Work',
        condition: 'GOOD',
        reason: 'Transfer',
        registeredById: 'SPOOFED',
        performedById: 'SPOOFED',
      };
      for (const path of [
        'stock-in',
        'stock-out',
        'return-to-store',
        'transfer',
      ]) {
        const response = await request(`/items/${path}`, role, 'POST', body);
        if (role === encoder) expect(response.ok, path).toBe(true);
        else expect(response.status, path).toBe(403);
      }
      if (role !== encoder) {
        expect(store.registerStockIn).not.toHaveBeenCalled();
        expect(store.registerStockOut).not.toHaveBeenCalled();
        expect(store.registerReturn).not.toHaveBeenCalled();
        expect(store.transferItem).not.toHaveBeenCalled();
      } else {
        expect(store.transferItem).toHaveBeenCalledWith(
          expect.objectContaining({ performedById: `ACTOR-${encoder}` })
        );
      }
    }
  );

  it.each(Object.values(UserRole))(
    'restricts account role changes to the administrator (%s)',
    async (role) => {
      const response = await request(
        '/reference/employees/EMP-1/role',
        role,
        'PUT',
        { role: manager }
      );
      expect(response.status).toBe(role === admin ? 200 : 403);
      if (role !== admin)
        expect(store.updateEmployeeRole).not.toHaveBeenCalled();
      else
        expect(store.updateEmployeeRole).toHaveBeenCalledWith(
          'EMP-1',
          manager,
          `ACTOR-${admin}`
        );
    }
  );

  it.each(Object.values(UserRole))(
    'restricts approval actions for %s',
    async (role) => {
      for (const action of ['ENDORSE', 'APPROVE', 'REJECT']) {
        const allowed =
          action === 'ENDORSE'
            ? role === leader
            : action === 'APPROVE'
              ? role === head
              : [leader, head].includes(role);
        const response = await request(
          '/items/approvals/action',
          role,
          'POST',
          { approvalId: 'APP-1', action, reviewedById: 'SPOOFED' }
        );
        expect(response.status, action).toBe(allowed ? 200 : 403);
      }
    }
  );

  it('rejects anonymous and invalid-token calls, even when a body claims a valid officer', async () => {
    for (const token of [undefined, 'invalid-token']) {
      expect(
        (
          await request('/items/stock-in', token, 'POST', {
            registeredById: 'EMP-ENC-01',
          })
        ).status
      ).toBe(401);
      expect((await request('/items/audit/logs', token)).status).toBe(401);
      expect((await request('/reference/employees', token)).status).toBe(401);
      expect(
        (
          await request('/reference/employees/EMP-1/role', token, 'PUT', {
            role: admin,
          })
        ).status
      ).toBe(401);
    }
    expect(store.registerStockIn).not.toHaveBeenCalled();
    expect(store.updateEmployeeRole).not.toHaveBeenCalled();
  });

  it('scopes encoder submission tracking to the authenticated encoder', async () => {
    await request(
      '/items/approvals/pending?requestedById=SOMEONE-ELSE&status=PENDING',
      encoder
    );
    expect(store.getApprovals).toHaveBeenCalledWith(
      'PENDING',
      `ACTOR-${encoder}`
    );
  });

  it('rejects invalid role names and unknown approval actions before calling the store', async () => {
    expect(
      (
        await request('/reference/employees/EMP-1/role', admin, 'PUT', {
          role: 'SUPER_ADMIN',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request('/items/approvals/action', leader, 'POST', {
          approvalId: 'APP-1',
          action: 'DELETE',
        })
      ).status
    ).toBe(400);
    expect(store.updateEmployeeRole).not.toHaveBeenCalled();
    expect(store.handleApproval).not.toHaveBeenCalled();
  });
});
