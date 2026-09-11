import express from 'express';
import { ragController } from '../controllers/ragController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';
import { ragSearchRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// All RAG routes require authentication
router.use(authenticate);

// Semantic Search against user's Knowledge Base
router.post('/search', ragSearchRateLimiter, validateRequestOrigin, (req, res, next) => {
  ragController.searchKnowledgeBase(req, res, next);
});

// Secure chunk preview for citation inspection
router.get('/chunks/:id', (req, res, next) => {
  ragController.getChunkPreview(req, res, next);
});

// User Knowledge Base stats and quotas
router.get('/stats', (req, res, next) => {
  ragController.getStats(req, res, next);
});

export const ragRoutes = router;

