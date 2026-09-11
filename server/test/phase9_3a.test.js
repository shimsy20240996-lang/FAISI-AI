import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import {
  imageValidationService,
  validateImageBuffer,
  sanitizeImageRaster,
} from '../services/media/imageValidationService.js';
import { ValidationError } from '../utils/errors.js';
import { ENV } from '../config/env.js';

describe('Phase 9.3-A: SEC-VULN-05 Complete Image Raster Sanitization Suite', () => {
  const testUserId = 'test_user_sanitizer_93a';

  before(async () => {
    await imageValidationService.init();
  });

  after(async () => {
    try {
      const userDir = imageValidationService.getUserMediaDir(testUserId);
      await fs.rm(userDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. JPEG Metadata & Non-EXIF Stripping Tests
  // =========================================================================
  describe('1. JPEG Raster Sanitization & Metadata Stripping', () => {
    test('1.1 Decodes and re-encodes JPEG, completely stripping EXIF and XMP metadata', async () => {
      // Create a valid JPEG with embedded EXIF & XMP comment metadata using sharp
      const originalJpg = await sharp({
        create: {
          width: 200,
          height: 150,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              Artist: 'Secret Photographer Name',
              Copyright: 'Top Secret Copyright',
            },
          },
        })
        .toBuffer();

      // Verify the test fixture actually contains the metadata tag
      const rawMeta = await sharp(originalJpg).metadata();
      assert.ok(rawMeta.exif, 'Test fixture must contain EXIF metadata before sanitization');

      // Sanitize raster
      const result = await sanitizeImageRaster(originalJpg, 'image/jpeg');
      assert.equal(result.mimeType, 'image/jpeg');
      assert.equal(result.extension, 'jpg');
      assert.equal(result.width, 200);
      assert.equal(result.height, 150);

      // Verify sanitized image has ZERO metadata
      const sanitizedMeta = await sharp(result.sanitizedBuffer).metadata();
      assert.equal(sanitizedMeta.exif, undefined, 'Sanitized JPEG must NOT have EXIF');
      assert.equal(sanitizedMeta.icc, undefined, 'Sanitized JPEG must NOT have ICC profile');
      assert.equal(sanitizedMeta.xmp, undefined, 'Sanitized JPEG must NOT have XMP');

      // Verify raw byte string doesn't contain injected strings
      const rawText = result.sanitizedBuffer.toString('latin1');
      assert.ok(!rawText.includes('Secret Photographer'), 'Raw text must not contain EXIF string');
    });

    test('1.2 JPEG with non-EXIF metadata (COM comments & APP segments) is completely sanitized', async () => {
      // Manually construct JPEG with COM (Comment) segment (0xFF, 0xFE)
      const baseJpg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).jpeg().toBuffer();

      const commentStr = 'Sensitive Internal Server Build Info #12345';
      const commentLen = commentStr.length + 2;
      const comMarker = Buffer.alloc(4 + commentStr.length);
      comMarker[0] = 0xff;
      comMarker[1] = 0xfe; // COM marker
      comMarker.writeUInt16BE(commentLen, 2);
      comMarker.write(commentStr, 4, 'ascii');

      // Inject COM marker right after SOI (0xFF, 0xD8)
      const jpgWithCom = Buffer.concat([baseJpg.subarray(0, 2), comMarker, baseJpg.subarray(2)]);
      assert.ok(jpgWithCom.toString('latin1').includes(commentStr));

      const result = await sanitizeImageRaster(jpgWithCom, 'image/jpeg');
      assert.ok(!result.sanitizedBuffer.toString('latin1').includes(commentStr), 'Sanitized JPEG must NOT contain COM comment');
    });
  });

  // =========================================================================
  // 2. PNG Metadata (tEXt / zTXt / iTXt) Stripping Tests
  // =========================================================================
  describe('2. PNG Raster Sanitization & Metadata Stripping', () => {
    test('2.1 Decodes and re-encodes PNG, completely stripping tEXt chunks and metadata', async () => {
      const basePng = await sharp({
        create: { width: 150, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
      })
        .png()
        .withMetadata({
          exif: {
            IFD0: {
              Software: 'Internal Proprietary Tool v9',
            },
          },
        })
        .toBuffer();

      // Manually inject a tEXt chunk: Length (4) + 'tEXt' (4) + Key=Value + CRC (4)
      const textData = Buffer.from('Author\x00Confidential Internal Author');
      const textChunk = Buffer.alloc(8 + textData.length + 4);
      textChunk.writeUInt32BE(textData.length, 0);
      textChunk.write('tEXt', 4);
      textData.copy(textChunk, 8);
      textChunk.writeUInt32BE(0x12345678, 8 + textData.length); // mock CRC

      // Insert before IEND
      const iendOffset = basePng.lastIndexOf('IEND') - 4;
      const pngWithText = Buffer.concat([
        basePng.subarray(0, iendOffset),
        textChunk,
        basePng.subarray(iendOffset),
      ]);

      assert.ok(pngWithText.toString('latin1').includes('Confidential Internal Author'));

      const result = await sanitizeImageRaster(pngWithText, 'image/png');
      assert.equal(result.mimeType, 'image/png');
      assert.equal(result.extension, 'png');

      const sanitizedMeta = await sharp(result.sanitizedBuffer).metadata();
      assert.equal(sanitizedMeta.exif, undefined);
      assert.ok(!result.sanitizedBuffer.toString('latin1').includes('Confidential Internal Author'));
    });
  });

  // =========================================================================
  // 3. WebP & GIF Metadata Stripping Tests
  // =========================================================================
  describe('3. WebP & GIF Raster Sanitization', () => {
    test('3.1 Decodes and re-encodes WebP, stripping EXIF & XMP chunks', async () => {
      const webpWithMeta = await sharp({
        create: { width: 120, height: 80, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .webp()
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'SecretCameraBrand',
            },
          },
        })
        .toBuffer();

      const result = await sanitizeImageRaster(webpWithMeta, 'image/webp');
      assert.equal(result.mimeType, 'image/webp');
      assert.equal(result.extension, 'webp');

      const sanitizedMeta = await sharp(result.sanitizedBuffer).metadata();
      assert.equal(sanitizedMeta.exif, undefined);
      assert.ok(!result.sanitizedBuffer.toString('latin1').includes('SecretCameraBrand'));
    });

    test('3.2 Decodes and re-encodes GIF, stripping comment extension blocks', async () => {
      const baseGif = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } },
      })
        .gif()
        .toBuffer();

      // Inject GIF Comment Extension Block (0x21, 0xFE, length, text, 0x00)
      const commentStr = 'Confidential GIF Author Comment';
      const comBlock = Buffer.alloc(3 + commentStr.length + 1);
      comBlock[0] = 0x21; // Extension introducer
      comBlock[1] = 0xfe; // Comment label
      comBlock[2] = commentStr.length;
      comBlock.write(commentStr, 3, 'ascii');
      comBlock[3 + commentStr.length] = 0x00; // Block terminator

      // Insert before trailer (0x3B)
      const trailerIdx = baseGif.lastIndexOf(0x3b);
      const gifWithComment = Buffer.concat([
        baseGif.subarray(0, trailerIdx),
        comBlock,
        baseGif.subarray(trailerIdx),
      ]);

      assert.ok(gifWithComment.toString('latin1').includes('Confidential GIF Author Comment'));

      const result = await sanitizeImageRaster(gifWithComment, 'image/gif');
      assert.equal(result.mimeType, 'image/gif');
      assert.equal(result.extension, 'gif');
      assert.ok(!result.sanitizedBuffer.toString('latin1').includes('Confidential GIF Author Comment'));
    });
  });

  // =========================================================================
  // 4. Malformed, Corrupted, Truncated & Adversarial Rejections
  // =========================================================================
  describe('4. Malformed & Adversarial Image Rejections', () => {
    test('4.1 Corrupted / malformed image stream throws ValidationError safely', async () => {
      // Valid PNG header but corrupted pixel stream data
      const corruptedPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('Corrupted non-image garbage random binary payload 0123456789'),
      ]);

      await assert.rejects(
        async () => {
          await sanitizeImageRaster(corruptedPng, 'image/png');
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(!err.message.includes('C:\\'), 'Must not leak filesystem paths');
          assert.ok(!err.message.includes('node_modules'), 'Must not leak stack paths');
          return true;
        }
      );
    });

    test('4.2 Truncated JPEG stream is rejected by Sharp failOn: truncated', async () => {
      const baseJpg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 0 } },
      }).jpeg().toBuffer();

      // Truncate halfway through compressed scan data
      const truncatedJpg = baseJpg.subarray(0, Math.floor(baseJpg.length / 2));

      await assert.rejects(
        async () => {
          await sanitizeImageRaster(truncatedJpg, 'image/jpeg');
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          return true;
        }
      );
    });

    test('4.3 SVG files are strictly rejected before raster processing', () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>');
      assert.throws(
        () => validateImageBuffer(svgBuffer, 'vector.svg', 'image/svg+xml'),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('SVG images are not supported'));
          return true;
        }
      );
    });

    test('4.4 Oversized image buffer (>5 MB) is rejected', () => {
      const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
      hugeBuffer[0] = 0x89;
      hugeBuffer[1] = 0x50;
      hugeBuffer[2] = 0x4e;
      hugeBuffer[3] = 0x47;

      assert.throws(
        () => validateImageBuffer(hugeBuffer, 'huge.png', 'image/png'),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('exceeds maximum allowed limit'));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 5. End-to-End Image Storage & Retrieval Integration
  // =========================================================================
  describe('5. End-to-End Storage Integration', () => {
    test('5.1 processAndStoreImage sanitizes, stores, and retrieves clean image buffer', async () => {
      const rawJpg = await sharp({
        create: { width: 250, height: 180, channels: 3, background: { r: 10, g: 150, b: 220 } },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              CameraOwnerName: 'Alice Test Suite Owner',
            },
          },
        })
        .toBuffer();

      const attachment = await imageValidationService.processAndStoreImage(
        testUserId,
        rawJpg,
        'photo.jpg',
        'image/jpeg'
      );

      assert.ok(attachment.id.startsWith('att_img_'));
      assert.ok(attachment.storageReference.startsWith('media_ref_'));
      assert.equal(attachment.mimeType, 'image/jpeg');
      assert.equal(attachment.width, 250);
      assert.equal(attachment.height, 180);

      // Retrieve stored image from disk
      const stored = await imageValidationService.getImageBuffer(testUserId, attachment.storageReference);
      assert.equal(stored.mimeType, 'image/jpeg');
      assert.ok(stored.buffer.length > 0);

      // Verify stored file on disk has NO metadata
      const storedMeta = await sharp(stored.buffer).metadata();
      assert.equal(storedMeta.exif, undefined);
      assert.ok(!stored.buffer.toString('latin1').includes('Alice Test Suite Owner'));
    });
  });
});
