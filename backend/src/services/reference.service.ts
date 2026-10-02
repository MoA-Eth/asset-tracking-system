import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission } from '../security/role-policy';
import { Department, Location, Store } from '../types/asset-management';

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
    throw new ForbiddenError('Only System Administrators can manage stores and their locations.');
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

// ─── Stores and their locations ──────────────────────────────────────────────

/** A store with its locations; `itemCount`s are only sent to people who manage reference data */
export interface StoreRecord extends Store {
  locations: LocationRecord[];
  /** Item records in store across all of its locations */
  itemCount?: number;
}

export interface LocationRecord extends Location {
  /** Item records currently in store at this location */
  itemCount?: number;
}

export interface StoreInput {
  name?: unknown;
  address?: unknown;
  /** Name of the first location, when adding a store (defaults to "Main store") */
  locationName?: unknown;
}

export interface LocationInput {
  name?: unknown;
}

const LOCATION_COUNTS = { _count: { select: { items: { where: { status: { in: IN_STORE as any } } } } } };
const STORE_INCLUDE = { locations: { include: LOCATION_COUNTS, orderBy: { name: 'asc' as const } } };

/**
 * A location as the rest of the system sees it. `siteName`, `building` and `roomNumber` are kept so the
 * item screens and slips, which show "store · location", need no change.
 */
export function locationView(l: any, store: any = l?.store): Location {
  return {
    id: l.id,
    storeId: l.storeId,
    name: l.name,
    storeName: store?.name ?? '',
    // Usable only while both the location and its store are active
    isActive: l.isActive !== false && store?.isActive !== false,
    siteName: store?.name ?? l.siteName ?? '',
    building: store?.address ?? '',
    roomNumber: l.name ?? '',
    isCentralStore: true,
  };
}

/** Throws when a location picked on a form (or its store) has been deactivated */
export function assertUsableLocation(l: any, what: string): void {
  if (!l) return;
  if (l.isActive === false || l.store?.isActive === false) {
    const label = [l.store?.name ?? l.siteName, l.name].filter(Boolean).join(' · ') || 'This location';
    throw new BadRequestError(`${label} has been deactivated and can't be chosen as ${what}.`);
  }
}

function toStore(s: any, withCounts: boolean): StoreRecord {
  const locations: LocationRecord[] = (s.locations ?? []).map((l: any) => {
    // Inside the Stores page a location shows its own status, not its store's
    const record: LocationRecord = { ...locationView(l, s), isActive: l.isActive !== false };
    if (withCounts && l._count) record.itemCount = l._count.items;
    return record;
  });
  const record: StoreRecord = { id: s.id, name: s.name, address: s.address ?? '', isActive: s.isActive !== false, locations };
  if (withCounts) record.itemCount = locations.reduce((sum, l) => sum + (l.itemCount ?? 0), 0);
  return record;
}

const storeAudit = (s: any) => ({ name: s.name, address: s.address ?? '', isActive: s.isActive !== false });
const locationAudit = (l: any) => ({ storeId: l.storeId, name: l.name, isActive: l.isActive !== false });

