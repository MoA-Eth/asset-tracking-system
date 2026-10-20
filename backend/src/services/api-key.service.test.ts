import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_KEY_RATE_PER_MINUTE, createApiKey, ipAllowed, listApiKeys, parseAllowedIps, resetApiKeyLimits, revokeApiKey, setApiKeyAddresses, verifyApiKey } from './api-key.service';

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
    expect(apiKey).toMatchObject({ name: 'Ministry KPI dashboard', scopes: ['dashboard.read'], status: 'ACTIVE', createdByName: 'System Administrator' });
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
    await expect(verifyApiKey(key, 'dashboard.read')).resolves.toMatchObject({ apiKeyId: apiKey.id, name: 'Dashboard' });
    expect(keys[0].lastUsedAt).toBeInstanceOf(Date);

    const wrong = key.slice(0, -4) + (key.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(verifyApiKey(wrong, 'dashboard.read')).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyApiKey(undefined, 'dashboard.read')).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyApiKey('Bearer something', 'dashboard.read')).rejects.toMatchObject({ statusCode: 401 });

    keys[0].expiresAt = new Date(Date.now() - 1000);
    await expect(verifyApiKey(key, 'dashboard.read')).rejects.toMatchObject({ statusCode: 401 });
    keys[0].expiresAt = null;

    await revokeApiKey(apiKey.id, 'admin');
    await expect(verifyApiKey(key, 'dashboard.read')).rejects.toMatchObject({ statusCode: 401 });
    expect((await listApiKeys('admin'))[0].status).toBe('REVOKED');
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'API_KEY_REVOKED' }) });
  });

  it('refuses a key that is not allowed what it asks for', async () => {
    const { key } = await createApiKey({ name: 'Dashboard' }, 'admin');
    keys[0].scopes = [];
    await expect(verifyApiKey(key, 'dashboard.read')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('limits each key to a number of calls a minute, separately', async () => {
    const a = await createApiKey({ name: 'A' }, 'admin');
    const b = await createApiKey({ name: 'B' }, 'admin');
    for (let i = 0; i < API_KEY_RATE_PER_MINUTE; i++) await verifyApiKey(a.key, 'dashboard.read');
    await expect(verifyApiKey(a.key, 'dashboard.read')).rejects.toMatchObject({ statusCode: 429 });
    // Another service's key is not affected
    await expect(verifyApiKey(b.key, 'dashboard.read')).resolves.toMatchObject({ name: 'B' });
  });
});

describe('Holding a key to its service servers (allowed addresses)', () => {
  it('takes single addresses and ranges, one per line or comma-separated, and refuses anything else', () => {
    expect(parseAllowedIps('10.10.30.25\n10.10.40.0/24, 2001:db8::5')).toEqual(['10.10.30.25', '10.10.40.0/24', '2001:db8::5']);
    expect(parseAllowedIps(['::ffff:10.10.30.25', '10.10.30.25'])).toEqual(['10.10.30.25']);
    expect(parseAllowedIps('')).toEqual([]);
    expect(() => parseAllowedIps('dashboard.example.org')).toThrow('not an IP address or range');
    expect(() => parseAllowedIps('10.10.30.0/33')).toThrow('not an IP address or range');
    expect(() => parseAllowedIps('10.10.300.1')).toThrow('not an IP address or range');
  });

  it('matches a caller against the list; an empty list allows any address', () => {
    const allowed = ['10.10.30.25', '10.10.40.0/24'];
    expect(ipAllowed('10.10.30.25', allowed)).toBe(true);
    expect(ipAllowed('::ffff:10.10.40.77', allowed)).toBe(true);
    expect(ipAllowed('10.10.41.1', allowed)).toBe(false);
    expect(ipAllowed(undefined, allowed)).toBe(false);
    expect(ipAllowed('203.0.113.9', [])).toBe(true);
  });

  it('refuses a genuine key from an address it does not allow, and accepts it from its server', async () => {
    const { key, apiKey } = await createApiKey({ name: 'Dashboard', allowedIps: '10.10.30.25' }, 'admin');
    expect(apiKey.allowedIps).toEqual(['10.10.30.25']);
    await expect(verifyApiKey(key, 'dashboard.read', '10.10.30.25')).resolves.toMatchObject({ name: 'Dashboard' });
    await expect(verifyApiKey(key, 'dashboard.read', '41.215.1.9')).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('41.215.1.9') });
  });

  it('lets an administrator change the addresses later, and records it', async () => {
    const { key, apiKey } = await createApiKey({ name: 'Dashboard', allowedIps: '10.10.30.25' }, 'admin');
    await expect(setApiKeyAddresses(apiKey.id, '10.10.30.25', 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    const moved = await setApiKeyAddresses(apiKey.id, '10.10.50.0/24', 'admin');
    expect(moved.allowedIps).toEqual(['10.10.50.0/24']);
    await expect(verifyApiKey(key, 'dashboard.read', '10.10.50.8')).resolves.toBeDefined();
    await expect(verifyApiKey(key, 'dashboard.read', '10.10.30.25')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'API_KEY_ADDRESSES_CHANGED' }) });
  });
});
