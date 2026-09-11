import { metrics } from '../utils/metrics.js';

/**
 * Controller for internal read-only telemetry snapshot endpoint.
 * GET /api/metrics
 */
export class MetricsController {
  /**
   * Retrieves and returns an immutable in-memory metrics snapshot.
   * Sets Cache-Control: no-store and Content-Type: application/json.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  getMetrics(req, res, next) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');

      const snapshot = metrics.snapshot();

      return res.status(200).json({
        status: 'ok',
        timestamp: snapshot.timestamp || new Date().toISOString(),
        metrics: snapshot,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const metricsController = new MetricsController();
export default metricsController;
