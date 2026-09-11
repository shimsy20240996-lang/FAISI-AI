import express from 'express';
import multer from 'multer';
import {
  handleUploadImages,
  handleGetImageMedia,
  handleTranscribeAudio,
  handleSynthesizeSpeech,
} from '../controllers/mediaController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequestOrigin } from '../middleware/csrfProtection.js';
import {
  imageUploadRateLimiter,
  transcribeRateLimiter,
  ttsRateLimiter,
} from '../middleware/rateLimiter.js';
import { uploadConcurrencyGuard } from '../middleware/uploadConcurrencyLimiter.js';
import { ENV } from '../config/env.js';

const router = express.Router();

// Multer memory storage configuration for images (max 5 MB, max 3 files)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (ENV.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024,
    files: ENV.MAX_IMAGES_PER_MESSAGE || 3,
  },
});

// Multer memory storage configuration for audio (max 10 MB, 1 file)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (ENV.MAX_AUDIO_SIZE_MB || 10) * 1024 * 1024,
    files: 1,
  },
});

/**
 * Middleware handling image upload errors
 */
function handleImageUpload(req, res, next) {
  const handler = imageUpload.array('images', ENV.MAX_IMAGES_PER_MESSAGE || 3);
  handler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Image exceeds maximum allowed size of ${ENV.MAX_IMAGE_SIZE_MB || 5} MB.`,
            },
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'TOO_MANY_FILES',
              message: `You can upload at most ${ENV.MAX_IMAGES_PER_MESSAGE || 3} images per message.`,
            },
          });
        }
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: err.message || 'Image upload failed.',
        },
      });
    }
    next();
  });
}

/**
 * Middleware handling audio upload errors
 */
function handleAudioUpload(req, res, next) {
  const handler = audioUpload.single('audio');
  handler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'AUDIO_TOO_LARGE',
              message: `Audio file exceeds maximum allowed size of ${ENV.MAX_AUDIO_SIZE_MB || 10} MB.`,
            },
          });
        }
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUDIO_UPLOAD_ERROR',
          message: err.message || 'Audio upload failed.',
        },
      });
    }
    next();
  });
}

// 1. Image Upload
router.post(
  '/images',
  imageUploadRateLimiter,
  validateRequestOrigin,
  authenticate,
  uploadConcurrencyGuard,
  handleImageUpload,
  handleUploadImages
);

// 2. Image Media Fetching
router.get(
  '/images/:storageReference',
  authenticate,
  handleGetImageMedia
);

// 3. Audio Transcription (STT)
router.post(
  '/transcribe',
  transcribeRateLimiter,
  validateRequestOrigin,
  authenticate,
  uploadConcurrencyGuard,
  handleAudioUpload,
  handleTranscribeAudio
);

// 4. Speech Synthesis (TTS)
router.post(
  '/tts',
  ttsRateLimiter,
  validateRequestOrigin,
  authenticate,
  express.json(),
  handleSynthesizeSpeech
);

export default router;
