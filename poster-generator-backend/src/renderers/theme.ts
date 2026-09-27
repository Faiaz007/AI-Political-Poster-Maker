import type { GeminiLayout } from '../schemas/gemini.schema';
import type { FooterConfig, TextAlign, TextSlot } from '../models/Template';

export interface PosterCopy {
  headline: string;
  subheadline?: string;
  name?: string;
  designation?: string;
  organization?: string;
  location?: string;
  contact?: string;
}

/** Footer treatments Gemini can select, mapped onto the template's own colours. */
export type FooterStyle = 'dark_bar' | 'light_bar' | 'transparent';

export interface RenderTheme {
  primary: string;
  secondary: string;
  accent: string;
  headlineScale: number;
  decorations: string[];
  footerStyle: FooterStyle;
  headlineAlign: TextAlign;
}

export const BENGALI_FONT_STACK =
  "'Noto Sans Bengali', 'Noto Serif Bengali', 'Hind Siliguri', 'SolaimanLipi', sans-serif";

export const BENGALI_FONT_SERIF =
  "'Noto Serif Bengali', 'Noto Sans Bengali', 'Hind Siliguri', 'SolaimanLipi', serif";

/**
 * Maps the AI's visual choices onto concrete values.
 *
 * Colour resolution is deliberately hierarchical: Gemini's palette wins, but a
 * text slot colour that would become illegible against the AI's chosen
 * background is repaired by the renderer. The AI may change the *mood* of a
 * poster, never the contrast of the text on it.
 */
export function buildTheme(
  layout: GeminiLayout,
  fallbackColors: { primary: string; secondary: string; accent: string },
): RenderTheme {
  return {
    primary: layout.palette.primary || fallbackColors.primary,
    secondary: layout.palette.secondary || fallbackColors.secondary,
    accent: layout.palette.accent || fallbackColors.accent,
    headlineScale: layout.headlineScale,
    decorations: layout.backgroundDecoration,
    footerStyle: layout.footerStyle,
    headlineAlign: headlineAlignFor(layout.headlineStyle),
  };
}

function headlineAlignFor(style: GeminiLayout['headlineStyle']): TextAlign {
  if (style === 'large_left') return 'left';
  if (style === 'large_right') return 'right';
  return 'center';
}

/**
 * WCAG relative luminance. Used to guarantee that a slot's own colour is
 * readable regardless of what palette the model selected.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * Picks whichever of the two candidates contrasts best with `background`.
 * Templates ship a light and a dark variant of each slot colour, so contrast is
 * repaired by substitution rather than by inventing an arbitrary colour.
 */
export function pickReadableColor(background: string, candidates: string[]): string {
  let best = candidates[0];
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * Resolves the final colour for a text slot.
 *
 * The AI palette can paint a light background where the template's slot colour
 * is a mid-tone, so the contrast check is against the effective background
 * under that slot rather than against the palette in isolation.
 */
export function resolveTextColor(
  slot: TextSlot,
  theme: RenderTheme,
  effectiveBackground: string,
): string {
  const candidates = [slot.color, '#ffffff', '#111111', theme.accent];
  if (contrastRatio(effectiveBackground, candidates[0]) >= 4.5) {
    return candidates[0];
  }
  return pickReadableColor(effectiveBackground, candidates);
}

/** Footer colours derived from the template config plus the AI's style choice. */
export function resolveFooterColors(config: FooterConfig, theme: RenderTheme): { background: string; color: string } {
  if (theme.footerStyle === 'transparent') {
    return { background: 'transparent', color: pickReadableColor(theme.primary, [config.textColor, '#ffffff', '#111111']) };
  }
  if (theme.footerStyle === 'light_bar') {
    const background = pickReadableColor(theme.primary, ['#ffffff', '#f4f6f5']);
    return { background, color: pickReadableColor(background, ['#111111', config.textColor]) };
  }
  return {
    background: pickReadableColor(theme.accent, [config.backgroundColor, theme.primary, '#0b3d2c']),
    color: pickReadableColor(config.backgroundColor, [config.textColor, '#ffffff', '#111111']),
  };
}
