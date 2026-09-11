import crypto from 'crypto';
import mongoose from 'mongoose';
import { Document } from '../../models/Document.js';
import { DocumentChunk } from '../../models/DocumentChunk.js';
import { chunkingService } from './chunkingService.js';
import { embeddingService } from '../embeddings/embeddingService.js';
import { retrievalService } from './retrievalService.js';
import { ENV } from '../../config/env.js';
import { recordRAGIndexing } from '../../utils/metrics.js';

export class RagService {
  /**
   * Safely indexes or re-indexes a document using an atomic generation swap.
   * Preserves previous working index if embedding generation fails midway.
   * @param {string | mongoose.Types.ObjectId} userId
   * @param {string} documentId
   */
  async indexDocument(userId, documentId) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new Error('Invalid document ID provided for indexing.');
    }

    const startHr = process.hrtime.bigint();
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // 1. Fetch document and verify ownership
    const doc = await Document.findOne({ _id: documentId, userId: userObjectId });
    if (!doc) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'failed', durationMs });
      throw new Error('Document not found or unauthorized.');
    }

    if (doc.status !== 'ready') {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'failed', durationMs });
      throw new Error(`Document is in "${doc.status}" state and cannot be indexed. Only ready documents can be indexed.`);
    }

    if (!doc.extractedText || doc.extractedText.trim().length === 0) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'failed', durationMs });
      throw new Error('Document has no extractable text content to index.');
    }

    // 2. Check user total chunk limits
    const existingTotalChunks = await DocumentChunk.countDocuments({ userId: userObjectId });
    if (existingTotalChunks >= (ENV.MAX_TOTAL_CHUNKS_PER_USER || 2500)) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'failed', durationMs });
      throw new Error(
        `User chunk quota exceeded (${existingTotalChunks}/${ENV.MAX_TOTAL_CHUNKS_PER_USER || 2500} chunks). Please delete unneeded documents before indexing new ones.`
      );
    }

    // 3. Create new generation UUID
    const newGenId = crypto.randomUUID();
    const previousGenId = doc.activeGenerationId;

    // Update status to processing without destroying old active generation
    doc.indexingStatus = 'processing';
    doc.indexingError = null;
    await doc.save();

    let chunksToInsert = [];

    try {
      // Step A: Chunk text
      const rawChunks = chunkingService.chunkDocument(doc, newGenId);
      if (rawChunks.length === 0) {
        throw new Error('Document produced 0 valid text chunks.');
      }

      // Step B: Generate embeddings in batches
      const embeddings = await embeddingService.generateBatchEmbeddings(rawChunks);
      if (embeddings.length !== rawChunks.length) {
        throw new Error(`Embedding count mismatch: expected ${rawChunks.length}, received ${embeddings.length}`);
      }

      // Step C: Prepare chunk documents
      chunksToInsert = rawChunks.map((chunk, index) => ({
        userId: userObjectId,
        documentId: doc._id,
        generationId: newGenId,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        textLength: chunk.textLength,
        embedding: embeddings[index],
        embeddingModel: ENV.EMBEDDING_MODEL || 'gemini-embedding-2',
        embeddingVersion: 'v1',
        metadata: chunk.metadata,
      }));

      // Step D: Bulk insert new generation chunks
      await DocumentChunk.insertMany(chunksToInsert);

      // Step E: ATOMIC SWITCH — update document to new generation
      doc.activeGenerationId = newGenId;
      doc.indexingStatus = 'indexed';
      doc.chunkCount = chunksToInsert.length;
      doc.indexedAt = new Date();
      doc.indexingError = null;
      await doc.save();

      // Step F: CLEANUP — delete older generations for this document
      if (previousGenId) {
        await DocumentChunk.deleteMany({
          userId: userObjectId,
          documentId: doc._id,
          generationId: { $ne: newGenId },
        });
      }

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'success', durationMs });

      return {
        success: true,
        document: doc.toJSON(),
        chunkCount: chunksToInsert.length,
        generationId: newGenId,
      };
    } catch (err) {
      console.error(`🔴 [RAG Indexing Error for Doc ${doc._id}]:`, err.message);

      // Rollback: delete partial new generation chunks
      try {
        await DocumentChunk.deleteMany({
          userId: userObjectId,
          documentId: doc._id,
          generationId: newGenId,
        });
      } catch (cleanupErr) {
        console.warn('Chunk rollback cleanup warning:', cleanupErr.message);
      }

      // Preserve existing active generation if previously working
      doc.indexingStatus = previousGenId ? 'indexed' : 'failed';
      doc.indexingError = err.message || 'Indexing failed';
      await doc.save();

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordRAGIndexing({ outcome: 'failed', durationMs });

      throw err;
    }
  }

  /**
   * Batch index all ready, unindexed documents for a user
   */
  async indexAllDocuments(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const unindexedDocs = await Document.find({
      userId: userObjectId,
      status: 'ready',
      indexingStatus: { $in: ['unindexed', 'failed'] },
    }).limit(10);

    const results = [];
    for (const doc of unindexedDocs) {
      try {
        const indexed = await this.indexDocument(userObjectId, doc._id.toString());
        results.push({ documentId: doc._id.toString(), success: true, chunkCount: indexed.chunkCount });
      } catch (err) {
        results.push({ documentId: doc._id.toString(), success: false, error: err.message });
      }
    }

    return results;
  }

  /**
   * Retrieves chunk preview by ID strictly scoped to authenticated user (IDOR protected)
   */
  async getChunkPreview(userId, chunkId) {
    if (!mongoose.Types.ObjectId.isValid(chunkId)) {
      return null;
    }
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const chunk = await DocumentChunk.findOne({
      _id: chunkId,
      userId: userObjectId,
    });

    if (!chunk) {
      return null;
    }

    return {
      id: chunk._id.toString(),
      documentId: chunk.documentId.toString(),
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      textLength: chunk.textLength,
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
    };
  }

  /**
   * Aggregates Knowledge Base stats for user
   */
  async getUserRagStats(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const [chunkCount, indexedDocCount, totalDocCount] = await Promise.all([
      DocumentChunk.countDocuments({ userId: userObjectId }),
      Document.countDocuments({ userId: userObjectId, indexingStatus: 'indexed' }),
      Document.countDocuments({ userId: userObjectId }),
    ]);

    return {
      chunkCount,
      maxChunks: ENV.MAX_TOTAL_CHUNKS_PER_USER || 2500,
      indexedDocCount,
      totalDocCount,
      isKnowledgeBaseReady: indexedDocCount > 0,
    };
  }
}

export const ragService = new RagService();
