import { GoogleGenAI } from '@google/genai';
import { ENV } from '../../config/env.js';
import { AIProviderError, TimeoutError } from '../../utils/errors.js';
import { NOVA_SYSTEM_INSTRUCTION } from './systemPrompt.js';
import { recordAITelemetry, recordAIRetryTelemetry, normalizeStatusClass } from '../../utils/metrics.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolves the primary and fallback AI model configuration.
 * @param {object} [customEnv=ENV]
 * @returns {{ primaryModel: string, fallbackModel: string | null }}
 */
export function getAIModelConfig(customEnv = ENV) {
  const env = customEnv || ENV;
  const configuredModel = (env.GEMINI_MODEL || 'gemini-3.6-flash').trim();
  const primaryModel = configuredModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : configuredModel;

  let configuredFallback = env.GEMINI_FALLBACK_MODEL !== undefined
    ? String(env.GEMINI_FALLBACK_MODEL).trim()
    : 'gemini-3.5-flash-lite';

  const fallbackModel = (configuredFallback && configuredFallback !== primaryModel)
    ? configuredFallback
    : null;

  return { primaryModel, fallbackModel };
}

/**
 * Checks whether an error is transient (e.g. rate limit, temporary network failure, 503 unavailable, timeout)
 */
export function isTransientError(error) {
  if (!error) return false;
  if (error instanceof TimeoutError || error.name === 'TimeoutError' || error.code === 'TIMEOUT_ERROR') {
    return true;
  }
  const msg = (error.message || '').toLowerCase();
  const rawCode = error.status || error.statusCode || error.code;
  const numCode = Number(rawCode);

  if (
    numCode === 429 ||
    numCode === 500 ||
    numCode === 502 ||
    numCode === 503 ||
    numCode === 504 ||
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ESOCKETTIMEDOUT' ||
    error.code === 'EAI_AGAIN'
  ) {
    return true;
  }
  if (
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('esockettimedout') ||
    msg.includes('eai_again') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return true;
  }
  return false;
}

/**
 * Normalizes upstream AI errors into distinct, user-friendly categorized errors without exposing raw keys, JSON, or stack traces.
 * @param {Error|any} error
 * @param {string} [context='processing']
 * @returns {AIProviderError|TimeoutError}
 */
export function normalizeAIError(error, context = 'processing') {
  if (!error) {
    return new AIProviderError('Upstream AI service error.', 502, 'UPSTREAM_SERVICE_ERROR');
  }

  const errorMessage = error?.message || 'Unknown upstream AI error';
  const sanitizedMsg = errorMessage
    .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]');

  if (ENV.NODE_ENV !== 'test') {
    console.error(`🔴 [GeminiService Error in ${context}]:`, sanitizedMsg);
  }

  const code = Number(error?.code || error?.status || error?.statusCode);
  const msg = errorMessage.toLowerCase();

  // 1. Invalid API Key / Auth (401)
  if (
    code === 401 ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key') ||
    msg.includes('api key not valid')
  ) {
    return new AIProviderError(
      'FAISI is temporarily unable to connect to its AI service.',
      401,
      'INVALID_API_KEY'
    );
  }

  // 2. Rate Limited (429)
  if (
    code === 429 ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  ) {
    return new AIProviderError(
      'FAISI is temporarily rate-limited. Please try again in a moment.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // 3. 503 / High Demand / Temporary Unavailable
  if (
    code === 503 ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('unavailable')
  ) {
    return new AIProviderError(
      'FAISI is experiencing high demand right now. Please try again in a moment.',
      503,
      'MODEL_HIGH_DEMAND'
    );
  }

  // 4. Timeout (504 / TIMEOUT_ERROR / timed out)
  if (
    error instanceof TimeoutError ||
    error.name === 'TimeoutError' ||
    error.code === 'TIMEOUT_ERROR' ||
    code === 504 ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return new AIProviderError(
      'FAISI couldn\'t complete the response because the AI service took too long to respond. Please try again.',
      504,
      'TIMEOUT_ERROR'
    );
  }

  // 5. Other Upstream Service Errors
  return new AIProviderError(
    'FAISI couldn\'t reach the AI service right now. Please try again shortly.',
    code && code >= 400 && code < 600 ? code : 502,
    'UPSTREAM_SERVICE_ERROR'
  );
}

/**
 * Executes an async operation with bounded exponential backoff and jitter for transient errors.
 */
export async function executeWithTransientRetry(
  fn,
  { maxRetries = 2, baseDelayMs = 300, maxDelayMs = 1500, onRetry, signal } = {}
) {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      return null;
    }

    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted) {
        return null;
      }

      attempt++;
      if (attempt > maxRetries || !isTransientError(err)) {
        throw err;
      }
      if (typeof onRetry === 'function') {
        try {
          onRetry(attempt, err);
        } catch {
          // Telemetry must never crash retry loop
        }
      }
      const jitter = Math.random() * 50;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitter, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

