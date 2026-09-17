import { logger } from './logger.js';

/**
 * Bounded latency buckets for HTTP, AI, and operation duration histograms (in milliseconds).
 */
export const DEFAULT_HISTOGRAM_BUCKETS = Object.freeze([
  10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
]);

/**
 * Maximum total distinct metric series permitted in memory to prevent unbounded memory growth.
 */
export const MAX_METRIC_SERIES = 500;

/**
 * Allowed HTTP methods for label normalization.
 */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

/**
 * Bounded set of known AI operations.
 */
const ALLOWED_AI_OPERATIONS = new Set([
  'chat',
  'chat_stream',
  'document_analysis',
  'embedding',
  'transcription',
  'tts',
]);

/**
 * Bounded set of known SSE terminal outcomes.
 */
const ALLOWED_SSE_OUTCOMES = new Set(['completed', 'stopped', 'client_disconnected', 'failed']);

/**
 * Bounded set of database phases.
 */
const ALLOWED_DB_PHASES = new Set(['connect', 'disconnect', 'operation']);

/**
 * Bounded set of document upload statuses.
 */
const ALLOWED_DOC_UPLOAD_STATUS = new Set(['accepted', 'rejected', 'failed']);

/**
 * Bounded set of document processing operations.
 */
const ALLOWED_DOC_OPERATIONS = new Set(['extract', 'store', 'delete', 'analyze', 'index']);

/**
 * Bounded set of document processing outcomes.
 */
const ALLOWED_DOC_OUTCOMES = new Set(['success', 'failed']);

/**
 * Bounded set of RAG search outcomes.
 */
const ALLOWED_RAG_SEARCH_OUTCOMES = new Set(['success', 'no_evidence', 'failed']);

/**
 * Bounded set of RAG indexing outcomes.
 */
const ALLOWED_RAG_INDEXING_OUTCOMES = new Set(['success', 'failed']);

/**
 * Bounded set of media operations.
 */
const ALLOWED_MEDIA_OPERATIONS = new Set(['image', 'transcription', 'tts', 'live_voice']);

/**
 * Bounded set of media outcomes.
 */
const ALLOWED_MEDIA_OUTCOMES = new Set(['success', 'failed', 'rejected']);

/**
 * Bounded set of rate limiter names.
 */
const ALLOWED_LIMITERS = new Set([
  'auth',
  'chat',
  'stream',
  'rag',
  'indexing',
  'upload',
  'analysis',
  'media',
]);

/**
 * Whitelist of allowed label keys per defined metric name.
 */
const ALLOWED_METRIC_LABELS = Object.freeze({
  nova_http_requests_total: new Set(['method', 'route', 'statusClass']),
  nova_http_request_duration_ms: new Set(['method', 'route', 'statusClass']),
  nova_http_errors_total: new Set(['method', 'route', 'statusClass']),
  nova_ai_requests_total: new Set(['operation', 'model', 'statusClass']),
  nova_ai_retries_total: new Set(['operation', 'model']),
  nova_ai_errors_total: new Set(['operation', 'model', 'statusClass']),
  nova_ai_request_duration_ms: new Set(['operation', 'model', 'statusClass']),
  nova_sse_active_streams: new Set([]),
  nova_sse_streams_total: new Set(['outcome']),
  nova_sse_stream_duration_ms: new Set(['outcome']),
  nova_db_connected: new Set([]),
  nova_db_errors_total: new Set(['phase']),
  nova_document_uploads_total: new Set(['status']),
  nova_document_processing_total: new Set(['operation', 'outcome']),
  nova_document_processing_duration_ms: new Set(['operation', 'outcome']),
  nova_rag_searches_total: new Set(['outcome']),
  nova_rag_search_duration_ms: new Set(['outcome']),
  nova_rag_indexing_total: new Set(['outcome']),
  nova_rag_indexing_duration_ms: new Set(['outcome']),
  nova_media_operations_total: new Set(['operation', 'outcome']),
  nova_media_operation_duration_ms: new Set(['operation', 'outcome']),
  nova_rate_limit_rejections_total: new Set(['limiter']),
});

/**
 * Metric name validation regex: ASCII letters, digits, underscores, and colons.
 */
const METRIC_NAME_REGEX = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/**
 * Normalizes HTTP method to a fixed bounded set.
 * @param {string} method
 * @returns {string}
 */
