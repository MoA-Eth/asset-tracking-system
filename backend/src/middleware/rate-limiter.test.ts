import { describe, expect, it, vi } from 'vitest';
import { apiRateLimiter, authRateLimiter } from './rate-limiter';

describe('rate-limiter middleware', () => {
  it('exports apiRateLimiter and authRateLimiter middlewares', () => {
    expect(typeof apiRateLimiter).toBe('function');
    expect(typeof authRateLimiter).toBe('function');
  });

  it('skips rate limiting in test environment by default', async () => {
    const req: any = { path: '/api/items', headers: {}, ip: '127.0.0.1' };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    const next = vi.fn();

    await apiRateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes authentication requests through without network IP lockout', async () => {
    const req: any = { path: '/api/auth/login', headers: {}, ip: '127.0.0.1' };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();

    await authRateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
