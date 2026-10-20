import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_KEY_RATE_PER_MINUTE, createApiKey, listApiKeys, resetApiKeyLimits, revokeApiKey, verifyApiKey } from './api-key.service';

// In-memory stand-in for the database
const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  apiKey: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const people: Record<string, any> = {
  admin: { id: 'admin', fullNameEn: 'System Administrator', role: 'SYSTEM_ADMIN', isActive: true },
  encoder: { id: 'encoder', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true },
};
let keys: any[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  resetApiKeyLimits();
  keys = [];
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => people[where.id] ?? null);
  db.apiKey.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `k${keys.length + 1}`, createdAt: new Date(), revokedAt: null, lastUsedAt: null, ...data };
    keys.push(row);
    return row;
  });
  db.apiKey.findMany.mockImplementation(async () => [...keys]);
  db.apiKey.findUnique.mockImplementation(async ({ where }: any) => keys.find((k) => (where.id ? k.id === where.id : k.keyId === where.keyId)) ?? null);
  db.apiKey.update.mockImplementation(async ({ where, data }: any) => Object.assign(keys.find((k) => k.id === where.id), data));
  db.auditLog.create.mockResolvedValue({});
});

describe('API keys', () => {
  it('creates a key for a service, shows it once and keeps only a hash of its secret', async () => {
    const { key, apiKey } = await createApiKey({ name: '  Ministry KPI   dashboard ' }, 'admin');
    expect(key).toMatch(/^ats_live_[0-9a-f]{12}_[A-Za-z0-9_-]{40,}$/);
    expect(apiKey).toMatchObject({ name: 'Ministry KPI dashboard', scopes: ['kpis.read'], status: 'ACTIVE', createdByName: 'System Administrator' });
    // The list never carries the secret, only the start of the key
    const secret = key.split('_').slice(3).join('_');
    expect(JSON.stringify(await listApiKeys('admin'))).not.toContain(secret);
    expect(keys[0].secretHash).not.toContain(secret);
    expect(apiKey.hint).toBe(`${key.slice(0, 'ats_live_'.length + 12)}…`);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'API_KEY_CREATED' }) });
  });

  it('is managed by administrators only, and needs a name and a future expiry', async () => {
    await expect(createApiKey({ name: 'X' }, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    await expect(listApiKeys('encoder')).rejects.toMatchObject({ statusCode: 403 });
    await expect(createApiKey({ name: ' ' }, 'admin')).rejects.toThrow('Name the service');
    await expect(createApiKey({ name: 'X', expiresAt: '2020-01-01' }, 'admin')).rejects.toThrow('in the future');
    await expect(createApiKey({ name: 'X', scopes: ['items.write'] }, 'admin')).rejects.toThrow('can be allowed');
  });

  it('lets the genuine key in, and refuses a wrong, revoked or expired one alike', async () => {
    const { key, apiKey } = await createApiKey({ name: 'Dashboard' }, 'admin');
    await expect(verifyApiKey(key, 'kpis.read')).resolves.toMatchObject({ apiKeyId: apiKey.id, name: 'Dashboard' });
    expect(keys[0].lastUsedAt).toBeInstanceOf(Date);

    const wrong = key.slice(0, -4) + (key.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(verifyApiKey(wrong, 'kpis.read')).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyApiKey(undefined, 'kpis.read')).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyApiKey('Bearer something', 'kpis.read')).rejects.toMatchObject({ statusCode: 401 });

    keys[0].expiresAt = new Date(Date.now() - 1000);
    await expect(verifyApiKey(key, 'kpis.read')).rejects.toMatchObject({ statusCode: 401 });
    keys[0].expiresAt = null;

    await revokeApiKey(apiKey.id, 'admin');
    await expect(verifyApiKey(key, 'kpis.read')).rejects.toMatchObject({ statusCode: 401 });
    expect((await listApiKeys('admin'))[0].status).toBe('REVOKED');
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'API_KEY_REVOKED' }) });
  });

  it('refuses a key that is not allowed what it asks for', async () => {
    const { key } = await createApiKey({ name: 'Dashboard' }, 'admin');
    keys[0].scopes = [];
    await expect(verifyApiKey(key, 'kpis.read')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('limits each key to a number of calls a minute, separately', async () => {
    const a = await createApiKey({ name: 'A' }, 'admin');
    const b = await createApiKey({ name: 'B' }, 'admin');
    for (let i = 0; i < API_KEY_RATE_PER_MINUTE; i++) await verifyApiKey(a.key, 'kpis.read');
    await expect(verifyApiKey(a.key, 'kpis.read')).rejects.toMatchObject({ statusCode: 429 });
    // Another service's key is not affected
    await expect(verifyApiKey(b.key, 'kpis.read')).resolves.toMatchObject({ name: 'B' });
  });
});
