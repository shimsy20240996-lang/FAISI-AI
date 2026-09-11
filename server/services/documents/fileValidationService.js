import crypto from 'crypto';
import path from 'path';
import AdmZip from 'adm-zip';
import { ENV } from '../../config/env.js';

// Supported extensions
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'csv'];

// Supported MIME types
export const ALLOWED_MIME_TYPES = {
  pdf: ['application/pdf', 'application/x-pdf'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/docx',
    'application/zip',
    'application/x-zip-compressed',
  ],
  txt: ['text/plain', 'text/plain; charset=utf-8', 'application/octet-stream'],
  csv: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'text/x-csv', 'application/octet-stream'],
};

// Magic bytes signatures
const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
  docx: Buffer.from([0x50, 0x4b, 0x03, 0x04]),       // PK\x03\x04
};

/**
 * Sanitizes original filename to prevent path traversal or filesystem issues
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'document_' + Date.now();
  }

  // Extract base filename without path
  const basename = path.basename(filename);
  
  // Remove control characters, null bytes, and unsafe characters
  const clean = basename
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return clean.slice(0, 255) || 'document_' + Date.now();
}

/**
 * Validates text buffer for binary masquerading (null bytes or excessive control characters)
 */
export function validateTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Expected buffer for text validation');
  }

  if (buffer.length === 0) {
    return true; // Empty file is valid text
  }

  // Check sample (first 8KB or entire buffer)
  const sampleSize = Math.min(buffer.length, 8192);
  let controlChars = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];

    // Explicitly reject null bytes
    if (byte === 0x00) {
      throw new Error('Invalid text file: binary null byte detected');
    }

    // Allow standard whitespace: \t (0x09), \n (0x0a), \r (0x0d)
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }

    // Disallow control characters 0x01-0x08, 0x0b-0x0c, 0x0e-0x1f
    if ((byte >= 0x01 && byte <= 0x08) || byte === 0x0b || byte === 0x0c || (byte >= 0x0e && byte <= 0x1f)) {
      controlChars++;
    }
  }

  // If more than 1% of the sample contains control characters, reject as binary
  if (controlChars / sampleSize > 0.01) {
    throw new Error('Invalid text file: high density of binary control characters detected');
  }

  // Verify UTF-8 decoding validity
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(buffer.subarray(0, sampleSize));
  } catch (err) {
    throw new Error('Invalid text file: content is not valid UTF-8 encoded text');
  }

  return true;
}

/**
 * Inspects DOCX archive to ensure it is a valid, bounded Office Open XML package
 * and protects against ZIP bomb / decompression resource exhaustion.
 */
export function validateDocxArchive(buffer) {
  const MAX_ZIP_ENTRIES = 500;
  const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
  const MAX_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024; // 20 MB

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    if (!entries || entries.length === 0) {
      throw new Error('DOCX package contains no entries');
    }

    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`DOCX package exceeds maximum allowed entries limit (${entries.length}/${MAX_ZIP_ENTRIES})`);
    }

    let totalUncompressedSize = 0;

    for (const entry of entries) {
      const entrySize = entry.header?.size || 0;
      const compressedSize = entry.header?.compressedSize || 1;

      if (entrySize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`DOCX archive entry "${entry.entryName}" exceeds maximum size limit (20 MB)`);
      }

      totalUncompressedSize += entrySize;

      if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(`DOCX package total uncompressed size exceeds maximum safety limit (50 MB)`);
      }

      // Check for suspicious decompression ratio (potential zip bomb)
      if (entrySize > 5 * 1024 * 1024 && entrySize / Math.max(compressedSize, 1) > 50) {
        throw new Error(`DOCX package entry "${entry.entryName}" has an anomalous compression ratio (potential zip bomb)`);
      }

      // Check for path traversal in entry names
      if (entry.entryName.includes('..') || entry.entryName.startsWith('/') || entry.entryName.startsWith('\\')) {
        throw new Error(`DOCX package contains an unsafe archive entry name: "${entry.entryName}"`);
      }
    }

    const entryNames = entries.map((e) => e.entryName.toLowerCase());

    // DOCX packages must have [Content_Types].xml
    const hasContentTypes = entryNames.some(
      (name) => name === '[content_types].xml' || name.endsWith('/[content_types].xml')
    );

    if (!hasContentTypes) {
      throw new Error('Invalid DOCX format: missing [Content_Types].xml package descriptor');
    }

    // DOCX packages must have Word document structure (word/document.xml or word/)
    const hasWordStructure = entryNames.some(
      (name) => name.startsWith('word/') || name.includes('/word/')
    );

    if (!hasWordStructure) {
      throw new Error('Invalid DOCX format: missing Word document structure');
    }

    return true;
  } catch (err) {
    throw new Error(`DOCX structure validation failed: ${err.message}`);
  }
}

/**
 * Comprehensive multi-layer file validation
 * @param {Object} file Multer file object
 * @param {string} userId Owner user ID
 */
export function validateUploadedFile(file, userId) {
  if (!file || !file.buffer) {
    throw new Error('No file data provided');
  }

  const { originalname, mimetype, size, buffer } = file;

  // 1. File Size Validation
  const maxBytes = ENV.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (size > maxBytes || buffer.length > maxBytes) {
    throw new Error(`File size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of ${ENV.MAX_FILE_SIZE_MB} MB`);
  }

  if (size === 0 || buffer.length === 0) {
    throw new Error('File is empty (0 bytes)');
  }

  // 2. Extension Extraction & Whitelist Validation
  const safeName = sanitizeFilename(originalname);
  const extMatch = safeName.match(/\.([0-9a-z]+)$/i);
  const extension = extMatch ? extMatch[1].toLowerCase() : '';

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(
      `Unsupported file format ".${extension || 'unknown'}". Allowed formats: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
    );
  }

  // 3. Magic Bytes & Structural Verification
  if (extension === 'pdf') {
    if (buffer.length < 5 || !buffer.subarray(0, 5).equals(MAGIC_BYTES.pdf)) {
      throw new Error('Invalid PDF file: magic byte signature (%PDF-) mismatch');
    }
  } else if (extension === 'docx') {
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(MAGIC_BYTES.docx)) {
      throw new Error('Invalid DOCX file: magic byte signature (PK\\x03\\x04) mismatch');
    }
    // Inspect ZIP package structure
    validateDocxArchive(buffer);
  } else if (extension === 'txt' || extension === 'csv') {
    validateTextBuffer(buffer);
  }

  // 4. SHA-256 Checksum Calculation
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // 5. Unique Storage Key
  const fileUuid = crypto.randomUUID();
  const storageKey = `${userId}/${fileUuid}.${extension}`;

  return {
    originalName: originalname,
    safeName,
    extension,
    mimeType: mimetype || 'application/octet-stream',
    size: buffer.length,
    sha256,
    storageKey,
    fileUuid,
  };
}
