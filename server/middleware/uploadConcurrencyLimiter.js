import { ENV } from '../config/env.js';

/**
 * Upload Concurrency Manager.
 * Establishes a bounded concurrency mechanism over in-memory multipart uploads,
 * protecting server RAM against unbounded concurrent memory accumulation.
 */
export class UploadConcurrencyManager {
  constructor({
    maxGlobal = ENV.MAX_CONCURRENT_UPLOADS || 10,
    maxPerUser = ENV.MAX_CONCURRENT_UPLOADS_PER_USER || 2,
  } = {}) {
    this.maxGlobal = maxGlobal;
    this.maxPerUser = maxPerUser;
    this.activeGlobal = 0;
    this.activePerUser = new Map();
  }

  /**
   * Attempts to acquire an upload concurrency slot.
   * @param {string} userKey - Canonical user identifier (e.g. req.user.id)
   * @returns {{ success: boolean, reason?: string, release?: () => void }}
   */
  acquire(userKey = 'anonymous') {
    if (this.activeGlobal >= this.maxGlobal) {
      return {
        success: false,
        reason: 'GLOBAL_LIMIT_EXCEEDED',
      };
    }

    const userActive = this.activePerUser.get(userKey) || 0;
    if (userActive >= this.maxPerUser) {
      return {
        success: false,
        reason: 'USER_LIMIT_EXCEEDED',
      };
    }

    // Increment counters
    this.activeGlobal += 1;
    this.activePerUser.set(userKey, userActive + 1);

    let isReleased = false;
    const release = () => {
      if (isReleased) return;
      isReleased = true;

      this.activeGlobal = Math.max(0, this.activeGlobal - 1);
      const current = this.activePerUser.get(userKey) || 0;
      if (current <= 1) {
        this.activePerUser.delete(userKey);
      } else {
        this.activePerUser.set(userKey, current - 1);
      }
    };

    return {
      success: true,
      release,
    };
  }

  /**
   * Current active upload count globally.
   * @returns {number}
   */
  getActiveGlobal() {
    return this.activeGlobal;
  }

  /**
   * Current active upload count for a user key.
   * @param {string} userKey
   * @returns {number}
   */
  getActiveForUser(userKey) {
    return this.activePerUser.get(userKey) || 0;
  }

  /**
   * Resets all internal counters (for testing and teardown).
   */
  reset() {
    this.activeGlobal = 0;
    this.activePerUser.clear();
  }
}

export const globalUploadConcurrencyManager = new UploadConcurrencyManager();

/**
 * Creates an Express middleware to enforce bounded upload concurrency before Multer memory allocation.
 * @param {UploadConcurrencyManager} [manager=globalUploadConcurrencyManager]
 * @returns {import('express').RequestHandler}
 */
export function createUploadConcurrencyGuard(manager = globalUploadConcurrencyManager) {
  return function uploadConcurrencyGuard(req, res, next) {
    const userKey = req.user?.id || req.ip || 'anonymous';
    const result = manager.acquire(userKey);

    if (!result.success) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'UPLOAD_CONCURRENCY_LIMIT',
          message: 'Upload capacity is temporarily busy. Please try again shortly.',
        },
      });
    }

    const releaseSlot = result.release;

    // Guaranteed release on response completion, abort, or close
    res.on('finish', releaseSlot);
    res.on('close', releaseSlot);

    next();
  };
}

export const uploadConcurrencyGuard = createUploadConcurrencyGuard(globalUploadConcurrencyManager);
