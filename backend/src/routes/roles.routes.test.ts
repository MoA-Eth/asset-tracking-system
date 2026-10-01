import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import roleRoutes from './roles.routes';
import referenceRoutes from './reference.routes';
import itemRoutes from './item.routes';
import { errorHandler } from '../middleware/error-handler';
import { AuthService } from '../services/auth.service';
import { StoreService } from '../services/store.service';
import { UnauthorizedError } from '../errors/app-error';

vi.mock('../services/roles.service', () => ({
  getRoleDirectory: vi.fn().mockResolvedValue({ roles: [{ code: 'SYSTEM_ADMIN', memberCount: 1 }] }),
  assignEmployeeRole: vi.fn(),
}));

let app: express.Express;
const store = StoreService.getInstance();
beforeAll(() => {
  vi.spyOn(AuthService.getInstance(), 'verifyToken').mockImplementation(async role => {
    if (role === 'invalid') throw new UnauthorizedError();
    return { id: 'actor', role } as any;
  });
  app = express();
  app.use('/roles', roleRoutes);
  app.use('/reference', referenceRoutes);
  app.use('/items', itemRoutes);
  app.use(errorHandler);
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

// Exercise the mounted Express router and middleware without binding a network port.
const request = (path: string, role?: string, method = 'GET', body?: object): Promise<{ status: number }> => {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(new Socket()) as any;
    req.url = path;
    req.method = method;
    req.headers = role ? { authorization: `Bearer ${role}` } : {};
    req.body = body ?? {};
    const res = new ServerResponse(req);
    res.end = (() => { resolve({ status: res.statusCode }); return res; }) as any;
    app(req, res);
    res.on('error', reject);
  });
};

describe('Mounted API authorization', () => {
  it.each([undefined, 'invalid'])('rejects missing or invalid credentials', async role => {
    expect((await request('/roles', role)).status).toBe(401);
    expect((await request('/reference/employees/target/role', role, 'PUT', { role: 'MANAGER' })).status).toBe(401);
  });
  it.each(['DATA_ENCODER', 'TEAM_LEADER', 'DEPARTMENT_HEAD', 'MANAGER'])('prevents %s reading the role directory or assigning roles', async role => {
    const update = vi.spyOn(store, 'updateEmployeeRole').mockResolvedValue({ id: 'target' } as any);
    expect((await request('/roles', role)).status).toBe(403);
    expect((await request('/reference/employees/target/role', role, 'PUT', { role: 'SYSTEM_ADMIN' })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it('allows the administrator and uses the authenticated actor identity', async () => {
    const update = vi.spyOn(store, 'updateEmployeeRole').mockResolvedValue({ id: 'target', role: 'MANAGER' } as any);
    expect((await request('/roles', 'SYSTEM_ADMIN')).status).toBe(200);
    expect((await request('/reference/employees/target/role', 'SYSTEM_ADMIN', 'PUT', { role: 'MANAGER', actorId: 'spoofed' })).status).toBe(200);
    expect(update).toHaveBeenCalledWith('target', 'MANAGER', 'actor');
  });
  it.each(['SYSTEM_ADMIN', 'MANAGER', 'DEPARTMENT_HEAD', 'TEAM_LEADER'])('blocks %s from stock operations', async role => {
    expect((await request('/items/stock-in', role, 'POST', {})).status).toBe(403);
    expect((await request('/items/transfer', role, 'POST', {})).status).toBe(403);
  });
  it('blocks anonymous operations and the old Manager approval exception', async () => {
    expect((await request('/items/stock-in', undefined, 'POST', { registeredById: 'actor' })).status).toBe(401);
    expect((await request('/items/approvals/action', 'MANAGER', 'POST', { action: 'APPROVE' })).status).toBe(403);
  });
});