export function normalizeMethod(method) {
  if (typeof method !== 'string') return 'OTHER';
  const upper = method.trim().toUpperCase();
  return ALLOWED_METHODS.has(upper) ? upper : 'OTHER';
}

const ALLOWED_STATUS_CLASSES = new Set(['2xx', '3xx', '4xx', '5xx', 'other']);

/**
 * Normalizes status code to status class ('2xx', '3xx', '4xx', '5xx', 'other').
 * @param {number|string} statusCode
 * @returns {string}
 */
export function normalizeStatusClass(statusCode) {
  if (typeof statusCode === 'string') {
    const lower = statusCode.trim().toLowerCase();
    if (ALLOWED_STATUS_CLASSES.has(lower)) {
      return lower;
    }
  }
  const code = Number(statusCode);
  if (isNaN(code) || code < 100 || code > 599) return 'other';
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
}

/**
 * Normalizes AI operation to a bounded set.
 * @param {string} operation
 * @returns {string}
 */
export function normalizeAIOperation(operation) {
  if (typeof operation !== 'string') return 'chat';
  const op = operation.trim().toLowerCase();
  return ALLOWED_AI_OPERATIONS.has(op) ? op : 'other';
}

/**
 * Normalizes AI model name to safe controlled strings.
 * @param {string} model
 * @returns {string}
 */
export function normalizeAIModel(model) {
  if (typeof model !== 'string') return 'gemini-3.6-flash';
  const m = model.trim().toLowerCase();
  if (m.startsWith('gemini-') || m.startsWith('models/')) {
    return m.replace(/^models\//, '').slice(0, 50);
  }
  return 'gemini-3.6-flash';
}

/**
 * Normalizes SSE stream terminal outcome to bounded set.
 * @param {string} outcome
 * @returns {'completed'|'stopped'|'client_disconnected'|'failed'}
 */
export function normalizeSSEOutcome(outcome) {
  if (typeof outcome !== 'string') return 'completed';
  const out = outcome.trim().toLowerCase();
  return ALLOWED_SSE_OUTCOMES.has(out) ? out : 'completed';
}

/**
 * Normalizes database error phase to bounded set.
 * @param {string} phase
 * @returns {'connect'|'disconnect'|'operation'}
 */
export function normalizeDBPhase(phase) {
  if (typeof phase !== 'string') return 'operation';
  const p = phase.trim().toLowerCase();
  return ALLOWED_DB_PHASES.has(p) ? p : 'operation';
}

/**
 * Normalizes document upload status to bounded set.
 * @param {string} status
 * @returns {'accepted'|'rejected'|'failed'}
 */
export function normalizeDocUploadStatus(status) {
  if (typeof status !== 'string') return 'rejected';
  const s = status.trim().toLowerCase();
  return ALLOWED_DOC_UPLOAD_STATUS.has(s) ? s : 'rejected';
}

/**
 * Normalizes document processing operation to bounded set.
 * @param {string} operation
 * @returns {'extract'|'store'|'delete'|'analyze'|'index'|'other'}
 */
export function normalizeDocOperation(operation) {
  if (typeof operation !== 'string') return 'extract';
  const op = operation.trim().toLowerCase();
  return ALLOWED_DOC_OPERATIONS.has(op) ? op : 'other';
}

/**
 * Normalizes document processing outcome to bounded set.
 * @param {string} outcome
 * @returns {'success'|'failed'}
 */
export function normalizeDocOutcome(outcome) {
  if (typeof outcome !== 'string') return 'failed';
  const out = outcome.trim().toLowerCase();
  return ALLOWED_DOC_OUTCOMES.has(out) ? out : 'failed';
}

/**
 * Normalizes RAG search outcome to bounded set.
 * @param {string} outcome
 * @returns {'success'|'no_evidence'|'failed'}
 */
export function normalizeRAGSearchOutcome(outcome) {
  if (typeof outcome !== 'string') return 'failed';
  const out = outcome.trim().toLowerCase();
  return ALLOWED_RAG_SEARCH_OUTCOMES.has(out) ? out : 'failed';
}

/**
 * Normalizes RAG indexing outcome to bounded set.
 * @param {string} outcome
 * @returns {'success'|'failed'}
 */
export function normalizeRAGIndexingOutcome(outcome) {
  if (typeof outcome !== 'string') return 'failed';
  const out = outcome.trim().toLowerCase();
  return ALLOWED_RAG_INDEXING_OUTCOMES.has(out) ? out : 'failed';
}

/**
 * Normalizes media operation to bounded set.
 * @param {string} operation
 * @returns {'image'|'transcription'|'tts'|'live_voice'|'other'}
 */
export function normalizeMediaOperation(operation) {
  if (typeof operation !== 'string') return 'image';
  const op = operation.trim().toLowerCase();
  return ALLOWED_MEDIA_OPERATIONS.has(op) ? op : 'other';
}

/**
 * Normalizes media outcome to bounded set.
 * @param {string} outcome
 * @returns {'success'|'failed'|'rejected'}
 */
export function normalizeMediaOutcome(outcome) {
  if (typeof outcome !== 'string') return 'failed';
  const out = outcome.trim().toLowerCase();
  return ALLOWED_MEDIA_OUTCOMES.has(out) ? out : 'failed';
}

/**
 * Normalizes rate limiter name to bounded whitelist.
 * @param {string} limiter
 * @returns {'auth'|'chat'|'stream'|'rag'|'indexing'|'upload'|'analysis'|'media'|'other'}
 */
export function normalizeLimiterName(limiter) {
  if (typeof limiter !== 'string') return 'other';
  const l = limiter.trim().toLowerCase();
  return ALLOWED_LIMITERS.has(l) ? l : 'other';
}

/**
 * Normalizes request route to a safe bounded pattern to prevent cardinality explosion.
 * Rejects raw URLs, query strings, and dynamic IDs.
 * @param {import('express').Request} req
 * @returns {string}
 */
export function normalizeRoute(req) {
  if (!req) return 'other';

  const rawPath = String(req.originalUrl || req.url || req.path || '').split('?')[0];

  // Static assets category
  if (
    rawPath.startsWith('/assets/') ||
    rawPath === '/favicon.ico' ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|map|webp|txt)$/i.test(rawPath)
  ) {
    return '/_static';
  }

  // Exact system and health probes
  if (rawPath === '/api/health') return '/api/health';
  if (rawPath === '/api/ready') return '/api/ready';
  if (rawPath === '/' || rawPath === '/index.html') return '/';

  // If Express matched a route definition, combine baseUrl and route path
  if (req.route && typeof req.route.path === 'string') {
    const base = req.baseUrl || '';
    let routePattern = `${base}${req.route.path}`.replace(/\/+/g, '/');
    if (routePattern.length > 1 && routePattern.endsWith('/')) {
      routePattern = routePattern.slice(0, -1);
    }
    return routePattern || 'other';
  }

  // Fallback pattern normalizer for non-matched routes (e.g. 404s)
  if (rawPath.startsWith('/api/')) {
    const sanitized = rawPath
      // Replace MongoDB ObjectIDs (24 hex chars)
      .replace(/\/[0-9a-fA-F]{24}(?=\/|$)/g, '/:id')
      // Replace UUIDs
      .replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=\/|$)/gi, '/:id')
      // Replace numeric IDs
      .replace(/\/\d+(?=\/|$)/g, '/:id');

    return sanitized.length <= 100 ? sanitized : 'other';
  }

  return 'other';
}

