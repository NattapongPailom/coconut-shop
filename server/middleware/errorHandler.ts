import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Request error', {
    method: req.method,
    path: req.path,
    status,
    message,
    stack: err.stack,
  });

  res.status(status).json({
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}

export function createError(message: string, status: number, code?: string): AppError {
  const err: AppError = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
