import { embeddingService } from '../embeddings/embeddingService.js';
import { vectorStore } from './vectorStore.js';
import { ENV } from '../../config/env.js';
import { recordRAGSearch } from '../../utils/metrics.js';

/**
 * Retrieval Service
 * Orchestrates query embedding, vector similarity search, and context assembly.
 */
export class RetrievalService {
  /**
   * Retrieves top relevant chunks for a user query with strict tenant isolation.
   * @param {{
   *   userId: string,
   *   query: string,
   *   selectedDocIds?: string[],
   *   topK?: number,
   *   similarityThreshold?: number
   * }} params
   * @returns {Promise<{
   *   hasEvidence: boolean,
   *   contextText: string,
   *   sources: Array<{
   *     sourceIndex: number,
   *     documentId: string,
   *     documentName: string,
   *     pageNumber: number | null,
   *     sectionTitle: string | null,
   *     snippet: string,
   *     score: number,
   *     chunkId: string
   *   }>
   * }>}
   */
  async retrieveContext({ userId, query, selectedDocIds = [], topK, similarityThreshold }) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        hasEvidence: false,
        contextText: '',
        sources: [],
      };
    }

    const startHr = process.hrtime.bigint();

    try {
      // 1. Normalize and bound query text
      const maxQueryChars = ENV.MAX_RAG_QUERY_CHARS || 500;
      const cleanQuery = query.trim().slice(0, maxQueryChars);

      // 2. Generate 768-dim query embedding vector
      const queryVector = await embeddingService.generateEmbedding(cleanQuery, { isQuery: true });

      // 3. Search vector store with pre-filtering
      const results = await vectorStore.search({
        userId,
        queryVector,
        selectedDocIds,
        topK: topK || ENV.RAG_TOP_K || 5,
        similarityThreshold: similarityThreshold !== undefined ? similarityThreshold : ENV.RAG_SIMILARITY_THRESHOLD || 0.65,
      });

      if (!results || results.length === 0) {
        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        recordRAGSearch({ outcome: 'no_evidence', durationMs });
        return {
          hasEvidence: false,
          contextText: '',
          sources: [],
        };
      }

      // 4. Build bounded context text and citation sources
      const maxContextChars = ENV.MAX_RAG_CONTEXT_CHARS || 12000;
      let accumulatedLength = 0;
      const contextParts = [];
      const sources = [];

      results.forEach((item, index) => {
        const sourceIndex = index + 1;
        const { chunk, score } = item;
        const sourceName = chunk.metadata?.sourceName || 'Document';
        const pageInfo = chunk.metadata?.pageNumber ? ` | Page ${chunk.metadata.pageNumber}` : '';
        const sectionInfo = chunk.metadata?.sectionTitle ? ` | Section: ${chunk.metadata.sectionTitle}` : '';

        const chunkSnippet = chunk.text.length > 200 ? chunk.text.slice(0, 197) + '...' : chunk.text;
        const formattedEntry = `[Source ${sourceIndex}: "${sourceName}"${pageInfo}${sectionInfo}]\n${chunk.text}\n`;

        if (accumulatedLength + formattedEntry.length <= maxContextChars) {
          contextParts.push(formattedEntry);
          accumulatedLength += formattedEntry.length;

          sources.push({
            sourceIndex,
            documentId: chunk.documentId,
            documentName: sourceName,
            pageNumber: chunk.metadata?.pageNumber || null,
            sectionTitle: chunk.metadata?.sectionTitle || null,
            snippet: chunkSnippet,
            score: Math.round(score * 100) / 100,
            chunkId: chunk.id,
          });
        }
      });

      const hasEvidence = sources.length > 0;
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGSearch({ outcome: hasEvidence ? 'success' : 'no_evidence', durationMs });

      return {
        hasEvidence,
        contextText: contextParts.join('\n'),
        sources,
      };
    } catch (err) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGSearch({ outcome: 'failed', durationMs });
      throw err;
    }
  }
}

export const retrievalService = new RetrievalService();
