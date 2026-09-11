import { imageValidationService } from '../services/media/imageValidationService.js';
import { audioTranscriptionService } from '../services/media/audioTranscriptionService.js';
import { speechSynthesisService } from '../services/media/speechSynthesisService.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';
import { ENV } from '../config/env.js';

/**
 * Upload and validate image attachments controller.
 * Saves validated image files to user-isolated media storage and returns opaque metadata references.
 */
export async function handleUploadImages(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required to upload images.');
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (!Array.isArray(files) || files.length === 0) {
      throw new ValidationError('No image files were uploaded.');
    }

    const maxImages = ENV.MAX_IMAGES_PER_MESSAGE || 3;
    if (files.length > maxImages) {
      throw new ValidationError(`You can upload at most ${maxImages} images per message.`);
    }

    const attachments = [];
    for (const file of files) {
      const attachment = await imageValidationService.processAndStoreImage(
        userId,
        file.buffer,
        file.originalname,
        file.mimetype
      );
      attachments.push(attachment);
    }

    res.status(201).json({
      success: true,
      count: attachments.length,
      attachments,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves a user-owned image media file by its opaque storage reference
 */
export async function handleGetImageMedia(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required to access media.');
    }

    const { storageReference } = req.params;
    const { buffer, mimeType } = await imageValidationService.getImageBuffer(userId, storageReference);

    res.set({
      'Content-Type': mimeType,
      'Content-Length': buffer.length,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });

    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Transcribes audio recording into editable text using gemini-3.5-transcribe
 */
export async function handleTranscribeAudio(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required to transcribe audio.');
    }

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ValidationError('No audio recording provided for transcription.');
    }

    const text = await audioTranscriptionService.transcribeAudio(file.buffer, file.mimetype);

    res.status(200).json({
      success: true,
      text,
      language: 'auto',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Synthesizes text into speech using gemini-3.1-flash-tts-preview with bounded caching
 */
export async function handleSynthesizeSpeech(req, res, next) {
  try {
    const userId = req.user?.id || 'anonymous';
    const { text, voice } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new ValidationError('Text is required for speech synthesis.');
    }

    const { buffer, mimeType, fromCache } = await speechSynthesisService.synthesizeSpeech({
      userId,
      text,
      voice,
    });

    res.set({
      'Content-Type': mimeType,
      'Content-Length': buffer.length,
      'X-Cache-Hit': fromCache ? 'HIT' : 'MISS',
      'Cache-Control': 'private, max-age=1800',
    });

    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}
