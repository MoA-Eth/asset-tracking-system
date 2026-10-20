import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';
import { UserRole, AuthUser } from '../types/asset-management';
import { asyncHandler } from './async-handler';
import { hasPermission, Permission } from '../security/role-policy';
import { isValidApiKey } from './api-key.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      isExternalApp?: boolean; // Added to track external API calls
    }
  }
}

const authService = AuthService.getInstance();

export const requirePermission = (...permissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. If the request is from the external app, bypass human role checks
    if (req.isExternalApp) {
      return next();
    }

    // 2. Normal human user checks
    if (!req.user) throw new UnauthorizedError('Authentication is required.');
    if (!permissions.some((permission) => hasPermission(req.user!.role, permission))) {
      throw new ForbiddenError('Your role does not permit this action.');
    }
    next();
  };
};

export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  // Check for API key first
  if (isValidApiKey(req)) {
    req.isExternalApp = true;
    return next();
  }

  // Fallback to optional Bearer token
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
  
  // ⚡ 1. Check for External API Key FIRST ⚡
  if (isValidApiKey(req)) {
    req.isExternalApp = true;
    return next(); // Let the request pass, bypassing JWT
  }

  // ⚡ 2. Fallback to normal Human JWT Auth ⚡
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization header missing or invalid format (Bearer <token> or X-API-Key required).');
  }

  const token = authHeader.split(' ')[1];
  const user = await authService.verifyToken(token);
  req.user = user;
  
  if (user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
    throw new ForbiddenError('Choose a new password before continuing.');
  }
  
  next();
});

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. Bypass role checks for external API integrations
    if (req.isExternalApp) {
      return next();
    }

    // 2. Normal human role checks
    if (!req.user) {
      throw new UnauthorizedError('User authentication required before role evaluation.');
    }

    if (req.user.role === UserRole.SUPER_ADMIN || allowedRoles.includes(req.user.role)) {
      return next();
    }

    throw new ForbiddenError(
      `Access denied. Role "${req.user.role}" does not have statutory clearance for this action. Allowed: ${allowedRoles.join(', ')}`
    );
  };
};