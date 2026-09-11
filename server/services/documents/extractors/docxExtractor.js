import mammoth from 'mammoth';
import { ENV } from '../../../config/env.js';

/**
 * Extracts plain text from a DOCX buffer using mammoth
 * with defensive error handling and strict character limits.
 * @param {Buffer} buffer
 * @returns {Promise<{ extractedText: string, length: number, isTruncated: boolean, warnings: string[] }>}
 */
export async function extractDocxText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided to DOCX extractor');
  }

  let rawText = '';
  const warnings = [];

  try {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value || '';
    if (result.messages && result.messages.length > 0) {
      result.messages.forEach((msg) => {
        if (msg.type === 'warning') {
          warnings.push(msg.message);
        }
      });
    }
  } catch (err) {
    throw new Error(`DOCX text extraction failed: ${err.message || 'Corrupt DOCX archive'}`);
  }

  // Normalize extracted text
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const maxChars = ENV.MAX_EXTRACTED_TEXT_CHARS;
  const isTruncated = normalized.length > maxChars;
  const finalText = isTruncated
    ? normalized.slice(0, maxChars) + '\n\n[... Document truncated at maximum extraction limit ...]'
    : normalized;

  return {
    extractedText: finalText,
    length: finalText.length,
    isTruncated,
    warnings,
  };
}
