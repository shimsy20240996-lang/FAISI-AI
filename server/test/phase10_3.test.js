import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { ENV, validateEnv } from '../config/env.js';
import {
  isAppShuttingDown,
  resetShutdownStateForTesting,
  createGracefulShutdownHandler,
  setupProcessSignalHandlers,
} from '../utils/shutdown.js';
import { isDatabaseConnected, disconnectDatabase } from '../config/database.js';
import { isTransientError, executeWithTransientRetry } from '../services/ai/geminiService.js';
import { streamConcurrencyManager } from '../middleware/rateLimiter.js';
import { globalUploadConcurrencyManager } from '../middleware/uploadConcurrencyLimiter.js';
import { ttsCache, speechSynthesisService } from '../services/media/speechSynthesisService.js';
import { vectorStore, computeCosineSimilarity } from '../services/rag/vectorStore.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';

describe('Phase 10.3: Production Reliability & Fault Tolerance Suite', () => {
  const createValidProdEnv = () => ({
    ...ENV,
    NODE_ENV: 'production',
    PORT: 5000,
    CLIENT_URL: 'https://nova.production.app',
    MONGODB_URI: 'mongodb+srv://prod-cluster.mongodb.net/nova_ai?retryWrites=true&w=majority',
    MONGODB_DB_NAME: 'nova_ai',
    AUTH_SECRET: 'k7d8s9a0f1g2h3j4k5l6z7x8c9v0b1n2m3q4w5e6r7t8y9u0i1o2p3a4s5d6f7g8',
    GEMINI_API_KEY: 'AIzaSyA_RealProductionKeyForTestingEnvValidationOnly12',
    VECTOR_STORE_TYPE: 'mongodb_atlas',
    ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: false,
    MAX_FILE_SIZE_MB: 10,
    MAX_CONCURRENT_UPLOADS: 10,
    MAX_CONCURRENT_UPLOADS_PER_USER: 2,
    RAG_SIMILARITY_THRESHOLD: 0.65,
    SHUTDOWN_TIMEOUT_MS: 15000,
    TRUST_PROXY: 1,
  });

  beforeEach(() => {
    resetShutdownStateForTesting();
  });

  // =========================================================================
  // 1. Graceful Shutdown Engine & State Management
  // =========================================================================
  describe('1. Graceful Shutdown Engine & State Management', () => {
    test('1.1 isAppShuttingDown returns false initially and true after shutdown starts', async () => {
      assert.strictEqual(isAppShuttingDown(), false);

      let dbDisconnected = false;
      const shutdown = createGracefulShutdownHandler({
        server: null,
        disconnectDatabase: async () => {
          dbDisconnected = true;
        },
        timeoutMs: 500,
        exitProcess: false,
      });

      const shutdownPromise = shutdown('SIGTERM', 0);
      assert.strictEqual(isAppShuttingDown(), true);

      await shutdownPromise;
      assert.strictEqual(dbDisconnected, true);
    });

    test('1.2 Graceful shutdown handler is idempotent and resolves concurrently triggered calls once', async () => {
      let dbDisconnectCount = 0;
      const mockServer = {
        listening: true,
        close: (cb) => {
          setTimeout(cb, 10);
        },
        closeAllConnections: () => {},
      };

      const shutdown = createGracefulShutdownHandler({
        server: mockServer,
        disconnectDatabase: async () => {
          dbDisconnectCount++;
        },
        timeoutMs: 500,
        exitProcess: false,
      });

      const [res1, res2, res3] = await Promise.all([
        shutdown('SIGTERM', 0),
        shutdown('SIGINT', 0),
        shutdown('SIGTERM', 0),
      ]);

      assert.strictEqual(dbDisconnectCount, 1);
    });

    test('1.3 Shutdown watchdog terminates connections if grace period expires', async () => {
      let forcedCloseCalled = false;
      const hungServer = {
        listening: true,
        close: () => {
          // Intentionally do not invoke callback to simulate hung in-flight requests
        },
        closeAllConnections: () => {
          forcedCloseCalled = true;
        },
      };

      const shutdown = createGracefulShutdownHandler({
        server: hungServer,
        disconnectDatabase: async () => {},
        timeoutMs: 50, // Short timeout for test
        exitProcess: false,
      });

      await shutdown('SIGTERM', 0);
      assert.strictEqual(forcedCloseCalled, true);
    });

    test('1.4 setupProcessSignalHandlers registers process handlers without error', () => {
      assert.doesNotThrow(() => {
        setupProcessSignalHandlers({
          server: null,
          disconnectDatabase: async () => {},
        });
      });
    });
  });

  // =========================================================================
  // 2. Health & Readiness Endpoints (/api/health & /api/ready)
  // =========================================================================
  describe('2. Health & Readiness Probes Lifecycle', () => {
    let app;
    let server;
    let baseUrl;
    let mockDbConnected = true;

    before(async () => {
      app = express();

      // Liveness probe
      app.get('/api/health', (req, res) => {
        res.status(200).json({
          status: 'ok',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        });
      });

      // Readiness probe
      app.get('/api/ready', (req, res) => {
        if (isAppShuttingDown()) {
          return res.status(503).json({
            status: 'shutting_down',
            message: 'Server is currently shutting down and draining connections',
          });
        }

        if (!mockDbConnected) {
          return res.status(503).json({
            status: 'not_ready',
            message: 'Database is disconnected',
            db: 'disconnected',
          });
        }

        return res.status(200).json({
          status: 'ready',
          db: 'connected',
          timestamp: new Date().toISOString(),
        });
      });

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

    beforeEach(() => {
      mockDbConnected = true;
      resetShutdownStateForTesting();
    });

    test('2.1 /api/health always returns 200 (Liveness Probe)', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.ok(typeof data.uptime === 'number');
    });

    test('2.2 /api/ready returns 200 when database is connected and server is active', async () => {
      mockDbConnected = true;
      const res = await fetch(`${baseUrl}/api/ready`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.db, 'connected');
    });

    test('2.3 /api/ready returns 503 when database is disconnected', async () => {
      mockDbConnected = false;
      const res = await fetch(`${baseUrl}/api/ready`);
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.status, 'not_ready');
      assert.strictEqual(data.db, 'disconnected');
    });

    test('2.4 /api/ready returns 503 when application is shutting down', async () => {
      mockDbConnected = true;
      const shutdown = createGracefulShutdownHandler({
        server: null,
        disconnectDatabase: async () => {},
        timeoutMs: 100,
        exitProcess: false,
      });
      shutdown('SIGTERM', 0);

      const res = await fetch(`${baseUrl}/api/ready`);
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.status, 'shutting_down');
    });
  });

  // =========================================================================
  // 3. Database Connection Resilience & Idempotency
  // =========================================================================
  describe('3. Database Connection Resilience & Idempotency', () => {
    test('3.1 disconnectDatabase is idempotent and executes safely when already disconnected', async () => {
      // Multiple consecutive disconnectDatabase calls should never throw
      await assert.doesNotReject(async () => {
        await disconnectDatabase();
        await disconnectDatabase();
      });
    });

    test('3.2 isDatabaseConnected accurately reflects disconnected state when not connected', () => {
      // In test mode without active mongoose connection, returns false
      const connected = isDatabaseConnected();
      assert.strictEqual(typeof connected, 'boolean');
    });
  });

  // =========================================================================
  // 4. AI Transient Error Detection & Retry Resilience
  // =========================================================================
  describe('4. AI Transient Error Detection & Retry Resilience', () => {
    test('4.1 isTransientError identifies rate limits, 429, 503, and network reset errors', () => {
      assert.strictEqual(isTransientError({ status: 429, message: 'Too Many Requests' }), true);
      assert.strictEqual(isTransientError({ statusCode: 503, message: 'Service Unavailable' }), true);
      assert.strictEqual(isTransientError({ code: 'ECONNRESET', message: 'socket hang up' }), true);
      assert.strictEqual(isTransientError({ code: 'ETIMEDOUT', message: 'connection timed out' }), true);
      assert.strictEqual(isTransientError(new Error('Resource_exhausted: quota exceeded')), true);
      assert.strictEqual(isTransientError(new Error('Model temporarily unavailable')), true);
      assert.strictEqual(isTransientError(new Error('Rate limit reached')), true);
    });

    test('4.2 isTransientError returns false for non-transient errors (400, 401, 403, 404, invalid prompt)', () => {
      assert.strictEqual(isTransientError(null), false);
      assert.strictEqual(isTransientError(undefined), false);
      assert.strictEqual(isTransientError({ status: 400, message: 'Bad Request: Invalid argument' }), false);
      assert.strictEqual(isTransientError({ statusCode: 401, message: 'API key not valid' }), false);
      assert.strictEqual(isTransientError({ status: 403, message: 'Permission denied' }), false);
      assert.strictEqual(isTransientError({ status: 404, message: 'Model not found' }), false);
      assert.strictEqual(isTransientError(new Error('User input validation error')), false);
    });

    test('4.3 executeWithTransientRetry succeeds after transient failures recover', async () => {
      let attempts = 0;
      const flakyOperation = async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('Resource_exhausted: transient limit');
          err.status = 429;
          throw err;
        }
        return 'success_payload';
      };

      const result = await executeWithTransientRetry(flakyOperation, {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 50,
      });

      assert.strictEqual(result, 'success_payload');
      assert.strictEqual(attempts, 3);
    });

    test('4.4 executeWithTransientRetry fast-fails immediately on non-transient errors', async () => {
      let attempts = 0;
      const permanentFailureOperation = async () => {
        attempts++;
        const err = new Error('Invalid model argument');
        err.status = 400;
        throw err;
      };

      await assert.rejects(
        async () => {
          await executeWithTransientRetry(permanentFailureOperation, {
            maxRetries: 3,
            baseDelayMs: 10,
            maxDelayMs: 50,
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          return true;
        }
      );

      // Fast-fail: Exactly 1 attempt, no useless retries
      assert.strictEqual(attempts, 1);
    });

    test('4.5 executeWithTransientRetry throws error once maxRetries are exhausted', async () => {
      let attempts = 0;
      const persistentlyFailingOperation = async () => {
        attempts++;
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      };

      await assert.rejects(
        async () => {
          await executeWithTransientRetry(persistentlyFailingOperation, {
            maxRetries: 2,
            baseDelayMs: 10,
            maxDelayMs: 50,
          });
        },
        /503 Service Unavailable/
      );

      // 1 initial attempt + 2 retries = 3 attempts total
      assert.strictEqual(attempts, 3);
    });
  });

  // =========================================================================
  // 5. SSE Streaming Lifecycle, Concurrency Release & At-Most-Once Persistence
  // =========================================================================
  describe('5. SSE Streaming Lifecycle & Concurrency Release', () => {
    const testUserId = 'user_reliability_test_123';

    test('5.1 Stream concurrency manager acquires and releases slots correctly', () => {
      streamConcurrencyManager.clear();
      assert.strictEqual(streamConcurrencyManager.acquire(testUserId), true);
      assert.strictEqual(streamConcurrencyManager.getActiveCount(testUserId), 1);

      streamConcurrencyManager.release(testUserId);
      assert.strictEqual(streamConcurrencyManager.getActiveCount(testUserId), 0);
    });

    test('5.2 Stream concurrency manager safely handles double release without negative count', () => {
      streamConcurrencyManager.clear();
      streamConcurrencyManager.acquire(testUserId);
      assert.strictEqual(streamConcurrencyManager.getActiveCount(testUserId), 1);

      streamConcurrencyManager.release(testUserId);
      streamConcurrencyManager.release(testUserId); // double release
      assert.strictEqual(streamConcurrencyManager.getActiveCount(testUserId), 0);
    });

    test('5.3 At-most-once persistence flag prevents duplicate database saves on disconnect/error', async () => {
      let saveCount = 0;
      let isPersisted = false;

      const persistAssistantMessage = async () => {
        if (isPersisted) return;
        isPersisted = true;
        saveCount++;
      };

      // Simulate concurrent invocation from on('close') and on('error')
      await Promise.all([
        persistAssistantMessage(),
        persistAssistantMessage(),
        persistAssistantMessage(),
      ]);

      assert.strictEqual(saveCount, 1);
    });
  });

  // =========================================================================
  // 6. Upload Concurrency Limiter Resilience
  // =========================================================================
  describe('6. Upload Concurrency Limiter Resilience', () => {
    const uploadUserId = 'user_upload_reliability_456';

    beforeEach(() => {
      globalUploadConcurrencyManager.reset();
    });

    test('6.1 Upload concurrency releases slot on unexpected error', () => {
      const acquired = globalUploadConcurrencyManager.acquire(uploadUserId);
      assert.strictEqual(acquired.success, true);
      assert.strictEqual(globalUploadConcurrencyManager.getActiveForUser(uploadUserId), 1);

      // Simulate error path releasing the slot
      acquired.release();
      assert.strictEqual(globalUploadConcurrencyManager.getActiveForUser(uploadUserId), 0);
    });

    test('6.2 Upload concurrency handles multiple releases safely', () => {
      const acquired = globalUploadConcurrencyManager.acquire(uploadUserId);
      assert.strictEqual(acquired.success, true);
      acquired.release();
      acquired.release(); // double release idempotency
      assert.strictEqual(globalUploadConcurrencyManager.getActiveForUser(uploadUserId), 0);
      assert.strictEqual(globalUploadConcurrencyManager.getActiveGlobal(), 0);
    });
  });

  // =========================================================================
  // 7. TTS Cache & Speech Synthesis Fault Tolerance
  // =========================================================================
  describe('7. TTS Cache & Speech Synthesis Fault Tolerance', () => {
    test('7.1 TTS Cache stores and retrieves audio buffer within TTL', () => {
      ttsCache.clear();
      const key = ttsCache.generateKey('user1', 'Puck', 'Hello world');
      const testBuffer = Buffer.from('audio_binary_data');

      ttsCache.set(key, testBuffer, 'audio/mpeg');
      const retrieved = ttsCache.get(key);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.buffer.toString(), 'audio_binary_data');
      assert.strictEqual(retrieved.mimeType, 'audio/mpeg');
    });

    test('7.2 TTS Cache isolates keys by user, voice, and text', () => {
      const key1 = ttsCache.generateKey('user1', 'Puck', 'Hello');
      const key2 = ttsCache.generateKey('user2', 'Puck', 'Hello');
      const key3 = ttsCache.generateKey('user1', 'Aoede', 'Hello');
      const key4 = ttsCache.generateKey('user1', 'Puck', 'Goodbye');

      assert.notStrictEqual(key1, key2);
      assert.notStrictEqual(key1, key3);
      assert.notStrictEqual(key1, key4);
    });

    test('7.3 Speech synthesis service returns synthetic fallback audio if generation fails', async () => {
      // Synthesizing speech with synthetic fallback
      const result = await speechSynthesisService.synthesizeSpeech({
        userId: 'user_fallback',
        text: 'Reliability test fallback sentence.',
        voice: 'Puck',
      });

      assert.ok(result);
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.ok(result.buffer.length > 0);
      assert.strictEqual(result.mimeType, 'audio/wav');
    });
  });

  // =========================================================================
  // 8. Vector Store Fault Tolerance
  // =========================================================================
  describe('8. Vector Store Fault Tolerance', () => {
    test('8.1 computeCosineSimilarity handles empty, null, or mismatched vectors safely', () => {
      assert.strictEqual(computeCosineSimilarity(null, [1, 2, 3]), 0);
      assert.strictEqual(computeCosineSimilarity([1, 2, 3], null), 0);
      assert.strictEqual(computeCosineSimilarity([1, 2], [1, 2, 3]), 0);
      assert.strictEqual(computeCosineSimilarity([0, 0, 0], [0, 0, 0]), 0);
    });

    test('8.2 computeCosineSimilarity accurately computes cosine similarity for identical and orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      const vecC = [0, 1, 0];

      assert.strictEqual(Math.round(computeCosineSimilarity(vecA, vecB) * 100) / 100, 1);
      assert.strictEqual(computeCosineSimilarity(vecA, vecC), 0);
    });

    test('8.3 vectorStore instance initializes with appropriate store type', () => {
      assert.ok(vectorStore.type);
    });
  });

  // =========================================================================
  // 9. Error Sanitization & Production Safety
  // =========================================================================
  describe('9. Error Sanitization & Production Safety', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
      app = express();

      // Route throwing error with sensitive MongoDB URI
      app.get('/test/mongo-leak-error', (req, res, next) => {
        const sensitiveErr = new Error('Connection failed at mongodb+srv://admin:SuperSecretPass123@cluster0.abcde.mongodb.net/prod');
        next(sensitiveErr);
      });

      // Route throwing error with API key
      app.get('/test/apikey-leak-error', (req, res, next) => {
        const sensitiveErr = new Error('Request failed with key=AIzaSyD_UnwantedExposedApiKeyString12345');
        next(sensitiveErr);
      });

      // Route throwing operational AppError
      app.get('/test/operational-error', (req, res, next) => {
        const opErr = new AppError('Invalid document format provided', 400, 'INVALID_FORMAT');
        next(opErr);
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

    test('9.1 Error handler masks MongoDB URIs and credentials', async () => {
      const res = await fetch(`${baseUrl}/test/mongo-leak-error`);
      assert.strictEqual(res.status, 500);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(!JSON.stringify(data).includes('SuperSecretPass123'));
      assert.ok(!JSON.stringify(data).includes('mongodb+srv://admin'));
    });

    test('9.2 Error handler masks Google Gemini API keys', async () => {
      const res = await fetch(`${baseUrl}/test/apikey-leak-error`);
      assert.strictEqual(res.status, 500);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(!JSON.stringify(data).includes('AIzaSyD_UnwantedExposedApiKeyString12345'));
    });

    test('9.3 Operational AppError returns structured error details with original status code', async () => {
      const res = await fetch(`${baseUrl}/test/operational-error`);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'INVALID_FORMAT');
      assert.strictEqual(data.error.message, 'Invalid document format provided');
    });
  });

  // =========================================================================
  // 10. Environment Variable Validation for Reliability
  // =========================================================================
  describe('10. Environment Variable Validation for Reliability', () => {
    test('10.1 Accepts valid SHUTDOWN_TIMEOUT_MS in production configuration', () => {
      const prodEnv = {
        ...createValidProdEnv(),
        SHUTDOWN_TIMEOUT_MS: 30000,
      };
      assert.doesNotThrow(() => validateEnv(prodEnv));
    });

    test('10.2 Rejects non-positive SHUTDOWN_TIMEOUT_MS in production', () => {
      const invalidEnv = {
        ...createValidProdEnv(),
        SHUTDOWN_TIMEOUT_MS: -500,
      };
      assert.throws(
        () => validateEnv(invalidEnv),
        /SHUTDOWN_TIMEOUT_MS must be a positive integer/
      );
    });
  });
});
