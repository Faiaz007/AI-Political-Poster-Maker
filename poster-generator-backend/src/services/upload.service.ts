import { Types } from 'mongoose';
import { getStorageService } from '../services/storage.factory';
import { assertRealImage, normalisePhoto } from '../services/image.service';
import { MAX_PHOTOS } from '../schemas/common.schema';
import { UploadedPhoto } from '../models/UploadedPhoto';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { StoredAsset } from '../services/storage.service';

export interface UploadedPhoto {
  url: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Validates, normalises and stores each uploaded photo. The client filename is
 * never used — only the detected content type and a generated key.
 */
export async function storeUploadedPhotos(
  files: Express.Multer.File[],
  userId: string,
): Promise<UploadedPhoto[]> {
  if (files.length === 0) {
    throw new ValidationError('At least one photo is required');
  }

  if (files.length > MAX_PHOTOS) {
    throw new ValidationError(`You can upload at most ${MAX_PHOTOS} photos`);
  }

  const storage = getStorageService();
  const stored: UploadedPhoto[] = [];
  const uploadedAssets: StoredAsset[] = [];

  try {
    for (const [index, file] of files.entries()) {
      await assertRealImage(file.buffer, file.mimetype);
      const normalised = await normalisePhoto(file.buffer);
      // Dimensions are the normalised ones, so the recorded size is exactly what
      // the renderer will paint.
      const { width, height } = normalised;

      const asset = await storage.uploadImage({
        buffer: normalised.buffer,
        filename: `photo-${index + 1}.jpg`,
        contentType: normalised.contentType,
        folder: `posters/${userId}`,
      });

      uploadedAssets.push(asset);

      stored.push({
        url: asset.url,
        publicId: asset.publicId,
        width,
        height,
        bytes: asset.bytes,
      });

      await UploadedPhoto.create({
        userId: new Types.ObjectId(userId),
        publicId: asset.publicId,
        url: asset.url,
        width,
        height,
        bytes: asset.bytes,
        contentType: asset.contentType,
      });

      logger.info('Photo stored', {
        userId,
        index,
        originalBytes: file.size,
        storedBytes: asset.bytes,
        width,
        height,
      });
    }
  } catch (error) {
    // Roll back both the files and the records: a half-uploaded poster is worse
    // than none at all, and an orphaned record would let a phantom photo be
    // referenced by a later poster.
    await Promise.allSettled(
      uploadedAssets.map((asset) => storage.deleteAsset(asset.publicId)),
    );
    await Promise.allSettled(
      uploadedAssets.map((asset) => UploadedPhoto.deleteOne({ publicId: asset.publicId })),
    );
    throw error;
  }

  return stored;
}
