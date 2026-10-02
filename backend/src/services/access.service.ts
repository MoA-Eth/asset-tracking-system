import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import { hasPermission, isUserRole, ROLE_POLICY } from '../security/role-policy';
import { hashPassword, verifyPassword } from '../security/credentials';
import { UserRole } from '../types/asset-management';

/**
 * Sign-in access: who can sign in, with which role, and their passwords.
 * A password set by an administrator is temporary: the person must choose their own at the next sign-in.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Returns the password if it is acceptable; throws a message the person can act on otherwise */
export function checkNewPassword(value: unknown, label = 'The password'): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (value.length > 128) throw new BadRequestError(`${label} must be 128 characters or fewer.`);
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new BadRequestError(`${label} must have at least one letter and one number.`);
  }
  return value;
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

async function loadAdmin(tx: any, actorId: string) {
  const actor = actorId ? await tx.employee.findUnique({ where: { id: actorId } }) : null;
  if (!actor || actor.isActive === false || !hasPermission(actor.role, 'roles.assign')) {
    throw new ForbiddenError('Only System Administrators can manage sign-in access.');
  }
  return actor;
}

async function assertAdminRemains(tx: any, previous: any) {
  if (previous.role !== UserRole.SYSTEM_ADMIN || previous.isActive === false) return;
  const admins = await tx.employee.count({ where: { role: UserRole.SYSTEM_ADMIN, isActive: true } });
  if (admins <= 1) throw new ConflictError('This is the last active System Administrator. Give another employee that role first.');
}

const publicView = (e: any) => ({
  id: e.id,
  payrollId: e.payrollId,
  fullNameEn: e.fullNameEn,
  fullNameAm: e.fullNameAm,
  departmentId: e.departmentId,
  jobTitle: e.jobTitle ?? null,
  unit: e.unit ?? null,
  email: e.email ?? null,
  phone: e.phone ?? null,
  role: (e.role ?? null) as UserRole | null,
  isActive: e.isActive !== false,
  mustChangePassword: e.mustChangePassword === true,
});

/**
 * Gives an employee sign-in access with a role and a temporary password,
 * or changes the role of someone who already signs in (a password is then optional).
 */
export async function grantAccess(id: string, input: { role?: unknown; password?: unknown }, actorId: string) {
  if (!isUserRole(input.role)) throw new BadRequestError('Choose a role.');
  const role = input.role;
  return prisma.$transaction(async (tx) => {
    const actor = await loadAdmin(tx, actorId);
    const previous = await tx.employee.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Employee not found.');
    if (previous.isActive === false) throw new ConflictError(`${previous.fullNameEn} is deactivated. Reactivate them under Settings → Employees first.`);

    const needsPassword = !previous.password;
    const hasNewPassword = input.password !== undefined && input.password !== null && input.password !== '';
    if (needsPassword && !hasNewPassword) throw new BadRequestError('Set a temporary password so they can sign in.');
    const password = hasNewPassword ? await hashPassword(checkNewPassword(input.password, 'The temporary password')) : undefined;

    if (previous.role && previous.role !== role) {
      if (id === actor.id) throw new ConflictError("You can't change your own role.");
      if (role !== UserRole.SYSTEM_ADMIN) await assertAdminRemains(tx, previous);
    }

    const updated = await tx.employee.update({
      where: { id },
      data: { role, ...(password ? { password, mustChangePassword: true } : {}) },
    });
    await audit(
      tx,
      actor,
      previous.role ? 'UPDATE_STAFF_ROLE' : 'GRANT_ACCESS',
      id,
      previous.role
        ? `Role for ${previous.fullNameEn} changed from ${previous.role} to ${role}.${password ? ' Password reset.' : ''}`
        : `${previous.fullNameEn} (${previous.payrollId}) can now sign in as ${ROLE_POLICY[role].name}.`,
      { role: previous.role ?? null },
      { role, ...(password ? { passwordChanged: true } : {}) },
    );
    return publicView(updated);
  });
}

/** Takes away sign-in. The employee stays on the staff list and keeps any items they hold. */
export async function removeAccess(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await loadAdmin(tx, actorId);
    const previous = await tx.employee.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Employee not found.');
    if (!previous.role) return publicView(previous);
    if (id === actor.id) throw new ConflictError("You can't remove your own sign-in.");
    await assertAdminRemains(tx, previous);
    const pending = await tx.transactionApproval.count({ where: { status: 'PENDING' as any, requestedById: id } });
    if (pending > 0) {
      throw new ConflictError(`${previous.fullNameEn} has ${pending} pending ${pending === 1 ? 'request' : 'requests'}. Finish or reject ${pending === 1 ? 'it' : 'them'} first.`);
    }
    const updated = await tx.employee.update({ where: { id }, data: { role: null, password: null, mustChangePassword: false } });
    await audit(tx, actor, 'REMOVE_ACCESS', id, `${previous.fullNameEn} (${previous.payrollId}) can no longer sign in.`, { role: previous.role }, { role: null });
    return publicView(updated);
  });
}

/** Sets a new temporary password for someone who signs in; they choose their own at the next sign-in */
export async function resetPassword(id: string, password: unknown, actorId: string) {
  const hash = await hashPassword(checkNewPassword(password, 'The temporary password'));
  return prisma.$transaction(async (tx) => {
    const actor = await loadAdmin(tx, actorId);
    const previous = await tx.employee.findUnique({ where: { id } });
    if (!previous) throw new NotFoundError('Employee not found.');
    if (!previous.role) throw new ConflictError(`${previous.fullNameEn} has no sign-in. Give them access first.`);
    // An administrator changes their own password with their current one, like everyone else
    if (id === actor.id) throw new ConflictError('Use "Change password" to change your own password.');
    const updated = await tx.employee.update({ where: { id }, data: { password: hash, mustChangePassword: true } });
    await audit(tx, actor, 'RESET_PASSWORD', id, `Password reset for ${previous.fullNameEn} (${previous.payrollId}).`, undefined, { passwordChanged: true });
    return publicView(updated);
  });
}

/** A signed-in person replaces their own password; this also clears a temporary one */
export async function changeOwnPassword(userId: string, current: unknown, next: unknown): Promise<void> {
  const employee = await prisma.employee.findUnique({ where: { id: userId } });
  if (!employee || employee.isActive === false || !employee.role || !employee.password) {
    throw new UnauthorizedError('This account no longer has system access.');
  }
  if (typeof current !== 'string' || !(await verifyPassword(current, employee.password))) {
    throw new BadRequestError('Your current password is not correct.');
  }
  const password = checkNewPassword(next, 'Your new password');
  if (password === current) throw new BadRequestError('Choose a password that is different from your current one.');
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: userId }, data: { password: await hashPassword(password), mustChangePassword: false } });
    await audit(tx, employee, 'CHANGE_PASSWORD', userId, `${employee.fullNameEn} changed their password.`, undefined, { passwordChanged: true });
  });
}
