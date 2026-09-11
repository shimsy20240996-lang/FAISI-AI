import mongoose from 'mongoose';
import { DocumentChunk } from '../../models/DocumentChunk.js';
import { Document } from '../../models/Document.js';
import { ENV } from '../../config/env.js';

/**
 * Calculates Cosine Similarity between two numeric vectors.
 * Sc = (A . B) / (||A|| * ||B||)
 */
export function computeCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = vecA.length;

  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Dual-Engine Vector Store Service
 * Production: MongoDB Atlas $vectorSearch with index pre-filtering
 * Local/CI: In-Memory Cosine Similarity over authenticated user chunks
 */
export class VectorStore {
  constructor() {
    this.type = ENV.VECTOR_STORE_TYPE || 'mongodb_atlas';
  }

  /**
   * Search candidate chunks matching query vector with strict tenant isolation.
   * @param {{
   *   userId: string | mongoose.Types.ObjectId,
   *   queryVector: number[],
   *   selectedDocIds?: string[],
   *   topK?: number,
   *   similarityThreshold?: number
   * }} params
   * @returns {Promise<Array<{ chunk: Object, score: number }>>}
   */
  async search({ userId, queryVector, selectedDocIds = [], topK, similarityThreshold }) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const k = topK || ENV.RAG_TOP_K || 5;
    const threshold = similarityThreshold !== undefined ? similarityThreshold : ENV.RAG_SIMILARITY_THRESHOLD || 0.65;
    const numCandidates = Math.max(ENV.RAG_NUM_CANDIDATES || 50, k * 5);

    if (this.type === 'mongodb_atlas') {
      return await this.searchAtlas({
        userObjectId,
        queryVector,
        selectedDocIds,
        k,
        numCandidates,
        threshold,
      });
    }

    return await this.searchLocalMemory({
      userObjectId,
      queryVector,
      selectedDocIds,
      k,
      threshold,
    });
  }

  /**
   * Production MongoDB Atlas $vectorSearch implementation with index-level pre-filtering
   */
  async searchAtlas({ userObjectId, queryVector, selectedDocIds, k, numCandidates, threshold }) {
    // Build pre-filter
    const preFilter = {
      userId: userObjectId,
    };

    if (Array.isArray(selectedDocIds) && selectedDocIds.length > 0) {
      preFilter.documentId = {
        $in: selectedDocIds.map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)),
      };
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector,
          numCandidates,
          limit: k * 3, // Fetch extra for threshold/diversity filtering
          filter: preFilter,
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          documentId: 1,
          generationId: 1,
          chunkId: 1,
          chunkIndex: 1,
          text: 1,
          textLength: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    try {
      const results = await DocumentChunk.aggregate(pipeline);

      // Verify active generations and apply threshold
      const activeDocs = await Document.find({
        userId: userObjectId,
        indexingStatus: 'indexed',
      }).select('_id activeGenerationId');

      const activeGenMap = new Map(
        activeDocs.map((d) => [d._id.toString(), d.activeGenerationId])
      );

      const filtered = results
        .filter((item) => {
          const docActiveGen = activeGenMap.get(item.documentId.toString());
          return docActiveGen && docActiveGen === item.generationId && item.score >= threshold;
        })
        .slice(0, k)
        .map((item) => ({
          chunk: {
            id: item._id.toString(),
            documentId: item.documentId.toString(),
            chunkId: item.chunkId,
            chunkIndex: item.chunkIndex,
            text: item.text,
            textLength: item.textLength,
            metadata: item.metadata,
          },
          score: item.score,
        }));

      return filtered;
    } catch (err) {
      // Production Invariant: Fail safely, do NOT silently fall back to memory dumping
      console.error('🔴 [Atlas Vector Search Error]:', err.message);
      throw new Error(`MongoDB Atlas Vector Search failed: ${err.message}`);
    }
  }

  /**
   * Local / CI in-memory vector search over authenticated user chunks
   */
  async searchLocalMemory({ userObjectId, queryVector, selectedDocIds, k, threshold }) {
    // 1. Find active indexed documents for this user
    const docQuery = {
      userId: userObjectId,
      indexingStatus: 'indexed',
      activeGenerationId: { $ne: null },
    };

    if (Array.isArray(selectedDocIds) && selectedDocIds.length > 0) {
      docQuery._id = {
        $in: selectedDocIds.map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)),
      };
    }

    const activeDocs = await Document.find(docQuery).select('_id activeGenerationId originalName');
    if (activeDocs.length === 0) {
      return [];
    }

    const activeGenIds = activeDocs.map((d) => d.activeGenerationId);
    const activeDocIds = activeDocs.map((d) => d._id);

    // 2. Fetch candidate chunks belonging strictly to active generations
    const chunks = await DocumentChunk.find({
      userId: userObjectId,
      documentId: { $in: activeDocIds },
      generationId: { $in: activeGenIds },
    });

    if (chunks.length === 0) {
      return [];
    }

    // 3. Compute cosine similarity
    const scoredChunks = [];
    for (const chunk of chunks) {
      const score = computeCosineSimilarity(queryVector, chunk.embedding);
      if (score >= threshold) {
        scoredChunks.push({
          chunk: {
            id: chunk._id.toString(),
            documentId: chunk.documentId.toString(),
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            textLength: chunk.textLength,
            metadata: chunk.metadata,
          },
          score,
        });
      }
    }

    // 4. Sort descending by score and apply top-K with document diversity
    scoredChunks.sort((a, b) => b.score - a.score);

    const result = [];
    const docCounts = new Map();

    for (const item of scoredChunks) {
      const docId = item.chunk.documentId;
      const count = docCounts.get(docId) || 0;
      if (count < 3) {
        // Max 3 chunks from same document for diversity
        result.push(item);
        docCounts.set(docId, count + 1);
      }
      if (result.length >= k) {
        break;
      }
    }

    return result;
  }
}

export const vectorStore = new VectorStore();
