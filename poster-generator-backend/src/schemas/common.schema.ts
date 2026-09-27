import { z } from 'zod';

/**
 * Bangla text is multi-codepoint (conjuncts, vowel signs), so length is
 * measured in JavaScript string units with generous ceilings rather than a
 * strict grapheme count. A 200-unit headline is far beyond any real poster.
 *
 * `.transform()` must come last: it wraps the schema in a ZodEffects, after
 * which string methods like `.min()` are no longer available.
 */
const banglaText = (max: number, min = 1, message = 'This field is required') =>
  z
    .string()
    .trim()
    .min(min, message)
    .max(max, `Must be ${max} characters or fewer`)
    // Strip control characters that would corrupt rendering or logs, while
    // leaving all Bangla combining marks untouched. Tab, newline and carriage
    // return are deliberately preserved so users can paste multi-line text.
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));

/**
 * Optional Bangla field.
 *
 * `.optional()` is required, not decorative: `.transform()` alone only makes the
 * *output* `string | undefined` while the key is still mandatory on input, so a
 * client omitting the field entirely would get "Required". `.optional()` is what
 * actually lets the key be absent.
 *
 * HTML forms also submit empty strings for untouched inputs, so `""` is
 * collapsed to `undefined` rather than stored as an empty string.
 */
export const optionalBanglaText = (max: number) =>
  banglaText(max, 0, '')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

/** Required Bangla field, exported so poster copy reuses the same hardening. */
export const requiredBanglaText = (max: number, message = 'This field is required') =>
  banglaText(max, 1, message);

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

export const registerSchema = z.object({
  name: banglaText(100, 1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const templateIdParamSchema = z.object({ id: objectId });

export const posterIdParamSchema = z.object({ id: objectId });

export const listTemplatesQuerySchema = z.object({
  occasion: z.enum(['victory', 'tribute', 'campaign', 'greeting', 'festival']).optional(),
});

export const OCCASIONS = ['victory', 'tribute', 'campaign', 'greeting', 'festival'] as const;
export type OccasionType = (typeof OCCASIONS)[number];

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
