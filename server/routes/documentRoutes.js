import express from 'express';
import multer from 'multer';
import { documentController } from '../controllers/documentController.js';
import { ragController } from '../controllers/ragController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';
import { uploadRateLimiter, analysisRateLimiter, indexingRateLimiter } from '../middleware/rateLimiter.js';
import { uploadConcurrencyGuard } from '../middleware/uploadConcurrencyLimiter.js';
import { ENV } from '../config/env.js';

const router = express.Router();

// Multer in-memory upload configuration with strict single-file and byte limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (ENV.MAX_FILE_SIZE_MB || 10) * 1024 * 1024,
    files: 1,
    fields: 5,
  },
});

/**
 * Middleware wrapping multer to capture and format multer errors safely
 */
function handleSingleUpload(req, res, next) {
  const uploadHandler = upload.single('file');

  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `File exceeds maximum allowed size of ${ENV.MAX_FILE_SIZE_MB || 10} MB.`,
            },
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'UNEXPECTED_FILE_FIELD',
              message: 'Only a single file uploaded under the form field name "file" is permitted.',
            },
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: `Upload error: ${err.message}`,
          },
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UPLOAD',
          message: err.message || 'File upload failed.',
        },
      });
    }

    next();
  });
}

// All document routes require authentication
router.use(authenticate);

// Document upload
router.post(
  '/',
  uploadRateLimiter,
  validateRequestOrigin,
  uploadConcurrencyGuard,
  handleSingleUpload,
  (req, res, next) => {
    documentController.uploadDocument(req, res, next);
  }
);

// List documents
router.get('/', (req, res, next) => {
  documentController.getDocuments(req, res, next);
});

// Storage usage stats
router.get('/stats', (req, res, next) => {
  documentController.getStorageStats(req, res, next);
});

// Single document metadata
router.get('/:id', (req, res, next) => {
  documentController.getDocument(req, res, next);
});

// Document extracted content / preview
router.get('/:id/content', (req, res, next) => {
  documentController.getDocumentContent(req, res, next);
});

// Document AI analysis
router.post('/:id/analyze', analysisRateLimiter, validateRequestOrigin, (req, res, next) => {
  documentController.analyzeDocument(req, res, next);
});

// Document Persistent Intelligence (Phase 4B)
router.get('/:id/intelligence', (req, res, next) => {
  documentController.getDocumentIntelligence(req, res, next);
});

router.post('/:id/intelligence', analysisRateLimiter, validateRequestOrigin, (req, res, next) => {
  documentController.generateDocumentIntelligence(req, res, next);
});

// Index single document into Knowledge Base
router.post('/:id/index', indexingRateLimiter, validateRequestOrigin, (req, res, next) => {
  ragController.indexDocument(req, res, next);
});

// Batch index ready documents
router.post('/index-all', indexingRateLimiter, validateRequestOrigin, (req, res, next) => {
  ragController.indexAllDocuments(req, res, next);
});

// Update document collection
router.patch('/:id/collection', validateRequestOrigin, (req, res, next) => {
  documentController.updateDocumentCollection(req, res, next);
});

// Update document tags
router.patch('/:id/tags', validateRequestOrigin, (req, res, next) => {
  documentController.updateDocumentTags(req, res, next);
});

// Delete document
router.delete('/:id', validateRequestOrigin, (req, res, next) => {
  documentController.deleteDocument(req, res, next);
});

export const documentRoutes = router;
