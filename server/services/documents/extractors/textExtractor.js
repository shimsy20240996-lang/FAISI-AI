import { ENV } from '../../../config/env.js';

/**
 * Extracts normalized plain text from a TXT buffer
 * @param {Buffer} buffer
 * @returns {Promise<{ extractedText: string, length: number, isTruncated: boolean }>}
 */
export async function extractPlainText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided to text extractor');
  }

  let text = '';
  try {
    text = buffer.toString('utf-8');
  } catch (err) {
    throw new Error(`Text decoding failed: ${err.message}`);
  }

  // Normalize line breaks
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  const maxChars = ENV.MAX_EXTRACTED_TEXT_CHARS;
  const isTruncated = normalized.length > maxChars;
  const finalText = isTruncated
    ? normalized.slice(0, maxChars) + '\n\n[... Text file truncated at maximum extraction limit ...]'
    : normalized;

  return {
    extractedText: finalText,
    length: finalText.length,
    isTruncated,
  };
}
