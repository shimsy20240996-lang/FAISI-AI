import { ENV } from '../config/env.js';
import { getRequestContext, getRequestId } from './requestContext.js';

/**
 * Supported Log Levels and Priority Hierarchy.
 * DEBUG < INFO < WARN < ERROR
 */
export const LOG_LEVELS = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
});

/**
 * Normalized set of sensitive field names that must never be emitted in logs.
 * Keys are matched case-insensitively with hyphens and underscores stripped.
 */
const SENSITIVE_KEY_NAMES = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwordhash',
  'token',
  'jwt',
  'apikey',
  'geminiapikey',
  'authsecret',
  'prompt',
  'response',
  'content',
  'embedding',
  'audio',
  'image',
  'buffer',
  'extractedtext',
  'chunktext',
  'query',
  'retrievedtext',
  'documenttext',
  'filecontents',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'sessiontoken',
  'credentials',
  'body',
  'payload',
]);

// Deterministic regex patterns for credential & string masking
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const GEMINI_API_KEY_REGEX = /AIza[0-9A-Za-z-_]{35}/g;
const QUERY_API_KEY_REGEX = /(?:key|api_key|apiKey)=([a-zA-Z0-9_-]+)/gi;
const MONGO_CREDENTIALS_REGEX = /(mongodb(?:\+srv)?:\/\/)[^@\s]+@([^\s]+)/gi;
const BEARER_JWT_REGEX = /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+(?:\.[A-Za-z0-9-_.+/=]*)?/gi;
const STANDALONE_JWT_REGEX = /\beyJ[A-Za-z0-9-_=]{10,}\.[A-Za-z0-9-_=]{10,}(?:\.[A-Za-z0-9-_.+/=]*)?\b/g;
const COOKIE_HEADER_REGEX = /(?:cookie|set-cookie)\s*:\s*([^;\r\n]+)/gi;
const CONTROL_CHAR_REGEX = /[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]+/g;

const MAX_STRING_LENGTH = 1000;

/**
 * Deterministically sanitizes string content against credentials, ANSI codes, and unbounded lengths.
 * @param {string} str - Input string
 * @param {object} [options]
 * @param {boolean} [options.preserveNewlines=false] - Whether to allow newlines (e.g. development stack traces)
 * @returns {string}
 */
export function sanitizeString(str, { preserveNewlines = false } = {}) {
  if (typeof str !== 'string') return '';

  let sanitized = str
    .replace(ANSI_REGEX, '')
    .replace(GEMINI_API_KEY_REGEX, '[API_KEY_REDACTED]')
    .replace(QUERY_API_KEY_REGEX, 'key=[REDACTED]')
    .replace(MONGO_CREDENTIALS_REGEX, '$1[DATABASE_CREDENTIALS_REDACTED]@$2')
    .replace(BEARER_JWT_REGEX, 'Bearer [JWT_REDACTED]')
    .replace(STANDALONE_JWT_REGEX, '[JWT_REDACTED]')
    .replace(COOKIE_HEADER_REGEX, 'cookie: [REDACTED]');

  if (!preserveNewlines) {
    sanitized = sanitized.replace(CONTROL_CHAR_REGEX, ' ').trim();
  }

  if (sanitized.length > MAX_STRING_LENGTH) {
    sanitized = sanitized.slice(0, MAX_STRING_LENGTH) + '...[TRUNCATED]';
  }

  return sanitized;
}

/**
 * Recursively sanitizes data values, dropping sensitive keys, summarizing Buffers,
 * and normalizing Errors without mutating original objects.
 * @param {*} val
 * @param {number} [depth=0]
 * @param {string} [environment='production']
 * @returns {*}
 */
export function sanitizeValue(val, depth = 0, environment = 'production') {
  if (val === null || val === undefined) return val;

  const type = typeof val;
  if (type === 'number' || type === 'boolean') return val;
  if (type === 'string') return sanitizeString(val);

  if (val instanceof Date) return val.toISOString();

  // Buffer or TypedArray summary
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) {
    return `[Buffer: ${val.length} bytes]`;
  }
  if (ArrayBuffer.isView(val)) {
    return `[TypedArray: ${val.byteLength} bytes]`;
  }

  // Error instances
  if (val instanceof Error) {
    const isDev = environment !== 'production';
    return {
      name: sanitizeString(val.name || 'Error'),
      message: sanitizeString(val.message || ''),
      code: val.code || undefined,
      statusCode: val.statusCode || undefined,
      isOperational: val.isOperational !== undefined ? Boolean(val.isOperational) : undefined,
      ...(isDev && val.stack ? { stack: sanitizeString(val.stack, { preserveNewlines: true }) } : {}),
    };
  }

  if (depth > 2) return '[Object]';

  if (Array.isArray(val)) {
    return val.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, environment));
  }

  if (type === 'object') {
    // Avoid serializing Node/Express internal classes (Request, Response, Socket, Stream)
    if (val.constructor && val.constructor.name !== 'Object') {
      return `[${val.constructor.name}]`;
    }

    const sanitized = {};
    for (const [key, propVal] of Object.entries(val)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEY_NAMES.has(normalizedKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(propVal, depth + 1, environment);
      }
    }
    return sanitized;
  }

  return String(val);
}

/**
 * Structured Logger Engine for NOVA AI.
 */
