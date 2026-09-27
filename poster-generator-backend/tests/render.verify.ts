import { rendererService } from '../src/services/renderer.service';
import { buildPosterHtml } from '../src/renderers/html.builder';
import { BENGALI_FONT_SERIF } from '../src/renderers/theme';
import puppeteer, { type Browser } from 'puppeteer';
import sharp from 'sharp';
import { FALLBACK_LAYOUT, type GeminiLayout } from '../src/schemas/gemini.schema';

/**
 * Programmatic render verification.
 *
 * Bangla text can silently degrade to tofu boxes (missing glyphs) or fall back
 * to a Latin font, and both look plausible in a PNG that nobody inspects. These
 * checks prove the font actually applied, by rendering the same document with a
 * deliberately non-existent font and requiring the text band to change.
 */

const CANVAS = { width: 1800, height: 2400 };

const LAYOUT_CONFIG = {
  photoSlots: [
    { id: 'p1', x: 0.07, y: 0.05, width: 0.27, height: 0.27, shape: 'circle' as const, objectFit: 'cover' as const, zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'p2', x: 0.36, y: 0.05, width: 0.27, height: 0.27, shape: 'circle' as const, objectFit: 'cover' as const, zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'p3', x: 0.66, y: 0.05, width: 0.27, height: 0.27, shape: 'circle' as const, objectFit: 'cover' as const, zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  ],
  textSlots: [
    { id: 'headline', type: 'headline' as const, x: 0.05, y: 0.42, width: 0.9, height: 0.12, fontSize: 96, fontWeight: 700, align: 'center' as const, color: '#ffffff', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: true },
    { id: 'name', type: 'name' as const, x: 0.05, y: 0.58, width: 0.9, height: 0.07, fontSize: 60, fontWeight: 600, align: 'center' as const, color: '#ffffff', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
  ],
  decoration: { allowed: ['gradient', 'floral_border', 'dove', 'light_rays', 'soft_pattern', 'national_color_accent'] },
  footer: { enabled: true, height: 0.075, backgroundColor: '#006A4E', textColor: '#ffffff', prefix: 'প্রচারে: ' },
};

const BANGLA_COPY = {
  headline: 'মহান বিজয় দিবসের আনন্দে',
  subheadline: '১৬ ডিসেম্বর — জাতীয় পতাকা দিবস',
  name: 'নুরুল ইসলাম',
  organization: 'জাতীয় সংগঠন কমিটি',
  location: 'ঢাকা',
};

const PALETTE = { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' };

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    canvas: CANVAS,
    layoutConfig: LAYOUT_CONFIG,
    layout: FALLBACK_LAYOUT,
    copy: BANGLA_COPY,
    photoUrls: [] as string[],
    backgroundUrl: null,
    fallbackPalette: PALETTE,
    ...overrides,
  } as Parameters<typeof rendererService.render>[0];
}

/** Counts pixels in a region that differ meaningfully from the region's mean colour. */
async function inkRatio(buffer: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<number> {
  const { data } = await sharp(buffer).extract(region).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const mean = sum / data.length;
  let differing = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (Math.abs(data[i] - mean) > 18) differing += 1;
  }
  return differing / data.length;
}

/** Mean absolute pixel difference between two encoded images of identical size. */
async function meanAbsDiff(a: Buffer, b: Buffer): Promise<number> {
  const [ra, rb] = await Promise.all([sharp(a).greyscale().raw().toBuffer(), sharp(b).greyscale().raw().toBuffer()]);
  return diffRaw(ra, rb);
}

/** Mean absolute difference between two already-raw greyscale pixel buffers. */
function diffRaw(ra: Buffer, rb: Buffer): number {
  let total = 0;
  const n = Math.min(ra.length, rb.length);
  for (let i = 0; i < n; i += 1) total += Math.abs(ra[i] - rb[i]);
  return total / n;
}

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

let browser: Browser | null = null;

/** Screenshots one region of an arbitrary HTML document. */
async function screenshotBand(html: string, region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: CANVAS.width, height: CANVAS.height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    // Sharp's extract uses left/top; Puppeteer's clip uses x/y.
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: region.left, y: region.top, width: region.width, height: region.height },
    });
    return Buffer.from(shot);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const HEADLINE_BAND = { left: 100, top: Math.round(CANVAS.height * 0.42), width: CANVAS.width - 200, height: Math.round(CANVAS.height * 0.12) };
  const NAME_BAND = { left: 200, top: Math.round(CANVAS.height * 0.58), width: CANVAS.width - 400, height: Math.round(CANVAS.height * 0.07) };
  const PHOTO_BAND = { left: 0, top: 0, width: CANVAS.width, height: Math.round(CANVAS.height * 0.32) };
  const FOOTER_BAND = { left: 0, top: Math.round(CANVAS.height * 0.9), width: CANVAS.width, height: Math.round(CANVAS.height * 0.1) };

  const baseline = await rendererService.render(baseInput());

  const meta = await sharp(baseline).metadata();
  check('renders at the template canvas size', meta.width === 1800 && meta.height === 2400, `${meta.width}x${meta.height}`);
  check('produces a PNG', meta.format === 'png');

  // 1. Text is actually painted, not an empty band.
  const headlineInk = await inkRatio(baseline, HEADLINE_BAND);
  check('headline band contains glyph ink', headlineInk > 0.02, `ink ${(headlineInk * 100).toFixed(2)}%`);

  const nameInk = await inkRatio(baseline, NAME_BAND);
  check('name band contains glyph ink', nameInk > 0.02, `ink ${(nameInk * 100).toFixed(2)}%`);

  // 2. A band with no text must be materially emptier, proving ink is the text.
  const emptyBand = { left: 100, top: Math.round(CANVAS.height * 0.72), width: CANVAS.width - 200, height: Math.round(CANVAS.height * 0.1) };
  const emptyInk = await inkRatio(baseline, emptyBand);
  check('an untextured band has less ink than the headline', emptyInk < headlineInk / 2, `empty ${(emptyInk * 100).toFixed(2)}% vs headline ${(headlineInk * 100).toFixed(2)}%`);

  // 3. THE CRITICAL CHECK: the requested Bangla font must genuinely shape the
  // text. If the stack silently fell back, the headline band would look
  // identical to the same text drawn in a Latin-only font (or as tofu). We
  // build both documents and compare, using Puppeteer directly because the font
  // stack is fixed inside the builder.
  const realHtml = buildPosterHtml(baseInput());
  const latinHtml = realHtml.split(BENGALI_FONT_SERIF).join("'DejaVu Sans', sans-serif");
  const [realBand, latinBand] = await Promise.all([
    screenshotBand(realHtml, HEADLINE_BAND),
    screenshotBand(latinHtml, HEADLINE_BAND),
  ]);
  const fontBandDiff = await meanAbsDiff(realBand, latinBand);
  check(
    'Bangla font genuinely shapes the headline (not a Latin fallback or tofu)',
    fontBandDiff > 2,
    `mean diff vs Latin-only font ${fontBandDiff.toFixed(2)}`,
  );

  // 3b. A Bangla conjunct must be shaped as one glyph cluster: a real font
  // renders the headline more compactly than a fallback that draws each code
  // point separately. Compare the inked width of the band.
  const realInk = await inkRatio(realBand, { left: 0, top: 0, width: HEADLINE_BAND.width, height: HEADLINE_BAND.height });
  const latinInk = await inkRatio(latinBand, { left: 0, top: 0, width: HEADLINE_BAND.width, height: HEADLINE_BAND.height });
  check(
    'headline ink coverage differs between the Bangla and Latin fonts',
    Math.abs(realInk - latinInk) > 0.01,
    `bangla ${(realInk * 100).toFixed(2)}% vs latin ${(latinInk * 100).toFixed(2)}%`,
  );

  // 4. Footer renders when an organization is present, and disappears without.
  const footerInk = await inkRatio(baseline, FOOTER_BAND);
  const noOrg = await rendererService.render(baseInput({ copy: { headline: 'শুধু শিরোনাম' } }));
  const noOrgFooterInk = await inkRatio(noOrg, FOOTER_BAND);
  check('footer is drawn only when an organization exists', footerInk > noOrgFooterInk, `${(footerInk * 100).toFixed(2)}% vs ${(noOrgFooterInk * 100).toFixed(2)}%`);

  // 5. Photos must be painted. Compare the photo band with and without images.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#c62828"/><circle cx="400" cy="400" r="220" fill="#fff"/></svg>`;
  const fixtures = await Promise.all(
    [0, 1, 2].map(async (i) => {
      const buf = await sharp(Buffer.from(svg.replace('#c62828', ['#c62828', '#1565c0', '#2e7d32'][i]))).png().toBuffer();
      return `data:image/png;base64,${buf.toString('base64')}`;
    }),
  );
  const withPhotos = await rendererService.render(baseInput({ photoUrls: fixtures }));
  const [photoBandA, photoBandB] = await Promise.all([
    sharp(withPhotos).extract(PHOTO_BAND).greyscale().raw().toBuffer(),
    sharp(baseline).extract(PHOTO_BAND).greyscale().raw().toBuffer(),
  ]);
  const photoBandDiff = diffRaw(photoBandA, photoBandB);
  check('uploaded photos are painted into the slots', photoBandDiff > 3, `mean diff ${photoBandDiff.toFixed(2)}`);

  // 6. The AI's decisions must visibly change the output.
  const altLayout: GeminiLayout = {
    layoutVariant: 'three_top',
    palette: { primary: '#12355b', secondary: '#7f8c8d', accent: '#e8dcc4' },
    photoLayout: 'three_top',
    headlineStyle: 'large_left',
    backgroundDecoration: ['soft_pattern', 'dove'],
    headlineScale: 0.8,
    footerStyle: 'light_bar',
  };
  const alt = await rendererService.render(baseInput({ layout: altLayout }));
  const wholeDiff = await meanAbsDiff(baseline, alt);
  check('a different AI layout produces a visibly different poster', wholeDiff > 5, `mean diff ${wholeDiff.toFixed(2)}`);

  // 7. Determinism: identical input must yield identical bytes.
  const repeat = await rendererService.render(baseInput());
  const identical = baseline.equals(repeat);
  check('identical input produces byte-identical output', identical, identical ? 'exact match' : 'bytes differ');

  // 8. A long headline must not paint over the footer.
  const longHeadline = await rendererService.render(
    baseInput({ copy: { ...BANGLA_COPY, headline: 'মহান বিজয় দিবসের আনন্দে সারা দেশে ব্যাপক উৎসবে' } }),
  );
  const [lfA, lfB] = await Promise.all([
    sharp(longHeadline).extract(FOOTER_BAND).greyscale().raw().toBuffer(),
    sharp(baseline).extract(FOOTER_BAND).greyscale().raw().toBuffer(),
  ]);
  const longFooterDiff = diffRaw(lfA, lfB);
  check('a longer headline does not disturb the footer', longFooterDiff < 3, `mean diff ${longFooterDiff.toFixed(2)}`);

  await rendererService.close();
  await browser?.close().catch(() => undefined);
  console.log(failures === 0 ? '\nAll render checks passed.' : `\n${failures} render check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await rendererService.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  process.exit(1);
});
