import { createHash } from 'node:crypto';
import { logger } from '../utils/logger';
import { assertSupportedContentType, type StorageService, type StoredAsset } from './storage.service';

/**
 * Inlines the asset into the returned `url` as a `data:` URI, so nothing has to
 * be served from a filesystem. Useful on platforms that discard the container
 * filesystem on every deploy, where a `/uploads/...` path would 404 the moment
 * the process restarts.
 *
 * The renderer already passes `data:` URLs through untouched, and the
 * poster HTML is loaded into Chromium as a `data:`/`about:blank` document, so
 * this needs no extra plumbing on the rendering side.
 *
 * Trade-off: the bytes live in the document that references them, so this suits
 * a small, fixed set of assets (seeded template artwork) rather than unbounded
 * user uploads, which should go to Cloudinary or a persistent disk.
 */
export class DataUriStorageService implements StorageService {
  readonly name = 'datauri';

  async uploadImage(input: {
    buffer: Buffer;
    filename: string;
    contentType: string;
    folder?: string;
  }): Promise<StoredAsset> {
    assertSupportedContentType(input.contentType);

    const digest = createHash('sha256').update(input.buffer).digest('hex').slice(0, 32);
    const folder = input.folder ?? 'uploads';
    const publicId = `datauri/${folder}/${digest}`;

    logger.debug('Inlined asset as data URI', { publicId, bytes: input.buffer.length });

    return {
      url: `data:${input.contentType};base64,${input.buffer.toString('base64')}`,
      publicId,
      bytes: input.buffer.length,
      contentType: input.contentType,
    };
  }

  async deleteAsset(_publicId: string): Promise<void> {
    // Nothing is persisted outside the referencing document, so there is
    // nothing to remove. The caller is responsible for the document itself.
  }
}
