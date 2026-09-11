import { documentService } from '../services/documents/documentService.js';
import { aiService } from '../services/ai/aiService.js';
import { ENV } from '../config/env.js';
import { recordDocumentUpload } from '../utils/metrics.js';

export class DocumentController {
  /**
   * Handle single document upload
   * POST /api/documents
   */
  async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        recordDocumentUpload({ status: 'rejected' });
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No file was uploaded. Please attach a PDF, DOCX, TXT, or CSV file under field "file".',
          },
        });
      }

      const result = await documentService.processUpload({
        userId: req.user.id,
        file: req.file,
      });

      recordDocumentUpload({ status: 'accepted' });
      const statusCode = result.isDuplicate ? 200 : 201;

      return res.status(statusCode).json({
        success: true,
        document: result.document.toJSON(),
        isDuplicate: result.isDuplicate,
        message: result.message || (result.isDuplicate ? 'Duplicate file detected' : 'Document uploaded successfully'),
      });
    } catch (err) {
      const errMsg = err.message || 'Failed to process document upload';

      if (errMsg.includes('limit') || errMsg.includes('quota') || errMsg.includes('Too many documents')) {
        recordDocumentUpload({ status: 'rejected' });
        return res.status(429).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errMsg,
          },
        });
      }

      if (
        errMsg.includes('Unsupported file format') ||
        errMsg.includes('mismatch') ||
        errMsg.includes('Invalid') ||
        errMsg.includes('empty') ||
        errMsg.includes('exceeds the maximum allowed limit')
      ) {
        recordDocumentUpload({ status: 'rejected' });
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE',
            message: errMsg,
          },
        });
      }

      recordDocumentUpload({ status: 'failed' });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'An internal error occurred while processing the document upload.',
        },
      });
    }
  }

  /**
   * List authenticated user's documents
   * GET /api/documents
   */
  async getDocuments(req, res, next) {
    try {
      const { limit, skip } = req.query;
      const data = await documentService.getUserDocuments(req.user.id, { limit, skip });

      return res.status(200).json({
        success: true,
        documents: data.documents.map((d) => d.toJSON()),
        total: data.total,
        limit: data.limit,
        skip: data.skip,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_DOCUMENTS_FAILED',
          message: 'Failed to retrieve documents.',
        },
      });
    }
  }

  /**
   * Get single document metadata
   * GET /api/documents/:id
   */
  async getDocument(req, res, next) {
    try {
      const doc = await documentService.getUserDocument(req.user.id, req.params.id);

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        document: doc.toJSON(),
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_DOCUMENT_FAILED',
          message: 'Failed to retrieve document metadata.',
        },
      });
    }
  }

  /**
   * Get bounded document extracted text/preview
   * GET /api/documents/:id/content
   */
  async getDocumentContent(req, res, next) {
    try {
      const content = await documentService.getDocumentContent(req.user.id, req.params.id);

      if (!content) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        content,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_CONTENT_FAILED',
          message: 'Failed to retrieve document content.',
        },
      });
    }
  }

  /**
   * Analyze document using Gemini AI with prompt-injection defense
   * POST /api/documents/:id/analyze
   */
  async analyzeDocument(req, res, next) {
    try {
      const { instruction } = req.body;

      if (instruction && typeof instruction !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INSTRUCTION',
            message: 'Instruction must be a valid text string.',
          },
        });
      }

      if (instruction && instruction.length > ENV.MAX_INSTRUCTION_CHARS) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSTRUCTION_TOO_LONG',
            message: `Instruction exceeds the maximum limit of ${ENV.MAX_INSTRUCTION_CHARS} characters.`,
          },
        });
      }

      const doc = await documentService.getUserDocument(req.user.id, req.params.id);

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found.',
          },
        });
      }

      if (doc.status !== 'ready') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_READY',
            message: `Document is currently in "${doc.status}" state and cannot be analyzed yet.`,
          },
        });
      }

      if (!doc.extractedText || doc.extractedText.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_EXTRACTABLE_TEXT',
            message: 'Document contains no extractable text for analysis.',
          },
        });
      }

      const analysisResult = await aiService.analyzeDocument({
        documentText: doc.extractedText,
        fileName: doc.originalName,
        instruction: instruction || 'Please summarize the main ideas, key facts, and takeaways of this document.',
      });

      return res.status(200).json({
        success: true,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        analysis: analysisResult,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const errMsg = err.message || 'Failed to analyze document';

      return res.status(statusCode).json({
        success: false,
        error: {
          code: err.code || 'ANALYSIS_FAILED',
          message: errMsg,
        },
      });
    }
  }

  /**
   * Delete document physically and remove database record
   * DELETE /api/documents/:id
   */
  async deleteDocument(req, res, next) {
    try {
      const deleted = await documentService.deleteDocument(req.user.id, req.params.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully.',
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete document.',
        },
      });
    }
  }

  /**
   * Get user storage quota and usage statistics
   * GET /api/documents/stats
   */
  async getStorageStats(req, res, next) {
    try {
      const stats = await documentService.getUserStorageStats(req.user.id);

      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_STATS_FAILED',
          message: 'Failed to retrieve storage statistics.',
        },
      });
    }
  }
}

export const documentController = new DocumentController();
