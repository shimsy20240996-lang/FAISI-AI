import { PDFParse } from 'pdf-parse';
import { ENV } from '../../../config/env.js';

/**
 * Extracts plain text from a PDF buffer using pdf-parse v2 API
 * with defensive error handling and strict character limits.
 * @param {Buffer} buffer
 * @returns {Promise<{ extractedText: string, length: number, isTruncated: boolean, pageCount: number }>}
 */
export async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided to PDF extractor');
  }

  let parser = null;
  let rawText = '';
  let pageCount = 0;

  try {
    // pdf-parse v2 modern class API
    if (typeof PDFParse === 'function') {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      
      if (typeof result === 'string') {
        rawText = result;
      } else if (result && typeof result.text === 'string') {
        rawText = result.text;
        pageCount = result.total || result.pages?.length || 0;
      }
    } else {
      throw new Error('PDFParse constructor is unavailable in current pdf-parse module');
    }
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${err.message || 'Malformed PDF structure'}`);
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
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
    pageCount,
  };
}
