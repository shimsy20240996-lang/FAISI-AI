import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ENV } from '../../config/env.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { recordMediaOperation } from '../../utils/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Image Signature Constants (Magic Bytes)
 */
const SIGNATURES = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  GIF87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  GIF89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
};

/**
 * Checks if buffer starts with given byte sequence
 */
function bufferStartsWith(buffer, sequence) {
  if (!buffer || buffer.length < sequence.length) return false;
  for (let i = 0; i < sequence.length; i++) {
    if (buffer[i] !== sequence[i]) return false;
  }
  return true;
}

/**
 * Checks if buffer is WebP (RIFF....WEBP)
 */
function isWebP(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  return riff === 'RIFF' && webp === 'WEBP';
}

/**
 * Parses image dimensions from binary header without external dependencies
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {{ width: number, height: number }}
 */
export function parseImageDimensions(buffer, mimeType) {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (mimeType === 'image/gif' && buffer.length >= 10) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF markers (Start Of Frame): Baseline (0xC0), Extended (0xC1), Progressive (0xC2), Lossless (0xC3)
        if (
          marker === 0xc0 ||
          marker === 0xc1 ||
          marker === 0xc2 ||
          marker === 0xc3 ||
          marker === 0xc5 ||
          marker === 0xc6 ||
          marker === 0xc7 ||
          marker === 0xc9 ||
          marker === 0xca ||
          marker === 0xcb
        ) {
          if (offset + 8 < buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
        }
        if (offset + 3 >= buffer.length) break;
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }

    if (mimeType === 'image/webp' && buffer.length >= 30) {
      const format = buffer.toString('ascii', 12, 16);
      if (format === 'VP8 ' && buffer.length >= 30) {
        // Simple lossy WebP
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
      if (format === 'VP8L' && buffer.length >= 25) {
        // Lossless WebP
        const b1 = buffer[21];
        const b2 = buffer[22];
        const b3 = buffer[23];
        const b4 = buffer[24];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        return { width, height };
      }
      if (format === 'VP8X' && buffer.length >= 30) {
        // Extended WebP
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
    }
  } catch (err) {
    console.warn('⚠️ [parseImageDimensions Warning]:', err.message);
  }

  // Default fallback if headers are unusually structured
  return { width: 800, height: 600 };
}

import sharp from 'sharp';

/**
 * Decodes and re-encodes raster image buffers to completely strip all metadata
 * (EXIF, XMP, IPTC, ICC profiles, PNG text chunks, GIF comment blocks)
 * and normalizes the pixel stream securely.
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{ sanitizedBuffer: Buffer, mimeType: string, extension: string, width: number, height: number, size: number }>}
 */
export async function sanitizeImageRaster(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('Image buffer is empty or invalid.');
  }

  try {
    const isGif = mimeType === 'image/gif';
    const maxDim = ENV.MAX_IMAGE_DIMENSION || 4096;

    // Configure sharp decoder with failOn truncated and max pixel limit to prevent decompression bombs
    const image = sharp(buffer, {
      failOn: 'truncated',
      limitInputPixels: maxDim * maxDim,
      animated: isGif, // Safely preserve animation frames for GIFs while stripping metadata
    });

    const metadata = await image.metadata();

    if (!metadata || !metadata.width || !metadata.height) {
      throw new ValidationError('Could not decode image metadata or image is corrupted.');
    }

    if (metadata.width > maxDim || metadata.height > maxDim) {
      throw new ValidationError(
        `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed dimension of ${maxDim}x${maxDim} pixels.`
      );
    }

    let sanitizedBuffer;
    let outMime = mimeType;
    let outExt = 'png';

    // Re-encode pixel raster without metadata chunks
    if (mimeType === 'image/jpeg') {
      outMime = 'image/jpeg';
      outExt = 'jpg';
      sanitizedBuffer = await image
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } else if (mimeType === 'image/png') {
      outMime = 'image/png';
      outExt = 'png';
      sanitizedBuffer = await image
        .png({ compressionLevel: 8 })
        .toBuffer();
    } else if (mimeType === 'image/webp') {
      outMime = 'image/webp';
      outExt = 'webp';
      sanitizedBuffer = await image
        .webp({ quality: 90 })
        .toBuffer();
    } else if (mimeType === 'image/gif') {
      outMime = 'image/gif';
      outExt = 'gif';
      sanitizedBuffer = await image
        .gif({ reuse: true })
        .toBuffer();
    } else {
      outMime = 'image/png';
      outExt = 'png';
      sanitizedBuffer = await image
        .png({ compressionLevel: 8 })
        .toBuffer();
    }

    return {
      sanitizedBuffer,
      mimeType: outMime,
      extension: outExt,
      width: metadata.width,
      height: metadata.height,
      size: sanitizedBuffer.length,
    };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(
      'Invalid, corrupted, or unsupported image file. Image could not be safely decoded or processed.'
    );
  }
}

