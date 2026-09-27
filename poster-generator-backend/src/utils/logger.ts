import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys that must never reach the log stream, even in development. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'secret',
  'jwtsecret',
  'authorization',
  'gemini_api_key',
  'cloudinary_api_secret',
]);

function shouldLog(level: Level): boolean {
  if (env.NODE_ENV === 'production') return LEVEL_ORDER[level] >= LEVEL_ORDER.info;
  if (env.NODE_ENV === 'test') return level === 'error';
  return true;
}

function redact(fields: LogFields): LogFields {
  const output: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return output;
}

function emit(level: Level, message: string, fields: LogFields = {}): void {
  if (!shouldLog(level)) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...redact(fields),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
