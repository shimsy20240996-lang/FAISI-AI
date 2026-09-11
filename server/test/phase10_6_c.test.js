import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  MetricEngine,
  DEFAULT_HISTOGRAM_BUCKETS,
  MAX_METRIC_SERIES,
  normalizeMethod,
  normalizeStatusClass,
  normalizeRoute,
  metrics,
  httpMetricsMiddleware,
} from '../utils/metrics.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

describe('Phase 10.6-C: In-Memory Metric Engine & HTTP Instrumentation Suite', () => {
  let capturedLogs = [];

  beforeEach(() => {
    metrics.reset();
    capturedLogs = [];
    logger.setOutputDestination((record, formatted) => {
      capturedLogs.push({ record, formatted });
    });
  });

  after(() => {
    logger.resetOutputDestination();
    metrics.reset();
  });

  // --------------------------------------------------------------------------
  // 1. Counter Metric Tests
  // --------------------------------------------------------------------------
  describe('1. Counter Metric Implementation', () => {
    test('creates counter and increments by default 1', () => {
      const counter = metrics.counter('nova_http_requests_total', { method: 'GET', route: '/api/health', statusClass: '2xx' });
      assert.equal(counter.get(), 0);

      counter.inc();
      assert.equal(counter.get(), 1);

      counter.inc(5);
      assert.equal(counter.get(), 6);
    });

    test('counter rejects negative increments and invalid values without corrupting state', () => {
      const counter = metrics.counter('nova_http_requests_total', { method: 'POST', route: '/api/chat', statusClass: '2xx' });
      counter.inc(10);

      counter.inc(-5);
      assert.equal(counter.get(), 10);

      counter.inc(NaN);
      assert.equal(counter.get(), 10);

      counter.inc('invalid');
      assert.equal(counter.get(), 10);

      counter.inc(Infinity);
      assert.equal(counter.get(), 10);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Gauge Metric Tests
  // --------------------------------------------------------------------------
  describe('2. Gauge Metric Implementation', () => {
    test('gauge set, inc, and dec work correctly', () => {
      const gauge = metrics.gauge('nova_db_connected', { database: 'nova_ai' });
      assert.equal(gauge.get(), 0);

      gauge.set(1);
      assert.equal(gauge.get(), 1);

      gauge.inc(4);
      assert.equal(gauge.get(), 5);

      gauge.dec(2);
      assert.equal(gauge.get(), 3);

      gauge.dec();
      assert.equal(gauge.get(), 2);
    });

    test('gauge rejects invalid numeric inputs gracefully', () => {
      const gauge = metrics.gauge('nova_sse_active_streams');
      gauge.set(10);

      gauge.set(NaN);
      assert.equal(gauge.get(), 10);

      gauge.inc(Infinity);
      assert.equal(gauge.get(), 10);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Histogram Metric Tests
  // --------------------------------------------------------------------------
  describe('3. Histogram Metric & Bucket Distribution', () => {
    test('records observations and maintains count, sum, min, max, and bucket counts', () => {
      const hist = metrics.histogram('nova_http_request_duration_ms', { method: 'GET', route: '/api/health', statusClass: '2xx' });

      hist.observe(8); // <= 10
      hist.observe(45); // <= 50
      hist.observe(120); // <= 250
      hist.observe(5500); // <= 10000

      const snapshot = hist.get();
      assert.equal(snapshot.count, 4);
      assert.equal(snapshot.sum, 8 + 45 + 120 + 5500);
      assert.equal(snapshot.min, 8);
      assert.equal(snapshot.max, 5500);

      // Bucket checks
      assert.equal(snapshot.buckets['10'], 1);
      assert.equal(snapshot.buckets['50'], 2); // 8 and 45
      assert.equal(snapshot.buckets['100'], 2);
      assert.equal(snapshot.buckets['250'], 3); // 8, 45, 120
      assert.equal(snapshot.buckets['500'], 3);
      assert.equal(snapshot.buckets['10000'], 4);
      assert.equal(snapshot.buckets['+Inf'], 4);
    });

    test('handles latency overflow above largest bucket (>30000ms)', () => {
      const hist = metrics.histogram('nova_http_request_duration_ms', { method: 'POST', route: '/api/heavy', statusClass: '2xx' });
      hist.observe(45000);

      const snapshot = hist.get();
      assert.equal(snapshot.count, 1);
      assert.equal(snapshot.sum, 45000);
      assert.equal(snapshot.buckets['30000'], 0);
      assert.equal(snapshot.buckets['+Inf'], 1);
    });

    test('histogram rejects negative or NaN values safely', () => {
      const hist = metrics.histogram('nova_http_request_duration_ms');
      hist.observe(-10);
      hist.observe(NaN);

      const snapshot = hist.get();
      assert.equal(snapshot.count, 0);
      assert.equal(snapshot.sum, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Normalization Helpers
  // --------------------------------------------------------------------------
  describe('4. Label Normalization Helpers', () => {
    test('normalizeMethod restricts to allowed uppercase methods or OTHER', () => {
      assert.equal(normalizeMethod('get'), 'GET');
      assert.equal(normalizeMethod('POST'), 'POST');
      assert.equal(normalizeMethod('put'), 'PUT');
      assert.equal(normalizeMethod('DELETE'), 'DELETE');
      assert.equal(normalizeMethod('OPTIONS'), 'OPTIONS');
      assert.equal(normalizeMethod('HEAD'), 'HEAD');
      assert.equal(normalizeMethod('PATCH'), 'PATCH');
      assert.equal(normalizeMethod('TRACE'), 'OTHER');
      assert.equal(normalizeMethod('CUSTOM_INJECTION'), 'OTHER');
      assert.equal(normalizeMethod(null), 'OTHER');
    });

    test('normalizeStatusClass maps HTTP status codes to 2xx, 3xx, 4xx, 5xx, or other', () => {
      assert.equal(normalizeStatusClass(200), '2xx');
      assert.equal(normalizeStatusClass(204), '2xx');
      assert.equal(normalizeStatusClass(301), '3xx');
      assert.equal(normalizeStatusClass(304), '3xx');
      assert.equal(normalizeStatusClass(400), '4xx');
      assert.equal(normalizeStatusClass(404), '4xx');
      assert.equal(normalizeStatusClass(500), '5xx');
      assert.equal(normalizeStatusClass(503), '5xx');
      assert.equal(normalizeStatusClass(999), 'other');
      assert.equal(normalizeStatusClass('invalid'), 'other');
    });

    test('normalizeRoute normalizes static assets, health probes, Express patterns, and IDs', () => {
      assert.equal(normalizeRoute({ path: '/assets/index-BOHnxTi8.js' }), '/_static');
      assert.equal(normalizeRoute({ path: '/favicon.ico' }), '/_static');
      assert.equal(normalizeRoute({ path: '/style.css' }), '/_static');
      assert.equal(normalizeRoute({ path: '/api/health' }), '/api/health');
      assert.equal(normalizeRoute({ path: '/api/ready' }), '/api/ready');
      assert.equal(normalizeRoute({ path: '/' }), '/');

      // Express route pattern match
      assert.equal(
        normalizeRoute({ baseUrl: '/api/conversations', route: { path: '/:id' } }),
        '/api/conversations/:id'
      );

      // Unmatched API route containing ObjectID / UUID fallback
      assert.equal(normalizeRoute({ path: '/api/conversations/64b5f891e4b0c2a1d3f5e789' }), '/api/conversations/:id');
      assert.equal(
        normalizeRoute({ path: '/api/documents/123e4567-e89b-12d3-a456-426614174000' }),
        '/api/documents/:id'
      );
      assert.equal(normalizeRoute({ path: '/api/unknown/random/endpoint' }), '/api/unknown/random/endpoint');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Memory Boundedness & Series Limit
  // --------------------------------------------------------------------------
  describe('5. Memory Bounds & Cardinality Protection', () => {
    test('enforces hard series ceiling and prevents unbounded memory growth', () => {
      const boundedEngine = new MetricEngine({ maxSeries: 5 });

      for (let i = 0; i < 10; i++) {
        boundedEngine.counter(`metric_${i}`).inc(1);
      }

      assert.equal(boundedEngine.seriesCount, 5);
      const snap = boundedEngine.snapshot();
      assert.equal(snap.counters.length, 5);

      // Verify controlled warning was emitted via logger
      const warningLog = capturedLogs.find((l) => l.record.event === 'metrics.series_limit_reached');
      assert.ok(warningLog, 'Must emit metrics.series_limit_reached warning');
      assert.equal(warningLog.record.maxSeries, 5);
    });

    test('rejects non-whitelisted label keys for HTTP metrics', () => {
      const counter = metrics.counter('nova_http_requests_total', {
        method: 'GET',
        route: '/api/health',
        statusClass: '2xx',
        userId: 'user_12345',
        prompt: 'malicious prompt injection',
        jwt: 'eyJhbGci...',
      });
      counter.inc(1);

      const snap = metrics.snapshot();
      const entry = snap.counters.find((c) => c.name === 'nova_http_requests_total');
      assert.ok(entry);
      assert.equal(entry.labels.method, 'GET');
      assert.equal(entry.labels.route, '/api/health');
      assert.equal(entry.labels.statusClass, '2xx');
      assert.equal(entry.labels.userId, undefined);
      assert.equal(entry.labels.prompt, undefined);
      assert.equal(entry.labels.jwt, undefined);
    });

    test('validates metric names and rejects malformed names safely', () => {
      const invalid = metrics.counter('invalid-name-with-hyphens!@#$');
      invalid.inc(5);

      const snap = metrics.snapshot();
      assert.equal(snap.counters.length, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Snapshot & Reset API
  // --------------------------------------------------------------------------
  describe('6. Snapshot & Reset API', () => {
    test('snapshot returns deep-cloned immutable representation', () => {
      metrics.counter('nova_http_requests_total', { method: 'GET', route: '/api/health', statusClass: '2xx' }).inc(42);
      metrics.gauge('nova_db_connected').set(1);
      metrics.histogram('nova_http_request_duration_ms', { method: 'GET', route: '/api/health', statusClass: '2xx' }).observe(15);

      const snap1 = metrics.snapshot();
      assert.equal(snap1.counters[0].value, 42);
      assert.equal(snap1.gauges[0].value, 1);
      assert.equal(snap1.histograms[0].count, 1);

      // Attempt mutating snapshot object directly
      snap1.counters[0].value = 999;
      snap1.counters[0].labels.method = 'MUTATED';

      const snap2 = metrics.snapshot();
      assert.equal(snap2.counters[0].value, 42);
      assert.equal(snap2.counters[0].labels.method, 'GET');
    });

    test('reset clears all counters, gauges, and histograms', () => {
      metrics.counter('nova_http_requests_total').inc(10);
      metrics.gauge('nova_db_connected').set(1);
      metrics.histogram('nova_http_request_duration_ms').observe(25);

      assert.equal(metrics.seriesCount, 3);
      metrics.reset();

      assert.equal(metrics.seriesCount, 0);
      const snap = metrics.snapshot();
      assert.equal(snap.counters.length, 0);
      assert.equal(snap.gauges.length, 0);
      assert.equal(snap.histograms.length, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Express HTTP Middleware Integration Tests
  // --------------------------------------------------------------------------
  describe('7. HTTP Middleware Instrumentation & Route Integration', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
      app = express();
      app.use(express.json());
      app.use(requestIdMiddleware);
      app.use(httpMetricsMiddleware);

      // Test endpoints
      app.get('/api/health', (req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      app.get('/api/ready', (req, res) => {
        res.status(200).json({ status: 'ready' });
      });

      app.get('/api/conversations/:id', (req, res) => {
        res.status(200).json({ conversationId: req.params.id });
      });

      app.get('/api/test/slow', async (req, res) => {
        await new Promise((r) => setTimeout(r, 25));
        res.status(200).json({ slow: true });
      });

      app.get('/api/test/fail', (req, res, next) => {
        next(new AppError('Intentional route failure', 400, 'FAIL_TEST'));
      });

      app.get('/assets/vendor-ui.js', (req, res) => {
        res.status(200).send('console.log("vendor");');
      });

      // 404 Fallback
      app.use((req, res) => {
        res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
      });

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
      if (server) {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('instruments successful HTTP requests in nova_http_requests_total and duration histogram', async () => {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': 'metric-test-trace-12345' },
      });
      assert.equal(res.status, 200);

      // Wait a tick for res.on('finish')
      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const reqCounter = snap.counters.find(
        (c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/health' && c.labels.method === 'GET'
      );
      assert.ok(reqCounter, 'Must find nova_http_requests_total for /api/health');
      assert.equal(reqCounter.value, 1);
      assert.equal(reqCounter.labels.statusClass, '2xx');

      const durationHist = snap.histograms.find(
        (h) => h.name === 'nova_http_request_duration_ms' && h.labels.route === '/api/health'
      );
      assert.ok(durationHist, 'Must find nova_http_request_duration_ms for /api/health');
      assert.equal(durationHist.count, 1);
      assert.ok(durationHist.sum > 0);
    });

    test('normalizes parameterized Express route /api/conversations/:id without cardinality explosion', async () => {
      await fetch(`${baseUrl}/api/conversations/conv-12345`);
      await fetch(`${baseUrl}/api/conversations/conv-67890`);
      await fetch(`${baseUrl}/api/conversations/conv-abcdef`);

      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const convCounters = snap.counters.filter((c) => c.labels.route === '/api/conversations/:id');
      assert.equal(convCounters.length, 1, 'All parameterized ID requests must collapse into a single route series');
      assert.equal(convCounters[0].value, 3);
    });

    test('tracks HTTP errors in nova_http_errors_total with statusClass 4xx', async () => {
      const res = await fetch(`${baseUrl}/api/test/fail`);
      assert.equal(res.status, 400);

      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const errorCounter = snap.counters.find(
        (c) => c.name === 'nova_http_errors_total' && c.labels.route === '/api/test/fail'
      );
      assert.ok(errorCounter, 'Must find nova_http_errors_total');
      assert.equal(errorCounter.value, 1);
      assert.equal(errorCounter.labels.statusClass, '4xx');
    });

    test('categorizes static asset requests under /_static route label', async () => {
      await fetch(`${baseUrl}/assets/vendor-ui.js`);

      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const staticCounter = snap.counters.find((c) => c.labels.route === '/_static');
      assert.ok(staticCounter, 'Must map static asset requests to /_static');
      assert.equal(staticCounter.value, 1);
    });

    test('strips query strings from metric labels and avoids series explosion', async () => {
      await fetch(`${baseUrl}/api/health?token=secret123&user=admin`);
      await fetch(`${baseUrl}/api/health?timestamp=99999`);

      await new Promise((r) => setTimeout(r, 20));

      const snap = metrics.snapshot();
      const healthSeries = snap.counters.filter((c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/health');
      assert.equal(healthSeries.length, 1, 'Query parameters must not create separate metric series');
      assert.equal(healthSeries[0].labels.token, undefined);
    });

    test('maintains accuracy across 20 concurrent requests without race conditions', async () => {
      const beforeSnap = metrics.snapshot();
      const initialCount = beforeSnap.counters.find((c) => c.labels.route === '/api/health')?.value || 0;

      await Promise.all(
        Array.from({ length: 20 }, (_, idx) => fetch(`${baseUrl}/api/health?req=${idx}`))
      );

      await new Promise((r) => setTimeout(r, 30));

      const afterSnap = metrics.snapshot();
      const finalCounter = afterSnap.counters.find((c) => c.labels.route === '/api/health');
      assert.equal(finalCounter.value, initialCount + 20);
    });

    test('verifies that /api/metrics does NOT exist (Phase 10.6-F scope boundary)', async () => {
      const res = await fetch(`${baseUrl}/api/metrics`);
      assert.equal(res.status, 404, '/api/metrics must return 404 in Phase 10.6-C');
    });
  });
});
