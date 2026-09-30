import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import app from './app';
import { prisma } from './lib/prisma';
import { AuthService } from './services/auth.service';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe('App availability', () => {
  it('reports healthy only when the database is usable', async () => {
    vi.spyOn(prisma.employee, 'count').mockResolvedValue(1);
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'healthy', database: 'connected' });
  });

  it('reports unavailable when the database connection or schema fails', async () => {
    vi.spyOn(prisma.employee, 'count').mockRejectedValue(new Error('Database offline'));
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'unhealthy', database: 'unavailable' });
  });

  it('returns resolved personas instead of serializing a Promise as an empty object', async () => {
    vi.spyOn(AuthService.getInstance(), 'getPersonas').mockResolvedValue([{ id: 'EMP-1' } as any]);
    const response = await fetch(`${baseUrl}/api/auth/personas`);
    expect(await response.json()).toMatchObject({ success: true, data: [{ id: 'EMP-1' }] });
  });

  it('returns JSON for unknown API routes instead of the frontend HTML', async () => {
    const response = await fetch(`${baseUrl}/api/missing`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
