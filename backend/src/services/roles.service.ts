import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/app-error';
import { getTodayGcAndEc } from '../utils/eth-date';
import {
  hasPermission,
  isUserRole,
  PERMISSION_GROUPS,
  ROLE_POLICY,
  getEffectiveRolePermissions,
  setRolePermissions,
  resetRolePermissions,
  PROTECTED_ROLE_PERMISSIONS,
  Permission,
} from '../security/role-policy';
import { UserRole } from '../types/asset-management';

export async function getRoleDirectory() {
  const counts = await prisma.employee.groupBy({ by: ['role'], _count: { _all: true } });
  return {
    permissionGroups: PERMISSION_GROUPS,
    roles: Object.entries(ROLE_POLICY).map(([code, policy]) => ({
      code,
      ...policy,
      permissions: getEffectiveRolePermissions(code as UserRole),
      system: true,
      memberCount: counts.find((row) => row.role === code)?._count._all ?? 0,
    })),
  };
}

export async function assignEmployeeRole(id: string, role: unknown, actorId: string) {
  if (!isUserRole(role)) throw new BadRequestError('Choose one of the five system roles.');
  if (!actorId) throw new ForbiddenError('Only System Administrators may assign roles.');

  // Serializable isolation prevents two concurrent demotions removing the last administrators.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const actor = await tx.employee.findUnique({ where: { id: actorId } });
        if (!hasPermission(actor?.role, 'roles.assign')) throw new ForbiddenError('Only System Administrators may assign roles.');
        const previous = await tx.employee.findUnique({ where: { id } });
        if (!previous) throw new NotFoundError('Employee not found.');
        if (previous.role === role) return previous;
        if (previous.role === UserRole.SYSTEM_ADMIN && role !== UserRole.SYSTEM_ADMIN) {
          const admins = await tx.employee.count({ where: { role: UserRole.SYSTEM_ADMIN } });
          if (admins <= 1) throw new ConflictError('The last System Administrator cannot be reassigned. Assign another administrator first.');
        }
        const updated = await tx.employee.update({ where: { id }, data: { role } });
        const today = getTodayGcAndEc();
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        await tx.auditLog.create({ data: {
          timestampGc: `${today.gc} ${time}`, timestampEc: `${today.ec} ${time}`,
          userId: actor.id, userName: actor.fullNameEn, userRole: actor.role,
          action: 'UPDATE_STAFF_ROLE', entityType: 'USER', entityId: id,
          details: `Role for ${previous.fullNameEn} changed from ${previous.role} to ${role}.`,
          previousState: { role: previous.role }, newState: { role },
        } });
        return updated;
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error.code !== 'P2034') throw error;
      if (attempt === 2) throw new ConflictError('Another role change occurred at the same time. Refresh and try again.');
    }
  }
  throw new ConflictError('Please retry the role change.');
}

export async function updateRolePermissions(
  role: unknown,
  permissions: unknown,
  actorId: string
) {
  if (!isUserRole(role)) {
    throw new BadRequestError('Invalid role specified.');
  }
  if (!Array.isArray(permissions)) {
    throw new BadRequestError('Permissions must be an array of permission keys.');
  }

  const allKnownPermissions = new Set<string>(
    PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))
  );
  for (const perm of permissions) {
    if (typeof perm !== 'string' || !allKnownPermissions.has(perm)) {
      throw new BadRequestError(`Unknown permission: ${perm}`);
    }
  }

  if (role === UserRole.SYSTEM_ADMIN) {
    const missing = PROTECTED_ROLE_PERMISSIONS.SYSTEM_ADMIN?.filter((p) => !permissions.includes(p)) ?? [];
    if (missing.length > 0) {
      throw new BadRequestError(
        `Cannot revoke core administrative permissions (${missing.join(', ')}) from System Administrator.`
      );
    }
  }

  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || !hasPermission(actor.role, 'roles.assign')) {
    throw new ForbiddenError('Only System Administrators may modify role permissions.');
  }

  const previousPermissions = getEffectiveRolePermissions(role);
  setRolePermissions(role, permissions as Permission[]);

  try {
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    await prisma.auditLog.create({
      data: {
        timestampGc: `${today.gc} ${time}`,
        timestampEc: `${today.ec} ${time}`,
        userId: actor.id,
        userName: actor.fullNameEn,
        userRole: actor.role,
        action: 'UPDATE_ROLE_PERMISSIONS',
        entityType: 'USER',
        entityId: actor.id,
        details: `Permissions updated for role ${role}. Granted: ${permissions.length}, Previous: ${previousPermissions.length}.`,
        previousState: { role, permissions: previousPermissions },
        newState: { role, permissions },
      },
    });
  } catch (err) {
    console.error('Audit log creation failed for permission update:', err);
  }

  return await getRoleDirectory();
}

export async function resetRolePermissionsToDefault(
  role: unknown,
  actorId: string
) {
  if (!isUserRole(role)) {
    throw new BadRequestError('Invalid role specified.');
  }
  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || !hasPermission(actor.role, 'roles.assign')) {
    throw new ForbiddenError('Only System Administrators may modify role permissions.');
  }

  const previousPermissions = getEffectiveRolePermissions(role);
  const defaultPermissions = resetRolePermissions(role);

  try {
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    await prisma.auditLog.create({
      data: {
        timestampGc: `${today.gc} ${time}`,
        timestampEc: `${today.ec} ${time}`,
        userId: actor.id,
        userName: actor.fullNameEn,
        userRole: actor.role,
        action: 'RESET_ROLE_PERMISSIONS',
        entityType: 'USER',
        entityId: actor.id,
        details: `Reset permissions for role ${role} to default policy.`,
        previousState: { role, permissions: previousPermissions },
        newState: { role, permissions: defaultPermissions },
      },
    });
  } catch (err) {
    console.error('Audit log creation failed for permission reset:', err);
  }

  return await getRoleDirectory();
}
