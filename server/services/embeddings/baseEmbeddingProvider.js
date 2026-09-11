/**
 * Abstract Base Embedding Provider Contract
 */
export class BaseEmbeddingProvider {
  /**
   * Generates a 768-dimensional float embedding vector for a single text input.
   * @param {string} text Formatted input text
   * @returns {Promise<number[]>} 768-dimensional vector
   */
  async embedText(text) {
    throw new Error('embedText() must be implemented by embedding provider subclass');
  }

  /**
   * Generates embeddings for a batch of formatted text inputs.
   * @param {string[]} texts Array of formatted texts
   * @returns {Promise<number[][]>} Array of 768-dimensional vectors
   */
  async embedBatch(texts) {
    throw new Error('embedBatch() must be implemented by embedding provider subclass');
  }
}
