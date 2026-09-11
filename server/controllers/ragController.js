import { ragService } from '../services/rag/ragService.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { Document } from '../models/Document.js';

export class RagController {
  /**
   * Index or re-index a single document (Safe generation-swapped)
   * POST /api/documents/:id/index
   */
  async indexDocument(req, res, next) {
    try {
      const result = await ragService.indexDocument(req.user.id, req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Document successfully indexed into Knowledge Base.',
        document: result.document,
        chunkCount: result.chunkCount,
        generationId: result.generationId,
      });
    } catch (err) {
      const errMsg = err.message || 'Failed to index document';

      if (errMsg.includes('not found') || errMsg.includes('unauthorized')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found.',
          },
        });
      }

      if (errMsg.includes('quota exceeded') || errMsg.includes('limit reached')) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errMsg,
          },
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'INDEXING_FAILED',
          message: errMsg,
        },
      });
    }
  }

  /**
   * Batch index all ready, unindexed documents
   * POST /api/documents/index-all
   */
  async indexAllDocuments(req, res, next) {
    try {
      const results = await ragService.indexAllDocuments(req.user.id);
      return res.status(200).json({
        success: true,
        results,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'BATCH_INDEXING_FAILED',
          message: err.message || 'Failed to batch index documents.',
        },
      });
    }
  }

  /**
   * Direct Semantic Search against authenticated user's Knowledge Base
   * POST /api/rag/search
   */
  async searchKnowledgeBase(req, res, next) {
    try {
      const { query, selectedDocIds, topK } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Search query text is required.',
          },
        });
      }

      // Validate selectedDocIds ownership
      let verifiedDocIds = [];
      if (Array.isArray(selectedDocIds) && selectedDocIds.length > 0) {
        const ownedDocs = await Document.find({
          _id: { $in: selectedDocIds },
          userId: req.user.id,
        }).select('_id');
        verifiedDocIds = ownedDocs.map((d) => d._id.toString());
      }

      const retrieval = await retrievalService.retrieveContext({
        userId: req.user.id,
        query,
        selectedDocIds: verifiedDocIds,
        topK: topK ? parseInt(topK, 10) : undefined,
      });

      return res.status(200).json({
        success: true,
        hasEvidence: retrieval.hasEvidence,
        sources: retrieval.sources,
        resultCount: retrieval.sources.length,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: err.message || 'Knowledge Base search failed.',
        },
      });
    }
  }

  /**
   * Retrieve chunk preview by ID (IDOR protected)
   * GET /api/rag/chunks/:id
   */
  async getChunkPreview(req, res, next) {
    try {
      const chunk = await ragService.getChunkPreview(req.user.id, req.params.id);

      if (!chunk) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CHUNK_NOT_FOUND',
            message: 'Knowledge chunk not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        chunk,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_CHUNK_FAILED',
          message: 'Failed to retrieve chunk preview.',
        },
      });
    }
  }

  /**
   * Get user Knowledge Base statistics
   * GET /api/rag/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await ragService.getUserRagStats(req.user.id);
      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_STATS_FAILED',
          message: 'Failed to retrieve Knowledge Base stats.',
        },
      });
    }
  }
}

export const ragController = new RagController();
