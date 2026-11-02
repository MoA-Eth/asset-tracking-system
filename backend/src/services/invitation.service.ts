import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/app-error';
import { isUserRole, ROLE_POLICY } from '../security/role-policy';
import { hashPassword } from '../security/credentials';
import { checkNewPassword, publicView, audit } from './access.service';
import { deliverUserInvitation } from './email.service';
import { UserRole } from '../types/asset-management';

const DEFAULT_INVITATION_HOURS = 48;

export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Invites an employee to sign in by assigning their role, generating a secure token,
 * and dispatching an MoA-branded invitation email.
 */
export async function inviteUser(
  employeeId: string,
  input: { role?: unknown; email?: unknown },
  actorId: string,
  baseUrl: string,
) {
  if (!isUserRole(input.role)) throw new BadRequestError('Choose a valid role.');
  const role = input.role as UserRole;

  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || actor.isActive === false || actor.role !== UserRole.SYSTEM_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw new BadRequestError('Only System Administrators can send user invitations.');
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError('Employee not found.');
  if (employee.isActive === false) {
    throw new ConflictError(`${employee.fullNameEn} is deactivated. Reactivate them under Settings → Employees first.`);
  }

  const targetEmail = typeof input.email === 'string' && input.email.trim()
    ? input.email.trim().toLowerCase()
    : employee.email?.trim().toLowerCase();

  if (!targetEmail) {
    throw new BadRequestError('An email address is required to send an invitation.');
  }

  // Update employee with role and email if provided
  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      role,
      email: targetEmail,
      mustChangePassword: true,
    },
  });

  // Remove any previous pending tokens for this employee
  await prisma.userInvitationToken.deleteMany({ where: { employeeId } });

  // Generate new invitation token
  const token = generateOpaqueToken();
  const hours = Number(process.env.USER_INVITATION_HOURS) || DEFAULT_INVITATION_HOURS;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);

  await prisma.userInvitationToken.create({
    data: {
      employeeId,
      tokenHash: token.hash,
      expiresAt,
    },
  });

  const invitationUrl = `${baseUrl.replace(/\/+$/, '')}/create-password?token=${encodeURIComponent(token.raw)}`;

  await deliverUserInvitation({
    email: targetEmail,
    displayName: employee.fullNameEn,
    role,
    invitationUrl,
    expiresHours: hours,
  });

  await audit(
    prisma,
    actor,
    'INVITE_USER',
    employeeId,
    `Invitation sent to ${employee.fullNameEn} (${targetEmail}) for role ${ROLE_POLICY[role]?.name || role}.`,
    { role: employee.role, email: employee.email },
    { role, email: targetEmail },
  );

  return {
    employee: publicView(updated),
    invitationLink: invitationUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Validates an invitation token from the URL and returns the associated employee info.
 */
export async function verifyInvitationToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new BadRequestError('Missing invitation token.');
  }

  const tokenHash = hashInvitationToken(rawToken);
  const token = await prisma.userInvitationToken.findUnique({
    where: { tokenHash },
    include: { employee: true },
  });

  if (!token) {
    throw new BadRequestError('Invalid or expired invitation link. Please request a new invitation from your administrator.');
  }

  if (token.expiresAt < new Date()) {
    await prisma.userInvitationToken.delete({ where: { id: token.id } });
    throw new BadRequestError('This invitation link has expired. Please ask your administrator to send a new invitation.');
  }

  if (!token.employee || token.employee.isActive === false) {
    throw new BadRequestError('This account is no longer active.');
  }

  return {
    valid: true,
    employee: {
      id: token.employee.id,
      fullNameEn: token.employee.fullNameEn,
      fullNameAm: token.employee.fullNameAm,
      payrollId: token.employee.payrollId,
      email: token.employee.email,
      role: token.employee.role,
    },
    expiresAt: token.expiresAt.toISOString(),
  };
}

/**
 * Accepts an invitation token, sets the permanent password, clears all tokens, and activates account.
 */
export async function acceptInvitationAndSetPassword(rawToken: string, newPassword: unknown) {
  const validPassword = checkNewPassword(newPassword, 'Password');

  if (!rawToken || typeof rawToken !== 'string') {
    throw new BadRequestError('Missing invitation token.');
  }

  const tokenHash = hashInvitationToken(rawToken);
  const token = await prisma.userInvitationToken.findUnique({
    where: { tokenHash },
    include: { employee: true },
  });

  if (!token) {
    throw new BadRequestError('Invalid or expired invitation link.');
  }

  if (token.expiresAt < new Date()) {
    await prisma.userInvitationToken.delete({ where: { id: token.id } });
    throw new BadRequestError('This invitation link has expired.');
  }

  const hashedPassword = await hashPassword(validPassword);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: token.employeeId },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        isActive: true,
      },
    });

    await tx.userInvitationToken.deleteMany({
      where: { employeeId: token.employeeId },
    });

    await audit(
      tx,
      updated,
      'ACCEPT_INVITATION',
      updated.id,
      `${updated.fullNameEn} accepted invitation and activated account with role ${updated.role}.`,
    );

    return {
      success: true,
      message: 'Password successfully created. You can now sign in to MoA Asset Tracking System.',
      employee: publicView(updated),
    };
  });
}

