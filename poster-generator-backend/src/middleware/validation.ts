import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validates the named request parts against a Zod object. Parsed output replaces
 * the raw value so downstream handlers receive coerced, trimmed data rather
 * than whatever the client happened to send.
 */
export function validate(schema: AnyZodObject, parts: RequestPart[] = ['body', 'query', 'params']) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const part of parts) {
      const result = schema.safeParse(req[part]);

      if (!result.success) {
        next(result.error);
        return;
      }

      // `req.query` is a getter in Express 5 and may be read-only; assign
      // defensively and ignore the failure since validation already passed.
      try {
        (req as unknown as Record<RequestPart, unknown>)[part] = result.data;
      } catch {
        /* read-only in this Express version — parsed values are still validated */
      }
    }

    next();
  };
}
