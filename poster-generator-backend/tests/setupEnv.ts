/**
 * Forces an isolated test environment before any application module is
 * imported.
 *
 * This must run before `src/config/env.ts`, which loads `.env`. dotenv does not
 * overwrite variables that are already set, so assigning here wins. Without
 * this, the integration suite would connect to the development database and its
 * `deleteMany` cleanup would destroy real posters.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/poster_generator_test';
process.env.JWT_SECRET = 'test_secret_key_at_least_32_characters_long_abc';
process.env.JWT_EXPIRES_IN = '7d';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Intentionally left unset so the Gemini layer exercises its fallback path.
delete process.env.GEMINI_API_KEY;
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = 'uploads-test';
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:5999';
