import { z } from 'zod';
import { MAX_PHOTOS, optionalBanglaText, requiredBanglaText } from './common.schema';

/**
 * Poster copy reuses the shared Bangla helpers rather than defining its own.
 * That matters for more than consistency: `requiredBanglaText` strips control
 * characters, and this text is interpolated straight into the HTML that
 * Chromium renders, so an unstripped control character would corrupt the output
 * (and potentially the server log) rather than merely looking untidy.
 */
export const createPosterSchema = z.object({
  templateSlug: z
    .string()
    .trim()
    .min(1, 'Choose a template')
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Invalid template'),
  copy: z.object({
    headline: requiredBanglaText(120, 'A headline is required'),
    subheadline: optionalBanglaText(180),
    name: optionalBanglaText(80),
    designation: optionalBanglaText(100),
    organization: optionalBanglaText(120),
    location: optionalBanglaText(120),
    contact: optionalBanglaText(60),
  }),
  photoPublicIds: z
    .array(z.string().min(1).max(200))
    .max(MAX_PHOTOS, `You can use at most ${MAX_PHOTOS} photos`)
    .default([]),
});

export const regeneratePosterSchema = z.object({
  // Accepted but ignored for copy: regeneration must reuse the stored text.
  // Rejecting an unexpected body keeps clients honest about what it does.
  reason: z.enum(['user_request']).optional(),
});

export const listPostersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});


export type CreatePosterInput = z.infer<typeof createPosterSchema>;
export type ListPostersInput = z.infer<typeof listPostersSchema>;
