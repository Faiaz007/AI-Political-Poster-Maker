import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// `quiet` suppresses dotenv's promotional banner, which otherwise interleaves
// with our structured JSON logs.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

/**
 * A secret this short is trivially brute-forceable, so the minimum is enforced
 * rather than merely recommended. `.env.example` ships a longer placeholder to
 * make the failure mode obvious when someone copies it verbatim.
 */
const MIN_JWT_SECRET_LENGTH = 32;

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

/**
 * Env values pasted into a hosting dashboard's editor very often keep the
 * trailing newline, and `z.enum` rejects `'cloudinary\n'` outright. Trimming
 * first turns that class of paste mistake into a successful boot instead of a
 * crash loop with an error that names the value but not the real cause.
 */
const trimmedEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.enum(values));

const envSchema = z.object({
  // Defaults to 'production' so a deploy that forgets NODE_ENV fails closed:
  // the error handler only emits stack traces in development, and silently
  // defaulting to development would leak them in production. Local dev and the
  // test env both set it explicitly.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(MIN_JWT_SECRET_LENGTH, `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`),
  JWT_EXPIRES_IN: z.string().default('7d'),

  GEMINI_API_KEY: optionalTrimmedString,
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),

  CLOUDINARY_CLOUD_NAME: optionalTrimmedString,
  CLOUDINARY_API_KEY: optionalTrimmedString,
  CLOUDINARY_API_SECRET: optionalTrimmedString,

  /**
   * Comma-separated list of browser origins allowed to call the API, e.g.
   * `http://localhost:3000,http://localhost:3001`.
   *
   * A list rather than a single value because `next dev` moves to the next free
   * port whenever 3000 is busy, which silently breaks CORS for a developer who
   * has no idea why. Each entry is validated as a real origin.
   */
  FRONTEND_URL: z
    .string()
    .default('http://localhost:3000')
    .transform((raw) => {
      const origins = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        throw new Error('FRONTEND_URL must list at least one origin');
      }
      for (const origin of origins) {
        const parsed = new URL(origin);
        // Anything beyond scheme/host/port would let an origin smuggle a path
        // or query string, so reject rather than silently normalise.
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
          throw new Error(`FRONTEND_URL entry "${origin}" must be a bare origin, with no path`);
        }
      }
      return origins;
    }),

  STORAGE_DRIVER: trimmedEnum(['cloudinary', 'local', 'datauri']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('uploads'),

  /**
   * Absolute origin used to resolve relative asset paths (local-storage driver)
   * when Chromium fetches them. Defaults to the local API so the seed works
   * without extra configuration.
   */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:5000'),
});

export type Env = Omit<z.infer<typeof envSchema>, 'FRONTEND_URL'> & {
  /** Validated, normalised list of allowed browser origins. */
  FRONTEND_URL: string[];
};

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.errors
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the values.`);
  }

  return parsed.data;
}

export const env = loadEnv();

/** True when Gemini credentials are present, so the service can be exercised. */
export const isGeminiConfigured = Boolean(env.GEMINI_API_KEY);

/** True when all three Cloudinary credentials are present. */
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

/**
 * Only a hard requirement when the cloudinary driver is selected. Selecting
 * cloudinary without credentials should fail at boot, not at the first upload.
 */
if (env.STORAGE_DRIVER === 'cloudinary' && !isCloudinaryConfigured) {
  throw new Error(
    'STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
  );
}
