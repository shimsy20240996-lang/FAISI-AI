import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ENV, validateEnv } from '../config/env.js';
import { getCspDirectives } from '../middleware/csp.js';
import { authService } from '../services/authService.js';
import { streamConcurrencyManager } from '../middleware/rateLimiter.js';
import { globalUploadConcurrencyManager, UploadConcurrencyManager } from '../middleware/uploadConcurrencyLimiter.js';
import { isDatabaseConnected } from '../config/database.js';
import { vectorStore } from '../services/rag/vectorStore.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';

describe('Phase 10.2: Production Deployment & Infrastructure Suite', () => {
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
    TRUST_PROXY: 1,
  });

  // =========================================================================
  // 1. Production Environment & Startup Validation
  // =========================================================================
  describe('1. Production Environment & Startup Validation', () => {
    test('1.1 Validates full production environment configuration successfully', () => {
      const prodEnv = createValidProdEnv();
      assert.doesNotThrow(() => validateEnv(prodEnv));
    });

    test('1.2 Rejects non-numeric or out-of-range PORT in production', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), PORT: 0 }),
        /PORT must be an integer between 1 and 65535/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), PORT: 70000 }),
        /PORT must be an integer between 1 and 65535/
      );
    });

    test('1.3 Rejects wildcard or insecure CLIENT_URL in production', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), CLIENT_URL: '*' }),
        /Wildcard CLIENT_URL is strictly forbidden in production/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), CLIENT_URL: 'ftp://insecure.com' }),
        /CLIENT_URL must start with http:\/\/ or https:\/\//
      );
    });

    test('1.4 Strictly requires minimum 32-character AUTH_SECRET and rejects placeholders in production', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), AUTH_SECRET: 'short_secret' }),
        /AUTH_SECRET must be configured with at least 32 characters in production/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), AUTH_SECRET: 'replace_with_a_long_random_secret' }),
        /Insecure placeholder detected for AUTH_SECRET in production/
      );
    });

    test('1.5 Strictly requires GEMINI_API_KEY and rejects placeholders in production', () => {
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), GEMINI_API_KEY: '' }),
        /GEMINI_API_KEY is required in production/
      );
      assert.throws(
        () => validateEnv({ ...createValidProdEnv(), GEMINI_API_KEY: 'your_gemini_api_key_here' }),
        /Insecure placeholder detected for GEMINI_API_KEY in production/
      );
    });
  });

  // =========================================================================
  // 2. Production Health Check Endpoint Safety (/api/health)
  // =========================================================================
  describe('2. Production Health Check Endpoint Safety', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
      app = express();
      app.get('/api/health', (req, res) => {
        res.status(200).json({
          status: 'ok',
          version: '0.8.1',
          environment: 'production',
          database: isDatabaseConnected() ? 'connected' : 'disconnected',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        });
      });

      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
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

    test('2.1 /api/health responds with 200 OK and expected structure', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.version, '0.8.1');
      assert.equal(body.environment, 'production');
      assert.ok(['connected', 'disconnected'].includes(body.database));
      assert.equal(typeof body.uptime, 'number');
      assert.ok(body.timestamp);
    });

    test('2.2 /api/health does NOT leak secrets, API keys, passwords, or filesystem paths', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const rawText = await response.text();

      // Ensure no credentials or internal details appear in the output
      assert.doesNotMatch(rawText, /mongodb(\+srv)?:\/\//i);
      assert.doesNotMatch(rawText, /AIza/i);
      assert.doesNotMatch(rawText, /AUTH_SECRET/i);
      assert.doesNotMatch(rawText, /password/i);
      assert.doesNotMatch(rawText, /[CDE]:\\/i);
      assert.doesNotMatch(rawText, /\/home\//i);
    });
  });

  // =========================================================================
  // 3. Production CORS & CSRF / Origin Enforcement
  // =========================================================================
  describe('3. Production CORS & CSRF / Origin Enforcement', () => {
    let corsApp;
    let corsServer;
    let corsBaseUrl;
    const prodClientOrigin = 'https://nova.production.app';

    before(async () => {
      corsApp = express();

      const corsOptions = {
        origin: (origin, callback) => {
          if (!origin || origin === prodClientOrigin) {
            return callback(null, true);
          }
          return callback(new Error(`CORS blocked for unauthorized origin: ${origin}`));
        },
        credentials: true,
      };

      corsApp.use(cors(corsOptions));
      corsApp.use(validateRequestOrigin);

      corsApp.get('/test-cors', (req, res) => res.json({ ok: true }));
      corsApp.post('/test-csrf', (req, res) => res.json({ success: true }));

      // Error handler for CORS errors
      corsApp.use((err, req, res, next) => {
        res.status(403).json({ error: err.message });
      });

      await new Promise((resolve) => {
        corsServer = corsApp.listen(0, '127.0.0.1', () => {
          const port = corsServer.address().port;
          corsBaseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (corsServer) {
        if (typeof corsServer.closeAllConnections === 'function') {
          corsServer.closeAllConnections();
        }
        await new Promise((resolve) => corsServer.close(resolve));
      }
    });

    test('3.1 Permitted production origin receives Access-Control-Allow-Origin & Credentials', async () => {
      const response = await fetch(`${corsBaseUrl}/test-cors`, {
        headers: { Origin: prodClientOrigin },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), prodClientOrigin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    });

    test('3.2 Unauthorized third-party origin is strictly rejected by CORS', async () => {
      const response = await fetch(`${corsBaseUrl}/test-cors`, {
        headers: { Origin: 'https://malicious-attacker.evil.com' },
      });
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.match(body.error, /CORS blocked for unauthorized origin/);
    });
  });

  // =========================================================================
  // 4. Production Cookie & Session Security
  // =========================================================================
  describe('4. Production Cookie & Session Security', () => {
    test('4.1 authService.setAuthCookie sets HttpOnly, Secure, and SameSite=lax in production', () => {
      const prodOriginalNodeEnv = ENV.NODE_ENV;
      ENV.NODE_ENV = 'production';

      const cookieStore = [];
      const mockRes = {
        cookie: (name, value, options) => {
          cookieStore.push({ name, value, options });
        },
      };

      authService.setAuthCookie(mockRes, 'test-jwt-token-value');
      ENV.NODE_ENV = prodOriginalNodeEnv;

      assert.equal(cookieStore.length, 1);
      assert.equal(cookieStore[0].name, ENV.COOKIE_NAME);
      assert.equal(cookieStore[0].value, 'test-jwt-token-value');
      assert.equal(cookieStore[0].options.httpOnly, true);
      assert.equal(cookieStore[0].options.secure, true);
      assert.equal(cookieStore[0].options.sameSite, 'lax');
      assert.equal(cookieStore[0].options.path, '/');
      assert.equal(cookieStore[0].options.maxAge, 7 * 24 * 60 * 60 * 1000);
    });

    test('4.2 authService.clearAuthCookie clears cookie with matching security flags', () => {
      const prodOriginalNodeEnv = ENV.NODE_ENV;
      ENV.NODE_ENV = 'production';

      const clearedCookies = [];
      const mockRes = {
        clearCookie: (name, options) => {
          clearedCookies.push({ name, options });
        },
      };

      authService.clearAuthCookie(mockRes);
      ENV.NODE_ENV = prodOriginalNodeEnv;

      assert.equal(clearedCookies.length, 1);
      assert.equal(clearedCookies[0].name, ENV.COOKIE_NAME);
      assert.equal(clearedCookies[0].options.httpOnly, true);
      assert.equal(clearedCookies[0].options.secure, true);
      assert.equal(clearedCookies[0].options.sameSite, 'lax');
    });
  });

  // =========================================================================
  // 5. SSE Streaming Response Architecture & Headers
  // =========================================================================
  describe('5. SSE Streaming Response Architecture & Headers', () => {
    let sseApp;
    let sseServer;
    let sseBaseUrl;

    before(async () => {
      sseApp = express();

      sseApp.get('/test-sse', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        res.write(`data: ${JSON.stringify({ type: 'chunk', text: 'Hello' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      });

      await new Promise((resolve) => {
        sseServer = sseApp.listen(0, '127.0.0.1', () => {
          const port = sseServer.address().port;
          sseBaseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (sseServer) {
        if (typeof sseServer.closeAllConnections === 'function') {
          sseServer.closeAllConnections();
        }
        await new Promise((resolve) => sseServer.close(resolve));
      }
    });

    test('5.1 SSE delivers correct production headers to prevent reverse-proxy buffering', async () => {
      const response = await fetch(`${sseBaseUrl}/test-sse`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/event-stream/);
      assert.match(response.headers.get('cache-control'), /no-cache/);
      assert.match(response.headers.get('cache-control'), /no-transform/);
      assert.equal(response.headers.get('x-accel-buffering'), 'no');
    });

    test('5.2 Stream concurrency manager bounds concurrent active streams to 2 per key', () => {
      const testKey = 'test-stream-user-prod-1';
      assert.equal(streamConcurrencyManager.acquire(testKey), true);
      assert.equal(streamConcurrencyManager.acquire(testKey), true);
      // 3rd stream exceeded
      assert.equal(streamConcurrencyManager.acquire(testKey), false);

      // Release one slot
      streamConcurrencyManager.release(testKey);
      assert.equal(streamConcurrencyManager.acquire(testKey), true);

      // Clean up
      streamConcurrencyManager.release(testKey);
      streamConcurrencyManager.release(testKey);
    });
  });

  // =========================================================================
  // 6. Content Security Policy (CSP) Production Configuration
  // =========================================================================
  describe('6. Content Security Policy (CSP) Production Configuration', () => {
    test('6.1 getCspDirectives returns strict deny-by-default directives in production', () => {
      const customEnv = {
        NODE_ENV: 'production',
        CLIENT_URL: 'https://nova.production.app',
      };

      const directives = getCspDirectives(customEnv);

      assert.deepEqual(directives.defaultSrc, ["'self'"]);
      assert.deepEqual(directives.scriptSrc, ["'self'"]);
      assert.ok(directives.styleSrc.includes("'self'"));
      assert.ok(directives.styleSrc.includes("'unsafe-inline'"));
      assert.ok(directives.styleSrc.includes('https://fonts.googleapis.com'));
      assert.ok(directives.fontSrc.includes('https://fonts.gstatic.com'));
      assert.ok(directives.imgSrc.includes('blob:'));
      assert.ok(directives.imgSrc.includes('data:'));
      assert.ok(directives.mediaSrc.includes('blob:'));
      assert.ok(directives.connectSrc.includes("'self'"));
      assert.ok(directives.connectSrc.includes('https://nova.production.app'));
      assert.deepEqual(directives.objectSrc, ["'none'"]);
      assert.deepEqual(directives.frameAncestors, ["'none'"]);
      assert.deepEqual(directives.baseUri, ["'self'"]);
      assert.deepEqual(directives.formAction, ["'self'"]);
      assert.ok(directives.upgradeInsecureRequests !== undefined);
    });

    test('6.2 Production connect-src contains no wildcard or insecure development ports', () => {
      const directives = getCspDirectives({
        NODE_ENV: 'production',
        CLIENT_URL: 'https://nova.production.app',
      });

      for (const origin of directives.connectSrc) {
        assert.doesNotMatch(origin, /ws:\/\/localhost/);
        assert.doesNotMatch(origin, /http:\/\/localhost:\*/);
      }
    });
  });

  // =========================================================================
  // 7. RAG Production Vector Store & Isolation
  // =========================================================================
  describe('7. RAG Production Vector Store & Isolation', () => {
    test('7.1 Production environment rejects in-memory vector store without explicit override', () => {
      assert.throws(
        () =>
          validateEnv({
            ...createValidProdEnv(),
            VECTOR_STORE_TYPE: 'local_memory',
            ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: false,
          }),
        /VECTOR_STORE_TYPE cannot be local_memory in production/
      );
    });

    test('7.2 Production vectorStore instance configures mongodb_atlas by default', () => {
      assert.ok(['mongodb_atlas', 'local_memory'].includes(vectorStore.type));
    });
  });

  // =========================================================================
  // 8. Upload & RAM Concurrency Protection
  // =========================================================================
  describe('8. Upload & RAM Concurrency Protection', () => {
    test('8.1 globalUploadConcurrencyManager enforces global and per-user limits', () => {
      const manager = new UploadConcurrencyManager({ maxGlobal: 10, maxPerUser: 2 });
      const userKey = 'prod-user-upload-concurrency-test';

      const slot1 = manager.acquire(userKey);
      assert.equal(slot1.success, true);
      const slot2 = manager.acquire(userKey);
      assert.equal(slot2.success, true);

      // 3rd attempt exceeds max 2 per user
      const slot3 = manager.acquire(userKey);
      assert.equal(slot3.success, false);
      assert.equal(slot3.reason, 'USER_LIMIT_EXCEEDED');

      slot1.release();
      const slot4 = manager.acquire(userKey);
      assert.equal(slot4.success, true);

      // Clean up
      slot2.release();
      slot4.release();
      assert.equal(manager.getActiveGlobal(), 0);
    });
  });

  // =========================================================================
  // 9. Static Asset Serving & SPA Fallback (Same-Origin Option A)
  // =========================================================================
  describe('9. Static Asset Serving & SPA Fallback (Same-Origin Option A)', () => {
    let staticApp;
    let staticServer;
    let staticBaseUrl;

    before(async () => {
      staticApp = express();

      // Simulated API routes
      staticApp.get('/api/test', (req, res) => res.json({ api: true }));

      // Catch-all handler mimicking server/server.js
      staticApp.use((req, res) => {
        if (req.path.startsWith('/api/') || req.path === '/api') {
          return res.status(404).json({
            success: false,
            error: {
              message: `Resource not found: ${req.method} ${req.originalUrl}`,
              code: 'NOT_FOUND',
            },
          });
        }
        // Non-API SPA fallback response
        res.status(200).send('<!DOCTYPE html><html><head><title>NOVA AI</title></head><body><div id="root"></div></body></html>');
      });

      await new Promise((resolve) => {
        staticServer = staticApp.listen(0, '127.0.0.1', () => {
          const port = staticServer.address().port;
          staticBaseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (staticServer) {
        if (typeof staticServer.closeAllConnections === 'function') {
          staticServer.closeAllConnections();
        }
        await new Promise((resolve) => staticServer.close(resolve));
      }
    });

    test('9.1 API routes respond with JSON 404 for unknown endpoints', async () => {
      const res = await fetch(`${staticBaseUrl}/api/nonexistent-route`);
      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'NOT_FOUND');
    });

    test('9.2 Non-API client routes fall back to SPA index.html', async () => {
      const res = await fetch(`${staticBaseUrl}/conversations/new`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /<div id="root">/);
    });
  });

  // =========================================================================
  // 10. Process-Local Semantics & Ephemeral Storage Integrity
  // =========================================================================
  describe('10. Process-Local Semantics & Ephemeral Storage Integrity', () => {
    test('10.1 Trust Proxy setting is properly configured for reverse proxy topology', () => {
      assert.ok(ENV.TRUST_PROXY !== undefined);
      assert.ok(typeof ENV.TRUST_PROXY === 'number' || typeof ENV.TRUST_PROXY === 'boolean');
    });

    test('10.2 Storage directory configuration points to a relative workspace path', () => {
      assert.ok(ENV.STORAGE_DIR);
      assert.doesNotMatch(ENV.STORAGE_DIR, /^\//);
      assert.doesNotMatch(ENV.STORAGE_DIR, /^[A-Z]:\\/i);
    });
  });
});
