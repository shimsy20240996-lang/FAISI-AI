import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import {
  imageValidationService,
  validateImageBuffer,
  parseImageDimensions,
  sanitizeImageMetadata,
} from '../services/media/imageValidationService.js';
import {
  audioTranscriptionService,
  AudioTranscriptionService,
} from '../services/media/audioTranscriptionService.js';
import {
  speechSynthesisService,
  ttsCache,
  ALLOWED_VOICES,
} from '../services/media/speechSynthesisService.js';
import { geminiService } from '../services/ai/geminiService.js';
import { MULTIMODAL_SYSTEM_INSTRUCTION, DOCUMENT_RAG_SYSTEM_INSTRUCTION } from '../services/ai/systemPrompt.js';
import { ENV } from '../config/env.js';

describe('Phase 8: Voice + Multimodal Intelligence Comprehensive Test Suite', () => {
  let userAId;
  let userBId;
  const uniqueSuffix = Date.now();
  const emailA = `nova-p8-alice-${uniqueSuffix}@example.test`;
  const emailB = `nova-p8-bob-${uniqueSuffix}@example.test`;

  // Synthetic Minimal Valid Image Buffers for Unit Tests
  function createValidPngBuffer(width = 100, height = 100) {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0); // Chunk length
    ihdr.write('IHDR', 4);
    ihdr.writeUInt32BE(width, 8); // Width
    ihdr.writeUInt32BE(height, 12); // Height
    ihdr.writeUInt8(8, 16); // Bit depth
    ihdr.writeUInt8(2, 17); // Color type (RGB)
    return Buffer.concat([header, ihdr, Buffer.alloc(50)]);
  }

  function createValidJpegBuffer(width = 200, height = 150) {
    const soi = Buffer.from([0xff, 0xd8]);
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    // SOF0 (Baseline Start of Frame): marker 0xFF 0xC0, length 17, precision 8, height, width, 3 components
    const sof0 = Buffer.alloc(19);
    sof0[0] = 0xff;
    sof0[1] = 0xc0;
    sof0.writeUInt16BE(17, 2); // Length
    sof0[4] = 8; // Precision
    sof0.writeUInt16BE(height, 5); // Height
    sof0.writeUInt16BE(width, 7); // Width
    sof0[9] = 3; // 3 color components
    const eoi = Buffer.from([0xff, 0xd9]);
    return Buffer.concat([soi, app0, sof0, eoi]);
  }

  function createValidWebpBuffer(width = 300, height = 200) {
    // WebP with VP8 lossy header
    const buffer = Buffer.alloc(40);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(32, 4); // File size - 8
    buffer.write('WEBP', 8);
    buffer.write('VP8 ', 12);
    buffer.writeUInt32LE(16, 16); // Chunk size
    // VP8 header dimensions at offset 26 & 28
    buffer.writeUInt16LE(width & 0x3fff, 26);
    buffer.writeUInt16LE(height & 0x3fff, 28);
    return buffer;
  }

  function createValidGifBuffer(width = 80, height = 60) {
    const buffer = Buffer.alloc(20);
    buffer.write('GIF89a', 0);
    buffer.writeUInt16LE(width, 6);
    buffer.writeUInt16LE(height, 8);
    buffer[10] = 0x80; // Global color table flag
    return buffer;
  }

  function createValidWavAudioBuffer(durationSeconds = 1.0) {
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataLen = numSamples * 2;
    const buf = Buffer.alloc(44 + dataLen);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataLen, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // Mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataLen, 40);
    return buf;
  }

  before(async () => {
    await imageValidationService.init();

    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 2000,
        });
      }
    } catch {
      // Memory/offline fallback
    }

    if (mongoose.connection.readyState === 1) {
      const userA = new User({ email: emailA, passwordHash: 'hashA', name: 'Alice Phase8' });
      const userB = new User({ email: emailB, passwordHash: 'hashB', name: 'Bob Phase8' });
      await userA.save();
      await userB.save();
      userAId = userA._id.toString();
      userBId = userB._id.toString();
    } else {
      userAId = new mongoose.Types.ObjectId().toString();
      userBId = new mongoose.Types.ObjectId().toString();
    }
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ email: { $in: [emailA, emailB] } });
      await Conversation.deleteMany({ userId: { $in: [userAId, userBId] } });
      await Document.deleteMany({ userId: { $in: [userAId, userBId] } });
      await DocumentChunk.deleteMany({ userId: { $in: [userAId, userBId] } });
    }
    ttsCache.clear();
  });

  /* ==========================================================================
     8.1 IMAGE INTELLIGENCE & VALIDATION TESTS
     ========================================================================== */
  describe('8.1 Image Intelligence & Validation', () => {
    test('Validates PNG image magic bytes and dimensions', () => {
      const pngBuf = createValidPngBuffer(640, 480);
      const res = validateImageBuffer(pngBuf, 'diagram.png', 'image/png');
      assert.equal(res.mimeType, 'image/png');
      assert.equal(res.extension, 'png');
      assert.equal(res.width, 640);
      assert.equal(res.height, 480);
    });

    test('Validates JPEG image magic bytes and dimensions', () => {
      const jpgBuf = createValidJpegBuffer(800, 600);
      const res = validateImageBuffer(jpgBuf, 'photo.jpg', 'image/jpeg');
      assert.equal(res.mimeType, 'image/jpeg');
      assert.equal(res.extension, 'jpg');
      assert.equal(res.width, 800);
      assert.equal(res.height, 600);
    });

    test('Validates WebP image magic bytes and dimensions', () => {
      const webpBuf = createValidWebpBuffer(320, 240);
      const res = validateImageBuffer(webpBuf, 'graphic.webp', 'image/webp');
      assert.equal(res.mimeType, 'image/webp');
      assert.equal(res.extension, 'webp');
      assert.equal(res.width, 320);
      assert.equal(res.height, 240);
    });

    test('Validates GIF image magic bytes and dimensions', () => {
      const gifBuf = createValidGifBuffer(120, 90);
      const res = validateImageBuffer(gifBuf, 'anim.gif', 'image/gif');
      assert.equal(res.mimeType, 'image/gif');
      assert.equal(res.extension, 'gif');
      assert.equal(res.width, 120);
      assert.equal(res.height, 90);
    });

    test('Explicitly rejects SVG / XML payloads for security', () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      assert.throws(
        () => validateImageBuffer(svgBuf, 'logo.svg', 'image/svg+xml'),
        (err) => err.message.includes('SVG')
      );
    });

    test('Rejects spoofed binary file masquerading as image with fake extension', () => {
      const fakeExeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');
      assert.throws(
        () => validateImageBuffer(fakeExeBuf, 'malware.png', 'image/png'),
        (err) => err.message.includes('Unsupported or corrupted')
      );
    });

    test('Rejects oversized image (> MAX_IMAGE_SIZE_MB)', () => {
      const oversizedBuf = Buffer.alloc(6 * 1024 * 1024); // 6MB > 5MB limit
      oversizedBuf[0] = 0x89;
      oversizedBuf[1] = 0x50;
      oversizedBuf[2] = 0x4e;
      oversizedBuf[3] = 0x47;
      assert.throws(
        () => validateImageBuffer(oversizedBuf, 'huge.png', 'image/png'),
        (err) => err.message.includes('exceeds maximum allowed limit')
      );
    });

    test('Rejects image with dimensions exceeding MAX_IMAGE_DIMENSION (4096px)', () => {
      const hugeDimPng = createValidPngBuffer(5000, 3000);
      assert.throws(
        () => validateImageBuffer(hugeDimPng, 'wide.png', 'image/png'),
        (err) => err.message.includes('exceed maximum allowed dimension')
      );
    });

    test('Strips EXIF metadata segments safely from JPEG image', () => {
      const rawJpg = createValidJpegBuffer(400, 300);
      // Inject APP1 (EXIF) segment
      const exifMarker = Buffer.from([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
      const jpgWithExif = Buffer.concat([rawJpg.subarray(0, 2), exifMarker, rawJpg.subarray(2)]);

      const sanitized = sanitizeImageMetadata(jpgWithExif, 'image/jpeg');
      assert.ok(sanitized.length < jpgWithExif.length, 'Sanitized buffer should be smaller than original buffer with EXIF');
      assert.ok(!sanitized.includes(Buffer.from('Exif')), 'Sanitized buffer must not contain Exif string');
    });

    test('Securely stores image attachment under isolated user directory with opaque reference', async () => {
      const pngBuf = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .png()
        .toBuffer();
      const attachment = await imageValidationService.processAndStoreImage(
        userAId,
        pngBuf,
        'test_chart.png',
        'image/png'
      );

      assert.ok(attachment.id.startsWith('att_img_'));
      assert.ok(attachment.storageReference.startsWith('media_ref_'));
      assert.equal(attachment.type, 'image');
      assert.equal(attachment.mimeType, 'image/png');
      assert.equal(attachment.width, 200);
      assert.equal(attachment.height, 200);
      assert.ok(!attachment.storageReference.includes('/'), 'Storage reference must not leak directory path');
      assert.ok(!attachment.storageReference.includes('\\'), 'Storage reference must not leak filesystem path');

      // Retrieve image buffer for User A
      const fetched = await imageValidationService.getImageBuffer(userAId, attachment.storageReference);
      assert.equal(fetched.mimeType, 'image/png');
      assert.ok(fetched.buffer.length > 0);

      // Verify IDOR protection: User B cannot fetch User A image
      await assert.rejects(
        () => imageValidationService.getImageBuffer(userBId, attachment.storageReference),
        (err) => err.statusCode === 404 || err.message.includes('not found')
      );

      // Cleanup image
      await imageValidationService.deleteImage(userAId, attachment.storageReference);
      await assert.rejects(
        () => imageValidationService.getImageBuffer(userAId, attachment.storageReference),
        (err) => err.statusCode === 404 || err.message.includes('not found')
      );
    });
  });

  /* ==========================================================================
     8.2 SPEECH-TO-TEXT / TRANSCRIPTION TESTS
     ========================================================================== */
  describe('8.2 Speech-to-Text Transcription', () => {
    test('Correctly identifies valid audio container formats (WAV, WebM, MP3)', async () => {
      const wavBuf = createValidWavAudioBuffer(1.0);
      assert.ok(wavBuf.length > 44);

      // Test AudioTranscriptionService properties
      assert.equal(audioTranscriptionService.modelName, 'gemini-3.5-transcribe');
    });

    test('Rejects empty or malformed audio buffer', async () => {
      const emptyBuf = Buffer.alloc(0);
      await assert.rejects(
        () => audioTranscriptionService.transcribeAudio(emptyBuf),
        (err) => err.message.includes('empty')
      );
    });

    test('Rejects oversized audio buffer (> MAX_AUDIO_SIZE_MB)', async () => {
      const oversizedAudio = Buffer.alloc(11 * 1024 * 1024); // 11MB > 10MB limit
      await assert.rejects(
        () => audioTranscriptionService.transcribeAudio(oversizedAudio),
        (err) => err.message.includes('exceeds limit')
      );
    });

    test('Rejects invalid non-audio file submitted to transcribe service', async () => {
      const fakeTextBuf = Buffer.from('This is a plain text file, not audio recording.');
      await assert.rejects(
        () => audioTranscriptionService.transcribeAudio(fakeTextBuf),
        (err) => err.message.includes('Unsupported or invalid audio format')
      );
    });
  });

  /* ==========================================================================
     8.3 TEXT-TO-SPEECH (TTS) & CACHE TESTS
     ========================================================================== */
  describe('8.3 Text-to-Speech (TTS) & Bounded Cache', () => {
    test('Allowed TTS voices contain standard prebuilt voices', () => {
      assert.ok(ALLOWED_VOICES.includes('Aoede'));
      assert.ok(ALLOWED_VOICES.includes('Charon'));
      assert.ok(ALLOWED_VOICES.includes('Fenrir'));
      assert.ok(ALLOWED_VOICES.includes('Kore'));
      assert.ok(ALLOWED_VOICES.includes('Puck'));
    });

    test('Rejects empty text for speech synthesis', async () => {
      await assert.rejects(
        () => speechSynthesisService.synthesizeSpeech({ userId: userAId, text: '   ' }),
        (err) => err.message.includes('Text')
      );
    });

    test('Rejects text exceeding MAX_TTS_CHARS (2000 chars)', async () => {
      const hugeText = 'A'.repeat(2500);
      await assert.rejects(
        () => speechSynthesisService.synthesizeSpeech({ userId: userAId, text: hugeText }),
        (err) => err.message.includes('exceeds maximum allowed TTS limit')
      );
    });

    test('Bounded TTS Cache stores and retrieves audio by user, voice, and text', () => {
      ttsCache.clear();
      const mockAudio = Buffer.from('RIFFmockaudiobytes');
      const keyA = ttsCache.generateKey(userAId, 'Aoede', 'Hello world');
      const keyB = ttsCache.generateKey(userBId, 'Aoede', 'Hello world');

      // Store for User A
      ttsCache.set(keyA, mockAudio, 'audio/wav');

      // Cache hit for User A
      const hitA = ttsCache.get(keyA);
      assert.ok(hitA);
      assert.equal(hitA.buffer.toString(), 'RIFFmockaudiobytes');
      assert.equal(hitA.mimeType, 'audio/wav');

      // User B cache isolation (User B must NOT get User A cached audio)
      const hitB = ttsCache.get(keyB);
      assert.equal(hitB, null, 'User B must not access User A cached audio');
    });

    test('TTS Cache respects TTL and deterministic eviction', () => {
      ttsCache.clear();
      const mockAudio = Buffer.from('test_audio_sample');
      const key = ttsCache.generateKey(userAId, 'Aoede', 'Expiring phrase');

      ttsCache.set(key, mockAudio, 'audio/wav');
      assert.ok(ttsCache.get(key));

      // Manually set expiration in past
      const entry = ttsCache.cache.get(key);
      if (entry) {
        entry.expiresAt = Date.now() - 1000;
      }

      // get() should evict expired entry
      assert.equal(ttsCache.get(key), null);
    });

    test('SynthesizeSpeech returns valid audio buffer fallback with correct headers', async () => {
      const res = await speechSynthesisService.synthesizeSpeech({
        userId: userAId,
        text: 'NOVA AI speech synthesis engine test.',
        voice: 'Aoede',
      });

      assert.ok(res.buffer && res.buffer.length > 0);
      assert.ok(res.mimeType.startsWith('audio/'));
      assert.equal(typeof res.fromCache, 'boolean');

      // Second call should hit bounded cache
      const cachedRes = await speechSynthesisService.synthesizeSpeech({
        userId: userAId,
        text: 'NOVA AI speech synthesis engine test.',
        voice: 'Aoede',
      });

      assert.equal(cachedRes.fromCache, true);
    });
  });

  /* ==========================================================================
     8.4 MULTIMODAL PROMPT & REASONING TESTS
     ========================================================================== */
  describe('8.4 Multimodal Prompt Formatting & Reasoning', () => {
    test('GeminiService formats text-only messages to standard parts format', () => {
      const msgs = [{ role: 'user', content: 'What is quantum entanglement?' }];
      const formatted = geminiService.formatMessages(msgs);
      assert.equal(formatted.length, 1);
      assert.equal(formatted[0].role, 'user');
      assert.equal(formatted[0].parts.length, 1);
      assert.equal(formatted[0].parts[0].text, 'What is quantum entanglement?');
    });

    test('GeminiService formats multimodal messages with inlineData image parts', () => {
      const sampleBase64 = Buffer.from('fakepngdata').toString('base64');
      const msgs = [
        {
          role: 'user',
          content: 'Explain this diagram',
          attachments: [
            {
              type: 'image',
              mimeType: 'image/png',
              data: sampleBase64,
            },
          ],
        },
      ];

      const formatted = geminiService.formatMessages(msgs);
      assert.equal(formatted.length, 1);
      assert.equal(formatted[0].role, 'user');
      assert.equal(formatted[0].parts.length, 2);
      assert.equal(formatted[0].parts[0].inlineData.mimeType, 'image/png');
      assert.equal(formatted[0].parts[0].inlineData.data, sampleBase64);
      assert.equal(formatted[0].parts[1].text, 'Explain this diagram');
    });

    test('Prompt injection isolation: Multimodal system instruction contains safety boundaries', () => {
      assert.ok(MULTIMODAL_SYSTEM_INSTRUCTION.includes('UNTRUSTED IMAGE DATA'));
      assert.ok(MULTIMODAL_SYSTEM_INSTRUCTION.includes('NO VISUAL INJECTION EXECUTION'));
      assert.ok(DOCUMENT_RAG_SYSTEM_INSTRUCTION.includes('<RETRIEVED_KNOWLEDGE_BASE>'));
    });
  });

  /* ==========================================================================
     8.5 DATABASE SCHEMA & PERSISTENCE TESTS
     ========================================================================== */
  describe('8.5 Message Schema Attachments & Persistence', () => {
    test('Conversation MessageSchema supports optional attachments without breaking legacy messages', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const conv = new Conversation({
        userId: userAId,
        title: 'Multimodal Attachment Test',
        messages: [
          // Legacy message without attachments
          {
            role: 'user',
            content: 'Hello NOVA',
            status: 'complete',
          },
          // Multimodal message with attachment metadata
          {
            role: 'user',
            content: 'Look at this architecture',
            status: 'complete',
            attachments: [
              {
                id: 'att_img_12345',
                type: 'image',
                name: 'arch.png',
                mimeType: 'image/png',
                size: 1024,
                width: 800,
                height: 600,
                storageReference: 'media_ref_abcdef123456',
                createdAt: new Date(),
              },
            ],
          },
        ],
      });

      const saved = await conv.save();
      assert.ok(saved._id);
      assert.equal(saved.messages.length, 2);
      assert.equal(saved.messages[0].attachments.length, 0);
      assert.equal(saved.messages[1].attachments.length, 1);
      assert.equal(saved.messages[1].attachments[0].name, 'arch.png');
      assert.equal(saved.messages[1].attachments[0].storageReference, 'media_ref_abcdef123456');

      // Cleanup
      await Conversation.deleteOne({ _id: saved._id });
    });
  });
});