/**
 * Sanitizes image buffer by stripping EXIF APP1 tags from JPEG images (synchronous backward-compatible helper)
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Buffer}
 */
export function sanitizeImageMetadata(buffer, mimeType) {
  if (mimeType !== 'image/jpeg' || buffer.length < 4) {
    return buffer;
  }

  try {
    const chunks = [];
    let offset = 0;

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      chunks.push(buffer.subarray(0, 2));
      offset = 2;
    }

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        chunks.push(buffer.subarray(offset));
        break;
      }

      const marker = buffer[offset + 1];
      if (marker === 0xda) {
        chunks.push(buffer.subarray(offset));
        break;
      }

      if (offset + 3 >= buffer.length) {
        chunks.push(buffer.subarray(offset));
        break;
      }

      const length = buffer.readUInt16BE(offset + 2);
      const nextOffset = offset + 2 + length;

      if (marker === 0xe1) {
        offset = nextOffset;
        continue;
      }

      chunks.push(buffer.subarray(offset, nextOffset));
      offset = nextOffset;
    }

    return Buffer.concat(chunks);
  } catch {
    return buffer;
  }
}

/**
 * Validates uploaded image buffer against strict format, size, signature, and dimension rules
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} declaredMime
 * @returns {{ mimeType: string, extension: string, width: number, height: number, size: number }}
 */
export function validateImageBuffer(buffer, originalName = 'image.png', declaredMime = '') {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('Image file is empty or invalid.');
  }

  // 1. Enforce max file size (5 MB default)
  const maxBytes = (ENV.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new ValidationError(
      `Image size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of ${ENV.MAX_IMAGE_SIZE_MB} MB.`
    );
  }

  // 2. Strict SVG Rejection
  const textPrefix = buffer.subarray(0, 500).toString('utf8').toLowerCase();
  if (
    declaredMime === 'image/svg+xml' ||
    originalName.toLowerCase().endsWith('.svg') ||
    textPrefix.includes('<svg') ||
    textPrefix.includes('<?xml')
  ) {
    throw new ValidationError(
      'SVG images are not supported for security reasons. Please upload a JPEG, PNG, WebP, or GIF image.'
    );
  }

  // 3. Magic Byte Signature Verification
  let detectedMime = null;
  let extension = null;

  if (bufferStartsWith(buffer, SIGNATURES.JPEG)) {
    detectedMime = 'image/jpeg';
    extension = 'jpg';
  } else if (bufferStartsWith(buffer, SIGNATURES.PNG)) {
    detectedMime = 'image/png';
    extension = 'png';
  } else if (isWebP(buffer)) {
    detectedMime = 'image/webp';
    extension = 'webp';
  } else if (bufferStartsWith(buffer, SIGNATURES.GIF87a) || bufferStartsWith(buffer, SIGNATURES.GIF89a)) {
    detectedMime = 'image/gif';
    extension = 'gif';
  } else {
    throw new ValidationError(
      'Unsupported or corrupted image format. Only valid JPEG, PNG, WebP, and GIF images are accepted.'
    );
  }

  // 4. Dimension Bounds Verification
  const dimensions = parseImageDimensions(buffer, detectedMime);
  const maxDim = ENV.MAX_IMAGE_DIMENSION || 4096;

  if (dimensions.width > maxDim || dimensions.height > maxDim) {
    throw new ValidationError(
      `Image dimensions (${dimensions.width}x${dimensions.height}) exceed maximum allowed dimension of ${maxDim}x${maxDim} pixels.`
    );
  }

  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ValidationError('Invalid image dimensions detected.');
  }

  return {
    mimeType: detectedMime,
    extension,
    width: dimensions.width,
    height: dimensions.height,
    size: buffer.length,
  };
}

/**
 * Image Storage & Validation Service
 */
export class ImageValidationService {
  constructor() {
    this.baseStorageDir = path.resolve(process.cwd(), ENV.MEDIA_STORAGE_DIR || 'storage/media', 'images');
  }

