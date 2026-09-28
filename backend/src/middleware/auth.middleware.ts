import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';
import { UserRole, AuthUser } from '../types/asset-management';
import { asyncHandler } from './async-handler';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const authService = AuthService.getInstance();

export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = await authService.verifyToken(token);
    } catch {
      // ignore in optional mode
    }
  }
  next();
});

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization header missing or invalid format (Bearer <token> required).');
  }

  const token = authHeader.split(' ')[1];
  const user = await authService.verifyToken(token);
  req.user = user;
  next();
});

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('User authentication required before role evaluation.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access denied. Role "${req.user.role}" does not have statutory clearance for this action. Allowed: ${allowedRoles.join(', ')}`
      );
    }

    next();
  };
};
