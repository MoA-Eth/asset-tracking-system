import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { sendError } from '../utils/api-response';

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

  // Handle Unexpected Server Errors
  console.error('[Unhandled Internal Error]:', err);
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : err.message || 'Internal Server Error';

  sendError(res, message, 500, process.env.NODE_ENV !== 'production' ? err.stack : undefined);
};
