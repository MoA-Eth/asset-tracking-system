import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission } from '../security/role-policy';
import { Department, Location } from '../types/asset-management';

/** A location as Settings shows it; `itemCount` is the number of item records kept there */
export interface LocationRecord extends Location {
  itemCount?: number;
}

export interface LocationInput {
  siteName?: unknown;
  building?: unknown;
  roomNumber?: unknown;
  isCentralStore?: unknown;
}

/** Item records that are physically in a store (not yet issued, or waiting for approval) */
const IN_STORE = ['AVAILABLE', 'PENDING_STOCK_IN', 'PENDING_STOCK_OUT'];

const text = (value: unknown, label: string, max: number, required: boolean): string | null => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new BadRequestError(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestError(`${label} must be text.`);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length > max) throw new BadRequestError(`${label} must be ${max} characters or fewer.`);
  return trimmed;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function loadActor(tx: any, actorId: string) {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  if (!actor || actor.isActive === false || !hasPermission(actor.role, 'references.manage')) {
    throw new ForbiddenError('Only System Administrators can manage locations and stores.');
  }
  return actor;
}

async function audit(tx: any, actor: any, action: string, entityId: string, details: string, previousState?: object, newState?: object) {
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
      entityType: 'REFERENCE',
      entityId,
      details,
      previousState: previousState as any,
      newState: newState as any,
    },
  });
}

/** Runs a change in one transaction; a unique-key clash becomes a clear message */
async function change<T>(duplicateMessage: string, fn: (tx: any) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (error: any) {
    if (error?.code === 'P2002') throw new ConflictError(duplicateMessage);
    throw error;
  }
}

// ─── Departments ─────────────────────────────────────────────────────────────

/**
 * Departments for the pickers. They have no page of their own: they come from employee data
 * (HR's import, or a new name typed in the Add employee form).
 */
export async function listDepartments(): Promise<Department[]> {
  const rows = await prisma.department.findMany({ orderBy: { nameEn: 'asc' } });
  return rows.map((d) => ({ id: d.id, code: d.code, nameEn: d.nameEn, nameAm: d.nameAm, headEmployeeId: d.headEmployeeId ?? undefined }));
}

// ─── Locations and stores ────────────────────────────────────────────────────

const LOCATION_COUNTS = { _count: { select: { items: { where: { status: { in: IN_STORE as any } } } } } };

function toLocation(l: any, withCounts: boolean): LocationRecord {
  const record: LocationRecord = {
    id: l.id,
    siteName: l.siteName,
    building: l.building,
    roomNumber: l.roomNumber,
    isCentralStore: l.isCentralStore,
    isActive: l.isActive !== false,
  };
  if (withCounts && l._count) record.itemCount = l._count.items;
  return record;
}

const locationView = (l: any) => ({
  siteName: l.siteName,
  building: l.building,
  roomNumber: l.roomNumber,
  isCentralStore: !!l.isCentralStore,
  isActive: l.isActive !== false,
});

const locationLabel = (l: any) => [l.siteName, l.building, l.roomNumber].filter(Boolean).join(' · ');

/** Active locations for the pickers; people who manage reference data can also ask for deactivated ones */
export async function listLocations(viewerRole: unknown, opts: { includeInactive?: boolean } = {}): Promise<LocationRecord[]> {
  const canManage = hasPermission(viewerRole, 'references.manage');
  const rows = await prisma.location.findMany({
    where: opts.includeInactive && canManage ? {} : { isActive: true },
    ...(canManage ? { include: LOCATION_COUNTS } : {}),
    orderBy: [{ siteName: 'asc' }, { building: 'asc' }, { roomNumber: 'asc' }],
  });
  return rows.map((l) => toLocation(l, canManage));
}

async function normalizeLocation(tx: any, input: LocationInput, id?: string) {
  if (input.isCentralStore !== undefined && typeof input.isCentralStore !== 'boolean') {
    throw new BadRequestError('Say whether this location is a store.');
  }
  const data = {
    siteName: text(input.siteName, 'Site name', 120, true)!,
    building: text(input.building, 'Building', 120, false) ?? '',
    roomNumber: text(input.roomNumber, 'Room', 60, false) ?? '',
    isCentralStore: input.isCentralStore === true,
  };
  const same = await tx.location.findFirst({
    where: {
      siteName: { equals: data.siteName, mode: 'insensitive' },
      building: { equals: data.building, mode: 'insensitive' },
      roomNumber: { equals: data.roomNumber, mode: 'insensitive' },
      ...(id ? { NOT: { id } } : {}),
    },
  });
  if (same) throw new ConflictError(`"${locationLabel(same)}" already exists.`);
  return data;
}

