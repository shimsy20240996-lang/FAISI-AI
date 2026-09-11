import rateLimit from 'express-rate-limit';
import { recordRateLimitRejection } from '../utils/metrics.js';

/**
 * User-Aware Key Generator.
 * Keys on authenticated user id if present, with client IP as fallback.
 */
export function getUserKey(req) {
  return req.user?.id || req.ip || 'anonymous';
}

/**
 * Helper to record rate limit rejection metrics while preserving standard response.
 * @param {string} limiter
 */
function createRateLimitHandler(limiter) {
  return (req, res, _next, options) => {
    recordRateLimitRejection({ limiter });
    res.status(options.statusCode).send(options.message);
  };
}

/**
 * Rate Limiter for Authentication Endpoints (Register / Login).
 * Mitigates brute-force and credential stuffing attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 authentication requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('auth'),
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Chat & Streaming Completions (Phase 9.2).
 * 30 requests per minute per user/IP.
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('chat'),
  message: {
    success: false,
    error: {
      message: 'Too many chat requests. Please wait a moment before sending more messages.',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for RAG Semantic Search Queries (Phase 9.2).
 * 30 searches per minute per user.
 */
export const ragSearchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('rag'),
  message: {
    success: false,
    error: {
      message: 'Too many Knowledge Base searches. Please wait a moment before searching again.',
      code: 'RAG_SEARCH_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Document Indexing Operations (Phase 9.2).
 * 10 indexing operations per 15 minutes per user.
 */
export const indexingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('indexing'),
  message: {
    success: false,
    error: {
      message: 'Too many document indexing requests. Please wait a few minutes before indexing more files.',
      code: 'INDEXING_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Document Uploads.
 * Limits heavy multipart upload requests.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 upload requests per 15 min per user/IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('upload'),
  message: {
    success: false,
    error: {
      message: 'Too many document uploads. Please wait a few minutes before uploading more files.',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Document AI Analysis.
 * Stricter limit due to expensive upstream AI generation.
 */
export const analysisRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 document analyses per 15 min per user/IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('analysis'),
  message: {
    success: false,
    error: {
      message: 'Too many document analysis requests. Please wait a few minutes before submitting more analyses.',
      code: 'ANALYSIS_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Image Uploads (Phase 8).
 * Max 30 requests per 15 min.
 */
export const imageUploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('media'),
  message: {
    success: false,
    error: {
      message: 'Too many image uploads. Please wait a few minutes before uploading more images.',
      code: 'IMAGE_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Audio Transcription (Phase 8).
 * Max 20 requests per 15 min.
 */
export const transcribeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('media'),
  message: {
    success: false,
    error: {
      message: 'Too many transcription requests. Please wait a few minutes before recording again.',
      code: 'TRANSCRIBE_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Rate Limiter for Text-to-Speech (Phase 8).
 * Max 20 requests per 15 min.
 */
export const ttsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  validate: { keyGeneratorIpFallback: false },
  handler: createRateLimitHandler('media'),
  message: {
    success: false,
    error: {
      message: 'Too many speech synthesis requests. Please wait a few minutes before generating more audio.',
      code: 'TTS_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Stream Concurrency Manager (Phase 9.2).
 * Strictly bounds active concurrent AI streams to max 2 per user.
 */
export class StreamConcurrencyManager {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.activeStreams = new Map();
  }

  acquire(key) {
    const current = this.activeStreams.get(key) || 0;
    if (current >= this.maxConcurrent) {
      return false;
    }
    this.activeStreams.set(key, current + 1);
    return true;
  }

  release(key) {
    const current = this.activeStreams.get(key) || 0;
    if (current <= 1) {
      this.activeStreams.delete(key);
    } else {
      this.activeStreams.set(key, current - 1);
    }
  }

  getActiveCount(key) {
    return this.activeStreams.get(key) || 0;
  }

  clear() {
    this.activeStreams.clear();
  }
}

export const streamConcurrencyManager = new StreamConcurrencyManager(2);



