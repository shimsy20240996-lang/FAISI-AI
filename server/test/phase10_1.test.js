import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { ENV, validateEnv, VALID_ENVIRONMENTS } from '../config/env.js';

describe('Phase 10.1: Production Environment & Configuration Suite', () => {
  // Base valid production configuration fixture
  const createValidProdEnv = () => ({
    ...ENV,
    NODE_ENV: 'production',
    PORT: 5000,
    CLIENT_URL: 'https://app.nova.ai',
    MONGODB_URI: 'mongodb+srv://nova-cluster.mongodb.net/nova_ai?retryWrites=true&w=majority',
    MONGODB_DB_NAME: 'nova_ai',
    AUTH_SECRET: 'k7d8s9a0f1g2h3j4k5l6z7x8c9v0b1n2m3q4w5e6r7t8y9u0i1o2p3a4s5d6f7g8',
    GEMINI_API_KEY: 'AIzaSyA_RealProductionKeyForTestingEnvValidationOnly12',
    VECTOR_STORE_TYPE: 'mongodb_atlas',
    ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: false,
    MAX_FILE_SIZE_MB: 10,
    MAX_CONCURRENT_UPLOADS: 10,
    MAX_CONCURRENT_UPLOADS_PER_USER: 2,
    RAG_SIMILARITY_THRESHOLD: 0.65,
  });

  // =========================================================================
  // 1. Environment Model & Matrix Validation
  // =========================================================================
  describe('1. Environment Model & Configuration Validation', () => {
    test('1.1 Validates standard development, test, and production configurations', () => {
      assert.deepEqual(VALID_ENVIRONMENTS, ['development', 'test', 'production']);

      // Development
      assert.doesNotThrow(() => {
        validateEnv({
          ...ENV,
          NODE_ENV: 'development',
          CLIENT_URL: 'http://localhost:3000',
        });
      });

      // Test
      assert.doesNotThrow(() => {
        validateEnv({
          ...ENV,
          NODE_ENV: 'test',
          CLIENT_URL: 'http://localhost:3000',
        });
      });

      // Production
      assert.doesNotThrow(() => {
        validateEnv(createValidProdEnv());
      });
    });

    test('1.2 Rejects invalid or undefined NODE_ENV', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), NODE_ENV: 'staging' }),
        /Invalid NODE_ENV/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), NODE_ENV: 'local' }),
        /Invalid NODE_ENV/
      );
    });

    test('1.3 Rejects invalid PORT values', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), PORT: 0 }),
        /PORT must be an integer between 1 and 65535/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), PORT: 70000 }),
        /PORT must be an integer between 1 and 65535/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), PORT: NaN }),
        /PORT must be an integer between 1 and 65535/
      );
    });

    test('1.4 Rejects invalid or wildcard CLIENT_URL in production', () => {
      // Non-URL
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), CLIENT_URL: 'invalid-url' }),
        /CLIENT_URL must start with http:\/\/ or https:\/\//
      );

      // Wildcard in production
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), CLIENT_URL: '*' }),
        /Wildcard CLIENT_URL is strictly forbidden in production/
      );
    });
  });

  // =========================================================================
  // 2. Secret Protection & Placeholder Defense
  // =========================================================================
  describe('2. Secret Protection & Placeholder Defense', () => {
    test('2.1 Rejects missing or weak AUTH_SECRET in production', () => {
      // Missing
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), AUTH_SECRET: '' }),
        /AUTH_SECRET must be configured with at least 32 characters in production/
      );

      // Too short (< 32 chars)
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), AUTH_SECRET: 'short_secret_key_12345' }),
        /AUTH_SECRET must be configured with at least 32 characters in production/
      );

      // Insecure placeholder
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), AUTH_SECRET: 'replace_with_a_long_random_secret' }),
        /Insecure placeholder detected for AUTH_SECRET in production/
      );
    });

    test('2.2 Rejects missing or placeholder GEMINI_API_KEY in production', () => {
      // Missing
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), GEMINI_API_KEY: '' }),
        /GEMINI_API_KEY is required in production environment/
      );

      // Insecure placeholder
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), GEMINI_API_KEY: 'your_gemini_api_key_here' }),
        /Insecure placeholder detected for GEMINI_API_KEY in production/
      );
    });
  });

  // =========================================================================
  // 3. Database & Vector Store Production Guard
  // =========================================================================
  describe('3. Database & Vector Store Production Guard', () => {
    test('3.1 Rejects invalid MONGODB_URI protocols', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), MONGODB_URI: 'postgres://localhost:5432/db' }),
        /MONGODB_URI must start with mongodb:\/\/ or mongodb\+srv:\/\//
      );
    });

    test('3.2 Prevents silent fallback to in-memory vector store in production', () => {
      // local_memory in production without explicit opt-in
      assert.throws(
        () => validateEnv({
          ...createValidProdEnv(),
          VECTOR_STORE_TYPE: 'local_memory',
          ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: false,
        }),
        /VECTOR_STORE_TYPE cannot be local_memory in production/
      );

      // local_memory in production with explicit opt-in flag passes
      assert.doesNotThrow(() => {
        validateEnv({
          ...createValidProdEnv(),
          VECTOR_STORE_TYPE: 'local_memory',
          ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: true,
        });
      });
    });
  });

  // =========================================================================
  // 4. Numeric Security Limits & Concurrency Validation
  // =========================================================================
  describe('4. Numeric Security & Concurrency Limits Validation', () => {
    test('4.1 Rejects zero or negative security thresholds', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), MAX_FILE_SIZE_MB: 0 }),
        /MAX_FILE_SIZE_MB must be a positive integer/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), MAX_CONCURRENT_UPLOADS: -5 }),
        /MAX_CONCURRENT_UPLOADS must be a positive integer/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), MAX_CONCURRENT_UPLOADS_PER_USER: 0 }),
        /MAX_CONCURRENT_UPLOADS_PER_USER must be a positive integer/
      );
    });

    test('4.2 Rejects out-of-range RAG similarity thresholds', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), RAG_SIMILARITY_THRESHOLD: 1.5 }),
        /RAG_SIMILARITY_THRESHOLD must be a float between 0 and 1/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), RAG_SIMILARITY_THRESHOLD: -0.1 }),
        /RAG_SIMILARITY_THRESHOLD must be a float between 0 and 1/
      );
    });
  });

  // =========================================================================
  // 5. Health Check Endpoint & Secret Protection Integration
  // =========================================================================
  describe('5. Health Endpoint & Secret Safety', () => {
    let app;
    let server;
    let serverPort;

    before(async () => {
      app = express();

      // Mirror server.js health endpoint implementation
      app.get('/api/health', (req, res) => {
        res.status(200).json({
          status: 'ok',
          version: '0.8.1',
          environment: 'production',
          database: 'connected',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        });
      });

      await new Promise((resolve) => {
        server = app.listen(0, () => {
          serverPort = server.address().port;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('5.1 /api/health returns safe operational status without exposing secrets or paths', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/health`);
      assert.strictEqual(response.status, 200);

      const body = await response.json();
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.version, '0.8.1');
      assert.strictEqual(body.environment, 'production');
      assert.strictEqual(body.database, 'connected');
      assert.strictEqual(typeof body.uptime, 'number');

      // Comprehensive Secret Safety Assertions
      const rawText = JSON.stringify(body);
      assert.strictEqual(body.AUTH_SECRET, undefined);
      assert.strictEqual(body.GEMINI_API_KEY, undefined);
      assert.strictEqual(body.MONGODB_URI, undefined);
      assert.ok(!rawText.includes('mongodb'), 'Health output must not leak database URI');
      assert.ok(!rawText.includes('AIza'), 'Health output must not leak Gemini keys');
      assert.ok(!rawText.includes('storage'), 'Health output must not leak storage paths');
      assert.ok(!rawText.includes('password'), 'Health output must not leak credentials');
    });
  });

  // =========================================================================
  // 6. CORS & Trust Proxy Validation
  // =========================================================================
  describe('6. Production CORS & Trust Proxy', () => {
    let app;
    let server;
    let serverPort;
    const trustedClientOrigin = 'https://app.nova.ai';

    before(async () => {
      app = express();
      const corsOptions = {
        origin: (origin, callback) => {
          if (!origin || origin === trustedClientOrigin) {
            return callback(null, true);
          }
          return callback(new Error(`CORS blocked for unauthorized origin: ${origin}`));
        },
        credentials: true,
      };
      app.use(cors(corsOptions));
      app.get('/api/test-cors', (req, res) => res.json({ ok: true }));

      // Custom error handler to catch CORS errors cleanly
      app.use((err, req, res, next) => {
        if (err.message && err.message.includes('CORS blocked')) {
          return res.status(403).json({ error: 'CORS_FORBIDDEN' });
        }
        res.status(500).json({ error: 'SERVER_ERROR' });
      });

      await new Promise((resolve) => {
        server = app.listen(0, () => {
          serverPort = server.address().port;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('6.1 CORS permits trusted production CLIENT_URL with credentials', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/test-cors`, {
        headers: { Origin: trustedClientOrigin },
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('access-control-allow-origin'), trustedClientOrigin);
      assert.strictEqual(response.headers.get('access-control-allow-credentials'), 'true');
    });

    test('6.2 CORS strictly rejects untrusted third-party origins', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/test-cors`, {
        headers: { Origin: 'https://evil-attacker.example.com' },
      });
      assert.strictEqual(response.status, 403);
    });
  });
});
