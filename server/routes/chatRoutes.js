import { Router } from 'express';
import { getHealth, handleChat, handleChatStream } from '../controllers/chatController.js';
import { validateChatRequest } from '../middleware/requestValidation.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/health', getHealth);
router.post('/chat', validateRequestOrigin, optionalAuthenticate, chatRateLimiter, validateChatRequest, handleChat);
router.post('/chat/stream', validateRequestOrigin, optionalAuthenticate, chatRateLimiter, validateChatRequest, handleChatStream);

export default router;