export class Logger {
  /**
   * @param {object} [options]
   * @param {string} [options.level] - Configured log level (DEBUG, INFO, WARN, ERROR)
   * @param {string} [options.environment] - Environment mode ('development', 'test', 'production')
   * @param {string} [options.format] - Output format ('json' or 'text')
   * @param {Function} [options.destination] - Custom output sink function (useful for tests)
   */
  constructor(options = {}) {
    this.environment = options.environment || ENV.NODE_ENV || 'development';
    const configuredLevel = (options.level || ENV.LOG_LEVEL || (this.environment === 'test' ? 'WARN' : (this.environment === 'production' ? 'INFO' : 'DEBUG'))).toUpperCase();
    this.level = LOG_LEVELS[configuredLevel] !== undefined ? configuredLevel : 'INFO';
    this.format = options.format || (this.environment === 'production' ? 'json' : 'text');
    this.customDestination = options.destination || null;
  }

  /**
   * Updates active log level dynamically.
   * @param {string} level
   */
  setLevel(level) {
    const upper = String(level || '').toUpperCase();
    if (LOG_LEVELS[upper] !== undefined) {
      this.level = upper;
    }
  }

  /**
   * Returns current active log level.
   * @returns {string}
   */
  getLevel() {
    return this.level;
  }

  /**
   * Sets a custom destination sink (used in testing).
   * @param {Function|null} fn
   */
  setOutputDestination(fn) {
    this.customDestination = fn;
  }

  /**
   * Resets destination sink to standard system streams.
   */
  resetOutputDestination() {
    this.customDestination = null;
  }

  /**
   * Emits a structured log record if level meets configured threshold.
   * @param {string} level - 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
   * @param {string} event - Machine-readable event name
   * @param {object|Error|string} [fields={}] - Additional operational metadata
   */
  log(level, event, fields = {}) {
    const upperLevel = String(level || 'INFO').toUpperCase();
    const levelScore = LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
    const currentScore = LOG_LEVELS[this.level] !== undefined ? LOG_LEVELS[this.level] : LOG_LEVELS.INFO;

    // Filter out records below current threshold
    if (levelScore < currentScore) {
      return;
    }

    // Auto-inject correlation metadata from active AsyncLocalStorage context
    const reqContext = getRequestContext();
    const autoRequestId = getRequestId();

    const timestamp = new Date().toISOString();
    const safeEvent = sanitizeString(String(event || 'log'));

    let normalizedFields = {};
    if (fields instanceof Error) {
      normalizedFields = { error: fields };
    } else if (typeof fields === 'string') {
      normalizedFields = { message: fields };
    } else if (typeof fields === 'object' && fields !== null) {
      normalizedFields = fields;
    }

    const sanitizedFields = sanitizeValue(normalizedFields, 0, this.environment) || {};

    const record = {
      timestamp,
      level: upperLevel,
      event: safeEvent,
      ...(autoRequestId ? { requestId: autoRequestId } : {}),
      ...(reqContext?.method && !sanitizedFields.method ? { method: reqContext.method } : {}),
      ...(reqContext?.route && !sanitizedFields.route ? { route: reqContext.route } : {}),
      ...sanitizedFields,
    };

    // If custom destination is registered (e.g. in test suites), emit directly
    if (typeof this.customDestination === 'function') {
      this.customDestination(record, this.format === 'json' ? JSON.stringify(record) : this.formatDevelopmentText(record));
      return;
    }

    if (this.format === 'json' || this.environment === 'production') {
      const line = JSON.stringify(record);
      if (levelScore >= LOG_LEVELS.ERROR) {
        process.stderr.write(line + '\n');
      } else {
        process.stdout.write(line + '\n');
      }
    } else {
      const formattedText = this.formatDevelopmentText(record);
      if (levelScore >= LOG_LEVELS.ERROR) {
        console.error(formattedText);
      } else if (levelScore === LOG_LEVELS.WARN) {
        console.warn(formattedText);
      } else {
        console.log(formattedText);
      }
    }
  }

  /**
   * Formats a record for human-readable development output while preserving redaction.
   * @param {object} record
   * @returns {string}
   */
  formatDevelopmentText(record) {
    const reqIdTag = record.requestId ? `[${record.requestId}] ` : '';
    const httpInfo = [
      record.method || '',
      record.route || '',
      record.status !== undefined ? record.status : '',
      record.durationMs !== undefined ? `${record.durationMs}ms` : '',
    ].filter(Boolean).join(' ');

    // Filter out core fields to display remaining extra metadata
    const coreKeys = new Set(['timestamp', 'level', 'event', 'requestId', 'method', 'route', 'status', 'durationMs']);
    const extra = {};
    for (const [k, v] of Object.entries(record)) {
      if (!coreKeys.has(k)) {
        extra[k] = v;
      }
    }

    const extraStr = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
    const httpStr = httpInfo ? ` ${httpInfo}` : '';

    return `${record.timestamp} ${record.level} ${reqIdTag}${record.event}${httpStr}${extraStr}`;
  }

  debug(event, fields) {
    this.log('DEBUG', event, fields);
  }

  info(event, fields) {
    this.log('INFO', event, fields);
  }

  warn(event, fields) {
    this.log('WARN', event, fields);
  }

  error(event, fields) {
    this.log('ERROR', event, fields);
  }
}

// Export singleton logger instance
export const logger = new Logger();
export default logger;
