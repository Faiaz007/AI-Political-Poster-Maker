import { env } from '../config/env';
import { CloudinaryStorageService } from './cloudinary.storage';
import { LocalStorageService } from './local.storage';
import type { StorageService } from './storage.service';

let instance: StorageService | null = null;

/**
 * Resolves the configured driver once and reuses it. Controllers and services
 * depend on the StorageService interface, never on a concrete vendor.
 */
export function getStorageService(): StorageService {
  if (instance) return instance;

  instance =
    env.STORAGE_DRIVER === 'cloudinary' ? new CloudinaryStorageService() : new LocalStorageService();

  return instance;
}

/** Test hook: forces the next call to build a fresh instance. */
export function resetStorageService(): void {
  instance = null;
}
