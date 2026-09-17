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

  // Allowed origin configured in ENV (with trailing slash stripped)
  const allowedOrigin = (ENV.CLIENT_URL || '').replace(/\/+$/, '').toLowerCase();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '').toLowerCase();
  const host = req.headers.host;
  const sameOriginHttp = host ? `http://${host}`.toLowerCase() : null;
  const sameOriginHttps = host ? `https://${host}`.toLowerCase() : null;

  const isMatch = (target) => {
    if (!target) return false;
    const clean = target.replace(/\/+$/, '').toLowerCase();
    if (clean === allowedOrigin) return true;
    if (renderUrl && clean === renderUrl) return true;
    if (sameOriginHttp && clean === sameOriginHttp) return true;
    if (sameOriginHttps && clean === sameOriginHttps) return true;
    if (ENV.NODE_ENV !== 'production' && (clean.startsWith('http://localhost:') || clean.startsWith('http://127.0.0.1:'))) {
      return true;
    }
    return false;
  };

  // In production or when origin header is present, ensure it matches allowed client origin or same host
  if (originHeader) {
    if (!isMatch(originHeader)) {
      return next(
        new ForbiddenError(
          `Cross-site request blocked: Origin "${originHeader}" is not permitted.`
        )
      );
    }
  } else if (refererHeader && ENV.NODE_ENV === 'production') {
    // If origin is missing but referer is present, verify referer prefix
    const cleanReferer = refererHeader.toLowerCase();
    const isRefererAllowed =
      (allowedOrigin && cleanReferer.startsWith(allowedOrigin)) ||
      (renderUrl && cleanReferer.startsWith(renderUrl)) ||
      (sameOriginHttp && cleanReferer.startsWith(sameOriginHttp)) ||
      (sameOriginHttps && cleanReferer.startsWith(sameOriginHttps));

    if (!isRefererAllowed) {
      return next(
        new ForbiddenError(
          'Cross-site request blocked: Referer is not permitted.'
        )
      );
    }
  }

  next();
}
