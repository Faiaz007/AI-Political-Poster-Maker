import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env, isCloudinaryConfigured } from '../config/env';
import { ExternalServiceError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  assertSupportedContentType,
  buildSafeKey,
  extensionFor,
  type StorageService,
  type StoredAsset,
} from './storage.service';

export class CloudinaryStorageService implements StorageService {
  readonly name = 'cloudinary';

  private configured = false;

  private ensureConfigured(): void {
    if (this.configured) return;

    if (!isCloudinaryConfigured) {
      throw new ExternalServiceError('Storage', 'Cloudinary credentials are not configured');
    }

    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    this.configured = true;
  }

  async uploadImage(input: {
    buffer: Buffer;
    filename: string;
    contentType: string;
    folder?: string;
  }): Promise<StoredAsset> {
    this.ensureConfigured();
    assertSupportedContentType(input.contentType);

    const key = buildSafeKey(input.folder ?? 'uploads', extensionFor(input.contentType));

    try {
      // Cloudinary's typings only accept a path string; a data URI is the
      // documented way to pass an in-memory buffer without touching disk.
      const dataUri = `data:${input.contentType};base64,${input.buffer.toString('base64')}`;

      const result = (await cloudinary.uploader.upload(dataUri, {
        public_id: key,
        resource_type: 'image',
        // The original file type is preserved so posters stay lossless for print.
        format: extensionFor(input.contentType),
        overwrite: false,
        colors: true,
      })) as UploadApiResponse;

      logger.debug('Uploaded asset to Cloudinary', { publicId: result.public_id, bytes: result.bytes });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        contentType: input.contentType,
      };
    } catch (error) {
      logger.error('Cloudinary upload failed', { message: (error as Error).message });
      throw new ExternalServiceError('Storage', 'Could not store the image');
    }
  }

  async deleteAsset(publicId: string): Promise<void> {
    this.ensureConfigured();

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      // Deletion is best-effort: a leftover asset must not fail the user request.
      logger.warn('Cloudinary delete failed', { publicId, message: (error as Error).message });
    }
  }
}
