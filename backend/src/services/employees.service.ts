import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission, isUserRole, ROLE_POLICY } from '../security/role-policy';
import { hashPassword } from '../security/credentials';
import { Employee, UserRole } from '../types/asset-management';

/** Fields an administrator can set on an employee */
export interface EmployeeInput {
  payrollId?: unknown;
  fullNameEn?: unknown;
  fullNameAm?: unknown;
  departmentId?: unknown;
  /** Used instead of departmentId: an existing department's name or code, or a new name to create */
  departmentName?: unknown;
  jobTitle?: unknown;
  unit?: unknown;
  gender?: unknown;
  email?: unknown;
  phone?: unknown;
  /** A system role, or null / '' for no sign-in */
  role?: unknown;
  /** Initial or new password; only needed when the employee signs in */
  password?: unknown;
}

/** An employee as the registry shows it; contact details and items held only for managers */
export interface EmployeeRecord extends Employee {
  heldItemCount?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

const text = (value: unknown, label: string, max: number, required: boolean): string | null => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new BadRequestError(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new BadRequestError(`${label} must be ${max} characters or fewer.`);
  return trimmed;
};

const GENDERS: Record<string, 'MALE' | 'FEMALE'> = { male: 'MALE', m: 'MALE', ወንድ: 'MALE', female: 'FEMALE', f: 'FEMALE', ሴት: 'FEMALE' };

/** Accepts MALE / FEMALE, M / F, or HR's ወንድ / ሴት */
const genderOf = (value: unknown): 'MALE' | 'FEMALE' | null => {
  const raw = text(value, 'Gender', 20, false);
  if (raw === null) return null;
  const gender = GENDERS[raw.toLowerCase()];
  if (!gender) throw new BadRequestError('Gender must be Male (ወንድ) or Female (ሴት).');
  return gender;
};

const roleOf = (value: unknown): UserRole | null => {
  if (value === null || value === undefined || value === '' || value === 'NONE') return null;
  if (!isUserRole(value)) throw new BadRequestError('Choose a system role, or "No sign-in".');
  return value;
};

function toRecord(e: any, withContact: boolean): EmployeeRecord {
  const record: EmployeeRecord = {
    id: e.id,
    payrollId: e.payrollId,
    fullNameEn: e.fullNameEn,
    fullNameAm: e.fullNameAm,
    departmentId: e.departmentId,
    jobTitle: e.jobTitle ?? null,
    unit: e.unit ?? null,
    role: (e.role ?? null) as UserRole | null,
    isActive: e.isActive !== false,
  };
  if (withContact) {
    record.gender = e.gender ?? null;
    record.email = e.email ?? null;
    record.phone = e.phone ?? null;
    record.mustChangePassword = e.mustChangePassword === true;
    if (e._count) record.heldItemCount = e._count.custodiedItems;
  }
  return record;
}

/** Items an employee holds that would be left without a custodian */
const HELD_ITEMS = { custodiedItems: { where: { status: { not: 'DISPOSED' as any } } } };

/**
 * Staff registry. Everyone with "View employees" sees active staff (name, payroll ID, department, job title)
 * for the pickers; people who manage employees also see contact details, deactivated staff and items held.
 */
export async function listEmployees(
  viewerRole: unknown,
  opts: { departmentId?: string; includeInactive?: boolean } = {},
): Promise<EmployeeRecord[]> {
  const canManage = hasPermission(viewerRole, 'employees.manage');
  const rows = await prisma.employee.findMany({
    where: {
      ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      ...(opts.includeInactive && canManage ? {} : { isActive: true }),
    },
    ...(canManage ? { include: { _count: { select: HELD_ITEMS } } } : {}),
    orderBy: { fullNameEn: 'asc' },
  });
  return rows.map((e) => toRecord(e, canManage));
}

/** Run a change in a serializable transaction, retrying when two changes collide */
async function serializable<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const field = String(error.meta?.target ?? '');
        throw new ConflictError(
          field.includes('email') ? 'Another employee already uses this email.' : 'Another employee already has this employee ID.',
        );
      }
      if (error?.code !== 'P2034' || attempt === 2) {
        if (error?.code === 'P2034') throw new ConflictError('Another change was saved at the same time. Refresh and try again.');
        throw error;
      }
    }
  }
  throw new ConflictError('Please try again.');
}

