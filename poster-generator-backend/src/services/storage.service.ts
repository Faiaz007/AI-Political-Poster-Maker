/**
 * Storage is an interface so the rest of the app never imports a vendor SDK
 * directly. Swapping Cloudinary for S3 (or a local disk) touches only this
 * directory plus the factory below.
 */
export interface StoredAsset {
  url: string;
  publicId: string;
  bytes: number;
  contentType: string;
}

export interface StorageService {
  readonly name: string;
  uploadImage(input: {
    buffer: Buffer;
    /** Caller-supplied hint; implementations must not trust it as a path. */
    filename: string;
    contentType: string;
    folder?: string;
  }): Promise<StoredAsset>;
  deleteAsset(publicId: string): Promise<void>;
}

export class UnsupportedMimeTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported image type: ${contentType}`);
    this.name = 'UnsupportedMimeTypeError';
  }
}

export const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export function assertSupportedContentType(contentType: string): asserts contentType is SupportedContentType {
  if (!(SUPPORTED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new UnsupportedMimeTypeError(contentType);
  }
}

/**
 * Generates a storage-safe key. The client filename is deliberately discarded:
 * it is attacker-controlled and may contain path traversal or shell metacharacters.
 */
export function buildSafeKey(folder: string, extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(36).slice(2, 10);
  return `${folder}/${stamp}-${random}.${extension}`;
}

export function extensionFor(contentType: SupportedContentType): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}