/** Stock is always received into a store, so at least one must stay active */
async function assertAnotherStoreRemains(tx: any, id: string, name: string) {
  const others = await tx.location.count({ where: { isCentralStore: true, isActive: true, NOT: { id } } });
  if (others === 0) throw new ConflictError(`${name} is the only active store. Add or reactivate another store first.`);
}

export async function createLocation(input: LocationInput, actorId: string): Promise<LocationRecord> {
  return change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const data = await normalizeLocation(tx, input);
    const created = await tx.location.create({ data: { id: `LOC-${randomUUID().slice(0, 8).toUpperCase()}`, ...data, isActive: true } });
    await audit(tx, actor, data.isCentralStore ? 'CREATE_STORE' : 'CREATE_LOCATION', created.id, `Added ${data.isCentralStore ? 'store' : 'location'} ${locationLabel(created)}.`, undefined, locationView(created));
    return toLocation({ ...created, _count: { items: 0 } }, true);
  });
}

export async function updateLocation(id: string, input: LocationInput, actorId: string): Promise<LocationRecord> {
  return change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id }, include: LOCATION_COUNTS });
    if (!previous) throw new NotFoundError('Location not found.');
    const data = await normalizeLocation(tx, input, id);

    // Turning a store into a plain location: it must not hold stock, and another store must remain
    if (previous.isCentralStore && !data.isCentralStore && previous.isActive !== false) {
      const held = previous._count.items;
      if (held > 0) throw new ConflictError(`${previous.siteName} holds ${plural(held, 'item record')} in store, so it must stay a store.`);
      await assertAnotherStoreRemains(tx, id, previous.siteName);
    }

    const updated = await tx.location.update({ where: { id }, data, include: LOCATION_COUNTS });
    const before = locationView(previous);
    const after = locationView(updated);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
    if (changed.length > 0) {
      await audit(tx, actor, 'UPDATE_LOCATION', id, `Updated location ${locationLabel(updated)}: ${changed.join(', ')}.`, before, after);
    }
    return toLocation(updated, true);
  });
}

export async function setLocationActive(id: string, active: unknown, actorId: string): Promise<LocationRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the location should be active.');
  return change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id }, include: LOCATION_COUNTS });
    if (!previous) throw new NotFoundError('Location not found.');
    if ((previous.isActive !== false) === active) return toLocation(previous, true);

    if (!active) {
      const held = previous._count.items;
      if (held > 0) {
        throw new ConflictError(`${previous.siteName} still holds ${plural(held, 'item record')}. Issue or transfer ${held === 1 ? 'it' : 'them'} first.`);
      }
      const pending = await tx.transactionApproval.count({ where: { status: 'PENDING' as any, targetLocationId: id } });
      if (pending > 0) {
        throw new ConflictError(`${previous.siteName} is the destination of ${plural(pending, 'pending request')}. Finish or reject ${pending === 1 ? 'it' : 'them'} first.`);
      }
      if (previous.isCentralStore) await assertAnotherStoreRemains(tx, id, previous.siteName);
    }
    const updated = await tx.location.update({ where: { id }, data: { isActive: active }, include: LOCATION_COUNTS });
    await audit(
      tx,
      actor,
      active ? 'REACTIVATE_LOCATION' : 'DEACTIVATE_LOCATION',
      id,
      `${active ? 'Reactivated' : 'Deactivated'} ${updated.isCentralStore ? 'store' : 'location'} ${locationLabel(updated)}.`,
      { isActive: !active },
      { isActive: active },
    );
    return toLocation(updated, true);
  });
}

/** Removes a location nothing refers to; anything with history is deactivated instead */
export async function deleteLocation(id: string, actorId: string): Promise<void> {
  await change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Location not found.');
    const [items, requests] = await Promise.all([
      tx.item.count({ where: { storeLocationId: id } }),
      tx.transactionApproval.count({ where: { targetLocationId: id } }),
    ]);
    if (items + requests > 0) {
      const used = [items && plural(items, 'item record'), requests && plural(requests, 'request')].filter(Boolean).join(', ');
      throw new ConflictError(`${previous.siteName} can't be deleted because it is used by ${used}. Deactivate it instead.`);
    }
    if (previous.isCentralStore && previous.isActive !== false) await assertAnotherStoreRemains(tx, id, previous.siteName);
    await tx.location.delete({ where: { id } });
    await audit(tx, actor, 'DELETE_LOCATION', id, `Deleted location ${locationLabel(previous)}.`, locationView(previous));
  });
}