async function loadActor(tx: any, actorId: string) {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  if (!actor || actor.isActive === false || !hasPermission(actor.role, 'employees.manage')) {
    throw new ForbiddenError('Only System Administrators can manage employees.');
  }
  return actor;
}

async function audit(tx: any, actor: any, action: string, employeeId: string, details: string, previousState?: object, newState?: object) {
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
      entityId: employeeId,
      details,
      previousState: previousState as any,
      newState: newState as any,
    },
  });
}

/** What is recorded in the audit log; never the password */
const auditView = (e: any) => ({
  payrollId: e.payrollId,
  fullNameEn: e.fullNameEn,
  fullNameAm: e.fullNameAm,
  departmentId: e.departmentId,
  jobTitle: e.jobTitle ?? null,
  unit: e.unit ?? null,
  gender: e.gender ?? null,
  email: e.email ?? null,
  phone: e.phone ?? null,
  role: e.role ?? null,
  isActive: e.isActive !== false,
});

/** Keeps at least one active System Administrator */
async function assertAdminRemains(tx: any, previous: any) {
  if (previous.role !== UserRole.SYSTEM_ADMIN || previous.isActive === false) return;
  const admins = await tx.employee.count({ where: { role: UserRole.SYSTEM_ADMIN, isActive: true } });
  if (admins <= 1) {
    throw new ConflictError('This is the last active System Administrator. Give another employee that role first.');
  }
}

/** Staff details shared by the form and the Excel import (no department lookup, no sign-in) */
function checkDetails(input: EmployeeInput) {
  const details = {
    payrollId: text(input.payrollId, 'Employee ID', 40, true)!,
    fullNameEn: text(input.fullNameEn, 'Full name (English)', 120, true)!,
    fullNameAm: text(input.fullNameAm, 'Full name (Amharic)', 120, false),
    departmentId: text(input.departmentId, 'Department', 40, true)!,
    jobTitle: text(input.jobTitle, 'Job title', 120, false),
    unit: text(input.unit, 'Unit', 160, false),
    gender: genderOf(input.gender),
    email: text(input.email, 'Email', 160, false)?.toLowerCase() ?? null,
    phone: text(input.phone, 'Phone', 20, false),
  };
  if (details.fullNameAm) {
    if (/[a-zA-Z]/.test(details.fullNameAm)) {
      throw new BadRequestError('Full name (Amharic) must be written in the Ethiopic script and cannot contain Latin characters.');
    }
    if (!/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/.test(details.fullNameAm)) {
      throw new BadRequestError('Full name (Amharic) must contain Ethiopic script characters.');
    }
  }
  if (details.email && !EMAIL_PATTERN.test(details.email)) throw new BadRequestError('Enter a valid email address.');
  if (details.phone && !PHONE_PATTERN.test(details.phone)) throw new BadRequestError('Enter a valid phone number, e.g. +251 911 000000.');
  return details;
}

/** A department row for a name the system doesn't have yet; `usedCodes` gains the generated code */
function newDepartmentRow(name: string, usedCodes: Set<string>) {
  let n = 1;
  let code = '';
  do code = `U${String(n++).padStart(3, '0')}`; while (usedCodes.has(code));
  usedCodes.add(code);
  // Departments are named in one language only (HR uses Amharic), so the name fills both until someone edits it
  return { id: `DEP-${randomUUID().slice(0, 8).toUpperCase()}`, code, nameEn: name, nameAm: name };
}

/**
 * The department for an employee form. Departments have no page of their own: the form sends a name,
 * which is matched to an existing department (by name or code) or, when new, created here.
 */
