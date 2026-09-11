import { ENV } from '../config/env.js';
import { ForbiddenError } from '../utils/errors.js';

/**
 * State-Changing Request Origin / Referer Validation Middleware.
 * Provides Defense-in-Depth against Cross-Site Request Forgery (CSRF) for cookie-authenticated endpoints.
 */
export function validateRequestOrigin(req, res, next) {
  // Safe read-only HTTP methods do not change state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const originHeader = req.headers['origin'];
  const refererHeader = req.headers['referer'];

  // Allowed origin configured in ENV
  const allowedOrigin = ENV.CLIENT_URL;

  // In production or when origin header is present, ensure it matches allowed client origin
  if (originHeader) {
    if (originHeader !== allowedOrigin) {
      return next(
        new ForbiddenError(
          `Cross-site request blocked: Origin "${originHeader}" is not permitted.`
        )
      );
    }
  } else if (refererHeader && ENV.NODE_ENV === 'production') {
    // If origin is missing but referer is present, verify referer prefix
    if (!refererHeader.startsWith(allowedOrigin)) {
      return next(
        new ForbiddenError(
          'Cross-site request blocked: Referer is not permitted.'
        )
      );
    }
  }

  next();
}