/** Stores with their locations. Pickers get active ones only; people who manage reference data can ask for all. */
export async function listStores(viewerRole: unknown, opts: { includeInactive?: boolean } = {}): Promise<StoreRecord[]> {
  const canManage = hasPermission(viewerRole, 'references.manage');
  const all = opts.includeInactive && canManage;
  const rows = await prisma.store.findMany({
    where: all ? {} : { isActive: true },
    include: {
      locations: {
        where: all ? {} : { isActive: true },
        ...(canManage ? { include: LOCATION_COUNTS } : {}),
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return rows.map((s) => toStore(s, canManage));
}

/** Every active location in an active store, as a flat list for the forms */
export async function listLocations(): Promise<Location[]> {
  const rows = await prisma.location.findMany({
    where: { isActive: true, store: { isActive: true } },
    include: { store: true },
    orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
  });
  return rows.map((l) => locationView(l));
}

/** Stock is always received somewhere, so one active location in an active store must remain */
async function assertSomewhereRemains(tx: any, excluding: { storeId?: string; locationId?: string }, name: string) {
  const others = await tx.location.count({
    where: {
      isActive: true,
      store: { isActive: true, ...(excluding.storeId ? { NOT: { id: excluding.storeId } } : {}) },
      ...(excluding.locationId ? { NOT: { id: excluding.locationId } } : {}),
    },
  });
  if (others === 0) throw new ConflictError(`${name} is the only place left to receive stock. Add or reactivate another one first.`);
}

async function normalizeStore(tx: any, input: StoreInput, id?: string) {
  const data = {
    name: text(input.name, 'Store name', 120, true)!,
    address: text(input.address, 'Address', 160, false) ?? '',
  };
  const same = await tx.store.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
  if (same) throw new ConflictError(`A store named "${same.name}" already exists.`);
  return data;
}

async function normalizeLocation(tx: any, storeId: string, input: LocationInput, id?: string) {
  const name = text(input.name, 'Location name', 80, true)!;
  const same = await tx.location.findFirst({ where: { storeId, name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
  if (same) throw new ConflictError(`This store already has a location named "${same.name}".`);
  return { name };
}

export async function createStore(input: StoreInput, actorId: string): Promise<StoreRecord> {
  return change('A store with this name already exists.', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const data = await normalizeStore(tx, input);
    // A store needs somewhere to keep stock, so it starts with one location
    const locationName = text(input.locationName, 'Location name', 80, false) ?? 'Main store';
    const created = await tx.store.create({
      data: {
        id: `STR-${randomUUID().slice(0, 8).toUpperCase()}`,
        ...data,
        isActive: true,
        locations: { create: [{ id: `LOC-${randomUUID().slice(0, 8).toUpperCase()}`, name: locationName, isActive: true }] },
      },
      include: STORE_INCLUDE,
    });
    await audit(tx, actor, 'CREATE_STORE', created.id, `Added store ${created.name} with location ${locationName}.`, undefined, storeAudit(created));
    return toStore(created, true);
  });
}

export async function updateStore(id: string, input: StoreInput, actorId: string): Promise<StoreRecord> {
  return change('A store with this name already exists.', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.store.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Store not found.');
    const data = await normalizeStore(tx, input, id);
    const updated = await tx.store.update({ where: { id }, data, include: STORE_INCLUDE });
    const before = storeAudit(previous);
    const after = storeAudit(updated);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
    if (changed.length > 0) await audit(tx, actor, 'UPDATE_STORE', id, `Updated store ${updated.name}: ${changed.join(', ')}.`, before, after);
    return toStore(updated, true);
  });
}

export async function setStoreActive(id: string, active: unknown, actorId: string): Promise<StoreRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the store should be active.');
  return change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.store.findUnique({ where: { id }, include: STORE_INCLUDE });
    if (!previous) throw new NotFoundError('Store not found.');
    if ((previous.isActive !== false) === active) return toStore(previous, true);

    if (!active) {
      const held = toStore(previous, true).itemCount ?? 0;
      if (held > 0) throw new ConflictError(`${previous.name} still holds ${plural(held, 'item record')}. Issue or transfer ${held === 1 ? 'it' : 'them'} first.`);
      const pending = await tx.transactionApproval.count({
        where: { status: 'PENDING' as any, targetLocationId: { in: previous.locations.map((l: any) => l.id) } },
      });
      if (pending > 0) {
        throw new ConflictError(`${previous.name} is the destination of ${plural(pending, 'pending request')}. Finish or reject ${pending === 1 ? 'it' : 'them'} first.`);
      }
      await assertSomewhereRemains(tx, { storeId: id }, previous.name);
    }
    const updated = await tx.store.update({ where: { id }, data: { isActive: active }, include: STORE_INCLUDE });
    await audit(tx, actor, active ? 'REACTIVATE_STORE' : 'DEACTIVATE_STORE', id, `${active ? 'Reactivated' : 'Deactivated'} store ${updated.name}.`, { isActive: !active }, { isActive: active });
    return toStore(updated, true);
  });
}

/** Removes a store, with its locations, when nothing has ever used them; otherwise it is deactivated instead */
export async function deleteStore(id: string, actorId: string): Promise<void> {
  await change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.store.findUnique({ where: { id }, include: { locations: true } });
    if (!previous) throw new NotFoundError('Store not found.');
    const locationIds = previous.locations.map((l: any) => l.id);
    const [items, requests] = await Promise.all([
      tx.item.count({ where: { storeLocationId: { in: locationIds } } }),
      tx.transactionApproval.count({ where: { targetLocationId: { in: locationIds } } }),
    ]);
    if (items + requests > 0) {
      const used = [items && plural(items, 'item record'), requests && plural(requests, 'request')].filter(Boolean).join(', ');
      throw new ConflictError(`${previous.name} can't be deleted because it is used by ${used}. Deactivate it instead.`);
    }
    if (previous.isActive !== false) await assertSomewhereRemains(tx, { storeId: id }, previous.name);
    await tx.location.deleteMany({ where: { storeId: id } });
    await tx.store.delete({ where: { id } });
    await audit(tx, actor, 'DELETE_STORE', id, `Deleted store ${previous.name}.`, storeAudit(previous));
  });
}

