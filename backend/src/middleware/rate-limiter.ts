import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/api-response';

/**
 * Global rate limiter for /api endpoints.
 * Protects against aggressive scraping, request floods, and DoS.
 * 300 requests per 1 minute window per IP address.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (req.path === '/api/health' || req.originalUrl === '/api/health') return true;
    if (req.path.startsWith('/api/docs') || req.originalUrl.startsWith('/api/docs')) return true;
    return false;
  },
  handler: (_req: Request, res: Response) => {
    sendError(res, 'Too many requests from this network address. Please slow down and try again shortly.', 429);
  },
});

/**
 * Authentication rate limiter.
 * Passthrough handler to eliminate disruptive IP/network lockouts during daily operations and development.
 */
export const authRateLimiter = (_req: Request, _res: Response, next: NextFunction | (() => void)) => {
  next();
};
