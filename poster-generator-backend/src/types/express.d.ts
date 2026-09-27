import 'express-serve-static-core';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, echoed back via the X-Request-Id response header. */
      requestId: string;
      /** Populated by the `authenticate` middleware. Never read from a request body. */
      user?: {
        id: string;
        role: string;
      };
    }
  }
}

export {};
