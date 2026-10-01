import { Request, Response, NextFunction } from 'express';
import { AppError, DATABASE_UNAVAILABLE_MESSAGE, isDatabaseError, isDatabaseUnavailableError } from '../errors/app-error';
import { sendError } from '../utils/api-response';

const DATABASE_ERROR_MESSAGE =
  "The server couldn't complete this request because of a database problem. Please try again. If this keeps happening, contact the system administrator.";

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.details);
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Database down or unreachable: tell the user plainly instead of showing the Prisma message
  if (isDatabaseUnavailableError(err)) {
    console.error('[Database Unavailable]:', err.message);
    sendError(res, DATABASE_UNAVAILABLE_MESSAGE, 503, isProduction ? undefined : err.message);
    return;
  }

  // Other Prisma errors carry query details meant for developers, so keep them out of the message
  if (isDatabaseError(err)) {
    console.error('[Database Error]:', err);
    sendError(res, DATABASE_ERROR_MESSAGE, 500, isProduction ? undefined : err.message);
    return;
  }

  // Handle Unexpected Server Errors
  console.error('[Unhandled Internal Error]:', err);
  const message = isProduction
    ? 'An unexpected internal server error occurred.'
    : err.message || 'Internal Server Error';

  sendError(res, message, 500, isProduction ? undefined : err.stack);
};