/**
 * Generates a stable unique series key from metric name and sorted labels.
 * @param {string} name
 * @param {Record<string, string>} [labels={}]
 * @returns {string}
 */
function serializeSeriesKey(name, labels = {}) {
  const sortedKeys = Object.keys(labels).sort();
  const pairs = sortedKeys.map((k) => `${k}=${String(labels[k])}`);
  return `${name}{${pairs.join(',')}}`;
}

/**
 * Filter and validate labels against allowed keys.
 * @param {string} name
 * @param {Record<string, string>} [labels={}]
 * @returns {Record<string, string>}
 */
function sanitizeLabels(name, labels = {}) {
  const allowedKeys = ALLOWED_METRIC_LABELS[name];
  const clean = {};
  for (const [k, v] of Object.entries(labels)) {
    if (typeof k === 'string' && (!allowedKeys || allowedKeys.has(k))) {
      // Bounded string representation, reject objects / functions
      clean[k] = String(v ?? '').slice(0, 100);
    }
  }
  return clean;
}

/**
 * In-Memory Metric Engine for NOVA AI.
 * Zero-dependency, memory-bounded Counter, Gauge, and Histogram metrics.
 */
export class MetricEngine {
  constructor(options = {}) {
    this.maxSeries = options.maxSeries || MAX_METRIC_SERIES;
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.lastWarningTime = 0;
  }