async function resolveDepartment(tx: any, input: EmployeeInput): Promise<{ id: string; nameEn: string; isNew?: boolean }> {
  const name = text(input.departmentName, 'Department', 160, false)?.replace(/\s+/g, ' ');
  if (!name) {
    const id = text(input.departmentId, 'Department', 40, true)!;
    const department = await tx.department.findUnique({ where: { id } });
    if (!department) throw new BadRequestError('The selected department no longer exists.');
    return department;
  }
  const departments = await tx.department.findMany();
  const wanted = matchKey(name);
  const existing = departments.find((d: any) => [d.nameEn, d.nameAm, d.code].some((v) => v && matchKey(v) === wanted));
  if (existing) return existing;
  const row = newDepartmentRow(name, new Set<string>(departments.map((d: any) => String(d.code).toUpperCase())));
  await tx.department.create({ data: row });
  return { ...row, isNew: true };
}

/**
 * Checks and normalizes the form; `previous` is the saved employee when editing.
 * Sign-in (role, password) only changes when the request includes it, so editing staff details never touches it.
 */
async function normalize(tx: any, input: EmployeeInput, previous?: any) {
  const department = await resolveDepartment(tx, input);
  const details = checkDetails({ ...input, departmentId: department.id });
  const data = {
    ...details,
    // The Amharic name is optional; the form saves a blank as empty
    fullNameAm: details.fullNameAm ?? '',
    role: input.role === undefined ? ((previous?.role ?? null) as UserRole | null) : roleOf(input.role),
  };

  const password = text(input.password, 'Password', 128, false);
  if (password !== null && password.length < 8) throw new BadRequestError('The password must be at least 8 characters.');
  if (data.role && !password && !previous?.password) {
    throw new BadRequestError(`Set an initial password so they can sign in as ${ROLE_POLICY[data.role].name}.`);
  }
  if (data.role && !data.email) {
    throw new BadRequestError('People who sign in need an email address.');
  }
  return { data, passwordHash: password ? await hashPassword(password) : undefined, newDepartment: department.isNew ? department.nameEn : undefined };
}

/** Sign-in accepts an employee ID in any letter case, so two IDs that differ only by case would be ambiguous */
async function assertEmployeeIdFree(tx: any, payrollId: string, exceptId?: string): Promise<void> {
  const other = await tx.employee.findFirst({
    where: { payrollId: { equals: payrollId, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (other) throw new ConflictError('Another employee already has this employee ID.');
}

export async function createEmployee(input: EmployeeInput, actorId: string): Promise<EmployeeRecord> {
  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const { data, passwordHash, newDepartment } = await normalize(tx, input);
    await assertEmployeeIdFree(tx, data.payrollId);
    const created = await tx.employee.create({
      data: { id: `EMP-${randomUUID().slice(0, 8).toUpperCase()}`, ...data, password: passwordHash ?? null, isActive: true },
    });
    await audit(tx, actor, 'CREATE_EMPLOYEE', created.id, `Added ${created.fullNameEn} (${created.payrollId}).${newDepartment ? ` New department: ${newDepartment}.` : ''}`, undefined, auditView(created));
    return toRecord({ ...created, _count: { custodiedItems: 0 } }, true);
  });
}

export async function updateEmployee(id: string, input: EmployeeInput, actorId: string): Promise<EmployeeRecord> {
  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.employee.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Employee not found.');
    const { data, passwordHash, newDepartment } = await normalize(tx, input, previous);
    if (data.payrollId !== previous.payrollId) await assertEmployeeIdFree(tx, data.payrollId, id);

    if (data.role !== (previous.role ?? null)) {
      if (id === actor.id) throw new ConflictError("You can't change your own role.");
      if (data.role !== UserRole.SYSTEM_ADMIN) await assertAdminRemains(tx, previous);
    }

    const updated = await tx.employee.update({
      where: { id },
      data: { ...data, ...(passwordHash ? { password: passwordHash } : {}), ...(passwordHash ? { mustChangePassword: true } : {}), ...(data.role ? {} : { password: null, mustChangePassword: false }) },
      include: { _count: { select: HELD_ITEMS } },
    });
    const before = auditView(previous);
    const after = auditView(updated);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
    if (changed.length > 0 || passwordHash) {
      const summary = [...changed, ...(passwordHash ? ['password'] : [])].join(', ');
      await audit(tx, actor, 'UPDATE_EMPLOYEE', id, `Updated ${updated.fullNameEn}: ${summary}.${newDepartment ? ` New department: ${newDepartment}.` : ''}`, before, {
        ...after,
        ...(passwordHash ? { passwordChanged: true } : {}),
      });
    }
    return toRecord(updated, true);
  });
}

