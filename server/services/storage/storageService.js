import { localStorageProvider } from './localStorageProvider.js';

/**
 * Storage Service Abstraction
 * Allows pluggable storage backends (Local FS, S3, GCS) without controller changes.
 */
class StorageService {
  constructor(provider = localStorageProvider) {
    this.provider = provider;
  }

  async init() {
    if (typeof this.provider.init === 'function') {
      await this.provider.init();
    }
  }

  async save(storageKey, buffer) {
    return await this.provider.save(storageKey, buffer);
  }

  async read(storageKey) {
    return await this.provider.read(storageKey);
  }

  async delete(storageKey) {
    return await this.provider.delete(storageKey);
  }

  async exists(storageKey) {
    return await this.provider.exists(storageKey);
  }

  async stat(storageKey) {
    return await this.provider.stat(storageKey);
  }
}

export const storageService = new StorageService();
