import { geminiEmbeddingProvider } from './providers/geminiEmbeddingProvider.js';
import { ENV } from '../../config/env.js';
import { TimeoutError } from '../../utils/errors.js';

/**
 * Deterministically formats document chunk text for gemini-embedding-2.
 * Pattern: `title: {title} | text: {content}`
 * @param {{ title: string, text: string }} params
 * @returns {string} Formatted input text
 */
export function formatDocumentEmbeddingInput({ title, text }) {
  const cleanTitle = (title || 'Document').replace(/[\r\n]+/g, ' ').trim();
  const cleanText = (text || '').trim();
  return `title: ${cleanTitle} | text: ${cleanText}`;
}

/**
 * Deterministically formats user search query text for gemini-embedding-2.
 * Pattern: `task: question answering | query: {query}`
 * @param {string} query
 * @returns {string} Formatted query text
 */
export function formatQueryEmbeddingInput(query) {
  const cleanQuery = (query || '').replace(/[\r\n]+/g, ' ').trim();
  return `task: question answering | query: ${cleanQuery}`;
}

/**
 * Central Embedding Service Abstraction
 * Manages provider delegation, deterministic formatting, batching, timeouts, and retries.
 */
export class EmbeddingService {
  constructor(provider = geminiEmbeddingProvider) {
    this.provider = provider;
  }

  /**
   * Helper: executes an async operation with exponential retry on rate limits (429/503)
   */
  async withRetry(fn, maxRetries = 3) {
    let delay = 1000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isRateLimit =
          err.statusCode === 429 ||
          err.statusCode === 503 ||
          (err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')));

        if (attempt === maxRetries || !isRateLimit) {
          throw err;
        }

        const jitter = Math.floor(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay *= 2;
      }
    }
  }

  /**
   * Helper: executes an async operation with timeout protection
   */
  async withTimeout(promise, timeoutMs = ENV.EMBEDDING_TIMEOUT_MS || 15000) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new TimeoutError(`Embedding operation timed out after ${timeoutMs / 1000} seconds.`));
      }, timeoutMs);
      if (typeof timeoutHandle.unref === 'function') {
        timeoutHandle.unref();
      }
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      return result;
    } catch (err) {
      clearTimeout(timeoutHandle);
      throw err;
    }
  }

  /**
   * Generates a 768-dimensional float embedding for a single document text or query.
   * @param {string} text Raw text content
   * @param {{ isQuery?: boolean, title?: string }} options
   * @returns {Promise<number[]>} 768-dim float vector
   */
  async generateEmbedding(text, { isQuery = false, title = '' } = {}) {
    const formatted = isQuery
      ? formatQueryEmbeddingInput(text)
      : formatDocumentEmbeddingInput({ title, text });

    return await this.withRetry(async () => {
      return await this.withTimeout(this.provider.embedText(formatted));
    });
  }

  /**
   * Generates embeddings for an array of document chunks in configurable batches.
   * @param {Array<{ text: string, title?: string }>} items
   * @returns {Promise<number[][]>} Array of 768-dim float vectors
   */
  async generateBatchEmbeddings(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const batchSize = Math.min(Math.max(ENV.EMBEDDING_BATCH_SIZE || 20, 1), 50);
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const formattedTexts = batch.map((item) =>
        formatDocumentEmbeddingInput({ title: item.title, text: item.text })
      );

      const batchVectors = await this.withRetry(async () => {
        return await this.withTimeout(this.provider.embedBatch(formattedTexts));
      });

      results.push(...batchVectors);
    }

    return results;
  }
}

export const embeddingService = new EmbeddingService();