export async function setEmployeeActive(id: string, active: unknown, actorId: string): Promise<EmployeeRecord> {
  if (typeof active !== 'boolean') throw new BadRequestError('Say whether the employee should be active.');
  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const previous = await tx.employee.findUnique({ where: { id }, include: { _count: { select: HELD_ITEMS } } });
    if (!previous) throw new NotFoundError('Employee not found.');
    if (previous.isActive === active) return toRecord(previous, true);

    if (!active) {
      if (id === actor.id) throw new ConflictError("You can't deactivate your own account.");
      await assertAdminRemains(tx, previous);
      const held = previous._count?.custodiedItems ?? 0;
      if (held > 0) {
        throw new ConflictError(
          `${previous.fullNameEn} still holds ${held} ${held === 1 ? 'item' : 'items'}. Transfer or return ${held === 1 ? 'it' : 'them'} first.`,
        );
      }
      const pending = await tx.transactionApproval.count({
        where: { status: 'PENDING' as any, OR: [{ recipientEmployeeId: id }, { requestedById: id }] },
      });
      if (pending > 0) {
        throw new ConflictError(
          `${previous.fullNameEn} is named on ${pending} pending ${pending === 1 ? 'request' : 'requests'}. Finish or reject ${pending === 1 ? 'it' : 'them'} first.`,
        );
      }
    }

    const updated = await tx.employee.update({
      where: { id },
      data: { isActive: active },
      include: { _count: { select: HELD_ITEMS } },
    });
    await audit(
      tx,
      actor,
      active ? 'REACTIVATE_EMPLOYEE' : 'DEACTIVATE_EMPLOYEE',
      id,
      `${active ? 'Reactivated' : 'Deactivated'} ${updated.fullNameEn} (${updated.payrollId}).`,
      { isActive: previous.isActive },
      { isActive: active },
    );
    return toRecord(updated, true);
  });
}

// ─── Import from an HR spreadsheet ───────────────────────────────────────────

/** One spreadsheet row; `department` is a department code or name (HR's main work unit) */
export interface EmployeeImportRow {
  row: number;
  payrollId?: unknown;
  fullNameEn?: unknown;
  fullNameAm?: unknown;
  department?: unknown;
  jobTitle?: unknown;
  unit?: unknown;
  gender?: unknown;
  email?: unknown;
  phone?: unknown;
}

export type EmployeeImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface EmployeeImportResult {
  applied: boolean;
  counts: Record<EmployeeImportAction, number>;
  /** Departments in the file that don't exist yet; the import creates them */
  newDepartments: string[];
  rows: {
    row: number;
    payrollId: string;
    fullNameEn: string;
    department: string;
    action: EmployeeImportAction;
    /** Fields that change, for updates */
    changes?: string[];
    /** Why the row is skipped, for errors */
    message?: string;
    /** The existing employee is deactivated; details still update */
    inactive?: boolean;
  }[];
}

export const MAX_IMPORT_ROWS = 5000;

