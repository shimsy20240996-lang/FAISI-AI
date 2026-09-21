import express from 'express';
import { collectionController } from '../controllers/collectionController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';

const router = express.Router();

// All collection routes require authentication
router.use(authenticate);

// List collections
router.get('/', (req, res, next) => {
  collectionController.getCollections(req, res, next);
});

// Create collection
router.post('/', validateRequestOrigin, (req, res, next) => {
  collectionController.createCollection(req, res, next);
});

// Get single collection
router.get('/:id', (req, res, next) => {
  collectionController.getCollection(req, res, next);
});

// Update collection
router.patch('/:id', validateRequestOrigin, (req, res, next) => {
  collectionController.updateCollection(req, res, next);
});

// Delete collection
router.delete('/:id', validateRequestOrigin, (req, res, next) => {
  collectionController.deleteCollection(req, res, next);
});

export const collectionRoutes = router;