  /**
   * Initializes local storage directory
   */
  async init() {
    try {
      await fs.mkdir(this.baseStorageDir, { recursive: true, mode: 0o700 });
    } catch (err) {
      console.error('🔴 [ImageValidationService Init Error]:', err.message);
    }
  }

  /**
   * Returns user-isolated media directory path
   */
  getUserMediaDir(userId) {
    const userFolder = crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 16);
    return path.join(this.baseStorageDir, userFolder);
  }

  /**
   * Validates and saves an uploaded image file securely
   * @param {string} userId Authenticated user ID
   * @param {Buffer} buffer Raw image buffer
   * @param {string} originalName Original filename
   * @param {string} declaredMime Declared MIME type
   * @returns {Promise<{ id: string, name: string, mimeType: string, size: number, width: number, height: number, storageReference: string, createdAt: Date }>}
   */
  async processAndStoreImage(userId, buffer, originalName = 'image.png', declaredMime = '') {
    const startHr = process.hrtime.bigint();

    try {
      if (!userId) {
        throw new UnauthorizedError('User authentication required for image processing.');
      }

      // 1. Multi-layer pre-validation
      const { mimeType } = validateImageBuffer(buffer, originalName, declaredMime);

      // 2. Full raster decode, bounds verification, and re-encoding with complete metadata removal (Sharp)
      const sanitized = await sanitizeImageRaster(buffer, mimeType);

      // 3. User directory preparation
      const userDir = this.getUserMediaDir(userId);
      await fs.mkdir(userDir, { recursive: true, mode: 0o700 });

      // 4. Generate opaque public reference
      const opaqueId = `media_ref_${crypto.randomBytes(16).toString('hex')}`;
      const attachmentId = `att_img_${crypto.randomBytes(8).toString('hex')}`;
      const filePath = path.join(userDir, `${opaqueId}.${sanitized.extension}`);

      // 5. Write file with restricted permissions (0o600)
      await fs.writeFile(filePath, sanitized.sanitizedBuffer, { mode: 0o600 });

      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);

      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      recordMediaOperation({ operation: 'image', outcome: 'success', durationMs });

      return {
        id: attachmentId,
        type: 'image',
        name: safeName || `image.${sanitized.extension}`,
        mimeType: sanitized.mimeType,
        size: sanitized.size,
        width: sanitized.width,
        height: sanitized.height,
        storageReference: opaqueId,
        createdAt: new Date(),
      };
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      const outcome = error instanceof ValidationError ? 'rejected' : 'failed';
      recordMediaOperation({ operation: 'image', outcome, durationMs });
      throw error;
    }
  }

  /**
   * Retrieves image buffer by user and opaque storage reference
   * @param {string} userId
   * @param {string} storageReference
   * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
   */
  async getImageBuffer(userId, storageReference) {
    if (!userId || !storageReference) {
      throw new NotFoundError('Image not found.');
    }

    // Prevent path traversal
    const safeRef = storageReference.replace(/[^a-zA-Z0-9_]/g, '');
    const userDir = this.getUserMediaDir(userId);

    const extensions = ['jpg', 'png', 'webp', 'gif'];
    let targetPath = null;
    let foundExt = null;

    for (const ext of extensions) {
      const candidate = path.join(userDir, `${safeRef}.${ext}`);
      if (fsSync.existsSync(candidate)) {
        targetPath = candidate;
        foundExt = ext;
        break;
      }
    }

    if (!targetPath) {
      throw new NotFoundError('Requested image was not found.');
    }

    const buffer = await fs.readFile(targetPath);
    const mimeMap = {
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };

    return {
      buffer,
      mimeType: mimeMap[foundExt] || 'application/octet-stream',
    };
  }

  /**
   * Deletes an image file by user and storage reference
   * @param {string} userId
   * @param {string} storageReference
   */
  async deleteImage(userId, storageReference) {
    try {
      const safeRef = storageReference.replace(/[^a-zA-Z0-9_]/g, '');
      const userDir = this.getUserMediaDir(userId);
      const extensions = ['jpg', 'png', 'webp', 'gif'];

      for (const ext of extensions) {
        const candidate = path.join(userDir, `${safeRef}.${ext}`);
        if (fsSync.existsSync(candidate)) {
          await fs.unlink(candidate);
        }
      }
    } catch (err) {
      console.warn('⚠️ [deleteImage Warning]:', err.message);
    }
  }
}

export const imageValidationService = new ImageValidationService();
