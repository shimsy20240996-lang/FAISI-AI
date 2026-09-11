import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { resolveRequestId, requestIdMiddleware } from '../middleware/requestId.js';
import { runWithRequestContext, getRequestContext, getRequestId } from '../utils/requestContext.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';

describe('Phase 10.6-A: Request Correlation & Async Context Foundation Suite', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Health and Readiness probes
    app.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'ok', requestId: getRequestId() });
    });

    app.get('/api/ready', (req, res) => {
      res.status(200).json({ status: 'ready', requestId: req.requestId });
    });

    // Async context inspection endpoint
    app.get('/api/test/context', async (req, res) => {
      const ctxBefore = getRequestContext();
      const idBefore = getRequestId();

      // Simulate async processing tree (promises, timers)
      await new Promise((resolve) => setTimeout(resolve, 20));

      const ctxAfter = getRequestContext();
      const idAfter = getRequestId();

      res.status(200).json({
        reqId: req.requestId,
        idBefore,
        idAfter,
        contextMatch: ctxBefore?.requestId === ctxAfter?.requestId,
        method: ctxAfter?.method,
        route: ctxAfter?.route,
        hasStartTime: typeof ctxAfter?.startTime === 'number',
      });
    });

    // Interleaved concurrency testing endpoint with variable async delay
    app.get('/api/test/concurrent-delay', async (req, res) => {
      const delay = parseInt(req.query.delay || '10', 10);
      const initialId = getRequestId();

      await new Promise((resolve) => setTimeout(resolve, delay));

      const finalId = getRequestId();
      res.status(200).json({
        receivedId: req.requestId,
        contextId: finalId,
        consistent: initialId === finalId,
      });
    });

    // SSE streaming endpoint
    app.get('/api/test/sse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamReqId = getRequestId();
      res.write(`data: ${JSON.stringify({ type: 'start', requestId: streamReqId })}\n\n`);

      setTimeout(() => {
        const streamEndId = getRequestId();
        res.write(`data: ${JSON.stringify({ type: 'end', requestId: streamEndId })}\n\n`);
        res.end();
      }, 30);
    });

    // Operational error endpoint (400)
    app.get('/api/test/operational-error', (req, res, next) => {
      next(new AppError('Invalid request parameter provided.', 400, 'INVALID_INPUT'));
    });

    // Unhandled error endpoint (500)
    app.get('/api/test/internal-error', (req, res, next) => {
      next(new Error('Simulated unhandled internal database failure'));
    });

    // 404 Fallback
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: { message: `Not found: ${req.path}`, code: 'NOT_FOUND' },
      });
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
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // --------------------------------------------------------------------------
  // 1. Unit Tests: resolveRequestId and validation rules
  // --------------------------------------------------------------------------
  describe('1. Request ID Validation & Resolution (resolveRequestId)', () => {
    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    test('generates valid UUID v4 when incoming ID is missing or undefined', () => {
      const generated1 = resolveRequestId(undefined);
      const generated2 = resolveRequestId('');
      assert.match(generated1, UUID_V4_REGEX);
      assert.match(generated2, UUID_V4_REGEX);
      assert.notEqual(generated1, generated2);
    });

    test('preserves valid custom inbound request IDs (8 to 64 alphanumeric chars, underscores, hyphens)', () => {
      assert.equal(resolveRequestId('client-req-12345'), 'client-req-12345');
      assert.equal(resolveRequestId('REQ_abcdef_9876543210'), 'REQ_abcdef_9876543210');
      assert.equal(resolveRequestId('12345678'), '12345678'); // exactly 8 chars
      const sixtyFourCharId = 'A'.repeat(64);
      assert.equal(resolveRequestId(sixtyFourCharId), sixtyFourCharId);
    });

    test('rejects and replaces inbound request IDs shorter than 8 characters', () => {
      const result = resolveRequestId('short');
      assert.match(result, UUID_V4_REGEX);
      assert.notEqual(result, 'short');
    });

    test('rejects and replaces inbound request IDs longer than 64 characters', () => {
      const longId = 'A'.repeat(65);
      const result = resolveRequestId(longId);
      assert.match(result, UUID_V4_REGEX);
      assert.notEqual(result, longId);
    });

    test('rejects and sanitizes inbound request IDs containing spaces, tabs, or whitespace', () => {
      const withSpace = resolveRequestId('req id with spaces');
      assert.match(withSpace, UUID_V4_REGEX);
      assert.ok(!withSpace.includes(' '));
    });

    test('rejects CR/LF injection and header smuggling characters in X-Request-Id', () => {
      const crlf1 = resolveRequestId('validprefix\r\nSet-Cookie: evil=true');
      const crlf2 = resolveRequestId('test\nInjected-Header: 123');
      const quotes = resolveRequestId('req-"malicious"-payload');
      const angleBrackets = resolveRequestId('<script>alert(1)</script>');

      assert.match(crlf1, UUID_V4_REGEX);
      assert.match(crlf2, UUID_V4_REGEX);
      assert.match(quotes, UUID_V4_REGEX);
      assert.match(angleBrackets, UUID_V4_REGEX);
    });

    test('rejects non-string values safely without throwing', () => {
      assert.match(resolveRequestId(null), UUID_V4_REGEX);
      assert.match(resolveRequestId(12345678), UUID_V4_REGEX);
      assert.match(resolveRequestId({}), UUID_V4_REGEX);
      assert.match(resolveRequestId([]), UUID_V4_REGEX);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Unit Tests: AsyncLocalStorage context API & Safety
  // --------------------------------------------------------------------------
  describe('2. AsyncLocalStorage Context API & Safety', () => {
    test('getRequestContext() returns null when called outside an active request scope', () => {
      assert.equal(getRequestContext(), null);
    });

    test('getRequestId() returns null when called outside an active request scope', () => {
      assert.equal(getRequestId(), null);
    });

    test('runWithRequestContext executes callback within isolated context', () => {
      const mockContext = {
        requestId: 'test-req-id-12345678',
        method: 'GET',
        route: '/api/test',
        startTime: Date.now(),
      };

      runWithRequestContext(mockContext, () => {
        assert.equal(getRequestId(), 'test-req-id-12345678');
        const currentCtx = getRequestContext();
        assert.equal(currentCtx.method, 'GET');
        assert.equal(currentCtx.route, '/api/test');
      });

      // Context must be null immediately after run finishes
      assert.equal(getRequestId(), null);
    });

    test('preserves context across async promise chains and timeouts', async () => {
      const mockContext = {
        requestId: 'async-chain-id-99999999',
        method: 'POST',
        route: '/api/chain',
        startTime: Date.now(),
      };

      await runWithRequestContext(mockContext, async () => {
        assert.equal(getRequestId(), 'async-chain-id-99999999');

        await new Promise((resolve) => setTimeout(resolve, 15));
        assert.equal(getRequestId(), 'async-chain-id-99999999');

        await Promise.resolve();
        assert.equal(getRequestId(), 'async-chain-id-99999999');
      });

      assert.equal(getRequestId(), null);
    });
  });

  // --------------------------------------------------------------------------
  // 3. HTTP Integration Tests: Headers & Endpoints
  // --------------------------------------------------------------------------
  describe('3. HTTP Response Headers & Endpoint Integration', () => {
    test('generates and attaches X-Request-Id header when incoming request has no header', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);

      const headerId = res.headers.get('x-request-id');
      assert.ok(headerId, 'Response must include X-Request-Id header');
      assert.match(headerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      const body = await res.json();
      assert.equal(body.requestId, headerId);
    });

    test('preserves valid inbound X-Request-Id in response header and handler', async () => {
      const customId = 'client-custom-req-trace-999';
      const res = await fetch(`${baseUrl}/api/ready`, {
        headers: { 'X-Request-Id': customId },
      });
      assert.equal(res.status, 200);

      const headerId = res.headers.get('x-request-id');
      assert.equal(headerId, customId);

      const body = await res.json();
      assert.equal(body.requestId, customId);
    });

    test('replaces invalid inbound X-Request-Id with safe UUID in response header', async () => {
      const maliciousId = 'short';
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': maliciousId },
      });
      assert.equal(res.status, 200);

      const headerId = res.headers.get('x-request-id');
      assert.notEqual(headerId, maliciousId);
      assert.match(headerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('AsyncLocalStorage context is populated and maintained across async tree in endpoint', async () => {
      const traceId = 'trace-context-test-12345';
      const res = await fetch(`${baseUrl}/api/test/context`, {
        headers: { 'X-Request-Id': traceId },
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.reqId, traceId);
      assert.equal(body.idBefore, traceId);
      assert.equal(body.idAfter, traceId);
      assert.equal(body.contextMatch, true);
      assert.equal(body.method, 'GET');
      assert.equal(body.route, '/api/test/context');
      assert.equal(body.hasStartTime, true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Concurrency & Isolation Tests
  // --------------------------------------------------------------------------
  describe('4. Concurrency & Async Context Isolation', () => {
    test('maintains strict context isolation across 20 interleaved concurrent requests', async () => {
      const concurrentRequests = Array.from({ length: 20 }, (_, idx) => {
        const id = `concurrent-trace-id-${idx.toString().padStart(3, '0')}-abcd`;
        const delay = (idx % 4) * 5 + 5; // 5ms to 20ms interleaved delays
        return { id, delay };
      });

      const results = await Promise.all(
        concurrentRequests.map(async ({ id, delay }) => {
          const res = await fetch(`${baseUrl}/api/test/concurrent-delay?delay=${delay}`, {
            headers: { 'X-Request-Id': id },
          });
          const headerId = res.headers.get('x-request-id');
          const data = await res.json();
          return { sentId: id, headerId, data };
        })
      );

      for (const result of results) {
        assert.equal(result.headerId, result.sentId);
        assert.equal(result.data.receivedId, result.sentId);
        assert.equal(result.data.contextId, result.sentId);
        assert.equal(result.data.consistent, true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Error Pipeline Tests
  // --------------------------------------------------------------------------
  describe('5. Error Pipeline & Correlation ID Preservation', () => {
    test('preserves X-Request-Id on 400 operational validation error', async () => {
      const reqId = 'error-trace-operational-400';
      const res = await fetch(`${baseUrl}/api/test/operational-error`, {
        headers: { 'X-Request-Id': reqId },
      });
      assert.equal(res.status, 400);
      assert.equal(res.headers.get('x-request-id'), reqId);

      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INVALID_INPUT');
    });

    test('preserves X-Request-Id on 404 not found responses', async () => {
      const reqId = 'error-trace-notfound-404';
      const res = await fetch(`${baseUrl}/api/non-existent-endpoint`, {
        headers: { 'X-Request-Id': reqId },
      });
      assert.equal(res.status, 404);
      assert.equal(res.headers.get('x-request-id'), reqId);
    });

    test('preserves X-Request-Id on 500 unhandled internal error', async () => {
      const reqId = 'error-trace-internal-500';
      const res = await fetch(`${baseUrl}/api/test/internal-error`, {
        headers: { 'X-Request-Id': reqId },
      });
      assert.equal(res.status, 500);
      assert.equal(res.headers.get('x-request-id'), reqId);

      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
    });
  });

  // --------------------------------------------------------------------------
  // 6. SSE Compatibility Tests
  // --------------------------------------------------------------------------
  describe('6. SSE Compatibility & Async Context', () => {
    test('SSE response receives X-Request-Id header and context remains valid during stream', async () => {
      const sseTraceId = 'sse-stream-trace-id-12345';
      const res = await fetch(`${baseUrl}/api/test/sse`, {
        headers: { 'X-Request-Id': sseTraceId },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream');
      assert.equal(res.headers.get('x-request-id'), sseTraceId);

      const text = await res.text();
      assert.ok(text.includes('data: {"type":"start","requestId":"sse-stream-trace-id-12345"}'));
      assert.ok(text.includes('data: {"type":"end","requestId":"sse-stream-trace-id-12345"}'));
    });
  });
});