  /**
   * Clears all stored metric series (used for tests).
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.lastWarningTime = 0;
  }

  /**
   * Returns total number of active metric series across all types.
   * @returns {number}
   */
  get seriesCount() {
    return this.counters.size + this.gauges.size + this.histograms.size;
  }

  /**
   * Checks series limit before registering new series.
   * @private
   */
  _checkSeriesLimit() {
    if (this.seriesCount >= this.maxSeries) {
      const now = Date.now();
      if (now - this.lastWarningTime > 60000) {
        this.lastWarningTime = now;
        logger.warn('metrics.series_limit_reached', {
          currentSeries: this.seriesCount,
          maxSeries: this.maxSeries,
        });
      }
      return false;
    }
    return true;
  }

  /**
   * Counter Metric: Monotonically increasing value.
   * @param {string} name
   * @param {Record<string, string>} [labels={}]
   * @returns {{ inc: (val?: number) => void, get: () => number }}
   */
  counter(name, labels = {}) {
    if (!name || typeof name !== 'string' || !METRIC_NAME_REGEX.test(name)) {
      return { inc: () => {}, get: () => 0 };
    }

    const cleanLabels = sanitizeLabels(name, labels);
    const seriesKey = serializeSeriesKey(name, cleanLabels);

    let entry = this.counters.get(seriesKey);
    if (!entry) {
      if (!this._checkSeriesLimit()) {
        return { inc: () => {}, get: () => 0 };
      }
      entry = { name, labels: cleanLabels, value: 0 };
      this.counters.set(seriesKey, entry);
    }

    return {
      inc: (val = 1) => {
        const increment = Number(val);
        if (typeof increment === 'number' && increment >= 0 && !isNaN(increment) && isFinite(increment)) {
          entry.value += increment;
        }
      },
      get: () => entry.value,
    };
  }

  /**
   * Gauge Metric: Value that can increase, decrease, or be set directly.
   * @param {string} name
   * @param {Record<string, string>} [labels={}]
   * @returns {{ set: (val: number) => void, inc: (val?: number) => void, dec: (val?: number) => void, get: () => number }}
   */
  gauge(name, labels = {}) {
    if (!name || typeof name !== 'string' || !METRIC_NAME_REGEX.test(name)) {
      return { set: () => {}, inc: () => {}, dec: () => {}, get: () => 0 };
    }

    const cleanLabels = sanitizeLabels(name, labels);
    const seriesKey = serializeSeriesKey(name, cleanLabels);

    let entry = this.gauges.get(seriesKey);
    if (!entry) {
      if (!this._checkSeriesLimit()) {
        return { set: () => {}, inc: () => {}, dec: () => {}, get: () => 0 };
      }
      entry = { name, labels: cleanLabels, value: 0 };
      this.gauges.set(seriesKey, entry);
    }

    return {
      set: (val) => {
        const num = Number(val);
        if (!isNaN(num) && isFinite(num)) {
          entry.value = num;
        }
      },
      inc: (val = 1) => {
        const num = Number(val);
        if (!isNaN(num) && isFinite(num)) {
          entry.value += num;
        }
      },
      dec: (val = 1) => {
        const num = Number(val);
        if (!isNaN(num) && isFinite(num)) {
          entry.value -= num;
        }
      },
      get: () => entry.value,
    };
  }

  /**
   * Histogram Metric: Bounded latency/size observation buckets with count and sum.
   * @param {string} name
   * @param {Record<string, string>} [labels={}]
   * @param {number[]} [customBuckets]
   * @returns {{ observe: (val: number) => void, get: () => object }}
   */
  histogram(name, labels = {}) {
    if (!name || typeof name !== 'string' || !METRIC_NAME_REGEX.test(name)) {
      return { observe: () => {}, get: () => ({ count: 0, sum: 0, buckets: {} }) };
    }

    const cleanLabels = sanitizeLabels(name, labels);
    const seriesKey = serializeSeriesKey(name, cleanLabels);

    let entry = this.histograms.get(seriesKey);
    if (!entry) {
      if (!this._checkSeriesLimit()) {
        return { observe: () => {}, get: () => ({ count: 0, sum: 0, buckets: {} }) };
      }

      const bucketsObj = {};
      for (const b of DEFAULT_HISTOGRAM_BUCKETS) {
        bucketsObj[String(b)] = 0;
      }
      bucketsObj['+Inf'] = 0;

      entry = {
        name,
        labels: cleanLabels,
        count: 0,
        sum: 0,
        min: null,
        max: null,
        buckets: bucketsObj,
      };
      this.histograms.set(seriesKey, entry);
    }

    return {
      observe: (val) => {
        const num = Number(val);
        if (isNaN(num) || !isFinite(num) || num < 0) return;

        entry.count += 1;
        entry.sum += num;
        if (entry.min === null || num < entry.min) entry.min = num;
        if (entry.max === null || num > entry.max) entry.max = num;

        for (const b of DEFAULT_HISTOGRAM_BUCKETS) {
          if (num <= b) {
            entry.buckets[String(b)] += 1;
          }
        }
        entry.buckets['+Inf'] += 1;
      },
      get: () => ({
        count: entry.count,
        sum: entry.sum,
        min: entry.min,
        max: entry.max,
        buckets: { ...entry.buckets },
      }),
    };
  }

