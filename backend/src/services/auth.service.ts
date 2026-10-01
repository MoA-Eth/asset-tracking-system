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

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async getPersonas(): Promise<AuthUser[]> {
    const roles = [UserRole.MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.DATA_ENCODER];
    const employees = await Promise.all(
      roles.map((role) =>
        prisma.employee.findFirst({ where: { role: role as any } })
      )
    );
    return employees
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map(this.toAuthUser);
  }

  public async login(req: LoginRequest): Promise<AuthResponse> {
    let matched: any = null;

    if (req.personaRole || typeof req.password !== 'string' || !req.password || req.password.length > 1024) {
      throw new UnauthorizedError('Email or payroll ID and password are required.');
    }

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

    if (!matched) {
      throw new UnauthorizedError('Invalid credentials. Please provide a valid MoA email or payroll ID.');
    }

    if (!await verifyPassword(req.password, matched.password)) {
      throw new UnauthorizedError('Invalid credentials.');
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

    let userId: string;
    let isLegacy = false;
    try {
      userId = readSessionToken(tokenString);
    } catch (tokenErr) {
      // Backward compatibility with legacy base64 format (e.g. userId:role:timestamp)
      try {
        const decoded = Buffer.from(tokenString, 'base64').toString('utf8');
        const [extracted] = decoded.split(':');
        if (!extracted) throw tokenErr;
        userId = extracted;
        isLegacy = true;
      } catch {
        throw tokenErr;
      }
    }

    try {
      const employee = await prisma.employee.findUnique({ where: { id: userId } });
      if (!employee) {
        if (isLegacy) {
          throw new NotFoundError('User associated with token no longer exists.');
        }
        throw new UnauthorizedError('This account is no longer available. Please sign in again.');
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
      ...getRoleAccess(emp.role),
    };
  }
}
