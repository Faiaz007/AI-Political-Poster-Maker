import sharp from 'sharp';
import { ALLOWED_IMAGE_MIME, MAX_PHOTO_BYTES } from '../schemas/common.schema';
import { ValidationError } from '../utils/errors';

/** Longest edge kept for a poster photo. Print slots never exceed ~1200 px. */
const MAX_PHOTO_EDGE = 1400;

/** Signature prefixes for the formats we accept, checked against real bytes. */
const MAGIC_NUMBERS: Array<{ mime: (typeof ALLOWED_IMAGE_MIME)[number]; test: (buf: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageMime(buffer: Buffer): (typeof ALLOWED_IMAGE_MIME)[number] | null {
  const match = MAGIC_NUMBERS.find((candidate) => candidate.test(buffer));
  return match?.mime ?? null;
}

/**
 * Re-reads the file with Sharp to confirm it is a genuine raster image and to
 * extract dimensions. A renamed `.exe` or an HTML polyglot passes the MIME
 * check but fails here.
 */
export async function assertRealImage(
  buffer: Buffer,
  declaredMime: string,
): Promise<{ width: number; height: number; mime: (typeof ALLOWED_IMAGE_MIME)[number] }> {
  if (buffer.length === 0) {
    throw new ValidationError('An uploaded file was empty');
  }

  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new ValidationError('Each image must be 10 MB or smaller');
  }

  const actualMime = detectImageMime(buffer);
  if (!actualMime) {
    throw new ValidationError('That file is not a JPEG, PNG or WebP image');
  }

  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(declaredMime)) {
    throw new ValidationError(`Unsupported image type: ${declaredMime}`);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new ValidationError('That image could not be read — it may be corrupted');
  }

  if (!metadata.width || !metadata.height) {
    throw new ValidationError('That image has no readable dimensions');
  }

  if (metadata.width < 200 || metadata.height < 200) {
    throw new ValidationError('Photos must be at least 200x200 pixels');
  }

  return { width: metadata.width, height: metadata.height, mime: actualMime };
}

/**
 * Normalises an uploaded photo for rendering: strips EXIF (which can carry GPS
 * coordinates the user never meant to share), rotates to upright, caps the
 * longest edge, and re-encodes as progressive JPEG at print-friendly quality.
 */
export async function normalisePhoto(buffer: Buffer): Promise<{
  buffer: Buffer;
  contentType: 'image/jpeg';
  width: number;
  height: number;
}> {
  const pipeline = sharp(buffer, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({
      width: MAX_PHOTO_EDGE,
      height: MAX_PHOTO_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, progressive: true, mozjpeg: true });

  // resolveWithObject returns the output dimensions from this same decode, so
  // recording the normalised size costs no extra image pass.
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return { buffer: data, contentType: 'image/jpeg', width: info.width, height: info.height };
}
