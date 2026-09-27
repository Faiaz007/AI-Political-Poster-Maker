import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { env, isGeminiConfigured } from '../config/env';
import type { LayoutConfig } from '../models/Template';
import type { OccasionType } from '../schemas/common.schema';
import {
  DECORATIONS,
  FALLBACK_LAYOUT,
  geminiLayoutSchema,
  LAYOUT_VARIANTS,
  PHOTO_LAYOUTS,
  HEADLINE_STYLES,
  FOOTER_STYLES,
  type GeminiLayout,
} from '../schemas/gemini.schema';
import { logger } from '../utils/logger';

/**
 * Gemini's only job is visual direction: which colour palette, how the photos
 * sit on the page, which decorations to draw. It is explicitly forbidden from
 * producing or altering text, because a diffusion-style model cannot spell
 * Bangla reliably and the user's name/designation must be pixel-exact.
 */
const SYSTEM_INSTRUCTION = `You are a visual layout assistant for Bangladeshi political posters.

You propose ONLY the visual arrangement of a poster that application code then renders.

ABSOLUTE RULES:
1. Never write, rewrite, translate, correct, embellish or summarise any text. You do not produce poster copy.
2. Never generate slogans, claims, allegations, statistics, endorsements, quotes or achievements.
3. Return only the requested JSON object, with no prose and no code fences.
4. Every enumerated field must be one of the exact values listed in the schema.
5. backgroundDecoration may contain only values permitted by the template you are given.

The application renders the user's exact text. Your output controls only colour, spacing and ornament.`;

export interface LayoutRequest {
  occasion: OccasionType;
  headline: string;
  subheadline?: string;
  organization: string;
  location: string;
  photoCount: number;
  templateTitle: string;
  templateDescription: string;
  layoutConfig: LayoutConfig;
}

export interface LayoutOutcome {
  layout: GeminiLayout;
  source: 'gemini' | 'fallback';
  model?: string;
  latencyMs: number;
  attempts: number;
  promptTokens?: number;
  completionTokens?: number;
}

/** Raw JSON Schema mirroring `geminiLayoutSchema`, passed to responseJsonSchema. */
const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'layoutVariant',
    'palette',
    'photoLayout',
    'headlineStyle',
    'backgroundDecoration',
    'headlineScale',
    'footerStyle',
  ],
  properties: {
    layoutVariant: { type: 'string', enum: [...LAYOUT_VARIANTS] },
    palette: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'secondary', 'accent'],
      properties: {
        primary: { type: 'string', description: 'Dominant colour, 6-digit hex, e.g. #006A4E' },
        secondary: { type: 'string', description: 'Contrasting accent, 6-digit hex' },
        accent: { type: 'string', description: 'Text/ornament colour, 6-digit hex' },
      },
    },
    photoLayout: { type: 'string', enum: [...PHOTO_LAYOUTS] },
    headlineStyle: { type: 'string', enum: [...HEADLINE_STYLES] },
    backgroundDecoration: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string', enum: [...DECORATIONS] },
    },
    headlineScale: { type: 'number', minimum: 0.7, maximum: 1.2 },
    footerStyle: { type: 'string', enum: [...FOOTER_STYLES] },
  },
} as const;

/**
 * Total attempts before giving up and using the deterministic fallback.
 *
 * Three rather than two because Gemini's Flash tiers intermittently answer
 * `503 UNAVAILABLE` under load, which was observed on roughly half of all
 * first attempts during testing. Two attempts therefore sent many users to the
 * fallback for a reason unrelated to their poster. Retrying is free of charge
 * on the Gemini free tier, and the fallback still guarantees a result.
 */
const MAX_ATTEMPTS = 3;

