/**
 * Original decorative artwork for the seed templates.
 *
 * Nothing here is copied from a real poster: the backgrounds are abstract
 * gradients with geometric floral rosettes, the dove is a simple generic
 * silhouette, and the national colours are used only as flat accent stripes.
 * Every asset is generated as SVG and rasterised by Sharp at seed time, so the
 * repository stays free of binary art.
 */

const BD_GREEN = '#006A4E';
const BD_RED = '#F42A41';

export interface BackgroundOptions {
  width: number;
  height: number;
  /** Top-to-bottom gradient stops. */
  gradient: [string, string];
  accent: string;
  motifs: 'floral' | 'dove' | 'rays';
  /** Keeps headline text legible by dimming the lower half. */
  vignette: boolean;
}

function rosette(cx: number, cy: number, r: number, petals: number, opacity: number): string {
  const petalPath = Array.from({ length: petals }, (_, i) => {
    const angle = (i / petals) * Math.PI * 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" />`;
  }).join('');

  return `<g fill="currentColor" opacity="${opacity}">${petalPath}
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.24).toFixed(1)}" /></g>`;
}

/** Deterministic pseudo-random so re-seeding produces identical artwork. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildBackgroundSvg(options: BackgroundOptions): string {
  const { width, height, gradient, accent, motifs, vignette } = options;
  const random = seededRandom(width + height + gradient[0].length);

  const floral: string[] = [];
  if (motifs === 'floral') {
    // Rosettes clustered along the four edges, leaving the centre clear so the
    // leader photos and headline are never obscured.
    const edgeCount = 14;
    for (let i = 0; i < edgeCount; i += 1) {
      const t = (i + 0.5) / edgeCount;
      const r = 40 + random() * 55;
      floral.push(rosette(t * width, 30 + random() * 45, r, 6, 0.16));
      floral.push(rosette(t * width, height - 30 - random() * 45, r, 6, 0.16));
    }
    for (let i = 0; i < 6; i += 1) {
      const r = 45 + random() * 60;
      floral.push(rosette(26 + random() * 40, random() * height, r, 5, 0.13));
      floral.push(rosette(width - 26 - random() * 40, random() * height, r, 5, 0.13));
    }
  }

  const rays = motifs === 'rays'
    ? `<g opacity="0.1">${Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const r = height * 1.1;
        const x = width / 2 + Math.cos(angle) * r;
        const y = height / 2 + Math.sin(angle) * r;
        const x2 = width / 2 + Math.cos(angle + 0.06) * r;
        const y2 = height / 2 + Math.sin(angle + 0.06) * r;
        return `<polygon points="${width / 2},${height / 2} ${x.toFixed(1)},${y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" />`;
      }).join('')}</g>`
    : '';

  const dove =
    motifs === 'dove'
      ? `<g transform="translate(${width * 0.78} ${height * 0.12}) scale(${width / 2200})" opacity="0.22" fill="${accent}">
           <path d="M0,0 C-70,-40 -150,-30 -190,20 C-120,40 -60,30 0,0 Z" />
           <path d="M-190,20 C-150,90 -80,130 10,150 C-30,80 -60,30 -190,20 Z" />
           <path d="M-30,-10 C-10,-40 30,-45 55,-25 C30,-10 5,-5 -30,-10 Z" />
         </g>`
      : '';

  const stripes = `<g>
      <rect x="0" y="0" width="${width}" height="10" fill="${BD_GREEN}" opacity="0.9" />
      <rect x="0" y="10" width="${width}" height="6" fill="${BD_RED}" opacity="0.85" />
    </g>`;

  const vignetteLayer = vignette
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#vignette)" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${gradient[0]}" />
      <stop offset="100%" stop-color="${gradient[1]}" />
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.75">
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  ${rays}
  <g color="${accent}">${floral.join('')}</g>
  ${dove}
  ${stripes}
  ${vignetteLayer}
</svg>`;
}

/** Small preview used by the template gallery. */
export function buildThumbnailSvg(options: BackgroundOptions): string {
  const full = buildBackgroundSvg(options);
  return full.replace(
    /width="\d+" height="\d+"/,
    `width="${Math.round(options.width / 3)}" height="${Math.round(options.height / 3)}"`,
  );
}
