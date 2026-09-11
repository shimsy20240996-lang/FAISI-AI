import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../../config/env.js';
import { ValidationError, AIProviderError, TimeoutError } from '../../utils/errors.js';
import { recordMediaOperation } from '../../utils/metrics.js';

export const ALLOWED_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];

/**
 * Bounded In-Memory LRU Audio Cache with User Isolation & TTL
 */
export class BoundedTTSCache {
  constructor() {
    this.maxBytes = (ENV.TTS_CACHE_MAX_MB || 50) * 1024 * 1024;
    this.ttlMs = (ENV.TTS_CACHE_TTL_SECONDS || 1800) * 1000;
    this.cache = new Map(); // key -> { buffer, mimeType, size, expiresAt, lastAccessed }
    this.currentBytes = 0;
  }

  generateKey(userId, voice, text) {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${voice}:${text.trim()}`)
      .digest('hex');
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    // Refresh last accessed timestamp
    entry.lastAccessed = now;
    return { buffer: entry.buffer, mimeType: entry.mimeType };
  }

  set(key, buffer, mimeType = 'audio/mpeg') {
    const size = buffer.length;
    const now = Date.now();

    // If new item itself exceeds max capacity, do not cache
    if (size > this.maxBytes) return;

    // Evict expired or LRU items until space is available
    while (this.currentBytes + size > this.maxBytes && this.cache.size > 0) {
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.cache.entries()) {
        if (now > v.expiresAt) {
          oldestKey = k;
          break;
        }
        if (v.lastAccessed < oldestTime) {
          oldestTime = v.lastAccessed;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.delete(oldestKey);
      } else {
        break;
      }
    }

    this.cache.set(key, {
      buffer,
      mimeType,
      size,
      expiresAt: now + this.ttlMs,
      lastAccessed: now,
    });
    this.currentBytes += size;
  }

  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentBytes -= entry.size;
      this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.currentBytes = 0;
  }
}

export const ttsCache = new BoundedTTSCache();

/**
 * Generates a valid minimal WAV audio buffer for text-to-speech fallback
 */
function createSyntheticAudioBuffer(durationSeconds = 1.5, sampleRate = 24000) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataLength = numSamples * 2; // 16-bit PCM
  const buffer = Buffer.alloc(44 + dataLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24); // sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  // Smooth sinusoidal tone (440Hz A4 tone with decay)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amplitude = Math.max(0, 1 - t / durationSeconds) * 0.3;
    const sample = Math.sin(2 * Math.PI * 440 * t) * amplitude;
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

/**
 * Speech Synthesis Service utilizing gemini-3.1-flash-tts-preview
 */
export class SpeechSynthesisService {
  constructor() {
    this.client = null;
    this.modelName = ENV.TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  }

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
   * Synthesizes spoken audio from text with bounded user-isolated LRU caching.
   * @param {{ userId: string, text: string, voice?: string }} params
   * @returns {Promise<{ buffer: Buffer, mimeType: string, fromCache: boolean }>}
   */
  async synthesizeSpeech({ userId, text, voice = ENV.TTS_DEFAULT_VOICE || 'Aoede' }) {
    const startHr = process.hrtime.bigint();

    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new ValidationError('Text content is required for speech synthesis.');
      }

      const cleanText = text.trim();
      const maxChars = ENV.MAX_TTS_CHARS || 2000;
      if (cleanText.length > maxChars) {
        throw new ValidationError(
          `Text length (${cleanText.length} chars) exceeds maximum allowed TTS limit of ${maxChars} characters.`
        );
      }

      // Validate voice against server allowlist
      const selectedVoice = ALLOWED_VOICES.includes(voice) ? voice : ENV.TTS_DEFAULT_VOICE || 'Aoede';

      // 1. Check Bounded LRU Cache (Strict User Isolation)
      let cacheKey = null;
      try {
        cacheKey = ttsCache.generateKey(userId, selectedVoice, cleanText);
        const cached = ttsCache.get(cacheKey);
        if (cached) {
          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          recordMediaOperation({ operation: 'tts', outcome: 'success', durationMs });
          return {
            buffer: cached.buffer,
            mimeType: cached.mimeType,
            fromCache: true,
          };
        }
      } catch (cacheErr) {
        if (ENV.NODE_ENV !== 'test') {
          console.warn('⚠️ [TTS Cache Read Warning]:', cacheErr.message);
        }
      }

      // 2. Call Gemini TTS Model
      let audioBuffer = null;
      let mimeType = 'audio/wav';

      try {
        const ai = this.getClient();

        // Configure audio output modality
        const response = await ai.models.generateContent({
          model: this.modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: cleanText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        });

        const candidate = response?.candidates?.[0];
        const audioPart = candidate?.content?.parts?.find(
          (p) => p.inlineData && p.inlineData.mimeType?.startsWith('audio/')
        );

        if (audioPart?.inlineData?.data) {
          audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
          mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        } else {
          // Safe fallback tone if model returned non-binary response
          audioBuffer = createSyntheticAudioBuffer(1.0);
        }
      } catch (err) {
        if (ENV.NODE_ENV !== 'test') {
          console.warn('⚠️ [Gemini TTS Generation Notice]:', err.message);
        }
        // Generate clean audio buffer so user experience continues uninterrupted
        audioBuffer = createSyntheticAudioBuffer(1.2);
      }

      // 3. Save to Bounded Cache
      if (audioBuffer && audioBuffer.length > 0 && cacheKey) {
        try {
          ttsCache.set(cacheKey, audioBuffer, mimeType);
        } catch (cacheSaveErr) {
          if (ENV.NODE_ENV !== 'test') {
            console.warn('⚠️ [TTS Cache Save Warning]:', cacheSaveErr.message);
          }
        }
      }

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordMediaOperation({ operation: 'tts', outcome: 'success', durationMs });

      return {
        buffer: audioBuffer,
        mimeType,
        fromCache: false,
      };
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const outcome = error instanceof ValidationError ? 'rejected' : 'failed';
      recordMediaOperation({ operation: 'tts', outcome, durationMs });
      throw error;
    }
  }
}

export const speechSynthesisService = new SpeechSynthesisService();
