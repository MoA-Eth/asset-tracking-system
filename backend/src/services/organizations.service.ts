import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission } from '../security/role-policy';

/** An outside organization items are issued to */
export interface OrganizationRecord {
  id: string;
  name: string;
  shortName: string;
  contactPerson: string;
  isActive: boolean;
}

export interface OrganizationInput {
  name?: unknown;
  shortName?: unknown;
  contactPerson?: unknown;
}

const text = (value: unknown, label: string, max: number, required: boolean): string => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new BadRequestError(`${label} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new BadRequestError(`${label} must be text.`);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length > max) throw new BadRequestError(`${label} must be ${max} characters or fewer.`);
  return trimmed;
};

const toRecord = (o: any): OrganizationRecord => ({
  id: o.id,
  name: o.name,
  shortName: o.shortName ?? '',
  contactPerson: o.contactPerson ?? '',
  isActive: o.isActive !== false,
});

/**
 * Who may change the list. An organization can be added by anyone who issues items (from the issue form, when the
 * one they need is missing); editing and deactivating are for those who manage the reference lists.
 */
async function loadActor(tx: any, actorId: string, needs: 'add' | 'manage') {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  const allowed = !!actor && actor.isActive !== false
    && (hasPermission(actor.role, 'references.manage') || (needs === 'add' && hasPermission(actor.role, 'stock-out.write')));
  if (!allowed) throw new ForbiddenError(needs === 'add' ? 'Your role does not permit adding organizations.' : 'Only System Administrators can change organizations.');
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

async function change<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (error: any) {
    if (error?.code === 'P2002') throw new ConflictError('An organization with this name already exists.');
    throw error;
  }
}

/** One spelling per organization: the same name, ignoring case and spacing, is the same organization */
async function assertNameFree(tx: any, name: string, id?: string) {
  const same = await tx.organization.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
  if (same) throw new ConflictError(`"${same.name}" is already in the list${same.isActive === false ? ' (deactivated: reactivate it instead)' : ''}.`);
}

/** The list for the pickers (active only) or for Settings (all) */
export async function listOrganizations(opts: { includeInactive?: boolean } = {}): Promise<OrganizationRecord[]> {
  const rows = await prisma.organization.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(toRecord);
}

export async function createOrganization(input: OrganizationInput, actorId: string): Promise<OrganizationRecord> {
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'add');
    const data = {
      name: text(input.name, 'Organization name', 150, true),
      shortName: text(input.shortName, 'Short name', 40, false),
      contactPerson: text(input.contactPerson, 'Contact person', 100, false),
    };
    await assertNameFree(tx, data.name);
    const created = await tx.organization.create({ data: { id: `ORG-${randomUUID().slice(0, 8).toUpperCase()}`, ...data, isActive: true } });
    await audit(tx, actor, 'CREATE_ORGANIZATION', created.id, `Added organization ${created.name}.`, undefined, toRecord(created));
    return toRecord(created);
  });
}

export async function updateOrganization(id: string, input: OrganizationInput, actorId: string): Promise<OrganizationRecord> {
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'manage');
    const previous = await tx.organization.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Organization not found.');
    const data = {
      name: text(input.name, 'Organization name', 150, true),
      shortName: text(input.shortName, 'Short name', 40, false),
      contactPerson: text(input.contactPerson, 'Contact person', 100, false),
    };
    await assertNameFree(tx, data.name, id);
    const updated = await tx.organization.update({ where: { id }, data });
    await audit(tx, actor, 'UPDATE_ORGANIZATION', id, `Updated organization ${updated.name}.`, toRecord(previous), toRecord(updated));
    return toRecord(updated);
  });
}

export async function setOrganizationActive(id: string, active: unknown, actorId: string): Promise<OrganizationRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the organization should be active.');
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'manage');
    const previous = await tx.organization.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Organization not found.');
    if ((previous.isActive !== false) === active) return toRecord(previous);
    const updated = await tx.organization.update({ where: { id }, data: { isActive: active } });
    await audit(tx, actor, active ? 'REACTIVATE_ORGANIZATION' : 'DEACTIVATE_ORGANIZATION', id, `${active ? 'Reactivated' : 'Deactivated'} organization ${updated.name}.`, { isActive: !active }, { isActive: active });
    return toRecord(updated);
  });
}

/** The organization an issue names, by its record: it must exist and be active */
export async function requireOrganization(db: any, id: string): Promise<OrganizationRecord> {
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) throw new BadRequestError('The selected organization no longer exists.');
  if (org.isActive === false) throw new BadRequestError(`${org.name} is deactivated. Choose another organization, or ask the System Administrator to reactivate it.`);
  return toRecord(org);
}

/** "  oromia   bureau of Agriculture " and "Oromia Bureau of Agriculture" are the same name */
export const organizationKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
