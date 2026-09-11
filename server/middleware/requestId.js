import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from '../utils/requestContext.js';

/**
 * Strict regex for incoming request ID validation.
 * Accepts only safe bounded alphanumeric, hyphen, and underscore strings between 8 and 64 chars.
 * Prevents header injection, CR/LF splitting, control characters, and unbounded allocations.
 */
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Validates an incoming request ID or generates a cryptographically secure UUID v4.
 * @param {string|undefined} incomingId - Inbound header value from X-Request-Id
 * @returns {string} Safe request correlation ID
 */
export function resolveRequestId(incomingId) {
  if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId.trim())) {
    return incomingId.trim();
  }
  return randomUUID();
}

/**
 * Request Correlation & AsyncLocalStorage Context Middleware.
 * Establishes a unique correlation ID for every inbound HTTP request, sets the X-Request-Id
 * response header, attaches req.id / req.requestId, and wraps downstream execution in an AsyncLocalStorage scope.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestIdMiddleware(req, res, next) {
  const rawHeader = req.headers['x-request-id'];
  const requestId = resolveRequestId(Array.isArray(rawHeader) ? rawHeader[0] : rawHeader);

  // Attach to Express request object for direct handler access
  req.id = requestId;
  req.requestId = requestId;

  // Set outbound correlation header on every response
  res.setHeader('X-Request-Id', requestId);

  // Initialize request context scope
  const context = {
    requestId,
    method: req.method,
    route: req.path || req.originalUrl || '',
    startTime: Date.now(),
  };

  runWithRequestContext(context, () => {
    next();
  });
}

export default requestIdMiddleware;
