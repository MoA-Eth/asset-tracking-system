import { Request, Response, NextFunction } from 'express';

/**
 * Structured HTTP request logging middleware.
 * Captures Method, URL, Status Code, Latency (ms), and Client IP.
 * Formats errors with warning/error levels.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_LOGS) {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number((end - start) / 1_000_000n);

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const user = (req as any).user?.username || (req as any).user?.id || undefined;
    const userTag = user ? ` (user: ${user})` : '';

    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs}ms - ${clientIp}${userTag}`;

    if (res.statusCode >= 500) {
      console.error(logLine);
    } else if (res.statusCode >= 400) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  });

  next();
}
