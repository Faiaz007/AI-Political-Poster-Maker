import { Types } from 'mongoose';
import { toAbsoluteAssetUrl } from '../utils/urls';
import { logger } from '../utils/logger';
import { getStorageService } from './storage.factory';
import { GeminiService, LayoutCache } from './gemini.service';
import { rendererService } from './renderer.service';
import { getTemplateDocumentBySlug } from './template.service';
import {
  Poster,
  toPosterSummary,
  type PosterCopy,
  type PosterDocument,
  type PosterPhotoRef,
  type PosterSummary,
} from '../models/Poster';
import { UploadedPhoto } from '../models/UploadedPhoto';
import { FALLBACK_LAYOUT, type GeminiLayout } from '../schemas/gemini.schema';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface CreatePosterInput {
  userId: string;
  templateSlug: string;
  copy: PosterCopy;
  photoPublicIds: string[];
  /** Bypasses the layout cache so a regenerate is visually different. */
  nonce?: string;
}

const layoutCache = new LayoutCache();
const geminiService = new GeminiService();
const storage = () => getStorageService();

/**
 * Creates a poster record and renders it.
 *
 * Returns as soon as the record exists in `processing`, not when the PNG is
 * ready: rendering takes seconds and holding an HTTP request open that long
 * invites gateway timeouts. The client polls `GET /api/posters/:id`.
 */
export async function createPoster(input: CreatePosterInput): Promise<PosterDocument> {
  const template = await getTemplateDocumentBySlug(input.templateSlug);

  // Photo ownership is verified here, synchronously, before anything is
  // written. Doing it inside the background job would let a request that
  // references another account's photos return 202 and only fail later, which
  // both leaks the existence of those photos and gives the user a poster that
  // silently never renders.
  const photos = await resolvePhotos(input.photoPublicIds, input.userId);

  const poster = await Poster.create({
    userId: new Types.ObjectId(input.userId),
    templateId: template._id,
    templateSlug: template.slug,
    status: 'pending',
    copy: input.copy,
    photos,
    occasionType: template.occasionType,
    width: template.canvas.width,
    height: template.canvas.height,
    version: 1,
  });

  // Deliberately not awaited: the request returns immediately and the render
  // continues in the background.
  void generateInto(poster, template, input.nonce);

  return poster;
}

/**
 * Re-runs Gemini against the same stored copy and photos.
 *
 * The copy is read from the database and never from the request, so a client
 * cannot smuggle different text through a regenerate call.
 */
export async function regeneratePoster(posterId: string, userId: string): Promise<PosterDocument> {
  const poster = await Poster.findOne({ _id: posterId, userId });
  if (!poster) {
    throw new NotFoundError('Poster not found');
  }

  const template = await getTemplateDocumentBySlug(poster.templateSlug);

  // The version is bumped here, not in generateInto, so a first generation stays
  // version 1 and only a regenerate advances the counter.
  poster.version += 1;
  poster.status = 'pending';
  poster.errorMessage = null;
  await poster.save();

  // A nonce tied to the new version defeats the cache, so the user actually
  // sees a different variation rather than the identical cached layout.
  void generateInto(poster, template, `v${poster.version}`);

  return poster;
}

