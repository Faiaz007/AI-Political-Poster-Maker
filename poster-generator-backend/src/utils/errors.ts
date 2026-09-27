/**
 * Application errors carry the HTTP status the client should receive. Anything
 * that is *not* an AppError is treated as a bug and reported as a generic 500,
 * which keeps internal details (stack traces, driver messages) off the wire.
 */
export class AppError extends Error {
  readonly status: number;
  readonly errors?: unknown;
  readonly isOperational: boolean;

  constructor(status: number, message: string, errors?: unknown, isOperational = true) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.errors = errors;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors?: unknown) {
    super(422, message, errors);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large') {
    super(413, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, message);
  }
}

/** A dependency we call out to (Gemini, Cloudinary, Chromium) failed. */
export class ExternalServiceError extends AppError {
  constructor(service: string, message = 'An external service is unavailable') {
    super(502, `${service}: ${message}`);
  }
}
