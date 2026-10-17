import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { requestLogger } from './request-logger';

describe('request-logger middleware', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls next without errors in test mode', () => {
    const req: any = { method: 'GET', originalUrl: '/api/items', headers: {} };
    const res: any = { statusCode: 200, on: vi.fn() };
    const next = vi.fn();

    requestLogger(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('registers on finish handler and logs when TEST_LOGS is enabled', () => {
    process.env.TEST_LOGS = 'true';
    try {
      const callbacks: Record<string, () => void> = {};
      const req: any = {
        method: 'POST',
        originalUrl: '/api/auth/login',
        headers: { 'x-forwarded-for': '127.0.0.1' },
      };
      const res: any = {
        statusCode: 200,
        on: vi.fn((event: string, cb: () => void) => {
          callbacks[event] = cb;
        }),
      };
      const next = vi.fn();

      requestLogger(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(callbacks['finish']).toBeDefined();

      callbacks['finish']();
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('POST /api/auth/login 200');
    } finally {
      delete process.env.TEST_LOGS;
    }
  });

  it('logs warnings for 4xx status codes', () => {
    process.env.TEST_LOGS = 'true';
    try {
      const callbacks: Record<string, () => void> = {};
      const req: any = { method: 'GET', originalUrl: '/api/missing', headers: {} };
      const res: any = {
        statusCode: 404,
        on: vi.fn((event: string, cb: () => void) => {
          callbacks[event] = cb;
        }),
      };
      const next = vi.fn();

      requestLogger(req, res, next);
      callbacks['finish']();
      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      delete process.env.TEST_LOGS;
    }
  });

  it('logs errors for 5xx status codes', () => {
    process.env.TEST_LOGS = 'true';
    try {
      const callbacks: Record<string, () => void> = {};
      const req: any = { method: 'POST', originalUrl: '/api/crash', headers: {} };
      const res: any = {
        statusCode: 500,
        on: vi.fn((event: string, cb: () => void) => {
          callbacks[event] = cb;
        }),
      };
      const next = vi.fn();

      requestLogger(req, res, next);
      callbacks['finish']();
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      delete process.env.TEST_LOGS;
    }
  });
});