  /**
   * Produces an immutable, serializable deep snapshot of all current metrics.
   * @returns {{ timestamp: string, seriesCount: number, counters: object[], gauges: object[], histograms: object[] }}
   */
  snapshot() {
    return {
      timestamp: new Date().toISOString(),
      seriesCount: this.seriesCount,
      counters: Array.from(this.counters.values()).map((c) => ({
        name: c.name,
        labels: { ...c.labels },
        value: c.value,
      })),
      gauges: Array.from(this.gauges.values()).map((g) => ({
        name: g.name,
        labels: { ...g.labels },
        value: g.value,
      })),
      histograms: Array.from(this.histograms.values()).map((h) => ({
        name: h.name,
        labels: { ...h.labels },
        count: h.count,
        sum: h.sum,
        min: h.min,
        max: h.max,
        buckets: { ...h.buckets },
      })),
    };
  }
}

// Global Metric Registry Singleton
export const metrics = new MetricEngine();

/**
 * Express Middleware for HTTP Metrics Instrumentation.
 * Measures request counts, durations, and error rates using normalized labels.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function httpMetricsMiddleware(req, res, next) {
  const startHr = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startHr;
    const durationMs = Number(elapsedNs) / 1e6;

    const method = normalizeMethod(req.method);
    const route = normalizeRoute(req);
    const statusClass = normalizeStatusClass(res.statusCode);

    const labels = { method, route, statusClass };

    // 1. Increment total requests counter
    metrics.counter('nova_http_requests_total', labels).inc(1);

    // 2. Observe duration in milliseconds
    metrics.histogram('nova_http_request_duration_ms', labels).observe(durationMs);

    // 3. Increment errors counter if status >= 400
    if (res.statusCode >= 400) {
      metrics.counter('nova_http_errors_total', labels).inc(1);
    }
  });

  next();
}

/**
 * Observational helper for AI operations telemetry.
 * @param {object} params
 * @param {string} params.operation - 'chat' | 'chat_stream' | 'document_analysis'
 * @param {string} params.model - Gemini model identifier
 * @param {string} [params.statusClass='2xx'] - '2xx' | '4xx' | '5xx' | 'other'
 * @param {number} params.durationMs - Monotonic operation duration in milliseconds
 * @param {boolean} [params.isError=false] - Whether operation concluded in final failure
 */
export function recordAITelemetry({ operation, model, statusClass = '2xx', durationMs, isError = false }) {
  try {
    const cleanOp = normalizeAIOperation(operation);
    const cleanModel = normalizeAIModel(model);
    const cleanStatus = normalizeStatusClass(statusClass);

    const labels = { operation: cleanOp, model: cleanModel, statusClass: cleanStatus };

    metrics.counter('nova_ai_requests_total', labels).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_ai_request_duration_ms', labels).observe(durationMs);
    }
    if (isError) {
      metrics.counter('nova_ai_errors_total', labels).inc(1);
    }
  } catch {
    // Telemetry must never throw or disrupt application flow
  }
}

/**
 * Observational helper for AI transient retry telemetry.
 * @param {object} params
 * @param {string} params.operation
 * @param {string} params.model
 */
