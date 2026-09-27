import type { LayoutConfig, PhotoSlot, TextSlot } from '../models/Template';
import type { GeminiLayout } from '../schemas/gemini.schema';
import { DECORATION_CSS, renderDecorations } from './decorations';
import {
  BENGALI_FONT_SERIF,
  BENGALI_FONT_STACK,
  buildTheme,
  contrastRatio,
  pickReadableColor,
  resolveFooterColors,
  resolveTextColor,
  type PosterCopy,
  type RenderTheme,
} from './theme';

export interface BuildHtmlInput {
  canvas: { width: number; height: number };
  layoutConfig: LayoutConfig;
  layout: GeminiLayout;
  copy: PosterCopy;
  /** Absolute, renderer-reachable URLs. Relative paths are resolved before this. */
  photoUrls: string[];
  /** Absolute background image URL from the template, if any. */
  backgroundUrl: string | null;
  fallbackPalette: { primary: string; secondary: string; accent: string };
}

/**
 * Escapes every value interpolated into the document.
 *
 * Poster copy is user-supplied and may legitimately contain `&`, `<`, quotes and
 * Bangla punctuation. Without this, a headline such as `উমা <আমিন>` would
 * either corrupt the DOM or become an injection vector into the renderer.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the complete, self-contained poster document.
 *
 * Deliberately no external stylesheet, script or font request: the page is
 * loaded into Chromium via setContent with no network access, so everything it
 * needs is inlined. This is what makes output byte-reproducible.
 */
export function buildPosterHtml(input: BuildHtmlInput): string {
  const { canvas, layoutConfig, copy, photoUrls, backgroundUrl } = input;
  const theme = buildTheme(input.layout, input.fallbackPalette);

  // The AI's palette overrides the template's own background only when it still
  // leaves room for readable text; otherwise the template background stands.
  const useAiBackground = contrastRatio(theme.primary, '#ffffff') >= 1.1;
  const effectivePrimary = useAiBackground ? theme.primary : input.fallbackPalette.primary;
  const effectiveSecondary = useAiBackground ? theme.secondary : input.fallbackPalette.secondary;
  const effectiveAccent = useAiBackground ? theme.accent : input.fallbackPalette.accent;

  const effectiveTheme: RenderTheme = { ...theme, primary: effectivePrimary, secondary: effectiveSecondary, accent: effectiveAccent };

  const decoration = renderDecorations({
    allowed: theme.decorations,
    primary: effectivePrimary,
    accent: effectiveAccent,
  });

  const photoElements = renderPhotoSlots(layoutConfig.photoSlots, photoUrls);
  const textElements = renderTextSlots(layoutConfig.textSlots, copy, effectiveTheme, effectivePrimary);
  const footerElement = renderFooter(layoutConfig, copy, effectiveTheme, effectivePrimary);

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<title>${escapeHtml(copy.headline)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: ${BENGALI_FONT_STACK};
    /* Chromium must not synthesise fake-bold on Bangla glyphs: it breaks the
       conjunct shaping that makes the script legible. */
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    font-kerning: normal;
  }
  .canvas {
    position: relative;
    width: ${canvas.width}px;
    height: ${canvas.height}px;
    overflow: hidden;
    isolation: isolate;
    background-color: ${effectivePrimary};
  }
  .background-image {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; z-index: 0;
  }
  .scrim {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--primary) 55%, transparent) 0%,
      color-mix(in srgb, var(--primary) 20%, transparent) 40%,
      color-mix(in srgb, var(--primary) 80%, transparent) 100%
    );
  }
  .photo-slot { position: absolute; overflow: hidden; }
  .photo-slot img { width: 100%; height: 100%; display: block; }
  .photo-slot.shape-circle { border-radius: 50%; }
  .photo-slot.shape-rectangle { border-radius: 8px; }
  .text-slot {
    position: absolute;
    margin: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .text-slot > span { display: block; width: 100%; }
  .footer-bar {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    z-index: 30;
  }
${DECORATION_CSS}
</style>
</head>
<body>
<div class="canvas" style="--primary: ${effectivePrimary}; --secondary: ${effectiveSecondary}; --accent: ${effectiveAccent}; ${Object.entries(decoration.customProperties).map(([k, v]) => `${k}: ${v};`).join(' ')}">
  ${backgroundUrl ? `<img class="background-image" src="${escapeHtml(backgroundUrl)}" alt="">` : ''}
  <div class="decoration-layer ${decoration.classNames.join(' ')}"></div>
  <div class="scrim"></div>
  ${photoElements}
  ${textElements}
  ${footerElement}
</div>
</body>
</html>`;
}

/**
 * Renders photo slots in template order, binding each to the photo the user
 * uploaded at the same index. Slots beyond the supplied photos are dropped so
 * the poster never shows an empty frame.
 */
function renderPhotoSlots(slots: PhotoSlot[], photoUrls: string[]): string {
  return slots
    .map((slot, index) => {
      const url = photoUrls[index];
      if (!url) return '';
      const px = (value: number): string => `${(value * 100).toFixed(4)}%`;
      return `<div class="photo-slot shape-${slot.shape}" style="
        left: ${px(slot.x)}; top: ${px(slot.y)};
        width: ${px(slot.width)}; height: ${px(slot.height)};
        z-index: ${slot.zIndex};
        border: ${slot.borderWidth}px solid ${slot.borderColor};
        box-sizing: border-box;
      "><img src="${escapeHtml(url)}" alt="" style="object-fit: ${slot.objectFit};"></div>`;
    })
    .join('\n  ');
}

