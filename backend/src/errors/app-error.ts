export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: any) {
    super(message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with existing resource') {
    super(message, 409);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  "The system can't reach its database right now. Please try again in a few minutes. If this keeps happening, contact the system administrator.";

// Prisma codes for "can't connect", "connection timed out", "operation timed out" and "server closed the connection"
const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

/** True when the error means the database is down or unreachable, rather than a problem with the request */
export function isDatabaseUnavailableError(err: any): boolean {
  if (!err) return false;
  return (
    err.name === 'PrismaClientInitializationError' ||
    DATABASE_UNAVAILABLE_CODES.has(err.code) ||
    DATABASE_UNAVAILABLE_CODES.has(err.errorCode) ||
    /Can't reach database server/i.test(err.message || '')
  );
}

/** True for any error raised by the Prisma client, whose raw message is meant for developers, not users */
export function isDatabaseError(err: any): boolean {
  return typeof err?.name === 'string' && err.name.startsWith('PrismaClient');
}
