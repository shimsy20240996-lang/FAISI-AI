/**
 * Custom Error Classes for NOVA AI Server
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required. Please sign in.') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class AIProviderError extends AppError {
  constructor(message, statusCode = 502, code = 'AI_PROVIDER_ERROR') {
    super(message, statusCode, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Request timed out waiting for AI model response.') {
    super(message, 504, 'TIMEOUT_ERROR');
  }
}

export class UnauthorizedError extends AuthenticationError {}



