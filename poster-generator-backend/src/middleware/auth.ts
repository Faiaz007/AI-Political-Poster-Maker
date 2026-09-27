import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/auth.service';
import { AuthenticationError, ForbiddenError } from '../utils/errors';

/**
 * Establishes the caller's identity from the bearer token. Ownership checks
 * downstream must read `req.user.id` — never a userId sent by the client.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    next(new AuthenticationError('Authentication required'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (token.length === 0) {
    next(new AuthenticationError('Authentication required'));
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
