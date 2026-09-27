import { buildPosterHtml, escapeHtml } from '../src/renderers/html.builder';
import { buildTheme, contrastRatio, pickReadableColor, resolveTextColor } from '../src/renderers/theme';
import { FALLBACK_LAYOUT, type GeminiLayout } from '../src/schemas/gemini.schema';
import type { LayoutConfig, TextSlot } from '../src/models/Template';
import { createPosterSchema } from '../src/schemas/poster.schema';

const textSlot = (over: Partial<TextSlot> = {}): TextSlot => ({
  id: 'slot-1',
  type: 'headline',
  x: 0.05,
  y: 0.4,
  width: 0.9,
  height: 0.15,
  fontSize: 90,
  fontWeight: 700,
  align: 'center',
  color: '#ffffff',
  lineHeight: 1.25,
  letterSpacing: 0,
  scaleWithHeadline: true,
  zIndex: 20,
  textShadow: true,
  ...over,
});

const layoutConfig: LayoutConfig = {
  photoSlots: [
    { id: 'p1', x: 0.07, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'p2', x: 0.36, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'p3', x: 0.66, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  ],
  textSlots: [
    textSlot(),
    textSlot({ id: 'slot-2', type: 'name', y: 0.58, fontSize: 60, scaleWithHeadline: false, fontWeight: 600 }),
  ],
  decoration: { allowed: ['gradient', 'floral_border', 'dove', 'light_rays', 'soft_pattern', 'national_color_accent'] },
  footer: { enabled: true, height: 0.075, backgroundColor: '#006A4E', textColor: '#ffffff', prefix: 'প্রচারে: ' },
};

const layout: GeminiLayout = {
  layoutVariant: 'three_top',
  palette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFD54A' },
  photoLayout: 'three_top',
  headlineStyle: 'large_center',
  backgroundDecoration: ['gradient', 'floral_border'],
  headlineScale: 1.05,
  footerStyle: 'dark_bar',
};

const baseInput = {
  canvas: { width: 1800, height: 2400 },
  layoutConfig,
  layout,
  photoUrls: ['http://127.0.0.1:5000/uploads/a.jpg', 'http://127.0.0.1:5000/uploads/b.jpg', 'http://127.0.0.1:5000/uploads/c.jpg'],
  backgroundUrl: null,
  fallbackPalette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' },
};

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;',
    );
  });

  it('escapes ampersands without double-escaping entities', () => {
    expect(escapeHtml('ঢাকা & চট্টগ্রাম')).toBe('ঢাকা &amp; চট্টগ্রাম');
  });

  it('leaves Bangla text untouched', () => {
    expect(escapeHtml('মহান বিজয় দিবস')).toBe('মহান বিজয় দিবস');
  });
});