/** First retry wait; doubled each attempt (800ms, then 1600ms). */
const RETRY_BASE_DELAY_MS = 800;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class GeminiService {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! });
    }
    return this.client;
  }

  /**
   * Returns a validated layout, or the deterministic fallback. This method
   * never throws: a failed AI call must not fail poster generation.
   */
  async generateLayout(request: LayoutRequest): Promise<LayoutOutcome> {
    const startedAt = Date.now();
    const allowedDecorations = request.layoutConfig.decoration.allowed;

    const sanitise = (layout: GeminiLayout): GeminiLayout => {
      // A template may disallow a decoration the model picked. Filter rather
      // than discard the whole response, and guarantee at least one remains.
      const permitted = layout.backgroundDecoration.filter((item) => allowedDecorations.includes(item));
      return {
        ...layout,
        backgroundDecoration:
          permitted.length > 0 ? permitted : [FALLBACK_LAYOUT.backgroundDecoration[0]],
      };
    };

    if (!isGeminiConfigured) {
      logger.info('Gemini not configured, using fallback layout');
      return {
        layout: sanitise(FALLBACK_LAYOUT),
        source: 'fallback',
        latencyMs: Date.now() - startedAt,
        attempts: 0,
      };
    }

    const prompt = this.buildPrompt(request);
    const correction = `${prompt}\n\nYour previous reply could not be parsed. Reply with a single valid JSON object matching the schema exactly — no prose, no code fences.`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      // Back off before every retry. Gemini answers overloaded requests with
      // `503 UNAVAILABLE`, and retrying that immediately just burns the next
      // attempt while the capacity window is still closed. Measured against the
      // free tier, this cut a 6.3s thinking-model call down to 1.6s on a lite
      // model; the wait is well spent because a fallback is the alternative.
      if (attempt > 1) await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 2));

      try {
        const raw = await this.callModel(attempt === 1 ? prompt : correction);
        const parsed = this.parseAndValidate(raw.text);

        if (parsed) {
          const layout = sanitise(parsed);
          logger.info('Gemini layout accepted', {
            attempt,
            latencyMs: Date.now() - startedAt,
            promptTokens: raw.promptTokens,
            completionTokens: raw.completionTokens,
            layoutVariant: layout.layoutVariant,
          });
          return {
            layout,
            source: 'gemini',
            model: env.GEMINI_MODEL,
            latencyMs: Date.now() - startedAt,
            attempts: attempt,
            promptTokens: raw.promptTokens,
            completionTokens: raw.completionTokens,
          };
        }

        logger.warn('Gemini response failed validation', { attempt });
      } catch (error) {
        logger.warn('Gemini call failed', { attempt, message: (error as Error).message });
      }
    }

    logger.warn('Gemini unusable after retries, using fallback layout', {
      latencyMs: Date.now() - startedAt,
    });
    return {
      layout: sanitise(FALLBACK_LAYOUT),
      source: 'fallback',
      latencyMs: Date.now() - startedAt,
      attempts: MAX_ATTEMPTS,
    };
  }

  private async callModel(prompt: string): Promise<{
    text: string;
    promptTokens?: number;
    completionTokens?: number;
  }> {
    const response = await this.getClient().models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        // Low temperature keeps repeated generations of the same template
        // visually consistent, which matters for a printed campaign series.
        temperature: 0.4,
        maxOutputTokens: 900,
      },
    });

    return {
      text: response.text ?? '',
      promptTokens: response.usageMetadata?.promptTokenCount,
      completionTokens: response.usageMetadata?.candidatesTokenCount,
    };
  }

  /**
   * Parses defensively: the model may still wrap JSON in prose despite
   * responseMimeType, so a fenced or embedded object is extracted before Zod
   * ever sees the value.
   */
  private parseAndValidate(text: string): GeminiLayout | null {
    if (!text.trim()) return null;

    const candidates: unknown[] = [safeJsonParse(text)];

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(safeJsonParse(fenced[1]));

    const embedded = text.match(/\{[\s\S]*\}/);
    if (embedded) candidates.push(safeJsonParse(embedded[0]));

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const result = geminiLayoutSchema.safeParse(candidate);
      if (result.success) return result.data;
    }

    return null;
  }

  /**
   * User text is included only as *context* so the model can judge length and
   * tone. It is never requested back, and the renderer uses the original
   * database value rather than anything derived from the prompt.
   */
  private buildPrompt(request: LayoutRequest): string {
    const { layoutConfig } = request;
    const photoSlots = layoutConfig.photoSlots.map((slot) => ({
      id: slot.id,
      shape: slot.shape,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
    }));

    return [
      `TEMPLATE: ${request.templateTitle}`,
      `TEMPLATE DESCRIPTION: ${request.templateDescription || '(none)'}`,
      `OCCASION: ${request.occasion}`,
      `PHOTO COUNT PROVIDED BY USER: ${request.photoCount}`,
      `ORGANISATION (context only): ${request.organization || '(none)'}`,
      `LOCATION (context only): ${request.location || '(none)'}`,
      `HEADLINE LENGTH: ${request.headline.length} characters`,
      request.subheadline ? `SUBHEADLINE LENGTH: ${request.subheadline.length} characters` : 'SUBHEADLINE LENGTH: 0',
      '',
      'TEMPLATE PHOTO SLOTS (normalised 0..1 coordinates):',
      JSON.stringify(photoSlots),
      '',
      'DECORATIONS THIS TEMPLATE PERMITS:',
      JSON.stringify(layoutConfig.decoration.allowed),
      '',
      'CHOOSE A PALETTE THAT SUITS THE OCCASION.',
      `- victory: green/red national colours with a bright gold accent`,
      `- tribute: muted, restrained, low-saturation colours`,
      `- campaign: high-contrast, saturated, energetic`,
      `- greeting and festival: warm, celebratory colours`,
      '',
      'CONSTRAINTS:',
      '- headlineStyle must suit the template headline slot alignment.',
      '- Choose a photoLayout that can accommodate the number of photos supplied;',
      '  if fewer photos were supplied than slots exist, prefer one_center or two_side_by_side.',
      '- Pick between 1 and 4 decorations, all from the permitted list.',
      '- Return only the JSON object.',
    ].join('\n');
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Cost control: the visual direction for a (template, occasion, photoCount)
 * triple is reusable across users, so identical requests are served from cache
 * instead of re-billed to Gemini. Regenerate intentionally bypasses the cache
 * by including a nonce in the key.
 */
export class LayoutCache {
  private readonly store = new Map<string, { layout: GeminiLayout; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 6 * 60 * 60 * 1000,
    private readonly maxEntries = 500,
  ) {}

  static key(input: { templateSlug: string; occasion: string; photoCount: number; nonce?: string }): string {
    return createHash('sha256')
      .update(`${input.templateSlug}|${input.occasion}|${input.photoCount}|${input.nonce ?? ''}`)
      .digest('hex');
  }

  get(key: string): GeminiLayout | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.layout;
  }

  set(key: string, layout: GeminiLayout): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { layout, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}
