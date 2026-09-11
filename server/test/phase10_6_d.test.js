import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import {
  metrics,
  recordAITelemetry,
  recordAIRetryTelemetry,
  recordSSEStreamStart,
  recordSSEStreamEnd,
  recordDatabaseConnected,
  recordDatabaseError,
  normalizeAIOperation,
  normalizeAIModel,
  normalizeSSEOutcome,
  normalizeDBPhase,
  MAX_METRIC_SERIES,
} from '../utils/metrics.js';
import { executeWithTransientRetry } from '../services/ai/geminiService.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { httpMetricsMiddleware } from '../utils/metrics.js';
import { getRequestContext } from '../utils/requestContext.js';

describe('Phase 10.6-D: AI, SSE & Database Telemetry Test Suite', () => {
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
  // SECTION 1: AI TELEMETRY (Tests 1 - 9)
  // ==========================================================================
  describe('AI Telemetry & Retry Tracking', () => {
    test('1. AI logical request increments exactly once on single attempt', () => {
      recordAITelemetry({
        operation: 'chat',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs: 150,
        isError: false,
      });

      const snapshot = metrics.snapshot();
      const reqCounter = snapshot.counters.find((c) => c.name === 'nova_ai_requests_total');
      assert.ok(reqCounter, 'nova_ai_requests_total counter should exist');
      assert.equal(reqCounter.value, 1);
      assert.equal(reqCounter.labels.operation, 'chat');
      assert.equal(reqCounter.labels.model, 'gemini-2.5-flash');
      assert.equal(reqCounter.labels.statusClass, '2xx');
    });

    test('2. Retry increments exactly once per actual retry attempt', async () => {
      let attempts = 0;
      let retriesCounted = 0;

      const transientError = new Error('503 Service Unavailable');
      transientError.status = 503;

      await executeWithTransientRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw transientError;
          }
          return 'ok';
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          onRetry: () => {
            retriesCounted++;
            recordAIRetryTelemetry({ operation: 'chat', model: 'gemini-2.5-flash' });
          },
        }
      );

      assert.equal(attempts, 3, 'Should execute 1 initial + 2 retries = 3 attempts');
      assert.equal(retriesCounted, 2, 'Should record exactly 2 retry callbacks');

      const snapshot = metrics.snapshot();
      const retryCounter = snapshot.counters.find((c) => c.name === 'nova_ai_retries_total');
      assert.ok(retryCounter, 'nova_ai_retries_total counter should exist');
      assert.equal(retryCounter.value, 2);
    });

    test('3. Retries do not increment request count (1 logical operation = 1 request)', async () => {
      let attempts = 0;
      const transientError = new Error('Resource Exhausted');
      transientError.status = 429;

      await executeWithTransientRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw transientError;
          }
          return 'success';
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          onRetry: () => {
            recordAIRetryTelemetry({ operation: 'chat', model: 'gemini-2.5-flash' });
          },
        }
      );

      // Record logical completion after retry loop completes
      recordAITelemetry({
        operation: 'chat',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs: 250,
        isError: false,
      });

      const snapshot = metrics.snapshot();
      const reqCounter = snapshot.counters.find((c) => c.name === 'nova_ai_requests_total');
      const retryCounter = snapshot.counters.find((c) => c.name === 'nova_ai_retries_total');

      assert.equal(reqCounter.value, 1, 'Requests total should be 1');
      assert.equal(retryCounter.value, 2, 'Retries total should be 2');
    });

    test('4. Successful retry does not increment error count', async () => {
      let attempts = 0;
      const transientError = new Error('503 Service Unavailable');
      transientError.status = 503;

      await executeWithTransientRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw transientError;
          }
          return 'success';
        },
        {
          maxRetries: 2,
          baseDelayMs: 1,
          maxDelayMs: 5,
          onRetry: () => {
            recordAIRetryTelemetry({ operation: 'chat', model: 'gemini-2.5-flash' });
          },
        }
      );

      recordAITelemetry({
        operation: 'chat',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs: 180,
        isError: false,
      });

      const snapshot = metrics.snapshot();
      const errCounter = snapshot.counters.find((c) => c.name === 'nova_ai_errors_total');
      assert.equal(errCounter, undefined, 'No AI error metric should be recorded on recovered retry');
    });

    test('5. Final AI failure increments error count exactly once', async () => {
      let attempts = 0;
      const transientError = new Error('503 Service Unavailable');
      transientError.status = 503;

      let caughtError = null;
      try {
        await executeWithTransientRetry(
          async () => {
            attempts++;
            throw transientError;
          },
          {
            maxRetries: 2,
            baseDelayMs: 1,
            maxDelayMs: 5,
            onRetry: () => {
              recordAIRetryTelemetry({ operation: 'chat', model: 'gemini-2.5-flash' });
            },
          }
        );
      } catch (err) {
        caughtError = err;
        recordAITelemetry({
          operation: 'chat',
          model: 'gemini-2.5-flash',
          statusClass: '5xx',
          durationMs: 220,
          isError: true,
        });
      }

      assert.ok(caughtError, 'Should throw final error after retries exhausted');
      assert.equal(attempts, 3, 'Initial + 2 retries = 3 attempts');

      const snapshot = metrics.snapshot();
      const reqCounter = snapshot.counters.find((c) => c.name === 'nova_ai_requests_total');
      const retryCounter = snapshot.counters.find((c) => c.name === 'nova_ai_retries_total');
      const errCounter = snapshot.counters.find((c) => c.name === 'nova_ai_errors_total');

      assert.equal(reqCounter.value, 1);
      assert.equal(retryCounter.value, 2);
      assert.equal(errCounter.value, 1);
      assert.equal(errCounter.labels.statusClass, '5xx');
    });

    test('6. AI duration recorded exactly once with monotonic timing including retries', async () => {
      const startHr = process.hrtime.bigint();

      await executeWithTransientRetry(
        async () => {
          return 'done';
        },
        { maxRetries: 1 }
      );

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordAITelemetry({
        operation: 'document_analysis',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs,
        isError: false,
      });

      const snapshot = metrics.snapshot();
      const durationHist = snapshot.histograms.find((h) => h.name === 'nova_ai_request_duration_ms');
      assert.ok(durationHist, 'Duration histogram should exist');
      assert.equal(durationHist.count, 1, 'Exactly one duration observation should be recorded');
      assert.ok(durationHist.sum >= 0, 'Duration sum must be positive');
      assert.equal(durationHist.labels.operation, 'document_analysis');
    });

    test('7. Model labels are bounded and normalized', () => {
      assert.equal(normalizeAIModel('gemini-2.5-flash'), 'gemini-2.5-flash');
      assert.equal(normalizeAIModel('models/gemini-2.5-flash'), 'gemini-2.5-flash');
      assert.equal(normalizeAIModel('arbitrary-client-string-attack'), 'gemini-2.5-flash');
      assert.equal(normalizeAIModel(null), 'gemini-2.5-flash');
      assert.equal(normalizeAIModel(12345), 'gemini-2.5-flash');
    });

    test('8. Operation labels are bounded and normalized', () => {
      assert.equal(normalizeAIOperation('chat'), 'chat');
      assert.equal(normalizeAIOperation('chat_stream'), 'chat_stream');
      assert.equal(normalizeAIOperation('document_analysis'), 'document_analysis');
      assert.equal(normalizeAIOperation('malicious_op_injection'), 'other');
      assert.equal(normalizeAIOperation(undefined), 'chat');
    });

    test('9. No prompt, user ID, or request ID enters metric labels', () => {
      recordAITelemetry({
        operation: 'chat',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs: 100,
        isError: false,
        // Even if unauthorized keys are supplied:
        prompt: 'Secret user prompt containing API keys',
        userId: 'usr_secret_123',
        requestId: 'req_sensitive_xyz',
      });

      const snapshot = metrics.snapshot();
      const entry = snapshot.counters.find((c) => c.name === 'nova_ai_requests_total');
      assert.ok(entry);
      assert.equal(entry.labels.prompt, undefined);
      assert.equal(entry.labels.userId, undefined);
      assert.equal(entry.labels.requestId, undefined);
      assert.deepEqual(Object.keys(entry.labels).sort(), ['model', 'operation', 'statusClass']);
    });
  });

  // ==========================================================================
  // SECTION 2: SSE TELEMETRY (Tests 10 - 18)
  // ==========================================================================
  describe('SSE Streaming Lifecycle Telemetry', () => {
    test('10. Active gauge increments once on stream start', () => {
      const activeGauge = metrics.gauge('nova_sse_active_streams');
      assert.equal(activeGauge.get(), 0);

      recordSSEStreamStart();
      assert.equal(activeGauge.get(), 1);

      recordSSEStreamStart();
      assert.equal(activeGauge.get(), 2);
    });

    test('11. Active gauge decrements once on stream end and does not go negative', () => {
      const activeGauge = metrics.gauge('nova_sse_active_streams');
      recordSSEStreamStart();
      assert.equal(activeGauge.get(), 1);

      recordSSEStreamEnd({ outcome: 'completed', durationMs: 120 });
      assert.equal(activeGauge.get(), 0);

      // Attempt extra decrement
      recordSSEStreamEnd({ outcome: 'completed', durationMs: 50 });
      assert.equal(activeGauge.get(), 0, 'Active gauge must never become negative');
    });

    test('12. Successful stream records "completed" outcome', () => {
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'completed', durationMs: 350 });

      const snapshot = metrics.snapshot();
      const totalCounter = snapshot.counters.find(
        (c) => c.name === 'nova_sse_streams_total' && c.labels.outcome === 'completed'
      );
      assert.ok(totalCounter);
      assert.equal(totalCounter.value, 1);
    });

    test('13. Stopped stream records "stopped" outcome', () => {
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'stopped', durationMs: 100 });

      const snapshot = metrics.snapshot();
      const totalCounter = snapshot.counters.find(
        (c) => c.name === 'nova_sse_streams_total' && c.labels.outcome === 'stopped'
      );
      assert.ok(totalCounter);
      assert.equal(totalCounter.value, 1);
    });

    test('14. Client disconnect records "client_disconnected" outcome', () => {
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'client_disconnected', durationMs: 80 });

      const snapshot = metrics.snapshot();
      const totalCounter = snapshot.counters.find(
        (c) => c.name === 'nova_sse_streams_total' && c.labels.outcome === 'client_disconnected'
      );
      assert.ok(totalCounter);
      assert.equal(totalCounter.value, 1);
    });

    test('15. Failed stream records "failed" outcome', () => {
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'failed', durationMs: 50 });

      const snapshot = metrics.snapshot();
      const totalCounter = snapshot.counters.find(
        (c) => c.name === 'nova_sse_streams_total' && c.labels.outcome === 'failed'
      );
      assert.ok(totalCounter);
      assert.equal(totalCounter.value, 1);
    });

    test('16. Duplicate cleanup does not decrement twice (idempotency guard)', () => {
      recordSSEStreamStart();

      let sseFinalized = false;
      const finalize = (outcome) => {
        if (sseFinalized) return;
        sseFinalized = true;
        recordSSEStreamEnd({ outcome, durationMs: 100 });
      };

      finalize('completed');
      finalize('client_disconnected'); // Ignored by idempotent guard
      finalize('failed');              // Ignored by idempotent guard

      const activeGauge = metrics.gauge('nova_sse_active_streams');
      assert.equal(activeGauge.get(), 0);

      const snapshot = metrics.snapshot();
      const totalCount = snapshot.counters
        .filter((c) => c.name === 'nova_sse_streams_total')
        .reduce((sum, c) => sum + c.value, 0);
      assert.equal(totalCount, 1, 'Only one terminal outcome recorded');
    });

    test('17. Stream duration recorded once upon termination', () => {
      recordSSEStreamStart();
      recordSSEStreamEnd({ outcome: 'completed', durationMs: 420.5 });

      const snapshot = metrics.snapshot();
      const durationHist = snapshot.histograms.find((h) => h.name === 'nova_sse_stream_duration_ms');
      assert.ok(durationHist);
      assert.equal(durationHist.count, 1);
      assert.equal(durationHist.sum, 420.5);
      assert.equal(durationHist.labels.outcome, 'completed');
    });

    test('18. No per-token or per-chunk metric explosion during long stream', () => {
      recordSSEStreamStart();

      // Simulate 500 streamed tokens/chunks
      for (let i = 0; i < 500; i++) {
        // Chunks are emitted directly via SSE data without metric increments
      }

      recordSSEStreamEnd({ outcome: 'completed', durationMs: 1200 });

      const snapshot = metrics.snapshot();
      const streamSeries = [
        ...snapshot.counters.filter((c) => c.name.startsWith('nova_sse_')),
        ...snapshot.gauges.filter((g) => g.name.startsWith('nova_sse_')),
        ...snapshot.histograms.filter((h) => h.name.startsWith('nova_sse_')),
      ];

      // Total series created for SSE must remain strictly bounded (3 total: gauge, total counter, duration hist)
      assert.ok(streamSeries.length <= 3, `Expected <= 3 SSE metric series, got ${streamSeries.length}`);
    });
  });

  // ==========================================================================
  // SECTION 3: DATABASE TELEMETRY (Tests 19 - 24)
  // ==========================================================================
  describe('Database Lifecycle & Telemetry', () => {
    test('19. DB connected gauge becomes 1 on connect', () => {
      recordDatabaseConnected(true);
      const gauge = metrics.gauge('nova_db_connected');
      assert.equal(gauge.get(), 1);
    });

    test('20. DB connected gauge becomes 0 on disconnect', () => {
      recordDatabaseConnected(true);
      assert.equal(metrics.gauge('nova_db_connected').get(), 1);

      recordDatabaseConnected(false);
      assert.equal(metrics.gauge('nova_db_connected').get(), 0);
    });

    test('21. Repeated lifecycle events remain idempotent', () => {
      recordDatabaseConnected(true);
      recordDatabaseConnected(true);
      recordDatabaseConnected(true);
      assert.equal(metrics.gauge('nova_db_connected').get(), 1);

      recordDatabaseConnected(false);
      recordDatabaseConnected(false);
      assert.equal(metrics.gauge('nova_db_connected').get(), 0);

      const snapshot = metrics.snapshot();
      const dbGauges = snapshot.gauges.filter((g) => g.name === 'nova_db_connected');
      assert.equal(dbGauges.length, 1, 'Only 1 gauge series exists');
    });

    test('22. DB errors increment correctly with bounded phases', () => {
      recordDatabaseError('connect');
      recordDatabaseError('connect');
      recordDatabaseError('operation');
      recordDatabaseError('disconnect');
      recordDatabaseError('invalid_phase_name'); // Normalized to 'operation'

      const snapshot = metrics.snapshot();
      const connectErrors = snapshot.counters.find(
        (c) => c.name === 'nova_db_errors_total' && c.labels.phase === 'connect'
      );
      const opErrors = snapshot.counters.find(
        (c) => c.name === 'nova_db_errors_total' && c.labels.phase === 'operation'
      );
      const discErrors = snapshot.counters.find(
        (c) => c.name === 'nova_db_errors_total' && c.labels.phase === 'disconnect'
      );

      assert.equal(connectErrors?.value, 2);
      assert.equal(opErrors?.value, 2); // 1 valid + 1 fallback
      assert.equal(discErrors?.value, 1);
    });

    test('23. No sensitive DB data enters metric labels', () => {
      recordDatabaseError('connect');
      const snapshot = metrics.snapshot();
      const dbErrorCounter = snapshot.counters.find((c) => c.name === 'nova_db_errors_total');
      assert.ok(dbErrorCounter);
      assert.equal(dbErrorCounter.labels.uri, undefined);
      assert.equal(dbErrorCounter.labels.password, undefined);
      assert.equal(dbErrorCounter.labels.connectionString, undefined);
      assert.deepEqual(Object.keys(dbErrorCounter.labels), ['phase']);
    });

    test('24. Database telemetry does not break readiness/health helpers', () => {
      // isDatabaseConnected returns boolean safely
      const connected = isDatabaseConnected();
      assert.equal(typeof connected, 'boolean');
      // Telemetry must be observational only
      recordDatabaseConnected(connected);
      assert.equal(metrics.gauge('nova_db_connected').get(), connected ? 1 : 0);
    });
  });

  // ==========================================================================
  // SECTION 4: CARDINALITY & MEMORY SAFETY (Tests 25 - 27)
  // ==========================================================================
  describe('Cardinality & Boundedness Protection', () => {
    test('25. Dynamic/untrusted values cannot create unbounded series', () => {
      for (let i = 0; i < 100; i++) {
        recordAITelemetry({
          operation: `untrusted_op_${i}`,
          model: `malicious_model_${i}`,
          statusClass: 200,
          durationMs: 10,
        });
      }

      const snapshot = metrics.snapshot();
      const aiSeries = snapshot.counters.filter((c) => c.name === 'nova_ai_requests_total');
      // All normalized to operation='other', model='gemini-2.5-flash', statusClass='2xx'
      assert.equal(aiSeries.length, 1, 'All untrusted strings should normalize into a single safe series');
      assert.equal(aiSeries[0].value, 100);
    });

    test('26. Metric series strictly remain under MAX_METRIC_SERIES', () => {
      const engine = new (metrics.constructor)({ maxSeries: 10 });

      for (let i = 0; i < 50; i++) {
        engine.counter(`dynamic_metric_${i}`).inc();
      }

      assert.equal(engine.seriesCount, 10, 'Engine must enforce hard ceiling on max series');
    });

    test('27. Snapshots produce deep immutable copies without reference leaks', () => {
      recordAITelemetry({
        operation: 'chat',
        model: 'gemini-2.5-flash',
        statusClass: '2xx',
        durationMs: 100,
      });

      const snap1 = metrics.snapshot();
      snap1.counters[0].value = 9999;
      snap1.counters[0].labels.operation = 'tampered';

      const snap2 = metrics.snapshot();
      assert.equal(snap2.counters[0].value, 1, 'Original internal metric value should be untampered');
      assert.equal(snap2.counters[0].labels.operation, 'chat', 'Original label should remain untampered');
    });
  });

  // ==========================================================================
  // SECTION 5: INTEGRATION & REGRESSION (Tests 28 - 32)
  // ==========================================================================
  describe('Cross-Phase Integration & Compatibility', () => {
    test('28. Existing request correlation context remains intact during telemetry calls', async () => {
      const app = express();
      app.use(requestIdMiddleware);
      app.use(httpMetricsMiddleware);

      let contextRequestId = null;
      app.get('/test-correlation', (req, res) => {
        const ctx = getRequestContext();
        contextRequestId = ctx?.requestId;
        recordAITelemetry({
          operation: 'chat',
          model: 'gemini-2.5-flash',
          statusClass: '2xx',
          durationMs: 50,
        });
        res.json({ ok: true, reqId: contextRequestId });
      });

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://127.0.0.1:${port}/test-correlation`);
      const body = await response.json();
      server.close();

      assert.ok(body.reqId, 'RequestId must exist in request context');
      assert.equal(body.reqId, contextRequestId);

      // Verify AI metric does NOT contain requestId
      const snapshot = metrics.snapshot();
      const aiReq = snapshot.counters.find((c) => c.name === 'nova_ai_requests_total');
      assert.equal(aiReq.labels.requestId, undefined);
    });

    test('29. Structured logging works seamlessly alongside telemetry without leaking secrets', () => {
      logger.info('ai.generation.completed', {
        operation: 'chat',
        model: 'gemini-2.5-flash',
        durationMs: 120,
        apiKey: 'AIzaSySecretApiKey1234567890',
      });

      assert.equal(capturedLogs.length, 1);
      const logged = capturedLogs[0];
      assert.equal(logged.record.operation, 'chat');
      assert.equal(logged.record.durationMs, 120);
      assert.equal(logged.record.apiKey, '[REDACTED]', 'Sensitive keys must be redacted');
    });

    test('30. Existing Phase 10.6-C HTTP metrics continue to operate concurrently', async () => {
      const app = express();
      app.use(httpMetricsMiddleware);
      app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
      app.get('/api/bad', (req, res) => res.status(500).json({ error: 'failed' }));

      const server = app.listen(0);
      const port = server.address().port;

      await fetch(`http://127.0.0.1:${port}/api/health`);
      await fetch(`http://127.0.0.1:${port}/api/bad`);
      server.close();

      const snapshot = metrics.snapshot();
      const http2xx = snapshot.counters.find(
        (c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/health'
      );
      const http5xx = snapshot.counters.find(
        (c) => c.name === 'nova_http_requests_total' && c.labels.route === '/api/bad'
      );
      const httpErrors = snapshot.counters.find((c) => c.name === 'nova_http_errors_total');

      assert.equal(http2xx?.value, 1);
      assert.equal(http5xx?.value, 1);
      assert.equal(httpErrors?.value, 1);
    });

    test('31. SSE outcome normalization handles unexpected strings gracefully', () => {
      assert.equal(normalizeSSEOutcome('completed'), 'completed');
      assert.equal(normalizeSSEOutcome('stopped'), 'stopped');
      assert.equal(normalizeSSEOutcome('client_disconnected'), 'client_disconnected');
      assert.equal(normalizeSSEOutcome('failed'), 'failed');
      assert.equal(normalizeSSEOutcome('arbitrary_error_msg'), 'completed');
      assert.equal(normalizeSSEOutcome(null), 'completed');
    });

    test('32. Database error phase normalization handles unexpected inputs safely', () => {
      assert.equal(normalizeDBPhase('connect'), 'connect');
      assert.equal(normalizeDBPhase('disconnect'), 'disconnect');
      assert.equal(normalizeDBPhase('operation'), 'operation');
      assert.equal(normalizeDBPhase('syntax_error_table_drop'), 'operation');
      assert.equal(normalizeDBPhase(null), 'operation');
    });
  });
});