const DETAIL_FIELDS = ['payrollId', 'fullNameEn', 'fullNameAm', 'departmentId', 'jobTitle', 'unit', 'gender', 'email', 'phone'] as const;
type DetailField = (typeof DETAIL_FIELDS)[number];
const FIELD_LABELS: Record<DetailField, string> = {
  payrollId: 'employee ID',
  fullNameEn: 'name',
  fullNameAm: 'Amharic name',
  departmentId: 'department',
  jobTitle: 'job title',
  unit: 'unit',
  gender: 'gender',
  email: 'email',
  phone: 'phone',
};

const cellText = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
const matchKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Checks HR rows and, when `apply` is true, saves them. Rows are matched to existing staff by employee ID:
 * new IDs are added (without sign-in), known ones get their details updated, and rows with problems are
 * skipped and reported. Departments named in the file that don't exist yet are created.
 * Sign-in and active / deactivated status are never changed here.
 */
export async function importEmployees(rawRows: unknown, apply: unknown, actorId: string): Promise<EmployeeImportResult> {
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw new BadRequestError('The file has no employee rows.');
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new BadRequestError(`Import at most ${MAX_IMPORT_ROWS.toLocaleString()} employees at a time; split the file.`);
  }
  const rows = rawRows as EmployeeImportRow[];

  const run = async (tx: any): Promise<EmployeeImportResult> => {
    const actor = await loadActor(tx, actorId);
    const [departments, existing] = await Promise.all([tx.department.findMany(), tx.employee.findMany()]);

    const deptByKey = new Map<string, any>();
    for (const d of departments) {
      for (const k of [d.id, d.code, d.nameEn, d.nameAm]) if (k) deptByKey.set(matchKey(k), d);
    }
    const byPayroll = new Map<string, any>(existing.map((e: any) => [matchKey(e.payrollId), e]));
    const byEmail = new Map<string, any>(existing.filter((e: any) => e.email).map((e: any) => [matchKey(e.email), e]));
    const seenPayroll = new Map<string, number>();
    const seenEmail = new Map<string, number>();

    const result: EmployeeImportResult = { applied: false, counts: { create: 0, update: 0, unchanged: 0, error: 0 }, newDepartments: [], rows: [] };
    // Departments the file names that don't exist yet, keyed like deptByKey
    const newDepts = new Map<string, any>();
    const usedCodes = new Set<string>(departments.map((d: any) => String(d.code).toUpperCase()));
    const planDepartment = (name: string) => {
      const dept = { ...newDepartmentRow(name, usedCodes), isNew: true };
      newDepts.set(matchKey(name), dept);
      deptByKey.set(matchKey(name), dept);
      return dept;
    };
    const toCreate: any[] = [];
    const toUpdate: { id: string; payrollId: string; data: Record<string, unknown> }[] = [];

    for (const raw of rows) {
      const rowNo = Number(raw?.row) || 0;
      const payrollId = cellText(raw?.payrollId);
      const departmentText = cellText(raw?.department);
      const base = { row: rowNo, payrollId, fullNameEn: cellText(raw?.fullNameEn), department: departmentText };
      const fail = (message: string) => {
        result.rows.push({ ...base, action: 'error', message });
        result.counts.error++;
      };

      if (departmentText.length > 160) {
        fail('Department must be 160 characters or fewer.');
        continue;
      }
      const knownDept = departmentText ? deptByKey.get(matchKey(departmentText)) : undefined;
      let details: ReturnType<typeof checkDetails>;
      try {
        details = checkDetails({
          payrollId,
          fullNameEn: raw?.fullNameEn,
          fullNameAm: raw?.fullNameAm,
          // Checked before a missing department is planned, so a bad row never creates one
          departmentId: knownDept?.id ?? (departmentText ? 'NEW' : ''),
          jobTitle: raw?.jobTitle,
          unit: raw?.unit,
          gender: raw?.gender,
          email: raw?.email,
          phone: cellText(raw?.phone) || undefined,
        });
      } catch (err: any) {
        fail(err.message);
        continue;
      }
      const pKey = matchKey(details.payrollId);
      if (seenPayroll.has(pKey)) {
        fail(`Employee ID ${details.payrollId} is also on row ${seenPayroll.get(pKey)}.`);
        continue;
      }
      seenPayroll.set(pKey, rowNo);

      const current = byPayroll.get(pKey);
      if (details.email) {
        const eKey = matchKey(details.email);
        const owner = byEmail.get(eKey);
        if (seenEmail.has(eKey)) {
          fail(`Email ${details.email} is also on row ${seenEmail.get(eKey)}.`);
          continue;
        }
        if (owner && owner.id !== current?.id) {
          fail(`Email ${details.email} already belongs to ${owner.fullNameEn} (${owner.payrollId}).`);
          continue;
        }
        seenEmail.set(eKey, rowNo);
      }

      // The row is good: use its department, planning a new one if the file names one we don't have
      const dept = knownDept ?? planDepartment(departmentText.replace(/\s+/g, ' '));
      details.departmentId = dept.id;
      base.department = dept.nameEn;

      if (!current) {
        toCreate.push({ id: `EMP-${randomUUID().slice(0, 8).toUpperCase()}`, ...details, fullNameAm: details.fullNameAm ?? '', role: null, password: null, isActive: true });
        result.rows.push({ ...base, action: 'create' });
        result.counts.create++;
        continue;
      }
      // An empty cell keeps what is saved, so a partial HR sheet never wipes details
      const update: Record<string, unknown> = {};
      for (const field of DETAIL_FIELDS) {
        const value = (details as any)[field];
        if (value === null || field === 'payrollId') continue;
        if (value !== (current[field] ?? null)) update[field] = value;
      }
      const changes = Object.keys(update).map((f) => FIELD_LABELS[f as DetailField]);
      const inactive = current.isActive === false ? { inactive: true } : {};
      if (changes.length === 0) {
        result.rows.push({ ...base, action: 'unchanged', ...inactive });
        result.counts.unchanged++;
      } else {
        toUpdate.push({ id: current.id, payrollId: current.payrollId, data: update });
        result.rows.push({ ...base, action: 'update', changes, ...inactive });
        result.counts.update++;
      }
    }

    // Only departments that a saved row uses are created
    const usedDeptIds = new Set<string>([...toCreate.map((e) => e.departmentId), ...toUpdate.map((u) => u.data.departmentId as string).filter(Boolean)]);
    const deptsToCreate = [...newDepts.values()].filter((d) => usedDeptIds.has(d.id));
    result.newDepartments = deptsToCreate.map((d) => d.nameEn);

    if (apply === true && (toCreate.length > 0 || toUpdate.length > 0)) {
      if (deptsToCreate.length > 0) {
        await tx.department.createMany({ data: deptsToCreate.map(({ id, code, nameEn, nameAm }) => ({ id, code, nameEn, nameAm })) });
      }
      if (toCreate.length > 0) await tx.employee.createMany({ data: toCreate });
      for (const u of toUpdate) await tx.employee.update({ where: { id: u.id }, data: u.data });
      await audit(
        tx,
        actor,
        'IMPORT_EMPLOYEES',
        actor.id,
        `Imported staff from a spreadsheet: ${toCreate.length} added, ${toUpdate.length} updated, ${result.counts.error} rows skipped, ${deptsToCreate.length} departments created.`,
        undefined,
        { added: toCreate.map((e) => e.payrollId), updated: toUpdate.map((u) => u.payrollId), departmentsCreated: result.newDepartments },
      );
      result.applied = true;
    }
    return result;
  };

  // Checking needs no transaction; saving runs in one, so a failure saves nothing
  if (apply !== true) return run(prisma);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(run, { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 10_000 });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictError('Another employee with the same payroll ID or email was saved meanwhile. Check the file again.');
      }
      if (error?.code !== 'P2034') throw error;
      if (attempt === 2) throw new ConflictError('Another change was saved at the same time. Try the import again.');
    }
  }
  throw new ConflictError('Please try the import again.');
}