/**
 * Emits text slots using only the values stored on the poster record. The AI
 * never contributes copy, so the rendered characters are always exactly what
 * the user submitted.
 */
function renderTextSlots(
  slots: TextSlot[],
  copy: PosterCopy,
  theme: RenderTheme,
  background: string,
): string {
  return slots
    .map((slot) => {
      const value = textForSlot(slot, copy);
      if (!value) return '';

      const fontSize = slot.scaleWithHeadline ? slot.fontSize * theme.headlineScale : slot.fontSize;
      const color = resolveTextColor(slot, theme, background);
      const px = (v: number): string => `${(v * 100).toFixed(4)}%`;
      const family = slot.type === 'headline' ? BENGALI_FONT_SERIF : BENGALI_FONT_STACK;
      // The AI may realign the headline, but only the headline: the name,
      // designation and location keep the template's own alignment, because
      // those slots are positioned around fixed ornament.
      const align = slot.type === 'headline' ? theme.headlineAlign : slot.align;

      return `<p class="text-slot" style="
        left: ${px(slot.x)}; top: ${px(slot.y)};
        width: ${px(slot.width)}; height: ${px(slot.height)};
        z-index: ${slot.zIndex};
        font-family: ${family};
        font-size: ${fontSize.toFixed(2)}px;
        font-weight: ${slot.fontWeight};
        line-height: ${slot.lineHeight};
        letter-spacing: ${slot.letterSpacing}px;
        text-align: ${align};
        color: ${color};
        text-shadow: ${slot.textShadow ? '0 4px 18px rgba(0,0,0,0.55)' : 'none'};
      "><span>${escapeHtml(value)}</span></p>`;
    })
    .join('\n  ');
}

function textForSlot(slot: TextSlot, copy: PosterCopy): string | undefined {
  switch (slot.type) {
    case 'headline':
      return copy.headline;
    case 'subheadline':
      return copy.subheadline;
    case 'name':
      return copy.name;
    case 'designation':
      return copy.designation;
    case 'location':
      // Location and contact share a slot: they read naturally as one line.
      return [copy.location, copy.contact].filter(Boolean).join(', ') || undefined;
    default:
      return undefined;
  }
}

function renderFooter(
  layoutConfig: LayoutConfig,
  copy: PosterCopy,
  theme: RenderTheme,
  background: string,
): string {
  const { footer } = layoutConfig;
  if (!footer.enabled) return '';

  const organization = copy.organization?.trim();
  if (!organization) return '';

  const colors = resolveFooterColors(footer, theme);
  const height = (footer.height * 100).toFixed(4);
  const text = `${footer.prefix}${organization}`;
  const color =
    colors.background === 'transparent'
      ? pickReadableColor(background, ['#ffffff', '#111111'])
      : colors.color;

  return `<div class="footer-bar" style="
    height: ${height}%;
    background: ${colors.background};
    color: ${color};
    font-size: ${Math.max(18, Math.round(theme.headlineScale * 46))}px;
    font-weight: 600;
    letter-spacing: 0.5px;
  "><span>${escapeHtml(text)}</span></div>`;
}
