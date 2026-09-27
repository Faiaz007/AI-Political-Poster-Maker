/**
 * Decorations are drawn entirely with CSS and inline SVG.
 *
 * Two reasons: the renderer needs zero network access once the HTML is built
 * (so a slow CDN can never produce a half-drawn poster), and the ornament stays
 * resolution-independent because SVG scales with the canvas.
 *
 * Every class here is gated by the template's `decoration.allowed` list, so a
 * template can forbid, say, the national-colour accent without the renderer
 * needing to know why.
 */

export const DECORATION_CSS = `
.decoration-layer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }

.dec-gradient {
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--primary) 88%, black) 0%, var(--primary) 45%, color-mix(in srgb, var(--primary) 70%, var(--secondary)) 100%);
}

.dec-floral-border::before {
  content: '';
  position: absolute;
  inset: 2.2%;
  border: 14px solid color-mix(in srgb, var(--accent) 70%, transparent);
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 6px color-mix(in srgb, var(--primary) 60%, transparent),
    inset 0 0 60px rgba(0, 0, 0, 0.18);
}

.dec-floral-border::after {
  content: '';
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  background-image: var(--floral-svg);
  opacity: 0.35;
}

.dec-dove::after {
  content: '';
  position: absolute;
  right: 6%;
  top: 38%;
  width: 16%;
  height: auto;
  aspect-ratio: 3 / 2;
  background-image: var(--dove-svg);
  background-size: contain;
  background-repeat: no-repeat;
  opacity: 0.5;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.25));
}

.dec-light-rays::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -30%;
  width: 160%;
  height: 90%;
  transform: translateX(-50%);
  background: conic-gradient(
    from 180deg at 50% 0%,
    transparent 0deg,
    color-mix(in srgb, var(--accent) 22%, transparent) 12deg,
    transparent 26deg,
    color-mix(in srgb, var(--accent) 18%, transparent) 40deg,
    transparent 56deg
  );
  opacity: 0.75;
}

.dec-soft-pattern::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 45%),
    radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--secondary) 16%, transparent) 0%, transparent 50%);
}

.dec-national-color-accent {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--primary) 92%, black) 0%,
    var(--primary) 62%,
    var(--secondary) 100%
  );
}

.dec-national-color-accent::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 10px;
  background: var(--secondary);
  box-shadow: 0 calc(100% + 0px) 0 0 var(--primary);
}

.dec-national-color-accent::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 22px;
  background: var(--secondary);
}
`;

/** A repeated floral lattice used as the floral_border texture. */
export const FLORAL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <g id="flower">
      <circle cx="0" cy="-26" r="12" fill="currentColor" opacity="0.75"/>
      <circle cx="24" cy="-8" r="12" fill="currentColor" opacity="0.6"/>
      <circle cx="15" cy="21" r="12" fill="currentColor" opacity="0.5"/>
      <circle cx="-15" cy="21" r="12" fill="currentColor" opacity="0.5"/>
      <circle cx="-24" cy="-8" r="12" fill="currentColor" opacity="0.6"/>
      <circle cx="0" cy="0" r="8" fill="currentColor" opacity="0.9"/>
    </g>
    <pattern id="lattice" width="100" height="100" patternUnits="userSpaceOnUse">
      <use href="#flower" transform="translate(50 50)"/>
    </pattern>
  </defs>
  <rect width="400" height="400" fill="url(#lattice)" color="#ffffff"/>
</svg>`;

/** A stylised dove for tribute/mourning layouts. */
export const DOVE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">
  <g fill="currentColor">
    <path d="M40 120 C 90 40, 210 30, 258 96 C 232 92, 214 104, 198 122 C 176 146, 132 154, 96 144 C 72 138, 52 130, 40 120 Z" opacity="0.92"/>
    <path d="M198 122 C 214 104, 232 92, 258 96 L 272 78 L 268 104 L 284 112 L 258 118 Z" opacity="0.92"/>
    <path d="M96 144 C 74 152, 54 150, 40 140 C 62 136, 82 138, 96 144 Z" opacity="0.7"/>
  </g>
</svg>`;

export interface DecorationInput {
  /** Already filtered by the Gemini layer against the template allow-list. */
  allowed: string[];
  primary: string;
  accent: string;
}

/**
 * Produces the class list and the inline custom properties the decoration CSS
 * reads. Unknown or disallowed names are silently dropped rather than rejected:
 * the Gemini layer already filtered these, and this is the last safety net
 * before paint.
 */
export function renderDecorations({ allowed, primary, accent }: DecorationInput): {
  classNames: string[];
  customProperties: Record<string, string>;
} {
  const classNames = allowed
    .filter((name) => ['gradient', 'floral_border', 'dove', 'light_rays', 'soft_pattern', 'national_color_accent'].includes(name))
    .map((name) => `dec-${name.replace(/_/g, '-')}`);

  return {
    classNames,
    customProperties: {
      '--floral-svg': `url("data:image/svg+xml;base64,${toBase64(FLORAL_SVG)}")`,
      '--dove-svg': `url("data:image/svg+xml;base64,${toBase64(DOVE_SVG)}")`,
      '--primary-decor': primary,
      '--accent-decor': accent,
    },
  };
}

function toBase64(value: string): string {
  return Buffer.from(value.replace(/\n\s*/g, ' '), 'utf8').toString('base64');
}