describe('buildPosterHtml', () => {
  it('produces a self-contained document with no external requests', () => {
    const html = buildPosterHtml({ ...baseInput, copy: { headline: 'মহান বিজয় দিবস' } });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lang="bn"');
    // Nothing may be fetched: no stylesheet link, no script src, no webfont URL.
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/fonts\.googleapis|cdn\./i);
  });

  it('emits every supplied photo in order', () => {
    const html = buildPosterHtml({ ...baseInput, copy: { headline: 'শিরোনাম' } });
    const order = [...html.matchAll(/uploads\/([abc])\.jpg/g)].map((m) => m[1]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('drops slots with no uploaded photo', () => {
    const html = buildPosterHtml({
      ...baseInput,
      photoUrls: ['http://127.0.0.1:5000/uploads/a.jpg'],
      copy: { headline: 'শিরোনাম' },
    });
    expect(html).toContain('uploads/a.jpg');
    expect(html).not.toContain('uploads/b.jpg');
    expect(html).not.toContain('uploads/c.jpg');
  });

  it('renders the exact user copy, escaped, with no AI-authored text', () => {
    const html = buildPosterHtml({
      ...baseInput,
      copy: { headline: 'উমা <আমিন> জয়ী', name: 'নুরুল ইসলাম' },
    });
    expect(html).toContain('উমা &lt;আমিন&gt; জয়ী');
    expect(html).toContain('নুরুল ইসলাম');
  });

  it('never emits a text slot for an absent field', () => {
    const html = buildPosterHtml({ ...baseInput, copy: { headline: 'শুধু শিরোনাম' } });
    // Two slots exist in the config (headline + name) but only one has copy.
    expect(html.match(/class="text-slot"/g)).toHaveLength(1);
    expect(html).not.toContain('নুরুল ইসলাম');
  });

  it('applies headlineScale to slots marked scaleWithHeadline only', () => {
    const html = buildPosterHtml({
      ...baseInput,
      layout: { ...layout, headlineScale: 1.2 },
      copy: { headline: 'শিরোনাম', name: 'নাম' },
    });
    expect(html).toContain('font-size: 108.00px'); // 90 * 1.2
    expect(html).toContain('font-size: 60.00px'); // 60 * 1.0
  });

  it('honours the headline alignment chosen by the AI', () => {
    const html = buildPosterHtml({
      ...baseInput,
      layout: { ...layout, headlineStyle: 'large_left' },
      copy: { headline: 'শিরোনাম', name: 'নাম' },
    });
    // The headline realigns; the name slot keeps the template's alignment.
    expect(html).toContain('text-align: left;');
    expect(html).toContain('text-align: center;');
  });

  it('applies only the permitted decorations', () => {
    const html = buildPosterHtml({
      ...baseInput,
      layout: { ...layout, backgroundDecoration: ['gradient', 'dove'] as GeminiLayout['backgroundDecoration'] },
      copy: { headline: 'শিরোনাম' },
    });
    const layer = html.match(/<div class="decoration-layer[^"]*"/)?.[0] ?? '';
    expect(layer).toContain('dec-gradient');
    expect(layer).toContain('dec-dove');
    expect(layer).not.toContain('dec-light-rays');
    expect(layer).not.toContain('dec-soft-pattern');
  });

  it('inlines decoration artwork as data URIs so nothing is fetched', () => {
    const html = buildPosterHtml({ ...baseInput, copy: { headline: 'শিরোনাম' } });
    expect(html).toContain('--floral-svg: url("data:image/svg+xml;base64,');
    expect(html).toContain('--dove-svg: url("data:image/svg+xml;base64,');
  });

  it('builds the footer from the organization and omits it when absent', () => {
    const withOrg = buildPosterHtml({ ...baseInput, copy: { headline: 'শিরোনাম', organization: 'গণপরিষদ' } });
    expect(withOrg).toContain('প্রচারে: গণপরিষদ');
    expect(withOrg).toContain('<div class="footer-bar"');

    // The .footer-bar CSS rule is always present; the element must not be.
    const withoutOrg = buildPosterHtml({ ...baseInput, copy: { headline: 'শিরোনাম' } });
    expect(withoutOrg).not.toContain('<div class="footer-bar"');
  });

  it('converts normalized geometry to percentages', () => {
    const html = buildPosterHtml({ ...baseInput, copy: { headline: 'শিরোনাম' } });
    expect(html).toContain('left: 7.0000%');
    expect(html).toContain('width: 27.0000%');
  });

  it('keeps output byte-identical for identical input', () => {
    const input = { ...baseInput, copy: { headline: 'মহান বিজয় দিবস' } };
    expect(buildPosterHtml(input)).toBe(buildPosterHtml(input));
  });
});

describe('poster copy validation', () => {
  const base = { templateSlug: 'victory-national', copy: { headline: 'শিরোনাম' } };

  it('requires a headline', () => {
    const result = createPosterSchema.safeParse({ ...base, copy: { headline: '' } });
    expect(result.success).toBe(false);
  });

  it('treats a blank optional field as absent rather than as an empty string', () => {
    const result = createPosterSchema.safeParse({
      ...base,
      copy: { headline: 'শিরোনাম', name: '', organization: '   ' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.copy.name).toBeUndefined();
      expect(result.data.copy.organization).toBeUndefined();
    }
  });

  it('strips control characters that would corrupt the rendered output', () => {
    // These reach Chromium verbatim, so they are sanitised at the edge.
    const result = createPosterSchema.safeParse({
      ...base,
      copy: { headline: 'মহান বিজয়\u0000 দিবস\u0007নতা' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.copy.headline).toBe('মহান বিজয় দিবসনতা');
    }
  });

  it('preserves Bangla combining marks and conjuncts', () => {
    const headline = 'বিজয়ী';
    const result = createPosterSchema.safeParse({ ...base, copy: { headline } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.copy.headline).toBe(headline);
  });

  it('rejects a template slug that is not a slug', () => {
    expect(createPosterSchema.safeParse({ ...base, templateSlug: 'A/B' }).success).toBe(false);
    expect(createPosterSchema.safeParse({ ...base, templateSlug: 'victory national' }).success).toBe(false);
  });

  it('caps photos at the shared maximum', () => {
    const tooMany = { ...base, photoPublicIds: ['a', 'b', 'c', 'd'] };
    expect(createPosterSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe('colour resolution', () => {
  it('computes known contrast ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });

  it('picks the highest-contrast candidate', () => {
    expect(pickReadableColor('#000000', ['#777777', '#ffffff'])).toBe('#ffffff');
    expect(pickReadableColor('#ffffff', ['#111111', '#eeeeee'])).toBe('#111111');
  });

  it('keeps the template colour when it is already readable', () => {
    const theme = buildTheme(layout, baseInput.fallbackPalette);
    expect(resolveTextColor(textSlot(), theme, '#006A4E')).toBe('#ffffff');
  });

  it('repairs an unreadable slot colour rather than emitting it', () => {
    const theme = buildTheme({ ...layout, palette: { primary: '#ffffff', secondary: '#eeeeee', accent: '#ffffff' } }, baseInput.fallbackPalette);
    const resolved = resolveTextColor(textSlot({ color: '#eeeeee' }), theme, '#ffffff');
    expect(contrastRatio('#ffffff', resolved)).toBeGreaterThanOrEqual(4.5);
  });

  it('reads headlineStyle as the slot alignment', () => {
    expect(buildTheme({ ...layout, headlineStyle: 'large_left' }, baseInput.fallbackPalette).headlineAlign).toBe('left');
    expect(buildTheme({ ...layout, headlineStyle: 'large_right' }, baseInput.fallbackPalette).headlineAlign).toBe('right');
    expect(buildTheme({ ...layout, headlineStyle: 'large_center' }, baseInput.fallbackPalette).headlineAlign).toBe('center');
  });
});

describe('fallback layout', () => {
  it('satisfies the layout schema and uses a high-contrast palette', () => {
    expect(contrastRatio(FALLBACK_LAYOUT.palette.primary, '#ffffff')).toBeGreaterThan(4.5);
  });
});
