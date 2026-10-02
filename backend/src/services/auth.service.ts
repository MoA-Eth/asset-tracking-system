import { AuthUser, LoginRequest, AuthResponse, UserRole } from '../types/asset-management';
import {
  UnauthorizedError,
  NotFoundError,
  ServiceUnavailableError,
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from '../errors/app-error';
import { prisma } from '../lib/prisma';
import { createSessionToken, readSessionToken, hashPassword, verifyPassword } from '../security/credentials';
import { getRoleAccess } from '../security/role-policy';
import { assertSignInAllowed, recordSignInFailure, recordSignInSuccess } from '../security/login-throttle';

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /** `address` is the client's network address, used to limit repeated failed attempts */
  public async login(req: LoginRequest, address = 'unknown'): Promise<AuthResponse> {
    let matched: any = null;

    if ((req as any).personaRole || typeof req.password !== 'string' || !req.password || req.password.length > 1024) {
      throw new UnauthorizedError('Email or payroll ID and password are required.');
    }
    const username = typeof req.usernameOrEmail === 'string' ? req.usernameOrEmail : '';
    assertSignInAllowed(username, address);

    // Then try email / payrollId
    if (typeof req.usernameOrEmail === 'string' && req.usernameOrEmail.trim()) {
      const query = req.usernameOrEmail.trim().toLowerCase();
      matched = await prisma.employee.findFirst({
        where: {
          OR: [
            { email: { equals: query, mode: 'insensitive' } },
            { payrollId: { equals: query, mode: 'insensitive' } },
          ],
        },
      });
    }

    // The same message whether the account or the password is wrong, so accounts can't be discovered
    if (!matched || !matched.password || !await verifyPassword(req.password, matched.password)) {
      recordSignInFailure(username, address);
      throw new UnauthorizedError('The email / employee ID or password is not correct.');
    }
    recordSignInSuccess(username);
    // Checked after the password, so these messages don't reveal which accounts exist
    if (matched.isActive === false) {
      throw new UnauthorizedError('This account has been deactivated. Contact your System Administrator.');
    }
    if (!matched.role) {
      throw new UnauthorizedError('This employee has no system access. Ask your System Administrator for a role.');
    }
    if (!matched.password.startsWith('scrypt$')) {
      await prisma.employee.updateMany({
        where: { id: matched.id, password: matched.password },
        data: { password: await hashPassword(req.password) },
      });
    }

    const authUser = this.toAuthUser(matched);
    const token = this.generateToken(authUser);
    return { user: authUser, token };
  }

  public async verifyToken(tokenString: string): Promise<AuthUser> {
    if (!tokenString) throw new UnauthorizedError('Authentication token missing.');

    // Only signed tokens are accepted. Older unsigned tokens could be made by hand for any user,
    // so anyone still holding one is asked to sign in again (401).
    const userId = readSessionToken(tokenString);

    try {
      const employee = await prisma.employee.findUnique({ where: { id: userId } });
      if (!employee) {
        throw new UnauthorizedError('This account is no longer available. Please sign in again.');
      }
      // Deactivating an employee or removing their role ends their sessions straight away
      if (employee.isActive === false || !employee.role) {
        throw new UnauthorizedError('This account no longer has system access.');
      }

      return this.toAuthUser(employee);
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof NotFoundError) throw err;
      // A database outage is not a bad session; don't make the user think they were signed out
      if (isDatabaseUnavailableError(err)) throw new ServiceUnavailableError(DATABASE_UNAVAILABLE_MESSAGE);
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }
  }

  private generateToken(user: AuthUser): string {
    return createSessionToken(user.id);
  }

  private toAuthUser(emp: any): AuthUser {
    return {
      id: emp.id,
      payrollId: emp.payrollId,
      fullNameEn: emp.fullNameEn,
      fullNameAm: emp.fullNameAm,
      email: emp.email,
      phone: emp.phone,
      role: emp.role as UserRole,
      departmentId: emp.departmentId,
      mustChangePassword: emp.mustChangePassword === true,
      ...getRoleAccess(emp.role),
    };
  }
}
