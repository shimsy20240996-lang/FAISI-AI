import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Logger, LOG_LEVELS, sanitizeString, sanitizeValue, logger } from '../utils/logger.js';
import { runWithRequestContext, getRequestContext, getRequestId } from '../utils/requestContext.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';
import { ENV, VALID_LOG_LEVELS, validateEnv } from '../config/env.js';

describe('Phase 10.6-B: Structured Logging Core & Redaction Engine Suite', () => {
  let capturedLogs = [];
  let testLogger;

  beforeEach(() => {
    capturedLogs = [];
    testLogger = new Logger({
      level: 'DEBUG',
      environment: 'production',
      format: 'json',
      destination: (record, formatted) => {
        capturedLogs.push({ record, formatted });
      },
    });

    // Also hook singleton logger output for middleware/error-handler testing
    logger.setOutputDestination((record, formatted) => {
      capturedLogs.push({ record, formatted });
    });
  });

  after(() => {
    logger.resetOutputDestination();
  });

  // --------------------------------------------------------------------------
  // 1. Log Level Filtering & Hierarchy
  // --------------------------------------------------------------------------
  describe('1. Log Level Filtering & Hierarchy', () => {
    test('DEBUG level allows all logs (DEBUG, INFO, WARN, ERROR)', () => {
      testLogger.setLevel('DEBUG');
      testLogger.debug('test.debug', { val: 1 });
      testLogger.info('test.info', { val: 2 });
      testLogger.warn('test.warn', { val: 3 });
      testLogger.error('test.error', { val: 4 });

      assert.equal(capturedLogs.length, 4);
      assert.equal(capturedLogs[0].record.level, 'DEBUG');
      assert.equal(capturedLogs[1].record.level, 'INFO');
      assert.equal(capturedLogs[2].record.level, 'WARN');
      assert.equal(capturedLogs[3].record.level, 'ERROR');
    });

    test('INFO level suppresses DEBUG and allows INFO, WARN, ERROR', () => {
      testLogger.setLevel('INFO');
      testLogger.debug('test.debug');
      testLogger.info('test.info');
      testLogger.warn('test.warn');
      testLogger.error('test.error');

      assert.equal(capturedLogs.length, 3);
      assert.equal(capturedLogs[0].record.level, 'INFO');
      assert.equal(capturedLogs[1].record.level, 'WARN');
      assert.equal(capturedLogs[2].record.level, 'ERROR');
    });

    test('WARN level suppresses DEBUG and INFO, allows WARN and ERROR', () => {
      testLogger.setLevel('WARN');
      testLogger.debug('test.debug');
      testLogger.info('test.info');
      testLogger.warn('test.warn');
      testLogger.error('test.error');

      assert.equal(capturedLogs.length, 2);
      assert.equal(capturedLogs[0].record.level, 'WARN');
      assert.equal(capturedLogs[1].record.level, 'ERROR');
    });

    test('ERROR level suppresses all except ERROR', () => {
      testLogger.setLevel('ERROR');
      testLogger.debug('test.debug');
      testLogger.info('test.info');
      testLogger.warn('test.warn');
      testLogger.error('test.error');

      assert.equal(capturedLogs.length, 1);
      assert.equal(capturedLogs[0].record.level, 'ERROR');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Output Formats (Production JSON & Development Text)
  // --------------------------------------------------------------------------
  describe('2. Output Formats (Production JSON & Development Text)', () => {
    test('production mode produces valid JSON with required core fields', () => {
      testLogger.info('server.started', { port: 5000, model: 'gemini-2.5-flash' });
      assert.equal(capturedLogs.length, 1);

      const { record, formatted } = capturedLogs[0];
      const parsed = JSON.parse(formatted);

      assert.equal(parsed.level, 'INFO');
      assert.equal(parsed.event, 'server.started');
      assert.equal(parsed.port, 5000);
      assert.equal(parsed.model, 'gemini-2.5-flash');
      assert.ok(Date.parse(parsed.timestamp), 'Timestamp must be valid ISO date string');
    });

    test('development mode produces readable text with redacted fields', () => {
      const devLogger = new Logger({
        level: 'DEBUG',
        environment: 'development',
        format: 'text',
        destination: (record, formatted) => {
          capturedLogs.push({ record, formatted });
        },
      });

      devLogger.info('http.request.completed', {
        method: 'GET',
        route: '/api/health',
        status: 200,
        durationMs: 12,
        statusClass: '2xx',
      });

      assert.equal(capturedLogs.length, 1);
      const { formatted } = capturedLogs[0];
      assert.ok(formatted.includes('INFO'));
      assert.ok(formatted.includes('http.request.completed'));
      assert.ok(formatted.includes('GET'));
      assert.ok(formatted.includes('/api/health'));
      assert.ok(formatted.includes('200'));
      assert.ok(formatted.includes('12ms'));
    });
  });

  // --------------------------------------------------------------------------
  // 3. Request Correlation Auto-Injection (AsyncLocalStorage)
  // --------------------------------------------------------------------------
  describe('3. Request Correlation Auto-Injection', () => {
    test('automatically extracts requestId, method, and route when called inside request context', () => {
      const mockContext = {
        requestId: 'req-corr-trace-99999',
        method: 'POST',
        route: '/api/chat',
        startTime: Date.now(),
      };

      runWithRequestContext(mockContext, () => {
        testLogger.info('ai.request.completed', { status: 200, durationMs: 450 });
      });

      assert.equal(capturedLogs.length, 1);
      const record = capturedLogs[0].record;
      assert.equal(record.requestId, 'req-corr-trace-99999');
      assert.equal(record.method, 'POST');
      assert.equal(record.route, '/api/chat');
      assert.equal(record.status, 200);
      assert.equal(record.durationMs, 450);
    });

    test('omits requestId when invoked outside of an active request context', () => {
      testLogger.info('database.connected', { database: 'nova_ai' });
      assert.equal(capturedLogs.length, 1);
      assert.equal(capturedLogs[0].record.requestId, undefined);
    });

    test('maintains strict request correlation across concurrent interleaved async operations', async () => {
      const tasks = [1, 2, 3, 4, 5].map((idx) => {
        const ctx = {
          requestId: `async-trace-req-${idx}`,
          method: 'GET',
          route: `/api/task/${idx}`,
          startTime: Date.now(),
        };

        return runWithRequestContext(ctx, async () => {
          testLogger.debug(`task.step1`, { step: 1 });
          await new Promise((r) => setTimeout(r, 10 + (idx % 3) * 5));
          testLogger.info(`task.step2`, { step: 2 });
        });
      });

      await Promise.all(tasks);

      assert.equal(capturedLogs.length, 10);
      for (const { record } of capturedLogs) {
        assert.ok(record.requestId.startsWith('async-trace-req-'));
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Targeted Sensitive Field Redaction
  // --------------------------------------------------------------------------
  describe('4. Targeted Sensitive Field Redaction', () => {
    test('redacts password, passwordHash, and auth_secret', () => {
      testLogger.info('auth.attempt', {
        password: 'SuperSecretPassword123!',
        passwordHash: '$2a$12$e8k...sensitivehash',
        authSecret: '32characterlongauthsecrethere12345',
        safeField: 'active',
      });

      const rec = capturedLogs[0].record;
      assert.equal(rec.password, '[REDACTED]');
      assert.equal(rec.passwordHash, '[REDACTED]');
      assert.equal(rec.authSecret, '[REDACTED]');
      assert.equal(rec.safeField, 'active');
    });

    test('redacts tokens, JWTs, and authorization headers', () => {
      testLogger.info('auth.token_event', {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis',
        accessToken: 'access-token-12345',
        refreshToken: 'refresh-token-67890',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xyz',
        Authorization: 'Basic dXNlcjpwYXNz',
      });

      const rec = capturedLogs[0].record;
      assert.equal(rec.token, '[REDACTED]');
      assert.equal(rec.accessToken, '[REDACTED]');
      assert.equal(rec.refreshToken, '[REDACTED]');
      assert.equal(rec.authorization, '[REDACTED]');
      assert.equal(rec.Authorization, '[REDACTED]');
    });

    test('redacts cookies and set-cookie fields', () => {
      testLogger.info('cookie.event', {
        cookie: 'nova_auth_token=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc; Path=/',
        'set-cookie': 'session=abc; HttpOnly; Secure',
      });

      const rec = capturedLogs[0].record;
      assert.equal(rec.cookie, '[REDACTED]');
      assert.equal(rec['set-cookie'], '[REDACTED]');
    });

    test('redacts prompts, AI responses, embeddings, and extracted document text', () => {
      testLogger.info('ai.generation', {
        prompt: 'Explain how quantum computing works in detail',
        response: 'Quantum computing uses quantum bits...',
        content: 'Confidential system message payload',
        extractedText: 'Full confidential PDF document text here',
        chunkText: 'Specific paragraph chunk text',
        query: 'Private user query search',
        retrievedText: 'RAG retrieved knowledge base text',
        embedding: [0.123, 0.456, 0.789],
      });

      const rec = capturedLogs[0].record;
      assert.equal(rec.prompt, '[REDACTED]');
      assert.equal(rec.response, '[REDACTED]');
      assert.equal(rec.content, '[REDACTED]');
      assert.equal(rec.extractedText, '[REDACTED]');
      assert.equal(rec.chunkText, '[REDACTED]');
      assert.equal(rec.query, '[REDACTED]');
      assert.equal(rec.retrievedText, '[REDACTED]');
      assert.equal(rec.embedding, '[REDACTED]');
    });

    test('preserves legitimate operational fields without false positives', () => {
      testLogger.info('rag.search.completed', {
        status: 200,
        statusClass: '2xx',
        durationMs: 42,
        operation: 'vector_search',
        model: 'gemini-embedding-2',
        chunkCount: 5,
        hasEvidence: true,
        cacheHit: false,
        fileType: 'pdf',
        sizeBucket: '1-5mb',
        errorCode: null,
      });

      const rec = capturedLogs[0].record;
      assert.equal(rec.status, 200);
      assert.equal(rec.statusClass, '2xx');
      assert.equal(rec.durationMs, 42);
      assert.equal(rec.operation, 'vector_search');
      assert.equal(rec.model, 'gemini-embedding-2');
      assert.equal(rec.chunkCount, 5);
      assert.equal(rec.hasEvidence, true);
      assert.equal(rec.cacheHit, false);
      assert.equal(rec.fileType, 'pdf');
      assert.equal(rec.sizeBucket, '1-5mb');
    });
  });

  // --------------------------------------------------------------------------
  // 5. String Credential Masking & Security Sanitization
  // --------------------------------------------------------------------------
  describe('5. String Credential Masking & Security Sanitization', () => {
    test('masks Gemini API keys inside arbitrary string messages', () => {
      const sanitized = sanitizeString('Request failed with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q in URL');
      assert.ok(!sanitized.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'));
      assert.ok(sanitized.includes('[API_KEY_REDACTED]'));
    });

    test('masks MongoDB connection credentials in URI strings', () => {
      const sanitized = sanitizeString('Connecting to mongodb+srv://dbUserAdmin:SuperSecretPassword123@cluster0.mongodb.net/nova_ai?retryWrites=true');
      assert.ok(!sanitized.includes('dbUserAdmin'));
      assert.ok(!sanitized.includes('SuperSecretPassword123'));
      assert.ok(sanitized.includes('mongodb+srv://[DATABASE_CREDENTIALS_REDACTED]@cluster0.mongodb.net/nova_ai?retryWrites=true'));
    });

    test('masks standalone JWTs and Bearer tokens inside string messages', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.abcdef1234567890';
      const sanitized = sanitizeString(`Failed token verification for Bearer ${token}`);
      assert.ok(!sanitized.includes(token));
      assert.ok(sanitized.includes('Bearer [JWT_REDACTED]'));
    });

    test('strips ANSI color and control codes from strings', () => {
      const ansiString = '\x1b[31mError:\x1b[0m \x1b[1mCritical failure\x1b[0m';
      const sanitized = sanitizeString(ansiString);
      assert.equal(sanitized, 'Error: Critical failure');
    });

    test('neutralizes CR/LF log splitting attempts in single-line logs', () => {
      const injected = 'Normal event\r\n{"timestamp":"2026-09-11","level":"ERROR","event":"forged.event"}';
      const sanitized = sanitizeString(injected);
      assert.ok(!sanitized.includes('\r'));
      assert.ok(!sanitized.includes('\n'));
    });

    test('bounds oversized string lengths with truncation notice', () => {
      const hugeString = 'X'.repeat(2500);
      const sanitized = sanitizeString(hugeString);
      assert.ok(sanitized.length <= 1020);
      assert.ok(sanitized.endsWith('...[TRUNCATED]'));
    });
  });

  // --------------------------------------------------------------------------
  // 6. Safe Object, Buffer, and Error Sanitization
  // --------------------------------------------------------------------------
  describe('6. Safe Object, Buffer, and Error Sanitization', () => {
    test('converts Buffers and TypedArrays to byte length summaries', () => {
      const buffer = Buffer.from('Binary confidential image data bytes here');
      const uint8 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      testLogger.info('media.processed', { rawPayload: buffer, sampleBytes: uint8, buffer: buffer });
      const rec = capturedLogs[0].record;

      assert.equal(rec.rawPayload, `[Buffer: ${buffer.length} bytes]`);
      assert.equal(rec.sampleBytes, `[TypedArray: 8 bytes]`);
      assert.equal(rec.buffer, '[REDACTED]', 'Field named "buffer" is in sensitive keys and must be redacted');
    });

    test('sanitizes Error objects and redacts credentials in error messages', () => {
      const secretError = new Error('Failed to connect: mongodb+srv://user:pass123@cluster.net/db key=secretKey');
      secretError.code = 'DB_CONN_ERR';
      secretError.statusCode = 500;

      testLogger.error('db.failure', secretError);
      const rec = capturedLogs[0].record;

      assert.equal(rec.error.name, 'Error');
      assert.ok(!rec.error.message.includes('pass123'));
      assert.ok(rec.error.message.includes('[DATABASE_CREDENTIALS_REDACTED]'));
      assert.equal(rec.error.code, 'DB_CONN_ERR');
      assert.equal(rec.error.statusCode, 500);
    });

    test('does not mutate original input objects passed to logger', () => {
      const original = {
        password: 'my-unhashed-password',
        user: { email: 'test@example.com' },
      };
      const copy = JSON.parse(JSON.stringify(original));

      testLogger.info('auth.attempt', original);

      assert.deepEqual(original, copy);
      assert.equal(original.password, 'my-unhashed-password');
    });
  });

  // --------------------------------------------------------------------------
  // 7. HTTP Pipeline Integration & Error Handler
  // --------------------------------------------------------------------------
  describe('7. HTTP Pipeline & Global Error Handler Integration', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
      app = express();
      app.use(express.json());
      app.use(requestIdMiddleware);

      // HTTP Request completion logger (same pattern as server.js)
      app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
          const durationMs = Date.now() - start;
          testLogger.info('http.request.completed', {
            method: req.method,
            route: req.path,
            status: res.statusCode,
            statusClass: `${Math.floor(res.statusCode / 100)}xx`,
            durationMs,
          });
        });
        next();
      });

      app.get('/api/test/hello', (req, res) => {
        res.status(200).json({ message: 'hello', reqId: getRequestId() });
      });

      app.get('/api/test/error-route', (req, res, next) => {
        next(new AppError('Operational route failure occurred', 400, 'ROUTE_ERROR'));
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

    test('emits http.request.completed log with correlation ID on successful request', async () => {
      const customId = 'client-http-req-test-12345';
      const res = await fetch(`${baseUrl}/api/test/hello`, {
        headers: { 'X-Request-Id': customId },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-request-id'), customId);

      // Wait a tick for res.on('finish')
      await new Promise((r) => setTimeout(r, 20));

      const log = capturedLogs.find((l) => l.record.event === 'http.request.completed');
      assert.ok(log, 'Must find http.request.completed log');
      assert.equal(log.record.requestId, customId);
      assert.equal(log.record.method, 'GET');
      assert.equal(log.record.route, '/api/test/hello');
      assert.equal(log.record.status, 200);
    });

    test('errorHandler emits http.request.error with request ID and sanitized code', async () => {
      const customId = 'client-error-req-trace-999';
      const res = await fetch(`${baseUrl}/api/test/error-route`, {
        headers: { 'X-Request-Id': customId },
      });

      assert.equal(res.status, 400);
      assert.equal(res.headers.get('x-request-id'), customId);

      await new Promise((r) => setTimeout(r, 20));

      const errorLog = capturedLogs.find((l) => l.record.event === 'http.request.error');
      assert.ok(errorLog, 'Must find http.request.error log');
      assert.equal(errorLog.record.requestId, customId);
      assert.equal(errorLog.record.status, 400);
      assert.equal(errorLog.record.errorCode, 'ROUTE_ERROR');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Configuration & Environment Validation
  // --------------------------------------------------------------------------
  describe('8. Configuration & Environment Validation', () => {
    test('VALID_LOG_LEVELS contains DEBUG, INFO, WARN, ERROR', () => {
      assert.deepEqual(VALID_LOG_LEVELS, ['DEBUG', 'INFO', 'WARN', 'ERROR']);
    });

    test('validateEnv accepts valid LOG_LEVEL values', () => {
      for (const level of ['DEBUG', 'INFO', 'WARN', 'ERROR', 'debug', 'info']) {
        assert.doesNotThrow(() => {
          validateEnv({
            ...ENV,
            LOG_LEVEL: level,
          });
        });
      }
    });

    test('validateEnv throws in production if LOG_LEVEL is invalid', () => {
      assert.throws(
        () => {
          validateEnv({
            ...ENV,
            NODE_ENV: 'production',
            LOG_LEVEL: 'INVALID_VERBOSE_LEVEL',
          });
        },
        /CRITICAL CONFIG ERROR: Invalid LOG_LEVEL "INVALID_VERBOSE_LEVEL"/
      );
    });
  });
});
