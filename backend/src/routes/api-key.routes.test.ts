import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiKeyAdminRoutes, kpiRoutes } from './api-key.routes';
import itemRoutes from './item.routes';
import { errorHandler } from '../middleware/error-handler';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError } from '../errors/app-error';

const service = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock('../services/api-key.service', () => service);
vi.mock('../services/kpi.service', () => ({ getKpis: vi.fn().mockResolvedValue({ assets: { total: { units: 3, valueETB: 900 } } }) }));

let app: express.Express;
beforeAll(() => {
  vi.spyOn(AuthService.getInstance(), 'verifyToken').mockImplementation(async (role) => {
    if (role === 'invalid') throw new UnauthorizedError();
    return { id: 'actor', role } as any;
  });
  app = express();
  app.use('/settings/api-keys', apiKeyAdminRoutes);
  app.use('/kpis', kpiRoutes);
  app.use('/items', itemRoutes);
  app.use(errorHandler);
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  service.verifyApiKey.mockReset();
  service.verifyApiKey.mockImplementation(async (key?: string) => {
    if (key !== 'good-key') throw new UnauthorizedError('This API key is invalid, revoked or expired.');
    return { apiKeyId: 'k1', name: 'Dashboard', scopes: ['kpis.read'] };
  });
  service.listApiKeys.mockResolvedValue([]);
});

const request = (path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number }> =>
  new Promise((resolve, reject) => {
    const req = new IncomingMessage(new Socket()) as any;
    req.url = path;
    req.method = method;
    req.headers = headers;
    req.body = {};
    const res = new ServerResponse(req);
    res.end = (() => { resolve({ status: res.statusCode }); return res; }) as any;
    app(req, res);
    res.on('error', reject);
  });

describe('Reading the key figures with an API key', () => {
  it('opens the key figures to a valid key only', async () => {
    expect((await request('/kpis', { 'x-api-key': 'good-key' })).status).toBe(200);
    expect(service.verifyApiKey).toHaveBeenCalledWith('good-key', 'kpis.read');
    expect((await request('/kpis', { 'x-api-key': 'bad-key' })).status).toBe(401);
    expect((await request('/kpis')).status).toBe(401);
  });

  it("doesn't take a person's sign-in instead of a key", async () => {
    expect((await request('/kpis', { authorization: 'Bearer SYSTEM_ADMIN' })).status).toBe(401);
  });

  it('opens nothing else with a key: other routes still need a signed-in person', async () => {
    expect((await request('/items', { 'x-api-key': 'good-key' })).status).toBe(401);
    expect((await request('/items/dashboard/executive', { 'x-api-key': 'good-key' })).status).toBe(401);
    expect((await request('/settings/api-keys', { 'x-api-key': 'good-key' })).status).toBe(401);
  });

  it('lets only administrators manage keys', async () => {
    expect((await request('/settings/api-keys', { authorization: 'Bearer DATA_ENCODER' })).status).toBe(403);
    expect((await request('/settings/api-keys', { authorization: 'Bearer SYSTEM_ADMIN' })).status).toBe(200);
  });
});