export function recordAIRetryTelemetry({ operation, model }) {
  try {
    const cleanOp = normalizeAIOperation(operation);
    const cleanModel = normalizeAIModel(model);
    metrics.counter('nova_ai_retries_total', { operation: cleanOp, model: cleanModel }).inc(1);
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper to record the start of an SSE stream.
 */
export function recordSSEStreamStart() {
  try {
    metrics.gauge('nova_sse_active_streams').inc(1);
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper to record the termination of an SSE stream.
 * @param {object} params
 * @param {'completed'|'stopped'|'client_disconnected'|'failed'} params.outcome
 * @param {number} params.durationMs
 */
export function recordSSEStreamEnd({ outcome, durationMs }) {
  try {
    const cleanOutcome = normalizeSSEOutcome(outcome);
    const currentActive = metrics.gauge('nova_sse_active_streams').get();
    if (currentActive > 0) {
      metrics.gauge('nova_sse_active_streams').dec(1);
    }
    metrics.counter('nova_sse_streams_total', { outcome: cleanOutcome }).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_sse_stream_duration_ms', { outcome: cleanOutcome }).observe(durationMs);
    }
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for database connection status.
 * @param {boolean} isConnected
 */
export function recordDatabaseConnected(isConnected) {
  try {
    metrics.gauge('nova_db_connected').set(isConnected ? 1 : 0);
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for database errors.
 * @param {string} [phase='operation'] - 'connect' | 'disconnect' | 'operation'
 */
export function recordDatabaseError(phase = 'operation') {
  try {
    const cleanPhase = normalizeDBPhase(phase);
    metrics.counter('nova_db_errors_total', { phase: cleanPhase }).inc(1);
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for document uploads.
 * @param {object} params
 * @param {'accepted'|'rejected'|'failed'} params.status
 */
export function recordDocumentUpload({ status }) {
  try {
    const cleanStatus = normalizeDocUploadStatus(status);
    metrics.counter('nova_document_uploads_total', { status: cleanStatus }).inc(1);
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for document processing operations.
 * @param {object} params
 * @param {'extract'|'store'|'delete'|'analyze'|'index'} params.operation
 * @param {'success'|'failed'} params.outcome
 * @param {number} [params.durationMs]
 */
export function recordDocumentProcessing({ operation, outcome, durationMs }) {
  try {
    const cleanOp = normalizeDocOperation(operation);
    const cleanOutcome = normalizeDocOutcome(outcome);
    metrics.counter('nova_document_processing_total', { operation: cleanOp, outcome: cleanOutcome }).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_document_processing_duration_ms', { operation: cleanOp, outcome: cleanOutcome }).observe(durationMs);
    }
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for RAG searches.
 * @param {object} params
 * @param {'success'|'no_evidence'|'failed'} params.outcome
 * @param {number} [params.durationMs]
 */
export function recordRAGSearch({ outcome, durationMs }) {
  try {
    const cleanOutcome = normalizeRAGSearchOutcome(outcome);
    metrics.counter('nova_rag_searches_total', { outcome: cleanOutcome }).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_rag_search_duration_ms', { outcome: cleanOutcome }).observe(durationMs);
    }
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for RAG document indexing operations.
 * @param {object} params
 * @param {'success'|'failed'} params.outcome
 * @param {number} [params.durationMs]
 */
export function recordRAGIndexing({ outcome, durationMs }) {
  try {
    const cleanOutcome = normalizeRAGIndexingOutcome(outcome);
    metrics.counter('nova_rag_indexing_total', { outcome: cleanOutcome }).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_rag_indexing_duration_ms', { outcome: cleanOutcome }).observe(durationMs);
    }
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for media operations (image, transcription, tts).
 * @param {object} params
 * @param {'image'|'transcription'|'tts'|'live_voice'} params.operation
 * @param {'success'|'failed'|'rejected'} params.outcome
 * @param {number} [params.durationMs]
 */
export function recordMediaOperation({ operation, outcome, durationMs }) {
  try {
    const cleanOp = normalizeMediaOperation(operation);
    const cleanOutcome = normalizeMediaOutcome(outcome);
    metrics.counter('nova_media_operations_total', { operation: cleanOp, outcome: cleanOutcome }).inc(1);
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.histogram('nova_media_operation_duration_ms', { operation: cleanOp, outcome: cleanOutcome }).observe(durationMs);
    }
  } catch {
    // Telemetry must never throw
  }
}

/**
 * Observational helper for rate limit rejections.
 * @param {object} params
 * @param {string} params.limiter
 */
export function recordRateLimitRejection({ limiter }) {
  try {
    const cleanLimiter = normalizeLimiterName(limiter);
    metrics.counter('nova_rate_limit_rejections_total', { limiter: cleanLimiter }).inc(1);
  } catch {
    // Telemetry must never throw
  }
}

export default metrics;
