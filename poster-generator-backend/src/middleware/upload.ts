import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { ALLOWED_IMAGE_MIME, MAX_PHOTOS, MAX_PHOTO_BYTES } from '../schemas/common.schema';

export class UnsupportedImageTypeError extends Error {
  constructor(mimetype: string) {
    super(`Unsupported image type: ${mimetype}. Allowed: ${ALLOWED_IMAGE_MIME.join(', ')}`);
    this.name = 'UnsupportedImageTypeError';
  }
}

/**
 * Files are held in memory rather than written to a temp path: they go straight
 * to Sharp and the storage driver, so there is nothing to clean up even if the
 * request fails midway.
 */
const storage = multer.memoryStorage();

/**
 * The declared MIME type comes from the client and is trivially spoofed, so it
 * is only the first filter. The authoritative check is magic-byte sniffing in
 * `imageService.assertRealImage`, which runs after this middleware.
 */
function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.mimetype)) {
    cb(new UnsupportedImageTypeError(file.mimetype));
    return;
  }
  cb(null, true);
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: MAX_PHOTOS,
    fields: 20,
  },
});

/**
 * Both `photos` and `photos[]` are accepted. Browsers' FormData produces
 * `photos` when a key is appended repeatedly, while several HTTP clients
 * (curl examples, jQuery-style helpers) send `photos[]`; rejecting one of them
 * would be a needless integration trap.
 */
const acceptFields = multerUpload.fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'photos[]', maxCount: MAX_PHOTOS },
]);

/** Normalises multer's `fields()` output into a single ordered array. */
export function collectFiles(req: Request): Express.Multer.File[] {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!files) return [];
  return Object.values(files).flat();
}

/** Runs multer and guarantees `req.files` is a flat array for downstream code. */
export function uploadPhotos(req: Request, res: Response, next: NextFunction): void {
  acceptFields(req, res, (error: unknown) => {
    if (error) {
      next(error);
      return;
    }
    req.files = collectFiles(req) as unknown as Express.Multer.File[];
    next();
  });
}
