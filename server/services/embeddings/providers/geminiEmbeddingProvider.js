import { GoogleGenAI } from '@google/genai';
import { BaseEmbeddingProvider } from '../baseEmbeddingProvider.js';
import { ENV } from '../../../config/env.js';
import { AIProviderError } from '../../../utils/errors.js';

/**
 * Official Google Gemini Embedding Provider implementing gemini-embedding-2
 * Strict Rules:
 * 1. Output dimensionality: 768
 * 2. Never passes taskType / task_type parameter to API
 * 3. Validates every returned vector has exactly 768 finite numeric values
 */
export class GeminiEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super();
    this.client = null;
    this.model = ENV.EMBEDDING_MODEL || 'gemini-embedding-2';
    this.dimensions = ENV.EMBEDDING_DIMENSIONS || 768;
  }

  getClient() {
    if (!ENV.GEMINI_API_KEY) {
      throw new AIProviderError(
        'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in your server environment.',
        500,
        'API_KEY_MISSING'
      );
    }

    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: ENV.GEMINI_API_KEY,
        httpOptions: {
          apiVersion: 'v1',
        },
      });
    }

    return this.client;
  }

  /**
   * Validates that a vector is an array of exactly 768 finite numbers
   */
  validateVector(vector) {
    if (!Array.isArray(vector) || vector.length !== this.dimensions) {
      throw new Error(`Invalid embedding vector: expected ${this.dimensions} dimensions, got ${vector?.length || 0}`);
    }
    for (let i = 0; i < vector.length; i++) {
      if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
        throw new Error(`Invalid embedding vector element at index ${i}: value is not a finite number`);
      }
    }
    return vector;
  }

  /**
   * Generates a 768-dimensional float embedding vector for a single text input.
   * @param {string} text Formatted input text
   * @returns {Promise<number[]>} 768-dimensional vector
   */
  async embedText(text) {
    const ai = this.getClient();

    try {
      const response = await ai.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          outputDimensionality: this.dimensions,
        },
      });

      const rawValues = response?.embedding?.values || response?.embeddings?.[0]?.values;
      if (!rawValues) {
        throw new Error('No embedding values returned from Gemini embedding API');
      }

      return this.validateVector(rawValues);
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError(
        `Gemini embedding generation failed: ${err.message}`,
        err.status || 502,
        err.code || 'EMBEDDING_ERROR'
      );
    }
  }

  /**
   * Generates embeddings for a batch of formatted text inputs.
   * @param {string[]} texts Array of formatted texts
   * @returns {Promise<number[][]>} Array of 768-dimensional vectors
   */
  async embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Process each text with bounded concurrency or sequential map
    const results = [];
    for (const text of texts) {
      const vector = await this.embedText(text);
      results.push(vector);
    }

    return results;
  }
}

export const geminiEmbeddingProvider = new GeminiEmbeddingProvider();
