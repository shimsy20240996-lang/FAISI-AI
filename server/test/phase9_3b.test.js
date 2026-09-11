import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import helmet from 'helmet';
import { getCspDirectives } from '../middleware/csp.js';

describe('Phase 9.3-B: SEC-VULN-08 Content Security Policy Suite', () => {
  // =========================================================================
  // 1. CSP Directive Structure & Positive Requirements
  // =========================================================================
  describe('1. Production CSP Directives Verification', () => {
    const prodEnv = {
      NODE_ENV: 'production',
      CLIENT_URL: 'https://nova.example.com',
    };
    const directives = getCspDirectives(prodEnv);

    test('1.1 default-src is strictly set to self (deny-by-default)', () => {
      assert.deepEqual(directives.defaultSrc, ["'self'"]);
    });

    test('1.2 script-src is strictly restricted to self without unsafe-inline or unsafe-eval', () => {
      assert.deepEqual(directives.scriptSrc, ["'self'"]);
      assert.ok(!directives.scriptSrc.includes("'unsafe-inline'"), 'script-src must NOT contain unsafe-inline');
      assert.ok(!directives.scriptSrc.includes("'unsafe-eval'"), 'script-src must NOT contain unsafe-eval');
      assert.ok(!directives.scriptSrc.includes('*'), 'script-src must NOT contain wildcard *');
    });

    test('1.3 style-src allows self, Google Fonts, and unsafe-inline for dynamic React/Framer-motion styles', () => {
      assert.ok(directives.styleSrc.includes("'self'"));
      assert.ok(directives.styleSrc.includes("'unsafe-inline'"));
      assert.ok(directives.styleSrc.includes('https://fonts.googleapis.com'));
      assert.ok(!directives.styleSrc.includes('*'), 'style-src must NOT contain wildcard *');
    });

    test('1.4 font-src allows self, Google Fonts gstatic, and data URIs', () => {
      assert.ok(directives.fontSrc.includes("'self'"));
      assert.ok(directives.fontSrc.includes('https://fonts.gstatic.com'));
      assert.ok(directives.fontSrc.includes('data:'));
      assert.ok(!directives.fontSrc.includes('*'), 'font-src must NOT contain wildcard *');
    });

    test('1.5 img-src allows self, data URIs, and blob URIs for local upload previews', () => {
      assert.ok(directives.imgSrc.includes("'self'"));
      assert.ok(directives.imgSrc.includes('data:'));
      assert.ok(directives.imgSrc.includes('blob:'));
      assert.ok(!directives.imgSrc.includes('*'), 'img-src must NOT contain wildcard *');
    });

    test('1.6 media-src allows self and blob URIs for recorded audio and TTS playback', () => {
      assert.ok(directives.mediaSrc.includes("'self'"));
      assert.ok(directives.mediaSrc.includes('blob:'));
      assert.ok(!directives.mediaSrc.includes('*'), 'media-src must NOT contain wildcard *');
    });

    test('1.7 connect-src is strictly restricted to self and configured production client origin', () => {
      assert.ok(directives.connectSrc.includes("'self'"));
      assert.ok(directives.connectSrc.includes('https://nova.example.com'));
      assert.ok(!directives.connectSrc.includes('*'), 'connect-src must NOT contain wildcard *');
      assert.ok(!directives.connectSrc.some((s) => s.startsWith('ws://')), 'Production connect-src must not contain unencrypted dev websockets');
    });

    test('1.8 Anti-embedding and integrity directives are strictly enforced', () => {
      assert.deepEqual(directives.objectSrc, ["'none'"], 'object-src must be none to block plugins');
      assert.deepEqual(directives.frameAncestors, ["'none'"], 'frame-ancestors must be none to prevent clickjacking');
      assert.deepEqual(directives.baseUri, ["'self'"], 'base-uri must be self to prevent base tag hijacking');
      assert.deepEqual(directives.formAction, ["'self'"], 'form-action must be self');
      assert.ok(Array.isArray(directives.upgradeInsecureRequests), 'upgradeInsecureRequests should be enabled in production');
    });
  });

  // =========================================================================
  // 2. Development vs Production Environment Policy
  // =========================================================================
  describe('2. Development vs Production Directives', () => {
    test('2.1 Development mode enables Vite HMR dev sockets while keeping core protections intact', () => {
      const devEnv = {
        NODE_ENV: 'development',
        CLIENT_URL: 'http://localhost:3000',
      };
      const devDirectives = getCspDirectives(devEnv);

      assert.ok(devDirectives.connectSrc.includes("'self'"));
      assert.ok(devDirectives.connectSrc.includes('http://localhost:3000'));
      assert.ok(devDirectives.connectSrc.includes('ws://localhost:*'));
      assert.deepEqual(devDirectives.objectSrc, ["'none'"]);
      assert.deepEqual(devDirectives.frameAncestors, ["'none'"]);
      assert.deepEqual(devDirectives.scriptSrc, ["'self'"]);
      assert.equal(devDirectives.upgradeInsecureRequests, undefined);
    });
  });

  // =========================================================================
  // 3. Live HTTP Response Header Testing via Helmet
  // =========================================================================
  describe('3. Live HTTP Header Enforcement', () => {
    let app;
    let server;
    let serverPort;

    before(async () => {
      app = express();
      app.use(
        helmet({
          contentSecurityPolicy: {
            directives: getCspDirectives({ NODE_ENV: 'production', CLIENT_URL: 'https://app.nova.ai' }),
          },
          crossOriginEmbedderPolicy: false,
        })
      );
      app.get('/api/test', (req, res) => res.json({ ok: true }));
      app.get('/', (req, res) => res.send('<!DOCTYPE html><html><body><h1>NOVA AI</h1></body></html>'));

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

    test('3.1 Server sends valid Content-Security-Policy HTTP header on API responses', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/test`);
      assert.equal(response.status, 200);

      const csp = response.headers.get('content-security-policy');
      assert.ok(csp, 'Response must include content-security-policy header');

      // Verify specific directive clauses in actual header string
      assert.ok(csp.includes("default-src 'self'"));
      assert.ok(csp.includes("script-src 'self'"));
      assert.ok(csp.includes("object-src 'none'"));
      assert.ok(csp.includes("frame-ancestors 'none'"));
      assert.ok(csp.includes("base-uri 'self'"));
      assert.ok(csp.includes("form-action 'self'"));
      assert.ok(csp.includes("img-src 'self' data: blob:"));
      assert.ok(csp.includes("media-src 'self' blob:"));
      assert.ok(csp.includes("connect-src 'self' https://app.nova.ai"));
      assert.ok(csp.includes("upgrade-insecure-requests"));
    });

    test('3.2 Server sends valid Content-Security-Policy HTTP header on HTML responses', async () => {
      const response = await fetch(`http://localhost:${serverPort}/`);
      assert.equal(response.status, 200);

      const csp = response.headers.get('content-security-policy');
      assert.ok(csp, 'HTML response must include content-security-policy header');
      assert.ok(csp.includes("default-src 'self'"));
    });

    test('3.3 Security: Rejects insecure script configurations in header string', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/test`);
      const csp = response.headers.get('content-security-policy');

      // Ensure no unsafe script execution in the header
      assert.ok(!csp.includes("script-src 'unsafe-inline'"));
      assert.ok(!csp.includes("script-src 'unsafe-eval'"));
      assert.ok(!csp.includes("script-src *"));
      assert.ok(!csp.includes("default-src *"));
      assert.ok(!csp.includes("object-src *"));
    });
  });
});
