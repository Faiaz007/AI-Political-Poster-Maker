import { z } from 'zod';

/**
 * The AI may only pick from these closed sets. Anything outside them is rejected
 * by validation, so a hallucinated value can never reach the renderer.
 */
export const LAYOUT_VARIANTS = ['hero_top', 'three_top', 'two_top_one_bottom', 'center_portrait'] as const;
export const PHOTO_LAYOUTS = ['one_center', 'two_side_by_side', 'three_top'] as const;
export const HEADLINE_STYLES = ['large_center', 'large_left', 'large_right'] as const;
export const DECORATIONS = [
  'gradient',
  'floral_border',
  'dove',
  'light_rays',
  'soft_pattern',
  'national_color_accent',
] as const;
export const FOOTER_STYLES = ['dark_bar', 'light_bar', 'transparent'] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex colour such as #006A4E');

/**
 * The contract between Gemini and the renderer. Anything failing this schema
 * is treated as a failed call and retried, then replaced by the fallback.
 */
export const geminiLayoutSchema = z.object({
  layoutVariant: z.enum(LAYOUT_VARIANTS),
  palette: z.object({
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
  }),
  photoLayout: z.enum(PHOTO_LAYOUTS),
  headlineStyle: z.enum(HEADLINE_STYLES),
  /** Intersected with the template's allow-list before use. */
  backgroundDecoration: z.array(z.enum(DECORATIONS)).min(1).max(4),
  headlineScale: z.number().min(0.7).max(1.2),
  footerStyle: z.enum(FOOTER_STYLES),
});

export type GeminiLayout = z.infer<typeof geminiLayoutSchema>;

/**
 * Deterministic layout used when Gemini is unavailable or returns unusable
 * output. Generation must never fail *because* the AI is down, so this mirrors
 * the visual language of the seeded templates.
 */
export const FALLBACK_LAYOUT: GeminiLayout = {
  layoutVariant: 'three_top',
  palette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' },
  photoLayout: 'three_top',
  headlineStyle: 'large_center',
  backgroundDecoration: ['gradient', 'floral_border'],
  headlineScale: 1.0,
  footerStyle: 'dark_bar',
};

/** Palette used when Gemini is not configured at all. */
export const DEFAULT_PALETTE = FALLBACK_LAYOUT.palette;
