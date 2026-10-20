/**
 * API keys: how another system's server (e.g. the Ministry KPI dashboard) reads this app's figures without a person
 * signing in. Each service gets its own key; a key can only do what its scopes allow (today: read the KPIs).
 *
 * A key looks like  ats_live_<keyId>_<secret>. The key id is public (shown in the list, used to find the key); only a
 * hash of the secret is stored, so the full key is shown once, when it is created, and can't be recovered later.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError, BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission } from '../security/role-policy';

/** What a key may be allowed to do */
export const API_KEY_SCOPES = ['dashboard.read'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const PREFIX = 'ats_live_';
/** Calls one key may make per minute, so a faulty integration can't overload the server */
export const API_KEY_RATE_PER_MINUTE = 60;

/** A key as the Settings page lists it: never its secret */
export interface ApiKeyView {
  id: string;
  name: string;
  /** The start of the key, so it can be recognised: ats_live_8f3k2q9a… */
  hint: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdByName: string;
  createdAt: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

/** The service that called with a key, for the request */
export interface ApiKeyPrincipal {
  apiKeyId: string;
  name: string;
  scopes: string[];
}

const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
const iso = (d?: Date | null) => (d ? d.toISOString() : null);

const toView = (k: any, now = new Date()): ApiKeyView => ({
  id: k.id,
  name: k.name,
  hint: `${PREFIX}${k.keyId}…`,
  scopes: k.scopes ?? [],
  expiresAt: iso(k.expiresAt),
  revokedAt: iso(k.revokedAt),
  lastUsedAt: iso(k.lastUsedAt),
  createdByName: k.createdByName,
  createdAt: iso(k.createdAt)!,
  status: k.revokedAt ? 'REVOKED' : k.expiresAt && k.expiresAt <= now ? 'EXPIRED' : 'ACTIVE',
});

/** Only those who manage people's access manage keys */
async function loadAdmin(tx: any, actorId: string) {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  if (!actor || actor.isActive === false || !hasPermission(actor.role, 'roles.assign')) {
    throw new ForbiddenError('Only administrators can manage API keys.');
  }
  return actor;
}

async function audit(tx: any, actor: any, action: string, entityId: string, details: string, newState?: object) {
  const today = getTodayGcAndEc();
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  await tx.auditLog.create({
    data: {
      timestampGc: `${today.gc} ${time}`,
      timestampEc: `${today.ec} ${time}`,
      userId: actor.id,
      userName: actor.fullNameEn,
      userRole: actor.role,
      action,
      entityType: 'USER',
      entityId,
      details,
      newState: newState as any,
    },
  });
}

export async function listApiKeys(actorId: string): Promise<ApiKeyView[]> {
  await loadAdmin(prisma, actorId);
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return keys.map((k) => toView(k));
}

/** Creates a key for one service. The full key is returned this once and never again. */
export async function createApiKey(
  input: { name?: unknown; expiresAt?: unknown; scopes?: unknown },
  actorId: string,
): Promise<{ key: string; apiKey: ApiKeyView }> {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new BadRequestError('Name the service the key is for, e.g. Ministry KPI dashboard.');
  if (name.length > 100) throw new BadRequestError('The name must be 100 characters or fewer.');

  let expiresAt: Date | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null && input.expiresAt !== '') {
    expiresAt = new Date(String(input.expiresAt));
    if (Number.isNaN(expiresAt.getTime())) throw new BadRequestError('The expiry date is not a valid date.');
    if (expiresAt <= new Date()) throw new BadRequestError('The expiry date must be in the future.');
  }

  const scopes = input.scopes === undefined ? ['dashboard.read'] : input.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((s) => !(API_KEY_SCOPES as readonly string[]).includes(s))) {
    throw new BadRequestError(`A key can be allowed: ${API_KEY_SCOPES.join(', ')}.`);
  }

  const keyId = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  return prisma.$transaction(async (tx: any) => {
    const actor = await loadAdmin(tx, actorId);
    const created = await tx.apiKey.create({
      data: { name, keyId, secretHash: hashSecret(secret), scopes: [...new Set(scopes as string[])], expiresAt, createdById: actor.id, createdByName: actor.fullNameEn },
    });
    await audit(tx, actor, 'API_KEY_CREATED', created.id, `${actor.fullNameEn} created API key "${name}" (${PREFIX}${keyId}…) for ${scopes.join(', ')}.`, {
      name, keyId, scopes, expiresAt: iso(expiresAt),
    });
    return { key: `${PREFIX}${keyId}_${secret}`, apiKey: toView(created) };
  });
}

/** Stops a key working at once; it stays in the list as revoked */
export async function revokeApiKey(id: string, actorId: string): Promise<ApiKeyView> {
  return prisma.$transaction(async (tx: any) => {
    const actor = await loadAdmin(tx, actorId);
    const key = await tx.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundError('This API key no longer exists.');
    if (key.revokedAt) return toView(key);
    const revoked = await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, 'API_KEY_REVOKED', id, `${actor.fullNameEn} revoked API key "${key.name}" (${PREFIX}${key.keyId}…).`);
    return toView(revoked);
  });
}

// Calls per key in the current minute
const calls = new Map<string, { minute: number; count: number }>();
// When each key's last use was saved, so it is written at most once a minute
const lastSaved = new Map<string, number>();

export const resetApiKeyLimits = () => {
  calls.clear();
  lastSaved.clear();
};

/**
 * The service behind a key sent with a request, if the key is genuine, current, allowed `scope`, and within its
 * rate limit. Every refusal says only "invalid", so a caller can't learn which keys exist.
 */
export async function verifyApiKey(header: string | undefined, scope: ApiKeyScope): Promise<ApiKeyPrincipal> {
  const match = /^ats_live_([0-9a-f]{12})_([A-Za-z0-9_-]{20,})$/.exec((header ?? '').trim());
  if (!match) throw new UnauthorizedError('A valid API key is required (X-API-Key header).');
  const [, keyId, secret] = match;
  const key = await prisma.apiKey.findUnique({ where: { keyId } });
  const expected = Buffer.from(key?.secretHash ?? '0'.repeat(64), 'hex');
  const given = Buffer.from(hashSecret(secret), 'hex');
  const genuine = !!key && expected.length === given.length && timingSafeEqual(expected, given);
  const now = new Date();
  if (!genuine || key!.revokedAt || (key!.expiresAt && key!.expiresAt <= now)) {
    throw new UnauthorizedError('This API key is invalid, revoked or expired.');
  }
  if (!key!.scopes.includes(scope)) throw new ForbiddenError('This API key is not allowed to read this.');

  const minute = Math.floor(now.getTime() / 60_000);
  const used = calls.get(key!.id);
  const count = used && used.minute === minute ? used.count + 1 : 1;
  calls.set(key!.id, { minute, count });
  if (count > API_KEY_RATE_PER_MINUTE) {
    throw new AppError(`Too many requests: at most ${API_KEY_RATE_PER_MINUTE} a minute per key.`, 429);
  }

  if ((lastSaved.get(key!.id) ?? 0) < now.getTime() - 60_000) {
    lastSaved.set(key!.id, now.getTime());
    // Recording the use must never fail the request
    await prisma.apiKey.update({ where: { id: key!.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return { apiKeyId: key!.id, name: key!.name, scopes: key!.scopes };
}
