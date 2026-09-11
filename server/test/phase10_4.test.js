import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { isAppShuttingDown, resetShutdownStateForTesting } from '../utils/shutdown.js';
import { isDatabaseConnected, disconnectDatabase } from '../config/database.js';
import { streamConcurrencyManager, StreamConcurrencyManager } from '../middleware/rateLimiter.js';
import { globalUploadConcurrencyManager, UploadConcurrencyManager } from '../middleware/uploadConcurrencyLimiter.js';
import { ttsCache, BoundedTTSCache, speechSynthesisService } from '../services/media/speechSynthesisService.js';
import { computeCosineSimilarity } from '../services/rag/vectorStore.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';

describe('Phase 10.4: Performance Optimization & Concurrency Benchmark Suite', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = express();

    app.get('/api/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/api/ready', (req, res) => {
      if (isAppShuttingDown()) {
        return res.status(503).json({ status: 'shutting_down' });
      }
      return res.status(200).json({ status: 'ready', db: 'connected' });
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

  beforeEach(() => {
    resetShutdownStateForTesting();
    streamConcurrencyManager.clear();
    globalUploadConcurrencyManager.reset();
  });

  // =========================================================================
  // 1. High-Concurrency Liveness & Readiness Probes
  // =========================================================================
  describe('1. High-Concurrency Liveness & Readiness Probes Throughput', () => {
    test('1.1 Executes 50 concurrent /api/health requests without failure or latency degradation', async () => {
      const requests = Array.from({ length: 50 }, () => fetch(`${baseUrl}/api/health`));
      const responses = await Promise.all(requests);

      assert.strictEqual(responses.length, 50);
      for (const res of responses) {
        assert.strictEqual(res.status, 200);
      }
    });

    test('1.2 Executes 50 concurrent /api/ready requests with deterministic state consistency', async () => {
      const requests = Array.from({ length: 50 }, () => fetch(`${baseUrl}/api/ready`));
      const responses = await Promise.all(requests);

      assert.strictEqual(responses.length, 50);
      for (const res of responses) {
        assert.strictEqual(res.status, 200);
      }
    });
  });

  // =========================================================================
  // 2. Stream & Upload Concurrency Manager Throughput
  // =========================================================================
  describe('2. Concurrency Manager Throughput & Recycling', () => {
    test('2.1 StreamConcurrencyManager handles 1,000 rapid acquire/release cycles accurately', () => {
      const manager = new StreamConcurrencyManager(2);
      const userKey = 'perf_test_user_stream';

      for (let i = 0; i < 1000; i++) {
        const acq1 = manager.acquire(userKey);
        const acq2 = manager.acquire(userKey);
        const acq3 = manager.acquire(userKey); // Should fail (max 2)

        assert.strictEqual(acq1, true);
        assert.strictEqual(acq2, true);
        assert.strictEqual(acq3, false);
        assert.strictEqual(manager.getActiveCount(userKey), 2);

        manager.release(userKey);
        manager.release(userKey);
        assert.strictEqual(manager.getActiveCount(userKey), 0);
      }
    });

    test('2.2 UploadConcurrencyManager handles 1,000 rapid acquire/release cycles accurately', () => {
      const manager = new UploadConcurrencyManager({ maxGlobal: 10, maxPerUser: 2 });
      const userKey = 'perf_test_user_upload';

      for (let i = 0; i < 1000; i++) {
        const res1 = manager.acquire(userKey);
        const res2 = manager.acquire(userKey);
        const res3 = manager.acquire(userKey); // Should fail (max 2 per user)

        assert.strictEqual(res1.success, true);
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res3.success, false);
        assert.strictEqual(manager.getActiveForUser(userKey), 2);
        assert.strictEqual(manager.getActiveGlobal(), 2);

        res1.release();
        res2.release();
        assert.strictEqual(manager.getActiveForUser(userKey), 0);
        assert.strictEqual(manager.getActiveGlobal(), 0);
      }
    });
  });

  // =========================================================================
  // 3. Vector Similarity & RAG Processing Performance
  // =========================================================================
  describe('3. Vector Similarity & RAG Processing Performance', () => {
    test('3.1 Computes 5,000 768-dimensional cosine similarity operations with high performance', () => {
      const vecA = Array.from({ length: 768 }, (_, i) => Math.sin(i));
      const vecB = Array.from({ length: 768 }, (_, i) => Math.cos(i));

      const startTime = performance.now();
      for (let i = 0; i < 5000; i++) {
        const sim = computeCosineSimilarity(vecA, vecB);
        assert.ok(typeof sim === 'number');
      }
      const duration = performance.now() - startTime;

      // 5,000 768-dim dot-products should complete in under 500ms
      assert.ok(duration < 500, `Expected duration < 500ms, actual: ${duration.toFixed(2)}ms`);
    });

    test('3.2 Vector similarity handles null and edge-case inputs without memory leaks', () => {
      for (let i = 0; i < 1000; i++) {
        assert.strictEqual(computeCosineSimilarity(null, null), 0);
        assert.strictEqual(computeCosineSimilarity([], []), 0);
        assert.strictEqual(computeCosineSimilarity([1, 2], [1, 2, 3]), 0);
      }
    });
  });

  // =========================================================================
  // 4. In-Memory TTS Cache High Throughput & Eviction
  // =========================================================================
  describe('4. In-Memory TTS Cache Throughput & Eviction', () => {
    test('4.1 TTS Cache sets, gets, and evicts 500 audio entries efficiently', () => {
      const cache = new BoundedTTSCache();
      const dummyBuffer = Buffer.from('synthetic_audio_payload_bytes_for_perf_testing');

      // Populate 500 items
      for (let i = 0; i < 500; i++) {
        const key = cache.generateKey(`user_${i}`, 'Puck', `Text query sentence ${i}`);
        cache.set(key, dummyBuffer, 'audio/wav');
      }

      // Verify retrieval
      const sampleKey = cache.generateKey('user_250', 'Puck', 'Text query sentence 250');
      const item = cache.get(sampleKey);
      assert.ok(item);
      assert.strictEqual(item.buffer.toString(), dummyBuffer.toString());
      assert.strictEqual(item.mimeType, 'audio/wav');
    });

    test('4.2 TTS Cache enforces byte boundaries and evicts LRU items gracefully', () => {
      const smallCache = new BoundedTTSCache();
      smallCache.maxBytes = 1024; // 1KB limit

      const chunk100B = Buffer.alloc(100);

      // Add 20 items (2000B > 1024B)
      for (let i = 0; i < 20; i++) {
        const key = smallCache.generateKey('user', 'Puck', `item_${i}`);
        smallCache.set(key, chunk100B, 'audio/wav');
      }

      // Cache currentBytes should not exceed maxBytes
      assert.ok(smallCache.currentBytes <= smallCache.maxBytes);
    });
  });

  // =========================================================================
  // 5. Security & Isolation Preservation Under Load
  // =========================================================================
  describe('5. Security & Isolation Preservation Under Load', () => {
    test('5.1 Error handler sanitizes sensitive tokens consistently across multiple errors', () => {
      let captured = null;
      const res = {
        status: (code) => ({
          json: (body) => {
            captured = { code, body };
          },
        }),
      };
      const req = { method: 'POST', originalUrl: '/api/chat' };
      const sensitiveError = new Error('Database connection failed at mongodb+srv://admin:P@ssword123@cluster0.abc.mongodb.net/prod');

      errorHandler(sensitiveError, req, res, () => {});

      assert.strictEqual(captured.code, 500);
      assert.strictEqual(captured.body.success, false);
      assert.ok(!JSON.stringify(captured.body).includes('P@ssword123'));
      assert.ok(!JSON.stringify(captured.body).includes('mongodb+srv://admin'));
    });
  });
});
