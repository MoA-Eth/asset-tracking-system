import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission } from '../security/role-policy';

/** A ministry program or project goods are received for */
export interface ProgramRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProgramInput {
  name?: unknown;
  code?: unknown;
  description?: unknown;
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

const toRecord = (p: any): ProgramRecord => ({
  id: p.id,
  name: p.name,
  code: p.code ?? '',
  description: p.description ?? '',
  isActive: p.isActive !== false,
  createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : (p.createdAt ?? new Date().toISOString()),
});

/**
 * Who may change the program list. A program can be added by anyone who receives items (from the receipt form, when
 * the one they need is missing); editing, deactivating, and deleting are for those who manage the reference lists.
 */
async function loadActor(tx: any, actorId: string, needs: 'add' | 'manage') {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  const allowed = !!actor && actor.isActive !== false
    && (hasPermission(actor.role, 'references.manage') || (needs === 'add' && hasPermission(actor.role, 'stock-in.write')));
  if (!allowed) throw new ForbiddenError(needs === 'add' ? 'Your role does not permit adding programs.' : 'Only System Administrators can change programs.');
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
    if (error?.code === 'P2002') throw new ConflictError('A program or project with this name already exists.');
    throw error;
  }
}

/** One spelling per program: the same name, ignoring case and spacing, is the same program */
async function assertNameFree(tx: any, name: string, id?: string) {
  const same = await tx.program.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(id ? { NOT: { id } } : {}),
    },
  });
  if (same) throw new ConflictError(`"${same.name}" is already in the list${same.isActive === false ? ' (deactivated: reactivate it instead)' : ''}.`);
}

/** The list for the pickers (active only) or for Settings (all) */
export async function listPrograms(opts: { includeInactive?: boolean } = {}): Promise<ProgramRecord[]> {
  const rows = await prisma.program.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(toRecord);
}

export async function createProgram(input: ProgramInput, actorId: string): Promise<ProgramRecord> {
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'add');
    const data = {
      name: text(input.name, 'Program name', 150, true),
      code: text(input.code, 'Program code', 40, false),
      description: text(input.description, 'Description', 500, false),
    };
    await assertNameFree(tx, data.name);
    const created = await tx.program.create({
      data: {
        id: `PRG-${randomUUID().slice(0, 8).toUpperCase()}`,
        ...data,
        isActive: true,
      },
    });
    await audit(tx, actor, 'CREATE_PROGRAM', created.id, `Added program ${created.name}.`, undefined, toRecord(created));
    return toRecord(created);
  });
}

export async function updateProgram(id: string, input: ProgramInput, actorId: string): Promise<ProgramRecord> {
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'manage');
    const previous = await tx.program.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Program not found.');
    const data = {
      name: text(input.name, 'Program name', 150, true),
      code: text(input.code, 'Program code', 40, false),
      description: text(input.description, 'Description', 500, false),
    };
    await assertNameFree(tx, data.name, id);
    const updated = await tx.program.update({ where: { id }, data });
    await audit(tx, actor, 'UPDATE_PROGRAM', id, `Updated program ${updated.name}.`, toRecord(previous), toRecord(updated));
    return toRecord(updated);
  });
}

export async function setProgramActive(id: string, active: unknown, actorId: string): Promise<ProgramRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the program should be active.');
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'manage');
    const previous = await tx.program.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Program not found.');
    if ((previous.isActive !== false) === active) return toRecord(previous);
    const updated = await tx.program.update({ where: { id }, data: { isActive: active } });
    await audit(
      tx,
      actor,
      active ? 'REACTIVATE_PROGRAM' : 'DEACTIVATE_PROGRAM',
      id,
      `${active ? 'Reactivated' : 'Deactivated'} program ${updated.name}.`,
      { isActive: !active },
      { isActive: active }
    );
    return toRecord(updated);
  });
}

export async function deleteProgram(id: string, actorId: string): Promise<void> {
  return change(async (tx) => {
    const actor = await loadActor(tx, actorId, 'manage');
    const previous = await tx.program.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Program not found.');

    await tx.program.delete({ where: { id } });
    await audit(tx, actor, 'DELETE_PROGRAM', id, `Deleted program ${previous.name}.`, toRecord(previous), undefined);
  });
}

/** "  food system resilience program " and "Food System Resilience Program" are the same name */
export const programKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
