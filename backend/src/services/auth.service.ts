import { AuthUser, LoginRequest, AuthResponse, UserRole } from '../types/asset-management';
import { UnauthorizedError, NotFoundError } from '../errors/app-error';
import { prisma } from '../lib/prisma';

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
    const roles = [UserRole.TOP_MANAGEMENT, UserRole.DEPARTMENT_HEAD, UserRole.DATA_ENCODER];
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

    // Try persona role shortcut first
    if (req.personaRole) {
      matched = await prisma.employee.findFirst({
        where: { role: req.personaRole as any },
        orderBy: { id: 'asc' },
      });
    }

    // Then try email / payrollId
    if (!matched && req.usernameOrEmail) {
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

    // Validate password (plain-text for now)
    if (req.password && matched.password !== req.password) {
      throw new UnauthorizedError('Incorrect password.');
    }

    const authUser = this.toAuthUser(matched);
    const token = this.generateToken(authUser);
    return { user: authUser, token };
  }

  public async verifyToken(tokenString: string): Promise<AuthUser> {
    if (!tokenString) throw new UnauthorizedError('Authentication token missing.');

    try {
      const decoded = Buffer.from(tokenString, 'base64').toString('utf8');
      const [userId] = decoded.split(':');
      if (!userId) throw new UnauthorizedError('Malformed authentication token.');

      const employee = await prisma.employee.findUnique({ where: { id: userId } });
      if (!employee) throw new NotFoundError('User associated with token no longer exists.');

      return this.toAuthUser(employee);
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof NotFoundError) throw err;
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }
  }

  private generateToken(user: AuthUser): string {
    const payload = `${user.id}:${user.role}:${Date.now()}`;
    return Buffer.from(payload).toString('base64');
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
    };
  }
}
