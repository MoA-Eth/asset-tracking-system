import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
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
 * Stricter rate limiter for authentication routes (/api/auth/login, etc.).
 * Works in tandem with account-level login-throttle to prevent brute-force attacks.
 * 30 attempts per 15 minutes per IP address.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req: Request, res: Response) => {
    sendError(res, 'Too many authentication attempts from this network address. Please try again after 15 minutes.', 429);
  },
});
