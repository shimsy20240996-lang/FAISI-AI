import { ValidationError } from '../utils/errors.js';

/**
 * Middleware to extract and validate anonymous clientId.
 * Provides anonymous browser-level conversation isolation until Phase 5 authentication is added.
 */
export function extractClientId(req, res, next) {
  const headerId = req.headers['x-client-id'];
  const queryId = req.query.clientId;
  const bodyId = req.body?.clientId;

  const clientId = headerId || queryId || bodyId;

  if (!clientId || typeof clientId !== 'string' || clientId.trim().length === 0) {
    return next(
      new ValidationError(
        'Missing or invalid "x-client-id" header. Anonymous client identifier is required.'
      )
    );
  }

  req.clientId = clientId.trim();
  next();
}
