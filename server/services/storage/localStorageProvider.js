import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root storage directory outside public/dist/src
const STORAGE_ROOT = path.resolve(__dirname, '../../../', ENV.STORAGE_DIR);

/**
 * Ensures the target path is strictly contained within STORAGE_ROOT
 * to prevent directory traversal attacks.
 */
function resolveSafePath(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new Error('Invalid storage key');
  }

  // Normalize and resolve path
  const resolved = path.resolve(STORAGE_ROOT, storageKey);
  const normalizedRoot = path.normalize(STORAGE_ROOT);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('Path traversal detected in storage key');
  }

  return resolved;
}

export class LocalStorageProvider {
  constructor() {
    this.root = STORAGE_ROOT;
  }

  /**
   * Initialize root directory if not exists
   */
  async init() {
    await fs.mkdir(this.root, { recursive: true });
  }

  /**
   * Save a buffer to disk at storageKey
   * @param {string} storageKey Relative path e.g. "userId/docId.ext"
   * @param {Buffer} buffer File content buffer
   */
  async save(storageKey, buffer) {
    const fullPath = resolveSafePath(storageKey);
    const parentDir = path.dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { storageKey, fullPath, size: buffer.length };
  }

  /**
   * Read file buffer from disk
   * @param {string} storageKey
   * @returns {Promise<Buffer>}
   */
  async read(storageKey) {
    const fullPath = resolveSafePath(storageKey);
    return await fs.readFile(fullPath);
  }

  /**
   * Delete file from disk
   * @param {string} storageKey
   */
  async delete(storageKey) {
    try {
      const fullPath = resolveSafePath(storageKey);
      await fs.unlink(fullPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false; // Already deleted
      }
      throw err;
    }
  }

  /**
   * Check if file exists on disk
   * @param {string} storageKey
   */
  async exists(storageKey) {
    try {
      const fullPath = resolveSafePath(storageKey);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats (size, modified)
   * @param {string} storageKey
   */
  async stat(storageKey) {
    const fullPath = resolveSafePath(storageKey);
    return await fs.stat(fullPath);
  }
}

export const localStorageProvider = new LocalStorageProvider();
