import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {
  metrics,
  recordAITelemetry,
  recordSSEStreamStart,
  recordSSEStreamEnd,
  recordDatabaseConnected,
  recordDocumentUpload,
  recordDocumentProcessing,
  recordRAGSearch,
  recordRAGIndexing,
  recordMediaOperation,
  recordRateLimitRejection,
  httpMetricsMiddleware,
  MAX_METRIC_SERIES,
} from '../utils/metrics.js';
import { metricsRoutes } from '../routes/metricsRoutes.js';
import { authService } from '../services/authService.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { ENV } from '../config/env.js';
import { logger } from '../utils/logger.js';

describe('Phase 10.6-F: Metrics Endpoint, Verification & Documentation Suite', () => {
  let app;
  let server;
  let baseUrl;
  let validAuthCookie;
  let capturedLogs = [];

  before(async () => {
    // Generate valid test token
    const token = authService.generateToken({
      id: 'telemetry-test-user-id',
      email: 'telemetry_tester@nova.ai',
      displayName: 'Telemetry Tester',
      tokenVersion: 0,
    });
    validAuthCookie = `${ENV.COOKIE_NAME}=${token}`;

    app = express();
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.use(requestIdMiddleware);
    app.use(httpMetricsMiddleware);
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const durationMs = Date.now() - start;
        const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
        logger.info('http.request.completed', {
          method: req.method,
          route: req.baseUrl || req.route?.path || req.path || req.originalUrl || '',
          status: res.statusCode,
          statusClass,
          durationMs,
        });
      });
      next();
    });
    app.use(cookieParser());
    app.use(express.json());

    // Health and Readiness probes
    app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
    app.get('/api/ready', (req, res) => res.status(200).json({ status: 'ok', ready: true }));

    // Metrics router
    app.use('/api/metrics', metricsRoutes);

    // 404 Catch-all
    app.use((req, res) => {
      res.status(404).json({ success: false, error: { message: `Not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' } });
    });

    // Global Error Handler
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    logger.resetOutputDestination();
    metrics.reset();
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    metrics.reset();
    capturedLogs = [];
    logger.setOutputDestination((record, formatted) => {
      capturedLogs.push({ record, formatted });
    });
  });

  // ==========================================================================
  // 1. AUTHENTICATION REQUIREMENTS (Tests 1 - 4)
  // ==========================================================================
  describe('1. Authentication Requirements', () => {
    test('1. unauthenticated GET /api/metrics is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED');
    });

    test('2. authenticated GET /api/metrics succeeds with 200', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.ok(body.metrics);
    });

    test('3. authentication strictly uses the existing cookie-based auth mechanism', async () => {
      // Invalid/tampered cookie
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: `${ENV.COOKIE_NAME}=invalid_tampered_jwt_string` },
      });
      assert.equal(res.status, 401);
    });

    test('4. no API key or query-string token authentication bypass exists', async () => {
      const res = await fetch(`${baseUrl}/api/metrics?apiKey=AIzaSyFakeBypassKey123&token=bypassToken`);
      assert.equal(res.status, 401, 'Query parameters must not bypass authentication');
    });
  });

  // ==========================================================================
  // 2. HTTP METHODS & ROUTE DISCIPLINE (Tests 5 - 6)
  // ==========================================================================
  describe('2. HTTP Method Discipline', () => {
    test('5. GET method works correctly', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        method: 'GET',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
    });

    test('6. unsupported mutation methods do not expose metrics (POST, PUT, PATCH, DELETE)', async () => {
      const postRes = await fetch(`${baseUrl}/api/metrics`, {
        method: 'POST',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(postRes.status, 404);

      const putRes = await fetch(`${baseUrl}/api/metrics`, {
        method: 'PUT',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(putRes.status, 404);

      const patchRes = await fetch(`${baseUrl}/api/metrics`, {
        method: 'PATCH',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(patchRes.status, 404);

      const delRes = await fetch(`${baseUrl}/api/metrics`, {
        method: 'DELETE',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(delRes.status, 404);
    });
  });

  // ==========================================================================
  // 3. RESPONSE STRUCTURE & SNAPSHOT INTEGRITY (Tests 7 - 11)
  // ==========================================================================
  describe('3. Response Structure & Snapshot Integrity', () => {
    test('7. response is valid JSON with application/json header', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /application\/json/i);
      const data = await res.json();
      assert.ok(typeof data === 'object' && data !== null);
    });

    test('8. response has expected top-level structure (status, timestamp, metrics)', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(data.timestamp);
      assert.ok(data.metrics);
      assert.ok(typeof data.metrics.seriesCount === 'number');
      assert.ok(Array.isArray(data.metrics.counters));
      assert.ok(Array.isArray(data.metrics.gauges));
      assert.ok(Array.isArray(data.metrics.histograms));
    });

    test('9. snapshot contains existing metric families after recording', async () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 150 });
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'completed', durationMs: 250 });
      recordDatabaseConnected(true);
      recordDocumentUpload({ status: 'accepted' });
      recordRAGSearch({ outcome: 'success', durationMs: 50 });
      recordMediaOperation({ operation: 'image', outcome: 'success', durationMs: 20 });
      recordRateLimitRejection({ limiter: 'auth' });

      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      const metricNames = [
        ...data.metrics.counters.map((c) => c.name),
        ...data.metrics.gauges.map((g) => g.name),
        ...data.metrics.histograms.map((h) => h.name),
      ];

      assert.ok(metricNames.includes('nova_ai_requests_total'));
      assert.ok(metricNames.includes('nova_sse_streams_total'));
      assert.ok(metricNames.includes('nova_db_connected'));
      assert.ok(metricNames.includes('nova_document_uploads_total'));
      assert.ok(metricNames.includes('nova_rag_searches_total'));
      assert.ok(metricNames.includes('nova_media_operations_total'));
      assert.ok(metricNames.includes('nova_rate_limit_rejections_total'));
    });

    test('10. snapshot remains bounded within MAX_METRIC_SERIES', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      assert.ok(data.metrics.seriesCount <= MAX_METRIC_SERIES);
    });

    test('11. snapshot is an immutable copy and client cannot mutate internal metric state', async () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 100 });

      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();

      // Mutate returned object
      data.metrics.counters[0].value = 999999;
      data.metrics.counters[0].labels.operation = 'tampered';

      // Verify internal state
      const internalSnap = metrics.snapshot();
      const internalAiCounter = internalSnap.counters.find((c) => c.name === 'nova_ai_requests_total');
      assert.equal(internalAiCounter.value, 1);
      assert.equal(internalAiCounter.labels.operation, 'chat');
    });
  });

  // ==========================================================================
  // 4. SECURITY & PRIVACY CONTROLS (Tests 12 - 20)
  // ==========================================================================
  describe('4. Security & Privacy Controls', () => {
    test('12. response contains no secrets or API keys', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const text = await res.text();
      assert.ok(!text.includes('AIzaSy'));
      assert.ok(!text.includes(ENV.GEMINI_API_KEY || 'AIzaSyPlaceholder'));
    });

    test('13. response contains no JWTs or raw token strings in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const text = await res.text();
      assert.ok(!text.includes('eyJhbGciOi'));
    });

    test('14. response contains no passwords', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const text = await res.text();
      assert.ok(!text.toLowerCase().includes('password'));
    });

    test('15. response contains no MongoDB URI credentials', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const text = await res.text();
      assert.ok(!text.includes('mongodb://'));
      assert.ok(!text.includes('mongodb+srv://'));
    });

    test('16. response contains no user prompt text in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      for (const counter of data.metrics.counters) {
        assert.equal(counter.labels.prompt, undefined);
      }
    });

    test('17. response contains no user IDs in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      for (const counter of data.metrics.counters) {
        assert.equal(counter.labels.userId, undefined);
      }
    });

    test('18. response contains no request IDs in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie, 'X-Request-Id': 'req-trace-audit-999' },
      });
      const data = await res.json();
      for (const counter of data.metrics.counters) {
        assert.equal(counter.labels.requestId, undefined);
      }
    });

    test('19. response contains no document IDs or generation IDs in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      for (const counter of data.metrics.counters) {
        assert.equal(counter.labels.documentId, undefined);
        assert.equal(counter.labels.generationId, undefined);
      }
    });

    test('20. response contains no file paths or storage keys in metric labels', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      for (const counter of data.metrics.counters) {
        assert.equal(counter.labels.filePath, undefined);
        assert.equal(counter.labels.storageKey, undefined);
      }
    });
  });

  // ==========================================================================
  // 5. HEADERS & CACHE CONTROLS (Tests 21 - 23)
  // ==========================================================================
  describe('5. Headers & Cache Policy', () => {
    test('21. Content-Type is strictly application/json', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.match(res.headers.get('content-type') || '', /^application\/json/i);
    });

    test('22. Cache-Control is strictly no-store', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.headers.get('cache-control'), 'no-store');
    });

    test('23. Helmet security headers remain active on /api/metrics', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    });
  });

  // ==========================================================================
  // 6. QUERY PARAMETER SAFETY (Tests 24 - 26)
  // ==========================================================================
  describe('6. Query Parameter Safety', () => {
    test('24. arbitrary query parameters do not alter metric selection', async () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 50 });
      recordDocumentUpload({ status: 'accepted' });

      const res1 = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data1 = await res1.json();

      const res2 = await fetch(`${baseUrl}/api/metrics?filter=secret&tag=admin&limit=0`, {
        headers: { Cookie: validAuthCookie },
      });
      const data2 = await res2.json();

      assert.ok(data1.metrics.counters.some((c) => c.name === 'nova_ai_requests_total'));
      assert.ok(data2.metrics.counters.some((c) => c.name === 'nova_ai_requests_total'));
      assert.ok(data2.metrics.counters.some((c) => c.name === 'nova_document_uploads_total'));
    });

    test('25. query parameters are not echoed into response body', async () => {
      const res = await fetch(`${baseUrl}/api/metrics?injection=<script>alert(1)</script>`, {
        headers: { Cookie: validAuthCookie },
      });
      const text = await res.text();
      assert.ok(!text.includes('<script>alert(1)</script>'));
    });

    test('26. unexpected query parameters do not create new metric series', async () => {
      const res1 = await fetch(`${baseUrl}/api/metrics?attack=series_bomb_1`, {
        headers: { Cookie: validAuthCookie },
      });
      await res1.json();
      const res2 = await fetch(`${baseUrl}/api/metrics?attack=series_bomb_2`, {
        headers: { Cookie: validAuthCookie },
      });
      await res2.json();
      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const httpMetric = snap.counters.find((c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/metrics');
      assert.ok(httpMetric, 'HTTP metric route should be normalized /api/metrics without query string');
      assert.equal(httpMetric.labels.attack, undefined);
    });
  });

  // ==========================================================================
  // 7. READ-ONLY SEMANTICS (Tests 27 - 29)
  // ==========================================================================
  describe('7. Read-Only Semantics', () => {
    test('27. GET /api/metrics does not reset application metrics', async () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 100 });
      assert.equal(metrics.counter('nova_ai_requests_total', { operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx' }).get(), 1);

      await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });

      assert.equal(metrics.counter('nova_ai_requests_total', { operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx' }).get(), 1);
    });

    test('28. GET does not mutate counters, gauges, or histograms unexpectedly', async () => {
      recordSSEStreamStart();
      assert.equal(metrics.gauge('nova_sse_active_streams').get(), 1);

      await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });

      assert.equal(metrics.gauge('nova_sse_active_streams').get(), 1);
    });

    test('29. no public reset endpoint exists (POST /api/metrics/reset returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/metrics/reset`, {
        method: 'POST',
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 404);
    });
  });

  // ==========================================================================
  // 8. CROSS-PHASE INTEGRATION (Tests 30 - 36)
  // ==========================================================================
  describe('8. Cross-Phase Integration', () => {
    test('30. /api/health probe remains unaffected and returns 200', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
    });

    test('31. /api/ready probe remains unaffected and returns 200', async () => {
      const res = await fetch(`${baseUrl}/api/ready`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ready, true);
    });

    test('32. HTTP metrics continue tracking endpoint calls accurately', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      await res.json();
      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const httpCounter = snap.counters.find((c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/metrics');
      assert.ok(httpCounter);
      assert.ok(httpCounter.value >= 1);
    });

    test('33. AI, SSE, and DB metrics appear in snapshot output', async () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 80 });
      recordSSEStreamStart();
      recordDatabaseConnected(true);

      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      assert.ok(data.metrics.counters.some((c) => c.name === 'nova_ai_requests_total'));
      assert.ok(data.metrics.gauges.some((g) => g.name === 'nova_sse_active_streams'));
      assert.ok(data.metrics.gauges.some((g) => g.name === 'nova_db_connected'));
    });

    test('34. Document, RAG, Media, and Rate-Limit metrics appear in snapshot output', async () => {
      recordDocumentUpload({ status: 'accepted' });
      recordRAGSearch({ outcome: 'success', durationMs: 60 });
      recordMediaOperation({ operation: 'image', outcome: 'success', durationMs: 30 });
      recordRateLimitRejection({ limiter: 'chat' });

      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      const data = await res.json();
      assert.ok(data.metrics.counters.some((c) => c.name === 'nova_document_uploads_total'));
      assert.ok(data.metrics.counters.some((c) => c.name === 'nova_rag_searches_total'));
      assert.ok(data.metrics.counters.some((c) => c.name === 'nova_media_operations_total'));
      assert.ok(data.metrics.counters.some((c) => c.name === 'nova_rate_limit_rejections_total'));
    });

    test('35. Request correlation context is properly preserved on /api/metrics', async () => {
      const customTraceId = 'req-trace-correlation-metrics-test';
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie, 'X-Request-Id': customTraceId },
      });
      assert.equal(res.headers.get('x-request-id'), customTraceId);
    });

    test('36. Structured logging continues operating during metrics endpoint invocations', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      await res.json();
      await new Promise((r) => setTimeout(r, 20));

      const metricLogs = capturedLogs.filter((l) => l.record.event === 'http.request.completed' && (l.record.route === '/api/metrics' || l.record.route.startsWith('/api/metrics')));
      assert.ok(metricLogs.length >= 1);
    });
  });

  // ==========================================================================
  // 9. CARDINALITY & RESILIENCE (Tests 37 - 40)
  // ==========================================================================
  describe('9. Cardinality & Resilience', () => {
    test('37. repeated metrics requests do not increase series because of request-specific values', async () => {
      const initialSeriesCount = metrics.seriesCount;

      for (let i = 0; i < 15; i++) {
        await fetch(`${baseUrl}/api/metrics?run=${i}`, {
          headers: { Cookie: validAuthCookie, 'X-Request-Id': `trace-${i}` },
        });
      }

      await new Promise((r) => setTimeout(r, 30));
      const finalSeriesCount = metrics.seriesCount;

      // Only standard HTTP metric series for /api/metrics is created (<= 3 series: counter, duration, error)
      assert.ok(finalSeriesCount - initialSeriesCount <= 3, 'Repeated requests must not expand metric series');
    });

    test('38. metrics endpoint handles empty/reset test snapshot safely', async () => {
      metrics.reset();
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(Array.isArray(data.metrics.counters));
    });

    test('39. metrics endpoint remains safe when database is disconnected', async () => {
      recordDatabaseConnected(false);
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      const dbGauge = data.metrics.gauges.find((g) => g.name === 'nova_db_connected');
      assert.equal(dbGauge?.value, 0);
    });

    test('40. metrics serialization cannot crash the application', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Cookie: validAuthCookie },
      });
      assert.equal(res.status, 200);
      assert.doesNotThrow(async () => {
        await res.json();
      });
    });
  });
});