class GeminiService {
  constructor() {
    this.client = null;
    this.updateModels();
  }

  /**
   * Refreshes model selection from centralized configuration.
   */
  updateModels() {
    const { primaryModel, fallbackModel } = getAIModelConfig();
    this.modelName = primaryModel;
    this.fallbackModel = fallbackModel;
  }

  /**
   * Lazy initializes the GoogleGenAI instance.
   * Throws AIProviderError if GEMINI_API_KEY is not configured.
   */
  getClient() {
    if (!ENV.GEMINI_API_KEY) {
      throw new AIProviderError(
        'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in your server environment.',
        500,
        'API_KEY_MISSING'
      );
    }

    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: ENV.GEMINI_API_KEY,
        httpOptions: {
          apiVersion: 'v1',
        },
      });
    }

    return this.client;
  }

  /**
   * Normalizes incoming NOVA messages to Google Gemini contents format.
   * Supports text-only and multimodal (text + inline images) messages.
   * @param {Array<{ role: string, content: string, attachments?: Array<{ mimeType: string, data?: string, buffer?: Buffer }> }>} messages
   */
  formatMessages(messages) {
    return messages.map((msg) => {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];

      // 1. If message has inline image attachments, add them as inlineData parts
      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.type === 'image' || att.mimeType?.startsWith('image/')) {
            const base64Data =
              att.data ||
              (Buffer.isBuffer(att.buffer) ? att.buffer.toString('base64') : null);

            if (base64Data) {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: base64Data,
                },
              });
            }
          }
        }
      }

      // 2. Add text content part
      parts.push({
        text: msg.content || '',
      });

      return {
        role,
        parts,
      };
    });
  }

  /**
   * Generates a non-streaming response from Google Gemini model with timeout protection, transient retry, and fallback.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   signal?: AbortSignal,
   *   onModelSelected?: (model: string) => void,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async generateResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    signal,
    onModelSelected,
  }) {
    const startHr = process.hrtime.bigint();
    const operation = 'chat';
    const { primaryModel, fallbackModel } = getAIModelConfig();

    const modelsToTry = [primaryModel];
    if (fallbackModel && fallbackModel !== primaryModel) {
      modelsToTry.push(fallbackModel);
    }

    let lastError = null;

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
      if (signal?.aborted) {
        return { role: 'assistant', content: '', model: modelsToTry[modelIdx] };
      }

      const currentModel = modelsToTry[modelIdx];
      const isFallback = modelIdx > 0;

      if (typeof onModelSelected === 'function') {
        onModelSelected(currentModel);
      }

      const maxRetries = isFallback ? 0 : 2;

      try {
        const result = await executeWithTransientRetry(
          async () => {
            if (signal?.aborted) return null;
            const ai = this.getClient();
            const contents = this.formatMessages(messages);

            let timeoutHandle;
            const timeoutPromise = new Promise((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(new TimeoutError('Gemini API timed out while generating response.'));
              }, ENV.REQUEST_TIMEOUT_MS);
            });

            try {
              const generatePromise = ai.models.generateContent({
                model: currentModel,
                contents,
                config: {
                  systemInstruction,
                },
              });

              const response = await Promise.race([generatePromise, timeoutPromise]);
              clearTimeout(timeoutHandle);

              if (signal?.aborted) return null;

              const candidate = response?.candidates?.[0];
              const text =
                response?.text ||
                candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ||
                '';

              if (!text) {
                throw new AIProviderError(
                  'No text was returned by the AI model. The content may have been blocked or empty.',
                  502,
                  'EMPTY_AI_RESPONSE'
                );
              }

              return {
                role: 'assistant',
                content: text.trim(),
                model: currentModel,
              };
            } catch (error) {
              clearTimeout(timeoutHandle);
              throw error;
            }
          },
          {
            maxRetries,
            baseDelayMs: 300,
            maxDelayMs: 1500,
            signal,
            onRetry: () => recordAIRetryTelemetry({ operation, model: currentModel }),
          }
        );

        if (signal?.aborted || !result) {
          return { role: 'assistant', content: '', model: currentModel };
        }

        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        recordAITelemetry({ operation, model: currentModel, statusClass: '2xx', durationMs, isError: false });
        return result;
      } catch (error) {
        lastError = error;
        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
        recordAITelemetry({ operation, model: currentModel, statusClass, durationMs, isError: true });

        const isTimeout =
          error instanceof TimeoutError ||
          error.name === 'TimeoutError' ||
          error.code === 'TIMEOUT_ERROR' ||
          (error.message || '').toLowerCase().includes('timed out');

        const rawReason = isTimeout
          ? 'timeout'
          : String(error.code || error.status || error.statusCode || (error.message ? error.message.slice(0, 100) : 'transient_failure'));

        const sanitizedReason = rawReason
          .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
          .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]')
          .slice(0, 100);

        // If error is transient and fallback is available, log and attempt fallback
        if (isTransientError(error) && modelIdx < modelsToTry.length - 1 && !signal?.aborted) {
          const nextModel = modelsToTry[modelIdx + 1];

          logger.warn('gemini.model.fallback', {
            message: 'Primary model unavailable after retries.',
            primary: currentModel,
            fallback: nextModel,
            reason: sanitizedReason,
          });

          if (ENV.NODE_ENV !== 'test') {
            console.warn(
              `[GeminiService Fallback]\nPrimary model unavailable after retries.\nprimary=${currentModel}\nfallback=${nextModel}\nreason=${sanitizedReason}`
            );
          }
          continue;
        }

        if (isFallback) {
          logger.warn('gemini.fallback.error', {
            fallback: currentModel,
            reason: sanitizedReason,
          });
          if (ENV.NODE_ENV !== 'test') {
            console.warn(
              `[GeminiService Fallback Error]\nfallback=${currentModel}\nreason=${sanitizedReason}`
            );
          }
        }

        throw normalizeAIError(error, 'chat');
      }
    }

    throw normalizeAIError(lastError, 'chat');
  }

  /**
   * Analyzes an uploaded document with prompt-injection defenses, bounded context, transient retry, and fallback.
   * @param {{
   *   documentText: string,
   *   fileName: string,
   *   instruction?: string,
   *   signal?: AbortSignal,
   *   onModelSelected?: (model: string) => void,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async analyzeDocument({
    documentText,
    fileName,
    instruction = 'Please provide a comprehensive summary and key takeaways of this document.',
    signal,
    onModelSelected,
  }) {
    const startHr = process.hrtime.bigint();
    const operation = 'document_analysis';
    const { primaryModel, fallbackModel } = getAIModelConfig();

    const modelsToTry = [primaryModel];
    if (fallbackModel && fallbackModel !== primaryModel) {
      modelsToTry.push(fallbackModel);
    }

    let lastError = null;

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
      if (signal?.aborted) {
        return { role: 'assistant', content: '', model: modelsToTry[modelIdx] };
      }

      const currentModel = modelsToTry[modelIdx];
      const isFallback = modelIdx > 0;

      if (typeof onModelSelected === 'function') {
        onModelSelected(currentModel);
      }

      const maxRetries = isFallback ? 0 : 2;

      try {
        const result = await executeWithTransientRetry(
          async () => {
            if (signal?.aborted) return null;
            const ai = this.getClient();

            // 1. Bound document text context
            const maxContextChars = ENV.MAX_ANALYSIS_CONTEXT_CHARS || 50000;
            const boundedText = documentText.length > maxContextChars
              ? documentText.slice(0, maxContextChars) + '\n\n[... Remaining document content truncated for analysis context limit ...]'
              : documentText;

            // 2. Bound and sanitize user instruction
            const maxInstructionChars = ENV.MAX_INSTRUCTION_CHARS || 1000;
            const cleanInstruction = (instruction || 'Summarize this document').trim().slice(0, maxInstructionChars);

            // 3. Construct structured, prompt-injection isolated prompt
            const userPrompt = `Document: "${fileName}"\n\nUser Instruction:\n${cleanInstruction}\n\n<DOCUMENT_CONTENT>\n${boundedText}\n</DOCUMENT_CONTENT>`;

            const contents = [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ];

            let timeoutHandle;
            const timeoutPromise = new Promise((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(new TimeoutError(`Document analysis timed out after ${ENV.DOCUMENT_ANALYSIS_TIMEOUT_MS / 1000} seconds.`));
              }, ENV.DOCUMENT_ANALYSIS_TIMEOUT_MS);
            });

            try {
              const generatePromise = ai.models.generateContent({
                model: currentModel,
                contents,
                config: {
                  systemInstruction: 'You are an expert document analysis AI. Analyze the document objectively based strictly on the provided content.',
                },
              });

              const response = await Promise.race([generatePromise, timeoutPromise]);
              clearTimeout(timeoutHandle);

              if (signal?.aborted) return null;

              const candidate = response?.candidates?.[0];
              const text =
                response?.text ||
                candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ||
                '';

              if (!text) {
                throw new AIProviderError(
                  'No analysis output was returned by the AI model.',
                  502,
                  'EMPTY_AI_RESPONSE'
                );
              }

              return {
                role: 'assistant',
                content: text.trim(),
                model: currentModel,
              };
            } catch (error) {
              clearTimeout(timeoutHandle);
              throw error;
            }
          },
          {
            maxRetries,
            baseDelayMs: 300,
            maxDelayMs: 1500,
            signal,
            onRetry: () => recordAIRetryTelemetry({ operation, model: currentModel }),
          }
        );

        if (signal?.aborted || !result) {
          return { role: 'assistant', content: '', model: currentModel };
        }

        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        recordAITelemetry({ operation, model: currentModel, statusClass: '2xx', durationMs, isError: false });
        return result;
      } catch (error) {
        lastError = error;
        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
        recordAITelemetry({ operation, model: currentModel, statusClass, durationMs, isError: true });

        const isTimeout =
          error instanceof TimeoutError ||
          error.name === 'TimeoutError' ||
          error.code === 'TIMEOUT_ERROR' ||
          (error.message || '').toLowerCase().includes('timed out');

        const rawReason = isTimeout
          ? 'timeout'
          : String(error.code || error.status || error.statusCode || (error.message ? error.message.slice(0, 100) : 'transient_failure'));

        const sanitizedReason = rawReason
          .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
          .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]')
          .slice(0, 100);

        // If error is transient and fallback is available, log and attempt fallback
        if (isTransientError(error) && modelIdx < modelsToTry.length - 1 && !signal?.aborted) {
          const nextModel = modelsToTry[modelIdx + 1];

          logger.warn('gemini.model.fallback', {
            message: 'Primary model unavailable after retries.',
            primary: currentModel,
            fallback: nextModel,
            reason: sanitizedReason,
          });

          if (ENV.NODE_ENV !== 'test') {
            console.warn(
              `[GeminiService Fallback]\nPrimary model unavailable after retries.\nprimary=${currentModel}\nfallback=${nextModel}\nreason=${sanitizedReason}`
            );
          }
          continue;
        }

        if (isFallback) {
          logger.warn('gemini.fallback.error', {
            fallback: currentModel,
            reason: sanitizedReason,
          });
          if (ENV.NODE_ENV !== 'test') {
            console.warn(
              `[GeminiService Fallback Error]\nfallback=${currentModel}\nreason=${sanitizedReason}`
            );
          }
        }

        throw normalizeAIError(error, 'document_analysis');
      }
    }

    throw normalizeAIError(lastError, 'document_analysis');
  }

  /**
   * Generates a progressive streaming response using Google Gemini generateContentStream.
   * Handles transient errors (including per-attempt timeouts) with exponential backoff on primary model,
   * and seamlessly switches to fallback model before any chunks are emitted.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   onChunk: (text: string) => void,
   *   onModelSelected?: (model: string) => void,
   *   signal?: AbortSignal,
   * }} params
   * @returns {Promise<{ model: string }>}
   */
  async streamResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    onChunk,
    onModelSelected,
    signal,
  }) {
    const startHr = process.hrtime.bigint();
    const operation = 'chat_stream';
    const { primaryModel, fallbackModel } = getAIModelConfig();

    const ai = this.getClient();
    const contents = this.formatMessages(messages);

    const modelsToTry = [primaryModel];
    if (fallbackModel && fallbackModel !== primaryModel) {
      modelsToTry.push(fallbackModel);
    }

    const maxPrimaryRetries = 2;
    const baseDelayMs = 500;
    const maxDelayMs = 2000;

    let chunksEmitted = 0;
    let selectedModel = primaryModel;

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
      if (signal?.aborted) {
        return { model: selectedModel };
      }

      const currentModel = modelsToTry[modelIdx];
      const isFallback = modelIdx > 0;
      selectedModel = currentModel;

      if (typeof onModelSelected === 'function') {
        onModelSelected(currentModel);
      }

      let attempt = 0;
      const retriesForCurrentModel = isFallback ? 0 : maxPrimaryRetries;

      while (true) {
        if (signal?.aborted) {
          return { model: currentModel };
        }

        let timeoutHandle;
        let attemptTimedOut = false;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            attemptTimedOut = true;
            reject(new TimeoutError('Gemini API streaming timed out.'));
          }, ENV.AI_STREAM_TIMEOUT_MS);
        });

        try {
          const responseStreamPromise = ai.models.generateContentStream({
            model: currentModel,
            contents,
            config: {
              systemInstruction,
            },
          });

          // Race initial stream creation with the attempt-scoped timeout
          const responseStream = await Promise.race([
            responseStreamPromise,
            timeoutPromise,
          ]);

          // Race chunk consumption with the attempt-scoped timeout
          const consumeStreamPromise = (async () => {
            for await (const chunk of responseStream) {
              if (signal?.aborted || attemptTimedOut) {
                break;
              }

              const candidate = chunk?.candidates?.[0];
              const text =
                chunk?.text ||
                candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
                '';

              if (text) {
                chunksEmitted++;
                onChunk(text);
              }
            }
          })();

          await Promise.race([
            consumeStreamPromise,
            timeoutPromise,
          ]);

          clearTimeout(timeoutHandle);

          if (!signal?.aborted) {
            const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
            recordAITelemetry({ operation, model: currentModel, statusClass: '2xx', durationMs, isError: false });
          }
          return { model: currentModel };
        } catch (error) {
          clearTimeout(timeoutHandle);

          if (signal?.aborted) {
            return { model: currentModel };
          }

          const isTimeout =
            error instanceof TimeoutError ||
            error.name === 'TimeoutError' ||
            error.code === 'TIMEOUT_ERROR' ||
            (error.message || '').toLowerCase().includes('timed out') ||
            (error.message || '').toLowerCase().includes('timeout');

          const rawReason = isTimeout
            ? 'timeout'
            : String(error.code || error.status || error.statusCode || (error.message ? error.message.slice(0, 100) : 'transient_failure'));

          const sanitizedReason = rawReason
            .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
            .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]')
            .slice(0, 100);

          if (isTimeout) {
            logger.warn('gemini.stream.timeout', {
              model: currentModel,
              attempt: attempt + 1,
              chunksEmitted,
            });
            if (ENV.NODE_ENV !== 'test') {
              console.warn(
                `[GeminiService Streaming Timeout]\nmodel=${currentModel}\nattempt=${attempt + 1}\nchunksEmitted=${chunksEmitted}`
              );
            }
          }

          // CRITICAL SAFETY RULE A: If partial output reached the client, NEVER retry or fallback
          if (chunksEmitted > 0) {
            const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
            const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
            recordAITelemetry({ operation, model: currentModel, statusClass, durationMs, isError: true });
            throw normalizeAIError(error, 'streaming');
          }

          const isTransient = isTransientError(error);

          // Retry primary model if transient and retries remain
          if (isTransient && attempt < retriesForCurrentModel) {
            attempt++;
            recordAIRetryTelemetry({ operation, model: currentModel });
            if (ENV.NODE_ENV !== 'test') {
              console.warn(
                `[GeminiService Streaming Retry]\nmodel=${currentModel}\nattempt=${attempt}/${retriesForCurrentModel}\nreason=${sanitizedReason}`
              );
            }
            const jitter = Math.random() * 50;
            const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitter, maxDelayMs);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
          recordAITelemetry({ operation, model: currentModel, statusClass, durationMs, isError: true });

          // If transient and fallback model exists, log structured event and activate fallback
          if (isTransient && modelIdx < modelsToTry.length - 1) {
            const nextModel = modelsToTry[modelIdx + 1];

            logger.warn('gemini.model.fallback', {
              message: 'Primary model unavailable after retries.',
              primary: currentModel,
              fallback: nextModel,
              reason: sanitizedReason,
            });

            if (ENV.NODE_ENV !== 'test') {
              console.warn(
                `[GeminiService Fallback]\nprimary=${currentModel}\nfallback=${nextModel}\nreason=${sanitizedReason}`
              );
            }

            // Break inner loop to move to fallback model in outer loop
            break;
          }

          // Fallback failure logging
          if (isFallback) {
            logger.warn('gemini.fallback.error', {
              fallback: currentModel,
              reason: sanitizedReason,
            });
            if (ENV.NODE_ENV !== 'test') {
              console.warn(
                `[GeminiService Fallback Error]\nfallback=${currentModel}\nreason=${sanitizedReason}`
              );
            }
          }

          // Permanent error or fallback exhausted
          throw normalizeAIError(error, 'streaming');
        }
      }
    }

    return { model: selectedModel };
  }
}

export const geminiService = new GeminiService();
export default geminiService;
