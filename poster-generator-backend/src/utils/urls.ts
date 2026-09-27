import { env } from '../config/env';

/**
 * Local storage hands back a path like `/uploads/templates/foo.png`. Chromium
 * cannot load a root-relative URL from a `data:`/`about:blank` document, so the
 * renderer needs an absolute origin. Cloudinary URLs are already absolute and
 * pass through untouched.
 */
export function toAbsoluteAssetUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}
