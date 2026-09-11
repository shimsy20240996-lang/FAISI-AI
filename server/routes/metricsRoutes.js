import express from 'express';
import { metricsController } from '../controllers/metricsController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

// Require authenticated session for all metrics endpoints
router.use(authenticate);

// Read-only GET /api/metrics
router.get('/', (req, res, next) => {
  metricsController.getMetrics(req, res, next);
});

export const metricsRoutes = router;
export default router;
