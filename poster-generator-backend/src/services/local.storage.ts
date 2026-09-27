import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  assertSupportedContentType,
  buildSafeKey,
  extensionFor,
  type StorageService,
  type StoredAsset,
} from './storage.service';

/**
 * Filesystem-backed storage for local development and single-host deployments.
 * Assets are written under LOCAL_STORAGE_DIR and served by express.static.
 */
export class LocalStorageService implements StorageService {
  readonly name = 'local';

  private readonly root: string;

  constructor(rootDir: string = env.LOCAL_STORAGE_DIR) {
    this.root = path.resolve(process.cwd(), rootDir);
  }

  async uploadImage(input: {
    buffer: Buffer;
    filename: string;
    contentType: string;
    folder?: string;
  }): Promise<StoredAsset> {
    assertSupportedContentType(input.contentType);

    const key = buildSafeKey(input.folder ?? 'uploads', extensionFor(input.contentType));
    const absolute = path.join(this.root, key);

    // Defence in depth: confirm the resolved path stays inside the storage root.
    if (!absolute.startsWith(this.root + path.sep)) {
      throw new Error('Resolved storage path escaped the storage root');
    }

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, input.buffer);

    logger.debug('Stored asset locally', { key, bytes: input.buffer.length });

    return {
      url: `/uploads/${key}`,
      publicId: key,
      bytes: input.buffer.length,
      contentType: input.contentType,
    };
  }

  async deleteAsset(publicId: string): Promise<void> {
    const absolute = path.join(this.root, publicId);
    if (!absolute.startsWith(this.root + path.sep)) return;
    await fs.rm(absolute, { force: true });
  }

  /** Test helper: a stable, unique folder per run. */
  static scratchFolder(prefix = 'test'): string {
    return `${prefix}/${randomUUID()}`;
  }
}
