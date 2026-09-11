import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  UploadConcurrencyManager,
  createUploadConcurrencyGuard,
} from '../middleware/uploadConcurrencyLimiter.js';

describe('Phase 9.3-D: SEC-VULN-11 Global Upload / RAM Concurrency Protection Suite', () => {
  let limiter;

  beforeEach(() => {
    limiter = new UploadConcurrencyManager({
      maxGlobal: 3,
      maxPerUser: 2,
    });
  });

  // =========================================================================
  // 1. Global Concurrency Cap Tests
  // =========================================================================
  describe('1. Global Concurrency Cap', () => {
    test('1.1 Allows uploads up to maxGlobal and rejects additional with 429', () => {
      const acq1 = limiter.acquire('user-1');
      const acq2 = limiter.acquire('user-2');
      const acq3 = limiter.acquire('user-3');

      assert.strictEqual(acq1.success, true);
      assert.strictEqual(acq2.success, true);
      assert.strictEqual(acq3.success, true);
      assert.strictEqual(limiter.getActiveGlobal(), 3);

      // 4th request exceeds global limit of 3
      const acq4 = limiter.acquire('user-4');
      assert.strictEqual(acq4.success, false);
      assert.strictEqual(acq4.reason, 'GLOBAL_LIMIT_EXCEEDED');
      assert.strictEqual(limiter.getActiveGlobal(), 3);

      // Cleanup
      acq1.release();
      acq2.release();
      acq3.release();
      assert.strictEqual(limiter.getActiveGlobal(), 0);
    });

    test('1.2 Released global slot immediately allows subsequent upload to acquire', () => {
      const acq1 = limiter.acquire('user-1');
      const acq2 = limiter.acquire('user-2');
      const acq3 = limiter.acquire('user-3');

      // Reject while full
      assert.strictEqual(limiter.acquire('user-4').success, false);

      // Release one slot
      acq2.release();
      assert.strictEqual(limiter.getActiveGlobal(), 2);

      // User 4 can now acquire
      const acq4 = limiter.acquire('user-4');
      assert.strictEqual(acq4.success, true);
      assert.strictEqual(limiter.getActiveGlobal(), 3);

      // Cleanup
      acq1.release();
      acq3.release();
      acq4.release();
      assert.strictEqual(limiter.getActiveGlobal(), 0);
    });
  });

  // =========================================================================
  // 2. Per-User Concurrency Cap Tests
  // =========================================================================
  describe('2. Per-User Concurrency Cap', () => {
    test('2.1 Allows up to maxPerUser for a single user and isolates from other users', () => {
      const acqA1 = limiter.acquire('user-alice');
      const acqA2 = limiter.acquire('user-alice');

      assert.strictEqual(acqA1.success, true);
      assert.strictEqual(acqA2.success, true);
      assert.strictEqual(limiter.getActiveForUser('user-alice'), 2);

      // Alice's 3rd upload exceeds user limit of 2
      const acqA3 = limiter.acquire('user-alice');
      assert.strictEqual(acqA3.success, false);
      assert.strictEqual(acqA3.reason, 'USER_LIMIT_EXCEEDED');

      // User Bob is independent and can still acquire within global limit
      const acqB1 = limiter.acquire('user-bob');
      assert.strictEqual(acqB1.success, true);
      assert.strictEqual(limiter.getActiveForUser('user-bob'), 1);
      assert.strictEqual(limiter.getActiveGlobal(), 3);

      // Cleanup
      acqA1.release();
      acqA2.release();
      acqB1.release();
      assert.strictEqual(limiter.getActiveForUser('user-alice'), 0);
      assert.strictEqual(limiter.getActiveForUser('user-bob'), 0);
      assert.strictEqual(limiter.getActiveGlobal(), 0);
    });
  });

  // =========================================================================
  // 3. Idempotent Release & Counter Integrity
  // =========================================================================
  describe('3. Idempotent Release & Counter Integrity', () => {
    test('3.1 Multiple release calls are strictly idempotent and never produce negative counters', () => {
      const acq = limiter.acquire('user-test');
      assert.strictEqual(limiter.getActiveGlobal(), 1);
      assert.strictEqual(limiter.getActiveForUser('user-test'), 1);

      // First release
      acq.release();
      assert.strictEqual(limiter.getActiveGlobal(), 0);
      assert.strictEqual(limiter.getActiveForUser('user-test'), 0);

      // Duplicate releases
      acq.release();
      acq.release();
      acq.release();
      assert.strictEqual(limiter.getActiveGlobal(), 0, 'Global count must never become negative');
      assert.strictEqual(limiter.getActiveForUser('user-test'), 0, 'User count must never become negative');
    });

    test('3.2 Concurrent acquire and release cycles maintain accurate counts', async () => {
      const concurrentLimiter = new UploadConcurrencyManager({ maxGlobal: 5, maxPerUser: 5 });
      const operations = [];

      for (let i = 0; i < 20; i++) {
        operations.push(async () => {
          const res = concurrentLimiter.acquire(`user-${i % 3}`);
          if (res.success) {
            await new Promise((r) => setTimeout(r, 5));
            res.release();
          }
        });
      }

      await Promise.all(operations.map((fn) => fn()));
      assert.strictEqual(concurrentLimiter.getActiveGlobal(), 0, 'All slots must be completely released');
    });
  });

  // =========================================================================
  // 4. Middleware Integration & Pre-Multer RAM Protection
  // =========================================================================
  describe('4. Middleware Ordering & Pre-Multer RAM Protection', () => {
    test('4.1 Rejects at middleware level with 429 BEFORE Multer receives or allocates the upload buffer', async () => {
      const testLimiter = new UploadConcurrencyManager({ maxGlobal: 1, maxPerUser: 1 });
      const guard = createUploadConcurrencyGuard(testLimiter);

      let multerInvoked = false;
      const mockMulter = (req, res, next) => {
        multerInvoked = true;
        next();
      };

      const app = express();
      // Middleware chain: Guard runs BEFORE Multer
      app.post('/test-upload', guard, mockMulter, (req, res) => {
        res.json({ ok: true });
      });

      const server = app.listen(0);
      const port = server.address().port;

      try {
        // First request occupies the single global slot
        const acq1 = testLimiter.acquire('pre-occupy');
        assert.strictEqual(acq1.success, true);

        // Send HTTP request while slot is occupied
        const response = await fetch(`http://localhost:${port}/test-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'mock payload' }),
        });

        assert.strictEqual(response.status, 429, 'Must return 429 Too Many Requests');
        const body = await response.json();
        assert.strictEqual(body.success, false);
        assert.strictEqual(body.error.code, 'UPLOAD_CONCURRENCY_LIMIT');
        assert.ok(body.error.message.includes('temporarily busy'));

        // Crucial security assertion: Multer was NEVER called, preventing RAM allocation
        assert.strictEqual(multerInvoked, false, 'Multer middleware must NOT be invoked when concurrency limit is reached');

        acq1.release();
      } finally {
        server.close();
      }
    });

    test('4.2 Automatically releases slot when request finishes or errors', async () => {
      const testLimiter = new UploadConcurrencyManager({ maxGlobal: 2, maxPerUser: 2 });
      const guard = createUploadConcurrencyGuard(testLimiter);

      const app = express();
      app.post('/success-upload', (req, res, next) => {
        req.user = { id: 'alice' };
        next();
      }, guard, (req, res) => {
        assert.strictEqual(testLimiter.getActiveGlobal(), 1);
        assert.strictEqual(testLimiter.getActiveForUser('alice'), 1);
        res.json({ success: true });
      });

      app.post('/error-upload', (req, res, next) => {
        req.user = { id: 'alice' };
        next();
      }, guard, (req, res) => {
        res.status(500).json({ error: 'Processing failed' });
      });

      const server = app.listen(0);
      const port = server.address().port;

      try {
        // Successful request
        const res1 = await fetch(`http://localhost:${port}/success-upload`, { method: 'POST' });
        assert.strictEqual(res1.status, 200);
        assert.strictEqual(testLimiter.getActiveGlobal(), 0, 'Slot released after 200 finish');
        assert.strictEqual(testLimiter.getActiveForUser('alice'), 0);

        // Errored request
        const res2 = await fetch(`http://localhost:${port}/error-upload`, { method: 'POST' });
        assert.strictEqual(res2.status, 500);
        assert.strictEqual(testLimiter.getActiveGlobal(), 0, 'Slot released after error finish');
        assert.strictEqual(testLimiter.getActiveForUser('alice'), 0);
      } finally {
        server.close();
      }
    });
  });
});
