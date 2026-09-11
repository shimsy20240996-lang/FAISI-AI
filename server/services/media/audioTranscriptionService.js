import { GoogleGenAI } from '@google/genai';
import { ENV } from '../../config/env.js';
import { ValidationError, AIProviderError, TimeoutError } from '../../utils/errors.js';
import { validateAudioDuration } from '../../utils/audioDurationParser.js';
import { recordMediaOperation } from '../../utils/metrics.js';

/**
 * Audio Signatures (Magic Bytes)
 */
function detectAudioMimeType(buffer, declaredMime = '') {
  if (!buffer || buffer.length < 4) {
    throw new ValidationError('Audio file is empty or corrupted.');
  }

  // WebM / Matroska: 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }

  // WAV: "RIFF" ... "WAVE"
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }

  // Ogg: "OggS"
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }

  // MP3: ID3 header or frame sync
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return 'audio/mp3';
  }

  // MP4 / M4A: "ftyp" at offset 4
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }

  // Fallback to declared valid audio MIME if signature is valid audio container
  if (declaredMime && declaredMime.startsWith('audio/')) {
    return declaredMime;
  }

  throw new ValidationError(
    'Unsupported or invalid audio format. Supported audio formats include WebM (Opus), WAV, MP3, and MP4/M4A.'
  );
}

/**
 * Audio Transcription Service utilizing gemini-3.5-transcribe
 */
export class AudioTranscriptionService {
  constructor() {
    this.client = null;
    this.modelName = ENV.TRANSCRIPTION_MODEL || 'gemini-3.5-transcribe';
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
   * Validates and transcribes an audio buffer. Discards audio immediately after processing.
   * @param {Buffer} buffer Raw audio buffer
   * @param {string} declaredMime Client-declared MIME type
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(buffer, declaredMime = '') {
    const startHr = process.hrtime.bigint();

    try {
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new ValidationError('Audio recording is empty.');
      }

      // 1. Enforce max audio size (10 MB default)
      const maxBytes = (ENV.MAX_AUDIO_SIZE_MB || 10) * 1024 * 1024;
      if (buffer.length > maxBytes) {
        throw new ValidationError(
          `Audio recording size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds limit of ${ENV.MAX_AUDIO_SIZE_MB} MB.`
        );
      }

      // 2. Validate audio signature
      const mimeType = detectAudioMimeType(buffer, declaredMime);

      // 3. Validate audio duration server-side (max 60 seconds)
      validateAudioDuration(buffer, mimeType, ENV.MAX_AUDIO_DURATION_SECONDS || 60);

      // 4. Prepare inline audio payload
      const base64Audio = buffer.toString('base64');
      const ai = this.getClient();

      const contents = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: 'You are an accurate audio transcription engine. Transcribe the spoken words in the attached audio recording verbatim. Return ONLY the transcribed text without conversational commentary, preambles, or markdown formatting.',
            },
          ],
        },
      ];

      const generatePromise = ai.models.generateContent({
        model: this.modelName,
        contents,
      });

      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new TimeoutError('Audio transcription timed out after 20 seconds.'));
        }, 20000);
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      clearTimeout(timeoutHandle);

      const candidate = response?.candidates?.[0];
      const text =
        response?.text ||
        candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ') ||
        '';

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordMediaOperation({ operation: 'transcription', outcome: 'success', durationMs });

      return text.trim();
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const outcome = error instanceof ValidationError ? 'rejected' : 'failed';
      recordMediaOperation({ operation: 'transcription', outcome, durationMs });

      if (error instanceof TimeoutError || error instanceof ValidationError || error instanceof AIProviderError) {
        throw error;
      }

      const errorMessage = error.message || 'Unknown upstream transcription error';
      console.error('🔴 [AudioTranscriptionService Error]:', errorMessage);

      if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
        throw new AIProviderError(
          'Transcription service quota exceeded. Please try again shortly.',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
      }

      throw new AIProviderError(
        `Audio transcription failed: ${errorMessage}`,
        502,
        'TRANSCRIPTION_ERROR'
      );
    }
  }
}

export const audioTranscriptionService = new AudioTranscriptionService();
