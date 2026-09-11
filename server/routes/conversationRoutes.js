import express from 'express';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  addMessage,
  searchConversations,
  claimConversations,
  checkAnonymousCount,
} from '../controllers/conversationController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';

const router = express.Router();

// Apply CSRF Origin Validation and Authentication to all conversation endpoints
router.use(validateRequestOrigin);
router.use(authenticate);

router.get('/', listConversations);
router.post('/', createConversation);
router.get('/search', searchConversations);
router.post('/claim', claimConversations);
router.get('/unclaimed-count', checkAnonymousCount);
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);
router.post('/:id/messages', addMessage);

export default router;
