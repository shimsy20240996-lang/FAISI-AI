import { AppError } from '../utils/errors.js';
import { ENV } from '../config/env.js';
import { getRequestId } from '../utils/requestContext.js';
import { logger } from '../utils/logger.js';

function sanitizeErrorMessage(msg) {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, '[DATABASE_URI_REDACTED]')
    .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]');
}

/**
 * Global Express Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  const isOperational = Boolean(err.isOperational || err instanceof AppError);
  const statusCode = err.statusCode || (isOperational ? 400 : 500);
  const code = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const requestId = req?.requestId || req?.id || getRequestId() || null;

  if (requestId && !res.headersSent) {
    res.setHeader('X-Request-Id', requestId);
  }

  let rawMessage = isOperational && err.message
    ? err.message
    : 'An unexpected internal server error occurred. Please try again later.';

  // In production, ensure no non-operational internal errors leak raw error messages
  if (ENV.NODE_ENV === 'production' && !isOperational && statusCode === 500) {
    rawMessage = 'An unexpected internal server error occurred. Please try again later.';
  }

  const message = sanitizeErrorMessage(rawMessage);

  // Structured Error Logging
  logger.error('http.request.error', {
    method: req.method,
    route: req.path || req.originalUrl || '',
    status: statusCode,
    errorCode: code,
    error: err,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      ...(err.details && isOperational ? { details: err.details } : {}),
    },
  });
}

