import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

/**
 * MongoDB's duplicate-key failure is a plain server error object rather than a
 * typed class we can import, so it is identified by its well-known code 11000.
 */
function isDuplicateKeyError(error: Error): error is MongoDuplicateKeyError {
  return (error as Partial<MongoDuplicateKeyError>).code === 11000;
}

/**
 * Single exit point for every failure in the app. Translates the errors we know
 * about into stable, client-safe messages; anything unrecognised becomes a
 * generic 500 so implementation details never leak.
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;

  if (error instanceof ZodError) {
    logger.warn('Request validation failed', { requestId, issues: error.issues.length });
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
      requestId,
    });
    return;
  }

  if (error instanceof AppError) {
    const logFields = { requestId, status: error.status, message: error.message };
    if (error.status >= 500) logger.error('Request failed', logFields);
    else logger.warn('Request rejected', logFields);

    res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
      requestId,
    });
    return;
  }

  if (isDuplicateKeyError(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? 'field';
    logger.warn('Duplicate key rejected', { requestId, field });
    res.status(409).json({
      success: false,
      message: `That ${field} is already registered`,
      requestId,
    });
    return;
  }

  // Multer surfaces its own codes (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE...).
  const multerError = error as { name?: string; code?: string; message?: string };
  if (multerError.name === 'MulterError') {
    const messages: Record<string, { status: number; text: string }> = {
      LIMIT_FILE_SIZE: { status: 413, text: 'Each image must be 10 MB or smaller' },
      LIMIT_FILE_COUNT: { status: 422, text: 'You can upload at most 3 images' },
      LIMIT_UNEXPECTED_FILE: { status: 422, text: 'Unexpected file field' },
    };
    const mapped = messages[multerError.code ?? ''] ?? { status: 400, text: 'Upload rejected' };
    logger.warn('Upload rejected', { requestId, code: multerError.code });
    res.status(mapped.status).json({ success: false, message: mapped.text, requestId });
    return;
  }

  if (error.name === 'UnsupportedImageTypeError') {
    logger.warn('Upload rejected', { requestId, reason: 'unsupported media type' });
    res.status(422).json({ success: false, message: error.message, requestId });
    return;
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, message: 'Invalid or expired session', requestId });
    return;
  }

  logger.error('Unhandled error', { requestId, message: error.message, stack: error.stack });

  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    requestId,
    ...(env.NODE_ENV === 'development' ? { debug: error.message, stack: error.stack } : {}),
  });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Route not found: ${req.method} ${req.path}`));
}