export async function createLocation(storeId: string, input: LocationInput, actorId: string): Promise<LocationRecord> {
  return change('This store already has a location with this name.', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundError('Store not found.');
    const data = await normalizeLocation(tx, storeId, input);
    const created = await tx.location.create({ data: { id: `LOC-${randomUUID().slice(0, 8).toUpperCase()}`, storeId, ...data, isActive: true } });
    await audit(tx, actor, 'CREATE_LOCATION', created.id, `Added location ${created.name} to store ${store.name}.`, undefined, locationAudit(created));
    return { ...locationView(created, store), isActive: true, itemCount: 0 };
  });
}

export async function updateLocation(id: string, input: LocationInput, actorId: string): Promise<LocationRecord> {
  return change('This store already has a location with this name.', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id }, include: { store: true } });
    if (!previous) throw new NotFoundError('Location not found.');
    const data = await normalizeLocation(tx, previous.storeId, input, id);
    const updated = await tx.location.update({ where: { id }, data, include: { store: true, ...LOCATION_COUNTS } });
    if (updated.name !== previous.name) {
      await audit(tx, actor, 'UPDATE_LOCATION', id, `Renamed location ${previous.name} to ${updated.name} in store ${previous.store.name}.`, locationAudit(previous), locationAudit(updated));
    }
    return { ...locationView(updated), isActive: updated.isActive !== false, itemCount: updated._count?.items ?? 0 };
  });
}

export async function setLocationActive(id: string, active: unknown, actorId: string): Promise<LocationRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the location should be active.');
  return change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id }, include: { store: true, ...LOCATION_COUNTS } });
    if (!previous) throw new NotFoundError('Location not found.');
    const view = (l: any): LocationRecord => ({ ...locationView(l), isActive: l.isActive !== false, itemCount: l._count?.items ?? 0 });
    if ((previous.isActive !== false) === active) return view(previous);

    if (!active) {
      const held = previous._count?.items ?? 0;
      if (held > 0) throw new ConflictError(`${previous.name} still holds ${plural(held, 'item record')}. Issue or transfer ${held === 1 ? 'it' : 'them'} first.`);
      const pending = await tx.transactionApproval.count({ where: { status: 'PENDING' as any, targetLocationId: id } });
      if (pending > 0) {
        throw new ConflictError(`${previous.name} is the destination of ${plural(pending, 'pending request')}. Finish or reject ${pending === 1 ? 'it' : 'them'} first.`);
      }
      if (previous.store.isActive !== false) await assertSomewhereRemains(tx, { locationId: id }, `${previous.store.name} · ${previous.name}`);
    }
    const updated = await tx.location.update({ where: { id }, data: { isActive: active }, include: { store: true, ...LOCATION_COUNTS } });
    await audit(
      tx,
      actor,
      active ? 'REACTIVATE_LOCATION' : 'DEACTIVATE_LOCATION',
      id,
      `${active ? 'Reactivated' : 'Deactivated'} location ${updated.name} in store ${updated.store.name}.`,
      { isActive: !active },
      { isActive: active },
    );
    return view(updated);
  });
}

/** Removes a location nothing has ever used; a store always keeps at least one location */
export async function deleteLocation(id: string, actorId: string): Promise<void> {
  await change('', async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.location.findUnique({ where: { id }, include: { store: true } });
    if (!previous) throw new NotFoundError('Location not found.');
    const [items, requests, siblings] = await Promise.all([
      tx.item.count({ where: { storeLocationId: id } }),
      tx.transactionApproval.count({ where: { targetLocationId: id } }),
      tx.location.count({ where: { storeId: previous.storeId, NOT: { id } } }),
    ]);
    if (items + requests > 0) {
      const used = [items && plural(items, 'item record'), requests && plural(requests, 'request')].filter(Boolean).join(', ');
      throw new ConflictError(`${previous.name} can't be deleted because it is used by ${used}. Deactivate it instead.`);
    }
    if (siblings === 0) throw new ConflictError(`${previous.name} is the only location in ${previous.store.name}. Delete the store instead.`);
    if (previous.isActive !== false && previous.store.isActive !== false) {
      await assertSomewhereRemains(tx, { locationId: id }, `${previous.store.name} · ${previous.name}`);
    }
    await tx.location.delete({ where: { id } });
    await audit(tx, actor, 'DELETE_LOCATION', id, `Deleted location ${previous.name} from store ${previous.store.name}.`, locationAudit(previous));
  });
}
