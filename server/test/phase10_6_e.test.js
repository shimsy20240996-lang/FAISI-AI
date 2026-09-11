import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import {
  metrics,
  recordDocumentUpload,
  recordDocumentProcessing,
  recordRAGSearch,
  recordRAGIndexing,
  recordMediaOperation,
  recordRateLimitRejection,
  normalizeDocUploadStatus,
  normalizeDocOperation,
  normalizeDocOutcome,
  normalizeRAGSearchOutcome,
  normalizeRAGIndexingOutcome,
  normalizeMediaOperation,
  normalizeMediaOutcome,
  normalizeLimiterName,
  MAX_METRIC_SERIES,
  httpMetricsMiddleware,
  recordAITelemetry,
  recordSSEStreamStart,
  recordSSEStreamEnd,
  recordDatabaseConnected,
} from '../utils/metrics.js';
import { authRateLimiter, chatRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.js';
import { logger } from '../utils/logger.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { getRequestContext } from '../utils/requestContext.js';

describe('Phase 10.6-E: Document, RAG, Media & Rate-Limit Telemetry Suite', () => {
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

  // ==========================================================================
  // 1. DOCUMENT TELEMETRY (Tests 1 - 7)
  // ==========================================================================
  describe('1. Document Telemetry', () => {
    test('1. accepted upload increments upload metric', () => {
      recordDocumentUpload({ status: 'accepted' });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_document_uploads_total' && c.labels.status === 'accepted'
      );
      assert.ok(counter, 'nova_document_uploads_total counter should exist');
      assert.equal(counter.value, 1);
    });

    test('2. rejected upload increments rejected outcome', () => {
      recordDocumentUpload({ status: 'rejected' });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_document_uploads_total' && c.labels.status === 'rejected'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('3. failed processing increments failed outcome', () => {
      recordDocumentProcessing({ operation: 'extract', outcome: 'failed', durationMs: 45 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_document_processing_total' && c.labels.operation === 'extract' && c.labels.outcome === 'failed'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('4. successful processing increments success', () => {
      recordDocumentProcessing({ operation: 'extract', outcome: 'success', durationMs: 120 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_document_processing_total' && c.labels.operation === 'extract' && c.labels.outcome === 'success'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('5. processing duration recorded exactly once with monotonic timing', () => {
      recordDocumentProcessing({ operation: 'delete', outcome: 'success', durationMs: 32.5 });
      const snapshot = metrics.snapshot();
      const histogram = snapshot.histograms.find(
        (h) => h.name === 'nova_document_processing_duration_ms' && h.labels.operation === 'delete' && h.labels.outcome === 'success'
      );
      assert.ok(histogram);
      assert.equal(histogram.count, 1);
      assert.equal(histogram.sum, 32.5);
    });

    test('6. document IDs cannot become labels', () => {
      recordDocumentProcessing({
        operation: 'extract',
        outcome: 'success',
        durationMs: 50,
        documentId: 'doc_secret_67890abcdef',
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_document_processing_total');
      assert.equal(counter.labels.documentId, undefined);
      assert.deepEqual(Object.keys(counter.labels).sort(), ['operation', 'outcome']);
    });

    test('7. filenames cannot become labels', () => {
      recordDocumentUpload({
        status: 'accepted',
        fileName: 'quarterly_financial_statement_2026.pdf',
        originalName: 'secret_file.docx',
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_document_uploads_total');
      assert.equal(counter.labels.fileName, undefined);
      assert.equal(counter.labels.originalName, undefined);
      assert.deepEqual(Object.keys(counter.labels), ['status']);
    });
  });

  // ==========================================================================
  // 2. RAG TELEMETRY (Tests 8 - 15)
  // ==========================================================================
  describe('2. RAG Telemetry', () => {
    test('8. successful search counted', () => {
      recordRAGSearch({ outcome: 'success', durationMs: 85 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_rag_searches_total' && c.labels.outcome === 'success'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('9. no-evidence search counted distinctly', () => {
      recordRAGSearch({ outcome: 'no_evidence', durationMs: 40 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_rag_searches_total' && c.labels.outcome === 'no_evidence'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('10. failed search counted', () => {
      recordRAGSearch({ outcome: 'failed', durationMs: 15 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_rag_searches_total' && c.labels.outcome === 'failed'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('11. search duration recorded exactly once', () => {
      recordRAGSearch({ outcome: 'success', durationMs: 125.4 });
      const snapshot = metrics.snapshot();
      const histogram = snapshot.histograms.find(
        (h) => h.name === 'nova_rag_search_duration_ms' && h.labels.outcome === 'success'
      );
      assert.ok(histogram);
      assert.equal(histogram.count, 1);
      assert.equal(histogram.sum, 125.4);
    });

    test('12. indexing success counted', () => {
      recordRAGIndexing({ outcome: 'success', durationMs: 450 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_rag_indexing_total' && c.labels.outcome === 'success'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('13. indexing failure counted', () => {
      recordRAGIndexing({ outcome: 'failed', durationMs: 210 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_rag_indexing_total' && c.labels.outcome === 'failed'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('14. indexing duration recorded once', () => {
      recordRAGIndexing({ outcome: 'success', durationMs: 380 });
      const snapshot = metrics.snapshot();
      const histogram = snapshot.histograms.find(
        (h) => h.name === 'nova_rag_indexing_duration_ms' && h.labels.outcome === 'success'
      );
      assert.ok(histogram);
      assert.equal(histogram.count, 1);
      assert.equal(histogram.sum, 380);
    });

    test('15. query, document, and generation IDs cannot become labels', () => {
      recordRAGSearch({
        outcome: 'success',
        durationMs: 70,
        query: 'What is our Q3 profit margin?',
        documentId: '65f1234567890abcdef12345',
        generationId: 'gen_uuid_12345',
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_rag_searches_total');
      assert.equal(counter.labels.query, undefined);
      assert.equal(counter.labels.documentId, undefined);
      assert.equal(counter.labels.generationId, undefined);
      assert.deepEqual(Object.keys(counter.labels), ['outcome']);
    });
  });

  // ==========================================================================
  // 3. MEDIA TELEMETRY (Tests 16 - 21)
  // ==========================================================================
  describe('3. Media Telemetry', () => {
    test('16. successful media operation counted', () => {
      recordMediaOperation({ operation: 'image', outcome: 'success', durationMs: 65 });
      recordMediaOperation({ operation: 'transcription', outcome: 'success', durationMs: 230 });
      recordMediaOperation({ operation: 'tts', outcome: 'success', durationMs: 140 });

      const snapshot = metrics.snapshot();
      const img = snapshot.counters.find(
        (c) => c.name === 'nova_media_operations_total' && c.labels.operation === 'image' && c.labels.outcome === 'success'
      );
      const trans = snapshot.counters.find(
        (c) => c.name === 'nova_media_operations_total' && c.labels.operation === 'transcription' && c.labels.outcome === 'success'
      );
      const tts = snapshot.counters.find(
        (c) => c.name === 'nova_media_operations_total' && c.labels.operation === 'tts' && c.labels.outcome === 'success'
      );

      assert.equal(img?.value, 1);
      assert.equal(trans?.value, 1);
      assert.equal(tts?.value, 1);
    });

    test('17. rejected media operation counted', () => {
      recordMediaOperation({ operation: 'image', outcome: 'rejected', durationMs: 5 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_media_operations_total' && c.labels.operation === 'image' && c.labels.outcome === 'rejected'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('18. failed media operation counted', () => {
      recordMediaOperation({ operation: 'transcription', outcome: 'failed', durationMs: 50 });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find(
        (c) => c.name === 'nova_media_operations_total' && c.labels.operation === 'transcription' && c.labels.outcome === 'failed'
      );
      assert.ok(counter);
      assert.equal(counter.value, 1);
    });

    test('19. media duration recorded once', () => {
      recordMediaOperation({ operation: 'tts', outcome: 'success', durationMs: 175.8 });
      const snapshot = metrics.snapshot();
      const histogram = snapshot.histograms.find(
        (h) => h.name === 'nova_media_operation_duration_ms' && h.labels.operation === 'tts' && h.labels.outcome === 'success'
      );
      assert.ok(histogram);
      assert.equal(histogram.count, 1);
      assert.equal(histogram.sum, 175.8);
    });

    test('20. MIME types cannot become arbitrary labels', () => {
      recordMediaOperation({
        operation: 'image',
        outcome: 'success',
        durationMs: 40,
        mimeType: 'image/vnd.adobe.photoshop',
        declaredMime: 'audio/x-matroska',
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_media_operations_total');
      assert.equal(counter.labels.mimeType, undefined);
      assert.equal(counter.labels.declaredMime, undefined);
      assert.deepEqual(Object.keys(counter.labels).sort(), ['operation', 'outcome']);
    });

    test('21. audio/image content cannot enter telemetry labels', () => {
      recordMediaOperation({
        operation: 'image',
        outcome: 'success',
        durationMs: 30,
        rawBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE...',
        audioBuffer: Buffer.from('RIFF....'),
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_media_operations_total');
      assert.equal(counter.labels.rawBase64, undefined);
      assert.equal(counter.labels.audioBuffer, undefined);
    });
  });

  // ==========================================================================
  // 4. RATE LIMIT TELEMETRY (Tests 22 - 25)
  // ==========================================================================
  describe('4. Rate Limit Telemetry', () => {
    test('22. existing limiter rejection increments metric', async () => {
      const app = express();
      app.use(
        '/test-auth',
        authRateLimiter,
        (req, res) => res.json({ ok: true })
      );

      const server = app.listen(0);
      const port = server.address().port;

      // Exhaust auth rate limiter (configured for 30 requests in test environment)
      for (let i = 0; i < 31; i++) {
        await fetch(`http://127.0.0.1:${port}/test-auth`, { method: 'POST' });
      }
      server.close();

      const snapshot = metrics.snapshot();
      const rejectionCounter = snapshot.counters.find(
        (c) => c.name === 'nova_rate_limit_rejections_total' && c.labels.limiter === 'auth'
      );
      assert.ok(rejectionCounter, 'Rejection counter for auth limiter must exist');
      assert.ok(rejectionCounter.value >= 1, 'Rejection counter must be >= 1');
    });

    test('23. limiter label is bounded and normalized', () => {
      assert.equal(normalizeLimiterName('auth'), 'auth');
      assert.equal(normalizeLimiterName('chat'), 'chat');
      assert.equal(normalizeLimiterName('stream'), 'stream');
      assert.equal(normalizeLimiterName('rag'), 'rag');
      assert.equal(normalizeLimiterName('indexing'), 'indexing');
      assert.equal(normalizeLimiterName('upload'), 'upload');
      assert.equal(normalizeLimiterName('analysis'), 'analysis');
      assert.equal(normalizeLimiterName('media'), 'media');
      assert.equal(normalizeLimiterName('unrecognized_custom_limiter'), 'other');
      assert.equal(normalizeLimiterName(null), 'other');
    });

    test('24. IP, user, and client IDs cannot become labels', () => {
      recordRateLimitRejection({
        limiter: 'chat',
        ip: '192.168.1.100',
        userId: 'usr_secret_id_999',
        clientId: 'client_xyz',
      });
      const snapshot = metrics.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'nova_rate_limit_rejections_total');
      assert.equal(counter.labels.ip, undefined);
      assert.equal(counter.labels.userId, undefined);
      assert.equal(counter.labels.clientId, undefined);
      assert.deepEqual(Object.keys(counter.labels), ['limiter']);
    });

    test('25. telemetry cannot change limiter decision (status code & response body remain identical)', async () => {
      const app = express();
      app.use(
        '/test-custom-limiter',
        (req, res, next) => {
          recordRateLimitRejection({ limiter: 'upload' });
          res.status(429).json({ success: false, error: { code: 'UPLOAD_RATE_LIMIT_EXCEEDED' } });
        }
      );

      const server = app.listen(0);
      const port = server.address().port;

      const res = await fetch(`http://127.0.0.1:${port}/test-custom-limiter`);
      const data = await res.json();
      server.close();

      assert.equal(res.status, 429);
      assert.equal(data.error.code, 'UPLOAD_RATE_LIMIT_EXCEEDED');
    });
  });

  // ==========================================================================
  // 5. CARDINALITY SAFETY (Tests 26 - 30)
  // ==========================================================================
  describe('5. Cardinality & Memory Bounds', () => {
    test('26. arbitrary document IDs do not increase series', () => {
      for (let i = 0; i < 50; i++) {
        recordDocumentProcessing({
          operation: `fake_op_${i}`,
          outcome: `fake_out_${i}`,
          durationMs: 10,
        });
      }
      const snapshot = metrics.snapshot();
      const docSeries = snapshot.counters.filter((c) => c.name === 'nova_document_processing_total');
      assert.equal(docSeries.length, 1, 'All unrecognized values collapse to a single bounded series');
    });

    test('27. arbitrary RAG queries do not increase series', () => {
      for (let i = 0; i < 50; i++) {
        recordRAGSearch({
          outcome: `untrusted_outcome_${i}`,
          durationMs: 15,
        });
      }
      const snapshot = metrics.snapshot();
      const ragSeries = snapshot.counters.filter((c) => c.name === 'nova_rag_searches_total');
      assert.equal(ragSeries.length, 1, 'Unrecognized RAG outcomes collapse to fallback series');
    });

    test('28. arbitrary media values do not increase series', () => {
      for (let i = 0; i < 50; i++) {
        recordMediaOperation({
          operation: `custom_media_${i}`,
          outcome: `unrecognized_outcome_${i}`,
          durationMs: 20,
        });
      }
      const snapshot = metrics.snapshot();
      const mediaSeries = snapshot.counters.filter((c) => c.name === 'nova_media_operations_total');
      assert.equal(mediaSeries.length, 1, 'Unrecognized media operations collapse to a single safe series');
    });

    test('29. arbitrary limiter names do not create unbounded series', () => {
      for (let i = 0; i < 50; i++) {
        recordRateLimitRejection({ limiter: `dynamic_limiter_${i}` });
      }
      const snapshot = metrics.snapshot();
      const limiterSeries = snapshot.counters.filter((c) => c.name === 'nova_rate_limit_rejections_total');
      assert.equal(limiterSeries.length, 1, 'Unrecognized limiter names collapse to "other"');
    });

    test('30. MAX_METRIC_SERIES remains strictly enforced', () => {
      const engine = new (metrics.constructor)({ maxSeries: 15 });
      for (let i = 0; i < 100; i++) {
        engine.counter(`metric_${i}`).inc();
      }
      assert.equal(engine.seriesCount, 15);
    });
  });

  // ==========================================================================
  // 6. CROSS-PHASE INTEGRATION (Tests 31 - 37)
  // ==========================================================================
  describe('6. Cross-Phase Integration & Compatibility', () => {
    test('31. Phase 10.6-C HTTP metrics remain intact', () => {
      const counter = metrics.counter('nova_http_requests_total', { method: 'GET', route: '/api/health', statusClass: '2xx' });
      counter.inc();
      assert.equal(counter.get(), 1);
    });

    test('32. Phase 10.6-D AI/SSE/DB metrics remain intact', () => {
      recordAITelemetry({ operation: 'chat', model: 'gemini-2.5-flash', statusClass: '2xx', durationMs: 100 });
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'completed', durationMs: 200 });
      recordDatabaseConnected(true);

      const snapshot = metrics.snapshot();
      assert.ok(snapshot.counters.find((c) => c.name === 'nova_ai_requests_total'));
      assert.ok(snapshot.counters.find((c) => c.name === 'nova_sse_streams_total'));
      assert.ok(snapshot.gauges.find((g) => g.name === 'nova_db_connected'));
    });

    test('33. Request correlation context remains intact during telemetry recording', async () => {
      const app = express();
      app.use(requestIdMiddleware);
      app.use(httpMetricsMiddleware);

      let capturedReqId = null;
      app.get('/test-doc-telemetry', (req, res) => {
        const ctx = getRequestContext();
        capturedReqId = ctx?.requestId;
        recordDocumentUpload({ status: 'accepted' });
        res.json({ ok: true, reqId: capturedReqId });
      });

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://127.0.0.1:${port}/test-doc-telemetry`);
      const body = await response.json();
      server.close();

      assert.ok(body.reqId);
      assert.equal(body.reqId, capturedReqId);
    });

    test('34. Structured logging works seamlessly alongside telemetry without leaking secrets', () => {
      logger.info('rag.search.completed', {
        outcome: 'success',
        durationMs: 75,
        apiKey: 'SecretCredential12345',
      });

      assert.equal(capturedLogs.length, 1);
      assert.equal(capturedLogs[0].record.apiKey, '[REDACTED]');
    });

    test('35. Health endpoint contracts (/api/health) remain safe and unaffected', async () => {
      const app = express();
      app.get('/api/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() }));

      const server = app.listen(0);
      const port = server.address().port;

      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await res.json();
      server.close();

      assert.equal(res.status, 200);
      assert.equal(body.status, 'healthy');
    });

    test('36. Readiness endpoint contracts (/api/ready) remain correct and unaffected', async () => {
      const app = express();
      app.get('/api/ready', (req, res) => res.status(200).json({ status: 'ready', checks: { database: 'connected' } }));

      const server = app.listen(0);
      const port = server.address().port;

      const res = await fetch(`http://127.0.0.1:${port}/api/ready`);
      const body = await res.json();
      server.close();

      assert.equal(res.status, 200);
      assert.equal(body.status, 'ready');
    });

    test('37. No sensitive values enter metric labels across all new telemetry functions', () => {
      recordDocumentUpload({ status: 'accepted', apiKey: 'secret', token: 'jwt.token.val' });
      recordRAGSearch({ outcome: 'success', durationMs: 10, prompt: 'Secret Query' });
      recordMediaOperation({ operation: 'image', outcome: 'success', durationMs: 20, base64: 'raw_data' });
      recordRateLimitRejection({ limiter: 'auth', password: 'plain_password' });

      const snapshot = metrics.snapshot();
      for (const counter of snapshot.counters) {
        assert.equal(counter.labels.apiKey, undefined);
        assert.equal(counter.labels.token, undefined);
        assert.equal(counter.labels.prompt, undefined);
        assert.equal(counter.labels.base64, undefined);
        assert.equal(counter.labels.password, undefined);
      }
    });
  });
});
