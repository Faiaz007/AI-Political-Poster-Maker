import { FALLBACK_LAYOUT, geminiLayoutSchema } from '../src/schemas/gemini.schema';
import { GeminiService, LayoutCache, type LayoutRequest } from '../src/services/gemini.service';
import type { LayoutConfig } from '../src/models/Template';

const layoutConfig: LayoutConfig = {
  photoSlots: [
    { id: 'photo-1', x: 0.07, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'photo-2', x: 0.36, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
    { id: 'photo-3', x: 0.66, y: 0.05, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  ],
  textSlots: [],
  decoration: { allowed: ['gradient', 'floral_border', 'dove'] },
  footer: { enabled: true, height: 0.075, backgroundColor: '#006A4E', textColor: '#ffffff', prefix: 'প্রচারে: ' },
};

const request: LayoutRequest = {
  occasion: 'victory',
  headline: 'মহান বিজয় দিবস',
  organization: 'সংগঠন',
  location: 'ঢাকা',
  photoCount: 3,
  templateTitle: 'মহান বিজয় দিবস',
  templateDescription: 'National victory day layout',
  layoutConfig,
};

const VALID_RESPONSE = {
  layoutVariant: 'three_top',
  palette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFD54A' },
  photoLayout: 'three_top',
  headlineStyle: 'large_center',
  backgroundDecoration: ['gradient', 'dove'],
  headlineScale: 1.05,
  footerStyle: 'dark_bar',
};

/** Replaces the private SDK call so the service can be driven deterministically. */
function stubModel(service: GeminiService, responses: Array<{ text: string } | Error>) {
  let call = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).callModel = async () => {
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    return { text: next.text };
  };
  return () => call;
}

describe('geminiLayoutSchema', () => {
  it('accepts a well-formed layout', () => {
    expect(geminiLayoutSchema.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it('rejects an unknown layout variant', () => {
    const result = geminiLayoutSchema.safeParse({ ...VALID_RESPONSE, layoutVariant: 'spiral' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed hex colour', () => {
    const result = geminiLayoutSchema.safeParse({
      ...VALID_RESPONSE,
      palette: { ...VALID_RESPONSE.palette, primary: 'green' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range headline scale', () => {
    expect(geminiLayoutSchema.safeParse({ ...VALID_RESPONSE, headlineScale: 5 }).success).toBe(false);
    expect(geminiLayoutSchema.safeParse({ ...VALID_RESPONSE, headlineScale: 0.1 }).success).toBe(false);
  });

  it('rejects an empty decoration list', () => {
    expect(geminiLayoutSchema.safeParse({ ...VALID_RESPONSE, backgroundDecoration: [] }).success).toBe(false);
  });
});

describe('GeminiService.generateLayout', () => {
  let service: GeminiService;

  beforeEach(() => {
    service = new GeminiService();
  });

  it('returns the validated model output on the first attempt', async () => {
    const callCount = stubModel(service, [{ text: JSON.stringify(VALID_RESPONSE) }]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('gemini');
    expect(outcome.attempts).toBe(1);
    expect(outcome.layout).toEqual(VALID_RESPONSE);
    expect(callCount()).toBe(1);
  });

  it('recovers when the first response is unparseable', async () => {
    const callCount = stubModel(service, [
      { text: 'I think a green poster would be nice!' },
      { text: JSON.stringify(VALID_RESPONSE) },
    ]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('gemini');
    expect(outcome.attempts).toBe(2);
    expect(callCount()).toBe(2);
  });

  it('extracts JSON from a fenced code block', async () => {
    stubModel(service, [{ text: '```json\n' + JSON.stringify(VALID_RESPONSE) + '\n```' }]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('gemini');
    expect(outcome.layout.layoutVariant).toBe('three_top');
  });

  it('falls back after exhausting every attempt', async () => {
    const callCount = stubModel(service, [
      { text: 'nope' },
      { text: 'still nope' },
      { text: 'never mind' },
    ]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('fallback');
    expect(outcome.attempts).toBe(3);
    expect(callCount()).toBe(3);
    expect(outcome.layout.layoutVariant).toBe(FALLBACK_LAYOUT.layoutVariant);
  });

  it('retries past a transient 503 rather than giving up', async () => {
    // Gemini's Flash tiers intermittently answer 503 under load, so the third
    // attempt is the one that must still be tried before falling back.
    const callCount = stubModel(service, [
      new Error('503 UNAVAILABLE'),
      new Error('503 UNAVAILABLE'),
      { text: JSON.stringify(VALID_RESPONSE) },
    ]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('gemini');
    expect(outcome.attempts).toBe(3);
    expect(callCount()).toBe(3);
  });

  it('falls back when the SDK throws', async () => {
    stubModel(service, [
      new Error('quota exceeded'),
      new Error('quota exceeded'),
      new Error('quota exceeded'),
    ]);

    const outcome = await service.generateLayout(request);

    expect(outcome.source).toBe('fallback');
    expect(outcome.layout.palette.primary).toBe(FALLBACK_LAYOUT.palette.primary);
  });

  it('never throws, whatever the model returns', async () => {
    stubModel(service, [new Error('network down')]);
    await expect(service.generateLayout(request)).resolves.toBeDefined();
  });

  it('strips decorations the template does not permit', async () => {
    const response = { ...VALID_RESPONSE, backgroundDecoration: ['gradient', 'light_rays'] };
    stubModel(service, [{ text: JSON.stringify(response) }]);

    const outcome = await service.generateLayout(request);

    // `light_rays` is not in layoutConfig.decoration.allowed for this template.
    expect(outcome.layout.backgroundDecoration).toEqual(['gradient']);
  });

  it('falls back to an allowed decoration when every choice is rejected', async () => {
    const response = { ...VALID_RESPONSE, backgroundDecoration: ['light_rays'] as const };
    stubModel(service, [{ text: JSON.stringify(response) }]);

    const outcome = await service.generateLayout(request);

    expect(outcome.layout.backgroundDecoration).toHaveLength(1);
    expect(layoutConfig.decoration.allowed).toContain(outcome.layout.backgroundDecoration[0]);
  });

  it('does not pass user copy back through the layout', async () => {
    // The prompt may reference text length for context, but the returned layout
    // must contain no prose fields at all.
    const callCount = stubModel(service, [{ text: JSON.stringify(VALID_RESPONSE) }]);
    const outcome = await service.generateLayout(request);

    expect(callCount()).toBe(1);
    expect(Object.keys(outcome.layout).sort()).toEqual(
      [
        'backgroundDecoration',
        'footerStyle',
        'headlineScale',
        'headlineStyle',
        'layoutVariant',
        'palette',
        'photoLayout',
      ].sort(),
    );
  });
});

describe('LayoutCache', () => {
  it('returns null for an unknown key', () => {
    expect(new LayoutCache().get('missing')).toBeNull();
  });

  it('round-trips a layout', () => {
    const cache = new LayoutCache();
    cache.set('k', FALLBACK_LAYOUT);
    expect(cache.get('k')).toEqual(FALLBACK_LAYOUT);
  });

  it('expires entries once the TTL has passed', () => {
    const cache = new LayoutCache(-1);
    cache.set('k', FALLBACK_LAYOUT);
    expect(cache.get('k')).toBeNull();
  });

  it('evicts the oldest entry when full', () => {
    const cache = new LayoutCache(60_000, 2);
    cache.set('a', FALLBACK_LAYOUT);
    cache.set('b', FALLBACK_LAYOUT);
    cache.set('c', FALLBACK_LAYOUT);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('c')).toEqual(FALLBACK_LAYOUT);
  });

  it('derives different keys for different inputs', () => {
    const base = { templateSlug: 'victory-national', occasion: 'victory', photoCount: 3 };
    expect(LayoutCache.key(base)).toBe(LayoutCache.key({ ...base }));
    expect(LayoutCache.key(base)).not.toBe(LayoutCache.key({ ...base, photoCount: 2 }));
    expect(LayoutCache.key(base)).not.toBe(LayoutCache.key({ ...base, nonce: 'retry-1' }));
  });
});
