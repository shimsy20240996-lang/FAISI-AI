import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ENV } from '../config/env.js';
import {
  getAIModelConfig,
  isTransientError,
  normalizeAIError,
  geminiService,
} from '../services/ai/geminiService.js';
import { aiService } from '../services/ai/aiService.js';
import { AIProviderError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

describe('Phase 10.7: Production Gemini Resilience & Model Fallback Suite', () => {
  let capturedLogs = [];
  let originalEnvFallback;
  let originalEnvModel;

  before(() => {
    originalEnvFallback = ENV.GEMINI_FALLBACK_MODEL;
    originalEnvModel = ENV.GEMINI_MODEL;
  });

  beforeEach(() => {
    capturedLogs = [];
    logger.setOutputDestination((record, formatted) => {
      capturedLogs.push({ record, formatted });
    });
    // Ensure default test model config
    ENV.GEMINI_MODEL = 'gemini-3.6-flash';
    ENV.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
    geminiService.updateModels();
  });

  after(() => {
    logger.resetOutputDestination();
    ENV.GEMINI_FALLBACK_MODEL = originalEnvFallback;
    ENV.GEMINI_MODEL = originalEnvModel;
    geminiService.updateModels();
  });

  // =========================================================================
  // 1. Centralized Model Resolution & Optional Configuration
  // =========================================================================
  describe('1. Centralized Model Resolution & Configuration', () => {
    test('1.1 getAIModelConfig resolves primary and fallback models correctly with defaults', () => {
      const config = getAIModelConfig({
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
      });
      assert.strictEqual(config.primaryModel, 'gemini-3.6-flash');
      assert.strictEqual(config.fallbackModel, 'gemini-3.5-flash-lite');
    });

    test('1.2 getAIModelConfig upgrades discontinued gemini-2.5-flash to gemini-3.6-flash', () => {
      const config = getAIModelConfig({
        GEMINI_MODEL: 'gemini-2.5-flash',
        GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
      });
      assert.strictEqual(config.primaryModel, 'gemini-3.6-flash');
    });

    test('1.3 getAIModelConfig disables fallback if GEMINI_FALLBACK_MODEL is empty string (Test 7)', () => {
      const config = getAIModelConfig({
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_FALLBACK_MODEL: '',
      });
      assert.strictEqual(config.primaryModel, 'gemini-3.6-flash');
      assert.strictEqual(config.fallbackModel, null);
    });

    test('1.4 getAIModelConfig disables fallback if fallback model equals primary model', () => {
      const config = getAIModelConfig({
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_FALLBACK_MODEL: 'gemini-3.6-flash',
      });
      assert.strictEqual(config.primaryModel, 'gemini-3.6-flash');
      assert.strictEqual(config.fallbackModel, null);
    });

    test('1.5 getAIModelConfig uses default fallback when GEMINI_FALLBACK_MODEL is undefined', () => {
      const config = getAIModelConfig({
        GEMINI_MODEL: 'gemini-3.6-flash',
      });
      assert.strictEqual(config.primaryModel, 'gemini-3.6-flash');
      assert.strictEqual(config.fallbackModel, 'gemini-3.5-flash-lite');
    });
  });

  // =========================================================================
  // 2. Error Classification & Normalization
  // =========================================================================
  describe('2. Error Classification & Normalization', () => {
    test('2.1 classifies 429 and rate limit errors with user-friendly message', () => {
      const err = new Error('Resource_exhausted: quota exceeded');
      err.status = 429;
      const normalized = normalizeAIError(err, 'test');
      assert.strictEqual(normalized instanceof AIProviderError, true);
      assert.strictEqual(normalized.statusCode, 429);
      assert.strictEqual(normalized.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(normalized.message, 'SABU is temporarily rate-limited. Please try again in a moment.');
    });

    test('2.2 classifies 503 and high demand errors with model availability message', () => {
      const err = new Error('This model is currently experiencing high demand. 503 UNAVAILABLE');
      err.status = 503;
      const normalized = normalizeAIError(err, 'test');
      assert.strictEqual(normalized instanceof AIProviderError, true);
      assert.strictEqual(normalized.statusCode, 503);
      assert.strictEqual(normalized.code, 'MODEL_HIGH_DEMAND');
      assert.strictEqual(normalized.message, 'SABU is experiencing high demand right now. Please try again in a moment.');
    });

    test('2.3 classifies 401 and invalid API key errors without leaking key or config details', () => {
      const err = new Error('API_KEY_INVALID: key=AIzaSyA_SecretKey1234567890123456789012345');
      err.status = 401;
      const normalized = normalizeAIError(err, 'test');
      assert.strictEqual(normalized instanceof AIProviderError, true);
      assert.strictEqual(normalized.statusCode, 401);
      assert.strictEqual(normalized.code, 'INVALID_API_KEY');
      assert.strictEqual(normalized.message, 'SABU is temporarily unable to connect to its AI service.');
      assert.strictEqual(normalized.message.includes('AIza'), false);
    });

    test('2.4 classifies timeout errors with user-friendly message (504 / TIMEOUT_ERROR)', () => {
      const err = new TimeoutError('Gemini API streaming timed out.');
      const normalized = normalizeAIError(err, 'test');
      assert.strictEqual(normalized instanceof AIProviderError, true);
      assert.strictEqual(normalized.statusCode, 504);
      assert.strictEqual(normalized.code, 'TIMEOUT_ERROR');
      assert.strictEqual(
        normalized.message,
        'SABU couldn\'t complete the response because the AI service took too long to respond. Please try again.'
      );
      assert.strictEqual(normalized.message.includes('streaming timed out'), false);
    });

    test('2.5 classifies generic upstream errors (500, 502)', () => {
      const err = new Error('Bad Gateway from upstream');
      err.status = 502;
      const normalized = normalizeAIError(err, 'test');
      assert.strictEqual(normalized instanceof AIProviderError, true);
      assert.strictEqual(normalized.statusCode, 502);
      assert.strictEqual(normalized.code, 'UPSTREAM_SERVICE_ERROR');
      assert.strictEqual(normalized.message, 'SABU couldn\'t reach the AI service right now. Please try again shortly.');
    });

    test('2.6 isTransientError correctly identifies all transient conditions including timeouts', () => {
      assert.strictEqual(isTransientError({ status: 429 }), true);
      assert.strictEqual(isTransientError({ statusCode: 500 }), true);
      assert.strictEqual(isTransientError({ status: 502 }), true);
      assert.strictEqual(isTransientError({ statusCode: 503 }), true);
      assert.strictEqual(isTransientError({ status: 504 }), true);
      assert.strictEqual(isTransientError(new TimeoutError('streaming timed out')), true);
      assert.strictEqual(isTransientError({ code: 'TIMEOUT_ERROR' }), true);
      assert.strictEqual(isTransientError({ code: 'ECONNRESET' }), true);
      assert.strictEqual(isTransientError({ code: 'ETIMEDOUT' }), true);
      assert.strictEqual(isTransientError({ code: 'ESOCKETTIMEDOUT' }), true);
      assert.strictEqual(isTransientError({ code: 'EAI_AGAIN' }), true);
      assert.strictEqual(isTransientError(new Error('high demand spikes')), true);
      assert.strictEqual(isTransientError(new Error('service unavailable')), true);
      assert.strictEqual(isTransientError(new Error('temporarily unavailable')), true);
      assert.strictEqual(isTransientError(new Error('Gemini API streaming timed out.')), true);
    });

    test('2.7 isTransientError returns false for permanent errors (400, 401, 403, 404)', () => {
      assert.strictEqual(isTransientError({ status: 400 }), false);
      assert.strictEqual(isTransientError({ statusCode: 401 }), false);
      assert.strictEqual(isTransientError({ status: 403 }), false);
      assert.strictEqual(isTransientError({ status: 404 }), false);
      assert.strictEqual(isTransientError(new Error('Invalid argument: schema mismatch')), false);
    });
  });

  // =========================================================================
  // 3. Streaming Resilience Scenarios (Tests 1 - 7 + Safeguards)
  // =========================================================================
  describe('3. Streaming Resilience & Fallback Scenarios', () => {
    // Helper to create mock GoogleGenAI client for geminiService
    const setupMockClient = (mockGenerateStreamFn) => {
      geminiService.getClient = () => ({
        models: {
          generateContentStream: mockGenerateStreamFn,
        },
      });
    };

    test('3.1 Test 1 — Primary succeeds: normal streaming, no fallback, primary model metadata', async () => {
      const calls = [];
      setupMockClient(async ({ model }) => {
        calls.push(model);
        return (async function* () {
          yield { text: 'Hello ' };
          yield { text: 'world!' };
        })();
      });

      const chunks = [];
      let selectedModel = null;

      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
        onModelSelected: (m) => { selectedModel = m; },
      });

      assert.strictEqual(chunks.join(''), 'Hello world!');
      assert.strictEqual(result.model, 'gemini-3.6-flash');
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0], 'gemini-3.6-flash');
      // No fallback log emitted
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.strictEqual(fallbackLog, undefined);
    });

    test('3.2 Test 2 — Primary transient failure then succeeds: retry works, fallback NOT used', async () => {
      const calls = [];
      let attempt = 0;

      setupMockClient(async ({ model }) => {
        calls.push(model);
        attempt++;
        if (attempt === 1) {
          const err = new Error('503 UNAVAILABLE: high demand');
          err.status = 503;
          throw err;
        }
        return (async function* () {
          yield { text: 'Recovered response' };
        })();
      });

      const chunks = [];
      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      assert.strictEqual(chunks.join(''), 'Recovered response');
      assert.strictEqual(result.model, 'gemini-3.6-flash');
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0], 'gemini-3.6-flash');
      assert.strictEqual(calls[1], 'gemini-3.6-flash');
      // Fallback was not used
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.strictEqual(fallbackLog, undefined);
    });

    test('3.3 Test 2b — Primary streaming timeout then succeeds on retry', async () => {
      const calls = [];
      let attempt = 0;

      setupMockClient(async ({ model }) => {
        calls.push(model);
        attempt++;
        if (attempt === 1) {
          throw new TimeoutError('Gemini API streaming timed out.');
        }
        return (async function* () {
          yield { text: 'Recovered after timeout' };
        })();
      });

      const chunks = [];
      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      assert.strictEqual(chunks.join(''), 'Recovered after timeout');
      assert.strictEqual(result.model, 'gemini-3.6-flash');
      assert.strictEqual(calls.length, 2);

      // Verify streaming timeout warning and retry warning
      const timeoutLog = capturedLogs.find((l) => l.record?.event === 'gemini.stream.timeout');
      assert.ok(timeoutLog, 'Should log gemini.stream.timeout');
    });

    test('3.4 Test 3 — Primary exhausted (503x3): fallback activates, succeeds, logs structured event', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        if (model === 'gemini-3.6-flash') {
          const err = new Error('503 UNAVAILABLE: Model is experiencing high demand');
          err.status = 503;
          throw err;
        }
        return (async function* () {
          yield { text: 'Fallback stream content' };
        })();
      });

      const chunks = [];
      let reportedModel = null;

      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
        onModelSelected: (m) => { reportedModel = m; },
      });

      assert.strictEqual(chunks.join(''), 'Fallback stream content');
      assert.strictEqual(result.model, 'gemini-3.5-flash-lite');
      // 1 initial + 2 retries on primary = 3 attempts on primary, then 1 on fallback
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);

      // Verify structured fallback log
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.ok(fallbackLog, 'Should emit gemini.model.fallback structured log');
      assert.strictEqual(fallbackLog.record.primary, 'gemini-3.6-flash');
      assert.strictEqual(fallbackLog.record.fallback, 'gemini-3.5-flash-lite');
    });

    test('3.5 Test 3b — Primary streaming timeout repeatedly (3x): fallback activates, succeeds, logs structured timeout reason', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        if (model === 'gemini-3.6-flash') {
          throw new TimeoutError('Gemini API streaming timed out.');
        }
        return (async function* () {
          yield { text: 'Fallback content after timeouts' };
        })();
      });

      const chunks = [];
      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      assert.strictEqual(chunks.join(''), 'Fallback content after timeouts');
      assert.strictEqual(result.model, 'gemini-3.5-flash-lite');
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);

      // Verify structured fallback log with reason=timeout
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.ok(fallbackLog, 'Should emit gemini.model.fallback structured log');
      assert.strictEqual(fallbackLog.record.reason, 'timeout');
    });

    test('3.6 Test 4 — Primary fails after partial output (chunksEmitted > 0): NEVER fallback or duplicate', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        return (async function* () {
          yield { text: 'Partial chunk 1 ' };
          yield { text: 'Partial chunk 2 ' };
          const streamErr = new Error('503 Stream Interrupted');
          streamErr.status = 503;
          throw streamErr;
        })();
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'MODEL_HIGH_DEMAND');
          return true;
        }
      );

      // Chunks received
      assert.strictEqual(chunks.join(''), 'Partial chunk 1 Partial chunk 2 ');
      // Strictly 1 attempt on primary, ZERO calls to fallback
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0], 'gemini-3.6-flash');
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.strictEqual(fallbackLog, undefined);
    });

    test('3.7 Test 4b — Primary timeout after partial output (chunksEmitted > 0): NEVER fallback or duplicate', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        return (async function* () {
          yield { text: 'Early chunk emitted ' };
          throw new TimeoutError('Gemini API streaming timed out.');
        })();
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 504);
          assert.strictEqual(err.code, 'TIMEOUT_ERROR');
          return true;
        }
      );

      assert.strictEqual(chunks.join(''), 'Early chunk emitted ');
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0], 'gemini-3.6-flash');
      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.strictEqual(fallbackLog, undefined);
    });

    test('3.8 Test 5 — Authentication failure (401): immediate failure, no retry storm, no fallback', async () => {
      let callCount = 0;

      setupMockClient(async () => {
        callCount++;
        const authErr = new Error('API_KEY_INVALID');
        authErr.status = 401;
        throw authErr;
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 401);
          assert.strictEqual(err.code, 'INVALID_API_KEY');
          return true;
        }
      );

      // Exactly 1 call, no retries, no fallback
      assert.strictEqual(callCount, 1);
    });

    test('3.9 Test 6 — Rate limit (429): transient retry works, fallback only after retries exhaust', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        if (model === 'gemini-3.6-flash') {
          const err = new Error('Resource_exhausted: Rate limit exceeded');
          err.status = 429;
          throw err;
        }
        return (async function* () {
          yield { text: 'Response from fallback after 429 exhausted' };
        })();
      });

      const chunks = [];
      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      assert.strictEqual(chunks.join(''), 'Response from fallback after 429 exhausted');
      assert.strictEqual(result.model, 'gemini-3.5-flash-lite');
      // 3 primary attempts (1 initial + 2 retries) + 1 fallback attempt = 4 calls
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);
    });

    test('3.10 Test 7 — Missing / Disabled fallback configuration: works normally, no fallback attempt on failure', async () => {
      ENV.GEMINI_FALLBACK_MODEL = '';
      geminiService.updateModels();

      const calls = [];
      setupMockClient(async ({ model }) => {
        calls.push(model);
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'MODEL_HIGH_DEMAND');
          return true;
        }
      );

      // Only primary was called with bounded retries (3 calls), no fallback called
      assert.strictEqual(calls.every((m) => m === 'gemini-3.6-flash'), true);
      assert.strictEqual(calls.length, 3);
      assert.strictEqual(geminiService.fallbackModel, null);
    });

    test('3.11 SAFEGUARD #1 — Cancellation: AbortSignal triggered during retry/delay stops execution cleanly', async () => {
      const abortController = new AbortController();
      let primaryAttempts = 0;

      setupMockClient(async ({ model }) => {
        primaryAttempts++;
        if (primaryAttempts === 1) {
          // Trigger abort during first failure
          abortController.abort();
          const err = new Error('503 Unavailable');
          err.status = 503;
          throw err;
        }
        return (async function* () {
          yield { text: 'Should not run' };
        })();
      });

      const chunks = [];
      const result = await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        signal: abortController.signal,
        onChunk: (c) => chunks.push(c),
      });

      // Exactly 1 attempt on primary, aborted immediately, no retries, no fallback
      assert.strictEqual(primaryAttempts, 1);
      assert.strictEqual(chunks.length, 0);
    });

    test('3.12 SAFEGUARD #1 — Cancellation: Pre-aborted signal does not initialize request', async () => {
      const abortController = new AbortController();
      abortController.abort();

      let callCount = 0;
      setupMockClient(async () => {
        callCount++;
        return (async function* () {
          yield { text: 'Never run' };
        })();
      });

      const chunks = [];
      await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        signal: abortController.signal,
        onChunk: (c) => chunks.push(c),
      });

      assert.strictEqual(callCount, 0);
      assert.strictEqual(chunks.length, 0);
    });

    test('3.13 SAFEGUARD #2 — Fallback Failure: Fallback attempted once, no second fallback or infinite loop on 503', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        const err = new Error('503 Both Primary and Fallback Down');
        err.status = 503;
        throw err;
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'MODEL_HIGH_DEMAND');
          return true;
        }
      );

      // Primary had 3 attempts (1 initial + 2 retries), fallback had exactly 1 attempt. Total = 4.
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);
      assert.strictEqual(calls.length, 4);

      const fallbackErrLog = capturedLogs.find((l) => l.record?.event === 'gemini.fallback.error');
      assert.ok(fallbackErrLog, 'Should log gemini.fallback.error on fallback failure');
    });

    test('3.14 SAFEGUARD #2 — Fallback Failure: Fallback times out, final classified 504 TIMEOUT_ERROR thrown', async () => {
      const calls = [];

      setupMockClient(async ({ model }) => {
        calls.push(model);
        throw new TimeoutError('Gemini API streaming timed out.');
      });

      const chunks = [];
      await assert.rejects(
        async () => {
          await geminiService.streamResponse({
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (c) => chunks.push(c),
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 504);
          assert.strictEqual(err.code, 'TIMEOUT_ERROR');
          assert.strictEqual(
            err.message,
            'SABU couldn\'t complete the response because the AI service took too long to respond. Please try again.'
          );
          return true;
        }
      );

      // 3 on primary + 1 on fallback = 4 calls total
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);
      assert.strictEqual(calls.length, 4);
    });
  });

  // =========================================================================
  // 4. Non-Streaming & Document Analysis Resilience
  // =========================================================================
  describe('4. Non-Streaming & Document Analysis Resilience', () => {
    test('4.1 generateResponse falls back to gemini-3.5-flash-lite when primary fails with 503', async () => {
      const calls = [];
      geminiService.getClient = () => ({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.6-flash') {
              const err = new Error('503 High Demand');
              err.status = 503;
              throw err;
            }
            return {
              text: 'Response from non-streaming fallback',
            };
          },
        },
      });

      const res = await geminiService.generateResponse({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      assert.strictEqual(res.content, 'Response from non-streaming fallback');
      assert.strictEqual(res.model, 'gemini-3.5-flash-lite');
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);
    });

    test('4.2 generateResponse falls back to gemini-3.5-flash-lite when primary times out', async () => {
      const calls = [];
      geminiService.getClient = () => ({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.6-flash') {
              throw new TimeoutError('Gemini API timed out');
            }
            return {
              text: 'Response from timeout fallback',
            };
          },
        },
      });

      const res = await geminiService.generateResponse({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      assert.strictEqual(res.content, 'Response from timeout fallback');
      assert.strictEqual(res.model, 'gemini-3.5-flash-lite');
    });

    test('4.3 analyzeDocument falls back to gemini-3.5-flash-lite when primary fails with 503', async () => {
      const calls = [];
      geminiService.getClient = () => ({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.6-flash') {
              const err = new Error('503 High Demand');
              err.status = 503;
              throw err;
            }
            return {
              text: 'Analysis summary from fallback',
            };
          },
        },
      });

      const res = await geminiService.analyzeDocument({
        documentText: 'Sample document text for analysis test',
        fileName: 'test.pdf',
        instruction: 'Summarize key findings',
      });

      assert.strictEqual(res.content, 'Analysis summary from fallback');
      assert.strictEqual(res.model, 'gemini-3.5-flash-lite');
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.6-flash').length, 3);
      assert.strictEqual(calls.filter((m) => m === 'gemini-3.5-flash-lite').length, 1);
    });

    test('4.4 aiService wrapper forwards onModelSelected and returns correct model', async () => {
      let reportedModel = null;
      geminiService.getClient = () => ({
        models: {
          generateContentStream: async () => {
            return (async function* () {
              yield { text: 'Wrapped stream chunk' };
            })();
          },
        },
      });

      const chunks = [];
      const res = await aiService.streamResponse({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
        onModelSelected: (m) => { reportedModel = m; },
      });

      assert.strictEqual(chunks.join(''), 'Wrapped stream chunk');
      assert.strictEqual(res.model, 'gemini-3.6-flash');
      assert.strictEqual(reportedModel, 'gemini-3.6-flash');
    });
  });

  // =========================================================================
  // 5. Sensitive Data Audit in Logging
  // =========================================================================
  describe('5. Sensitive Data Audit in Logs', () => {
    test('5.1 Structured fallback log does not leak API keys, authorization headers, or secrets', async () => {
      geminiService.getClient = () => ({
        models: {
          generateContentStream: async ({ model }) => {
            if (model === 'gemini-3.6-flash') {
              const err = new Error('503 Service Unavailable key=AIzaSyB_SecretKey1234567890123456789012345');
              err.status = 503;
              throw err;
            }
            return (async function* () {
              yield { text: 'Fallback success' };
            })();
          },
        },
      });

      await geminiService.streamResponse({
        messages: [{ role: 'user', content: 'Sensitive confidential prompt text' }],
        onChunk: () => {},
      });

      const fallbackLog = capturedLogs.find((l) => l.record?.event === 'gemini.model.fallback');
      assert.ok(fallbackLog, 'Should have emitted fallback log');

      const logString = JSON.stringify(fallbackLog);
      assert.strictEqual(logString.includes('AIzaSyB'), false, 'Must not contain raw API key');
      assert.strictEqual(logString.includes('Sensitive confidential prompt text'), false, 'Must not contain user prompt text');
      assert.strictEqual(fallbackLog.record.primary, 'gemini-3.6-flash');
      assert.strictEqual(fallbackLog.record.fallback, 'gemini-3.5-flash-lite');
    });
  });
});