async function generateInto(
  poster: PosterDocument,
  template: Awaited<ReturnType<typeof getTemplateDocumentBySlug>>,
  nonce?: string,
): Promise<void> {
  const startedAt = Date.now();

  try {
    poster.status = 'processing';
    await poster.save();

    const photos = poster.photos;
    const layoutOutcome = await resolveLayout(template, photos, poster, nonce);

    poster.aiLayout = layoutOutcome.layout;
    poster.aiSource = layoutOutcome.source;

    const html_input = {
      canvas: template.canvas,
      layoutConfig: template.layoutConfig,
      layout: layoutOutcome.layout,
      copy: poster.copy,
      photoUrls: photos.map((photo) => photo.url),
      backgroundUrl: template.backgroundUrl ? toAbsoluteAssetUrl(template.backgroundUrl) : null,
      fallbackPalette: FALLBACK_LAYOUT.palette,
    };

    const buffer = await rendererService.render(html_input);

    const asset = await storage().uploadImage({
      buffer,
      filename: 'poster.png',
      contentType: 'image/png',
      folder: `posters/${String(poster.userId)}`,
    });

    // A regenerate replaces the current output in place; the version counter is
    // the audit trail rather than a history of separate documents.
    await removePreviousOutput(poster);

    poster.outputUrl = asset.url;
    poster.outputPublicId = asset.publicId;
    poster.status = 'completed';
    poster.generationMs = Date.now() - startedAt;
    poster.errorMessage = null;
    await poster.save();

    logger.info('Poster generated', {
      posterId: String(poster._id),
      userId: String(poster.userId),
      aiSource: layoutOutcome.source,
      version: poster.version,
      totalMs: poster.generationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Poster generation failed', { posterId: String(poster._id), message });

    poster.status = 'failed';
    poster.errorMessage = message.slice(0, 500);
    poster.generationMs = Date.now() - startedAt;
    await poster.save().catch((saveError: unknown) => {
      logger.error('Could not persist poster failure', {
        posterId: String(poster._id),
        message: (saveError as Error).message,
      });
    });
  }
}

async function removePreviousOutput(poster: PosterDocument): Promise<void> {
  const previous = poster.outputPublicId;
  if (!previous) return;
  try {
    await storage().deleteAsset(previous);
  } catch (error) {
    // A stranded asset is a storage-cost problem, not a user-facing failure, so
    // it must not abort an otherwise successful generation.
    logger.warn('Could not delete previous poster output', {
      posterId: String(poster._id),
      publicId: previous,
      message: (error as Error).message,
    });
  }
}

/**
 * Loads the caller's own photo records by public ID.
 *
 * Ownership is proven by the `userId` in the document, not by parsing the
 * storage key. Anything not owned is reported as a validation error, so a user
 * cannot attach another account's photo to their poster.
 */
async function resolvePhotos(photoPublicIds: string[], userId: string): Promise<PosterPhotoRef[]> {
  if (photoPublicIds.length === 0) {
    return [];
  }

  const unique = [...new Set(photoPublicIds)];

  const records = await UploadedPhoto.find({ userId, publicId: { $in: unique } }).lean();
  const byPublicId = new Map(records.map((record) => [record.publicId, record]));

  const missing = unique.filter((publicId) => !byPublicId.has(publicId));
  if (missing.length > 0) {
    throw new ValidationError('One or more photos could not be found on your account');
  }

  // Preserve the order the user arranged the photos in.
  return unique.map((publicId) => {
    const record = byPublicId.get(publicId)!;
    return {
      publicId: record.publicId,
      url: toAbsoluteAssetUrl(record.url),
      width: record.width,
      height: record.height,
    };
  });
}

/**
 * Requests a layout from Gemini, reusing the cached decision for identical
 * (template, occasion, photoCount) triples. Falls back to the deterministic
 * layout on any failure so generation always completes.
 */
async function resolveLayout(
  template: Awaited<ReturnType<typeof getTemplateDocumentBySlug>>,
  photos: PosterPhotoRef[],
  poster: PosterDocument,
  nonce: string | undefined,
): Promise<{ layout: GeminiLayout; source: 'gemini' | 'fallback' }> {
  const key = LayoutCache.key({
    templateSlug: template.slug,
    occasion: template.occasionType,
    photoCount: photos.length,
    nonce,
  });

  const cached = nonce ? null : layoutCache.get(key);
  if (cached) {
    return { layout: cached, source: 'gemini' };
  }

  const outcome = await geminiService.generateLayout({
    occasion: template.occasionType,
    headline: poster.copy.headline,
    subheadline: poster.copy.subheadline,
    organization: poster.copy.organization ?? '',
    location: poster.copy.location ?? '',
    photoCount: photos.length,
    templateTitle: template.title,
    templateDescription: template.description,
    layoutConfig: template.layoutConfig,
  });

  if (nonce === undefined && outcome.source === 'gemini') {
    layoutCache.set(key, outcome.layout);
  }

  return { layout: outcome.layout, source: outcome.source };
}

export async function listUserPosters(
  userId: string,
  options: { page?: number; limit?: number } = {},
): Promise<{ posters: PosterSummary[]; page: number; total: number; totalPages: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 12));

  const [docs, total] = await Promise.all([
    Poster.find({ userId, status: { $ne: 'failed' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Poster.countDocuments({ userId, status: { $ne: 'failed' } }),
  ]);

  return {
    posters: docs.map((doc) => toPosterSummary(doc as never)),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Ownership is enforced in the query, not afterwards, so there is no IDOR. */
export async function getUserPoster(posterId: string, userId: string): Promise<PosterDocument> {
  if (!Types.ObjectId.isValid(posterId)) {
    throw new NotFoundError('Poster not found');
  }

  const poster = await Poster.findOne({ _id: posterId, userId });
  if (!poster) {
    throw new NotFoundError('Poster not found');
  }

  return poster;
}

export async function deletePoster(posterId: string, userId: string): Promise<void> {
  const poster = await getUserPoster(posterId, userId);

  const assets = [poster.outputPublicId, ...poster.photos.map((photo) => photo.publicId)].filter(
    (value): value is string => Boolean(value),
  );

  for (const publicId of assets) {
    await storage().deleteAsset(publicId).catch((error: unknown) => {
      logger.warn('Could not delete asset during poster delete', {
        posterId,
        publicId,
        message: (error as Error).message,
      });
    });
  }

  await poster.deleteOne();
  logger.info('Poster deleted', { posterId, userId });
}

