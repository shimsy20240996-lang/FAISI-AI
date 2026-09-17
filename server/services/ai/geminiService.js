import { GoogleGenAI } from '@google/genai';
import { ENV } from '../../config/env.js';
import { AIProviderError, TimeoutError } from '../../utils/errors.js';
import { NOVA_SYSTEM_INSTRUCTION } from './systemPrompt.js';
import { recordAITelemetry, recordAIRetryTelemetry, normalizeStatusClass } from '../../utils/metrics.js';

/**
 * Checks whether an error is transient (e.g. rate limit, temporary network failure, 503 unavailable)
 */
export function isTransientError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || error.status || error.statusCode;

  if (code === 429 || code === 503 || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
    return true;
  }
  if (
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  ) {
    return true;
  }
  return false;
}

/**
 * Executes an async operation with bounded exponential backoff and jitter for transient errors.
 */
export async function executeWithTransientRetry(
  fn,
  { maxRetries = 2, baseDelayMs = 300, maxDelayMs = 1500, onRetry } = {}
) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
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
    const configuredModel = ENV.GEMINI_MODEL || 'gemini-3.6-flash';
    // If configured with legacy discontinued gemini-2.5-flash, upgrade to active gemini-3.6-flash
    this.modelName = configuredModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : configuredModel;
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
   * Generates a non-streaming response from Google Gemini model with timeout protection and transient retry.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string }>}
   */
  async generateResponse({ messages, systemInstruction = NOVA_SYSTEM_INSTRUCTION }) {
    const startHr = process.hrtime.bigint();
    const operation = 'chat';
    const model = this.modelName;

    try {
      const result = await executeWithTransientRetry(
        async () => {
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
              model: this.modelName,
              contents,
              config: {
                systemInstruction,
              },
            });

            const response = await Promise.race([generatePromise, timeoutPromise]);
            clearTimeout(timeoutHandle);

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
            };
          } catch (error) {
            clearTimeout(timeoutHandle);

            if (error instanceof TimeoutError || error instanceof AIProviderError) {
              throw error;
            }

            const errorMessage = error.message || 'Unknown upstream AI error';
            const sanitizedMsg = errorMessage.replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]');
            if (ENV.NODE_ENV !== 'test') {
              console.error('🔴 [GeminiService Error]:', sanitizedMsg);
            }

            if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('invalid api key')) {
              throw new AIProviderError(
                'The configured Gemini API key is invalid. Please check your server environment configuration.',
                502,
                'INVALID_API_KEY'
              );
            }

            if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
              throw new AIProviderError(
                'Gemini API rate limit or quota exceeded. Please wait a moment and try again.',
                429,
                'RATE_LIMIT_EXCEEDED'
              );
            }

            throw new AIProviderError(
              'Upstream AI service encountered an error while processing your request.',
              502,
              'UPSTREAM_SERVICE_ERROR'
            );
          }
        },
        {
          onRetry: () => recordAIRetryTelemetry({ operation, model }),
        }
      );

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordAITelemetry({ operation, model, statusClass: '2xx', durationMs, isError: false });
      return result;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
      recordAITelemetry({ operation, model, statusClass, durationMs, isError: true });
      throw error;
    }
  }

  /**
   * Analyzes an uploaded document with prompt-injection defenses, bounded context, and transient retry.
   * @param {{
   *   documentText: string,
   *   fileName: string,
   *   instruction?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async analyzeDocument({ documentText, fileName, instruction = 'Please provide a comprehensive summary and key takeaways of this document.' }) {
    const startHr = process.hrtime.bigint();
    const operation = 'document_analysis';
    const model = this.modelName;

    try {
      const result = await executeWithTransientRetry(
        async () => {
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
              model: this.modelName,
              contents,
              config: {
                systemInstruction: 'You are an expert document analysis AI. Analyze the document objectively based strictly on the provided content.',
              },
            });

            const response = await Promise.race([generatePromise, timeoutPromise]);
            clearTimeout(timeoutHandle);

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
              model: this.modelName,
            };
          } catch (error) {
            clearTimeout(timeoutHandle);

            if (error instanceof TimeoutError || error instanceof AIProviderError) {
              throw error;
            }

            const errorMessage = error.message || 'Unknown upstream AI error';
            const sanitizedMsg = errorMessage.replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]');
            if (ENV.NODE_ENV !== 'test') {
              console.error('🔴 [GeminiService Document Analysis Error]:', sanitizedMsg);
            }

            if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('invalid api key')) {
              throw new AIProviderError(
                'The configured Gemini API key is invalid. Please check your server environment configuration.',
                502,
                'INVALID_API_KEY'
              );
            }

            if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
              throw new AIProviderError(
                'Gemini API rate limit or quota exceeded. Please wait a moment and try again.',
                429,
                'RATE_LIMIT_EXCEEDED'
              );
            }

            throw new AIProviderError(
              'Upstream AI service encountered an error while analyzing document.',
              502,
              'UPSTREAM_SERVICE_ERROR'
            );
          }
        },
        {
          onRetry: () => recordAIRetryTelemetry({ operation, model }),
        }
      );

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordAITelemetry({ operation, model, statusClass: '2xx', durationMs, isError: false });
      return result;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
      recordAITelemetry({ operation, model, statusClass, durationMs, isError: true });
      throw error;
    }
  }

  /**
   * Generates a progressive streaming response using Google Gemini generateContentStream.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   onChunk: (text: string) => void,
   *   signal?: AbortSignal,
   * }} params
   * @returns {Promise<void>}
   */
  async streamResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    onChunk,
    signal,
  }) {
    const startHr = process.hrtime.bigint();
    const operation = 'chat_stream';
    const model = this.modelName;

    const ai = this.getClient();
    const contents = this.formatMessages(messages);

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new TimeoutError('Gemini API streaming timed out.'));
      }, ENV.AI_STREAM_TIMEOUT_MS);
    });

    try {
      if (signal?.aborted) return;

      const responseStream = await executeWithTransientRetry(
        async () => {
          return await Promise.race([
            ai.models.generateContentStream({
              model: this.modelName,
              contents,
              config: {
                systemInstruction,
              },
            }),
            timeoutPromise,
          ]);
        },
        {
          maxRetries: 2,
          baseDelayMs: 500,
          maxDelayMs: 2000,
          onRetry: () => recordAIRetryTelemetry({ operation, model }),
        }
      );

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          break;
        }

        const candidate = chunk?.candidates?.[0];
        const text =
          chunk?.text ||
          candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
          '';

        if (text) {
          onChunk(text);
        }
      }

      clearTimeout(timeoutHandle);

      if (!signal?.aborted) {
        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        recordAITelemetry({ operation, model, statusClass: '2xx', durationMs, isError: false });
      }
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (signal?.aborted) {
        // Normal client cancellation, silently stop
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const statusClass = normalizeStatusClass(error.statusCode || error.status || 500);
      recordAITelemetry({ operation, model, statusClass, durationMs, isError: true });

      if (error instanceof TimeoutError || error instanceof AIProviderError) {
        throw error;
      }

      const errorMessage = error.message || 'Unknown upstream streaming error';
      const sanitizedMsg = errorMessage.replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]');
      if (ENV.NODE_ENV !== 'test') {
        console.error('🔴 [GeminiService Streaming Error]:', sanitizedMsg);
      }

      if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('invalid api key')) {
        throw new AIProviderError(
          'The configured Gemini API key is invalid. Please check your server environment configuration.',
          502,
          'INVALID_API_KEY'
        );
      }

      if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
        throw new AIProviderError(
          'Gemini API rate limit or quota exceeded. Please wait a moment and try again.',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
      }

      throw new AIProviderError(
        'Upstream AI service encountered an error while streaming response.',
        502,
        'UPSTREAM_SERVICE_ERROR'
      );
    }
  }
}

export const geminiService = new GeminiService();
export default geminiService;

